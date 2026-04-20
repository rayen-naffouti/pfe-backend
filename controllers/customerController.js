import Customer from "../models/customer.js"
import jwt from "jsonwebtoken"


const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// Register a new customer
export const registerCustomer = async (req, res) => {
  try {
    const { username, email, password, role } = req.body

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
      return res.status(409).json({
        error: "Duplicate entry",
        message: "A customer with this email already exists",
      })
    }

    const customer = await Customer.create({ username, email, password, role: "user" })

    const token = generateToken(customer.id)

    res.status(201).json({
      message: "Customer registered successfully",
      customer,
      token,
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

    const token = generateToken(customer.id)

    res.json({
      message: "Login successful",
      customer,
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

    res.json(customer)
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
        const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid token",
      })
    }

    const token = authHeader.split(" ")[1]

    // Decode & verify token
    const decoded = jwt.verify(token, JWT_SECRET)

    // adjust key name if needed: decoded.userId / decoded.id
    const customerId = decoded.userId || decoded.id

    if (!customerId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token payload",
      })
    }

    const customer = await Customer.findById(customerId)

    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      })
    }

    res.json(customer)
  } catch (error) {
    console.error("Get customer error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch customer",
    })
  }
}
