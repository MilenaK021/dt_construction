/**
 * SimliAvatar.jsx
 * Uses the official simli-client npm package.
 * Install: npm install simli-client  (run in frontend/ folder)
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { simliStartSession } from '../api'
import './SimliAvatar.css'

const SimliAvatar = forwardRef(function SimliAvatar({ onReady, onDisconnected }, ref) {
  const [state,  setState]  = useState('idle')
  const [error,  setError]  = useState('')
  const [log,    setLog]    = useState([])

  const videoRef  = useRef(null)
  const audioRef  = useRef(null)
  const clientRef = useRef(null)   // SimliClient instance

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

      // Step 1: get session token from our backend
      addLog('1. Getting session token…')
      const res   = await simliStartSession({})
      const token = res.data.session_token
      if (!token) throw new Error('No session token returned')
      addLog(`2. Token received (${token.slice(0, 20)}…)`)

      // Step 2: dynamically import simli-client
      addLog('3. Loading SimliClient…')
      const { SimliClient } = await import('simli-client')

      // Step 3: create and start client
      addLog('4. Initialising SimliClient (livekit mode)…')
      const client = new SimliClient(
        token,
        videoRef.current,
        audioRef.current,
        null,           // iceServers — null = use livekit mode
        'info',         // log level
        'livekit',      // transport mode — more firewall-friendly
      )
      clientRef.current = client

      // Step 4: wire events
      client.on('start', () => {
        addLog('✅ Connected — avatar live!')
        setState('connected')
        onReady?.((data) => sendAudio(data))
      })

      client.on('stop',  () => {
        addLog('Connection stopped')
        setState('idle')
        onDisconnected?.()
      })

      client.on('error', (e) => {
        const msg = String(e?.message || e)
        addLog(`ERROR: ${msg}`)
        setError(msg)
        setState('error')
        onDisconnected?.()
      })

      client.on('startup_error', (msg) => {
        addLog(`STARTUP ERROR: ${msg}`)
        setError(msg)
        setState('error')
        onDisconnected?.()
      })

      client.on('speaking', () => addLog('Avatar speaking'))
      client.on('silent',   () => addLog('Avatar silent'))

      addLog('5. Starting connection…')
      await client.start()

    } catch (e) {
      const msg = e?.message || String(e)
      addLog(`ERROR: ${msg}`)
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

    // simli-client expects Uint8Array PCM16 at 16kHz
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