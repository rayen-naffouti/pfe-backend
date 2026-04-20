import { query } from "../config/db.js"

export const Product = {
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      product_base_url VARCHAR(255),
      product_namespace VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
    `
    await query(sql)
    console.log("Products table ready")
  },

  async create({ name, slug, description }) {
    const sql = `
      INSERT INTO products (name, slug, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `
    const result = await query(sql, [name, slug, description])
    return result.rows[0]
  },

  async findById(id) {
    const sql = `SELECT * FROM products WHERE id = $1`
    const result = await query(sql, [id])
    return result.rows[0]
  },

  async findAll() {
    const sql = `
    SELECT 
      p.*,
      COUNT(l.id) AS license_count
    FROM products p
    LEFT JOIN licenses l ON l.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `
    const result = await query(sql)
    return result.rows
  },
}

export default Product
