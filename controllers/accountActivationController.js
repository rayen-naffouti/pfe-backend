import {
  AccountActivationError,
  activateAccount,
  requestAccountActivationByEmail,
  validateAccountActivationToken,
} from "../services/accountActivationService.js"

const GENERIC_RESEND_MESSAGE = "If the account exists and is not active, a new activation link has been sent"
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const requestBuckets = new Map()

const getRateLimitConfig = () => ({
  maxRequests: Math.max(Number(process.env.ACCOUNT_ACTIVATION_RATE_LIMIT_MAX) || 5, 1),
  windowMs: Math.max(Number(process.env.ACCOUNT_ACTIVATION_RATE_LIMIT_WINDOW_MINUTES) || 15, 1) * 60_000,
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

export const resendAccountActivation = async (req, res) => {
  const startedAt = Date.now()

  try {
    res.set("Cache-Control", "no-store")

    const email = String(req.body?.email || "").trim().toLowerCase()

    if (!EMAIL_REGEX.test(email)) {
      await waitForMinimumDuration(startedAt)
      return res.status(202).json({ message: GENERIC_RESEND_MESSAGE })
    }

    if (!consumeRequestAllowance(req.ip)) {
      await waitForMinimumDuration(startedAt)
      return res.status(429).json({
        error: "Too many requests",
        message: "Too many activation attempts. Please wait before trying again",
      })
    }

    const result = await requestAccountActivationByEmail({
      email,
      requestedIp: req.ip,
    })

    if (result.emailDelivery && result.emailDelivery.status !== "sent") {
      console.error("Account activation email delivery error:", result.emailDelivery.message)
    }

    await waitForMinimumDuration(startedAt)
    res.status(202).json({ message: GENERIC_RESEND_MESSAGE })
  } catch (error) {
    console.error("Resend account activation error:", error)
    await waitForMinimumDuration(startedAt)
    res.status(202).json({ message: GENERIC_RESEND_MESSAGE })
  }
}

export const validateActivationToken = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store")
    res.set("Referrer-Policy", "no-referrer")

    const valid = await validateAccountActivationToken(req.query.token)

    if (!valid) {
      return res.status(400).json({
        valid: false,
        message: "This activation link is invalid or has expired",
      })
    }

    res.json({ valid: true })
  } catch (error) {
    console.error("Validate account activation token error:", error)
    res.status(500).json({
      valid: false,
      message: "Unable to validate the activation link",
    })
  }
}

export const completeAccountActivation = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store")
    res.set("Referrer-Policy", "no-referrer")

    await activateAccount({
      rawToken: req.body?.token,
    })

    res.json({
      message: "Account activated successfully. You can now sign in",
    })
  } catch (error) {
    if (error instanceof AccountActivationError) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
      })
    }

    console.error("Complete account activation error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Unable to activate the account",
    })
  }
}
