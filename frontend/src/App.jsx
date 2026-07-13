import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ProjectList    from './components/ProjectList'
import ProjectDetail  from './components/ProjectDetail'
import CreateProject  from './components/CreateProject'
import DirectorPage   from './components/DirectorPage'
import TendersModal from './components/TendersModal'
import TendersPage   from './components/TendersPage'
import './App.css'

/* ── Nav icon helper ─────────────────────────────── */
function NavIcon({ type }) {
  const icons = {
    overview:    <path d="M3 3h3v3H3V3zm0 5h3v3H3V8zm5-5h3v3H8V3zm0 5h3v3H8V8z" fill="currentColor"/>,
    folder:      <path d="M2 5a1 1 0 011-1h3l1.5 1.5H12a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>,
    tender:      <path d="M9 2H5a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2zm0 0v4h4M7 9h4M7 12h4M5 9h.5M5 12h.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
    crm:         <path d="M9 7a3 3 0 110-6 3 3 0 010 6zm-7 8a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
    calendar:    <path d="M4 2v2m6-2v2M2 7h14M3 4h12a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
    alert:       <path d="M8 3L2 13h12L8 3zm0 4v3m0 2v.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    ai:          <path d="M5 3h6l2 4-4 2-4-2 2-4zM8 9v5M5 14h6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    mail:        <path d="M2 4h12v9H2V4zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    settings:    <><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M11.5 3.5l-1 1M3.5 11.5l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>,
    director:    <><circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/><path d="M6 12l1.5 2 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></>,
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {icons[type]}
    </svg>
  )
}

/* ── Sidebar + Topbar shell ──────────────────────── */
function Shell({ children }) {
  const navigate = useNavigate()

  const nav1 = [
    { to: '/',         icon: 'folder',   label: 'Проекты',    badge: null,   badgeType: '' },
    { to: '/tenders',  icon: 'tender',   label: 'Тендеры',    badge: '12',  badgeType: 'green' },
  ]
  const nav2 = [
    { to: '/crm',      icon: 'crm',      label: 'CRM лиды',   badge: null,   badgeType: '' },
    { to: '/calendar', icon: 'calendar', label: 'Календарь',  badge: null,   badgeType: '' },
    { to: '/overdue',  icon: 'alert',    label: 'Просрочки',  badge: '4',   badgeType: 'red' },
  ]
  const nav3 = [
    { to: '/ai',       icon: 'ai',       label: 'AI Менеджер', badge: null,  badgeType: '' },
    { to: '/invites',  icon: 'mail',     label: 'Приглашения', badge: null,  badgeType: '' },
  ]

  const NavItem = ({ to, icon, label, badge, badgeType }) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `dt-nav-item${isActive ? ' dt-nav-item--active' : ''}`}
    >
      <NavIcon type={icon} />
      <span>{label}</span>
      {badge && <span className={`dt-badge dt-badge--${badgeType}`}>{badge}</span>}
    </NavLink>
  )

  return (
    <div className="dt-shell">
      <header className="dt-topbar">
        <div className="dt-topbar-brand">
          <div className="dt-brand-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="7" height="7" rx="1" fill="#60a5fa"/>
              <rect x="10" y="1" width="7" height="7" rx="1" fill="#93c5fd" opacity=".6"/>
              <rect x="1" y="10" width="7" height="7" rx="1" fill="#93c5fd" opacity=".6"/>
              <rect x="10" y="10" width="7" height="7" rx="1" fill="#60a5fa" opacity=".4"/>
            </svg>
          </div>
          <div>
            <div className="dt-brand-name">Digital Twin</div>
            <div className="dt-brand-sub">Construction Management</div>
          </div>
        </div>

        <div className="dt-topbar-search">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span>Поиск проектов…</span>
        </div>

        <div className="dt-topbar-right">
          <button className="dt-icon-btn" aria-label="Уведомления">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2a5 5 0 00-5 5v3l-1 1h12l-1-1V7a5 5 0 00-5-5zm-1 11a1 1 0 002 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="dt-icon-btn" aria-label="Настройки" onClick={() => navigate('/settings')}>
            <NavIcon type="settings" />
          </button>
          <div className="dt-user-chip" onClick={() => navigate('/director')}>
            <div className="dt-user-avatar">МК</div>
            <span>Milena K.</span>
          </div>
        </div>
      </header>

      <div className="dt-body">
        <nav className="dt-sidebar" aria-label="Основная навигация">
          <div className="dt-nav-section">Главная</div>
          {nav1.map(n => <NavItem key={n.to} {...n} />)}

          <div className="dt-nav-section">Управление</div>
          {nav2.map(n => <NavItem key={n.to} {...n} />)}

          <div className="dt-nav-section">Инструменты</div>
          {nav3.map(n => <NavItem key={n.to} {...n} />)}

          <div className="dt-sidebar-spacer" />

          <NavLink to="/director" className={({ isActive }) => `dt-nav-item dt-nav-item--director${isActive ? ' dt-nav-item--active' : ''}`}>
            <NavIcon type="director" />
            <span>Профиль директора</span>
          </NavLink>

          <div className="dt-sidebar-footer">
            <div className="dt-connection-dot" />
            <span>ODOO подключён</span>
          </div>
        </nav>

        <main className="dt-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}

/* ── Projects index ──────────────────────────────── */
function ProjectsPage() {
  const navigate = useNavigate()
  return (
    <div className="pl-page">
      <TendersModal onClose={() => {}} />
      <div className="pl-page-header">
        <div>
          <h2 className="pl-page-title">Проекты</h2>
        </div>
        <button className="pl-new-btn" onClick={() => navigate('/projects/new')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Новый проект
        </button>
      </div>
      <ProjectList onSelect={p => navigate(`/projects/${p.id}`, { state: { project: p } })} />
    </div>
  )
}

/* ── Placeholder pages ───────────────────────────── */
function PlaceholderPage({ title, icon, desc }) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-icon">{icon}</div>
      <h2 className="placeholder-title">{title}</h2>
      <p className="placeholder-desc">{desc}</p>
    </div>
  )
}

/* ── Root ────────────────────────────────────────── */
export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/"                element={<ProjectsPage />} />
          <Route path="/projects/new"    element={<CreateProject onDone={() => window.history.back()} />} />
          <Route path="/projects/:id"    element={<ProjectDetailRoute />} />
          <Route path="/tenders"         element={<TendersPage />} />
          <Route path="/crm"             element={<PlaceholderPage title="CRM лиды" icon="👥" desc="Заявки с сайта компании — скоро" />} />
          <Route path="/calendar"        element={<PlaceholderPage title="Календарь" icon="📅" desc="Общий календарь проектов — скоро" />} />
          <Route path="/overdue"         element={<PlaceholderPage title="Просрочки" icon="⚠️" desc="Сводка просроченных задач — скоро" />} />
          <Route path="/ai"              element={<PlaceholderPage title="AI Менеджер" icon="🤖" desc="Откройте проект и перейдите во вкладку AI Менеджер" />} />
          <Route path="/invites"         element={<PlaceholderPage title="Приглашения" icon="✉️" desc="История отправленных приглашений — скоро" />} />
          <Route path="/director"        element={<DirectorPage />} />
          <Route path="*"               element={<PlaceholderPage title="Страница не найдена" icon="🔍" desc="" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}

/* ── Project detail route wrapper ────────────────── */
function ProjectDetailRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state } = window.history.state?.usr ? { state: window.history.state.usr } : { state: null }

  const [project, setProject] = useState(
    (window.history.state?.usr?.project) || null
  )

  useEffect(() => {
    if (!project) {
      import('./api').then(({ getProjects }) => {
        getProjects().then(res => {
          const found = res.data.projects.find(p => String(p.id) === String(id))
          if (found) setProject(found)
          else navigate('/')
        }).catch(() => navigate('/'))
      })
    }
  }, [id])

  if (!project) return <div className="project-loading"><div className="pl-spinner" /> Загрузка…</div>

  return <ProjectDetail project={project} onBack={() => navigate('/')} />
}