import {
  PasswordResetError,
  requestPasswordReset,
  resetPassword,
  validatePasswordResetToken,
} from "../services/passwordResetService.js"

const GENERIC_REQUEST_MESSAGE = "If an account exists for that email, a secure reset link has been sent"
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const requestBuckets = new Map()

const getRateLimitConfig = () => ({
  maxRequests: Math.max(Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX) || 5, 1),
  windowMs: Math.max(Number(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES) || 15, 1) * 60_000,
})

const consumeRequestAllowance = (ip) => {
  const now = Date.now()
  const { maxRequests, windowMs } = getRateLimitConfig()
  const key = ip || "unknown"
  const current = requestBuckets.get(key)

  if (!current || current.expiresAt <= now) {
    requestBuckets.set(key, { count: 1, expiresAt: now + windowMs })
    return true
  }

  if (current.count >= maxRequests) {
    return false
  }

  current.count += 1
  return true
}

const waitForMinimumDuration = async (startedAt, minimumMs = 350) => {
  const remainingMs = minimumMs - (Date.now() - startedAt)

  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs))
  }
}

export const forgotPassword = async (req, res) => {
  const startedAt = Date.now()

  try {
    res.set("Cache-Control", "no-store")

    const email = String(req.body?.email || "").trim().toLowerCase()

    if (!EMAIL_REGEX.test(email)) {
      await waitForMinimumDuration(startedAt)
      return res.status(202).json({ message: GENERIC_REQUEST_MESSAGE })
    }

    if (!consumeRequestAllowance(req.ip)) {
      await waitForMinimumDuration(startedAt)
      return res.status(429).json({
        error: "Too many requests",
        message: "Too many reset attempts. Please wait before trying again",
      })
    }

    const result = await requestPasswordReset({
      email,
      requestedIp: req.ip,
    })

    if (result.emailDelivery && result.emailDelivery.status !== "sent") {
      console.error("Password reset email delivery error:", result.emailDelivery.message)
    }

    await waitForMinimumDuration(startedAt)
    res.status(202).json({ message: GENERIC_REQUEST_MESSAGE })
  } catch (error) {
    console.error("Forgot password error:", error)
    await waitForMinimumDuration(startedAt)
    res.status(202).json({ message: GENERIC_REQUEST_MESSAGE })
  }
}

export const validateResetToken = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store")
    res.set("Referrer-Policy", "no-referrer")

    const valid = await validatePasswordResetToken(req.query.token)

    if (!valid) {
      return res.status(400).json({
        valid: false,
        message: "This password reset link is invalid or has expired",
      })
    }

    res.json({ valid: true })
  } catch (error) {
    console.error("Validate password reset token error:", error)
    res.status(500).json({
      valid: false,
      message: "Unable to validate the password reset link",
    })
  }
}

export const completePasswordReset = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store")
    res.set("Referrer-Policy", "no-referrer")

    const { token, password } = req.body || {}

    await resetPassword({
      rawToken: token,
      newPassword: password,
    })

    res.json({
      message: "Password reset successfully. Sign in with your new password",
    })
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
      })
    }

    console.error("Complete password reset error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Unable to reset the password",
    })
  }
}
