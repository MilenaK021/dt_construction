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

// ── ElevenLabs TTS → PCM → Simli ─────────────────────────────────────────────
async function speakWithSimli(text, sendAudio) {
  const res = await fetch('/api/avatar/tts', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TTS ${res.status}: ${err}`)
  }

  const arrayBuf = await res.arrayBuffer()
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx      = new AudioCtx({ sampleRate: 16000 })
  const decoded  = await ctx.decodeAudioData(arrayBuf)
  ctx.close()

  const raw   = decoded.getChannelData(0)
  const pcm16 = new Int16Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    const s  = Math.max(-1, Math.min(1, raw[i]))
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  const CHUNK = 4096
  for (let i = 0; i < pcm16.length; i += CHUNK) {
    sendAudio(new Uint8Array(pcm16.slice(i, i + CHUNK).buffer))
    await new Promise(r => setTimeout(r, 0))
  }

  const durationMs = (raw.length / 16000) * 1000
  await new Promise(r => setTimeout(r, durationMs + 300))
}

// ── Fallback: браузерный TTS ──────────────────────────────────────────────────
function getVoices() {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices()
    if (v.length) { resolve(v); return }
    const h = () => { resolve(window.speechSynthesis.getVoices()); window.speechSynthesis.removeEventListener('voiceschanged', h) }
    window.speechSynthesis.addEventListener('voiceschanged', h)
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1500)
  })
}

async function speakBrowser(text) {
  const voices   = await getVoices()
  const maleKw   = ['male','man','pavel','dmitri','yuri','мужской','павел','дмитрий','юрий']
  const femaleKw = ['female','woman','milena','irina','olga','женский','милена','ирина','ольга','алина','alina']
  const ruVoices = voices.filter(v => v.lang.startsWith('ru'))
  const voice    = ruVoices.find(v => maleKw.some(k => v.name.toLowerCase().includes(k)))
              || ruVoices.find(v => !femaleKw.some(k => v.name.toLowerCase().includes(k)))
              || ruVoices[0] || voices[0]
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    if (voice) utt.voice = voice
    utt.lang  = voice?.lang || 'ru-RU'
    utt.rate  = 0.90
    utt.pitch = 0.85
    utt.onend = utt.onerror = resolve
    window.speechSynthesis.speak(utt)
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AvatarChat({ projectId, projectName }) {
  const [history,    setHistory]    = useState([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [speaking,   setSpeaking]   = useState(false)
  const [simliOn,    setSimliOn]    = useState(false)
  const [simliReady, setSimliReady] = useState(false)
  const [ending,     setEnding]     = useState(false)
  const [ended,      setEnded]      = useState(false)
  const [reportUrl,  setReportUrl]  = useState(null)
  const [error,      setError]      = useState('')
  const [ttsError,   setTtsError]   = useState('')   // видимая ошибка TTS

  const bottomRef   = useRef()
  const inputRef    = useRef()
  const simliRef    = useRef()
  const sendAudioFn = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading, speaking])

  useEffect(() => {
    const greeting = `Здравствуйте! Я Алексей, руководитель проектного отдела. `
      + `Готов обсудить проект «${projectName || projectId}». Чем могу помочь?`
    setHistory([{ role: 'assistant', content: greeting }])
  }, [projectId, projectName])

  const handleSimliReady = useCallback((sendAudio) => {
    sendAudioFn.current = sendAudio
    setSimliReady(true)
  }, [])

  const speak = useCallback(async (text) => {
    setSpeaking(true)
    setTtsError('')
    try {
      if (sendAudioFn.current) {
        // ElevenLabs → Simli
        await speakWithSimli(text, sendAudioFn.current)
      } else {
        // Без Simli — браузерный голос
        await speakBrowser(text)
      }
    } catch (e) {
      // Показываем ошибку TTS в UI и падаем на браузерный голос
      const msg = e?.message || String(e)
      console.error('[TTS]', msg)
      setTtsError(`⚠️ TTS: ${msg}`)
      try { await speakBrowser(text) } catch (_) {}
    } finally {
      setSpeaking(false)
    }
  }, [])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || speaking) return
    setInput('')
    setError('')
    setTtsError('')
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
      setHistory(res.data.history)
      await speak(res.data.reply)
    } catch (e) {
      setLoading(false)
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

  const endSession = async () => {
    if (history.length < 2) return
    window.speechSynthesis?.cancel()
    setEnding(true)
    try {
      const res = await avatarEndSession({ project_id: projectId, project_name: projectName, history })
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
    setError('')
    setTtsError('')
  }

  const isBusy = loading || speaking

  return (
    <div className="ac-root">
      <div className="ac-header">
        <div className={`ac-avatar-wrap ${speaking ? 'ac-speaking' : ''}`}>
          <div className="ac-avatar-circle">
            <span className="ac-avatar-initials">{AVATAR.initials}</span>
            {speaking && (<><span className="ac-ring ac-ring-1" /><span className="ac-ring ac-ring-2" /><span className="ac-ring ac-ring-3" /></>)}
          </div>
        </div>
        <div className="ac-avatar-info">
          <div className="ac-avatar-name">{AVATAR.name}</div>
          <div className="ac-avatar-status">
            {speaking ? (
              <span className="ac-status-speaking"><span className="ac-status-dot ac-status-dot--pulse" />Говорит…</span>
            ) : loading ? (
              <span className="ac-status-typing">Думает…</span>
            ) : simliReady ? (
              <span className="ac-status-live">🔴 Видео подключено</span>
            ) : (
              <span className="ac-status-idle"><span className="ac-status-dot" />{AVATAR.title}</span>
            )}
          </div>
        </div>
        <div className="ac-header-right">
          <button className={`ac-simli-btn ${simliOn ? 'ac-simli-btn--on' : ''}`} onClick={toggleSimli}>
            {simliOn ? '📹 Видео вкл.' : '📹 Включить видео'}
          </button>
          {!ended && history.length > 1 && (
            <button className="ac-end-btn" onClick={endSession} disabled={ending || isBusy}>
              {ending ? <><span className="ac-spinner" />Генерация…</> : '📄 Завершить сессию'}
            </button>
          )}
        </div>
      </div>

      <div className={`ac-body ${simliOn ? 'ac-body--split' : ''}`}>
        {simliOn && (
          <div className="ac-video-col">
            <SimliAvatar
              ref={simliRef}
              onReady={handleSimliReady}
              onDisconnected={() => { setSimliReady(false); sendAudioFn.current = null }}
            />
          </div>
        )}

        <div className="ac-chat-col">
          {ended ? (
            <div className="ac-ended">
              <div className="ac-ended-icon">✅</div>
              <div className="ac-ended-text">Сессия завершена. Отчёт готов.</div>
              <div className="ac-ended-actions">
                <a href={reportUrl} download className="ac-download-btn">⬇️ Скачать отчёт (.docx)</a>
                <button className="ac-ghost-btn" onClick={restart}>Начать новую беседу</button>
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

              {ttsError && (
                <div className="ac-error" style={{fontSize:'11px', margin:'4px 16px'}}>
                  {ttsError}
                </div>
              )}

              {history.length === 1 && !loading && (
                <div className="ac-suggestions">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} className="ac-suggestion-chip" onClick={() => send(s)} disabled={isBusy}>{s}</button>
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
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  rows={1}
                  disabled={isBusy}
                />
                <button className="ac-send-btn" onClick={() => send()} disabled={isBusy || !input.trim()}>➤</button>
              </div>
              <div className="ac-input-hint">Enter — отправить · Shift+Enter — новая строка</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}