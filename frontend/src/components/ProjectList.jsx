import { useEffect, useState } from 'react'
import { getProjects } from '../api'
import './ProjectList.css'

export default function ProjectList({ onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProjects()
      .then(res => setProjects(res.data.projects))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading projects…</p>

  if (projects.length === 0) {
    return (
      <div className="project-empty">
        <p>No projects yet. Create your first one above!</p>
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
