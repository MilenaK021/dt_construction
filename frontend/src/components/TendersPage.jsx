import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ALL_TENDERS, NEW_TENDERS } from '../data/tenders'
import { sendTenderEmail } from '../api'
import './TendersPage.css'

export default function TendersPage({ initialTender = null }) {
  const location = useLocation()
  const [selected,  setSelected]  = useState(initialTender || location.state?.tender || null)
  const [filter,    setFilter]    = useState('all')  // 'all' | 'new'
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [sendError, setSendError] = useState('')

  const shown = filter === 'new'
    ? NEW_TENDERS
    : ALL_TENDERS

  const handleSend = async () => {
    setSendError('')
    const profileRaw = localStorage.getItem('dt_director_profile')
    const profile    = profileRaw ? JSON.parse(profileRaw) : {}
    const email      = profile.email || ''

    if (!email) {
      setSendError('Email не указан. Заполните профиль директора (раздел «Профиль директора»).')
      return
    }

    setSending(true)
    try {
      await sendTenderEmail({ tender: selected, recipient: email })
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch (e) {
      setSendError(e.response?.data?.detail || 'Ошибка отправки. Проверьте настройки SMTP.')
    } finally {
      setSending(false)
    }
  }

  // ── Detail view ────────────────────────────────────────
  if (selected) {
    return (
      <div className="tp-detail">
        <button className="tp-back" onClick={() => { setSelected(null); setSent(false); setSendError('') }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Назад к списку
        </button>

        <div className="tp-detail-card">
          <div className="tp-detail-header">
            <div>
              <div className="tp-detail-cat">{selected.category}</div>
              <h1 className="tp-detail-title">{selected.title}</h1>
              <div className="tp-detail-id">Тендер #{selected.id} · Опубликован {selected.published}</div>
            </div>
            {selected.isNew && <span className="tp-new-badge">Новый</span>}
          </div>

          <div className="tp-detail-grid">
            {[
              { label: 'Заказчик',    val: selected.customer,    color: '' },
              { label: 'Регион',      val: selected.region,      color: '' },
              { label: 'Бюджет',      val: selected.budget,      color: 'green' },
              { label: 'Срок подачи', val: selected.deadline,    color: 'red' },
            ].map(r => (
              <div key={r.label} className="tp-detail-row">
                <span className="tp-detail-label">{r.label}</span>
                <span className={`tp-detail-val${r.color ? ' tp-detail-val--' + r.color : ''}`}>
                  {r.val}
                </span>
              </div>
            ))}
          </div>

          <div className="tp-detail-section">
            <div className="tp-section-title">Описание</div>
            <p className="tp-detail-desc">{selected.description}</p>
          </div>

          {selected.requirements?.length > 0 && (
            <div className="tp-detail-section">
              <div className="tp-section-title">Требования к участнику</div>
              <ul className="tp-reqs">
                {selected.requirements.map((r, i) => (
                  <li key={i} className="tp-req-item">
                    <span className="tp-req-dot" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="tp-detail-section tp-email-section">
            <div className="tp-section-title">Действия</div>
            <div className="tp-email-info">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M1 3h13v9H1V3zm0 0l6.5 5L14 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>
                Детали тендера и PDF-документация будут отправлены на почту директора.
                {(() => {
                  try {
                    const p = JSON.parse(localStorage.getItem('dt_director_profile') || '{}')
                    return p.email ? <b> ({p.email})</b> : <span className="tp-no-email"> Email не задан — заполните профиль директора.</span>
                  } catch { return null }
                })()}
              </span>
            </div>

            {sendError && <div className="tp-send-error">{sendError}</div>}

            {sent && (
              <div className="tp-sent-ok">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Письмо отправлено! PDF с деталями тендера — во вложении.
              </div>
            )}

            <div className="tp-actions">
              <button
                className={`tp-send-btn${sending ? ' tp-send-btn--loading' : ''}${sent ? ' tp-send-btn--sent' : ''}`}
                onClick={handleSend}
                disabled={sending || sent}
              >
                {sending ? 'Отправляем…' : sent ? '✓ Отправлено' : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 3h12v8H1V3zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Отправить детали на почту
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────
  return (
    <div className="tp-page">
      <div className="tp-page-header">
        <div>
          <h2 className="tp-page-title">Тендеры</h2>
          <p className="tp-page-sub">Данные: goszakup.gov.kz (mock)</p>
        </div>
        <div className="tp-filters">
          <button
            className={`tp-filter-btn${filter === 'all' ? ' tp-filter-btn--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все <span className="tp-filter-count">{ALL_TENDERS.length}</span>
          </button>
          <button
            className={`tp-filter-btn${filter === 'new' ? ' tp-filter-btn--active' : ''}`}
            onClick={() => setFilter('new')}
          >
            Новые <span className="tp-filter-count tp-filter-count--blue">{NEW_TENDERS.length}</span>
          </button>
        </div>
      </div>

      <div className="tp-list">
        {shown.map(t => (
          <div key={t.id} className={`tp-card${t.isNew ? ' tp-card--new' : ''}`} onClick={() => setSelected(t)}>
            <div className="tp-card-left">
              <div className="tp-card-top">
                <span className="tp-card-cat">{t.category}</span>
                {t.isNew && <span className="tp-card-new-dot" />}
              </div>
              <div className="tp-card-title">{t.title}</div>
              <div className="tp-card-meta">
                <span>{t.customer}</span>
                <span className="tp-meta-sep">·</span>
                <span>{t.region}</span>
                <span className="tp-meta-sep">·</span>
                <span>Опубл. {t.published}</span>
              </div>
            </div>
            <div className="tp-card-right">
              <div className="tp-card-budget">{t.budget}</div>
              <div className="tp-card-deadline">срок до {t.deadline}</div>
              <div className="tp-card-open">
                Подробнее
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}