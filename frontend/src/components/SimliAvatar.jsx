/**
 * SimliAvatar.jsx
 * Simli WebRTC integration with full debug logging.
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { simliStartSession } from '../api'
import './SimliAvatar.css'

const SIMLI_HTTP = 'https://api.simli.ai'

const SimliAvatar = forwardRef(function SimliAvatar({ onReady, onDisconnected }, ref) {
  const [state,   setState]   = useState('idle')
  const [error,   setError]   = useState('')
  const [log,     setLog]     = useState([])

  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const pcRef    = useRef(null)
  const dcRef    = useRef(null)

  const addLog = (msg) => {
    console.log('[Simli]', msg)
    setLog(prev => [...prev.slice(-8), msg])
  }

  useImperativeHandle(ref, () => ({
    start:     () => connect(),
    stop:      () => disconnect(),
    sendAudio: (buf) => sendAudio(buf),
  }))

  useEffect(() => () => disconnect(), [])

  async function connect() {
    try {
      setState('connecting')
      setError('')
      setLog([])

      // ── Step 1: get session token from our backend ──────────
      addLog('1. Requesting session token…')
      const res  = await simliStartSession({})
      const data = res.data
      addLog(`1. Got: ${JSON.stringify(data)}`)

      const sessionToken = data.session_token || data.sessionToken || ''
      if (!sessionToken) {
        throw new Error(`No session token in response: ${JSON.stringify(data)}`)
      }
      addLog(`2. Session token: ${sessionToken.slice(0, 20)}…`)

      // ── Step 2: create RTCPeerConnection ────────────────────
      const iceServers = data.ice_servers?.length
        ? data.ice_servers
        : [{ urls: 'stun:stun.l.google.com:19302' }]

      addLog(`3. Creating RTCPeerConnection with ${iceServers.length} ICE server(s)`)
      const pc = new RTCPeerConnection({ iceServers })
      pcRef.current = pc

      // Track remote video/audio
      pc.ontrack = (ev) => {
        addLog(`4. Got remote track: ${ev.track.kind}`)
        const stream = ev.streams[0] || new MediaStream([ev.track])
        if (ev.track.kind === 'video' && videoRef.current) {
          videoRef.current.srcObject = stream
          addLog('4. Video stream attached')
        }
        if (ev.track.kind === 'audio' && audioRef.current) {
          audioRef.current.srcObject = stream
          addLog('4. Audio stream attached')
        }
      }

      pc.oniceconnectionstatechange = () => {
        addLog(`ICE state: ${pc.iceConnectionState}`)
        if (['disconnected','failed','closed'].includes(pc.iceConnectionState)) {
          setState('idle')
          onDisconnected?.()
        }
      }

      pc.onconnectionstatechange = () => {
        addLog(`Connection state: ${pc.connectionState}`)
        if (pc.connectionState === 'connected') {
          setState('connected')
        }
      }

      // ── Step 3: data channel for audio ─────────────────────
      addLog('5. Creating audio data channel')
      const dc = pc.createDataChannel('audio')
      dcRef.current = dc

      dc.onopen  = () => {
        addLog('5. Data channel OPEN — avatar ready')
        setState('connected')
        onReady?.((buf) => sendAudio(buf))
      }
      dc.onclose = () => addLog('5. Data channel closed')
      dc.onerror = (e) => addLog(`5. Data channel error: ${e}`)

      // Add transceiver so Simli knows to send us video+audio
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'sendrecv' })

      // ── Step 4: create offer ────────────────────────────────
      addLog('6. Creating SDP offer…')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      addLog('6. Local description set')

      // Wait for ICE gathering
      addLog('7. Gathering ICE candidates…')
      await new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 5000)
      })
      addLog('7. ICE gathering complete')

      // ── Step 5: send offer to Simli ─────────────────────────
      addLog('8. Sending offer to Simli /startWebRTCSession…')
      const sdpBody = {
        sdp:           pc.localDescription.sdp,
        type:          pc.localDescription.type,
        session_token: sessionToken,
      }
      addLog(`8. Payload keys: ${Object.keys(sdpBody).join(', ')}`)

      const sdpRes = await fetch(`${SIMLI_HTTP}/startWebRTCSession`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sdpBody),
      })

      const sdpText = await sdpRes.text()
      addLog(`8. Simli response ${sdpRes.status}: ${sdpText.slice(0, 120)}`)

      if (!sdpRes.ok) {
        throw new Error(`Simli SDP error ${sdpRes.status}: ${sdpText}`)
      }

      const answer = JSON.parse(sdpText)
      addLog(`9. Setting remote description (type: ${answer.type})`)
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
      addLog('9. Remote description set — waiting for connection…')

    } catch (e) {
      const msg = e.message || String(e)
      addLog(`ERROR: ${msg}`)
      setError(msg)
      setState('error')
      onDisconnected?.()
    }
  }

  function disconnect() {
    dcRef.current?.close()
    pcRef.current?.close()
    pcRef.current = null
    dcRef.current = null
    setState('idle')
  }

  function sendAudio(float32Array) {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return
    const pcm16 = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    dc.send(pcm16.buffer)
  }

  return (
    <div className={`simli-wrap simli-wrap--${state}`}>
      <video ref={videoRef} className="simli-video" autoPlay playsInline />
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {state === 'idle' && (
        <div className="simli-overlay">
          <div className="simli-placeholder">АГ</div>
        </div>
      )}

      {state === 'connecting' && (
        <div className="simli-overlay">
          <div className="simli-spinner-wrap">
            <span className="simli-spinner" />
            <span className="simli-connecting-text">Подключение…</span>
          </div>
          {/* Debug log shown during connection */}
          <div className="simli-debug-log">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="simli-overlay simli-overlay--error">
          <div className="simli-error-icon">⚠️</div>
          <div className="simli-error-text">{error}</div>
          <div className="simli-debug-log simli-debug-log--error">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          <button className="simli-retry-btn" onClick={connect}>Retry</button>
        </div>
      )}

      {state === 'connected' && (
        <div className="simli-live-badge">🔴 LIVE</div>
      )}
    </div>
  )
})

export default SimliAvatar