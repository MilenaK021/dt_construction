import { useState } from 'react'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import CreateProject from './components/CreateProject'
import './App.css'

export default function App() {
  const [selectedProject, setSelectedProject] = useState(null)
  const [creating,        setCreating]        = useState(false)
  const [activeNav,       setActiveNav]       = useState('projects')

  const handleNav = (key) => {
    setActiveNav(key)
    setSelectedProject(null)
    setCreating(false)
  }

  const renderContent = () => {
    if (creating) return <CreateProject onDone={() => { setCreating(false); setActiveNav('projects') }} />

    if (selectedProject) return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    )

    return (
      <div className="pl-page">
        <div className="pl-page-header">
          <div>
            <h2 className="pl-page-title">Проекты</h2>
          </div>
          <button className="pl-new-btn" onClick={() => setCreating(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Новый проект
          </button>
        </div>
        <ProjectList onSelect={setSelectedProject} />
      </div>
    )
  }

  const navItems = [
    { key: 'overview',   icon: 'overview',   label: 'Обзор' },
    { key: 'projects',   icon: 'folder',     label: 'Проекты' },
    { key: 'tenders',    icon: 'tender',     label: 'Тендеры' },
  ]
  const navItems2 = [
    { key: 'crm',        icon: 'crm',        label: 'CRM лиды' },
    { key: 'calendar',   icon: 'calendar',   label: 'Календарь' },
    { key: 'overdue',    icon: 'alert',      label: 'Просрочки' },
  ]
  const navItems3 = [
    { key: 'ai',         icon: 'ai',         label: 'AI Менеджер' },
    { key: 'invitations',icon: 'mail',       label: 'Приглашения' },
  ]

  const NavIcon = ({ type }) => {
    const icons = {
      overview:    <path d="M3 3h3v3H3V3zm0 5h3v3H3V8zm5-5h3v3H8V3zm0 5h3v3H8V8z" fill="currentColor"/>,
      folder:      <path d="M2 5a1 1 0 011-1h3l1.5 1.5H12a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>,
      tender:      <path d="M9 2H5a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2zm0 0v4h4M7 9h4M7 12h4M5 9h.5M5 12h.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
      crm:         <path d="M9 7a3 3 0 110-6 3 3 0 010 6zm-7 8a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
      calendar:    <path d="M4 2v2m6-2v2M2 7h14M3 4h12a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
      alert:       <path d="M8 3L2 13h12L8 3zm0 4v3m0 2v.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
      ai:          <path d="M6 3a3 3 0 013 3v2a3 3 0 01-6 0V6a3 3 0 013-3zm6 6c0 3.314-2.686 6-6 6S0 12.314 0 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
      mail:        <path d="M2 4h12v9H2V4zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
      settings:    <path d="M8 10a2 2 0 100-4 2 2 0 000 4zm3.5-1.5l1.2-.7a6 6 0 000-1.6l-1.2-.7a5 5 0 00-.8-1.4l.2-1.4a6 6 0 00-1.4-.8l-1.2.7a5 5 0 00-1.6 0l-1.2-.7a6 6 0 00-1.4.8l.2 1.4a5 5 0 00-.8 1.4l-1.2.7a6 6 0 000 1.6l1.2.7a5 5 0 00.8 1.4l-.2 1.4a6 6 0 001.4.8l1.2-.7a5 5 0 001.6 0l1.2.7a6 6 0 001.4-.8l-.2-1.4a5 5 0 00.8-1.4z" stroke="currentColor" strokeWidth="1.1" fill="none"/>,
    }
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {icons[type]}
      </svg>
    )
  }

  return (
    <div className="dt-shell">
      <header className="dt-topbar">
        <div className="dt-topbar-brand">
          <div className="dt-brand-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="7" height="7" rx="1" fill="#60a5fa"/><rect x="10" y="1" width="7" height="7" rx="1" fill="#93c5fd" opacity=".6"/><rect x="1" y="10" width="7" height="7" rx="1" fill="#93c5fd" opacity=".6"/><rect x="10" y="10" width="7" height="7" rx="1" fill="#60a5fa" opacity=".4"/></svg>
          </div>
          <div>
            <div className="dt-brand-name">Digital Twin</div>
            <div className="dt-brand-sub">Construction Management</div>
          </div>
        </div>

        <div className="dt-topbar-search">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <span>Поиск проектов…</span>
        </div>

        <div className="dt-topbar-right">
          <button className="dt-icon-btn" aria-label="Уведомления">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2a5 5 0 00-5 5v3l-1 1h12l-1-1V7a5 5 0 00-5-5zm-1 11a1 1 0 002 0" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
          </button>
          <button className="dt-icon-btn" aria-label="Настройки">
            <NavIcon type="settings" />
          </button>
          <div className="dt-user-chip">
            <div className="dt-user-avatar">МК</div>
            <span>Milena K.</span>
          </div>
        </div>
      </header>

      <div className="dt-body">
        <nav className="dt-sidebar" aria-label="Основная навигация">
          <div className="dt-nav-section">Главная</div>
          {navItems.map(n => (
            <button
              key={n.key}
              className={`dt-nav-item${activeNav === n.key ? ' dt-nav-item--active' : ''}`}
              onClick={() => handleNav(n.key)}
            >
              <NavIcon type={n.icon} />
              <span>{n.label}</span>
              {n.key === 'tenders' && <span className="dt-badge dt-badge--green">12</span>}
            </button>
          ))}

          <div className="dt-nav-section">Управление</div>
          {navItems2.map(n => (
            <button
              key={n.key}
              className={`dt-nav-item${activeNav === n.key ? ' dt-nav-item--active' : ''}`}
              onClick={() => handleNav(n.key)}
            >
              <NavIcon type={n.icon} />
              <span>{n.label}</span>
              {n.key === 'overdue' && <span className="dt-badge dt-badge--red">4</span>}
            </button>
          ))}

          <div className="dt-nav-section">Инструменты</div>
          {navItems3.map(n => (
            <button
              key={n.key}
              className={`dt-nav-item${activeNav === n.key ? ' dt-nav-item--active' : ''}`}
              onClick={() => handleNav(n.key)}
            >
              <NavIcon type={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}

          <div className="dt-sidebar-spacer" />
          <div className="dt-sidebar-footer">
            <div className="dt-connection-dot" />
            <span>ODOO подключён</span>
          </div>
        </nav>

        <main className="dt-main" id="main-content">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}