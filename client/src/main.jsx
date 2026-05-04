import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || window.location.origin;
const WS_URL = (import.meta.env.VITE_WS_URL || window.location.origin).replace('http', 'ws');

const TIMER_OPTIONS = [
  { value: 15, label: '15 сек' },
  { value: 30, label: '30 сек' },
  { value: 45, label: '45 сек' },
  { value: 60, label: '60 сек' },
  { value: 0, label: 'Без лимита' }
];

const MODES = {
  fun: { title: 'Fun', emoji: '😄', desc: 'Смешные и лёгкие вопросы' },
  spicy: { title: 'Spicy', emoji: '🔥', desc: 'Флирт и провокация без перегиба' },
  deep: { title: 'Deep', emoji: '🧠', desc: 'Глубокие и честные разговоры' },
  guess: { title: 'Guess', emoji: '🎯', desc: 'Угадай, что ответит партнёр' }
};

function App() {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('fun');
  const [code, setCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [ws, setWs] = useState(null);
  const [room, setRoom] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerEndsAt, setTimerEndsAt] = useState(null);
  const [answerTimeoutSec, setAnswerTimeoutSec] = useState(30);
  const [roundId, setRoundId] = useState(null);
  const [submittedMine, setSubmittedMine] = useState(false);

  useEffect(() => {
    if (!ws) return;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'room_update') { setRoom(msg.room); if (msg.room?.timerEndsAt) setTimerEndsAt(msg.room.timerEndsAt); }
      if (msg.type === 'round_started') { setQuestion(msg.question); setRevealed(null); setWaiting(false); setAnswer(''); setTimerEndsAt(msg.timerEndsAt); setRoundId(msg.roundId); setSubmittedMine(!!msg.submitted?.[playerId]); }
      if (msg.type === 'waiting_partner') setWaiting(true);
      if (msg.type === 'answers_revealed') { setRevealed(msg); setWaiting(false); setTimerEndsAt(null); setSubmittedMine(false); }
      if (msg.type === 'answer_accepted') setSubmittedMine(true);
      if (msg.type === 'discussion_state') setPaused(msg.value);
    };
  }, [ws]);


  useEffect(() => {
    const saved = localStorage.getItem('couples_quiz_session');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.code && parsed?.playerId) {
        if (parsed.name) setName(parsed.name);
        connectWs(parsed.code, parsed.playerId);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!timerEndsAt) return setTimer(0);
    const syncTimer = () => setTimer(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
    syncTimer();
    const t = setInterval(syncTimer, 250);
    return () => clearInterval(t);
  }, [timerEndsAt]);

  const connectWs = (c, p) => {
    const socket = new WebSocket(WS_URL);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'bind', code: c, playerId: p }));
    setWs(socket); setCode(c); setPlayerId(p);
    localStorage.setItem('couples_quiz_session', JSON.stringify({ code: c, playerId: p, name }));
  };

  const createRoom = async () => {
    const r = await fetch(`${API}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mode, answerTimeoutSec }) });
    const data = await r.json();
    connectWs(data.code, data.playerId);
  };

  const joinRoom = async () => {
    const r = await fetch(`${API}/rooms/${roomCodeInput}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await r.json();
    connectWs(data.code, data.playerId);
  };

  const myIdx = useMemo(() => room?.players?.findIndex((p) => p.id === playerId), [room, playerId]);
  const canSubmit = !submittedMine && (question?.type === 'scale' ? true : !!String(answer).trim());

  if (!code) {
    return <div className='layout'>
      <div className='glass hero'>
        <h1>💞 Couples Quiz Game</h1>
        <p>Не про победу. Про эмоции, смех и честные ответы.</p>
      </div>

      <div className='glass'>
        <input placeholder='Ваше имя' value={name} onChange={(e)=>setName(e.target.value)} />
        <div className='modeGrid'>{Object.entries(MODES).map(([key, val]) =>
          <button key={key} className={`modeCard ${mode===key?'selected':''}`} onClick={()=>setMode(key)}>
            <span>{val.emoji} {val.title}</span><small>{val.desc}</small>
          </button>
        )}</div>
        <label>Таймер вопроса</label>
        <select value={answerTimeoutSec} onChange={(e)=>setAnswerTimeoutSec(Number(e.target.value))}>
          {TIMER_OPTIONS.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className='primary' onClick={createRoom} disabled={!name.trim()}>Создать комнату</button>
        <div className='divider'>или</div>
        <input placeholder='Код комнаты' value={roomCodeInput} onChange={(e)=>setRoomCodeInput(e.target.value.toUpperCase())}/>
        <button onClick={joinRoom} disabled={!name.trim() || !roomCodeInput}>Присоединиться</button>
      </div>
    </div>;
  }

  return <div className='layout'>
    <div className='glass topbar'>
      <div><b>Комната {code}</b><small>{room?.status === 'waiting' ? 'Ожидание второго игрока…' : 'Вы в игре'}</small></div>
      <div><b>{MODES[room?.mode || mode]?.emoji} {MODES[room?.mode || mode]?.title}</b><small>Совпадения: {room?.stats?.matches || 0}/{room?.stats?.total || 0}</small></div>
      <div><b>Участники</b><small>{room?.players?.map((p) => `${p.name}${p.online ? ' 🟢' : ' ⚪'}`).join(' • ') || '—'}</small></div>
    </div>

    {question && !revealed && <div className='glass card in'>
      <div className='badge'>Раунд {room?.round || 1}</div>
      <h2>{question.text}</h2>
      {room?.answerTimeoutSec ? <>
        <div className='timer'><div style={{ width: `${(timer/room.answerTimeoutSec)*100}%` }} /></div><p>⏳ {timer} сек</p>
      </> : <p>⏳ Без ограничения по времени</p>}
      {question.type === 'choice' && <div className='options'>{question.options.map((o)=><button key={o} className={answer===o?'active':''} onClick={()=>setAnswer(o)}>{o}</button>)}</div>}
      {question.type === 'scale' && <div><input type='range' min='1' max='10' value={answer || 5} onChange={(e)=>setAnswer(e.target.value)} /><p>Оценка: <b>{answer || 5}</b>/10</p></div>}
      {(question.type === 'open' || question.type === 'guess') && <textarea value={answer} onChange={(e)=>setAnswer(e.target.value)} placeholder='Ваш ответ...' />}
      <div className='row'>
        <button className='primary' onClick={()=>ws.send(JSON.stringify({ type: 'submit_answer', roundId, answer: question.type === 'scale' ? String(answer || 5) : answer.trim() }))} disabled={!canSubmit}>{submittedMine ? 'Ответ принят' : 'Ответить'}</button>
        <button onClick={()=>ws.send(JSON.stringify({type:'skip_question'}))}>Пропустить</button>
      </div>
      {waiting && <div className='waiting'>Партнёр отвечает…</div>}
    </div>}

    {revealed && <div className='glass card reveal in'>
      <h2>Одновременное раскрытие ✨</h2>
      {room.players.map((p)=><div className='answer' key={p.id}><span>{p.name}</span><p>{revealed.answers[p.id]}</p></div>)}
      <div className='row'>
        <button onClick={()=>ws.send(JSON.stringify({type:'pause_discussion', value: !paused}))}>{paused ? 'Продолжить' : 'Обсудить'}</button>
        <button className='primary' onClick={()=>ws.send(JSON.stringify({ type: 'next_round' }))} disabled={paused}>Следующий вопрос</button>
      </div>
    </div>}

    <p className='foot'>Вы: Игрок {myIdx + 1 || 1}</p>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
