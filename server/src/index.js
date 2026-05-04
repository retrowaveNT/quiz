import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { QUESTIONS } from './questions.js';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rooms = new Map();
const defaultAnswerTimeout = 30;

const randomCode = () => nanoid(6).toUpperCase();
const pickQuestion = (mode) => {
  const pool = QUESTIONS.filter((q) => q.mode === mode);
  return pool[Math.floor(Math.random() * pool.length)];
};

const roomState = (room) => ({
  code: room.code,
  players: room.players.map((p) => ({ id: p.id, name: p.name, online: !!p.ws })),
  status: room.players.length < 2 ? 'waiting' : 'ready',
  mode: room.mode,
  round: room.round,
  roundId: room.roundId,
  timerEndsAt: room.timerEndsAt,
  answerTimeoutSec: room.answerTimeoutSec,
  stats: room.stats,
  submitted: room.submitted
});

const sendCurrentRound = (ws, room) => {
  if (!room.currentQuestion) return;
  ws.send(JSON.stringify({
    type: 'round_started',
    question: room.currentQuestion,
    round: room.round,
    roundId: room.roundId,
    timerEndsAt: room.timerEndsAt,
  answerTimeoutSec: room.answerTimeoutSec,
    submitted: room.submitted
  }));
};

const broadcast = (room, payload) => {
  room.players.forEach((p) => p.ws?.readyState === 1 && p.ws.send(JSON.stringify(payload)));
};

const beginRound = (room) => {
  room.round += 1;
  room.roundId = nanoid(8);
  room.currentQuestion = pickQuestion(room.mode);
  room.answers = {};
  room.submitted = {};
  room.revealed = false;
  room.timerEndsAt = room.answerTimeoutSec ? Date.now() + room.answerTimeoutSec * 1000 : null;
  broadcast(room, {
    type: 'round_started',
    question: room.currentQuestion,
    round: room.round,
    roundId: room.roundId,
    timerEndsAt: room.timerEndsAt,
  answerTimeoutSec: room.answerTimeoutSec,
    submitted: room.submitted
  });
  broadcast(room, { type: 'room_update', room: roomState(room) });
};

const revealAnswers = (room, timeout = false) => {
  if (room.revealed || !room.currentQuestion) return;
  room.revealed = true;
  room.timerEndsAt = null;
  const players = room.players;
  if (Object.keys(room.answers).length < players.length) {
    players.forEach((p) => {
      if (!room.answers[p.id]) room.answers[p.id] = '⏱️ Время вышло';
    });
  }
  if (!room.countedForRound) {
    const [a, b] = players.map((p) => room.answers[p.id]);
    room.stats.total += 1;
    if (String(a).trim().toLowerCase() === String(b).trim().toLowerCase()) room.stats.matches += 1;
    room.countedForRound = true;
  }
  broadcast(room, { type: 'answers_revealed', answers: room.answers, stats: room.stats, question: room.currentQuestion, timeout, roundId: room.roundId });
  broadcast(room, { type: 'room_update', room: roomState(room) });
};

app.get('/health', (_, res) => res.json({ ok: true, questions: QUESTIONS.length }));
app.post('/rooms', (req, res) => {
  const { name, mode = 'fun', answerTimeoutSec = defaultAnswerTimeout } = req.body;
  const code = randomCode();
  const playerId = nanoid();
  rooms.set(code, {
    code,
    mode,
    players: [{ id: playerId, name }],
    round: 0,
    roundId: null,
    stats: { matches: 0, total: 0 },
    answers: {},
    submitted: {},
    discussionPaused: false,
    revealed: false,
    countedForRound: false,
    currentQuestion: null,
    timerEndsAt: null,
    answerTimeoutSec: Number(answerTimeoutSec) > 0 ? Number(answerTimeoutSec) : null
  });
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
      if (!room) return ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      const player = room.players.find((p) => p.id === msg.playerId);
      if (!player) return ws.send(JSON.stringify({ type: 'error', message: 'Player not found in room' }));
      player.ws = ws;
      session = { code: msg.code, playerId: msg.playerId };
      ws.send(JSON.stringify({ type: 'room_update', room: roomState(room) }));
      sendCurrentRound(ws, room);
      if (room.revealed) {
        ws.send(JSON.stringify({ type: 'answers_revealed', answers: room.answers, stats: room.stats, question: room.currentQuestion, roundId: room.roundId }));
      }
      broadcast(room, { type: 'room_update', room: roomState(room) });
      return;
    }

    const room = rooms.get(session.code);
    if (!room) return;

    if (msg.type === 'submit_answer') {
      if (!room.roundId || msg.roundId !== room.roundId || room.revealed) return;
      if (room.submitted[session.playerId]) return;

      room.submitted[session.playerId] = true;
      room.answers[session.playerId] = msg.answer;
      ws.send(JSON.stringify({ type: 'answer_accepted', roundId: room.roundId }));
      broadcast(room, { type: 'room_update', room: roomState(room) });

      if (Object.keys(room.answers).length === room.players.length) {
        revealAnswers(room, false);
      } else {
        broadcast(room, { type: 'waiting_partner', playerId: session.playerId });
      }
      return;
    }

    if (msg.type === 'next_round') {
      room.countedForRound = false;
      beginRound(room);
      return;
    }

    if (msg.type === 'pause_discussion') {
      room.discussionPaused = msg.value;
      broadcast(room, { type: 'discussion_state', value: msg.value });
      return;
    }

    if (msg.type === 'skip_question') {
      room.countedForRound = false;
      beginRound(room);
      return;
    }
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
    if (room.timerEndsAt && Date.now() > room.timerEndsAt && !room.revealed) revealAnswers(room, true);
  }
}, 500);

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/rooms') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
