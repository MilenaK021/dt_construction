import { useEffect, useState } from 'react'
import { getDeadlineStatus, getReschedulePreview, confirmReschedule } from '../api'
import './RescheduleBanner.css'

export default function RescheduleBanner({ projectId }) {
  const [status,   setStatus]   = useState(null)   // deadline-status response
  const [loading,  setLoading]  = useState(true)
  const [preview,  setPreview]  = useState(null)   // reschedule preview changes
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    getDeadlineStatus(projectId)
      .then(r => setStatus(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to check deadlines'))
      .finally(() => setLoading(false))
  }, [projectId])

  const handlePreview = async () => {
    setPreviewing(true)
    setError('')
    try {
      const r = await getReschedulePreview(projectId)
      setPreview(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to generate preview')
    } finally {
      setPreviewing(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview?.changes?.length) return
    setConfirming(true)
    setError('')
    try {
      await confirmReschedule(projectId, { changes: preview.changes })
      setDone(true)
      setPreview(null)
      // Short delay so the user sees the success state, then reload
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to push changes to Odoo')
    } finally {
      setConfirming(false)
    }
  }

  if (loading || !status) return null
  if (!status.has_overdue && !done) return null

  if (done) {
    return (
      <div className="rsb-success">
        ✅ Deadlines rescheduled and pushed to Odoo successfully.
      </div>
    )
  }

  return (
    <>
      {/* ── Alert banner ── */}
      <div className="rsb-banner">
        <div className="rsb-banner-left">
          <span className="rsb-icon">⚠️</span>
          <div>
            <div className="rsb-title">
              {status.overdue.length} task{status.overdue.length > 1 ? 's' : ''} missed{' '}
              {status.overdue.length > 1 ? 'their deadlines' : 'its deadline'}
            </div>
            <div className="rsb-overdue-list">
              {status.overdue.map(t => (
                <span key={t.id} className="rsb-overdue-chip">
                  {t.name}
                  <span className="rsb-days-late">{t.days_overdue}d late</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <button
          className="rsb-btn"
          onClick={handlePreview}
          disabled={previewing || !!preview}
        >
          {previewing
            ? <><span className="rsb-spinner" /> Calculating…</>
            : '📅 Reschedule'}
        </button>
      </div>

      {error && <div className="rsb-error">{error}</div>}

      {/* ── Preview modal ── */}
      {preview && (
        <div className="rsb-preview">
          <div className="rsb-preview-header">
            <span className="rsb-preview-title">Proposed schedule changes</span>
            <span className="rsb-preview-sub">
              {preview.changes.length} task{preview.changes.length !== 1 ? 's' : ''} will be updated
            </span>
          </div>

          {preview.changes.length === 0 ? (
            <p className="rsb-no-changes">No dependent tasks need rescheduling.</p>
          ) : (() => {
            // Group changes by chain
            const chainMap = {}
            preview.changes.forEach(c => {
              const key = c.chain_id ?? 0
              if (!chainMap[key]) chainMap[key] = { name: c.chain_name || `Chain ${key}`, changes: [] }
              chainMap[key].changes.push(c)
            })
            const chains = Object.entries(chainMap).sort((a, b) => a[0] - b[0])
            return chains.map(([chainId, chain]) => (
              <div key={chainId} className="rsb-chain-group">
                <div className="rsb-chain-label">
                  <span className="rsb-chain-dot" />
                  {chain.name}
                </div>
                <table className="rsb-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Current deadline</th>
                      <th></th>
                      <th>New deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chain.changes.map(c => (
                      <tr key={c.task_id} className={c.is_overdue ? 'rsb-row-origin' : ''}>
                        <td>
                          {c.section && <span className="rsb-section-tag">{c.section}</span>}
                          {c.name}
                          {c.is_overdue && <span className="rsb-origin-tag">overdue</span>}
                        </td>
                        <td className="rsb-old-date">{c.old_deadline?.slice(0,10) || '—'}</td>
                        <td className="rsb-arrow">→</td>
                        <td className="rsb-new-date">{c.new_deadline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          })()}

          <div className="rsb-preview-actions">
            <button
              className="rsb-ghost-btn"
              onClick={() => setPreview(null)}
              disabled={confirming}
            >
              Cancel
            </button>
            <button
              className="rsb-confirm-btn"
              onClick={handleConfirm}
              disabled={confirming || preview.changes.length === 0}
            >
              {confirming
                ? <><span className="rsb-spinner rsb-spinner--dark" /> Pushing to Odoo…</>
                : '✓ Confirm & push to Odoo'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}