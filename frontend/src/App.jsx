import { useState } from 'react'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import './App.css'

export default function App() {
  const [selectedProject, setSelectedProject] = useState(null)

  return (
    <div className="app">
      <header className="header">
        <h1>Digital Twin — Construction Management</h1>
        <p>Director Dashboard</p>
      </header>

      <main className="main">
        {!selectedProject ? (
          <ProjectList onSelect={setSelectedProject} />
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