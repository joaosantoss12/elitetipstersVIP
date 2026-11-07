import {
  OAUTH_COOKIE,
  oauthCookieHeader,
  oauthRedirectUri,
  requestOrigin,
  verifyTelegramIdToken,
} from './_lib/telegramAuth.js'
import { sessionCookieHeader } from './_lib/session.js'

function readCookie(value) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

async function exchangeCode(code, verifier, redirectUri) {
  const clientId = process.env.TELEGRAM_CLIENT_ID
  const basic = Buffer.from(`${clientId}:${process.env.TELEGRAM_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) {
    console.error('Telegram token exchange failed:', res.status, await res.text())
    return null
  }
  const data = await res.json()
  return typeof data.id_token === 'string' ? data.id_token : null
}

export default async function handler(req, res) {
  const origin = requestOrigin(req)
  const clearOAuth = oauthCookieHeader('', 0)
  const fail = () => {
    res.setHeader('Set-Cookie', clearOAuth)
    return res.redirect(302, `${origin}/?tg_login=erro#gate`)
  }

  // Backing out on Telegram's page is not a failure: just go back to the gate.
  if (req.query.error === 'access_denied') {
    res.setHeader('Set-Cookie', clearOAuth)
    return res.redirect(302, `${origin}/#gate`)
  }

  const saved = readCookie(req.cookies?.[OAUTH_COOKIE])
  const code = typeof req.query.code === 'string' ? req.query.code : null
  if (!code || !saved?.verifier || !saved.state || req.query.state !== saved.state) {
    console.error('Telegram callback rejected: missing code or state mismatch')
    return fail()
  }

  const idToken = await exchangeCode(code, saved.verifier, oauthRedirectUri(origin))
  const auth = idToken && (await verifyTelegramIdToken(idToken, process.env.TELEGRAM_CLIENT_ID))
  if (!auth) return fail()

  res.setHeader('Set-Cookie', [sessionCookieHeader(auth), clearOAuth])
  return res.redirect(302, `${origin}/#gate`)
}
