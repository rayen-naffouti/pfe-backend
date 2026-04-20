import { query } from "../config/db.js"
import bcrypt from "bcrypt"

const SALT_ROUNDS = 10

export const User = {
  // Create users table if not exists
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await query(sql)
    console.log("Users table ready")
  },

  // Create a new user
  async create({ username, email, password }) {
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

    const sql = `
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, created_at
    `
    const result = await query(sql, [username, email, hashedPassword])
    return result.rows[0]
  },

  // Find user by email
  async findByEmail(email) {
    const sql = "SELECT * FROM users WHERE email = $1"
    const result = await query(sql, [email])
    return result.rows[0]
  },

  // Find user by username
  async findByUsername(username) {
    const sql = "SELECT * FROM users WHERE username = $1"
    const result = await query(sql, [username])
    return result.rows[0]
  },

  // Find user by ID
  async findById(id) {
    const sql = "SELECT id, username, email, created_at FROM users WHERE id = $1"
    const result = await query(sql, [id])
    return result.rows[0]
  },

  // Verify password
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword)
  },
}

export default User
