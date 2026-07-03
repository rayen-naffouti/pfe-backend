import pool, { query } from "../config/db.js"

const runQuery = (client, text, params) => {
  if (client) {
    return client.query(text, params)
  }

  return query(text, params)
}

export const AccountActivationToken = {
  async ensureTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS account_activation_tokens (
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

      CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_hash
        ON account_activation_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_customer
        ON account_activation_tokens(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_active
        ON account_activation_tokens(expires_at)
        WHERE used_at IS NULL;
    `

    await query(sql)
  },

  async hasRecentRequest(customerId, cooldownSeconds) {
    await this.ensureTable()

    const sql = `
      SELECT EXISTS (
        SELECT 1
        FROM account_activation_tokens
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
          UPDATE account_activation_tokens
          SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
          WHERE customer_id = $1
            AND used_at IS NULL
        `,
        [customerId],
      )
      const result = await client.query(
        `
          INSERT INTO account_activation_tokens (
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
      SELECT aat.*, c.email, c.username, c.is_active
      FROM account_activation_tokens aat
      INNER JOIN customers c ON c.id = aat.customer_id
      WHERE aat.token_hash = $1
        AND aat.used_at IS NULL
        AND aat.expires_at > CURRENT_TIMESTAMP
      ${client ? "FOR UPDATE OF aat" : ""}
    `
    const result = await runQuery(client, sql, [tokenHash])

    return result.rows[0]
  },

  async markEmailResult(id, { status, error }) {
    await this.ensureTable()

    const sql = `
      UPDATE account_activation_tokens
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
      UPDATE account_activation_tokens
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
      UPDATE account_activation_tokens
      SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
      WHERE customer_id = $1
        AND used_at IS NULL
    `

    await runQuery(client, sql, [customerId])
  },

  async deleteExpired() {
    await this.ensureTable()
    await query(`
      DELETE FROM account_activation_tokens
      WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
         OR used_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
    `)
  },
}

export default AccountActivationToken
