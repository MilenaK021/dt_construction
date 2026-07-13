import { useState, useEffect } from 'react'
import { NEW_TENDERS } from '../data/tenders'
import { sendTenderEmail } from '../api'
import './TendersModal.css'

const SESSION_KEY    = 'dt_tenders_modal_shown'
const VIEWED_KEY     = 'dt_tenders_viewed'   // set of viewed tender ids

function getViewed() {
  try { return new Set(JSON.parse(sessionStorage.getItem(VIEWED_KEY) || '[]')) }
  catch { return new Set() }
}
function markViewed(id) {
  const s = getViewed(); s.add(id)
  sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...s]))
}

export default function TendersModal({ onClose }) {
  const [visible,   setVisible]   = useState(false)
  const [selected,  setSelected]  = useState(null)   // tender being viewed
  const [viewed,    setViewed]    = useState(getViewed)

  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    const shown = sessionStorage.getItem(SESSION_KEY)
    if (!shown) setTimeout(() => setVisible(true), 600)
  }, [])

  const close = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(false)
    onClose?.()
  }

  const openTender = (tender) => {
    setSelected(tender)
    setSent(false)
    setSendError('')
    // Mark as viewed
    markViewed(tender.id)
    setViewed(prev => new Set([...prev, tender.id]))
  }

  const goBack = () => {
    setSelected(null)
    setSent(false)
    setSendError('')
  }

  const handleSend = async () => {
    setSendError('')
    const profile = (() => {
      try { return JSON.parse(localStorage.getItem('dt_director_profile') || '{}') } catch { return {} }
    })()
    const email = profile.email || ''
    if (!email) {
      setSendError('Email не указан. Заполните профиль директора.')
      return
    }
    setSending(true)
    try {
      await sendTenderEmail({ tender: selected, recipient: email })
      setSent(true)
    } catch (e) {
      setSendError(e.response?.data?.detail || 'Ошибка отправки.')
    } finally {
      setSending(false)
    }
  }

  if (!visible) return null

  return (
    <div className="tm-backdrop" onClick={close}>
      <div className="tm-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="tm-header">
          <div className="tm-header-left">
            {selected ? (
              <button className="tm-back-btn" onClick={goBack}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                К списку тендеров
              </button>
            ) : (
              <>
                <span className="tm-badge-new">🔔 Новые тендеры</span>
                <h2 className="tm-title">Доступно {NEW_TENDERS.length} новых тендеров</h2>
                <p className="tm-sub">Выберите тендер для просмотра деталей и отправки на почту</p>
              </>
            )}
          </div>
          <button className="tm-close" onClick={close} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── List view ── */}
        {!selected && (
          <div className="tm-list">
            {NEW_TENDERS.map(t => {
              const isViewed = viewed.has(t.id)
              return (
                <div
                  key={t.id}
                  className={`tm-item ${isViewed ? 'tm-item--viewed' : 'tm-item--new'}`}
                  onClick={() => openTender(t)}
                >
                  {!isViewed && <div className="tm-new-dot" />}
                  <div className="tm-item-left">
                    <div className="tm-item-cat">{t.category}</div>
                    <div className="tm-item-title">{t.title}</div>
                    <div className="tm-item-meta">
                      <span>{t.customer}</span>
                      <span className="tm-dot">·</span>
                      <span>{t.region}</span>
                    </div>
                  </div>
                  <div className="tm-item-right">
                    <div className="tm-item-budget">{t.budget}</div>
                    <div className="tm-item-deadline">до {t.deadline}</div>
                    <div className="tm-item-arrow">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Detail view ── */}
        {selected && (
          <div className="tm-detail">
            <div className="tm-detail-header">
              <div>
                <div className="tm-detail-cat">{selected.category}</div>
                <h2 className="tm-detail-title">{selected.title}</h2>
                <div className="tm-detail-id">
                  Тендер #{selected.id} · Опубликован {selected.published}
                </div>
              </div>
              {selected.isNew && <span className="tm-new-badge">Новый</span>}
            </div>

            <div className="tm-detail-grid">
              {[
                { label: 'Заказчик',    val: selected.customer },
                { label: 'Регион',      val: selected.region   },
                { label: 'Бюджет',      val: selected.budget,  green: true },
                { label: 'Срок подачи', val: selected.deadline, red: true  },
              ].map(r => (
                <div key={r.label} className="tm-detail-row">
                  <span className="tm-detail-label">{r.label}</span>
                  <span className={`tm-detail-val${r.green ? ' tm-val--green' : r.red ? ' tm-val--red' : ''}`}>
                    {r.val}
                  </span>
                </div>
              ))}
            </div>

            {selected.description && (
              <div className="tm-detail-section">
                <div className="tm-section-title">Описание</div>
                <p className="tm-detail-desc">{selected.description}</p>
              </div>
            )}

            {selected.requirements?.length > 0 && (
              <div className="tm-detail-section">
                <div className="tm-section-title">Требования</div>
                <ul className="tm-req-list">
                  {selected.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Send block */}
            <div className="tm-send-block">
              {sent ? (
                <div className="tm-sent-success">
                  ✅ Тендер успешно отправлен на вашу почту!
                </div>
              ) : (
                <>
                  <button
                    className="tm-send-btn"
                    onClick={handleSend}
                    disabled={sending}
                  >
                    {sending
                      ? <><span className="tm-spinner" /> Отправка…</>
                      : '📧 Отправить на почту'}
                  </button>
                  {sendError && <div className="tm-send-error">{sendError}</div>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {!selected && (
          <div className="tm-footer">
            <button className="tm-btn-all" onClick={close}>
              Смотреть все во вкладке Тендеры
            </button>
          </div>
        )}

      </div>
    </div>
  )
}