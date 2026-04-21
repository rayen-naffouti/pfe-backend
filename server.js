import cors from "cors"
import express from "express"
import dotenv from "dotenv"
import authRoutes from "./routes/authRoutes.js"
import customerRoutes from "./routes/customerRoutes.js"
import { testConnection } from "./config/db.js"
import { requestLogger } from "./middleware/requestLogger.js"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080

const getRequestPath = (req) => {
  try {
    return new URL(req.originalUrl, "http://localhost").pathname
  } catch {
    return req.originalUrl || req.path || "unknown"
  }
}

// Log every API request after the response completes
app.use("/api", requestLogger)

app.use(cors({
  origin: ["http://localhost:5173"], // your frontend
  credentials: true,
}))

// Middleware to parse JSON
app.use(express.json())

// Routes
app.use("/api/", customerRoutes)
app.use("/api/auth", authRoutes)

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "api_error",
    method: req.method,
    path: getRequestPath(req),
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  }))

  res.status(500).json({ error: "Something went wrong!" })
})

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection()

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`Health check: http://localhost:${PORT}/health`)
      console.log(`Auth routes: http://localhost:${PORT}/api/auth`)
    })
  } catch (error) {
    console.error("Failed to start server:", error.message)
    process.exit(1)
  }
}

startServer()
