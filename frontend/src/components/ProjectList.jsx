import { useEffect, useState } from 'react'
import { getProjects } from '../api'
import './ProjectList.css'

export default function ProjectList({ onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    getProjects()
      .then(res => setProjects(res.data.projects))
      .catch(err => {
        console.error(err)
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
      {projects.map(p => (
        <div
          key={p.id}
          className="project-card"
          onClick={() => onSelect(p)}
        >
          <div className="project-name">{p.name}</div>
          <div className="project-meta">
            {p.date_start ? `Start: ${p.date_start}` : 'No start date'}
          </div>
          <div className="project-open">Open →</div>
        </div>
      ))}
    </div>
  )
}
