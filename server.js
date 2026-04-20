import cors from "cors";
import express from "express"
import dotenv from "dotenv"
import authRoutes from "./routes/authRoutes.js"
import customerRoutes from "./routes/customerRoutes.js"
import { testConnection } from "./config/db.js"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080

app.use(cors({
  origin: ["http://localhost:5173"], // your frontend
  credentials: true,
}));

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
  console.error(err.stack)
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
