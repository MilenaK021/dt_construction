import { useState } from 'react'
import { getMeetingInvitation } from '../api'
import axios from 'axios'
import './MeetingInvitation.css'

const api = axios.create({ baseURL: '/api' })

export default function MeetingInvitation({ projectId }) {
  const [step,        setStep]       = useState('form')   // form | preview | sent
  const [date,        setDate]       = useState('')
  const [time,        setTime]       = useState('')
  const [link,        setLink]       = useState('')
  const [invitation,  setInvitation] = useState('')
  const [generating,  setGenerating] = useState(false)
  const [emails,      setEmails]     = useState('')
  const [sending,     setSending]    = useState(false)
  const [sendError,   setSendError]  = useState('')

  const generate = async () => {
    if (!date || !time) return
    setGenerating(true)
    try {
      const res = await getMeetingInvitation(projectId)
      // Append the meeting details to the AI text
      const details = [
        `\n─────────────────────────────`,
        `📅 Дата:   ${formatDate(date)}`,
        `🕐 Время:  ${time}`,
        link ? `🔗 Ссылка: ${link}` : null,
      ].filter(Boolean).join('\n')
      setInvitation(res.data.invitation + details)
      setStep('preview')
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  const sendEmail = async () => {
    const recipients = emails.split(/[,;\n]/).map(e => e.trim()).filter(Boolean)
    if (!recipients.length) { setSendError('Enter at least one email address.'); return }
    setSending(true)
    setSendError('')
    try {
      await api.post('/meeting/send-invitation', {
        project_id:  projectId,
        recipients,
        date,
        time,
        link,
        body: invitation,
      })
      setStep('sent')
    } catch (e) {
      setSendError(e.response?.data?.detail || 'Failed to send. Check server logs.')
    } finally {
      setSending(false)
    }
  }

  if (step === 'sent') {
    return (
      <div className="mi-sent">
        <div className="mi-sent-icon">✉️</div>
        <h3>Invitation sent!</h3>
        <p>Meeting invitations were delivered to all recipients.</p>
        <button className="mi-ghost-btn" onClick={() => setStep('form')}>
          ← Create another
        </button>
      </div>
    )
  }

  return (
    <div className="mi-root">
      {/* ── Step 1: form ── */}
      <div className="mi-section">
        <h3 className="subsection-title">Meeting Details</h3>

        <div className="mi-fields">
          <div className="mi-field">
            <label>📅 Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mi-input"
            />
          </div>

          <div className="mi-field">
            <label>🕐 Time</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="mi-input"
            />
          </div>

          <div className="mi-field mi-field--wide">
            <label>🔗 Meeting link <span className="mi-optional">(optional)</span></label>
            <input
              type="url"
              placeholder="https://meet.google.com/..."
              value={link}
              onChange={e => setLink(e.target.value)}
              className="mi-input"
            />
          </div>
        </div>

        <button
          className="mi-primary-btn"
          onClick={generate}
          disabled={generating || !date || !time}
        >
          {generating
            ? <><span className="mi-spinner" /> Generating…</>
            : 'Generate Invitation →'}
        </button>
      </div>

      {/* ── Step 2: preview + send ── */}
      {step === 'preview' && (
        <>
          <div className="mi-section">
            <h3 className="subsection-title">Preview</h3>
            <textarea
              className="mi-preview"
              value={invitation}
              onChange={e => setInvitation(e.target.value)}
              rows={14}
            />
          </div>

          <div className="mi-section">
            <h3 className="subsection-title">Send by Email</h3>
            <div className="mi-field">
              <label>Recipients</label>
              <textarea
                className="mi-input mi-recipients"
                placeholder="employee1@company.com, employee2@company.com"
                value={emails}
                onChange={e => setEmails(e.target.value)}
                rows={3}
              />
              <span className="mi-optional" style={{ marginTop: 4, display: 'block' }}>
                Separate addresses with commas, semicolons, or new lines
              </span>
            </div>

            {sendError && <div className="mi-error">{sendError}</div>}

            <div className="mi-send-row">
              <button className="mi-ghost-btn" onClick={() => setStep('form')}>
                ← Edit details
              </button>
              <button
                className="mi-primary-btn"
                onClick={sendEmail}
                disabled={sending}
              >
                {sending
                  ? <><span className="mi-spinner" /> Sending…</>
                  : '✉️ Send Invitation'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
