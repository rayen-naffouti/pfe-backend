import crypto from "crypto"
import pool from "../config/db.js"
import Customer from "../models/customer.js"
import PasswordResetToken from "../models/passwordResetToken.js"
import {
  getEmailRuntimeConfig,
  renderPasswordResetEmailHtml,
  sendEmail,
} from "./emailService.js"

const DEFAULT_TOKEN_TTL_MINUTES = 30
const DEFAULT_COOLDOWN_SECONDS = 60
const DEFAULT_PASSWORD_MIN_LENGTH = 10

const clampNumber = (value, fallback, min, max) => {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(Math.max(Math.round(number), min), max)
}

const getTokenTtlMinutes = () => {
  return clampNumber(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES, DEFAULT_TOKEN_TTL_MINUTES, 5, 120)
}

const getCooldownSeconds = () => {
  return clampNumber(process.env.PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS, DEFAULT_COOLDOWN_SECONDS, 30, 3600)
}

const getPasswordMinLength = () => {
  return clampNumber(process.env.PASSWORD_MIN_LENGTH, DEFAULT_PASSWORD_MIN_LENGTH, 8, 128)
}

const normalizeEmail = (email) => String(email || "").trim().toLowerCase()

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex")
}

const isTokenShapeValid = (token) => {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
}

const allowsInsecureCallbackUrls = () => {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_INSECURE_CALLBACK_URLS || "").trim().toLowerCase(),
  )
}

const buildResetUrl = (rawToken) => {
  const emailConfig = getEmailRuntimeConfig()
  const configuredUrl = process.env.PASSWORD_RESET_URL?.trim()
  const url = new URL(configuredUrl || `${emailConfig.baseUrl.replace(/\/$/, "")}/reset-password`)

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !allowsInsecureCallbackUrls()) {
    throw new Error("PASSWORD_RESET_URL must use HTTPS in production")
  }

  url.searchParams.set("token", rawToken)
  return url.toString()
}

export class PasswordResetError extends Error {
  constructor(message, code = "PASSWORD_RESET_ERROR") {
    super(message)
    this.name = "PasswordResetError"
    this.code = code
  }
}

export const validateNewPassword = (password) => {
  const minLength = getPasswordMinLength()
  const value = String(password || "")
  const characterGroups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length

  if (value.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }

  if (value.length > 128) {
    return "Password must be no more than 128 characters long"
  }

  if (characterGroups < 3) {
    return "Password must include at least three of: uppercase, lowercase, number, or symbol"
  }

  return null
}

export const requestPasswordReset = async ({ email, requestedIp }) => {
  const normalizedEmail = normalizeEmail(email)
  const customer = await Customer.findByEmail(normalizedEmail)

  if (!customer) {
    return { accepted: true, emailDelivery: null }
  }

  await Customer.ensureSecurityColumns()
  await PasswordResetToken.ensureTable()

  const cooldownSeconds = getCooldownSeconds()
  const recentlyRequested = await PasswordResetToken.hasRecentRequest(customer.id, cooldownSeconds)

  if (recentlyRequested) {
    return { accepted: true, emailDelivery: null }
  }

  const rawToken = crypto.randomBytes(32).toString("base64url")
  const tokenHash = hashToken(rawToken)
  const ttlMinutes = getTokenTtlMinutes()
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)
  const resetToken = await PasswordResetToken.create({
    customerId: customer.id,
    tokenHash,
    expiresAt,
    requestedIp,
  })
  const emailConfig = getEmailRuntimeConfig()
  const resetUrl = buildResetUrl(rawToken)
  const subject = `Reset your ${emailConfig.appName} password`
  const html = renderPasswordResetEmailHtml({
    appName: emailConfig.appName,
    customerName: customer.username || customer.email,
    resetUrl,
    expiresInMinutes: ttlMinutes,
  })

  let emailDelivery

  try {
    emailDelivery = await sendEmail({
      to: customer.email,
      subject,
      html,
    })
  } catch (error) {
    emailDelivery = {
      status: "failed",
      message: error.message,
    }
  }

  await PasswordResetToken.markEmailResult(resetToken.id, {
    status: emailDelivery.status,
    error: emailDelivery.status === "sent" ? null : emailDelivery.message,
  })

  PasswordResetToken.deleteExpired().catch((error) => {
    console.error("Password reset token cleanup error:", error.message)
  })

  return { accepted: true, emailDelivery }
}

export const validatePasswordResetToken = async (rawToken) => {
  if (!isTokenShapeValid(rawToken)) {
    return false
  }

  const resetToken = await PasswordResetToken.findActiveByHash(hashToken(rawToken))

  return Boolean(resetToken)
}

export const resetPassword = async ({ rawToken, newPassword }) => {
  if (!isTokenShapeValid(rawToken)) {
    throw new PasswordResetError("This password reset link is invalid or has expired", "INVALID_TOKEN")
  }

  const passwordError = validateNewPassword(newPassword)

  if (passwordError) {
    throw new PasswordResetError(passwordError, "INVALID_PASSWORD")
  }

  await Customer.ensureSecurityColumns()
  await PasswordResetToken.ensureTable()

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const resetToken = await PasswordResetToken.findActiveByHash(hashToken(rawToken), { client })

    if (!resetToken) {
      throw new PasswordResetError("This password reset link is invalid or has expired", "INVALID_TOKEN")
    }

    const reusesCurrentPassword = await Customer.verifyPassword(newPassword, resetToken.current_password_hash)

    if (reusesCurrentPassword) {
      throw new PasswordResetError("Choose a password different from your current password", "PASSWORD_REUSED")
    }

    await Customer.updatePassword(resetToken.customer_id, newPassword, { client })
    await PasswordResetToken.invalidateForCustomer(resetToken.customer_id, { client })
    await client.query("COMMIT")

    return true
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
