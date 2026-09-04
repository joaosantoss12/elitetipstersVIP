import Stripe from 'stripe'
import { verifySession } from './_lib/session.js'
import { PLANS } from './_lib/plans.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const planId = typeof req.body?.planId === 'string' ? req.body.planId : null
  const plan = planId ? PLANS[planId] : null
  if (!plan) {
    return res.status(400).json({ error: 'Plano inválido' })
  }

  // Telegram login is mandatory — nobody buys without it. This is the real
  // gate; the UI also blocks the button, but the purchase itself is refused
  // here so an unauthenticated request can never create a checkout session.
  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(401).json({ error: 'Tens de iniciar sessão com o Telegram antes de comprar.' })
  }

  try {
    const metadata = {
      planId,
      telegram_user_id: String(session.id),
      telegram_name: session.first_name,
    }
    if (session.username) metadata.telegram_username = session.username

    const origin = req.headers.origin || `https://${req.headers.host}`

    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'mb_way', 'multibanco', 'klarna'],
      billing_address_collection: 'auto',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: plan.amount,
            product_data: { name: plan.name },
          },
          quantity: 1,
        },
      ],
      metadata,
      success_url: `${origin}/?success=1`,
      cancel_url: `${origin}/#pricing`,
    })

    res.status(200).json({ url: checkout.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    res.status(500).json({ error: 'Erro ao criar sessão de pagamento' })
  }
}
