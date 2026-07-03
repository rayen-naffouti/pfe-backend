import { query } from "../config/db.js"
import bcrypt from "bcrypt"

const SALT_ROUNDS = 10

const runQuery = (client, text, params) => {
  if (client) {
    return client.query(text, params)
  }

  return query(text, params)
}

export const Customer = {
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        email_verified_at TIMESTAMP,
        activation_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await query(sql)
    console.log("Customers table ready")
  },

  async ensureSecurityColumns() {
    const sql = `
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS activation_sent_at TIMESTAMP
    `

    await query(sql)
  },

  async create({ username, email, password, role = "user", isActive = true }) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS)
    const emailVerifiedAt = isActive ? new Date() : null

    const sql = `
      INSERT INTO customers (username, email, password, role, is_active, email_verified_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, email, role, auth_version, is_active, email_verified_at, activation_sent_at, created_at
    `
    const result = await query(sql, [username, email, hashed, role, isActive, emailVerifiedAt])
    return result.rows[0]
  },

  async findAll() {
    const sql = `
      SELECT
        c.id,
        c.username,
        c.email,
        c.role,
        c.is_active,
        c.email_verified_at,
        c.activation_sent_at,
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
      SELECT id, username, email, role, auth_version, password_changed_at, is_active, email_verified_at, activation_sent_at, created_at
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

  async findByUsername(username) {
    const sql = "SELECT * FROM customers WHERE username = $1"
    const result = await query(sql, [username])
    return result.rows[0]
  },

  async verifyPassword(plain, hashed) {
    return bcrypt.compare(plain, hashed)
  },

  async markActivationEmailSent(id, { client } = {}) {
    const sql = `
      UPDATE customers
      SET activation_sent_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, email, role, auth_version, is_active, email_verified_at, activation_sent_at
    `
    const result = await runQuery(client, sql, [id])

    return result.rows[0]
  },

  async activate(id, { client } = {}) {
    const sql = `
      UPDATE customers
      SET is_active = TRUE,
          email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
          auth_version = auth_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, email, role, auth_version, is_active, email_verified_at, activation_sent_at
    `
    const result = await runQuery(client, sql, [id])

    return result.rows[0]
  },

  async updatePassword(id, password, { client } = {}) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS)
    const sql = `
      UPDATE customers
      SET password = $2,
          auth_version = auth_version + 1,
          password_changed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, email, role, auth_version, password_changed_at
    `
    const result = await runQuery(client, sql, [id, hashed])

    return result.rows[0]
  },
}

export default Customer
