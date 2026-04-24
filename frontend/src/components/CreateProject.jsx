import { useState, useRef } from 'react'
import './CreateProject.css'

const API = '/api'

async function apiPost(path, body, isFormData = false) {
  const options = {
    method: 'POST',
    body: isFormData ? body : JSON.stringify(body),
  }

  if (!isFormData) {
    options.headers = { 'Content-Type': 'application/json' }
  }

  const res = await fetch(API + path, options)

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(text || 'Invalid server response')
    }

    if (!res.ok) {
      throw new Error(data.detail || text || 'Request failed')
    }

    return data

  if (!res.ok) {
    throw new Error(data.detail || 'Request failed')
  }

  return data
}

function Badge({ text, color = '#185FA5' }) {
  return (
    <span style={{
      background: color + '18',
      color,
      border: `1px solid ${color}33`,
      borderRadius: 20,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  )
}

const PHASE_COLORS = ['#185FA5', '#2E7D32', '#6A1B9A', '#E65100', '#00695C']
const phaseColor = (p) => PHASE_COLORS[(parseInt(p) - 1) % PHASE_COLORS.length] || '#185FA5'

function Steps({ current }) {
  const steps = ['Upload Plan', 'Review Tasks', 'Push to Odoo']
  return (
    <div className="cp-steps">
      {steps.map((s, i) => (
        <div key={i} className={`cp-step ${i < current ? 'done' : i === current ? 'active' : ''}`}>
          <div className="cp-step-dot">{i < current ? '✓' : i + 1}</div>
          <span>{s}</span>
          {i < steps.length - 1 && <div className="cp-step-line" />}
        </div>
      ))}
    </div>
  )
}

function UploadStep({ onParsed }) {
  const [projectName, setProjectName] = useState('')
  const [startDate,   setStartDate]   = useState('')
  const [file,        setFile]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const dropRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.docx') && !f.name.endsWith('.txt')) {
      setError('Only .docx or .txt files are supported.')
      return
    }
    setError('')
    setFile(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    dropRef.current.classList.remove('drag-over')
    handleFile(e.dataTransfer.files[0])
  }

  const submit = async () => {
      if (!file || !projectName.trim() || !startDate) {
        setError('Please fill in all fields and choose a file.')
        return
      }
      setLoading(true)
      setError('')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('project_name', projectName.trim())
        fd.append('start_date', startDate)

        console.log('🚀 Sending request...')

        const data = await apiPost('/projects/create-from-plan', fd, true)

        console.log('✅ Response:', data)

        onParsed(data.plan)
      } catch (e) {
        console.error('❌ ERROR:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
  }

  return (
    <div className="cp-upload">
      <div className="cp-field">
        <label>Project name</label>
        <input
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder="e.g. Инженерно-геодезические изыскания — Алматы 2025"
        />
      </div>

      <div className="cp-field">
        <label>Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
      </div>

      <div className="cp-field">
        <label>Work plan document</label>
        <div
          ref={dropRef}
          className={`cp-dropzone ${file ? 'has-file' : ''}`}
          onDragOver={e => { e.preventDefault(); dropRef.current.classList.add('drag-over') }}
          onDragLeave={() => dropRef.current.classList.remove('drag-over')}
          onDrop={onDrop}
          onClick={() => document.getElementById('cp-file-input').click()}
        >
          <input
            id="cp-file-input"
            type="file"
            accept=".docx,.txt"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />
          {file ? (
            <>
              <div className="cp-file-icon">📄</div>
              <div className="cp-file-name">{file.name}</div>
              <div className="cp-file-size">{(file.size / 1024).toFixed(1)} KB</div>
            </>
          ) : (
            <>
              <div className="cp-drop-icon">⬆️</div>
              <div className="cp-drop-label">Drop .docx or .txt here</div>
              <div className="cp-drop-hint">or click to browse</div>
            </>
          )}
        </div>
      </div>

      {error && <div className="cp-error">{error}</div>}

      <button className="cp-primary-btn" onClick={submit} disabled={loading}>
        {loading ? <><span className="cp-spinner" /> Parsing with AI…</> : 'Parse Work Plan →'}
      </button>
    </div>
  )
}

function ReviewStep({ plan, onConfirm, onBack }) {
  const [tasks, setTasks] = useState(plan.tasks)

  const update = (idx, field, val) => {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t))
  }

  const phases = [...new Set(tasks.map(t => t.phase))].sort()

  return (
    <div className="cp-review">
      <div className="cp-review-header">
        <div>
          <h3 className="cp-review-title">{plan.project_name}</h3>
          <span className="cp-review-sub">
            {tasks.length} tasks · starts {plan.start_date}
          </span>
        </div>
        <div className="cp-phase-legend">
          {phases.map(p => (
            <Badge key={p} text={`Phase ${p}`} color={phaseColor(p)} />
          ))}
        </div>
      </div>

      <div className="cp-gantt">
        <div className="cp-gantt-row cp-gantt-head">
          <div className="cp-gantt-name">Task</div>
          <div className="cp-gantt-assignees">Assignees</div>
          <div className="cp-gantt-dur">Days</div>
          <div className="cp-gantt-deadline">Deadline</div>
        </div>

        {tasks.map((t, i) => (
          <div key={t.id} className="cp-gantt-row">
            <div className="cp-gantt-name">
              <Badge text={`P${t.phase}`} color={phaseColor(t.phase)} />
              <span
                contentEditable
                suppressContentEditableWarning
                className="cp-editable"
                onBlur={e => update(i, 'name_ru', e.target.innerText)}
              >
                {t.name_ru || t.name}
              </span>
            </div>
            <div className="cp-gantt-assignees">
              {(t.assignees || []).join(', ') || <em style={{ color: '#aaa' }}>—</em>}
            </div>
            <div className="cp-gantt-dur">
              <input
                type="number"
                min="1"
                value={t.duration_days}
                onChange={e => update(i, 'duration_days', parseInt(e.target.value) || 1)}
                className="cp-dur-input"
              />
            </div>
            <div className="cp-gantt-deadline">
              <input
                type="date"
                value={t.deadline || ''}
                onChange={e => update(i, 'deadline', e.target.value)}
                className="cp-date-input"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="cp-review-actions">
        <button className="cp-ghost-btn" onClick={onBack}>← Re-upload</button>
        <button className="cp-primary-btn" onClick={() => onConfirm({ ...plan, tasks })}>
          Push to Odoo →
        </button>
      </div>
    </div>
  )
}

function SuccessStep({ projectId, onDone }) {
  return (
    <div className="cp-success">
      <div className="cp-success-icon">🎉</div>
      <h3>Project created!</h3>
      <p>
        All tasks have been pushed to Odoo.<br />
        Project ID: <strong>{projectId}</strong>
      </p>
      <button className="cp-primary-btn" onClick={onDone}>
        Back to Projects
      </button>
    </div>
  )
}

export default function CreateProject({ onDone }) {
  const [step,      setStep]      = useState(0)
  const [plan,      setPlan]      = useState(null)
  const [projectId, setProjectId] = useState(null)
  const [pushing,   setPushing]   = useState(false)
  const [pushError, setPushError] = useState('')

  const handleParsed = (p) => { setPlan(p); setStep(1) }

  const handleConfirm = async (approvedPlan) => {
    setPushing(true)
    setPushError('')
    try {
      const data = await apiPost('/projects/confirm-plan', {
        plan:         approvedPlan,
        project_name: approvedPlan.project_name,
      })
      setProjectId(data.project_id)
      setStep(2)
    } catch (e) {
      setPushError(e.message)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="cp-root">
      <button className="cp-back-link" onClick={onDone}>← All Projects</button>
      <h2 className="cp-heading">Create New Project</h2>
      <p className="cp-subheading">
        Upload your work-plan document — the AI will extract tasks, assign deadlines,
        and push everything to Odoo automatically.
      </p>

      <Steps current={step} />

      <div className="cp-card">
        {step === 0 && <UploadStep onParsed={handleParsed} />}
        {step === 1 && (
          <>
            {pushError && <div className="cp-error">{pushError}</div>}
            {pushing
              ? <div className="cp-pushing"><span className="cp-spinner" /> Pushing to Odoo…</div>
              : <ReviewStep plan={plan} onConfirm={handleConfirm} onBack={() => setStep(0)} />
            }
          </>
        )}
        {step === 2 && <SuccessStep projectId={projectId} onDone={onDone} />}
      </div>
    </div>
  )
}