import { useState } from 'react'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import CreateProject from './components/CreateProject'
import './App.css'

export default function App() {
  const [selectedProject, setSelectedProject] = useState(null)
  const [creating,        setCreating]        = useState(false)

  if (creating) {
    return (
      <div className="app">
        <header className="header">
          <h1>Digital Twin — Construction Management</h1>
          <p>Director Dashboard</p>
        </header>
        <main className="main">
          <CreateProject onDone={() => setCreating(false)} />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Digital Twin — Construction Management</h1>
        <p>Director Dashboard</p>
      </header>

      <main className="main">
        {!selectedProject ? (
          <>
            <div className="list-header">
              <h2 className="section-title" style={{ margin: 0 }}>Projects</h2>
              <button className="new-project-btn" onClick={() => setCreating(true)}>
                + New Project
              </button>
            </div>
            <ProjectList onSelect={setSelectedProject} />
          </>
        ) : (
          <ProjectDetail
            project={selectedProject}
            onBack={() => setSelectedProject(null)}
          />
        )}
      </main>
    </div>
  )
}
