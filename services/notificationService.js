import AutomationSettings from "../models/automationSettings.js"
import License from "../models/license.js"
import Notification from "../models/notification.js"
import { getEmailRuntimeConfig, renderLicenseEmailHtml, sendEmail } from "./emailService.js"

const MS_PER_DAY = 86_400_000
const MS_PER_MINUTE = 60_000

const parseBooleanEnv = (name, fallback) => {
  const value = process.env[name]

  if (typeof value !== "string") {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
}

const getDefaultChannel = () => {
  const channel = process.env.NOTIFICATION_DEFAULT_CHANNEL?.trim()

  return channel || "in_app,email"
}

const notificationsEnabled = () => parseBooleanEnv("NOTIFICATIONS_ENABLED", true)
const remindersEnabled = () => parseBooleanEnv("NOTIFICATION_REMINDERS_ENABLED", true)

const formatDate = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "the expiration date"
  }

  return date.toISOString().slice(0, 10)
}

const formatDateTime = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "the expiration time"
  }

  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC"
}

const renderTemplate = (template, variables) => {
  if (typeof template !== "string") {
    return ""
  }

  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = variables[key]

    return value === undefined || value === null ? "" : String(value)
  })
}

const buildVariables = ({ license, customer, product, days }) => ({
  customer_name: customer?.username || customer?.email || "Customer",
  product_name: product?.name || "your product",
  license_id: license?.id,
  license_key: license?.license_key,
  expiration_date: formatDate(license?.expiration_at),
  days,
})

const getTemplate = (settings, key) => {
  return settings?.emailTemplates?.templates?.[key] || {}
}

const getPortalUrl = () => {
  const config = getEmailRuntimeConfig()

  return `${config.baseUrl.replace(/\/$/, "")}/portal`
}

const getReminderSchedule = (settings) => {
  const reminders = settings?.expirationReminders

  if (!reminders?.enabled || !Array.isArray(reminders.schedule)) {
    return []
  }

  return reminders.schedule
    .filter((reminder) => reminder?.enabled)
    .map((reminder) => ({
      id: reminder.id,
      label: reminder.label,
      days: Number(reminder.days),
    }))
    .filter((reminder) => Number.isFinite(reminder.days) && reminder.days > 0)
}

export const getNotificationAutomationSettings = async () => {
  const result = await AutomationSettings.get()

  return result.settings
}

export const createLicensePurchaseNotifications = async ({
  client,
  license,
  customer,
  product,
  payment,
  automationSettings,
  purchaseSummary,
  lifecycleAction = "create",
  planName,
}) => {
  if (!notificationsEnabled()) {
    return { purchaseNotification: null, reminderNotifications: [] }
  }

  const channel = getDefaultChannel()
  const now = new Date()
  const expirationDate = new Date(license.expiration_at)
  const variables = buildVariables({ license, customer, product })
  const isRenewal = lifecycleAction === "renewal"
  const isTestPlan = String(planName || "").trim().toLowerCase() === "test plan"
  const templateKey = isRenewal ? "renewal" : "welcome"
  const purchaseTemplate = getTemplate(automationSettings, templateKey)
  const purchaseTitle =
    renderTemplate(purchaseTemplate.subject, variables) ||
    (isRenewal ? `Your ${variables.product_name} license was renewed` : `Your ${variables.product_name} license is ready`)
  const purchaseMessage =
    renderTemplate(purchaseTemplate.body, variables) ||
    `Your ${variables.product_name} license is active.\n\nLicense key: ${license.license_key}\nExpiration date: ${formatDate(license.expiration_at)}`

  const purchaseNotification = await Notification.create(
    {
      customer_id: customer.id,
      license_id: license.id,
      product_id: product.id,
      type: "success",
      event: isRenewal ? "license_renewed" : "license_created",
      channel,
      title: purchaseTitle,
      message: purchaseMessage,
      payload: {
        test_plan: isTestPlan,
        lifecycle_action: lifecycleAction,
        license_key: license.license_key,
        product_name: variables.product_name,
        expiration_at: license.expiration_at,
        payment_id: payment?.id || null,
        purchase_summary: purchaseSummary || null,
      },
      status: "sent",
      email_to: customer.email,
      email_subject: purchaseTitle,
      email_status: "pending",
      sent_at: now,
    },
    { client, skipEnsure: Boolean(client) },
  )

  if (!remindersEnabled() || Number.isNaN(expirationDate.getTime())) {
    return { purchaseNotification, reminderNotifications: [] }
  }

  if (isTestPlan) {
    const reminderAt = new Date(expirationDate.getTime() - 5 * MS_PER_MINUTE)
    const expirationLabel = formatDateTime(license.expiration_at)
    const testNotifications = [
      {
        customer_id: customer.id,
        license_id: license.id,
        product_id: product.id,
        type: "warning",
        event: "license_expiration_reminder",
        channel,
        title: "Test license expires in 5 minutes",
        message: `Your ${variables.product_name} test license expires in 5 minutes at ${expirationLabel}.`,
        payload: {
          test_plan: true,
          minutes_before_expiration: 5,
          product_name: variables.product_name,
          license_key: license.license_key,
          expiration_at: license.expiration_at,
        },
        status: "scheduled",
        email_to: customer.email,
        email_subject: "Test license expires in 5 minutes",
        email_status: "pending",
        scheduled_for: reminderAt,
      },
      {
        customer_id: customer.id,
        license_id: license.id,
        product_id: product.id,
        type: "error",
        event: "license_expired",
        channel,
        title: "Test license has expired",
        message: `Your ${variables.product_name} test license expired at ${expirationLabel}. Renew it to restore access.`,
        payload: {
          test_plan: true,
          product_name: variables.product_name,
          license_key: license.license_key,
          expiration_at: license.expiration_at,
        },
        status: "scheduled",
        email_to: customer.email,
        email_subject: "Test license has expired",
        email_status: "pending",
        scheduled_for: expirationDate,
      },
    ].filter((notification) => notification.scheduled_for.getTime() > now.getTime())

    const reminderNotifications = await Notification.createMany(testNotifications, { client })

    return { purchaseNotification, reminderNotifications }
  }

  const expirationTemplate = getTemplate(automationSettings, "expiration")
  const scheduledReminders = getReminderSchedule(automationSettings)
    .map((reminder) => {
      const scheduledFor = new Date(expirationDate.getTime() - reminder.days * MS_PER_DAY)

      if (scheduledFor.getTime() <= now.getTime()) {
        return null
      }

      const reminderVariables = buildVariables({
        license,
        customer,
        product,
        days: reminder.days,
      })

      return {
        customer_id: customer.id,
        license_id: license.id,
        product_id: product.id,
        type: "warning",
        event: "license_expiration_reminder",
        channel,
        title: renderTemplate(expirationTemplate.subject, reminderVariables) || `Your license expires in ${reminder.days} days`,
        message:
          renderTemplate(expirationTemplate.body, reminderVariables) ||
          `Your ${variables.product_name} license expires on ${formatDate(license.expiration_at)}.`,
        payload: {
          reminder_id: reminder.id,
          reminder_label: reminder.label,
          days_before_expiration: reminder.days,
          license_key: license.license_key,
          expiration_at: license.expiration_at,
        },
        status: "scheduled",
        email_to: customer.email,
        email_subject: renderTemplate(expirationTemplate.subject, reminderVariables) || `Your license expires in ${reminder.days} days`,
        email_status: "pending",
        scheduled_for: scheduledFor,
      }
    })
    .filter(Boolean)

  const reminderNotifications = await Notification.createMany(scheduledReminders, { client })

  return { purchaseNotification, reminderNotifications }
}

export const sendNotificationEmail = async (notificationOrId) => {
  const notification =
    typeof notificationOrId === "object" ? notificationOrId : await Notification.findByIdWithRelations(notificationOrId)

  if (!notification) {
    return { status: "skipped", message: "Notification not found" }
  }

  const payload = notification.payload || {}
  const title = notification.email_subject || notification.title
  const hidesLicenseKey = ["license_expiration_reminder", "license_expired"].includes(notification.event)
  const html = renderLicenseEmailHtml({
    appName: getEmailRuntimeConfig().appName,
    title,
    message: notification.message,
    productName: payload.product_name || notification.product_name,
    customerName: notification.customer_username || notification.customer_email,
    licenseKey: hidesLicenseKey ? null : payload.license_key || notification.license_key,
    expirationDate: payload.test_plan
      ? formatDateTime(payload.expiration_at || notification.license_expiration_at)
      : formatDate(payload.expiration_at || notification.license_expiration_at),
    actionUrl: getPortalUrl(),
  })

  try {
    if (notification.event === "license_expired" && notification.license_id) {
      await License.updateStatus(notification.license_id, "expired")
    }

    const result = await sendEmail({
      to: notification.email_to || notification.customer_email,
      subject: title,
      html,
    })
    const sent = result.status === "sent"

    await Notification.markSent({
      id: notification.id,
      emailStatus: result.status,
      emailSentAt: sent ? new Date() : null,
      emailError: sent ? null : result.message,
    })

    return {
      notification_id: notification.id,
      ...result,
    }
  } catch (error) {
    await Notification.markSent({
      id: notification.id,
      emailStatus: "failed",
      emailSentAt: null,
      emailError: error.message,
    })

    return {
      notification_id: notification.id,
      status: "failed",
      message: error.message,
    }
  }
}

export const dispatchDueNotifications = async () => {
  if (!notificationsEnabled()) {
    return []
  }

  const batchSize = Number(process.env.NOTIFICATION_DISPATCH_BATCH_SIZE) || 50
  const dueNotifications = await Notification.findDueScheduled(batchSize)
  const results = []

  for (const notification of dueNotifications) {
    results.push(await sendNotificationEmail(notification))
  }

  return results
}

export const startNotificationScheduler = () => {
  const schedulerEnabled = parseBooleanEnv("NOTIFICATION_SCHEDULER_ENABLED", true)

  if (!notificationsEnabled() || !schedulerEnabled) {
    return null
  }

  const intervalMs = Math.max(Number(process.env.NOTIFICATION_SCHEDULER_INTERVAL_MS) || 60_000, 10_000)

  dispatchDueNotifications().catch((error) => {
    console.error("Notification scheduler startup error:", error.message)
  })

  const timer = setInterval(() => {
    dispatchDueNotifications().catch((error) => {
      console.error("Notification scheduler error:", error.message)
    })
  }, intervalMs)

  if (typeof timer.unref === "function") {
    timer.unref()
  }

  return timer
}
