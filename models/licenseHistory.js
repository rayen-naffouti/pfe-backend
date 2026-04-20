import { query } from "../config/db.js"

export const LicenseHistory = {
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS license_transaction_history (
        id SERIAL PRIMARY KEY,
        license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL, -- status change, renewal, expiration, etc
        old_status VARCHAR(30),
        new_status VARCHAR(30),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await query(sql)
    console.log("License history table ready")
  },

  async create({ license_id, action, old_status, new_status, note }) {
    const sql = `
      INSERT INTO license_transaction_history 
      (license_id, action, old_status, new_status, note)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `
    const result = await query(sql, [
      license_id,
      action,
      old_status,
      new_status,
      note,
    ])

    return result.rows[0]
  },

  async findByLicense(license_id) {
    const sql = `
      SELECT * FROM license_transaction_history
      WHERE license_id = $1
      ORDER BY created_at DESC
    `
    const result = await query(sql, [license_id])
    return result.rows
  },
}

export default LicenseHistory
