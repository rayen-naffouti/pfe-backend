import jwt from "jsonwebtoken"
import User from "../models/user.js"
import Customer from "../models/customer.js"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// Register new user
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Validation error",
        message: "Username, email, and password are required",
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Validation error",
        message: "Invalid email format",
      })
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        error: "Validation error",
        message: "Password must be at least 6 characters long",
      })
    }

    // Check if user already exists
    const existingEmail = await User.findByEmail(email)
    if (existingEmail) {
      return res.status(409).json({
        error: "Duplicate entry",
        message: "A user with this email already exists",
      })
    }

    const existingUsername = await User.findByUsername(username)
    if (existingUsername) {
      return res.status(409).json({
        error: "Duplicate entry",
        message: "A user with this username already exists",
      })
    }

    // Create user
    const user = await User.create({ username, email, password })

    // Generate token
    const token = generateToken(user.id)

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
      token,
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({
      error: "Server error",
      message: "An error occurred during registration",
    })
  }
}

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: "Validation error",
        message: "Email and password are required",
      })
    }

    // Find user by email
    const user = await User.findByEmail(email)
    if (!user) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid email or password",
      })
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password)
    if (!isValidPassword) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "Invalid email or password",
      })
    }

    // Generate token
    const token = generateToken(user.id)

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      token,
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({
      error: "Server error",
      message: "An error occurred during login",
    })
  }
}

// Get current user profile (protected route example)
export const getProfile = async (req, res) => {
  try {
    const customer = req.user || await Customer.findById(req.userId)
    if (!customer) {
      return res.status(404).json({
        error: "Not found",
        message: "Customer not found",
      })
    }

    res.json({
      user: customer,
    })
  } catch (error) {
    console.error("Profile error:", error)
    res.status(500).json({
      error: "Server error",
      message: "An error occurred while fetching profile",
    })
  }
}
