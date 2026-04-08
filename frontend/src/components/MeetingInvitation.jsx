import { useState } from 'react'
import { getMeetingInvitation } from '../api'
import './MeetingInvitation.css'

export default function MeetingInvitation({ projectId }) {
  const [invitation, setInvitation] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = () => {
    setLoading(true)
    getMeetingInvitation(projectId)
      .then(res => setInvitation(res.data.invitation))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }

  return (
    <div>
      <h3 className="subsection-title">Meeting Invitation</h3>
      <p className="hint">
        Generate an AI meeting invitation based on current project tasks.
      </p>
      <button className="primary-btn" onClick={generate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Invitation'}
      </button>

      {invitation && (
        <div className="invitation-box">
          <pre>{invitation}</pre>
        </div>
      )}
    </div>
  )
}