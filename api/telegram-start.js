import { createHash, randomBytes } from 'crypto'
import { oauthCookieHeader, oauthRedirectUri, requestOrigin } from './_lib/telegramAuth.js'

/**
 * Same-tab login (authorization code + PKCE), used on mobile: there the popup
 * of telegram-login.js can be reported as closed before it returns a result,
 * and the user ends up with `popup_closed` and no way to log in.
 */
export default function handler(req, res) {
  const origin = requestOrigin(req)
  const clientId = process.env.TELEGRAM_CLIENT_ID
  if (!clientId || !process.env.TELEGRAM_CLIENT_SECRET) {
    console.error('Telegram redirect login: missing TELEGRAM_CLIENT_ID/TELEGRAM_CLIENT_SECRET')
    return res.redirect(302, `${origin}/?tg_login=erro#gate`)
  }

  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: oauthRedirectUri(origin),
    scope: 'openid profile telegram:bot_access',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })

  const saved = Buffer.from(JSON.stringify({ state, verifier })).toString('base64url')
  res.setHeader('Set-Cookie', oauthCookieHeader(saved, 60 * 10))
  return res.redirect(302, `https://oauth.telegram.org/auth?${params}`)
}
