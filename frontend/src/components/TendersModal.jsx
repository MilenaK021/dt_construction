import { useState, useEffect } from 'react'
import { NEW_TENDERS } from '../data/tenders'
import './TendersModal.css'

const SESSION_KEY = 'dt_tenders_modal_shown'

export default function TendersModal({ onOpenTender }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const shown = sessionStorage.getItem(SESSION_KEY)
    if (!shown) {
      setTimeout(() => setVisible(true), 600)
    }
  }, [])

  const close = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(false)
  }

  const handleSelect = (tender) => {
    close()
    onOpenTender(tender)
  }

  if (!visible) return null

  return (
    <div className="tm-backdrop" onClick={close}>
      <div className="tm-modal" onClick={e => e.stopPropagation()}>
        <div className="tm-header">
          <div className="tm-header-left">
            <span className="tm-badge-new">🔔 Новые тендеры</span>
            <h2 className="tm-title">Доступно {NEW_TENDERS.length} новых тендеров</h2>
            <p className="tm-sub">Выберите тендер для просмотра деталей и отправки на почту</p>
          </div>
          <button className="tm-close" onClick={close} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="tm-list">
          {NEW_TENDERS.map(t => (
            <div key={t.id} className="tm-item" onClick={() => handleSelect(t)}>
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
                    <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="tm-footer">
          <button className="tm-btn-all" onClick={close}>
            Смотреть все во вкладке Тендеры
          </button>
        </div>
      </div>
    </div>
  )
}