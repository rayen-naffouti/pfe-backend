import crypto from "crypto"
import pool from "../config/db.js"
import AccountActivationToken from "../models/accountActivationToken.js"
import Customer from "../models/customer.js"
import {
  getEmailRuntimeConfig,
  renderAccountActivationEmailHtml,
  sendEmail,
} from "./emailService.js"

const DEFAULT_TOKEN_TTL_HOURS = 24
const DEFAULT_COOLDOWN_SECONDS = 60

const clampNumber = (value, fallback, min, max) => {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(Math.max(Math.round(number), min), max)
}

const getTokenTtlHours = () => {
  return clampNumber(process.env.ACCOUNT_ACTIVATION_TOKEN_TTL_HOURS, DEFAULT_TOKEN_TTL_HOURS, 1, 168)
}

const getCooldownSeconds = () => {
  return clampNumber(
    process.env.ACCOUNT_ACTIVATION_REQUEST_COOLDOWN_SECONDS,
    DEFAULT_COOLDOWN_SECONDS,
    30,
    3600,
  )
}

const normalizeEmail = (email) => String(email || "").trim().toLowerCase()

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex")
}

const isTokenShapeValid = (token) => {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
}

const allowsInsecureCallbackUrls = () => {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_INSECURE_CALLBACK_URLS || "").trim().toLowerCase(),
  )
}

const buildActivationUrl = (rawToken) => {
  const emailConfig = getEmailRuntimeConfig()
  const configuredUrl = process.env.ACCOUNT_ACTIVATION_URL?.trim()
  const url = new URL(configuredUrl || `${emailConfig.baseUrl.replace(/\/$/, "")}/activate-account`)

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !allowsInsecureCallbackUrls()) {
    throw new Error("ACCOUNT_ACTIVATION_URL must use HTTPS in production")
  }

  url.searchParams.set("token", rawToken)
  return url.toString()
}

export class AccountActivationError extends Error {
  constructor(message, code = "ACCOUNT_ACTIVATION_ERROR") {
    super(message)
    this.name = "AccountActivationError"
    this.code = code
  }
}

export const requestAccountActivation = async ({ customer, requestedIp, force = false }) => {
  if (!customer || customer.is_active) {
    return { accepted: true, emailDelivery: null, skipped: true }
  }

  await Customer.ensureSecurityColumns()
  await AccountActivationToken.ensureTable()

  const cooldownSeconds = getCooldownSeconds()
  const recentlyRequested = await AccountActivationToken.hasRecentRequest(customer.id, cooldownSeconds)

  if (recentlyRequested && !force) {
    return { accepted: true, emailDelivery: null, cooldown: true }
  }

  const rawToken = crypto.randomBytes(32).toString("base64url")
  const tokenHash = hashToken(rawToken)
  const ttlHours = getTokenTtlHours()
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60_000)
  const activationToken = await AccountActivationToken.create({
    customerId: customer.id,
    tokenHash,
    expiresAt,
    requestedIp,
  })
  const emailConfig = getEmailRuntimeConfig()
  const activationUrl = buildActivationUrl(rawToken)
  const subject = `Activate your ${emailConfig.appName} account`
  const html = renderAccountActivationEmailHtml({
    appName: emailConfig.appName,
    customerName: customer.username || customer.email,
    activationUrl,
    expiresInHours: ttlHours,
  })

  let emailDelivery

  try {
    emailDelivery = await sendEmail({
      to: customer.email,
      subject,
      html,
    })
  } catch (error) {
    emailDelivery = {
      status: "failed",
      message: error.message,
    }
  }

  await AccountActivationToken.markEmailResult(activationToken.id, {
    status: emailDelivery.status,
    error: emailDelivery.status === "sent" ? null : emailDelivery.message,
  })
  await Customer.markActivationEmailSent(customer.id)

  AccountActivationToken.deleteExpired().catch((error) => {
    console.error("Account activation token cleanup error:", error.message)
  })

  return { accepted: true, emailDelivery }
}

export const requestAccountActivationByEmail = async ({ email, requestedIp }) => {
  const customer = await Customer.findByEmail(normalizeEmail(email))

  if (!customer || customer.is_active) {
    return { accepted: true, emailDelivery: null }
  }

  return requestAccountActivation({ customer, requestedIp })
}

export const validateAccountActivationToken = async (rawToken) => {
  if (!isTokenShapeValid(rawToken)) {
    return false
  }

  const activationToken = await AccountActivationToken.findActiveByHash(hashToken(rawToken))

  return Boolean(activationToken)
}

export const activateAccount = async ({ rawToken }) => {
  if (!isTokenShapeValid(rawToken)) {
    throw new AccountActivationError("This activation link is invalid or has expired", "INVALID_TOKEN")
  }

  await Customer.ensureSecurityColumns()
  await AccountActivationToken.ensureTable()

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const activationToken = await AccountActivationToken.findActiveByHash(hashToken(rawToken), { client })

    if (!activationToken) {
      throw new AccountActivationError("This activation link is invalid or has expired", "INVALID_TOKEN")
    }

    const customer = activationToken.is_active
      ? {
          id: activationToken.customer_id,
          username: activationToken.username,
          email: activationToken.email,
          is_active: true,
        }
      : await Customer.activate(activationToken.customer_id, { client })

    await AccountActivationToken.markUsed(activationToken.id, { client })
    await AccountActivationToken.invalidateForCustomer(activationToken.customer_id, { client })
    await client.query("COMMIT")

    return customer
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
