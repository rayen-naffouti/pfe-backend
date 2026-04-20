import pg from "pg"
import dotenv from "dotenv"

dotenv.config()

const { Pool } = pg

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "auth_db",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "mypass",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Test connection
export const testConnection = async () => {
  try {
    const client = await pool.connect()
    console.log("Connected to PostgreSQL database")
    client.release()
    return true
  } catch (error) {
    console.error("Database connection error:", error.message)
    throw error
  }
}

// Query helper function
export const query = async (text, params) => {
  const start = Date.now()
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    console.log("Executed query", { duration, rows: result.rowCount })
    return result
  } catch (error) {
    console.error("Query error:", error.message)
    throw error
  }
}

export default pool
