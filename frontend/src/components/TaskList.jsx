import { useEffect, useState, useCallback } from 'react'
import { getTasks } from '../api'
import './TaskList.css'

// Odoo 19 project.task `state` field values
const STATE_META = {
  '01_in_progress': { label: 'In Progress', color: '#E65100' },
  '1_done':         { label: 'Done',        color: '#2E7D32' },
  '1_in_progress':  { label: 'In Progress', color: '#E65100' },
  '03_approved':    { label: 'Approved',    color: '#2E7D32' },
  '04_waiting_normal': { label: 'Waiting',  color: '#185FA5' },
  '02_changes_requested': { label: 'Changes Requested', color: '#C62828' },
}

// Derive a display status from whatever Odoo sends back
function resolveStatus(task) {
  // 1) state field (Odoo 17+/19)
  const st = task.state
  if (st && STATE_META[st]) return STATE_META[st]

  // 2) fall back to parsing stage name
  const stage = task.stage_id ? task.stage_id[1] : ''
  const s = stage.toLowerCase()
  if (s.includes('done') || s.includes('завершен') || s.includes('готов'))
    return { label: stage, color: '#2E7D32' }
  if (s.includes('progress') || s.includes('process') || s.includes('работ') || s.includes('выполн'))
    return { label: stage, color: '#E65100' }
  if (s.includes('block') || s.includes('заблок'))
    return { label: stage, color: '#C62828' }
  if (s.includes('wait') || s.includes('ожид'))
    return { label: stage, color: '#185FA5' }

  return { label: stage || 'New', color: '#888' }
}

// Auto-refresh interval in ms (30 s)
const REFRESH_MS = 30_000

export default function TaskList({ projectId }) {
  const [tasks,      setTasks]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [lastSync,   setLastSync]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTasks = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    getTasks(projectId)
      .then(res => {
        setTasks(res.data.tasks)
        setLastSync(new Date())
      })
      .catch(err => console.error(err))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [projectId])

  // Initial load
  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => fetchTasks(true), REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchTasks])

  if (loading) return <p>Loading tasks...</p>

  const fmtTime = (d) =>
    d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div>
      <div className="tasklist-header">
        <h3 className="subsection-title">Tasks ({tasks.length})</h3>
        <div className="tasklist-sync">
          {refreshing && <span className="sync-spinner" />}
          <span className="sync-label">
            {lastSync ? `Synced ${fmtTime(lastSync)}` : ''}
          </span>
          <button
            className="sync-btn"
            onClick={() => fetchTasks(true)}
            disabled={refreshing}
            title="Refresh from Odoo"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <table className="task-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Deadline</th>
            <th>Progress</th>
            <th>Stage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const status = resolveStatus(t)
            return (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.date_deadline || '—'}</td>
                <td>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${t.progress || 0}%` }}
                    />
                  </div>
                  <span className="progress-label">{t.progress || 0}%</span>
                </td>
                <td>
                  <span className="stage-badge">
                    {t.stage_id ? t.stage_id[1] : 'Unknown'}
                  </span>
                </td>
                <td>
                  <span
                    className="status-badge"
                    style={{
                      background: status.color + '18',
                      color: status.color,
                      border: `1px solid ${status.color}33`,
                    }}
                  >
                    {status.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
