import { useState, useRef, useEffect, useCallback } from 'react'
import { avatarChat, avatarEndSession } from '../api'
import './AvatarChat.css'

const AVATAR = {
  name:     'Алексей Громов',
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

// ── Speech synthesis ─────────────────────────────────────────
function useSpeech() {
  const [speaking,  setSpeaking]  = useState(false)
  const [muted,     setMuted]     = useState(false)
  const utterRef = useRef(null)

  const speak = useCallback((text) => {
    if (muted || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const utt  = new SpeechSynthesisUtterance(text)
    utterRef.current = utt

    // Pick a Russian voice if available, else first available
    const voices = window.speechSynthesis.getVoices()
    const ruVoice = voices.find(v => v.lang.startsWith('ru'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0]
    if (ruVoice) utt.voice = ruVoice

    utt.rate   = 0.95
    utt.pitch  = 0.9
    utt.volume = 1

    utt.onstart = () => setSpeaking(true)
    utt.onend   = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)

    window.speechSynthesis.speak(utt)
  }, [muted])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const toggleMute = useCallback(() => {
    if (!muted) stop()
    setMuted(m => !m)
  }, [muted, stop])

  // Stop on unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  return { speaking, muted, speak, stop, toggleMute }
}

// ── Typewriter effect ─────────────────────────────────────────
function useTypewriter() {
  const [displayed, setDisplayed] = useState('')
  const [typing,    setTyping]    = useState(false)
  const timerRef = useRef(null)

  const type = useCallback((text, onDone) => {
    clearInterval(timerRef.current)
    setDisplayed('')
    setTyping(true)
    let i = 0
    timerRef.current = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(timerRef.current)
        setTyping(false)
        onDone?.()
      }
    }, 18)
  }, [])

  useEffect(() => () => clearInterval(timerRef.current), [])

  return { displayed, typing, type }
}

export default function AvatarChat({ projectId, projectName }) {
  const [history,   setHistory]   = useState([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [ending,    setEnding]    = useState(false)
  const [ended,     setEnded]     = useState(false)
  const [reportUrl, setReportUrl] = useState(null)
  const [error,     setError]     = useState('')
  // latest assistant message shown with typewriter
  const [liveText,  setLiveText]  = useState('')

  const bottomRef = useRef()
  const inputRef  = useRef()
  const { speaking, muted, speak, stop, toggleMute } = useSpeech()
  const { displayed, typing, type } = useTypewriter()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading, displayed])

  // Greeting on mount
  useEffect(() => {
    const greeting = `Здравствуйте! Я Алексей Громов, руководитель проектного отдела. `
      + `Готов обсудить текущее состояние проекта «${projectName || projectId}». `
      + `Чем могу помочь?`
    setHistory([{ role: 'assistant', content: greeting }])
    // Speak greeting after voices load
    const t = setTimeout(() => speak(greeting), 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deliverReply = useCallback((reply, newHistory) => {
    setLiveText(reply)
    // Typewriter runs in parallel with speech
    speak(reply)
    type(reply, () => {
      // When typewriter finishes, commit full history
      setHistory(newHistory)
      setLiveText('')
    })
  }, [speak, type])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || ended || typing) return
    setInput('')
    setError('')
    setLoading(true)
    stop()

    const optimisticHistory = [...history, { role: 'user', content: msg }]
    setHistory(optimisticHistory)

    try {
      const res = await avatarChat({
        project_id:   projectId,
        project_name: projectName,
        message:      msg,
        history,
      })
      setLoading(false)
      deliverReply(res.data.reply, res.data.history)
    } catch (e) {
      setLoading(false)
      setError(e.response?.data?.detail || 'Failed to get response.')
      setHistory(history)
    } finally {
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const endSession = async () => {
    if (history.length < 2) return
    stop()
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
    stop()
    const greeting = `Готов к новой беседе о проекте «${projectName || projectId}». Чем могу помочь?`
    setHistory([{ role: 'assistant', content: greeting }])
    setEnded(false)
    setReportUrl(null)
    setLiveText('')
    setError('')
    setTimeout(() => speak(greeting), 200)
  }

  // Messages to display: committed history + live typewriter for latest reply
  const displayHistory = liveText
    ? [...history, { role: 'assistant', content: displayed, live: true }]
    : history

  const isBusy = loading || typing

  return (
    <div className="ac-root">
      {/* ── Header ── */}
      <div className="ac-header">
        {/* Avatar with speaking ring */}
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
            ) : typing ? (
              <span className="ac-status-typing">Печатает…</span>
            ) : (
              <span className="ac-status-idle">
                <span className="ac-status-dot" />
                {AVATAR.title}
              </span>
            )}
          </div>
        </div>

        <div className="ac-header-right">
          {/* Mute toggle */}
          <button
            className={`ac-mute-btn ${muted ? 'ac-mute-btn--muted' : ''}`}
            onClick={toggleMute}
            title={muted ? 'Включить звук' : 'Выключить звук'}
          >
            {muted ? '🔇' : '🔊'}
          </button>

          {!ended && history.length > 1 && (
            <button
              className="ac-end-btn"
              onClick={endSession}
              disabled={ending || isBusy}
            >
              {ending
                ? <><span className="ac-spinner" /> Генерация…</>
                : '📄 Завершить сессию'}
            </button>
          )}
        </div>
      </div>

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
            {displayHistory.map((msg, i) => (
              <div key={i} className={`ac-msg ac-msg--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className={`ac-msg-avatar ${msg.live && speaking ? 'ac-msg-avatar--pulse' : ''}`}>
                    {AVATAR.initials}
                  </div>
                )}
                <div className={`ac-msg-bubble ${msg.live ? 'ac-msg-bubble--live' : ''}`}>
                  {msg.live ? displayed : msg.content}
                  {msg.live && <span className="ac-cursor" />}
                </div>
              </div>
            ))}

            {loading && (
              <div className="ac-msg ac-msg--assistant">
                <div className="ac-msg-avatar">{AVATAR.initials}</div>
                <div className="ac-msg-bubble ac-msg-bubble--typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {history.length === 1 && !loading && (
            <div className="ac-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="ac-suggestion-chip"
                  onClick={() => send(s)}
                  disabled={isBusy}
                >
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
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isBusy}
            />
            <button
              className="ac-send-btn"
              onClick={() => send()}
              disabled={isBusy || !input.trim()}
            >
              ➤
            </button>
          </div>
          <div className="ac-input-hint">Enter — отправить · Shift+Enter — новая строка</div>
        </>
      )}
    </div>
  )
}
