import { query } from "../config/db.js"
import bcrypt from "bcrypt"

const SALT_ROUNDS = 10

export const Customer = {
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await query(sql)
    console.log("Customers table ready")
  },

  async create({ username, email, password, role = "user" }) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS)

    const sql = `
      INSERT INTO customers (username, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, role, created_at
    `
    const result = await query(sql, [username, email, hashed, role])
    return result.rows[0]
  },

  async findAll() {
    const sql = `
      SELECT
        c.id,
        c.username,
        c.email,
        c.role,
        c.created_at,
        c.updated_at,
        COUNT(l.id) AS license_count
      FROM customers c
      LEFT JOIN licenses l ON c.id = l.customer_id
      GROUP BY c.id
      ORDER BY c.id;
    `;
    const result = await query(sql)
    return result.rows
  },

  async findById(id) {
    const sql = `
      SELECT id, username, email, role, created_at 
      FROM customers WHERE id = $1
    `
    const result = await query(sql, [id])
    return result.rows[0]
  },

    async findByEmail(email) {
    const sql = "SELECT * FROM customers WHERE email = $1"
    const result = await query(sql, [email])
    return result.rows[0]
  },


  async verifyPassword(plain, hashed) {
    return bcrypt.compare(plain, hashed)
  },
}

export default Customer
