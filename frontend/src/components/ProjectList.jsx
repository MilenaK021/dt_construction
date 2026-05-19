import { useEffect, useState } from 'react'
import { getProjects, getDeadlineStatus } from '../api'
import './ProjectList.css'

export default function ProjectList({ onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [overdue,  setOverdue]  = useState({})

  useEffect(() => {
    getProjects()
      .then(res => {
        const ps = res.data.projects
        setProjects(ps)
        ps.forEach(p => {
          getDeadlineStatus(p.id)
            .then(r => { if (r.data.has_overdue) setOverdue(prev => ({ ...prev, [p.id]: true })) })
            .catch(() => {})
        })
      })
      .catch(err => {
        const detail = err.response?.data?.detail || err.message || 'Unknown error'
        setError(`Could not load projects: ${detail}`)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="project-loading">
      <div className="pl-spinner" />
      Загрузка проектов…
    </div>
  )

  if (error) return (
    <div className="project-error">
      <p>⚠️ {error}</p>
      <p className="project-error-hint">
        Убедитесь, что бэкенд запущен:<br />
        <code>uvicorn api.main:app --port 8001</code>
      </p>
    </div>
  )

  const totalCount   = projects.length
  const overdueCount = Object.keys(overdue).length
  const activeCount  = totalCount - overdueCount

  if (projects.length === 0) return (
    <div className="project-empty">Проекты не найдены. Создайте первый!</div>
  )

  const progressColor = (hasOverdue, idx) => {
    if (hasOverdue) return 'project-progress-fill--orange'
    const colors = ['', '--green', '--purple', '', '--green']
    return 'project-progress-fill' + (colors[idx % colors.length] || '')
  }

  const fakeProgress = (id) => ((id * 37 + 13) % 80) + 5

  return (
    <>
      <div className="pl-stats">
        <div className="pl-stat">
          <div className="pl-stat-label">Всего</div>
          <div className="pl-stat-val">{totalCount}</div>
        </div>
        <div className="pl-stat">
          <div className="pl-stat-label">Активных</div>
          <div className="pl-stat-val pl-stat-val--blue">{activeCount}</div>
        </div>
        <div className="pl-stat">
          <div className="pl-stat-label">Просрочено</div>
          <div className={`pl-stat-val${overdueCount > 0 ? ' pl-stat-val--red' : ''}`}>{overdueCount}</div>
        </div>
        <div className="pl-stat">
          <div className="pl-stat-label">Завершено</div>
          <div className="pl-stat-val pl-stat-val--green">0</div>
        </div>
      </div>

      <div className="project-grid">
        {projects.map((p, idx) => {
          const hasOverdue = overdue[p.id]
          const pct        = fakeProgress(p.id)
          return (
            <div
              key={p.id}
              className={`project-card${hasOverdue ? ' project-card--overdue' : ''}`}
              onClick={() => onSelect(p)}
            >
              {hasOverdue && (
                <div className="project-overdue-badge">⚠ Просрочен</div>
              )}
              <div className="project-name">{p.name}</div>
              <div className="project-meta">
                <span className={`pl-dot${hasOverdue ? ' pl-dot--orange' : (p.date_start ? '' : ' pl-dot--gray')}`} />
                {p.date_start ? `Старт: ${p.date_start}` : 'Дата не указана'}
              </div>
              <div className="project-progress">
                <div
                  className={progressColor(hasOverdue, idx)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="project-card-footer">
                <span className="project-progress-label">{pct}%</span>
                <span className="project-open">
                  Открыть
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}