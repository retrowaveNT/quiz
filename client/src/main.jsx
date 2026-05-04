import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = 'http://localhost:4000';

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

  useEffect(() => {
    if (!ws) return;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'room_update') setRoom(msg.room);
      if (msg.type === 'round_started') { setQuestion(msg.question); setRevealed(null); setWaiting(false); setAnswer(''); }
      if (msg.type === 'waiting_partner') setWaiting(true);
      if (msg.type === 'answers_revealed') { setRevealed(msg); setWaiting(false); }
      if (msg.type === 'discussion_state') setPaused(msg.value);
    };
  }, [ws]);

  useEffect(() => {
    const t = setInterval(() => {
      if (room?.timerEndsAt) setTimer(Math.max(0, Math.floor((room.timerEndsAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(t);
  }, [room]);

  const connectWs = (c, p) => {
    const socket = new WebSocket('ws://localhost:4000');
    socket.onopen = () => socket.send(JSON.stringify({ type: 'bind', code: c, playerId: p }));
    setWs(socket); setCode(c); setPlayerId(p);
  };

  const createRoom = async () => {
    const r = await fetch(`${API}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mode }) });
    const data = await r.json();
    connectWs(data.code, data.playerId);
  };
  const joinRoom = async () => {
    const r = await fetch(`${API}/rooms/${roomCodeInput}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await r.json();
    connectWs(data.code, data.playerId);
  };

  const submit = () => ws.send(JSON.stringify({ type: 'submit_answer', answer }));
  const next = () => ws.send(JSON.stringify({ type: 'next_round' }));

  const myIdx = useMemo(() => room?.players?.findIndex((p) => p.id === playerId), [room, playerId]);

  if (!code) return <div className='container'><h1>💞 Couples Quiz Game</h1><input placeholder='Ваше имя' value={name} onChange={(e)=>setName(e.target.value)} />
    <select value={mode} onChange={(e)=>setMode(e.target.value)}><option value='fun'>😄 Fun</option><option value='spicy'>🔥 Spicy</option><option value='deep'>🧠 Deep</option><option value='guess'>🎯 Guess</option></select>
    <button onClick={createRoom} disabled={!name}>Создать комнату</button>
    <hr/><input placeholder='Код комнаты' value={roomCodeInput} onChange={(e)=>setRoomCodeInput(e.target.value.toUpperCase())}/>
    <button onClick={joinRoom} disabled={!name || !roomCodeInput}>Присоединиться</button></div>;

  return <div className='container'>
    <h2>Комната: {code}</h2>
    <p>{room?.status === 'waiting' ? 'Ожидание второго игрока…' : 'Игра началась!'}</p>
    <p>Вы: Игрок {myIdx + 1} · Совпадения: {room?.stats?.matches}/{room?.stats?.total}</p>
    {question && !revealed && <div className='card'><h3>{question.text}</h3><p>⏳ {timer} сек</p>
      {question.type === 'choice' ? <div className='options'>{question.options.map((o)=><button key={o} className={answer===o?'active':''} onClick={()=>setAnswer(o)}>{o}</button>)}</div> : null}
      {question.type === 'scale' ? <input type='range' min='1' max='10' value={answer || 5} onChange={(e)=>setAnswer(e.target.value)} /> : null}
      {(question.type === 'open' || question.type === 'guess') ? <textarea value={answer} onChange={(e)=>setAnswer(e.target.value)} placeholder='Ваш ответ...' /> : null}
      <button onClick={submit} disabled={!answer}>Ответить</button>
      <button onClick={()=>ws.send(JSON.stringify({type:'skip_question'}))}>Пропустить</button>
      {waiting && <div className='pulse'>Ждём ответ партнёра…</div>}
    </div>}

    {revealed && <div className='card reveal'><h3>Одновременное раскрытие ✨</h3>
      {room.players.map((p)=><p key={p.id}><b>{p.name}:</b> {revealed.answers[p.id]}</p>)}
      <div className='row'><button onClick={()=>ws.send(JSON.stringify({type:'pause_discussion', value: !paused}))}>{paused ? 'Продолжить' : 'Обсудить'}</button>
      <button onClick={next} disabled={paused}>Следующий вопрос</button></div>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
