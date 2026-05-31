/**
 * SimliAvatar.jsx
 * Calls Simli API directly from the browser (required — Simli blocks server-to-server).
 * Uses simli-client npm package for WebRTC.
 * Install: npm install simli-client
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import './SimliAvatar.css'

// Read from environment — add to frontend/.env:
// VITE_SIMLI_API_KEY=your_key_here
// VITE_SIMLI_FACE_ID=dd10cb5a-d31d-4f12-b69f-6db3383c006e
const SIMLI_API_KEY = import.meta.env.VITE_SIMLI_API_KEY || ''
const SIMLI_FACE_ID = import.meta.env.VITE_SIMLI_FACE_ID || 'dd10cb5a-d31d-4f12-b69f-6db3383c006e'

const SimliAvatar = forwardRef(function SimliAvatar({ onReady, onDisconnected }, ref) {
  const [state,  setState]  = useState('idle')
  const [error,  setError]  = useState('')
  const [log,    setLog]    = useState([])

  const videoRef  = useRef(null)
  const audioRef  = useRef(null)
  const clientRef = useRef(null)

  const addLog = (msg) => {
    console.log('[Simli]', msg)
    setLog(prev => [...prev.slice(-8), msg])
  }

  useImperativeHandle(ref, () => ({
    start:     () => connect(),
    stop:      () => disconnect(),
    sendAudio: (data) => sendAudio(data),
  }))

  useEffect(() => () => disconnect(), [])

  async function connect() {
    try {
      setState('connecting')
      setError('')
      setLog([])

      if (!SIMLI_API_KEY) {
        throw new Error('VITE_SIMLI_API_KEY not set in frontend/.env')
      }

      // Step 1: get session token directly from Simli (browser request — allowed)
      addLog('1. Requesting session token from Simli…')
      const { generateSimliSessionToken } = await import('simli-client')

      const tokenResult = await generateSimliSessionToken({
        apiKey: SIMLI_API_KEY,
        config: {
          faceId:           SIMLI_FACE_ID,
          handleSilence:    false,
          maxSessionLength: 600,
          maxIdleTime:      180,
        },
      })

      const token = tokenResult?.session_token
      if (!token) throw new Error('No session_token in Simli response: ' + JSON.stringify(tokenResult))
      addLog(`2. Token OK (${token.slice(0, 16)}…)`)

      // Step 2: init SimliClient
      addLog('3. Loading SimliClient…')
      const { SimliClient } = await import('simli-client')

      addLog('4. Creating client (livekit mode)…')
      const client = new SimliClient(
        token,
        videoRef.current,
        audioRef.current,
        null,       // no ICE servers needed for livekit
        'info',
        'livekit',
      )
      clientRef.current = client

      client.on('start', () => {
        addLog('✅ Avatar live!')
        setState('connected')
        onReady?.((data) => sendAudio(data))
      })

      client.on('stop', () => {
        addLog('Session stopped')
        setState('idle')
        onDisconnected?.()
      })

      client.on('error', (e) => {
        const msg = String(e?.message || e)
        addLog('ERROR: ' + msg)
        setError(msg)
        setState('error')
        onDisconnected?.()
      })

      client.on('startup_error', (msg) => {
        addLog('STARTUP ERROR: ' + msg)
        setError(String(msg))
        setState('error')
        onDisconnected?.()
      })

      client.on('speaking', () => addLog('Speaking…'))
      client.on('silent',   () => addLog('Silent'))

      addLog('5. Starting connection…')
      await client.start()

    } catch (e) {
      const msg = e?.message || String(e)
      addLog('ERROR: ' + msg)
      setError(msg)
      setState('error')
      onDisconnected?.()
    }
  }

  function disconnect() {
    try { clientRef.current?.stop() } catch (_) {}
    clientRef.current = null
    setState('idle')
  }

  function sendAudio(float32OrUint8) {
    const client = clientRef.current
    if (!client) return
    if (float32OrUint8 instanceof Float32Array) {
      const pcm = new Int16Array(float32OrUint8.length)
      for (let i = 0; i < float32OrUint8.length; i++) {
        const s = Math.max(-1, Math.min(1, float32OrUint8[i]))
        pcm[i]  = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      client.sendAudioData(new Uint8Array(pcm.buffer))
    } else {
      client.sendAudioData(float32OrUint8)
    }
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