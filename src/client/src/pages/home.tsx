import { NavLink, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'

type IconName = 'lock' | 'ephemeral' | 'shield' | 'group' | 'eye' | 'audit' | 'arrow' | 'check'

function Icon({ name }: { name: IconName }) {
  const props = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'lock':
      return (
        <svg {...props}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 'ephemeral':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3l8 3v6c0 4.5-3.4 8.6-8 9-4.6-.4-8-4.5-8-9V6l8-3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'group':
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="3.2" />
          <path d="M2.5 19c.6-3 3.2-5 6.5-5s5.9 2 6.5 5" />
          <circle cx="17" cy="8" r="2.6" />
          <path d="M16 14c2.7.2 4.7 1.8 5.3 4.3" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...props}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          <path d="M4 4l16 16" />
        </svg>
      )
    case 'audit':
      return (
        <svg {...props}>
          <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M9 12h6M9 16h6M9 8h3" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...props}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )
    case 'check':
      return (
        <svg {...props}>
          <path d="m5 12 5 5 9-11" />
        </svg>
      )
    default:
      return null
  }
}

function HomePage() {
  const navigate = useNavigate()

  const features = [
    {
      icon: 'lock',
      title: 'End-to-end encryption',
      body: 'Every message is sealed with AES-GCM keys derived per conversation via ECDH. Only your devices can read your chats — not the server, not us.',
    },
    {
      icon: 'shield',
      title: 'Authenticator-based MFA',
      body: 'Protect your account with TOTP authenticator codes (Google Authenticator, 1Password, Authy). No SMS, no phone-number leaks.',
    },
    {
      icon: 'ephemeral',
      title: 'Ephemeral messages',
      body: 'Set a self-destruct timer that deletes messages from every device the moment they are read — leaving no readable trace.',
    },
    {
      icon: 'group',
      title: 'Verified group chats',
      body: 'Invite-only groups with explicit acceptance and per-member encryption keys. Members only see messages from after they joined.',
    },
    {
      icon: 'eye',
      title: 'Zero metadata bleed',
      body: 'Encrypted thread keys, message integrity hashing, and pluggable retention windows keep both content and patterns private.',
    },
    {
      icon: 'audit',
      title: 'Built-in security ops',
      body: 'Tamper-evident audit logs, brute-force detection, and an admin console for monitoring suspicious activity in real time.',
    },
  ] as const

  const steps = [
    { n: '01', title: 'Create your account', body: 'Sign up with email, verify with a one-time code, and optionally turn on authenticator MFA.' },
    { n: '02', title: 'Generate your keys', body: 'Your browser generates an RSA + ECDH key pair on first sign-in. Private keys never leave your device.' },
    { n: '03', title: 'Start chatting', body: 'Search a friend by email, send an introduction request, and once accepted, every message is end-to-end encrypted.' },
  ]

  return (
    <div className="lp-shell">
      <header className="lp-nav" role="banner">
        <NavLink to="/" className="lp-brand" aria-label="Shadow Link home">
          <img src="/scslogo.png" alt="" className="lp-brand-logo" />
          <span>Shadow Link</span>
        </NavLink>
        <nav className="lp-nav-links" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#trust">Trust</a>
          <NavLink to="/privacy">Privacy</NavLink>
          <NavLink to="/security">Security</NavLink>
        </nav>
        <div className="lp-nav-cta">
          <NavLink to="/login" className="lp-btn lp-btn--ghost">Sign in</NavLink>
          <NavLink to="/register" className="lp-btn lp-btn--primary">Get started</NavLink>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">
                <Icon name="lock" />
                <span>End-to-end encrypted • zero-knowledge</span>
              </span>
              <h1 id="lp-hero-title">
                Private conversations, <span className="lp-hero-accent">verifiably yours.</span>
              </h1>
              <p className="lp-hero-sub">
                Shadow Link is an end-to-end encrypted messenger built for people who need real privacy.
                Per-conversation keys, ephemeral messages, authenticator MFA, and tamper-evident audit logs —
                all in a browser, no extensions required.
              </p>
              <div className="lp-hero-actions">
                <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => navigate('/register')}>
                  Create free account <Icon name="arrow" />
                </button>
                <button type="button" className="lp-btn lp-btn--ghost lp-btn--lg" onClick={() => navigate('/login')}>
                  Sign in
                </button>
              </div>
              <ul className="lp-hero-checks">
                <li><Icon name="check" /> No phone number required</li>
                <li><Icon name="check" /> Free for personal use</li>
                <li><Icon name="check" /> Open security model</li>
              </ul>
            </div>

            <div className="lp-hero-visual" aria-hidden="true">
              <div className="lp-mock">
                <div className="lp-mock-bar">
                  <span className="lp-mock-dot" /><span className="lp-mock-dot" /><span className="lp-mock-dot" />
                  <span className="lp-mock-title">Shadow Link — Maya & Ren</span>
                </div>
                <div className="lp-mock-body">
                  <div className="lp-bubble lp-bubble--in">
                    Hey, can you review the security report tonight?
                  </div>
                  <div className="lp-bubble lp-bubble--out">
                    Yes — opening it now. End-to-end encrypted, right?
                  </div>
                  <div className="lp-bubble lp-bubble--in">
                    <Icon name="lock" /> Always. Auto-deletes after 1 hour.
                  </div>
                  <div className="lp-mock-meta"><Icon name="ephemeral" /> Ephemeral · 60 min</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="lp-section" aria-labelledby="lp-features-title">
          <div className="lp-section-head">
            <span className="lp-eyebrow lp-eyebrow--center">What you get</span>
            <h2 id="lp-features-title">Security primitives, friendly defaults</h2>
            <p>
              Modern cryptography wrapped in a familiar messenger. No setup wizards,
              no surprise data collection — just chat that respects you.
            </p>
          </div>
          <div className="lp-feature-grid">
            {features.map((f) => (
              <article key={f.title} className="lp-feature">
                <div className="lp-feature-icon"><Icon name={f.icon} /></div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="lp-section lp-section--alt" aria-labelledby="lp-how-title">
          <div className="lp-section-head">
            <span className="lp-eyebrow lp-eyebrow--center">How it works</span>
            <h2 id="lp-how-title">Three steps from sign-up to secure chat</h2>
          </div>
          <ol className="lp-steps">
            {steps.map((s) => (
              <li key={s.n} className="lp-step">
                <span className="lp-step-num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Trust */}
        <section id="trust" className="lp-section" aria-labelledby="lp-trust-title">
          <div className="lp-trust">
            <div className="lp-trust-copy">
              <span className="lp-eyebrow"><Icon name="shield" /> Trust model</span>
              <h2 id="lp-trust-title">We can't read your messages — by design.</h2>
              <p>
                Thread keys are encrypted per recipient using ECDH-derived shared secrets.
                Your private keys live only in your browser. The server stores ciphertext,
                authentication tags, and integrity hashes — never plaintext.
              </p>
              <ul className="lp-trust-list">
                <li><Icon name="check" /> AES-256-GCM for messages and thread keys</li>
                <li><Icon name="check" /> ECDH P-256 for per-conversation key agreement</li>
                <li><Icon name="check" /> SHA-256 integrity hashing on every message</li>
                <li><Icon name="check" /> Tamper-evident audit logging on the server</li>
              </ul>
              <div className="lp-trust-cta">
                <NavLink to="/security" className="lp-btn lp-btn--primary">Read the security model</NavLink>
                <NavLink to="/privacy" className="lp-btn lp-btn--ghost">Privacy policy</NavLink>
              </div>
            </div>
            <aside className="lp-trust-card" aria-label="Security at a glance">
              <h3>At a glance</h3>
              <dl>
                <div><dt>Transport</dt><dd>TLS 1.3</dd></div>
                <div><dt>At rest</dt><dd>AES-256-GCM ciphertext only</dd></div>
                <div><dt>Key exchange</dt><dd>ECDH P-256</dd></div>
                <div><dt>MFA</dt><dd>TOTP (RFC 6238)</dd></div>
                <div><dt>Integrity</dt><dd>SHA-256 per message</dd></div>
              </dl>
            </aside>
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-cta-band" aria-labelledby="lp-cta-title">
          <div className="lp-cta-inner">
            <h2 id="lp-cta-title">Ready to chat without compromise?</h2>
            <p>Create your account in under a minute. No phone number, no card details.</p>
            <div className="lp-hero-actions">
              <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => navigate('/register')}>
                Get started free <Icon name="arrow" />
              </button>
              <NavLink to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">I already have an account</NavLink>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default HomePage
