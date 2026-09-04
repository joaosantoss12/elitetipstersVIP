import { verifySession } from './_lib/session.js'
import { supabaseSelect } from './_lib/supabaseAdmin.js'
import { LINK_TTL_DAYS } from './_lib/inviteLink.js'

const LINK_TTL_MS = LINK_TTL_DAYS * 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(200).json({ kind: 'logged_out' })
  }

  try {
    const subs = await supabaseSelect('subscriptions', {
      telegram_user_id: `eq.${session.id}`,
      active: 'eq.true',
      select: 'id,plan,expires_at,invite_link_id',
      order: 'expires_at.desc',
      limit: '1',
    })

    const sub = subs[0]
    if (!sub) {
      return res.status(200).json({ kind: 'none' })
    }

    if (!sub.invite_link_id) {
      return res.status(200).json({ kind: 'pending', plan: sub.plan, expiresAt: sub.expires_at })
    }

    const links = await supabaseSelect('invite_links', {
      id: `eq.${sub.invite_link_id}`,
      select: 'link,created_at,used_at',
    })
    const rec = links[0]

    // A usable link is one already consumed (they're in the group — reopening
    // it just returns them) or still within its single-use window. An
    // unused, expired link is treated as missing so the UI offers to regenerate.
    const usable =
      rec &&
      (rec.used_at !== null || Date.now() - new Date(rec.created_at).getTime() < LINK_TTL_MS)

    if (!usable) {
      return res.status(200).json({ kind: 'pending', plan: sub.plan, expiresAt: sub.expires_at })
    }

    res.status(200).json({
      kind: 'ready',
      plan: sub.plan,
      expiresAt: sub.expires_at,
      telegramLink: rec.link,
    })
  } catch (err) {
    console.error('subscription-status failed:', err)
    res.status(200).json({ kind: 'none' })
  }
}
