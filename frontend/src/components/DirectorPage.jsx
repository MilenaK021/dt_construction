import { useState, useEffect, useRef } from 'react'
import './DirectorPage.css'

const STORAGE_KEY = 'dt_director_profile'

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export default function DirectorPage() {
  const [profile,  setProfile]  = useState({
    name:     '',
    position: '',
    email:    '',
    phone:    '',
    company:  '',
    ...loadProfile(),
  })
  const [saved,    setSaved]    = useState(false)
  const [photoSrc, setPhotoSrc] = useState(profile.photo || null)
  const fileRef = useRef()

  const update = (field, val) => {
    setSaved(false)
    setProfile(p => ({ ...p, [field]: val }))
  }

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, photo: photoSrc }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setPhotoSrc(ev.target.result)
      setSaved(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="dir-page">
      <div className="dir-page-header">
        <h2 className="dir-title">Профиль директора</h2>
        <p className="dir-sub">Данные используются при отправке тендерных писем и работе AI-аватара</p>
      </div>

      <div className="dir-grid">

        {/* ── Left: photo + avatar ── */}
        <div className="dir-card dir-card--side">
          <div className="dir-avatar-wrap" onClick={() => fileRef.current.click()}>
            {photoSrc
              ? <img src={photoSrc} alt="Фото директора" className="dir-avatar-img" />
              : <div className="dir-avatar-placeholder">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                    <circle cx="20" cy="16" r="8" stroke="currentColor" strokeWidth="2" fill="none" opacity=".4"/>
                    <path d="M4 38c0-8.8 7.2-16 16-16s16 7.2 16 16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".4"/>
                  </svg>
                  <span>Загрузить фото</span>
                </div>
            }
            <div className="dir-avatar-overlay">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M14.5 3.5l2 2L6 16H4v-2L14.5 3.5z" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />

          <div className="dir-side-name">{profile.name || 'Имя директора'}</div>
          <div className="dir-side-pos">{profile.position || 'Должность'}</div>

          <div className="dir-voice-section">
            <div className="dir-section-label">Голос для AI-аватара</div>
            <div className="dir-voice-mock">
              <div className="dir-voice-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                  <path d="M4 10a5 5 0 008 0M8 13v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
                </svg>
                Записать голос
              </div>
              <div class="dir-voice-hint">Функция в разработке</div>
            </div>
          </div>
        </div>

        {/* ── Right: form fields ── */}
        <div className="dir-card dir-card--main">
          <div className="dir-section-label">Основная информация</div>

          <div className="dir-form">
            <div className="dir-field">
              <label className="dir-label">Полное имя</label>
              <input
                className="dir-input"
                type="text"
                value={profile.name}
                onChange={e => update('name', e.target.value)}
                placeholder="Алексей Иванов"
              />
            </div>

            <div className="dir-field">
              <label className="dir-label">Должность</label>
              <input
                className="dir-input"
                type="text"
                value={profile.position}
                onChange={e => update('position', e.target.value)}
                placeholder="Генеральный директор"
              />
            </div>

            <div className="dir-field">
              <label className="dir-label">Компания</label>
              <input
                className="dir-input"
                type="text"
                value={profile.company}
                onChange={e => update('company', e.target.value)}
                placeholder="ТОО Строй Групп"
              />
            </div>

            <div className="dir-field">
              <label className="dir-label">Телефон</label>
              <input
                className="dir-input"
                type="tel"
                value={profile.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="+7 700 000 0000"
              />
            </div>

            <div className="dir-field dir-field--highlight">
              <label className="dir-label">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{verticalAlign:'middle', marginRight:5}}>
                  <path d="M1 3h12v8H1V3zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Email для тендеров
                <span className="dir-label-badge">Важно</span>
              </label>
              <input
                className="dir-input dir-input--accent"
                type="email"
                value={profile.email}
                onChange={e => update('email', e.target.value)}
                placeholder="director@company.kz"
              />
              <div className="dir-field-hint">
                На этот адрес будут отправляться детали выбранных тендеров
              </div>
            </div>
          </div>

          <div className="dir-form-footer">
            <button className={`dir-save-btn${saved ? ' dir-save-btn--saved' : ''}`} onClick={save}>
              {saved
                ? <><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> Сохранено</>
                : 'Сохранить профиль'
              }
            </button>
          </div>
        </div>

      </div>

      {/* ── Integration status ── */}
      <div className="dir-integrations">
        <div className="dir-section-label" style={{marginBottom:12}}>Интеграции</div>
        <div className="dir-int-grid">
          {[
            { name: 'ODOO ERP',         status: 'connected', icon: '🔗' },
            { name: 'Groq AI',           status: 'connected', icon: '🤖' },
            { name: 'Simli Avatar',      status: 'connected', icon: '🎥' },
            { name: 'goszakup.gov.kz',   status: 'pending',   icon: '📄' },
          ].map(i => (
            <div key={i.name} className="dir-int-item">
              <span className="dir-int-icon">{i.icon}</span>
              <span className="dir-int-name">{i.name}</span>
              <span className={`dir-int-status dir-int-status--${i.status}`}>
                {i.status === 'connected' ? 'Подключено' : 'Ожидание'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}