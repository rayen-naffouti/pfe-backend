import cors from "cors"
import express from "express"
import dotenv from "dotenv"
import authRoutes from "./routes/authRoutes.js"
import customerRoutes from "./routes/customerRoutes.js"
import { testConnection } from "./config/db.js"
import { requestLogger } from "./middleware/requestLogger.js"
import { startNotificationScheduler } from "./services/notificationService.js"
import AccountActivationToken from "./models/accountActivationToken.js"
import AutomationSettings from "./models/automationSettings.js"
import Customer from "./models/customer.js"
import License from "./models/license.js"
import LicenseHistory from "./models/licenseHistory.js"
import Notification from "./models/notification.js"
import PasswordResetToken from "./models/passwordResetToken.js"
import Payment from "./models/payment.js"
import Product from "./models/product.js"
import User from "./models/user.js"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  ...String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
])

const ensureDatabaseSchema = async () => {
  await User.createTable()
  await Customer.createTable()
  await Customer.ensureSecurityColumns()
  await Product.createTable()
  await License.createTable()
  await Payment.createTable()
  await LicenseHistory.createTable()
  await Notification.ensureTable()
  await AutomationSettings.ensureTable()
  await AccountActivationToken.ensureTable()
  await PasswordResetToken.ensureTable()
}

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
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }

    callback(new Error("Origin not allowed by CORS"))
  },
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
    await ensureDatabaseSchema()
    startNotificationScheduler()

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
