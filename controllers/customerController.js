import Customer from "../models/customer.js"
import jwt from "jsonwebtoken"
import { requestAccountActivation } from "../services/accountActivationService.js"


const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"

const normalizeRole = (role) => {
  return role === "admin" ? "admin" : "user"
}

const sanitizeCustomer = (customer) => {
  if (!customer) {
    return customer
  }

  const { password, ...safeCustomer } = customer
  return {
    ...safeCustomer,
    role: normalizeRole(customer.role),
  }
}

const generateToken = (customer) => {
  return jwt.sign(
    {
      userId: customer.id,
      role: normalizeRole(customer.role),
      accountType: "customer",
      authVersion: Number(customer.auth_version || 0),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
}

// Register a new customer
export const registerCustomer = async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim()
    const email = String(req.body?.email || "").trim().toLowerCase()
    const password = req.body?.password

    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Validation error",
        message: "Username, email and password are required",
      })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Validation error",
        message: "Invalid email format",
      })
    }

    const existingEmail = await Customer.findByEmail(email)
    if (existingEmail) {
      if (!existingEmail.is_active) {
        const activationResult = await requestAccountActivation({
          customer: existingEmail,
          requestedIp: req.ip,
        })

        if (activationResult.emailDelivery && activationResult.emailDelivery.status !== "sent") {
          console.error("Account activation email delivery error:", activationResult.emailDelivery.message)
        }

        return res.status(202).json({
          message: "This account already exists but is not active. Check your email for the activation link",
          emailStatus: activationResult.emailDelivery?.status || "cooldown",
        })
      }

      return res.status(409).json({
        error: "Duplicate entry",
        message: "A customer with this email already exists",
      })
    }

    const existingUsername = await Customer.findByUsername(username)
    if (existingUsername) {
      return res.status(409).json({
        error: "Duplicate entry",
        message: "A customer with this username already exists",
      })
    }

    const customer = sanitizeCustomer(await Customer.create({
      username,
      email,
      password,
      role: "user",
      isActive: false,
    }))
    const activationResult = await requestAccountActivation({
      customer,
      requestedIp: req.ip,
      force: true,
    })

    if (activationResult.emailDelivery && activationResult.emailDelivery.status !== "sent") {
      console.error("Account activation email delivery error:", activationResult.emailDelivery.message)
    }

    res.status(201).json({
      message: "Account created. Check your email to activate your account before signing in",
      customer,
      emailStatus: activationResult.emailDelivery?.status || "pending",
    })
  } catch (error) {
    console.error("Customer register error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Registration failed",
    })
  }
}

// Login customer
export const loginCustomer = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        error: "Validation error",
        message: "Email and password are required",
      })
    }

    const customer = await Customer.findByEmail(email)
    if (!customer) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid email or password",
      })
    }

    const isValid = await Customer.verifyPassword(password, customer.password)
    if (!isValid) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid email or password",
      })
    }

    if (!customer.is_active) {
      const activationResult = await requestAccountActivation({
        customer,
        requestedIp: req.ip,
      })

      if (activationResult.emailDelivery && activationResult.emailDelivery.status !== "sent") {
        console.error("Account activation email delivery error:", activationResult.emailDelivery.message)
      }

      return res.status(403).json({
        error: "Account inactive",
        message: "Your account is not active yet. Check your email for the activation link",
      })
    }

    const safeCustomer = sanitizeCustomer(customer)
    const token = generateToken(safeCustomer)

    res.json({
      message: "Login successful",
      customer: safeCustomer,
      token,
    })
  } catch (err) {
    console.error("Customer login error:", err)
    res.status(500).json({
      error: "Server error",
      message: "Login failed",
    })
  }
}

// Get customer by ID
export const getCustomer = async (req, res) => {
  try {
    const { id } = req.params
    const customer = await Customer.findById(id)

    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      })
    }

    res.json(sanitizeCustomer(customer))
  } catch (error) {
    console.error("Get customer error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch customer",
    })
  }
}

// Get all customers + their licenses
export const getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.findAll()
    res.json(customers);
  } catch (error) {
    console.error("Get all customers with license count error:", error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to retrieve customers",
    });
  }
};

// Get customer by ID
export const getCustomerByToken = async (req, res) => {
  try {
    const customer = req.user || await Customer.findById(req.userId)

    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      })
    }

    res.json(sanitizeCustomer(customer))
  } catch (error) {
    console.error("Get customer error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch customer",
    })
  }
}
