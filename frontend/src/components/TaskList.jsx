import { useEffect, useState } from 'react'
import { getTasks } from '../api'
import './TaskList.css'

export default function TaskList({ projectId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTasks(projectId)
      .then(res => setTasks(res.data.tasks))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <p>Loading tasks...</p>

  return (
    <div>
      <h3 className="subsection-title">Tasks ({tasks.length})</h3>
      <table className="task-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Deadline</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}