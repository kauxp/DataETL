import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      toast.error('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'stretch',
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: '0 0 55%',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          opacity: 0.4,
        }} />

        {/* Glow orb */}
        <div style={{
          position: 'absolute', bottom: -120, left: -80,
          width: 480, height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,163,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <div style={{ position: 'relative', width: 32, height: 32 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'var(--teal)', opacity: 0.15,
              animation: 'breathe 3.5s ease-in-out infinite',
            }} />
            <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: 'var(--teal)' }} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 17, color: 'var(--text-hi)', letterSpacing: '0.01em' }}>
              Breathe ESG
            </div>
          </div>
        </div>

        {/* Center content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 800,
            fontSize: 52,
            color: 'var(--text-hi)',
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}>
            Carbon<br />Intelligence<br />
            <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Platform.</span>
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--text)',
            marginTop: 20,
            lineHeight: 1.65,
            maxWidth: 360,
          }}>
            Ingest, classify, and audit GHG emissions across Scope 1, 2, and 3 — from SAP procurement data to corporate travel.
          </p>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 40, marginTop: 40 }}>
            {[
              { n: '3', label: 'Scopes covered' },
              { n: 'ISO 14064', label: 'Aligned standard' },
              { n: 'Real-time', label: 'Anomaly detection' },
            ].map(({ n, label }) => (
              <div key={n}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--teal)', letterSpacing: '-0.02em' }}>{n}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tag */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
          letterSpacing: '0.1em', textTransform: 'uppercase', position: 'relative', zIndex: 1,
        }}>
          v1.0 — Emissions data management system
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 56px',
        animation: 'fadeSlideIn 0.4s ease both',
      }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 24,
          }}>
            — Secure access
          </div>

          <h2 style={{
            fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 28,
            color: 'var(--text-hi)', margin: '0 0 6px', letterSpacing: '-0.02em',
          }}>Sign in</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', margin: '0 0 36px' }}>
            Enter your credentials to access the platform
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              { label: 'Username', type: 'text', value: username, set: setUsername, placeholder: 'admin' },
              { label: 'Password', type: 'password', value: password, set: setPassword, placeholder: '••••••••' },
            ].map(({ label, type, value, set, placeholder }) => (
              <div key={label}>
                <label style={{
                  display: 'block', fontFamily: 'var(--font-body)', fontSize: 11,
                  fontWeight: 500, color: 'var(--text)', marginBottom: 8,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>{label}</label>
                <input
                  type={type}
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder={placeholder}
                  required
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-hi)',
                    fontFamily: 'var(--font-mono)', fontSize: 13,
                    outline: 'none',
                    transition: 'border-color 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: 4,
                background: loading ? 'var(--bg-raised)' : 'var(--teal)',
                border: 'none',
                borderRadius: 6,
                color: loading ? 'var(--text-dim)' : '#000',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.03em',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Authenticating...' : 'Sign in →'}
            </button>
          </form>

          <div style={{
            marginTop: 28,
            padding: '14px 16px',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Demo accounts
            </div>
            {[['admin', 'admin123', 'Administrator'], ['analyst', 'analyst123', 'ESG Analyst']].map(([u, p, role]) => (
              <div key={u} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)' }}>{u} / {p}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)' }}>{role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
