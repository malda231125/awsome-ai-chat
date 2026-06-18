'use client';

import { useEffect, useRef, useState } from 'react';
import { isNearBottom } from '../lib/scroll.mjs';

const MODELS = [
  { value: 'auto', label: '🧠 자동 (AI 라우팅)' },
  { value: 'GOOGLE', label: 'Google Gemini' },
  { value: 'GROQ', label: 'Groq (Llama 70B, 초고속)' },
  { value: 'CEREBRAS', label: 'Cerebras (GPT-OSS 120B)' },
  { value: 'MISTRAL', label: 'Mistral Small' },
  { value: 'NVIDIA', label: 'NVIDIA (Llama 70B)' },
  { value: 'OPENROUTER', label: 'OpenRouter (Gemma 4)' },
  { value: 'GITHUB', label: 'GitHub Models (GPT-4o-mini)' },
];

const box = { maxWidth: 760, margin: '0 auto', padding: '0 16px' };
const inputStyle = {
  flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #2c3140',
  background: '#1a1e29', color: '#e6e6e6', fontSize: 15, outline: 'none',
};
const buttonStyle = {
  padding: '12px 20px', borderRadius: 10, border: 'none', background: '#4f7cff',
  color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
};

export default function Page() {
  const [authed, setAuthed] = useState(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesViewportRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastTouchYRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => setAuthed(d.authed)).catch(() => setAuthed(false));
  }, []);

  function scrollToLatest(behavior = 'auto') {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }

  function pauseAutoScroll() {
    stickToBottomRef.current = false;
    setShowJumpToLatest(true);
  }

  function handleMessagesScroll() {
    const nearBottom = isNearBottom(messagesViewportRef.current);
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }

  function handleMessagesWheel(e) {
    if (e.deltaY < 0) pauseAutoScroll();
  }

  function handleMessagesTouchStart(e) {
    lastTouchYRef.current = e.touches?.[0]?.clientY ?? null;
  }

  function handleMessagesTouchMove(e) {
    const nextY = e.touches?.[0]?.clientY ?? null;
    if (nextY !== null && lastTouchYRef.current !== null && nextY > lastTouchYRef.current + 4) {
      pauseAutoScroll();
    }
    lastTouchYRef.current = nextY;
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToLatest('auto');
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, busy]);

  async function login(e) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
    else setLoginError('비밀번호가 올바르지 않습니다.');
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const history = [...messages, { role: 'user', content: text }];
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setMessages(history);
    setInput('');
    setBusy(true);
    setStatus('연결 중… (잠들어 있던 서버를 깨우는 중이면 30초쯤 걸릴 수 있어요)');

    let assistantText = '';
    let meta = null;
    const apiMessages = history.map(({ role, content }) => ({ role, content }));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, model }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setStatus('응답 생성 중…');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      setMessages([...history, { role: 'assistant', content: '', meta: null }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (line.startsWith(': gateway ')) {
              try { meta = JSON.parse(line.slice(10)); } catch {}
            } else if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;
              try {
                const chunk = JSON.parse(payload);
                assistantText += chunk.choices?.[0]?.delta?.content || '';
              } catch {}
            }
          }
          setMessages([...history, { role: 'assistant', content: assistantText, meta }]);
        }
      }
      setMessages([...history, { role: 'assistant', content: assistantText || '(빈 응답)', meta }]);
    } catch (err) {
      setMessages([...history, { role: 'assistant', content: `⚠️ 오류: ${err.message}`, meta: null }]);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  if (authed === null) {
    return <main style={{ ...box, paddingTop: 120, textAlign: 'center', color: '#8b93a7' }}>불러오는 중…</main>;
  }

  if (!authed) {
    return (
      <main style={{ ...box, paddingTop: 120, maxWidth: 380 }}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>🔒 Awsome AI</h1>
        <p style={{ color: '#8b93a7', marginBottom: 24 }}>비밀번호를 입력하면 채팅을 시작할 수 있습니다.</p>
        <form onSubmit={login} style={{ display: 'flex', gap: 8 }}>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호" style={inputStyle} autoFocus
          />
          <button type="submit" style={buttonStyle}>입장</button>
        </form>
        {loginError && <p style={{ color: '#ff7b7b', marginTop: 12 }}>{loginError}</p>}
      </main>
    );
  }

  return (
    <main style={{ ...box, position: 'relative', display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #232838' }}>
        <div>
          <strong style={{ fontSize: 17 }}>Awsome AI</strong>
          <span style={{ color: '#8b93a7', fontSize: 13, marginLeft: 8 }}>free-llm-gateway 채팅</span>
        </div>
        <select value={model} onChange={(e) => setModel(e.target.value)}
          style={{ background: '#1a1e29', color: '#e6e6e6', border: '1px solid #2c3140', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
          {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </header>

      <section
        ref={messagesViewportRef}
        onScroll={handleMessagesScroll}
        onWheel={handleMessagesWheel}
        onTouchStart={handleMessagesTouchStart}
        onTouchMove={handleMessagesTouchMove}
        style={{ flex: 1, overflowY: 'auto', padding: '18px 0' }}
      >
        {messages.length === 0 && (
          <p style={{ color: '#8b93a7', textAlign: 'center', marginTop: 80 }}>
            무엇이든 물어보세요. 🧠 자동 모드면 프롬프트에 맞는 무료 모델을 AI가 골라줍니다.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 14, fontSize: 15, lineHeight: 1.55,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: m.role === 'user' ? '#4f7cff' : '#1a1e29',
              color: m.role === 'user' ? '#fff' : '#e6e6e6',
              border: m.role === 'user' ? 'none' : '1px solid #232838',
            }}>
              {m.content}
              {m.role === 'assistant' && m.meta?.provider && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#8b93a7', borderTop: '1px solid #232838', paddingTop: 6 }}>
                  ⚡ {m.meta.provider}{m.meta.mode === 'auto' && m.meta.reason ? ` — ${m.meta.reason}` : ''}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p style={{ color: '#8b93a7', fontSize: 13 }}>{status}</p>}
        <div ref={bottomRef} />
      </section>

      {showJumpToLatest && (
        <button
          type="button"
          onClick={() => scrollToLatest('smooth')}
          style={{
            position: 'absolute',
            right: 22,
            bottom: 82,
            zIndex: 10,
            border: '1px solid #33405a',
            background: '#1f2534',
            color: '#dbe4ff',
            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 700,
            boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
            cursor: 'pointer',
          }}
        >
          ↓ 최신 응답
        </button>
      )}

      <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '12px 0 18px' }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요…" style={inputStyle} disabled={busy} autoFocus
        />
        <button type="submit" style={{ ...buttonStyle, opacity: busy ? 0.5 : 1 }} disabled={busy}>
          {busy ? '…' : '전송'}
        </button>
      </form>
    </main>
  );
}
