import { query } from "../config/db.js"

const runQuery = (client, text, params) => {
  if (client) {
    return client.query(text, params)
  }

  return query(text, params)
}

const normalizeLimit = (limit) => {
  const number = Number(limit)

  if (!Number.isFinite(number)) {
    return 50
  }

  return Math.min(Math.max(Math.round(number), 1), 100)
}

const buildAccountFilter = ({ userId, role }, params) => {
  if (role === "admin") {
    return ""
  }

  params.push(userId)
  return `AND n.customer_id = $${params.length}`
}

export const Notification = {
  async ensureTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        type VARCHAR(40) NOT NULL DEFAULT 'info',
        event VARCHAR(80) NOT NULL,
        channel VARCHAR(40) NOT NULL DEFAULT 'in_app',
        title VARCHAR(180) NOT NULL,
        message TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'sent',
        email_to VARCHAR(255),
        email_subject VARCHAR(255),
        email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        email_sent_at TIMESTAMP,
        email_error TEXT,
        scheduled_for TIMESTAMP,
        sent_at TIMESTAMP,
        read_at TIMESTAMP,
        dismissed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS event VARCHAR(80) NOT NULL DEFAULT 'general',
        ADD COLUMN IF NOT EXISTS channel VARCHAR(40) NOT NULL DEFAULT 'in_app',
        ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'sent',
        ADD COLUMN IF NOT EXISTS email_to VARCHAR(255),
        ADD COLUMN IF NOT EXISTS email_subject VARCHAR(255),
        ADD COLUMN IF NOT EXISTS email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS email_error TEXT,
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP,
        ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_notifications_customer_id ON notifications(customer_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_license_id ON notifications(license_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_status_scheduled ON notifications(status, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
    `

    await query(sql)
  },

  async create(notification, { client, skipEnsure = false } = {}) {
    if (!client && !skipEnsure) {
      await this.ensureTable()
    }

    const sql = `
      INSERT INTO notifications (
        customer_id,
        license_id,
        product_id,
        type,
        event,
        channel,
        title,
        message,
        payload,
        status,
        email_to,
        email_subject,
        email_status,
        scheduled_for,
        sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `
    const result = await runQuery(client, sql, [
      notification.customer_id,
      notification.license_id,
      notification.product_id,
      notification.type || "info",
      notification.event,
      notification.channel || "in_app",
      notification.title,
      notification.message,
      JSON.stringify(notification.payload || {}),
      notification.status || "sent",
      notification.email_to || null,
      notification.email_subject || notification.title,
      notification.email_status || "pending",
      notification.scheduled_for || null,
      notification.sent_at || null,
    ])

    return result.rows[0]
  },

  async createMany(notifications, { client } = {}) {
    const created = []

    for (const notification of notifications) {
      created.push(await this.create(notification, { client, skipEnsure: Boolean(client) }))
    }

    return created
  },

  async findDueScheduled(limit = 50) {
    await this.ensureTable()

    const sql = `
      SELECT
        n.*,
        c.username AS customer_username,
        c.email AS customer_email,
        p.name AS product_name,
        p.slug AS product_slug,
        l.license_key,
        l.expiration_at AS license_expiration_at
      FROM notifications n
      LEFT JOIN customers c ON c.id = n.customer_id
      LEFT JOIN products p ON p.id = n.product_id
      LEFT JOIN licenses l ON l.id = n.license_id
      WHERE n.status = 'scheduled'
        AND n.scheduled_for <= CURRENT_TIMESTAMP
      ORDER BY n.scheduled_for ASC, n.id ASC
      LIMIT $1
    `
    const result = await query(sql, [normalizeLimit(limit)])

    return result.rows
  },

  async findByIdWithRelations(id) {
    await this.ensureTable()

    const sql = `
      SELECT
        n.*,
        c.username AS customer_username,
        c.email AS customer_email,
        p.name AS product_name,
        p.slug AS product_slug,
        l.license_key,
        l.expiration_at AS license_expiration_at
      FROM notifications n
      LEFT JOIN customers c ON c.id = n.customer_id
      LEFT JOIN products p ON p.id = n.product_id
      LEFT JOIN licenses l ON l.id = n.license_id
      WHERE n.id = $1
    `
    const result = await query(sql, [id])

    return result.rows[0]
  },

  async markSent({ id, emailStatus, emailSentAt, emailError }) {
    await this.ensureTable()

    const sql = `
      UPDATE notifications
      SET status = 'sent',
          sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
          email_status = $2,
          email_sent_at = $3,
          email_error = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `
    const result = await query(sql, [id, emailStatus, emailSentAt || null, emailError || null])

    return result.rows[0]
  },

  async findForAccount({ userId, role, limit, includeDismissed = false, includeScheduled = false }) {
    const params = []
    const conditions = []

    if (!includeDismissed) {
      conditions.push("n.dismissed_at IS NULL")
    }

    if (!includeScheduled) {
      conditions.push("n.status <> 'scheduled'")
    }

    const accountFilter = buildAccountFilter({ userId, role }, params)
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")} ${accountFilter}` : `WHERE TRUE ${accountFilter}`

    params.push(normalizeLimit(limit))

    const sql = `
      SELECT
        n.*,
        c.username AS customer_username,
        c.email AS customer_email,
        p.name AS product_name,
        p.slug AS product_slug,
        l.license_key,
        l.expiration_at AS license_expiration_at
      FROM notifications n
      LEFT JOIN customers c ON c.id = n.customer_id
      LEFT JOIN products p ON p.id = n.product_id
      LEFT JOIN licenses l ON l.id = n.license_id
      ${where}
      ORDER BY
        CASE WHEN n.status = 'scheduled' THEN 1 ELSE 0 END,
        COALESCE(n.sent_at, n.scheduled_for, n.created_at) DESC,
        n.id DESC
      LIMIT $${params.length}
    `
    const result = await query(sql, params)

    return result.rows
  },

  async countUnreadForAccount({ userId, role }) {
    const params = []
    const accountFilter = buildAccountFilter({ userId, role }, params)
    const sql = `
      SELECT COUNT(*)::INTEGER AS count
      FROM notifications n
      WHERE n.dismissed_at IS NULL
        AND n.read_at IS NULL
        AND n.status <> 'scheduled'
        ${accountFilter}
    `
    const result = await query(sql, params)

    return result.rows[0]?.count || 0
  },

  async markRead({ id, userId, role }) {
    await this.ensureTable()

    const params = [id]
    const accountFilter = buildAccountFilter({ userId, role }, params)
    const sql = `
      UPDATE notifications n
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE n.id = $1
        ${accountFilter}
      RETURNING n.*
    `
    const result = await query(sql, params)

    return result.rows[0]
  },

  async markAllRead({ userId, role }) {
    const params = []
    const accountFilter = buildAccountFilter({ userId, role }, params)
    const sql = `
      UPDATE notifications n
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE n.dismissed_at IS NULL
        AND n.read_at IS NULL
        AND n.status <> 'scheduled'
        ${accountFilter}
      RETURNING n.id
    `
    const result = await query(sql, params)

    return result.rows
  },

  async dismiss({ id, userId, role }) {
    await this.ensureTable()

    const params = [id]
    const accountFilter = buildAccountFilter({ userId, role }, params)
    const sql = `
      UPDATE notifications n
      SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP),
          read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE n.id = $1
        ${accountFilter}
      RETURNING n.*
    `
    const result = await query(sql, params)

    return result.rows[0]
  },
}

export default Notification
