import pool, { query } from "../config/db.js"

const runQuery = (client, text, params) => {
  if (client) {
    return client.query(text, params)
  }

  return query(text, params)
}

export const PasswordResetToken = {
  async ensureTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGSERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        token_hash CHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        requested_ip VARCHAR(64),
        email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        email_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
        ON password_reset_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_customer
        ON password_reset_tokens(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
        ON password_reset_tokens(expires_at)
        WHERE used_at IS NULL;
    `

    await query(sql)
  },

  async hasRecentRequest(customerId, cooldownSeconds) {
    await this.ensureTable()

    const sql = `
      SELECT EXISTS (
        SELECT 1
        FROM password_reset_tokens
        WHERE customer_id = $1
          AND created_at > CURRENT_TIMESTAMP - ($2::INTEGER * INTERVAL '1 second')
      ) AS exists
    `
    const result = await query(sql, [customerId, cooldownSeconds])

    return Boolean(result.rows[0]?.exists)
  },

  async create({ customerId, tokenHash, expiresAt, requestedIp }) {
    await this.ensureTable()

    const client = await pool.connect()

    try {
      await client.query("BEGIN")
      await client.query(
        `
          UPDATE password_reset_tokens
          SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
          WHERE customer_id = $1
            AND used_at IS NULL
        `,
        [customerId],
      )
      const result = await client.query(
        `
          INSERT INTO password_reset_tokens (
            customer_id,
            token_hash,
            expires_at,
            requested_ip
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [customerId, tokenHash, expiresAt, requestedIp || null],
      )
      await client.query("COMMIT")

      return result.rows[0]
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  },

  async findActiveByHash(tokenHash, { client } = {}) {
    if (!client) {
      await this.ensureTable()
    }

    const sql = `
      SELECT prt.*, c.email, c.username, c.password AS current_password_hash
      FROM password_reset_tokens prt
      INNER JOIN customers c ON c.id = prt.customer_id
      WHERE prt.token_hash = $1
        AND prt.used_at IS NULL
        AND prt.expires_at > CURRENT_TIMESTAMP
      ${client ? "FOR UPDATE OF prt" : ""}
    `
    const result = await runQuery(client, sql, [tokenHash])

    return result.rows[0]
  },

  async markEmailResult(id, { status, error }) {
    await this.ensureTable()

    const sql = `
      UPDATE password_reset_tokens
      SET email_status = $2,
          email_error = $3
      WHERE id = $1
      RETURNING *
    `
    const result = await query(sql, [id, status, error || null])

    return result.rows[0]
  },

  async markUsed(id, { client } = {}) {
    const sql = `
      UPDATE password_reset_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND used_at IS NULL
      RETURNING *
    `
    const result = await runQuery(client, sql, [id])

    return result.rows[0]
  },

  async invalidateForCustomer(customerId, { client } = {}) {
    const sql = `
      UPDATE password_reset_tokens
      SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
      WHERE customer_id = $1
        AND used_at IS NULL
    `

    await runQuery(client, sql, [customerId])
  },

  async deleteExpired() {
    await this.ensureTable()
    await query(`
      DELETE FROM password_reset_tokens
      WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
         OR used_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
    `)
  },
}

export default PasswordResetToken
