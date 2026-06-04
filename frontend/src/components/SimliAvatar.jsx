/**
 * SimliAvatar.jsx — simli-client v3
 * Реальные события LivekitTransport: start / error / startup_error
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import './SimliAvatar.css'

const SIMLI_API_KEY = import.meta.env.VITE_SIMLI_API_KEY || ''
const SIMLI_FACE_ID = import.meta.env.VITE_SIMLI_FACE_ID || 'dd10cb5a-d31d-4f12-b69f-6db3383c006e'

const SimliAvatar = forwardRef(function SimliAvatar({ onReady, onDisconnected }, ref) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [log,   setLog]   = useState([])

  const videoRef     = useRef(null)
  const audioRef     = useRef(null)
  const clientRef    = useRef(null)
  const isConnecting = useRef(false)

  const addLog = (msg) => {
    console.log('[Simli]', msg)
    setLog(prev => [...prev.slice(-8), msg])
  }

  useImperativeHandle(ref, () => ({
    stop:      () => disconnect(),
    sendAudio: (data) => sendAudio(data),
  }))

  useEffect(() => () => disconnect(), [])

  async function connect() {
    if (isConnecting.current) return

    if (clientRef.current) {
      try { await clientRef.current.stop() } catch (_) {}
      clientRef.current = null
      await new Promise(r => setTimeout(r, 2000))
    }

    isConnecting.current = true
    try {
      setState('connecting')
      setError('')
      setLog([])

      if (!SIMLI_API_KEY) throw new Error('VITE_SIMLI_API_KEY не задан в frontend/.env')

      addLog('1. Запрашиваем токен у Simli…')
      const { generateSimliSessionToken, SimliClient } = await import('simli-client')

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
      if (!token) throw new Error('Нет session_token: ' + JSON.stringify(tokenResult))
      addLog(`2. Токен получен (${token.slice(0, 16)}…)`)

      addLog('3. Создаём SimliClient (livekit)…')
      const client = new SimliClient(
        token,
        videoRef.current,
        audioRef.current,
        null,
        undefined,
        'livekit',
      )
      clientRef.current = client

      // Реальные события в v3 LivekitTransport: 'start', 'error', 'startup_error'
      client.on('start', () => {
        addLog('✅ Аватар живой!')
        setState('connected')
        isConnecting.current = false
        onReady?.((data) => sendAudio(data))
      })

      client.on('startup_error', (msg) => {
        const m = String(msg || 'startup error')
        addLog('STARTUP ERROR: ' + m)
        setError(m)
        setState('error')
        isConnecting.current = false
        onDisconnected?.()
      })

      client.on('error', (msg) => {
        const m = String(msg?.message || msg || 'error')
        addLog('ОШИБКА: ' + m)
        setError(m)
        setState('error')
        isConnecting.current = false
        onDisconnected?.()
      })

      addLog('4. Подключаемся…')
      await client.start()

    } catch (e) {
      const msg = e?.message || String(e)
      addLog('ОШИБКА: ' + msg)
      setError(msg)
      setState('error')
      isConnecting.current = false
      onDisconnected?.()
    }
  }

  function disconnect() {
    isConnecting.current = false
    try { clientRef.current?.stop() } catch (_) {}
    clientRef.current = null
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
          <button className="simli-connect-btn" onClick={connect}>▶ Подключить видео</button>
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
          <button className="simli-retry-btn" onClick={connect}>🔄 Попробовать снова</button>
          {error.includes('RATE LIMIT') && (
            <div className="simli-rate-hint">Подождите 1-2 минуты — Simli освободит старую сессию</div>
          )}
        </div>
      )}

      {state === 'connected' && (
        <div className="simli-live-badge">🔴 LIVE</div>
      )}
    </div>
  )
})

export default SimliAvatar