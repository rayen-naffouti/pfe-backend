import { query } from "../config/db.js"

const TEMPLATE_DEFAULTS = {
  expiration: {
    subject: "Your license expires in {{days}} days",
    body: "Your license for {{product_name}} will expire on {{expiration_date}}.\n\nLicense key: {{license_key}}\n\nPlease renew your license to continue using our services without interruption.",
  },
  renewal: {
    subject: "Your {{product_name}} license has been renewed",
    body: "Your license for {{product_name}} has been renewed successfully.\n\nLicense key: {{license_key}}\nNew expiration date: {{expiration_date}}\n\nYou can keep using your product with the updated license.",
  },
  disabled: {
    subject: "Your license has been disabled",
    body: "Dear {{customer_name}},\n\nYour license for {{product_name}} has been disabled. Contact support if you believe this is a mistake.\n\nBest regards,\nThe Licentra Team",
  },
  welcome: {
    subject: "Your {{product_name}} license is ready",
    body: "Your license for {{product_name}} is active.\n\nLicense key: {{license_key}}\nExpiration date: {{expiration_date}}\n\nUse this key in your product environment to activate access.",
  },
}

export const DEFAULT_AUTOMATION_SETTINGS = {
  expirationReminders: {
    enabled: true,
    daysBefore: 30,
    schedule: [
      { id: "first", label: "First reminder", enabled: true, days: 30 },
      { id: "second", label: "Second reminder", enabled: true, days: 14 },
      { id: "final", label: "Final reminder", enabled: true, days: 3 },
    ],
  },
  autoDisable: {
    enabled: true,
    disableOnExpiration: true,
    gracePeriodDays: 7,
  },
  renewal: {
    enabled: false,
    renewDaysBefore: 7,
    applyTo: "subscription",
  },
  emailTemplates: {
    selectedTemplate: "expiration",
    templates: TEMPLATE_DEFAULTS,
  },
}

const toBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value
  return fallback
}

const toNumber = (value, fallback, min, max) => {
  const number = Number(value)

  if (!Number.isFinite(number)) return fallback

  return Math.min(Math.max(Math.round(number), min), max)
}

const toOption = (value, allowed, fallback) => {
  return allowed.includes(value) ? value : fallback
}

const normalizeReminder = (reminder, fallback) => ({
  id: fallback.id,
  label: fallback.label,
  enabled: toBoolean(reminder?.enabled, fallback.enabled),
  days: toNumber(reminder?.days, fallback.days, 1, 365),
})

const normalizeTemplates = (templates = {}) => {
  return Object.fromEntries(
    Object.entries(TEMPLATE_DEFAULTS).map(([key, fallback]) => {
      const current = templates[key] || {}

      return [
        key,
        {
          subject: typeof current.subject === "string" && current.subject.trim() ? current.subject : fallback.subject,
          body: typeof current.body === "string" && current.body.trim() ? current.body : fallback.body,
        },
      ]
    }),
  )
}

export const normalizeAutomationSettings = (settings = {}) => {
  const expirationReminders = settings.expirationReminders || {}
  const autoDisable = settings.autoDisable || {}
  const renewal = settings.renewal || {}
  const emailTemplates = settings.emailTemplates || {}
  const templates = normalizeTemplates(emailTemplates.templates)

  return {
    expirationReminders: {
      enabled: toBoolean(expirationReminders.enabled, DEFAULT_AUTOMATION_SETTINGS.expirationReminders.enabled),
      daysBefore: toNumber(expirationReminders.daysBefore, DEFAULT_AUTOMATION_SETTINGS.expirationReminders.daysBefore, 1, 365),
      schedule: DEFAULT_AUTOMATION_SETTINGS.expirationReminders.schedule.map((fallback) =>
        normalizeReminder(
          Array.isArray(expirationReminders.schedule)
            ? expirationReminders.schedule.find((reminder) => reminder?.id === fallback.id)
            : null,
          fallback,
        ),
      ),
    },
    autoDisable: {
      enabled: toBoolean(autoDisable.enabled, DEFAULT_AUTOMATION_SETTINGS.autoDisable.enabled),
      disableOnExpiration: toBoolean(
        autoDisable.disableOnExpiration,
        DEFAULT_AUTOMATION_SETTINGS.autoDisable.disableOnExpiration,
      ),
      gracePeriodDays: toNumber(autoDisable.gracePeriodDays, DEFAULT_AUTOMATION_SETTINGS.autoDisable.gracePeriodDays, 0, 90),
    },
    renewal: {
      enabled: toBoolean(renewal.enabled, DEFAULT_AUTOMATION_SETTINGS.renewal.enabled),
      renewDaysBefore: toNumber(renewal.renewDaysBefore, DEFAULT_AUTOMATION_SETTINGS.renewal.renewDaysBefore, 1, 365),
      applyTo: toOption(renewal.applyTo, ["all", "subscription", "annual"], DEFAULT_AUTOMATION_SETTINGS.renewal.applyTo),
    },
    emailTemplates: {
      selectedTemplate: toOption(
        emailTemplates.selectedTemplate,
        Object.keys(TEMPLATE_DEFAULTS),
        DEFAULT_AUTOMATION_SETTINGS.emailTemplates.selectedTemplate,
      ),
      templates,
    },
  }
}

export const AutomationSettings = {
  async ensureTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS automation_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        settings JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    await query(sql)
  },

  async get() {
    await this.ensureTable()

    const result = await query("SELECT settings, updated_at FROM automation_settings WHERE id = 1")

    if (!result.rows[0]) {
      return this.update(DEFAULT_AUTOMATION_SETTINGS)
    }

    return {
      settings: normalizeAutomationSettings(result.rows[0].settings),
      updated_at: result.rows[0].updated_at,
    }
  },

  async update(settings) {
    await this.ensureTable()

    const normalizedSettings = normalizeAutomationSettings(settings)
    const sql = `
      INSERT INTO automation_settings (id, settings, updated_at)
      VALUES (1, $1::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (id)
      DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP
      RETURNING settings, updated_at
    `
    const result = await query(sql, [JSON.stringify(normalizedSettings)])

    return {
      settings: normalizeAutomationSettings(result.rows[0].settings),
      updated_at: result.rows[0].updated_at,
    }
  },
}

export default AutomationSettings
