import Stripe from 'stripe'
import { supabaseSelect, supabaseInsert, supabaseUpdate } from './_lib/supabaseAdmin.js'
import { createChannelInviteLink } from './_lib/inviteLink.js'
import { PLANS } from './_lib/plans.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Add calendar months in UTC, keeping the same day-of-month and clamping when
 * the target month is shorter (31 Jan -> 28/29 Feb).
 */
function addCalendarMonths(start, months) {
  const d = new Date(start)
  const day = d.getUTCDate()
  d.setUTCDate(1) // avoid roll-over while shifting the month
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

// Extend a still-valid subscription, or start fresh. The new period stacks
// on whatever time is left, so renewing early never loses days.
function computeExpiry(current, months) {
  const now = new Date()
  const base = current
    ? new Date(Math.max(new Date(current.expires_at).getTime(), now.getTime()))
    : now
  return addCalendarMonths(base, months)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true })
  }

  const session = event.data.object
  const telegramUserId = session.metadata?.telegram_user_id
  const planId = session.metadata?.planId
  const plan = planId ? PLANS[planId] : null

  if (!telegramUserId || !plan) {
    return res.status(200).json({ received: true, skipped: 'missing metadata' })
  }

  try {
    // Idempotência à prova de reenvio: se já existe um invite_link para esta
    // sessão, este evento já foi totalmente processado.
    const already = await supabaseSelect('invite_links', {
      stripe_session_id: `eq.${session.id}`,
      select: 'id',
      limit: '1',
    })
    if (already.length) {
      return res.status(200).json({ received: true, skipped: 'already processed' })
    }

    const existing = await supabaseSelect('subscriptions', {
      telegram_user_id: `eq.${telegramUserId}`,
      active: 'eq.true',
      select: 'id,expires_at,invite_link_id',
      order: 'expires_at.desc',
      limit: '1',
    })
    const current = existing[0]
    const expiresAt = computeExpiry(current, plan.months)
    const email = session.customer_details?.email ?? ''

    // Generate + record the link first: its invite_links row is the
    // idempotency marker, so a later resend short-circuits above.
    const { id: inviteLinkId } = await createChannelInviteLink({
      planId,
      subscriptionExpiresAt: expiresAt.toISOString(),
      sessionId: session.id,
      email,
    })

    if (current) {
      await supabaseUpdate(
        'subscriptions',
        { id: `eq.${current.id}` },
        {
          plan: planId,
          expires_at: expiresAt.toISOString(),
          invite_link_id: inviteLinkId,
        }
      )
    } else {
      await supabaseInsert('subscriptions', {
        telegram_user_id: Number(telegramUserId),
        telegram_username: session.metadata?.telegram_username ?? null,
        telegram_name: session.metadata?.telegram_name ?? '',
        plan: planId,
        expires_at: expiresAt.toISOString(),
        invite_link_id: inviteLinkId,
        active: true,
      })
    }

    console.log(`[webhook] subscription + link provisioned for ${telegramUserId} (${planId})`)
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[webhook] Failed to provision subscription:', err)
    res.status(500).json({ error: 'Provisioning failed' })
  }
}
