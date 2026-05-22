import { query } from "../config/db.js"

export const License = {
  async createTable() {
    const sql = `
  ALTER TABLE licenses
  ALTER COLUMN license_key TYPE TEXT
    `
    await query(sql)
    console.log("Licenses table ready")
  },

  async create({ license_key, status, customer_id, product_id, expiration_at }) {
    const sql = `
      INSERT INTO licenses (license_key, status, customer_id, product_id, expiration_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `
    const result = await query(sql, [
      license_key,
      status,
      customer_id,
      product_id,
      expiration_at,
    ])
    return result.rows[0]
  },

  async updateLicenseKey(id, license_key) {
    const sql = `
      UPDATE licenses
      SET license_key = $1
      WHERE id = $2
      RETURNING *
    `
    const result = await query(sql, [license_key, id])
    return result.rows[0]
  },

  async findById(id) {
    const sql = `
      SELECT
        l.id,
        l.license_key,
        l.status,
        l.customer_id,
        l.product_id,
        l.created_at AS license_created_at,
        l.expiration_at,

        c.id AS customer_id,
        c.username AS customer_username,
        c.email AS customer_email,
        c.created_at AS customer_created_at,
        c.updated_at AS customer_updated_at,

        p.id AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.description AS product_description,
        p.created_at AS product_created_at

      FROM licenses l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN products p ON l.product_id = p.id
      WHERE l.id = $1;
    `
    const result = await query(sql, [id])
    return result.rows[0]
  },

  async findByCustomer(customer_id) {
    const sql = `
      SELECT
        l.id,
        l.license_key,
        l.status,
        l.customer_id,
        l.created_at,
        l.expiration_at,

        p.id AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.description AS product_description,
        p.created_at AS product_created_at

      FROM licenses l
      LEFT JOIN products p ON l.product_id = p.id
      WHERE l.customer_id = $1
      ORDER BY l.created_at DESC;
    `
    const result = await query(sql, [customer_id])
    return result.rows
  },


  async findAllWithRelations() {
    const sql = `
      SELECT
        l.*,

        -- Customer fields
        c.id AS customer_id,
        c.username AS customer_username,
        c.email AS customer_email,
        c.role AS customer_role,
        c.created_at AS customer_created_at,

        -- Product fields
        p.id AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.description AS product_description,
        p.created_at AS product_created_at

      FROM licenses l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN products p ON l.product_id = p.id
      ORDER BY l.created_at DESC
    `
    const result = await query(sql)
    return result.rows
  }
}

export default License
