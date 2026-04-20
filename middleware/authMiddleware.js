import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"

// Middleware to protect routes using JWT
export const authenticateToken = (req, res, next) => {
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
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
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

      // Add user ID to request object
      req.userId = decoded.userId
      next()
    })
  } catch (error) {
    console.error("Auth middleware error:", error)
    res.status(500).json({
      error: "Server error",
      message: "An error occurred during authentication",
    })
  }
}

// Optional: Middleware to check if user is admin (example for extending)
export const requireAdmin = (req, res, next) => {
  // This is a placeholder - implement admin check logic as needed
  // For example, add an 'is_admin' column to users table
  next()
}
