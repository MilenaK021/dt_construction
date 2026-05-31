import { useState, useRef, useEffect, useCallback } from 'react'
import { avatarChat, avatarEndSession } from '../api'
import SimliAvatar from './SimliAvatar'
import './AvatarChat.css'

const AVATAR = {
  name:     'Алексей',
  title:    'Руководитель проектного отдела',
  initials: 'АГ',
}

const SUGGESTIONS = [
  'Какие задачи сейчас в работе?',
  'Есть ли просроченные задачи?',
  'Кто отвечает за задачи?',
  'Как продвигается проект в целом?',
  'Что нужно сделать в первую очередь?',
]

// ── Groq TTS via backend → PCM chunks → Simli ────────────────────────────────
async function speakWithGroq(text, onPCMChunk) {
  const res = await fetch('/api/avatar/tts', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`TTS error ${res.status}`)

  const arrayBuf = await res.arrayBuffer()

  // Decode WAV → PCM Float32 → Int16 → Uint8 for Simli
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx      = new AudioCtx({ sampleRate: 16000 })
  const decoded  = await ctx.decodeAudioData(arrayBuf)
  ctx.close()

  const raw    = decoded.getChannelData(0)          // Float32Array
  const pcm16  = new Int16Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    const s   = Math.max(-1, Math.min(1, raw[i]))
    pcm16[i]  = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  // Send in 4096-sample chunks so Simli can start rendering immediately
  const CHUNK = 4096
  for (let i = 0; i < pcm16.length; i += CHUNK) {
    const slice = pcm16.slice(i, i + CHUNK)
    onPCMChunk(new Uint8Array(slice.buffer))
    // Small yield so UI stays responsive
    await new Promise(r => setTimeout(r, 0))
  }
}

// ── Fallback: browser TTS ─────────────────────────────────────────────────────
function speakBrowser(text) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return }
    window.speechSynthesis.cancel()
    const utt    = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const v      = voices.find(v => v.lang.startsWith('ru')) || voices[0]
    if (v) utt.voice = v
    utt.rate   = 0.92
    utt.onend  = resolve
    utt.onerror = resolve
    window.speechSynthesis.speak(utt)
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AvatarChat({ projectId, projectName }) {
  const [history,    setHistory]    = useState([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [speaking,   setSpeaking]   = useState(false)
  const [simliReady, setSimliReady] = useState(false)
  const [simliOn,    setSimliOn]    = useState(false)
  const [ending,     setEnding]     = useState(false)
  const [ended,      setEnded]      = useState(false)
  const [reportUrl,  setReportUrl]  = useState(null)
  const [error,      setError]      = useState('')
  const [liveText,   setLiveText]   = useState('')

  const bottomRef   = useRef()
  const inputRef    = useRef()
  const simliRef    = useRef()
  const sendAudioFn = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading, liveText])

  useEffect(() => {
    const greeting = `Здравствуйте! Я Алексей, руководитель проектного отдела. `
      + `Готов обсудить проект «${projectName || projectId}». Чем могу помочь?`
    setHistory([{ role: 'assistant', content: greeting }])
  }, [projectId, projectName])

  const handleSimliReady = useCallback((getSendAudio) => {
    sendAudioFn.current = getSendAudio
    setSimliReady(true)
  }, [])

const speak = useCallback(async (text) => {
    setSpeaking(true)

    // Typewriter effect
    let i = 0
    const iv = setInterval(() => {
      i++
      setLiveText(text.slice(0, i))
      if (i >= text.length) clearInterval(iv)
    }, 14)

    try {
      // Browser TTS (основной) — Groq TTS недоступен
      await speakBrowser(text)
    } finally {
      clearInterval(iv)
      setLiveText('')
      setSpeaking(false)
    }
  }, [])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || speaking) return
    setInput('')
    setError('')
    setLoading(true)
    window.speechSynthesis?.cancel()

    // Optimistically show user message while waiting
    setHistory(prev => [...prev, { role: 'user', content: msg }])

    try {
      const res = await avatarChat({
        project_id:   projectId,
        project_name: projectName,
        message:      msg,
        history,      // send history WITHOUT the optimistic user msg (backend adds it)
      })
      setLoading(false)
      const reply = res.data.reply
      // Backend returns full history — replace optimistic entry with real one
      setHistory(res.data.history)
      await speak(reply)
    } catch (e) {
      setLoading(false)
      // Remove optimistic message on error
      setHistory(prev => prev.slice(0, -1))
      setError(e.response?.data?.detail || 'Ошибка ответа.')
    } finally {
      inputRef.current?.focus()
    }
  }

  const toggleSimli = () => {
    if (!simliOn) {
      setSimliOn(true)
    } else {
      simliRef.current?.stop()
      setSimliOn(false)
      setSimliReady(false)
      sendAudioFn.current = null
    }
  }

  useEffect(() => {
    if (simliOn && simliRef.current) {
      simliRef.current.start()
    }
  }, [simliOn])

  const endSession = async () => {
    if (history.length < 2) return
    window.speechSynthesis?.cancel()
    setEnding(true)
    try {
      const res = await avatarEndSession({
        project_id:   projectId,
        project_name: projectName,
        history,
      })
      setReportUrl(`/api${res.data.report_path}`)
      setEnded(true)
    } catch (e) {
      setError(e.response?.data?.detail || 'Не удалось создать отчёт.')
    } finally {
      setEnding(false)
    }
  }

  const restart = () => {
    window.speechSynthesis?.cancel()
    simliRef.current?.stop()
    setSimliOn(false)
    setSimliReady(false)
    sendAudioFn.current = null
    const greeting = `Готов к новой беседе о проекте «${projectName || projectId}». Чем могу помочь?`
    setHistory([{ role: 'assistant', content: greeting }])
    setEnded(false)
    setReportUrl(null)
    setLiveText('')
    setError('')
  }

  const isBusy = loading || speaking

  return (
    <div className="ac-root">

      {/* ── Header ────────────────────────────────── */}
      <div className="ac-header">
        <div className={`ac-avatar-wrap ${speaking ? 'ac-speaking' : ''}`}>
          <div className="ac-avatar-circle">
            <span className="ac-avatar-initials">{AVATAR.initials}</span>
            {speaking && (
              <>
                <span className="ac-ring ac-ring-1" />
                <span className="ac-ring ac-ring-2" />
                <span className="ac-ring ac-ring-3" />
              </>
            )}
          </div>
        </div>

        <div className="ac-avatar-info">
          <div className="ac-avatar-name">{AVATAR.name}</div>
          <div className="ac-avatar-status">
            {speaking ? (
              <span className="ac-status-speaking">
                <span className="ac-status-dot ac-status-dot--pulse" />
                Говорит…
              </span>
            ) : loading ? (
              <span className="ac-status-typing">Думает…</span>
            ) : simliReady ? (
              <span className="ac-status-live">🔴 Видео подключено</span>
            ) : (
              <span className="ac-status-idle">
                <span className="ac-status-dot" />
                {AVATAR.title}
              </span>
            )}
          </div>
        </div>

        <div className="ac-header-right">
          <button
            className={`ac-simli-btn ${simliOn ? 'ac-simli-btn--on' : ''}`}
            onClick={toggleSimli}
          >
            {simliOn ? '📹 Видео вкл.' : '📹 Включить видео'}
          </button>

          {!ended && history.length > 1 && (
            <button
              className="ac-end-btn"
              onClick={endSession}
              disabled={ending || isBusy}
            >
              {ending
                ? <><span className="ac-spinner" />Генерация…</>
                : '📄 Завершить сессию'}
            </button>
          )}
        </div>
      </div>

      {/* ── Main area: split when video is on ────── */}
      <div className={`ac-body ${simliOn ? 'ac-body--split' : ''}`}>

        {/* Video panel (left column when split) */}
        {simliOn && (
          <div className="ac-video-col">
            <SimliAvatar
              ref={simliRef}
              onReady={handleSimliReady}
              onDisconnected={() => { setSimliReady(false); sendAudioFn.current = null }}
            />
          </div>
        )}

        {/* Chat column (right when split, full when no video) */}
        <div className="ac-chat-col">
          {ended ? (
            <div className="ac-ended">
              <div className="ac-ended-icon">✅</div>
              <div className="ac-ended-text">Сессия завершена. Отчёт готов.</div>
              <div className="ac-ended-actions">
                <a href={reportUrl} download className="ac-download-btn">
                  ⬇️ Скачать отчёт (.docx)
                </a>
                <button className="ac-ghost-btn" onClick={restart}>
                  Начать новую беседу
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ac-messages">
                {history.map((msg, i) => (
                  <div key={i} className={`ac-msg ac-msg--${msg.role}`}>
                    {msg.role === 'assistant' && (
                      <div className={`ac-msg-avatar ${speaking && i === history.length - 1 ? 'ac-msg-avatar--pulse' : ''}`}>
                        {AVATAR.initials}
                      </div>
                    )}
                    <div className="ac-msg-bubble">{msg.content}</div>
                  </div>
                ))}

                {liveText && (
                  <div className="ac-msg ac-msg--assistant">
                    <div className="ac-msg-avatar ac-msg-avatar--pulse">{AVATAR.initials}</div>
                    <div className="ac-msg-bubble ac-msg-bubble--live">
                      {liveText}<span className="ac-cursor" />
                    </div>
                  </div>
                )}

                {loading && !liveText && (
                  <div className="ac-msg ac-msg--assistant">
                    <div className="ac-msg-avatar">{AVATAR.initials}</div>
                    <div className="ac-msg-bubble ac-msg-bubble--typing">
                      <span /><span /><span />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {history.length === 1 && !loading && (
                <div className="ac-suggestions">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} className="ac-suggestion-chip"
                      onClick={() => send(s)} disabled={isBusy}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {error && <div className="ac-error">{error}</div>}

              <div className="ac-input-row">
                <textarea
                  ref={inputRef}
                  className="ac-input"
                  placeholder="Задайте вопрос о проекте…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault(); send()
                    }
                  }}
                  rows={1}
                  disabled={isBusy}
                />
                <button className="ac-send-btn" onClick={() => send()}
                  disabled={isBusy || !input.trim()}>➤</button>
              </div>
              <div className="ac-input-hint">Enter — отправить · Shift+Enter — новая строка</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}