import { query } from "../config/db.js"

export const Payment = {
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        license_id INTEGER REFERENCES licenses(id),
        amount NUMERIC(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        method VARCHAR(50), -- credit card, paypal, etc
        status VARCHAR(30) DEFAULT 'pending', -- paid, declined, refunded
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await query(sql)
    console.log("Payments table ready")
  },

  async create({ customer_id, license_id, amount, currency, method, status }) {
    const sql = `
      INSERT INTO payments (customer_id, license_id, amount, currency, method, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `
    const result = await query(sql, [
      customer_id,
      license_id,
      amount,
      currency,
      method,
      status,
    ])
    return result.rows[0]
  },

  async findByCustomer(customer_id) {
    const sql = `SELECT * FROM payments WHERE customer_id = $1`
    const result = await query(sql, [customer_id])
    return result.rows
  },
}

export default Payment
