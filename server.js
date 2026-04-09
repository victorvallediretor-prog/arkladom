const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'arkladom-beta-v1' });
});

const SLOT_NAMES = [
  'Personagem',
  'Defesa',
  'Bônus 1',
  'Bônus 2',
  'Passiva 1',
  'Passiva 2',
  'Passiva 3',
  'Arma',
  'Armadura',
  'Artefato 1',
  'Artefato 2',
  'Concentração'
];

const GRID_343 = [
  'F1', 'F2', 'F3',
  'M1', 'M2', 'M3', 'M4',
  'B1', 'B2', 'B3'
];

/** @type {Map<string, any>} */
const rooms = new Map();
/** @type {Map<string, {roomId: string, userId: string}>} */
const sessionIndex = new Map();

function createDefaultHand(playerName) {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: `${playerName}-card-${n}`,
    name: `Carta ${n}`,
    type: 'Placeholder'
  }));
}

function createRoom(roomId, gmName) {
  const gmId = crypto.randomUUID();
  const gmSessionId = crypto.randomUUID();
  const room = {
    roomId,
    createdAt: Date.now(),
    gmId,
    turn: {
      order: [gmId],
      currentIndex: 0,
      started: false
    },
    users: {
      [gmId]: {
        id: gmId,
        name: gmName,
        role: 'gm',
        sessionId: gmSessionId,
        socketId: null,
        hand: createDefaultHand('Mestre'),
        slots: SLOT_NAMES.map((name) => ({ name, card: null })),
        avatar: { position: 'B2' }
      }
    },
    board: {
      bossSlot: { id: 'boss-1', title: 'Chefe (placeholder)' },
      enemiesRow2: [
        { id: 'e2-1', title: 'Inimigo 2-1' },
        { id: 'e2-2', title: 'Inimigo 2-2' },
        { id: 'e2-3', title: 'Inimigo 2-3' }
      ],
      enemiesRow1: [
        { id: 'e1-1', title: 'Inimigo 1-1' },
        { id: 'e1-2', title: 'Inimigo 1-2' },
        { id: 'e1-3', title: 'Inimigo 1-3' }
      ],
      formationGrid: GRID_343,
      weather: 'Placeholder de clima',
      astrology: 'Placeholder astrologia'
    }
  };

  sessionIndex.set(gmSessionId, { roomId, userId: gmId });
  rooms.set(roomId, room);

  return { room, gmId, gmSessionId };
}

function toPublicRoomState(room, viewerId) {
  const users = Object.values(room.users);
  const players = users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    hand: user.id === viewerId || room.gmId === viewerId ? user.hand : user.hand.map(() => ({ hidden: true })),
    slots: user.id === viewerId || room.gmId === viewerId
      ? user.slots
      : user.slots.map((slot) => ({ name: slot.name, card: slot.card ? { hidden: true } : null }))
  }));

  return {
    roomId: room.roomId,
    gmId: room.gmId,
    players,
    board: room.board,
    turn: {
      ...room.turn,
      activeUserId: room.turn.started ? room.turn.order[room.turn.currentIndex] : null
    }
  };
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  Object.values(room.users).forEach((user) => {
    if (!user.socketId) return;
    io.to(user.socketId).emit('room:state', toPublicRoomState(room, user.id));
  });
}

function normalizeRoomId(input) {
  return String(input || '').trim().toUpperCase().slice(0, 12);
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ roomId, name }) => {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) {
      socket.emit('room:error', 'Informe um código de sala válido.');
      return;
    }
    if (rooms.has(normalized)) {
      socket.emit('room:error', 'Essa sala já existe.');
      return;
    }

    const { room, gmId, gmSessionId } = createRoom(normalized, name?.trim() || 'Mestre');
    room.users[gmId].socketId = socket.id;
    socket.join(normalized);
    socket.emit('session:ready', { sessionId: gmSessionId, userId: gmId, roomId: normalized });
    broadcastRoomState(normalized);
  });

  socket.on('room:join', ({ roomId, name }) => {
    const normalized = normalizeRoomId(roomId);
    const room = rooms.get(normalized);
    if (!room) {
      socket.emit('room:error', 'Sala não encontrada.');
      return;
    }

    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    room.users[userId] = {
      id: userId,
      name: (name || 'Jogador').trim(),
      role: 'player',
      sessionId,
      socketId: socket.id,
      hand: createDefaultHand((name || 'Jogador').trim() || 'Jogador'),
      slots: SLOT_NAMES.map((slot) => ({ name: slot, card: null })),
      avatar: { position: 'B2' }
    };

    if (!room.turn.order.includes(userId)) {
      room.turn.order.push(userId);
    }

    sessionIndex.set(sessionId, { roomId: normalized, userId });
    socket.join(normalized);
    socket.emit('session:ready', { sessionId, userId, roomId: normalized });
    broadcastRoomState(normalized);
  });

  socket.on('session:resume', ({ sessionId }) => {
    const entry = sessionIndex.get(sessionId);
    if (!entry) {
      socket.emit('session:invalid');
      return;
    }

    const room = rooms.get(entry.roomId);
    if (!room || !room.users[entry.userId]) {
      socket.emit('session:invalid');
      return;
    }

    room.users[entry.userId].socketId = socket.id;
    socket.join(entry.roomId);
    socket.emit('session:ready', {
      sessionId,
      userId: entry.userId,
      roomId: entry.roomId
    });
    broadcastRoomState(entry.roomId);
  });

  socket.on('turn:start', ({ roomId, userId }) => {
    const room = rooms.get(roomId);
    if (!room || room.gmId !== userId) return;
    room.turn.started = true;
    room.turn.currentIndex = 0;
    broadcastRoomState(roomId);
  });

  socket.on('turn:next', ({ roomId, userId }) => {
    const room = rooms.get(roomId);
    if (!room || room.gmId !== userId) return;
    if (!room.turn.started || room.turn.order.length === 0) return;
    room.turn.currentIndex = (room.turn.currentIndex + 1) % room.turn.order.length;
    broadcastRoomState(roomId);
  });

  socket.on('avatar:move', ({ roomId, userId, targetUserId, to }) => {
    const room = rooms.get(roomId);
    if (!room || !GRID_343.includes(to)) return;

    const actor = room.users[userId];
    const target = room.users[targetUserId];
    if (!actor || !target) return;

    const isGm = actor.role === 'gm';
    const canMoveOwn = actor.id === target.id;
    if (!isGm && !canMoveOwn) return;

    target.avatar.position = to;
    broadcastRoomState(roomId);
  });

  socket.on('disconnect', () => {
    rooms.forEach((room) => {
      Object.values(room.users).forEach((user) => {
        if (user.socketId === socket.id) {
          user.socketId = null;
        }
      });
    });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ARKLADOM beta online em http://localhost:${PORT}`);
});
