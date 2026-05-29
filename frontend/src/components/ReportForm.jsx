import { useEffect, useState, useRef, useCallback } from 'react'
import { getTasks, submitReportFile } from '../api'
import './ReportForm.css'

export default function ReportForm({ projectId }) {
  const [tasks,    setTasks]   = useState([])
  const [taskId,   setTaskId]  = useState('')
  const [file,     setFile]    = useState(null)
  const [dragging, setDragging] = useState(false)
  const [result,   setResult]  = useState(null)
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState('')
  const inputRef = useRef()

  useEffect(() => {
    getTasks(projectId).then(res => {
      const t = res.data.tasks
      setTasks(t)
      if (t.length > 0) setTaskId(String(t[0].id))
    })
  }, [projectId])

  const handleFile = (f) => {
    if (!f) return
    const ok = f.name.endsWith('.docx') || f.name.endsWith('.txt')
    if (!ok) { setError('Only .docx and .txt files are supported.'); return }
    setError('')
    setFile(f)
    setResult(null)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const handleSubmit = async () => {
    if (!taskId || !file) return
    setLoading(true)
    setError('')
    const fd = new FormData()
    fd.append('task_id', taskId)
    fd.append('file', file)
    try {
      const res = await submitReportFile(fd)
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed. Check server logs.')
    } finally {
      setLoading(false)
    }
  }

  const selectedTask = tasks.find(t => String(t.id) === taskId)

  return (
    <div className="rf-root">
      <h3 className="subsection-title">Submit Completion Report</h3>
      <p className="rf-hint">
        Upload the completion report for a task. The AI will validate the report
        and automatically mark the task as Done in ODOO if it meets the requirements.
      </p>

      {/* Task selector */}
      <div className="rf-field">
        <label>Task</label>
        <select value={taskId} onChange={e => { setTaskId(e.target.value); setResult(null) }}>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.stage_id ? ` — ${t.stage_id[1]}` : ''}
            </option>
          ))}
        </select>
        {selectedTask && selectedTask.stage_id && (
          <span className={'rf-stage-badge rf-stage-' + selectedTask.stage_id[1].toLowerCase().replace(/\s+/g,'-')}>
            {selectedTask.stage_id[1]}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={`rf-dropzone ${dragging ? 'rf-drag-over' : ''} ${file ? 'rf-has-file' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.txt"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="rf-file-info">
            <span className="rf-file-icon">📄</span>
            <div>
              <div className="rf-file-name">{file.name}</div>
              <div className="rf-file-size">{(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <button className="rf-remove-btn" onClick={e => { e.stopPropagation(); setFile(null); setResult(null) }}>✕</button>
          </div>
        ) : (
          <div className="rf-drop-prompt">
            <span className="rf-drop-icon">📂</span>
            <div className="rf-drop-text">Drag and drop your report here</div>
            <div className="rf-drop-sub">or click to browse — .docx or .txt</div>
          </div>
        )}
      </div>

      {error && <div className="rf-error">{error}</div>}

      <button
        className="rf-submit-btn"
        onClick={handleSubmit}
        disabled={loading || !file || !taskId}
      >
        {loading ? (
          <><span className="rf-spinner" /> Validating report…</>
        ) : (
          'Submit & Validate'
        )}
      </button>

      {/* Result */}
      {result && (
          <div className={`rf-result ${result.status === 'approved' ? 'rf-approved' : 'rf-rejected'}`}>
              <div className="rf-result-header">
                  {result.status === 'approved'
                      ? '✓ Report Approved'
                      : '✗ Report Rejected'}
              </div>

              <div className="rf-result-task">
                  <strong>Task:</strong> {result.task_name}
              </div>

              <div className="rf-result-feedback">
                  {result.feedback}
              </div>

              {result.status === 'approved' && (
                  <div className="rf-result-odoo">
                      {result.odoo_stage_updated
                          ? 'Task stage updated to Done in ODOO.'
                          : 'Report approved but ODOO stage could not be updated automatically.'}
                  </div>
              )}

              {result.status === 'rejected' && (
                  <div className="rf-result-action">
                      Please revise the report and resubmit.
                  </div>
              )}

              {result.report_preview && (
                  <details className="rf-preview">
                      <summary>Report preview</summary>
                      <p>{result.report_preview}{result.report_preview.length >= 300 ? '…' : ''}</p>
                  </details>
              )}
          </div>
      )}
    </div>
  )
}