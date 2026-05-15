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
  'Кто отвечает за задачу?',
  'Как продвигается проект в целом?',
  'Что нужно сделать в первую очередь?',
]

// ── Convert text to PCM audio via Web Speech + AudioContext ──
async function textToPCM(text, onChunk) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return }

    const utt   = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const ruVoice = voices.find(v => v.lang.startsWith('ru'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0]
    if (ruVoice) utt.voice = ruVoice
    utt.rate  = 0.92
    utt.pitch = 0.88

    // We use AudioContext to capture the audio output and
    // send PCM chunks to Simli while speech plays
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      // fallback: just play with speechSynthesis, no Simli audio
      utt.onend = resolve
      window.speechSynthesis.speak(utt)
      return
    }

    const ctx        = new AudioCtx({ sampleRate: 16000 })
    const dest       = ctx.createMediaStreamDestination()
    const source     = ctx.createMediaStreamSource(dest.stream)
    const processor  = ctx.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0)
      onChunk?.(new Float32Array(samples))
    }

    source.connect(processor)
    processor.connect(ctx.destination)

    utt.onend = () => {
      processor.disconnect()
      source.disconnect()
      ctx.close()
      resolve()
    }
    utt.onerror = resolve

    window.speechSynthesis.speak(utt)
  })
}

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
  const sendAudioFn = useRef(null)   // set when Simli is ready

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading, liveText])

  // Greeting
  useEffect(() => {
    const greeting = `Здравствуйте! Я Алексей, руководитель проектного отдела. `
      + `Готов обсудить проект «${projectName || projectId}». Чем могу помочь?`
    setHistory([{ role: 'assistant', content: greeting }])
  }, [projectId, projectName])

  const handleSimliReady = useCallback((getSendAudio) => {
    sendAudioFn.current = getSendAudio()
    setSimliReady(true)
  }, [])

  const speak = useCallback(async (text) => {
    setSpeaking(true)
    // Typewriter
    let i = 0
    const interval = setInterval(() => {
      i++
      setLiveText(text.slice(0, i))
      if (i >= text.length) clearInterval(interval)
    }, 16)

    // If Simli is connected, stream PCM to it
    if (sendAudioFn.current) {
      await textToPCM(text, (chunk) => sendAudioFn.current?.(chunk))
    } else {
      // Fallback: browser TTS only
      await new Promise(resolve => {
        const utt = new SpeechSynthesisUtterance(text)
        const voices = window.speechSynthesis.getVoices()
        const v = voices.find(v => v.lang.startsWith('ru')) || voices[0]
        if (v) utt.voice = v
        utt.rate = 0.92
        utt.onend = resolve
        utt.onerror = resolve
        window.speechSynthesis.speak(utt)
      })
    }

    clearInterval(interval)
    setLiveText('')
    setSpeaking(false)
  }, [])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || speaking) return
    setInput('')
    setError('')
    setLoading(true)
    window.speechSynthesis?.cancel()

    setHistory(prev => [...prev, { role: 'user', content: msg }])

    try {
      const res = await avatarChat({
        project_id:   projectId,
        project_name: projectName,
        message:      msg,
        history,
      })
      setLoading(false)
      const reply = res.data.reply
      setHistory(res.data.history)
      await speak(reply)
    } catch (e) {
      setLoading(false)
      setError(e.response?.data?.detail || 'Failed to get response.')
    } finally {
      inputRef.current?.focus()
    }
  }

  const toggleSimli = async () => {
    if (!simliOn) {
      setSimliOn(true)
      simliRef.current?.start()
    } else {
      simliRef.current?.stop()
      setSimliOn(false)
      setSimliReady(false)
      sendAudioFn.current = null
    }
  }

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
      setError(e.response?.data?.detail || 'Failed to generate report.')
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
      {/* ── Header ── */}
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
          {/* Simli toggle */}
          <button
            className={`ac-simli-btn ${simliOn ? 'ac-simli-btn--on' : ''}`}
            onClick={toggleSimli}
            title={simliOn ? 'Отключить видео' : 'Включить видео-аватар'}
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

      {/* ── Simli video panel (shown when toggled on) ── */}
      {simliOn && (
        <div className="ac-video-panel">
          <SimliAvatar
            ref={simliRef}
            onReady={handleSimliReady}
            onDisconnected={() => { setSimliReady(false); sendAudioFn.current = null }}
          />
          {!simliReady && (
            <div className="ac-video-hint">
              Подключение к видео-аватару…
            </div>
          )}
        </div>
      )}

      {/* ── Ended ── */}
      {ended && (
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
      )}

      {/* ── Messages ── */}
      {!ended && (
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

            {/* Live typewriter for current reply */}
            {liveText && (
              <div className="ac-msg ac-msg--assistant">
                <div className="ac-msg-avatar ac-msg-avatar--pulse">
                  {AVATAR.initials}
                </div>
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
              onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
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
  )
}