import { useEffect, useState, useRef } from 'react'
import RescheduleBanner from './RescheduleBanner'
import { getTasks } from '../api'
import './ProjectDashboard.css'

// ── Stage config ────────────────────────────────────────────
const STAGES = [
  { key: 'New',         label: 'New',         color: '#94a3b8' },
  { key: 'Planned',     label: 'Planned',     color: '#60a5fa' },
  { key: 'In Progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'Done',        label: 'Done',        color: '#34d399' },
  { key: 'Cancelled',   label: 'Cancelled',   color: '#f87171' },
]

const stageColor = (name) =>
  STAGES.find(s => s.key === name)?.color ?? '#94a3b8'

// ── Fictive data ─────────────────────────────────────────────
const FAKE_MEETINGS = [
  { id: 1, date: '2025-04-02', type: 'Kickoff',        note: 'Project launched, roles assigned' },
  { id: 2, date: '2025-04-18', type: 'Status Review',  note: 'Field phase on track, minor delays in lab' },
  { id: 3, date: '2025-05-10', type: 'Risk Review',    note: 'Soil conditions flagged for extra testing' },
  { id: 4, date: '2025-06-01', type: 'Status Review',  note: 'Upcoming — report draft to be reviewed' },
]

const FAKE_DOCS = [
  { id: 1, name: 'Technical Assignment.pdf',   author: 'Иванов А.В.',    date: '2025-04-01', status: 'Approved' },
  { id: 2, name: 'Field Survey Report.docx',   author: 'Петров С.Н.',    date: '2025-04-20', status: 'Approved' },
  { id: 3, name: 'Lab Analysis Results.xlsx',  author: 'Сидорова М.Р.',  date: '2025-05-05', status: 'Pending'  },
  { id: 4, name: 'Draft Technical Report.docx',author: 'Иванов А.В.',    date: '2025-05-22', status: 'Pending'  },
]

// ── Helpers ──────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d) ? null : d
}

function addWorkingDays(from, days) {
  let d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0) added++ // skip Sundays only
  }
  return d
}

function subtractWorkingDays(from, days) {
  // Go backwards `days` working days from `from`
  let d = new Date(from)
  let removed = 0
  while (removed < days) {
    d.setDate(d.getDate() - 1)
    if (d.getDay() !== 0) removed++
  }
  return d
}

function computeTaskDates(tasks) {
  const byId = {}
  tasks.forEach(t => { byId[t.id] = { ...t } })

  function resolveEnd(id) {
    const t = byId[id]
    if (t._end) return t._end

    // Priority 1: use the real Odoo deadline
    const deadlineDate = parseDate(t.date_deadline)
    if (deadlineDate) {
      t._end   = deadlineDate
      // Derive start by going back duration_days working days from the deadline
      t._start = subtractWorkingDays(deadlineDate, t.duration_days || 5)
      return t._end
    }

    // Priority 2: compute from dependencies + duration
    const deps = t.depend_on_ids || []
    const depEnd = deps.length
      ? new Date(Math.max(...deps.map(d => resolveEnd(d))))
      : null

    if (depEnd) {
      t._start = new Date(depEnd)
      t._end   = addWorkingDays(depEnd, t.duration_days || 5)
      return t._end
    }

    // Priority 3: no info at all — skip, leave invisible
    t._start = null
    t._end   = null
    return null
  }

  tasks.forEach(t => resolveEnd(t.id))
  return Object.values(byId)
}

function stageName(task) {
  if (!task.stage_id) return 'New'
  return task.stage_id[1] || 'New'
}

// ── Sub-components ───────────────────────────────────────────

function HealthStrip({ tasks }) {
  const done    = tasks.filter(t => stageName(t) === 'Done')
  const overdue = tasks.filter(t => {
    const dl = parseDate(t.date_deadline)
    return dl && dl < new Date() && stageName(t) !== 'Done'
  })

  const totalDur = tasks.reduce((s, t) => s + (t.duration_days || 5), 0)
  const doneDur  = done.reduce((s, t)  => s + (t.duration_days || 5), 0)
  const pct      = totalDur > 0 ? Math.round((doneDur / totalDur) * 100) : 0

  const deadlines  = tasks.map(t => parseDate(t.date_deadline)).filter(Boolean)
  // Use date_assign (real start pushed to Odoo) if available, else compute backwards
  const allStarts  = tasks.map(t =>
    parseDate(t.date_assign) || subtractWorkingDays(parseDate(t.date_deadline), t.duration_days || 5)
  ).filter(Boolean)
  const firstStart = allStarts.length  ? new Date(Math.min(...allStarts)) : null
  const lastDL     = deadlines.length  ? new Date(Math.max(...deadlines)) : null
  const daysLeft   = lastDL ? Math.ceil((lastDL - new Date()) / 86400000) : null

  const barColor   = pct >= 70 ? '#22c55e' : pct >= 30 ? '#f59e0b' : '#ef4444'
  const daysColor  = daysLeft === null ? '#185FA5' : daysLeft < 0 ? '#ef4444' : daysLeft < 14 ? '#f59e0b' : '#185FA5'

  return (
    <div className="db-health">
      {/* Date range */}
      {(firstStart || lastDL) && (
        <div className="db-health-dates">
          <span className="db-health-date-label">Project period</span>
          <span className="db-health-date-range">
            {firstStart ? fmt(firstStart) : '?'} → {lastDL ? fmt(lastDL) : '?'}
          </span>
        </div>
      )}

      <div className="db-health-divider" />

      {/* Stats row */}
      <div className="db-health-stats">
        <div className="db-stat">
          <span className="db-stat-val db-stat-dark">{tasks.length}</span>
          <span className="db-stat-lbl">Total tasks</span>
        </div>
        <div className="db-stat">
          <span className="db-stat-val" style={{ color: '#22c55e' }}>{done.length}</span>
          <span className="db-stat-lbl">Done</span>
        </div>
        <div className="db-stat">
          <span className="db-stat-val" style={{ color: '#ef4444' }}>{overdue.length}</span>
          <span className="db-stat-lbl">Overdue</span>
        </div>
        {daysLeft !== null && (
          <div className="db-stat">
            <span className="db-stat-val" style={{ color: daysColor }}>
              {daysLeft < 0 ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d left`}
            </span>
            <span className="db-stat-lbl">To deadline</span>
          </div>
        )}
      </div>

      <div className="db-health-divider" />

      {/* Progress bar */}
      <div className="db-health-bar-wrap">
        <div className="db-health-bar-track">
          <div
            className="db-health-bar-fill"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <span className="db-health-pct" style={{ color: barColor }}>{pct}% complete</span>
      </div>
    </div>
  )
}

function StageChart({ tasks }) {
  const counts = {}
  STAGES.forEach(s => { counts[s.key] = 0 })
  tasks.forEach(t => {
    const s = stageName(t)
    if (counts[s] !== undefined) counts[s]++
    else counts['New']++
  })

  const max      = Math.max(...Object.values(counts), 1)
  // Round up to a nice grid ceiling (next multiple of a step)
  const step     = max <= 5 ? 1 : max <= 10 ? 2 : max <= 20 ? 5 : 10
  const gridMax  = Math.ceil(max / step) * step
  const gridLines = Array.from({ length: Math.floor(gridMax / step) + 1 }, (_, i) => i * step).reverse()
  const CHART_H  = 180  // px of the bar area

  return (
    <div className="db-section">
      <div className="db-section-header">
        <span className="db-section-title">Task Status Breakdown</span>
      </div>
      <div className="db-classic-chart">
        {/* Y-axis */}
        <div className="db-y-axis">
          {gridLines.map(v => (
            <span key={v} className="db-y-tick">{v}</span>
          ))}
        </div>

        {/* Grid + bars */}
        <div className="db-chart-area" style={{ height: CHART_H }}>
          {/* Horizontal grid lines */}
          {gridLines.map(v => (
            <div
              key={v}
              className="db-grid-line"
              style={{ bottom: `${(v / gridMax) * 100}%` }}
            />
          ))}

          {/* Bars */}
          <div className="db-bars-row">
            {STAGES.map(s => {
              const count    = counts[s.key]
              const heightPct = (count / gridMax) * 100
              return (
                <div key={s.key} className="db-classic-bar-col">
                  <div className="db-classic-bar-wrap">
                    <div
                      className="db-classic-bar"
                      style={{ height: `${heightPct}%`, background: s.color }}
                      title={`${s.label}: ${count}`}
                    />
                  </div>
                  <span className="db-classic-bar-label">{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function MeetingsPanel() {
  return (
    <div className="db-section db-panel">
      <div className="db-section-header">
        <span className="db-section-title">Meeting History</span>
        <span className="db-coming-soon">coming soon</span>
      </div>
      <div className="db-meeting-list">
        {FAKE_MEETINGS.map(m => (
          <div key={m.id} className="db-meeting-row">
            <div className="db-meeting-date">{formatShortDate(m.date)}</div>
            <div className="db-meeting-body">
              <span className="db-meeting-type">{m.type}</span>
              <span className="db-meeting-note">{m.note}</span>
            </div>
            <div
              className="db-meeting-dot"
              style={{ background: new Date(m.date) > new Date() ? '#60a5fa' : '#34d399' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function DocsPanel() {
  const statusColor = { Approved: '#34d399', Pending: '#f59e0b', Rejected: '#f87171' }
  return (
    <div className="db-section db-panel">
      <div className="db-section-header">
        <span className="db-section-title">Documents & Reports</span>
        <span className="db-coming-soon">coming soon</span>
      </div>
      <div className="db-doc-list">
        {FAKE_DOCS.map(d => (
          <div key={d.id} className="db-doc-row">
            <div className="db-doc-icon">📄</div>
            <div className="db-doc-body">
              <span className="db-doc-name">{d.name}</span>
              <span className="db-doc-meta">{d.author} · {formatShortDate(d.date)}</span>
            </div>
            <span
              className="db-doc-status"
              style={{
                color: statusColor[d.status],
                background: statusColor[d.status] + '18',
                border: `1px solid ${statusColor[d.status]}33`,
              }}
            >
              {d.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Gantt ─────────────────────────────────────────────────────
function GanttChart({ tasks }) {
  const scrollRef = useRef()
  const [tooltip, setTooltip] = useState(null)
  const [zoom, setZoom] = useState('all')  // 1m | 3m | 6m | all

  const enriched = computeTaskDates(tasks)
  const today    = new Date()

  // determine visible range
  const allStarts = enriched.map(t => t._start).filter(Boolean)
  const allEnds   = enriched.map(t => t._end).filter(Boolean)
  if (!allStarts.length) return (
    <div className="db-section">
      <div className="db-section-header"><span className="db-section-title">Gantt Chart</span></div>
      <p style={{ color: '#888', padding: '24px 0' }}>No tasks with dates to display.</p>
    </div>
  )

  const minDate = new Date(Math.min(...allStarts))
  const maxDate = new Date(Math.max(...allEnds))

  // zoom override — always anchor to the actual task range, not today,
  // so bars that started in the past still appear correctly
  let viewStart = new Date(minDate)
  let viewEnd   = new Date(maxDate)
  if (zoom === '1m') {
    viewStart = new Date(minDate)
    viewEnd   = new Date(minDate)
    viewEnd.setMonth(viewEnd.getMonth() + 1)
  }
  if (zoom === '3m') {
    viewStart = new Date(minDate)
    viewStart.setDate(1)
    viewEnd   = new Date(viewStart)
    viewEnd.setMonth(viewEnd.getMonth() + 3)
  }
  if (zoom === '6m') {
    viewStart = new Date(minDate)
    viewStart.setDate(1)
    viewEnd   = new Date(viewStart)
    viewEnd.setMonth(viewEnd.getMonth() + 6)
  }

  const totalDays = Math.max(1, Math.ceil((viewEnd - viewStart) / 86400000))
  const DAY_W     = 28  // px per day

  // build week columns
  const weeks = []
  let wCursor = new Date(viewStart)
  wCursor.setDate(wCursor.getDate() - wCursor.getDay() + 1) // Monday
  while (wCursor <= viewEnd) {
    weeks.push(new Date(wCursor))
    wCursor.setDate(wCursor.getDate() + 7)
  }

  // build month headers
  const months = []
  let mCursor  = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1)
  while (mCursor <= viewEnd) {
    const mStart = new Date(Math.max(mCursor, viewStart))
    const mEnd   = new Date(Math.min(
      new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 0),
      viewEnd
    ))
    const daySpan = Math.ceil((mEnd - mStart) / 86400000) + 1
    months.push({ label: mCursor.toLocaleString('en', { month: 'long', year: 'numeric' }), days: daySpan })
    mCursor.setMonth(mCursor.getMonth() + 1)
  }

  function dayOffset(d) {
    return Math.max(0, Math.ceil((d - viewStart) / 86400000))
  }

  function barStyle(t) {
    if (!t._start || !t._end) return null
    const left  = dayOffset(t._start) * DAY_W
    const width = Math.max(DAY_W, Math.ceil((t._end - t._start) / 86400000) * DAY_W)
    return { left, width, background: stageColor(stageName(t)) }
  }

  const LABEL_W = 220

  return (
    <div className="db-section">
      <div className="db-section-header">
        <span className="db-section-title">Gantt Chart</span>
        <div className="db-zoom-btns">
          {['1m', '3m', '6m', 'all'].map(z => (
            <button
              key={z}
              className={`db-zoom-btn ${zoom === z ? 'active' : ''}`}
              onClick={() => setZoom(z)}
            >
              {z === 'all' ? 'All' : z}
            </button>
          ))}
        </div>
      </div>

      <div className="db-gantt-wrap">
        {/* Fixed label column */}
        <div className="db-gantt-labels" style={{ width: LABEL_W }}>
          <div className="db-gantt-label-head" />
          {enriched.map(t => (
            <div key={t.id} className="db-gantt-label-row">
              {t.name}
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div className="db-gantt-scroll" ref={scrollRef}>
          <div style={{ width: totalDays * DAY_W, position: 'relative' }}>
            {/* Month header */}
            <div className="db-gantt-months">
              {months.map((m, i) => (
                <div key={i} className="db-gantt-month" style={{ width: m.days * DAY_W }}>
                  {m.label}
                </div>
              ))}
            </div>

            {/* Week header */}
            <div className="db-gantt-weeks">
              {weeks.map((w, i) => (
                <div key={i} className="db-gantt-week" style={{ width: 7 * DAY_W }}>
                  W{getWeekNum(w)}
                </div>
              ))}
            </div>

            {/* Today line */}
            {today >= viewStart && today <= viewEnd && (
              <div
                className="db-gantt-today"
                style={{ left: dayOffset(today) * DAY_W }}
              />
            )}

            {/* Task rows */}
            {enriched.map(t => {
              const bs = barStyle(t)
              return (
                <div key={t.id} className="db-gantt-row">
                  <div className="db-gantt-row-bg" style={{ width: totalDays * DAY_W }} />
                  {bs && (
                    <div
                      className="db-gantt-bar"
                      style={bs}
                      onMouseEnter={e => setTooltip({ t, x: e.clientX, y: e.clientY })}
                      onMouseMove={e => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="db-gantt-bar-label">{t.name}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stage legend */}
      <div className="db-gantt-legend">
        {STAGES.map(s => (
          <span key={s.key} className="db-legend-item">
            <span className="db-legend-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="db-gantt-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="db-tooltip-name">{tooltip.t.name}</div>
          <div className="db-tooltip-row">
            <span>Stage</span>
            <span style={{ color: stageColor(stageName(tooltip.t)) }}>{stageName(tooltip.t)}</span>
          </div>
          <div className="db-tooltip-row">
            <span>Start</span>
            <span>{tooltip.t._start ? fmt(tooltip.t._start) : '—'}</span>
          </div>
          <div className="db-tooltip-row">
            <span>Deadline</span>
            <span>{tooltip.t.date_deadline || '—'}</span>
          </div>
          {tooltip.t.description && (
            <div className="db-tooltip-row">
              <span>Assignees</span>
              <span>{tooltip.t.description}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Utils ─────────────────────────────────────────────────────
function fmt(d)             { return d ? d.toLocaleDateString('ru-RU') : '—' }
function formatShortDate(s) { const d = new Date(s); return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short', year:'numeric' }) }
function getWeekNum(d) {
  const jan1  = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
}

// ── Main export ───────────────────────────────────────────────
export default function ProjectDashboard({ projectId }) {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTasks(projectId)
      .then(r => setTasks(r.data.tasks))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <div className="db-loading">Loading dashboard…</div>

  return (
    <div className="db-root">
      <HealthStrip tasks={tasks} />
      <RescheduleBanner projectId={projectId} />
      <StageChart  tasks={tasks} />
      <div className="db-two-col">
        <MeetingsPanel />
        <DocsPanel />
      </div>
      <GanttChart tasks={tasks} />
    </div>
  )
}
