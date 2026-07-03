import jwt from "jsonwebtoken"
import Customer from "../models/customer.js"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"

const normalizeRole = (role) => {
  return role === "admin" ? "admin" : "user"
}

// Middleware to protect routes using JWT
export const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Access token is required",
      })
    }

    // Verify token
    let decoded

    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Token has expired",
        })
      }

      return res.status(403).json({
        error: "Forbidden",
        message: "Invalid token",
      })
    }

    const userId = decoded.userId || decoded.id

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token payload",
      })
    }

    const customer = await Customer.findById(userId)

    if (!customer) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authenticated account was not found",
      })
    }

    if (!customer.is_active) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Activate your account before continuing",
      })
    }

    if (Number(decoded.authVersion ?? 0) !== Number(customer.auth_version || 0)) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Your session is no longer valid. Please sign in again",
      })
    }

    // Add authenticated account metadata to request object
    req.userId = customer.id
    req.userRole = normalizeRole(customer.role)
    req.user = {
      ...customer,
      role: req.userRole,
    }

    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    res.status(500).json({
      error: "Server error",
      message: "An error occurred during authentication",
    })
  }
}

export const requireAdmin = (req, res, next) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({
      error: "Forbidden",
      message: "Admin access is required",
    })
  }

  next()
}

export const requireSelfOrAdmin = (paramName) => (req, res, next) => {
  const requestedId = Number(req.params[paramName])

  if (req.userRole === "admin" || Number(req.userId) === requestedId) {
    next()
    return
  }

  res.status(403).json({
    error: "Forbidden",
    message: "You can only access your own portal records",
  })
}
