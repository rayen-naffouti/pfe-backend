import { query } from "../config/db.js"
import Notification from "./notification.js"

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
    await Notification.ensureTable()

    const sql = `
      WITH timeline AS (
        SELECT
          ('history-' || h.id::TEXT) AS timeline_id,
          10 AS source_order,
          h.id AS source_id,
          'history'::TEXT AS source,
          h.license_id,
          h.action::TEXT AS action,
          h.old_status::TEXT AS old_status,
          h.new_status::TEXT AS new_status,
          h.note::TEXT AS note,
          NULL::TEXT AS event,
          NULL::TEXT AS type,
          NULL::TEXT AS status,
          NULL::TEXT AS email_status,
          NULL::TEXT AS email_error,
          NULL::TEXT AS email_to,
          NULL::TEXT AS email_subject,
          NULL::TIMESTAMP AS scheduled_for,
          NULL::TIMESTAMP AS sent_at,
          NULL::TIMESTAMP AS email_sent_at,
          h.created_at
        FROM license_transaction_history h
        WHERE h.license_id = $1

        UNION ALL

        SELECT
          ('notification-' || n.id::TEXT) AS timeline_id,
          20 AS source_order,
          n.id AS source_id,
          'notification'::TEXT AS source,
          n.license_id,
          COALESCE(n.title, 'Notification')::TEXT AS action,
          NULL::TEXT AS old_status,
          CASE
            WHEN n.event = 'license_expired' AND n.status = 'sent' THEN 'expired'
            ELSE NULL
          END AS new_status,
          n.message::TEXT AS note,
          n.event::TEXT AS event,
          n.type::TEXT AS type,
          n.status::TEXT AS status,
          n.email_status::TEXT AS email_status,
          n.email_error::TEXT AS email_error,
          n.email_to::TEXT AS email_to,
          n.email_subject::TEXT AS email_subject,
          n.scheduled_for,
          n.sent_at,
          n.email_sent_at,
          COALESCE(n.email_sent_at, n.sent_at, n.scheduled_for, n.created_at) AS created_at
        FROM notifications n
        WHERE n.license_id = $1
          AND n.event IN ('license_expiration_reminder', 'license_expired')

        UNION ALL

        SELECT
          ('expiration-' || l.id::TEXT) AS timeline_id,
          30 AS source_order,
          l.id AS source_id,
          'expiration'::TEXT AS source,
          l.id AS license_id,
          CASE
            WHEN l.expiration_at <= CURRENT_TIMESTAMP THEN 'License Expired'
            ELSE 'License Expiration Scheduled'
          END AS action,
          NULL::TEXT AS old_status,
          CASE
            WHEN l.expiration_at <= CURRENT_TIMESTAMP THEN 'expired'
            ELSE NULL
          END AS new_status,
          ('License expiration date: ' || TO_CHAR(l.expiration_at, 'YYYY-MM-DD HH24:MI'))::TEXT AS note,
          'license_expiration'::TEXT AS event,
          CASE
            WHEN l.expiration_at <= CURRENT_TIMESTAMP THEN 'error'
            ELSE 'warning'
          END AS type,
          CASE
            WHEN l.expiration_at <= CURRENT_TIMESTAMP THEN 'sent'
            ELSE 'scheduled'
          END AS status,
          NULL::TEXT AS email_status,
          NULL::TEXT AS email_error,
          NULL::TEXT AS email_to,
          NULL::TEXT AS email_subject,
          l.expiration_at AS scheduled_for,
          NULL::TIMESTAMP AS sent_at,
          NULL::TIMESTAMP AS email_sent_at,
          l.expiration_at AS created_at
        FROM licenses l
        WHERE l.id = $1
          AND l.expiration_at IS NOT NULL
      )
      SELECT
        timeline_id,
        source_id,
        source,
        license_id,
        action,
        old_status,
        new_status,
        note,
        event,
        type,
        status,
        email_status,
        email_error,
        email_to,
        email_subject,
        scheduled_for,
        sent_at,
        email_sent_at,
        created_at
      FROM timeline
      ORDER BY created_at DESC, source_order ASC, source_id DESC
    `
    const result = await query(sql, [license_id])
    return result.rows
  },
}

export default LicenseHistory
