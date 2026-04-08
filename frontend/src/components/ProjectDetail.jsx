import { useState } from 'react'
import TaskList from './TaskList'
import MeetingInvitation from './MeetingInvitation'
import ReportForm from './ReportForm'
import './ProjectDetail.css'

export default function ProjectDetail({ project, onBack }) {
  const [activeTab, setActiveTab] = useState('tasks')

  const tabs = [
    { id: 'tasks',    label: 'Tasks' },
    { id: 'meeting',  label: 'Meeting Invitation' },
    { id: 'report',   label: 'Submit Report' },
  ]

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← All Projects</button>
      <h2 className="section-title">{project.name}</h2>

      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'tasks'   && <TaskList projectId={project.id} />}
        {activeTab === 'meeting' && <MeetingInvitation projectId={project.id} />}
        {activeTab === 'report'  && <ReportForm projectId={project.id} />}
      </div>
    </div>
  )
}