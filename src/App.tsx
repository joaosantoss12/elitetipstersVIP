import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const TELEGRAM_CLIENT_ID = import.meta.env.VITE_TELEGRAM_CLIENT_ID as string

type TgUser = {
  username?: string
  first_name: string
  photo_url?: string
}

type TelegramAuthData = { id_token?: string; error?: string }

declare global {
  interface Window {
    onTelegramAuth?: (data: TelegramAuthData) => void
  }
}

type PlanId = 'monthly' | 'quarterly' | 'yearly'

type SubStatus =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'logged_out' }
  | { kind: 'pending'; plan: string; expiresAt: string }
  | { kind: 'ready'; plan: string; expiresAt: string; telegramLink: string }

const PLANS: { id: PlanId; label: string; price: string; per: string; save?: string; featured?: boolean; features: string[] }[] = [
  {
    id: 'monthly',
    label: '1 Mês',
    price: '24,59',
    per: '/mês',
    features: ['Acesso total ao grupo VIP', 'Picks e análises diárias', 'Suporte direto no Telegram'],
  },
  {
    id: 'quarterly',
    label: '3 Meses',
    price: '61,49',
    per: '/3 meses',
    save: 'Poupa ~17%',
    featured: true,
    features: ['Acesso total ao grupo VIP', 'Picks e análises diárias', 'Suporte direto no Telegram'],
  },
  {
    id: 'yearly',
    label: '1 Ano',
    price: '245,99',
    per: '/ano',
    save: 'Poupa ~17%',
    features: ['Acesso total ao grupo VIP', 'Picks e análises diárias', 'Suporte direto no Telegram'],
  },
]

const PLAN_LABELS: Record<string, string> = {
  monthly: '1 Mês',
  quarterly: '3 Meses',
  yearly: '1 Ano',
}

const FAQS = [
  {
    q: 'Como funciona o acesso ao grupo VIP?',
    a: 'Inicias sessão com o teu Telegram, escolhes um plano e pagas. Assim que o pagamento é confirmado, recebes aqui mesmo nesta página um link de convite pessoal e de uso único para o grupo privado.',
  },
  {
    q: 'Porque é obrigatório o login com Telegram?',
    a: 'É através da tua conta de Telegram que identificamos quem és para gerar o teu link de acesso e para o bot poder validar a tua subscrição no grupo.',
  },
  {
    q: 'O que acontece quando o plano expira?',
    a: 'O teu acesso ao grupo é encerrado automaticamente pelo bot na data de expiração. Podes renovar a qualquer momento — se renovares antes de expirar, o tempo que falta soma-se ao novo plano.',
  },
  {
    q: 'O link de acesso não apareceu depois de pagar?',
    a: 'Nesses casos raros, há sempre um botão para gerar o link manualmente assim que o pagamento é confirmado — não precisas de contactar ninguém.',
  },
]

// ── Telegram login widget: injects oauth.telegram.org's script next to a
// button it turns into the login trigger. This site has its own dedicated
// bot (TELEGRAM_CLIENT_ID) — its domain must be registered with @BotFather
// under that bot's Web Login settings for the widget to render.
function TelegramLoginWidget() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const script = document.createElement('script')
    script.src = 'https://oauth.telegram.org/js/telegram-login.js?22'
    script.async = true
    script.setAttribute('data-client-id', TELEGRAM_CLIENT_ID)
    script.setAttribute('data-onauth', 'onTelegramAuth(data)')
    script.setAttribute('data-request-access', 'write')
    el.appendChild(script)
    return () => {
      script.remove()
    }
  }, [])

  return (
    <div ref={containerRef} className="tg-login-widget">
      <button className="tg-auth-button" data-style="shine" type="button">
        Entrar com Telegram
      </button>
    </div>
  )
}

function Navbar({ tgUser, onLogout, status }: { tgUser: TgUser | null; onLogout: () => void; status: SubStatus }) {
  return (
    <header className="navbar">
      <div className="nav-inner">
        <div className="logo">
          <span style={{ fontSize: '1.4rem' }}>👑</span>
          <span className="logo-text">Elite Tipsters</span>
        </div>
        {tgUser ? (
          <div className="tg-auth-bar" style={{ margin: 0 }}>
            {tgUser.photo_url && <img className="tg-avatar" src={tgUser.photo_url} alt={tgUser.first_name} referrerPolicy="no-referrer" />}
            <div className="tg-auth-info">
              <span className="tg-auth-name">{tgUser.first_name}</span>
              {tgUser.username && <span className="tg-auth-username">@{tgUser.username}</span>}
            </div>
            {status.kind === 'ready' && (
              <a className="btn-nav" href={status.telegramLink} target="_blank" rel="noopener noreferrer">
                Entrar no Grupo
              </a>
            )}
            <button className="tg-logout-btn" onClick={onLogout} type="button">Sair</button>
          </div>
        ) : (
          <button className="btn-nav" onClick={() => document.getElementById('gate')?.scrollIntoView({ behavior: 'smooth' })} type="button">
            Entrar com Telegram
          </button>
        )}
      </div>
    </header>
  )
}

function SuccessBanner() {
  return (
    <div className="success-page">
      <div className="success-card">
        <div className="success-icon">✓</div>
        <h1>Pagamento confirmado!</h1>
        <p>Obrigado pela tua compra. O teu link de acesso ao grupo VIP aparece a seguir — desce até "O teu acesso" para o veres.</p>
        <a className="btn-primary" href="#gate">Ver o meu acesso</a>
      </div>
    </div>
  )
}

function App() {
  const [tgUser, setTgUser] = useState<TgUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [status, setStatus] = useState<SubStatus>({ kind: 'loading' })
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isSuccess = new URLSearchParams(window.location.search).get('success') === '1'

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription-status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ kind: 'none' })
    }
  }, [])

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram-me')
      const data = await res.json()
      setTgUser(data.loggedIn ? data.user : null)
    } finally {
      setAuthChecked(true)
    }
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    window.onTelegramAuth = async (data: TelegramAuthData) => {
      if (!data.id_token) {
        setError('Login com Telegram falhou. Tenta novamente.')
        return
      }
      const res = await fetch('/api/telegram-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: data.id_token }),
      })
      if (!res.ok) {
        setError('Login com Telegram falhou. Tenta novamente.')
        return
      }
      await refreshAuth()
    }
  }, [refreshAuth])

  const logout = useCallback(async () => {
    await fetch('/api/telegram-logout', { method: 'POST' })
    setTgUser(null)
    setStatus({ kind: 'none' })
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  // Poll while we're waiting for the bot to generate the invite link.
  useEffect(() => {
    if (status.kind === 'pending') {
      pollRef.current = setInterval(refreshStatus, 5000)
      return () => {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
  }, [status.kind, refreshStatus])

  const buyPlan = async (planId: PlanId) => {
    if (!tgUser) {
      document.getElementById('gate')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setLoadingPlan(planId)
    setError('')
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Erro ao processar o pagamento. Tenta novamente.')
      }
    } catch {
      setError('Não foi possível ligar ao servidor. Tenta mais tarde.')
    } finally {
      setLoadingPlan(null)
    }
  }

  const generateLink = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/subscription-link', { method: 'POST' })
      if (res.ok) {
        await refreshStatus()
      } else {
        setError('Não foi possível gerar o link. Tenta novamente ou contacta o suporte.')
      }
    } catch {
      setError('Erro de ligação. Tenta novamente.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="app">
      <Navbar tgUser={tgUser} onLogout={logout} status={status} />

      {isSuccess && <SuccessBanner />}

      {/* ── Telegram notice — profile when logged in, warning otherwise ── */}
      {authChecked && tgUser && !noticeDismissed && (
        <div className="tg-notice tg-notice--ready">
          <div className="tg-notice-row">
            {tgUser.photo_url && (
              <img className="tg-avatar" src={tgUser.photo_url} alt={tgUser.first_name} referrerPolicy="no-referrer" />
            )}
            <div className="tg-notice-info">
              <span className="tg-notice-label">Sessão iniciada</span>
              <span className="tg-auth-name">{tgUser.first_name}</span>
              {tgUser.username && <span className="tg-auth-username">@{tgUser.username}</span>}
            </div>
            <button
              onClick={logout}
              className="tg-notice-close"
              aria-label="Terminar sessão"
              title="Terminar sessão"
              type="button"
            >
              ✕
            </button>
          </div>
          {status.kind === 'ready' && (
            <a className="btn-primary btn-full tg-notice-cta" href={status.telegramLink} target="_blank" rel="noopener noreferrer">
              Entrar no Grupo VIP
            </a>
          )}
          {status.kind === 'none' && (
            <div className="tg-notice-warning">⚠ Sem subscrição ativa</div>
          )}
        </div>
      )}
      {authChecked && !tgUser && !noticeDismissed && (
        <div className="tg-notice tg-notice--warn">
          <button
            onClick={() => setNoticeDismissed(true)}
            className="tg-notice-close"
            aria-label="Fechar"
            type="button"
          >
            ✕
          </button>
          <p className="tg-notice-text">
            ⚠ É <strong>obrigatório</strong> iniciar sessão com o Telegram para comprar.
            Depois de pagares, voltas aqui para receberes o link do grupo.
          </p>
          <div className="tg-notice-widget">
            <TelegramLoginWidget />
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-content">

          <p className="ornament">Grupo Privado · Acesso Exclusivo</p>
          <h1 className="hero-title">O clube VIP do Elite Tipsters</h1>
          <p className="hero-sub">
            Análises desportivas e apostas recomendadas <em>todos os dias</em>, direto no grupo
            privado de Telegram. Entra com a tua conta, escolhe o teu plano, e recebe o acesso
            na hora.
          </p>
          <div className="rule" />
          <div className="hero-actions">
            <a className="btn-primary btn-large" href="#pricing">Ver planos VIP</a>
            <span className="hero-guarantee">Pagamento seguro · Cartão, MB WAY e Multibanco</span>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="section pricing" id="pricing">
        <div className="container">
          <p className="section-tag">Planos</p>
          <h2 className="section-title">Escolhe o teu acesso VIP</h2>
          <p className="section-sub">Sem letras pequenas. Cancela quando quiseres — o acesso simplesmente não renova.</p>
          <div className="pricing-grid">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`plan-card${plan.featured ? ' plan-card--featured' : ''}`}>
                {plan.featured && <span className="plan-badge">Mais popular</span>}
                <span className="plan-name">{plan.label}</span>
                <div>
                  <div className="plan-price">
                    <span className="plan-price-curr">€</span>
                    <span className="plan-price-num">{plan.price}</span>
                  </div>
                  <span className="plan-per">{plan.per}</span>
                </div>
                {plan.save && <span className="plan-save">{plan.save}</span>}
                <ul className="plan-features">
                  {plan.features.map((f) => (
                    <li key={f}><span className="check">✓</span>{f}</li>
                  ))}
                </ul>
                <button
                  className="btn-primary btn-full"
                  onClick={() => buyPlan(plan.id)}
                  disabled={loadingPlan !== null}
                  type="button"
                >
                  {loadingPlan === plan.id ? <span className="spinner" /> : 'Quero este plano'}
                </button>
              </div>
            ))}
          </div>
          {error && <p className="error-msg">{error}</p>}
          <p className="price-secure">🔒 Pagamento processado de forma segura via Stripe</p>
        </div>
      </section>

      {/* ── Credentials ── */}
      <div className="creds">
        <div className="creds-inner">
          <div className="cred"><span className="cred-num">+1.500</span><span className="cred-label">Membros VIP</span></div>
          <span className="cred-diamond">◆</span>
          <div className="cred"><span className="cred-num">Diário</span><span className="cred-label">Análises novas</span></div>
          <span className="cred-diamond">◆</span>
          <div className="cred"><span className="cred-num">100%</span><span className="cred-label">Acesso automático</span></div>
        </div>
      </div>

      {/* ── How it works ── */}
      <section className="section how">
        <div className="container-sm">
          <p className="section-tag">Como funciona</p>
          <h2 className="section-title">Três passos até ao grupo VIP</h2>
          <div className="timeline">
            <div className="tl-step">
              <div className="tl-dot">I</div>
              <div className="tl-body"><h3>Entra com o Telegram</h3><p>Autentica-te com um clique — é assim que sabemos a quem entregar o acesso.</p></div>
            </div>
            <div className="tl-step">
              <div className="tl-dot">II</div>
              <div className="tl-body"><h3>Escolhe o teu plano</h3><p>1 mês, 3 meses ou 1 ano. Paga com cartão, MB WAY ou Multibanco.</p></div>
            </div>
            <div className="tl-step">
              <div className="tl-dot">III</div>
              <div className="tl-body"><h3>Entra no grupo VIP</h3><p>Assim que o pagamento é confirmado, o botão de acesso aparece nesta página.</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="section what">
        <div className="container-sm">
          <p className="section-tag">O que recebes</p>
          <h2 className="section-title">Dentro do grupo VIP</h2>
          <p className="what-sub">Tudo o que precisas para apostar com informação, não com sorte.</p>
          <ul className="what-list">
            <li><span className="check">✓</span> Picks e análises desportivas diárias</li>
            <li><span className="check">✓</span> Justificação completa de cada aposta recomendada</li>
            <li><span className="check">✓</span> Acompanhamento e suporte direto no grupo</li>
            <li><span className="check">✓</span> Acesso imediato e automático após o pagamento</li>
          </ul>
        </div>
      </section>

      {/* ── Telegram gate / access status ── */}
      <section className="section gate" id="gate">
        <div className="container-sm">
          <p className="section-tag">O teu acesso</p>
          <h2 className="section-title">Estado da tua subscrição VIP</h2>

          {status.kind === 'ready' && (
            <div className="gate-card gate-card--ready">
              <div className="gate-icon gate-icon--ready">✓</div>
              <h3 className="gate-title">O teu acesso VIP está pronto!</h3>
              <p className="gate-sub">
                {PLAN_LABELS[status.plan] ?? status.plan} · válido até{' '}
                {new Date(status.expiresAt).toLocaleDateString('pt-PT')}
              </p>
              <a className="btn-primary btn-large" href={status.telegramLink} target="_blank" rel="noopener noreferrer">
                Entrar no Grupo VIP
              </a>
            </div>
          )}

          {status.kind === 'pending' && (
            <div className="gate-card">
              <div className="gate-icon gate-icon--pending"><span className="spinner-gold" /></div>
              <h3 className="gate-title">A preparar o teu acesso...</h3>
              <p className="gate-sub">O pagamento foi confirmado. O link de acesso ao grupo aparece aqui em instantes.</p>
              <button className="btn-nav" onClick={generateLink} disabled={generating} type="button">
                {generating ? 'A gerar...' : 'Gerar link de acesso'}
              </button>
            </div>
          )}

          {(status.kind === 'none' || status.kind === 'loading' || status.kind === 'logged_out') && (
            <div className="gate-card">
              {authChecked && tgUser ? (
                <>
                  <div className="tg-auth-bar">
                    {tgUser.photo_url && <img className="tg-avatar" src={tgUser.photo_url} alt={tgUser.first_name} referrerPolicy="no-referrer" />}
                    <div className="tg-auth-info">
                      <span className="tg-auth-name">{tgUser.first_name}</span>
                      {tgUser.username && <span className="tg-auth-username">@{tgUser.username}</span>}
                    </div>
                  </div>
                  <div className="gate-none-warning">⚠ Sem subscrição ativa</div>
                  <p className="gate-sub" style={{ marginTop: '1rem' }}>Escolhe um plano abaixo para ativar o teu acesso.</p>
                </>
              ) : (
                <>
                  <h3 className="gate-title">Entra com o Telegram</h3>
                  <p className="gate-sub">
                    É obrigatório iniciar sessão com o Telegram para comprar. Depois do pagamento,
                    o link de acesso ao grupo aparece aqui — sem precisares de abrir o Telegram.
                  </p>
                  <TelegramLoginWidget />
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section faq">
        <div className="container-sm">
          <p className="section-tag">Perguntas frequentes</p>
          <h2 className="section-title">Dúvidas comuns</h2>
          <div className="faq-list">
            {FAQS.map((item, i) => (
              <div key={item.q} className={`faq-item${openFaq === i ? ' open' : ''}`}>
                <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)} type="button">
                  {item.q}
                  <span className="faq-icon">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && <div className="faq-answer">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-inner">
          <span className="logo-crest" style={{ fontSize: '2rem' }}>👑</span>
          <p className="footer-disclaimer">
            ⚠️ As análises partilhadas no grupo VIP são de caráter informativo. Apostar pode
            criar dependência. Joga com responsabilidade. +18.
          </p>
          <p className="footer-copy">© {new Date().getFullYear()} Elite Tipsters</p>
        </div>
      </footer>
    </div>
  )
}

export default App
