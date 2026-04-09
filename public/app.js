const socket = io();

const appState = {
  sessionId: localStorage.getItem('ark_session_id') || null,
  userId: localStorage.getItem('ark_user_id') || null,
  roomId: localStorage.getItem('ark_room_id') || null,
  room: null,
  selectedAvatarUserId: null
};

const el = {
  name: document.getElementById('name'),
  roomId: document.getElementById('roomId'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  status: document.getElementById('status'),
  lobby: document.getElementById('lobby'),
  table: document.getElementById('table'),
  sessionBadge: document.getElementById('sessionBadge'),
  playerList: document.getElementById('playerList'),
  bossSlot: document.getElementById('bossSlot'),
  enemyRow2: document.getElementById('enemyRow2'),
  enemyRow1: document.getElementById('enemyRow1'),
  allyRow: document.getElementById('allyRow'),
  formationGrid: document.getElementById('formationGrid'),
  mySlots: document.getElementById('mySlots'),
  myHand: document.getElementById('myHand'),
  turnInfo: document.getElementById('turnInfo'),
  startTurnBtn: document.getElementById('startTurnBtn'),
  nextTurnBtn: document.getElementById('nextTurnBtn')
};

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.className = isError ? 'status error' : 'status';
}

function getMe() {
  return appState.room?.players?.find((p) => p.id === appState.userId) || null;
}

function getActiveUser() {
  if (!appState.room?.turn?.activeUserId) return null;
  return appState.room.players.find((p) => p.id === appState.room.turn.activeUserId) || null;
}

function card(text, cssClass = '') {
  const node = document.createElement('div');
  node.className = `card ${cssClass}`.trim();
  node.textContent = text;
  return node;
}

function renderPlayers() {
  el.playerList.innerHTML = '';
  appState.room.players.forEach((player) => {
    const item = document.createElement('li');
    item.className = 'player-item';
    const tag = player.role === 'gm' ? ' (Mestre)' : '';
    item.textContent = `${player.name}${tag} @${player.avatar.position}`;

    const canSelect = getMe()?.role === 'gm' || player.id === appState.userId;
    if (canSelect) {
      const button = document.createElement('button');
      button.textContent = 'Selecionar avatar';
      button.onclick = () => {
        appState.selectedAvatarUserId = player.id;
        render();
      };
      item.appendChild(button);
    }

    if (appState.selectedAvatarUserId === player.id) {
      item.classList.add('selected');
    }

    el.playerList.appendChild(item);
  });
}

function renderBoard() {
  const { board } = appState.room;

  el.bossSlot.innerHTML = '';
  el.bossSlot.appendChild(card(board.bossSlot.title, 'boss-card'));

  el.enemyRow2.innerHTML = '';
  board.enemiesRow2.forEach((enemy) => {
    el.enemyRow2.appendChild(card(enemy.title, 'enemy-card'));
  });

  el.enemyRow1.innerHTML = '';
  board.enemiesRow1.forEach((enemy) => {
    el.enemyRow1.appendChild(card(enemy.title, 'enemy-card'));
  });

  el.allyRow.innerHTML = '';
  appState.room.players.forEach((player) => {
    const n = card(`${player.name} (${player.role})`, 'ally-card');
    el.allyRow.appendChild(n);
  });

  el.formationGrid.innerHTML = '';
  board.formationGrid.forEach((cell) => {
    const cellNode = document.createElement('button');
    cellNode.className = 'grid-cell';
    cellNode.type = 'button';
    cellNode.textContent = cell;

    const occupants = appState.room.players.filter((p) => p.avatar.position === cell);
    if (occupants.length > 0) {
      const info = document.createElement('small');
      info.textContent = occupants.map((p) => p.name).join(', ');
      cellNode.appendChild(document.createElement('br'));
      cellNode.appendChild(info);
    }

    cellNode.onclick = () => {
      if (!appState.selectedAvatarUserId) return;
      socket.emit('avatar:move', {
        roomId: appState.room.roomId,
        userId: appState.userId,
        targetUserId: appState.selectedAvatarUserId,
        to: cell
      });
    };

    el.formationGrid.appendChild(cellNode);
  });
}

function renderPersonalAreas() {
  const me = getMe();
  if (!me) return;

  el.mySlots.innerHTML = '';
  me.slots.forEach((slot) => {
    el.mySlots.appendChild(card(`${slot.name}: ${slot.card?.name || 'vazio'}`, 'slot-card'));
  });

  el.myHand.innerHTML = '';
  me.hand.forEach((h) => {
    const label = h.hidden ? 'Carta oculta' : `${h.name} (${h.type})`;
    el.myHand.appendChild(card(label, 'hand-card'));
  });
}

function renderTurn() {
  const me = getMe();
  const active = getActiveUser();

  if (!appState.room.turn.started) {
    el.turnInfo.textContent = 'Turno não iniciado';
  } else {
    el.turnInfo.textContent = active
      ? `Turno ativo: ${active.name}`
      : 'Turno ativo: (desconhecido)';
  }

  const isGm = me?.role === 'gm';
  el.startTurnBtn.disabled = !isGm;
  el.nextTurnBtn.disabled = !isGm || !appState.room.turn.started;
}

function renderSession() {
  const me = getMe();
  el.sessionBadge.textContent = me
    ? `Sala ${appState.room.roomId} | ${me.name} (${me.role})`
    : 'Sem sessão';
}

function render() {
  if (!appState.room) {
    el.table.classList.add('hidden');
    return;
  }

  el.table.classList.remove('hidden');
  renderPlayers();
  renderBoard();
  renderPersonalAreas();
  renderTurn();
  renderSession();
}

el.createRoomBtn.onclick = () => {
  socket.emit('room:create', { roomId: el.roomId.value, name: el.name.value });
};

el.joinRoomBtn.onclick = () => {
  socket.emit('room:join', { roomId: el.roomId.value, name: el.name.value });
};

el.resumeBtn.onclick = () => {
  if (!appState.sessionId) {
    setStatus('Não há sessão salva neste navegador.', true);
    return;
  }
  socket.emit('session:resume', { sessionId: appState.sessionId });
};

el.startTurnBtn.onclick = () => {
  socket.emit('turn:start', {
    roomId: appState.room.roomId,
    userId: appState.userId
  });
};

el.nextTurnBtn.onclick = () => {
  socket.emit('turn:next', {
    roomId: appState.room.roomId,
    userId: appState.userId
  });
};

socket.on('connect', () => {
  if (appState.sessionId) {
    socket.emit('session:resume', { sessionId: appState.sessionId });
  }
});

socket.on('room:error', (message) => setStatus(message, true));

socket.on('session:invalid', () => {
  setStatus('Sessão expirada. Entre novamente na sala.', true);
  localStorage.removeItem('ark_session_id');
  localStorage.removeItem('ark_user_id');
  localStorage.removeItem('ark_room_id');
  appState.sessionId = null;
  appState.userId = null;
  appState.roomId = null;
});

socket.on('session:ready', ({ sessionId, userId, roomId }) => {
  appState.sessionId = sessionId;
  appState.userId = userId;
  appState.roomId = roomId;
  localStorage.setItem('ark_session_id', sessionId);
  localStorage.setItem('ark_user_id', userId);
  localStorage.setItem('ark_room_id', roomId);
  setStatus(`Conectado na sala ${roomId}.`);
});

socket.on('room:state', (room) => {
  appState.room = room;
  if (!appState.selectedAvatarUserId) {
    appState.selectedAvatarUserId = appState.userId;
  }
  render();
});
