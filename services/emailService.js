import crypto from "crypto"
import fs from "fs"
import net from "net"
import tls from "tls"

const CRLF = "\r\n"
const LOGO_CID = "licentra-logo"
const LOGO_PATH = new URL("../assets/licentra-logo.png", import.meta.url)

let cachedLogo = null

const parseBooleanEnv = (name, fallback) => {
  const value = process.env[name]

  if (typeof value !== "string") {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
}

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const encodeHeader = (value) => {
  const normalized = String(value ?? "")

  if (/^[\x00-\x7F]*$/.test(normalized)) {
    return normalized
  }

  return `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`
}

const normalizeAddress = (address) => {
  return String(address || "").trim()
}

const formatAddress = (address, name) => {
  const normalizedAddress = normalizeAddress(address)

  if (!name) {
    return normalizedAddress
  }

  return `${encodeHeader(name)} <${normalizedAddress}>`
}

const getEmailConfig = () => {
  const port = Number(process.env.SMTP_PORT || 587)

  return {
    enabled: parseBooleanEnv("EMAIL_ENABLED", true),
    dryRun: parseBooleanEnv("EMAIL_DRY_RUN", false),
    host: process.env.SMTP_HOST?.trim(),
    port: Number.isFinite(port) ? port : 587,
    secure: parseBooleanEnv("SMTP_SECURE", false),
    requireTls: parseBooleanEnv("SMTP_REQUIRE_TLS", port === 587),
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASS,
    rejectUnauthorized: parseBooleanEnv("SMTP_TLS_REJECT_UNAUTHORIZED", true),
    fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim(),
    fromName: process.env.EMAIL_FROM_NAME?.trim() || process.env.EMAIL_APP_NAME?.trim() || "Licentra",
    replyTo: process.env.EMAIL_REPLY_TO?.trim(),
    appName: process.env.EMAIL_APP_NAME?.trim() || "Licentra",
    baseUrl: process.env.EMAIL_BASE_URL?.trim() || "http://localhost:5173",
    timeoutMs: Number(process.env.SMTP_TIMEOUT_MS) || 10000,
  }
}

const createResponseReader = (socket) => {
  let buffer = ""

  return () =>
    new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off("data", onData)
        socket.off("error", onError)
        socket.off("timeout", onTimeout)
      }

      const tryResolve = () => {
        const lines = buffer.split(/\r?\n/)
        const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line))

        if (completeIndex === -1) {
          return
        }

        const responseLines = lines.slice(0, completeIndex + 1).filter(Boolean)
        buffer = lines.slice(completeIndex + 1).join(CRLF)
        cleanup()

        const lastLine = responseLines[responseLines.length - 1] || ""
        resolve({
          code: Number(lastLine.slice(0, 3)),
          message: responseLines.join("\n"),
        })
      }

      const onData = (chunk) => {
        buffer += chunk.toString("utf8")
        tryResolve()
      }

      const onError = (error) => {
        cleanup()
        reject(error)
      }

      const onTimeout = () => {
        cleanup()
        reject(new Error("SMTP response timed out"))
      }

      socket.on("data", onData)
      socket.on("error", onError)
      socket.on("timeout", onTimeout)
      tryResolve()
    })
}

const connectSocket = ({ host, port, secure, rejectUnauthorized, timeoutMs }) => {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized })
      : net.connect({ host, port })

    const event = secure ? "secureConnect" : "connect"

    const cleanup = () => {
      socket.off(event, onConnect)
      socket.off("error", onError)
      socket.off("timeout", onTimeout)
    }

    const onConnect = () => {
      cleanup()
      socket.setTimeout(timeoutMs)
      resolve(socket)
    }

    const onError = (error) => {
      cleanup()
      reject(error)
    }

    const onTimeout = () => {
      cleanup()
      socket.destroy()
      reject(new Error("SMTP connection timed out"))
    }

    socket.setTimeout(timeoutMs)
    socket.once(event, onConnect)
    socket.once("error", onError)
    socket.once("timeout", onTimeout)
  })
}

const assertCode = (response, expectedCodes, command) => {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP ${command} failed: ${response.message}`)
  }
}

const sendCommand = async (socket, readResponse, command, expectedCodes, commandLabel = command) => {
  socket.write(`${command}${CRLF}`)
  const response = await readResponse()
  assertCode(response, expectedCodes, commandLabel)

  return response
}

const upgradeToTls = (socket, { host, rejectUnauthorized, timeoutMs }) => {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: host,
      rejectUnauthorized,
    })

    secureSocket.once("secureConnect", () => {
      secureSocket.setTimeout(timeoutMs)
      resolve(secureSocket)
    })
    secureSocket.once("error", reject)
  })
}

const dotStuff = (message) => {
  return message
    .replace(/\r?\n/g, CRLF)
    .split(CRLF)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF)
}

const getPlainText = (html) => {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const getInlineLogo = () => {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(LOGO_PATH)
  }

  return {
    cid: LOGO_CID,
    filename: "licentra-logo.png",
    contentType: "image/png",
    content: cachedLogo,
  }
}

const wrapBase64 = (value) => {
  return value.match(/.{1,76}/g)?.join(CRLF) || ""
}

export const renderLicenseEmailHtml = ({
  appName,
  title,
  message,
  productName,
  customerName,
  licenseKey,
  expirationDate,
  actionUrl,
  actionLabel = "Open portal",
}) => {
  const paragraphs = String(message || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const messageHasGreeting = /^(dear|hello|hi)\b/i.test(paragraphs[0] || "")
  const buttonLabel = licenseKey ? "Open portal to copy key" : actionLabel

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#0b0f19;font-family:Arial,Helvetica,sans-serif;color:#f4f7ff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(title)} from ${escapeHtml(appName)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0f19;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#151925;border-radius:12px;overflow:hidden;border:1px solid #303958;box-shadow:0 16px 48px rgba(0,0,0,0.36);">
            <tr>
              <td style="background:#151925;padding:24px 30px 18px;color:#ffffff;border-bottom:3px solid #6579f4;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="64" valign="middle" style="background:#111522;border:1px solid #303958;border-radius:12px;text-align:center;">
                      <img src="cid:${LOGO_CID}" width="54" height="54" alt="L" style="display:block;width:54px;height:54px;margin:4px;border:0;border-radius:10px;color:#45c7d8;font-size:24px;font-weight:800;line-height:54px;text-align:center;">
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <div style="font-size:19px;line-height:1.2;font-weight:800;color:#ffffff;">${escapeHtml(appName)}</div>
                      <div style="margin-top:5px;font-size:11px;line-height:1.2;letter-spacing:0.12em;text-transform:uppercase;color:#45c7d8;">License management</div>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:22px 0 4px;font-size:26px;line-height:1.28;font-weight:750;color:#ffffff;">${escapeHtml(title)}</h1>
                <div style="width:52px;height:3px;margin-top:14px;background:#45c7d8;border-radius:3px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;background:#151925;">
                ${
                  messageHasGreeting
                    ? ""
                    : `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#f4f7ff;font-weight:700;">Hello ${escapeHtml(customerName || "Customer")},</p>`
                }
                ${paragraphs
                  .map(
                    (paragraph) =>
                      `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c6cde0;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
                  )
                  .join("")}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border:1px solid #303958;border-radius:10px;overflow:hidden;background:#1b2131;">
                  <tr>
                    <td style="padding:15px 17px;background:#20273a;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#8e9ab6;">Product</td>
                    <td style="padding:15px 17px;background:#20273a;font-size:14px;font-weight:700;color:#f4f7ff;text-align:right;">${escapeHtml(productName || "Product")}</td>
                  </tr>
                  <tr>
                    <td style="padding:15px 17px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#8e9ab6;border-top:1px solid #303958;">Expiration</td>
                    <td style="padding:15px 17px;font-size:14px;font-weight:700;color:#f4f7ff;text-align:right;border-top:1px solid #303958;">${escapeHtml(expirationDate || "N/A")}</td>
                  </tr>
                </table>
                ${
                  licenseKey
                    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#111522;border:1px solid #6579f4;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:15px 17px 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#45c7d8;font-weight:700;">License key</td>
                    <td align="right" style="padding:11px 13px 6px;">
                      <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#6579f4;color:#ffffff;text-decoration:none;border-radius:6px;padding:8px 11px;font-weight:700;font-size:11px;">Copy in portal</a>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding:4px 17px 18px;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.6;word-break:break-all;color:#f4f7ff;">${escapeHtml(licenseKey)}</td>
                  </tr>
                </table>`
                    : ""
                }
                <div style="margin-top:26px;text-align:center;">
                  <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#6579f4;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 21px;font-weight:700;font-size:14px;border:1px solid #6579f4;">${escapeHtml(buttonLabel)}</a>
                  <p style="margin:11px 0 0;font-size:12px;line-height:1.5;color:#8e9ab6;">The portal opens the secure copy control.</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px;background:#111522;border-top:1px solid #303958;font-size:12px;line-height:1.6;color:#8e9ab6;">
                <strong style="color:#45c7d8;">Security notice:</strong> Keep your license key private and do not share it with unauthorized users.<br>
                This automated email was sent by ${escapeHtml(appName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export const renderPasswordResetEmailHtml = ({
  appName,
  customerName,
  resetUrl,
  expiresInMinutes,
}) => {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your ${escapeHtml(appName)} password</title>
  </head>
  <body style="margin:0;background:#0b0f19;font-family:Arial,Helvetica,sans-serif;color:#f4f7ff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Use this secure, one-time link to reset your password.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0f19;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#151925;border-radius:12px;overflow:hidden;border:1px solid #303958;box-shadow:0 16px 48px rgba(0,0,0,0.36);">
            <tr>
              <td style="background:#151925;padding:24px 30px 18px;color:#ffffff;border-bottom:3px solid #6579f4;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="64" valign="middle" style="background:#111522;border:1px solid #303958;border-radius:12px;text-align:center;">
                      <img src="cid:${LOGO_CID}" width="54" height="54" alt="L" style="display:block;width:54px;height:54px;margin:4px;border:0;border-radius:10px;color:#45c7d8;font-size:24px;font-weight:800;line-height:54px;text-align:center;">
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <div style="font-size:19px;line-height:1.2;font-weight:800;color:#ffffff;">${escapeHtml(appName)}</div>
                      <div style="margin-top:5px;font-size:11px;line-height:1.2;letter-spacing:0.12em;text-transform:uppercase;color:#45c7d8;">Account security</div>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:22px 0 4px;font-size:26px;line-height:1.28;font-weight:750;color:#ffffff;">Reset your password</h1>
                <div style="width:52px;height:3px;margin-top:14px;background:#45c7d8;border-radius:3px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;background:#151925;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#f4f7ff;font-weight:700;">Hello ${escapeHtml(customerName || "Customer")},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c6cde0;">We received a request to reset the password for your ${escapeHtml(appName)} account.</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#c6cde0;">Use the secure button below. This link can be used once and expires in ${escapeHtml(expiresInMinutes)} minutes.</p>
                <div style="margin:24px 0;text-align:center;">
                  <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#6579f4;color:#ffffff;text-decoration:none;border-radius:8px;padding:14px 24px;font-weight:700;font-size:14px;border:1px solid #6579f4;">Reset password securely</a>
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#111522;border:1px solid #303958;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:14px 17px 7px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#45c7d8;font-weight:700;">Secure link</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 17px 16px;font-size:12px;line-height:1.55;word-break:break-all;color:#aeb9d2;">${escapeHtml(resetUrl)}</td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8e9ab6;">If you did not request a password reset, ignore this email. Your current password will remain unchanged.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px;background:#111522;border-top:1px solid #303958;font-size:12px;line-height:1.6;color:#8e9ab6;">
                <strong style="color:#45c7d8;">Security notice:</strong> Never forward this email or share the reset link.<br>
                This automated email was sent by ${escapeHtml(appName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export const renderAccountActivationEmailHtml = ({
  appName,
  customerName,
  activationUrl,
  expiresInHours,
}) => {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Activate your ${escapeHtml(appName)} account</title>
  </head>
  <body style="margin:0;background:#0b0f19;font-family:Arial,Helvetica,sans-serif;color:#f4f7ff;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Confirm your email address to activate your account.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0f19;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#151925;border-radius:12px;overflow:hidden;border:1px solid #303958;box-shadow:0 16px 48px rgba(0,0,0,0.36);">
            <tr>
              <td style="background:#151925;padding:24px 30px 18px;color:#ffffff;border-bottom:3px solid #6579f4;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="64" valign="middle" style="background:#111522;border:1px solid #303958;border-radius:12px;text-align:center;">
                      <img src="cid:${LOGO_CID}" width="54" height="54" alt="L" style="display:block;width:54px;height:54px;margin:4px;border:0;border-radius:10px;color:#45c7d8;font-size:24px;font-weight:800;line-height:54px;text-align:center;">
                    </td>
                    <td valign="middle" style="padding-left:14px;">
                      <div style="font-size:19px;line-height:1.2;font-weight:800;color:#ffffff;">${escapeHtml(appName)}</div>
                      <div style="margin-top:5px;font-size:11px;line-height:1.2;letter-spacing:0.12em;text-transform:uppercase;color:#45c7d8;">Account activation</div>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:22px 0 4px;font-size:26px;line-height:1.28;font-weight:750;color:#ffffff;">Activate your account</h1>
                <div style="width:52px;height:3px;margin-top:14px;background:#45c7d8;border-radius:3px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;background:#151925;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#f4f7ff;font-weight:700;">Hello ${escapeHtml(customerName || "Customer")},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#c6cde0;">Your ${escapeHtml(appName)} account has been created. Confirm this email address to activate your account and access the portal.</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#c6cde0;">Use the secure button below. This activation link can be used once and expires in ${escapeHtml(expiresInHours)} hours.</p>
                <div style="margin:24px 0;text-align:center;">
                  <a href="${escapeHtml(activationUrl)}" style="display:inline-block;background:#6579f4;color:#ffffff;text-decoration:none;border-radius:8px;padding:14px 24px;font-weight:700;font-size:14px;border:1px solid #6579f4;">Activate account</a>
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#111522;border:1px solid #303958;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:14px 17px 7px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#45c7d8;font-weight:700;">Secure activation link</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 17px 16px;font-size:12px;line-height:1.55;word-break:break-all;color:#aeb9d2;">${escapeHtml(activationUrl)}</td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8e9ab6;">If you did not create this account, ignore this email. The account cannot be used until the email address is confirmed.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px;background:#111522;border-top:1px solid #303958;font-size:12px;line-height:1.6;color:#8e9ab6;">
                <strong style="color:#45c7d8;">Security notice:</strong> Never forward this email or share the activation link.<br>
                This automated email was sent by ${escapeHtml(appName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

const buildMimeMessage = ({ from, replyTo, to, subject, text, html, inlineImage }) => {
  const relatedBoundary = `licentra-related-${crypto.randomUUID()}`
  const alternativeBoundary = `licentra-alternative-${crypto.randomUUID()}`

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "X-Mailer: Licentra Notification Service",
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${alternativeBoundary}`,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${relatedBoundary}`,
    `Content-Type: ${inlineImage.contentType}; name="${inlineImage.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${inlineImage.cid}>`,
    `Content-Location: ${inlineImage.filename}`,
    `Content-Disposition: inline; filename="${inlineImage.filename}"`,
    "",
    wrapBase64(inlineImage.content.toString("base64")),
    "",
    `--${relatedBoundary}--`,
    "",
    `--${alternativeBoundary}--`,
    "",
  ]
    .filter((line) => line !== null)
    .join(CRLF)
}

export const sendEmail = async ({ to, subject, html, text }) => {
  const config = getEmailConfig()
  const recipient = normalizeAddress(to)

  if (!config.enabled) {
    return { status: "disabled", message: "Email delivery is disabled" }
  }

  if (!recipient) {
    return { status: "skipped", message: "Recipient email is missing" }
  }

  if (config.dryRun) {
    console.log("Email dry run", { to: recipient, subject })
    return { status: "dry_run", message: "Email dry run enabled" }
  }

  if (!config.host || !config.fromAddress) {
    return { status: "skipped", message: "SMTP_HOST and EMAIL_FROM_ADDRESS are required" }
  }

  const from = formatAddress(config.fromAddress, config.fromName)
  const replyTo = config.replyTo ? formatAddress(config.replyTo) : null
  const message = buildMimeMessage({
    from,
    replyTo,
    to: recipient,
    subject,
    text: text || getPlainText(html),
    html,
    inlineImage: getInlineLogo(),
  })

  let socket = await connectSocket(config)
  let readResponse = createResponseReader(socket)

  try {
    assertCode(await readResponse(), [220], "connect")
    await sendCommand(socket, readResponse, `EHLO ${config.appName.replace(/\s+/g, "-").toLowerCase()}.local`, [250])

    if (!config.secure && config.requireTls) {
      await sendCommand(socket, readResponse, "STARTTLS", [220])
      socket = await upgradeToTls(socket, config)
      readResponse = createResponseReader(socket)
      await sendCommand(socket, readResponse, `EHLO ${config.appName.replace(/\s+/g, "-").toLowerCase()}.local`, [250])
    }

    if (config.user && config.pass) {
      await sendCommand(socket, readResponse, "AUTH LOGIN", [334])
      await sendCommand(socket, readResponse, Buffer.from(config.user).toString("base64"), [334], "AUTH username")
      await sendCommand(socket, readResponse, Buffer.from(config.pass).toString("base64"), [235], "AUTH password")
    }

    await sendCommand(socket, readResponse, `MAIL FROM:<${config.fromAddress}>`, [250])
    await sendCommand(socket, readResponse, `RCPT TO:<${recipient}>`, [250, 251])
    await sendCommand(socket, readResponse, "DATA", [354])
    socket.write(`${dotStuff(message)}${CRLF}.${CRLF}`)
    assertCode(await readResponse(), [250], "DATA body")
    await sendCommand(socket, readResponse, "QUIT", [221])

    return { status: "sent", message: "Email sent" }
  } finally {
    socket.end()
  }
}

export const getEmailRuntimeConfig = () => getEmailConfig()
