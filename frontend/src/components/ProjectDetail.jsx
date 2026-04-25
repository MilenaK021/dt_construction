import { useState } from 'react'
import ProjectDashboard from './ProjectDashboard'
import TaskList from './TaskList'
import MeetingInvitation from './MeetingInvitation'
import AvatarChat from './AvatarChat'
import './ProjectDetail.css'

export default function ProjectDetail({ project, onBack }) {
  const [activeTab, setActiveTab] = useState('dashboard')

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'tasks',     label: '✅ Tasks' },
    { id: 'meeting',   label: '📅 Meeting Invitation' },
    { id: 'avatar',    label: '🤖 Try AI Manager' },
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
        {activeTab === 'dashboard' && <ProjectDashboard projectId={project.id} />}
        {activeTab === 'tasks'     && <TaskList projectId={project.id} />}
        {activeTab === 'meeting'   && <MeetingInvitation projectId={project.id} />}
        {activeTab === 'avatar'    && (
          <AvatarChat
            projectId={project.id}
            projectName={project.name}
          />
        )}
      </div>
    </div>
  )
}
