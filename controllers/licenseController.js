import License from "../models/license.js"
import LicenseHistory from "../models/licenseHistory.js"
import crypto from "crypto";
import Product from "../models/product.js";
import Customer from "../models/customer.js";

const LICENSE_SECRET = process.env.LICENSE_SECRET;

const generateLicenseKey = ({
  expirationAt,
  product,
  customer
}) => {
  const payload = {
    exp: Math.floor(new Date(expirationAt).getTime() / 1000),
    product,
    customer
  };


  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString("base64url");
  const signature = crypto
    .createHmac("sha256", LICENSE_SECRET)
    .update(payloadBase64)
    .digest("hex");

  return `LIC-${payloadBase64}.${signature}`;
};


export const createLicense = async (req, res) => {
  try {
    const { status, customer_id, product_id, expiration_at } = req.body;

    if (!customer_id || !product_id || !expiration_at) {
      return res.status(400).json({
        error: "Validation error",
        message: "product ID, and expiration date are required",
      });
    }

    // Fetch product from product_id
    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({
        error: "Not found",
        message: "Product not found",
      });
    }
    const customer = await Customer.findById(customer_id);
    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      });
    }

    const license_key = generateLicenseKey({
      expirationAt: expiration_at,
      product: product,
      customer: customer
    });
    // Create DB record first to get license ID
    const license = await License.create({
      license_key: license_key,
      status: status || "trial",
      product_id,
      customer_id,
      expiration_at,
    });

    // Generate secure license key


    // Track creation history
    await LicenseHistory.create({
      license_id: license.id,
      action: "License Created",
      new_status: license.status,
      note: "Initial creation",
    });

    res.status(201).json({
      message: "License created successfully",
      license: {
        ...license,
        product, // include the full product object
      },
    });
  } catch (error) {
    console.error("License creation error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to create license",
    });
  }
};


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