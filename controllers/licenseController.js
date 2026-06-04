import License from "../models/license.js"
import LicenseHistory from "../models/licenseHistory.js"
import crypto from "crypto"
import fs from "fs"
import jwt from "jsonwebtoken"
import Product from "../models/product.js"
import Customer from "../models/customer.js"
import pool from "../config/db.js"

const LICENSE_ALGORITHM = "RS256"
const LICENSE_VERSION = 1
const LICENSE_PRIVATE_KEY_PATH = new URL("../private_key.pem", import.meta.url)

let cachedLicensePrivateKey = null

const getLicensePrivateKey = () => {
  if (!cachedLicensePrivateKey) {
    cachedLicensePrivateKey = fs.readFileSync(LICENSE_PRIVATE_KEY_PATH, "utf8")
  }

  return cachedLicensePrivateKey
}

const getStringValue = (value) => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

const toLicenseIsoString = (value, { endOfDateOnly = false } = {}) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${endOfDateOnly ? "23:59:59" : "00:00:00"}.000Z`
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid license date")
  }

  return date.toISOString()
}

const getCustomerName = ({ customerName, customer }) => {
  return (
    getStringValue(customerName) ||
    getStringValue(customer?.username) ||
    getStringValue(customer?.email) ||
    "Local Customer"
  )
}

const getClusterName = ({ clusterName, product }) => {
  return (
    getStringValue(clusterName) ||
    getStringValue(product?.product_namespace) ||
    getStringValue(product?.slug) ||
    getStringValue(product?.name) ||
    "local-cluster"
  )
}

const getLicenseId = ({ licenseId, id, clusterName, product }) => {
  return (
    getStringValue(licenseId) ||
    `${clusterName}-${getStringValue(product?.tenant_id) || id}`
  )
}

const normalizeFeatures = (features) => {
  if (!Array.isArray(features)) {
    return []
  }

  return features
    .map((feature) => getStringValue(feature))
    .filter(Boolean)
}

const generateLicenseKey = ({
  id,
  expirationAt,
  product,
  customer,
  customerName,
  issuedAt = new Date(),
  licenseId,
  clusterName,
  features,
}) => {
  const normalizedClusterName = getClusterName({ clusterName, product })
  const payload = {
    version: LICENSE_VERSION,
    licenseId: getLicenseId({
      licenseId,
      id,
      clusterName: normalizedClusterName,
      product,
    }),
    customer: getCustomerName({ customerName, customer }),
    clusterName: normalizedClusterName,
    issuedAt: toLicenseIsoString(issuedAt),
    expirationDate: toLicenseIsoString(expirationAt, { endOfDateOnly: true }),
    features: normalizeFeatures(features),
  }

  return jwt.sign(payload, getLicensePrivateKey(), {
    algorithm: LICENSE_ALGORITHM,
    noTimestamp: true,
  })
}

const generatePendingLicenseKey = () => `PENDING-${crypto.randomUUID()}`

const buildCheckoutNote = ({ plan_name, duration_label, purchase_summary, amount, currency }) => {
  const parts = []

  if (plan_name) {
    parts.push(`Plan: ${plan_name}`)
  }

  if (duration_label) {
    parts.push(`Duration: ${duration_label}`)
  }

  if (amount) {
    parts.push(`Amount: ${amount} ${currency || "USD"}`)
  }

  if (purchase_summary) {
    parts.push(`Summary: ${purchase_summary}`)
  }

  return parts.join(" | ") || "Portal checkout"
}


export const createLicense = async (req, res) => {
  try {
    const {
      status,
      customer_id,
      product_id,
      expiration_at,
      licenseId,
      license_id,
      clusterName,
      cluster_name,
      customer: customerPayloadName,
      customerName,
      customer_name,
      issuedAt,
      issued_at,
      features,
    } = req.body

    if (!customer_id || !product_id || !expiration_at) {
      return res.status(400).json({
        error: "Validation error",
        message: "product ID, and expiration date are required",
      })
    }

    // Fetch product from product_id
    const product = await Product.findById(product_id)
    if (!product) {
      return res.status(404).json({
        error: "Not found",
        message: "Product not found",
      })
    }
    const customer = await Customer.findById(customer_id)
    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      })
    }

    // Create DB record first to get license ID
    const initialLicense = await License.create({
      license_key: generatePendingLicenseKey(),
      status: status || "trial",
      product_id,
      customer_id,
      expiration_at,
    })

    // Generate secure license key
    const license_key = generateLicenseKey({
      id: initialLicense.id,
      expirationAt: expiration_at,
      product,
      customer,
      customerName: customerName || customer_name || customerPayloadName,
      licenseId: licenseId || license_id,
      clusterName: clusterName || cluster_name,
      issuedAt: issuedAt || issued_at,
      features,
    })
    const license = await License.updateLicenseKey(initialLicense.id, license_key)

    // Track creation history
    await LicenseHistory.create({
      license_id: license.id,
      action: "License Created",
      new_status: license.status,
      note: "Initial creation",
    })

    res.status(201).json({
      message: "License created successfully",
      license: {
        ...license,
        product, // include the full product object
      },
    })
  } catch (error) {
    console.error("License creation error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to create license",
    })
  }
}

export const checkoutLicense = async (req, res) => {
  const client = await pool.connect()
  let transactionStarted = false

  try {
    const {
      product_id,
      expiration_at,
      amount,
      currency = "USD",
      method = "card",
      payment_status = "paid",
      license_status = "valid",
      plan_name,
      duration_label,
      purchase_summary,
      licenseId,
      license_id,
      clusterName,
      cluster_name,
      customer: customerPayloadName,
      customerName,
      customer_name,
      issuedAt,
      issued_at,
      features,
    } = req.body

    if (!req.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authenticated customer is required",
      })
    }

    if (!product_id || !expiration_at || !amount) {
      return res.status(400).json({
        error: "Validation error",
        message: "Product, expiration date and amount are required",
      })
    }

    const numericAmount = Number(amount)

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Validation error",
        message: "Amount must be a positive number",
      })
    }

    const expirationDate = new Date(expiration_at)

    if (Number.isNaN(expirationDate.getTime())) {
      return res.status(400).json({
        error: "Validation error",
        message: "Expiration date must be valid",
      })
    }

    const product = await Product.findById(product_id)
    if (!product) {
      return res.status(404).json({
        error: "Not found",
        message: "Product not found",
      })
    }

    const customer = await Customer.findById(req.userId)
    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      })
    }

    await client.query("BEGIN")
    transactionStarted = true

    const licenseResult = await client.query(
      `
        INSERT INTO licenses (license_key, status, customer_id, product_id, expiration_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [generatePendingLicenseKey(), license_status, customer.id, product.id, expiration_at],
    )
    let license = licenseResult.rows[0]

    const license_key = generateLicenseKey({
      id: license.id,
      expirationAt: expiration_at,
      product,
      customer,
      customerName: customerName || customer_name || customerPayloadName,
      licenseId: licenseId || license_id,
      clusterName: clusterName || cluster_name,
      issuedAt: issuedAt || issued_at,
      features,
    })
    const updatedLicenseResult = await client.query(
      `
        UPDATE licenses
        SET license_key = $1
        WHERE id = $2
        RETURNING *
      `,
      [license_key, license.id],
    )
    license = updatedLicenseResult.rows[0]

    await client.query(
      `
        INSERT INTO license_transaction_history (license_id, action, new_status, note)
        VALUES ($1, $2, $3, $4)
      `,
      [
        license.id,
        "License Purchased",
        license.status,
        buildCheckoutNote({ plan_name, duration_label, purchase_summary, amount: numericAmount.toFixed(2), currency }),
      ],
    )

    const paymentResult = await client.query(
      `
        INSERT INTO payments (customer_id, license_id, amount, currency, method, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [customer.id, license.id, numericAmount.toFixed(2), currency, method, payment_status],
    )
    const payment = paymentResult.rows[0]

    await client.query("COMMIT")

    res.status(201).json({
      message: "License purchased successfully",
      license: {
        ...license,
        product,
        customer,
      },
      payment,
    })
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK")
    }
    console.error("License checkout error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to complete license checkout",
    })
  } finally {
    client.release()
  }
}


export const getLicense = async (req, res) => {
  try {
    const { id } = req.params
    const license = await License.findById(id)

    if (!license) {
      return res.status(404).json({
        error: "Not found",
        message: "License not found",
      })
    }

    res.json(license)
  } catch (error) {
    console.error("Get license error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch license",
    })
  }
}

export const getCustomerLicenses = async (req, res) => {
  try {
    const { customerId } = req.params
    const licenses = await License.findByCustomer(customerId)

    res.json(licenses)
  } catch (error) {
    console.error("Fetch customer licenses error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch licenses",
    })
  }
}

export const getAllLicenses = async (req, res) => {
  try {
    const licenses = await License.findAllWithRelations()
    res.json(licenses)
  } catch (error) {
    console.error("Fetch all licenses error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch licenses",
    })
  }
}
