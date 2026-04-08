import { useEffect, useState } from 'react'
import { getTasks, submitReport } from '../api'
import './ReportForm.css'

export default function ReportForm({ projectId }) {
  const [tasks, setTasks]         = useState([])
  const [taskId, setTaskId]       = useState('')
  const [employee, setEmployee]   = useState('')
  const [reportText, setReport]   = useState('')
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    getTasks(projectId).then(res => {
      setTasks(res.data.tasks)
      if (res.data.tasks.length > 0) {
        setTaskId(res.data.tasks[0].id)
      }
    })
  }, [projectId])

  const handleSubmit = () => {
    if (!employee || !reportText || !taskId) return
    setLoading(true)
    submitReport({
      task_id: parseInt(taskId),
      employee_name: employee,
      report_text: reportText
    })
      .then(res => setResult(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }

  return (
    <div>
      <h3 className="subsection-title">Submit Report</h3>

      <div className="form-group">
        <label>Task</label>
        <select value={taskId} onChange={e => setTaskId(e.target.value)}>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Employee name</label>
        <input
          type="text"
          placeholder="e.g. David Miller"
          value={employee}
          onChange={e => setEmployee(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Report</label>
        <textarea
          rows={5}
          placeholder="Describe the work done, any issues, and current completion percentage..."
          value={reportText}
          onChange={e => setReport(e.target.value)}
        />
      </div>

      <button className="primary-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Validating...' : 'Submit Report'}
      </button>

      {result && (
        <div className={`result-box ${result.status === 'approved' ? 'approved' : 'rejected'}`}>
          <div className="result-status">
            {result.status === 'approved' ? '✓ Report Approved' : '✗ Report Rejected'}
          </div>
          <div className="result-feedback">{result.feedback}</div>
          <div className="result-work">
            {result.further_work_allowed
              ? 'Further work is allowed to proceed.'
              : 'Please revise and resubmit the report.'}
          </div>
        </div>
      )}
    </div>
  )
}