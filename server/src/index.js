import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { QUESTIONS } from './questions.js';

const app = express();
app.use(cors());
app.use(express.json());

const rooms = new Map();
const answerTimeout = 30;

const randomCode = () => nanoid(6).toUpperCase();
const pickQuestion = (mode) => {
  const pool = QUESTIONS.filter((q) => q.mode === mode);
  return pool[Math.floor(Math.random() * pool.length)];
};

const roomState = (room) => ({
  code: room.code,
  players: room.players.map((p) => ({ id: p.id, name: p.name })),
  status: room.players.length < 2 ? 'waiting' : 'ready',
  mode: room.mode,
  round: room.round,
  timerEndsAt: room.timerEndsAt,
  stats: room.stats
});

const broadcast = (room, payload) => {
  room.players.forEach((p) => p.ws?.readyState === 1 && p.ws.send(JSON.stringify(payload)));
};

const beginRound = (room) => {
  room.round += 1;
  room.currentQuestion = pickQuestion(room.mode);
  room.answers = {};
  room.timerEndsAt = Date.now() + answerTimeout * 1000;
  broadcast(room, { type: 'round_started', question: room.currentQuestion, round: room.round, timerEndsAt: room.timerEndsAt });
};

app.get('/health', (_, res) => res.json({ ok: true, questions: QUESTIONS.length }));
app.post('/rooms', (req, res) => {
  const { name, mode = 'fun' } = req.body;
  const code = randomCode();
  const playerId = nanoid();
  rooms.set(code, { code, mode, players: [{ id: playerId, name }], round: 0, stats: { matches: 0, total: 0 }, answers: {}, discussionPaused: false });
  res.json({ code, playerId });
});

app.post('/rooms/:code/join', (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.players.length >= 2) return res.status(400).json({ error: 'Room is full' });
  const playerId = nanoid();
  room.players.push({ id: playerId, name: req.body.name });
  res.json({ code: room.code, playerId });
  broadcast(room, { type: 'room_update', room: roomState(room) });
  beginRound(room);
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let session = { code: null, playerId: null };

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'bind') {
      const room = rooms.get(msg.code);
      if (!room) return;
      const player = room.players.find((p) => p.id === msg.playerId);
      if (!player) return;
      player.ws = ws;
      session = { code: msg.code, playerId: msg.playerId };
      ws.send(JSON.stringify({ type: 'room_update', room: roomState(room) }));
    }

    const room = rooms.get(session.code);
    if (!room) return;

    if (msg.type === 'submit_answer') {
      room.answers[session.playerId] = msg.answer;
      if (Object.keys(room.answers).length === 2) {
        const [a, b] = room.players.map((p) => room.answers[p.id]);
        room.stats.total += 1;
        if (String(a).toLowerCase() === String(b).toLowerCase()) room.stats.matches += 1;
        broadcast(room, { type: 'answers_revealed', answers: room.answers, stats: room.stats, question: room.currentQuestion });
      } else {
        broadcast(room, { type: 'waiting_partner', playerId: session.playerId });
      }
    }

    if (msg.type === 'next_round') beginRound(room);
    if (msg.type === 'pause_discussion') {
      room.discussionPaused = msg.value;
      broadcast(room, { type: 'discussion_state', value: msg.value });
    }
    if (msg.type === 'skip_question') beginRound(room);
  });

  ws.on('close', () => {
    const room = rooms.get(session.code);
    if (!room) return;
    const p = room.players.find((x) => x.id === session.playerId);
    if (p) p.ws = null;
    broadcast(room, { type: 'room_update', room: roomState(room) });
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.timerEndsAt && Date.now() > room.timerEndsAt && Object.keys(room.answers).length < 2 && room.currentQuestion) {
      room.players.forEach((p) => {
        if (!room.answers[p.id]) room.answers[p.id] = '⏱️ Время вышло';
      });
      broadcast(room, { type: 'answers_revealed', answers: room.answers, stats: room.stats, question: room.currentQuestion, timeout: true });
    }
  }
}, 1000);

server.listen(4000, () => console.log('Server on http://localhost:4000'));
