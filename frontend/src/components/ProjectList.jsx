import { useEffect, useState } from 'react'
import { getProjects, getDeadlineStatus } from '../api'
import './ProjectList.css'

export default function ProjectList({ onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [overdue,  setOverdue]  = useState({})   // { [project_id]: true }

  useEffect(() => {
    getProjects()
      .then(res => {
        const ps = res.data.projects
        setProjects(ps)
        // Fire deadline checks for all projects in parallel — silently
        ps.forEach(p => {
          getDeadlineStatus(p.id)
            .then(r => {
              if (r.data.has_overdue)
                setOverdue(prev => ({ ...prev, [p.id]: true }))
            })
            .catch(() => {})
        })
      })
      .catch(err => {
        const detail = err.response?.data?.detail || err.message || 'Unknown error'
        setError(`Could not load projects: ${detail}`)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading projects…</p>

  if (error) return (
    <div className="project-error">
      <p>⚠️ {error}</p>
      <p className="project-error-hint">
        Make sure the backend is running:<br />
        <code>uvicorn api.main:app --reload --port 8000</code>
      </p>
    </div>
  )

  if (projects.length === 0) {
    return (
      <div className="project-empty">
        <p>No projects found. Create your first one above!</p>
      </div>
    )
  }

  return (
    <div className="project-grid">
      {projects.map(p => {
        const hasOverdue = overdue[p.id]
        return (
          <div
            key={p.id}
            className={`project-card ${hasOverdue ? 'project-card--overdue' : ''}`}
            onClick={() => onSelect(p)}
          >
            {hasOverdue && (
              <div className="project-overdue-badge">⚠️ Deadline missed</div>
            )}
            <div className="project-name">{p.name}</div>
            <div className="project-meta">
              {p.date_start ? `Start: ${p.date_start}` : 'No start date'}
            </div>
            <div className="project-open">Open →</div>
          </div>
        )
      })}
    </div>
  )
}
