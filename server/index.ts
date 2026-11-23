import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RULES, TICK, MOVE, WEAPONS, DEFAULT_LOADOUT, Loadout, validLoadout, GunCfg, MeleeCfg } from '../shared/config';
import { SPAWNS, PRACTICE_DUMMIES } from '../shared/map';
import { Input, PState, newPState, simulate, aimDir, rayMap, rayPlayer, falloffMul, spreadDir } from '../shared/sim';
import { Mode, Phase, RoomInfo, Snap, SnapPlayer, GameEvent } from '../shared/protocol';

interface Player {
  id: number; token: string; socket: Socket | null; name: string; team: number; ready: boolean;
  connected: boolean; dcAt: number; bot: boolean; loadout: Loadout; next: Loadout;
  st: PState; hp: number; alive: boolean; yaw: number; pitch: number;
  queue: Input[]; budget: number; ack: number; hist: { t: number; x: number; y: number; z: number }[];
  kills: number; deaths: number; dmg: number; rematch: boolean; respawnAt: number; spawn: number;
}
interface Room {
  code: string; mode: Mode; phase: Phase; players: Player[]; hostId: number; score: [number, number];
  round: number; phaseEnd: number; events: GameEvent[]; nextId: number; emptySince: number;
  result: RoomInfo['result']; lastRound: RoomInfo['lastRound']; tick: number;
}

// 자동 검증용: SNAP_TEST="freeze=1,end=1,grace=4000,round=10" 처럼 시간을 줄일 수 있다
for (const kv of (process.env.SNAP_TEST ?? '').split(',')) {
  const [k, v] = kv.split('='); const n = Number(v);
  if (k === 'freeze') RULES.freezeTime = n; else if (k === 'end') RULES.roundEndTime = n;
  else if (k === 'grace') RULES.reconnectGraceMs = n; else if (k === 'round') RULES.roundTime = n;
}
const rooms = new Map<string, Room>();
const bySocket = new Map<string, { room: Room; player: Player }>();
const now = () => performance.now();
const size = (mode: Mode) => (mode === '2v2' ? 2 : 1);

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}
function cleanName(n: unknown) {
  const s = String(n ?? '').replace(/[<>&"'\n\r]/g, '').trim().slice(0, 12);
  return s || '플레이어';
}
function newPlayer(room: Room, name: string, token: string, team: number, bot = false): Player {
  return {
    id: room.nextId++, token, socket: null, name, team, ready: bot, connected: !bot, dcAt: 0, bot,
    loadout: [...DEFAULT_LOADOUT], next: [...DEFAULT_LOADOUT], st: newPState(0, 0, DEFAULT_LOADOUT),
    hp: RULES.maxHp, alive: true, yaw: 0, pitch: 0, queue: [], budget: 0, ack: 0, hist: [],
    kills: 0, deaths: 0, dmg: 0, rematch: false, respawnAt: 0, spawn: 0,
  };
}
function roomInfo(room: Room, you: number): RoomInfo {
  return {
    code: room.code, mode: room.mode, phase: room.phase, hostId: room.hostId, you,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, ready: p.ready, connected: p.connected, bot: p.bot,
      loadout: p.loadout, next: p.next, kills: p.kills, deaths: p.deaths, dmg: Math.round(p.dmg), rematch: p.rematch,
    })),
    score: room.score, round: room.round, result: room.result, lastRound: room.lastRound,
  };
}
function sendRoom(room: Room) {
  for (const p of room.players) p.socket?.emit('room', roomInfo(room, p.id));
}
function humans(room: Room) { return room.players.filter((p) => !p.bot); }

function placeAtSpawn(room: Room, p: Player) {
  let x: number, z: number, yaw: number;
  if (p.bot) { [x, z] = PRACTICE_DUMMIES[p.spawn % PRACTICE_DUMMIES.length]; yaw = Math.PI / 2; }
  else [x, z, yaw] = SPAWNS[p.team][p.spawn % 2];
  p.loadout = [...p.next];
  p.st = newPState(x, z, p.loadout);
  p.hp = RULES.maxHp; p.alive = true; p.yaw = yaw; p.pitch = 0; p.queue = []; p.hist = [];
  room.events.push({ k: 'respawn', id: p.id });
}
function startRound(room: Room) {
  room.round++;
  room.phase = 'freeze';
  room.phaseEnd = now() + RULES.freezeTime * 1000;
  const n = [0, 0];
  for (const p of room.players) { p.spawn = n[p.team]++; placeAtSpawn(room, p); }
  sendRoom(room);
}
function startMatch(room: Room) {
  room.score = [0, 0]; room.round = 0; room.result = null; room.lastRound = null;
  for (const p of room.players) { p.kills = p.deaths = p.dmg = 0; p.rematch = false; }
  startRound(room);
}
function endRound(room: Room, winner: number, reason: string) {
  room.lastRound = { winner, reason };
  if (winner >= 0) room.score[winner]++;
  if (winner >= 0 && room.score[winner] >= RULES.roundsToWin) return endMatch(room, winner, false);
  room.phase = 'roundEnd';
  room.phaseEnd = now() + RULES.roundEndTime * 1000;
  sendRoom(room);
}
function endMatch(room: Room, winner: number, forfeit: boolean) {
  room.phase = 'matchEnd';
  room.result = { winner, forfeit };
  for (const p of room.players) p.rematch = false;
  sendRoom(room);
}
function toLobby(room: Room) {
  room.phase = 'lobby'; room.result = null; room.lastRound = null; room.score = [0, 0]; room.round = 0;
  room.players = room.players.filter((p) => p.connected);
  for (const p of room.players) { p.ready = false; p.rematch = false; }
  if (!room.players.find((p) => p.id === room.hostId) && room.players[0]) room.hostId = room.players[0].id;
  sendRoom(room);
}
function removePlayer(room: Room, p: Player) {
  room.players = room.players.filter((q) => q !== p);
  if (room.hostId === p.id) { const h = humans(room).find((q) => q.connected); if (h) room.hostId = h.id; }
}
function canStart(room: Room) {
  const n = size(room.mode);
  return room.phase === 'lobby' && [0, 1].every((t) => room.players.filter((p) => p.team === t).length === n) &&
    room.players.every((p) => p.ready && p.connected);
}

// ---------- 판정 ----------
function posAt(p: Player, t: number) {
  const h = p.hist;
  if (h.length === 0 || t >= h[h.length - 1].t) return p.st;
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], k = (t - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return h[0];
}
function damage(room: Room, att: Player, vic: Player, dmg: number, head: boolean, pos: number[], melee: boolean) {
  dmg = Math.min(dmg, vic.hp);
  vic.hp -= dmg; att.dmg += dmg; vic.respawnAt = now() + 2500; // 연습장 표적 회복 타이머로도 쓴다
  const kill = vic.hp <= 0;
  if (kill) {
    vic.alive = false; vic.deaths++; att.kills++;
    if (room.mode === 'practice') vic.respawnAt = now() + RULES.practiceRespawn * 1000;
  }
  room.events.push({ k: 'hit', att: att.id, vic: vic.id, dmg: Math.round(dmg), head, pos, from: [att.st.x, att.st.y + MOVE.eye, att.st.z], kill, melee });
  if (kill) sendRoom(room);
}
function resolveAttack(room: Room, p: Player, inp: Input, melee: boolean) {
  const cfg = WEAPONS[p.loadout[p.st.w.slot]];
  const o = [p.st.x, p.st.y + MOVE.eye, p.st.z];
  const base = aimDir(inp.yaw, inp.pitch);
  const tNow = now();
  const rt = Math.min(tNow, Math.max(tNow - 400, inp.rt || tNow));
  const targets = room.players.filter((q) => q !== p && q.alive && q.team !== p.team).map((q) => ({ q, pos: posAt(q, rt) }));
  if (melee) {
    const m = cfg as MeleeCfg;
    const wall = rayMap(o, base);
    let best: { q: Player; t: number } | null = null;
    for (const { q, pos } of targets) {
      const r = rayPlayer(o, base, pos.x, pos.y, pos.z, 0.35);
      if (r.t <= m.reach && r.t < wall + 0.3 && (!best || r.t < best.t)) best = { q, t: r.t };
    }
    if (best) damage(room, p, best.q, m.dmg, false, [o[0] + base[0] * best.t, o[1] + base[1] * best.t, o[2] + base[2] * best.t], true);
    return;
  }
  const g = cfg as GunCfg;
  let spread = g.spreadHip + (g.spreadAds - g.spreadHip) * p.st.w.ads;
  if (!p.st.ground) spread = spread * 1.6 + 0.6;
  const ends: number[][] = [];
  const total = new Map<Player, { dmg: number; head: boolean; pos: number[] }>();
  for (let i = 0; i < g.pellets; i++) {
    const d = spreadDir(base, spread, Math.random(), Math.random());
    let t = rayMap(o, d), hit: Player | null = null, head = false;
    for (const { q, pos } of targets) {
      const r = rayPlayer(o, d, pos.x, pos.y, pos.z);
      if (r.t < t) { t = r.t; hit = q; head = r.head; }
    }
    if (t === Infinity) t = 80;
    const end = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    ends.push(end.map((v) => Math.round(v * 100) / 100));
    if (hit) {
      const e = total.get(hit) ?? { dmg: 0, head: false, pos: end };
      e.dmg += g.dmg * falloffMul(g, t) * (head ? g.head : 1);
      e.head = e.head || head;
      total.set(hit, e);
    }
  }
  room.events.push({ k: 'shot', id: p.id, wid: p.loadout[p.st.w.slot], o, ends });
  for (const [q, e] of total) damage(room, p, q, e.dmg, e.head, e.pos, false);
}

// ---------- 틱 ----------
function neutral(p: Player): Input {
  return { seq: p.ack, f: 0, s: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: p.st.w.slot, yaw: p.yaw, pitch: p.pitch, rt: 0 };
}
function tickRoom(room: Room) {
  const t = now();
  room.tick++;
  const hs = humans(room);
  // 방 정리, 재접속 유예
  if (hs.every((p) => !p.connected)) {
    if (!room.emptySince) room.emptySince = t;
    if (t - room.emptySince > 60000 || hs.length === 0) { rooms.delete(room.code); return; }
  } else room.emptySince = 0;
  if (room.phase !== 'lobby') {
    for (const p of hs) {
      if (!p.connected && t - p.dcAt > RULES.reconnectGraceMs) {
        removePlayer(room, p);
        const left = [0, 1].map((tm) => humans(room).filter((q) => q.team === tm).length);
        if (room.mode !== 'practice' && room.phase !== 'matchEnd' && (left[0] === 0 || left[1] === 0)) endMatch(room, left[0] === 0 ? 1 : 0, true);
        else sendRoom(room);
      }
    }
  }
  // 단계 전환
  if (room.phase === 'freeze' && t >= room.phaseEnd) {
    room.phase = 'live'; room.phaseEnd = t + RULES.roundTime * 1000; sendRoom(room);
  } else if (room.phase === 'roundEnd' && t >= room.phaseEnd) startRound(room);
  if (room.phase === 'lobby' || room.phase === 'matchEnd') return;

  const canMove = room.phase !== 'freeze', canAct = room.phase === 'live';
  for (const p of room.players) {
    if (room.mode === 'practice' && !p.alive && t >= p.respawnAt) { placeAtSpawn(room, p); sendRoom(room); }
    if (!p.alive) { p.queue.length = 0; continue; }
    if (room.mode === 'practice' && p.bot && p.hp < RULES.maxHp && t >= p.respawnAt) p.hp = RULES.maxHp; // 표적은 잠시 뒤 체력 회복
    p.budget = Math.min(p.budget + TICK, 0.25);
    if (p.queue.length > 30) p.queue.splice(0, p.queue.length - 30);
    let n = 0;
    while (p.budget >= TICK && n < 6) {
      const real = p.queue.shift();
      if (!real && (p.budget < 0.12 && !p.bot && p.connected)) break; // 입력이 잠깐 늦는 것은 기다린다
      const inp = real ?? neutral(p);
      p.budget -= TICK; n++;
      if (real) { p.ack = real.seq; p.yaw = real.yaw; p.pitch = real.pitch; }
      const evs = simulate(p.st, inp, TICK, p.loadout, canMove, canAct);
      for (const e of evs) {
        if (e === 'fire') resolveAttack(room, p, inp, false);
        else if (e === 'meleeHit') resolveAttack(room, p, inp, true);
        else if (e === 'switch' || e === 'swing' || e === 'reload') room.events.push({ k: 'act', id: p.id, a: e });
      }
      if (!real) break;
    }
    p.hist.push({ t, x: p.st.x, y: p.st.y, z: p.st.z });
    if (p.hist.length > 40) p.hist.shift();
  }
  // 라운드 판정
  if (room.phase === 'live' && room.mode !== 'practice') {
    const alive = [0, 1].map((tm) => room.players.filter((p) => p.team === tm && p.alive));
    if (alive[0].length === 0 || alive[1].length === 0) {
      endRound(room, alive[0].length === 0 ? (alive[1].length === 0 ? -1 : 1) : 0, '전원 탈락');
    } else if (t >= room.phaseEnd) {
      const hp = alive.map((a) => a.reduce((s, p) => s + p.hp, 0));
      if (alive[0].length !== alive[1].length) endRound(room, alive[0].length > alive[1].length ? 0 : 1, '시간 초과 · 생존 인원 우세');
      else if (hp[0] !== hp[1]) endRound(room, hp[0] > hp[1] ? 0 : 1, '시간 초과 · 남은 체력 우세');
      else endRound(room, -1, '시간 초과 · 무승부');
    }
  }
  // 스냅샷 30Hz
  if (room.tick % 2 === 0) {
    const pl: SnapPlayer[] = room.players.map((p) => [p.id, p.st.x, p.st.y, p.st.z, p.yaw, p.pitch, p.hp, p.alive ? 1 : 0, p.st.w.slot]);
    const tl = room.mode === 'practice' ? -1 : Math.max(0, (room.phaseEnd - t) / 1000);
    const evs = room.events.splice(0);
    for (const p of room.players) {
      if (!p.socket) continue;
      const snap: Snap = { t, ph: room.phase, tl, pl, me: { ack: p.ack, st: p.st, hp: p.hp, alive: p.alive } };
      p.socket.volatile.emit('snap', snap);
      if (evs.length) p.socket.emit('ev', evs);
    }
  }
}

let last = now(), acc = 0;
setInterval(() => {
  const t = now();
  acc = Math.min(acc + (t - last) / 1000, 0.1); last = t;
  while (acc >= TICK) { acc -= TICK; for (const room of rooms.values()) tickRoom(room); }
}, 8);

// ---------- 네트워크 ----------
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.get('/healthz', (_q, r) => { r.json({ ok: true, rooms: rooms.size }); });
app.use(express.static(dist));
app.get(/.*/, (_q, r) => { r.sendFile(path.join(dist, 'index.html')); });

function attach(socket: Socket, room: Room, player: Player) {
  bySocket.set(socket.id, { room, player });
  player.socket = socket; player.connected = true;
  socket.join(room.code);
}
function detach(socket: Socket, leaving: boolean) {
  const ctx = bySocket.get(socket.id);
  if (!ctx) return;
  bySocket.delete(socket.id);
  const { room, player } = ctx;
  if (player.socket !== socket) return;
  player.socket = null; player.connected = false; player.dcAt = now();
  if (room.phase === 'lobby' || room.mode === 'practice') removePlayer(room, player);
  else if (leaving) player.dcAt = -1e9; // 스스로 나가면 유예 없이 기권 처리
  sendRoom(room);
}

io.on('connection', (socket) => {
  const ctx = () => bySocket.get(socket.id);
  socket.on('create', (d: { name: string; mode: Mode; token: string; loadout?: unknown }, ack: (r: unknown) => void) => {
    detach(socket, true);
    const mode: Mode = d?.mode === '2v2' ? '2v2' : d?.mode === 'practice' ? 'practice' : '1v1';
    const room: Room = {
      code: makeCode(), mode, phase: 'lobby', players: [], hostId: 0, score: [0, 0], round: 0, phaseEnd: 0,
      events: [], nextId: 1, emptySince: 0, result: null, lastRound: null, tick: 0,
    };
    const p = newPlayer(room, cleanName(d?.name), String(d?.token), 0);
    if (validLoadout(d?.loadout)) { p.next = [...d.loadout] as Loadout; p.loadout = [...p.next]; }
    room.players.push(p); room.hostId = p.id;
    rooms.set(room.code, room);
    attach(socket, room, p);
    if (mode === 'practice') {
      PRACTICE_DUMMIES.forEach((_, i) => { const b = newPlayer(room, `표적 ${i + 1}`, 'bot' + i, 1, true); b.spawn = i; room.players.push(b); });
      room.phase = 'live';
      for (const q of room.players) placeAtSpawn(room, q);
    }
    ack?.({ ok: true, code: room.code });
    sendRoom(room);
  });
  socket.on('join', (d: { code: string; name: string; token: string; loadout?: unknown }, ack: (r: unknown) => void) => {
    const room = rooms.get(String(d?.code ?? '').toUpperCase().trim());
    if (!room || room.mode === 'practice') return ack?.({ ok: false, err: '방을 찾을 수 없어요. 코드를 다시 확인하세요.' });
    const old = room.players.find((p) => p.token === String(d?.token));
    if (old) {
      if (ctx()?.player !== old) detach(socket, true);
      old.socket?.disconnect(true);
      attach(socket, room, old);
      old.queue = [];
      ack?.({ ok: true, code: room.code, rejoined: true });
      return sendRoom(room);
    }
    if (room.phase !== 'lobby') return ack?.({ ok: false, err: '이미 경기가 진행 중인 방이에요.' });
    if (room.players.length >= size(room.mode) * 2) return ack?.({ ok: false, err: '방이 가득 찼어요.' });
    detach(socket, true);
    const c0 = room.players.filter((p) => p.team === 0).length, c1 = room.players.length - c0;
    const p = newPlayer(room, cleanName(d?.name), String(d?.token), c0 <= c1 ? 0 : 1);
    if (validLoadout(d?.loadout)) { p.next = [...d.loadout] as Loadout; p.loadout = [...p.next]; }
    room.players.push(p);
    attach(socket, room, p);
    ack?.({ ok: true, code: room.code });
    sendRoom(room);
  });
  socket.on('ready', (v: boolean) => { const c = ctx(); if (c && c.room.phase === 'lobby') { c.player.ready = !!v; sendRoom(c.room); } });
  socket.on('team', () => {
    const c = ctx(); if (!c || c.room.phase !== 'lobby') return;
    const other = 1 - c.player.team;
    if (c.room.players.filter((p) => p.team === other).length < size(c.room.mode)) { c.player.team = other; c.player.ready = false; sendRoom(c.room); }
  });
  socket.on('loadout', (l: unknown) => {
    const c = ctx(); if (!c || !validLoadout(l)) return;
    c.player.next = [...l] as Loadout;
    const { room, player } = c;
    if (room.phase === 'lobby') player.loadout = [...player.next];
    else if ((room.phase === 'freeze' || room.mode === 'practice') && player.alive) { // 준비 시간과 연습장에서는 바로 적용
      player.loadout = [...player.next];
      const s = player.st; player.st = newPState(s.x, s.z, player.loadout); player.st.y = s.y;
      room.events.push({ k: 'act', id: player.id, a: 'switch' });
    }
    sendRoom(room);
  });
  socket.on('start', () => { const c = ctx(); if (c && c.player.id === c.room.hostId && canStart(c.room)) startMatch(c.room); });
  socket.on('in', (batch: Input[]) => {
    const c = ctx(); if (!c || !Array.isArray(batch)) return;
    for (const i of batch.slice(0, 20)) {
      if (!i || typeof i.seq !== 'number' || !isFinite(i.yaw) || !isFinite(i.pitch)) continue;
      c.player.queue.push({
        seq: i.seq, f: Math.max(-1, Math.min(1, +i.f || 0)), s: Math.max(-1, Math.min(1, +i.s || 0)),
        jump: !!i.jump, sprint: !!i.sprint, fire: !!i.fire, ads: !!i.ads, reload: !!i.reload, slot: i.slot | 0,
        yaw: i.yaw, pitch: Math.max(-1.55, Math.min(1.55, i.pitch)), rt: +i.rt || 0,
      });
    }
  });
  socket.on('inspect', () => { const c = ctx(); if (c) c.room.events.push({ k: 'act', id: c.player.id, a: 'inspect' }); });
  socket.on('rematch', () => {
    const c = ctx(); if (!c || c.room.phase !== 'matchEnd') return;
    c.player.rematch = true;
    const n = size(c.room.mode);
    const full = [0, 1].every((t) => c.room.players.filter((p) => p.team === t && p.connected).length === n);
    if (full && c.room.players.every((p) => p.rematch)) startMatch(c.room); else sendRoom(c.room);
  });
  socket.on('toLobby', () => { const c = ctx(); if (c && c.room.phase === 'matchEnd') toLobby(c.room); });
  socket.on('leave', () => detach(socket, true));
  socket.on('pg', (t: number, ack: (t: number) => void) => ack?.(t));
  socket.on('disconnect', () => detach(socket, false));
});

const PORT = Number(process.env.PORT) || 3000;
http.listen(PORT, '0.0.0.0', () => console.log(`SNAP ARENA 서버 실행 중: http://localhost:${PORT}`));
