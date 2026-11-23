import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import './style.css';
import { io } from 'socket.io-client';
import { WEAPONS, SLOT_OPTIONS, SLOT_NAMES, Loadout, DEFAULT_LOADOUT, TEAM_NAMES, RULES } from '../shared/config';
import { RoomInfo, Mode } from '../shared/protocol';
import { Game } from './game';
import { Sfx } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
// 재접속용 토큰: 탭마다 따로 가진다
let token = sessionStorage.getItem('snap.token') ?? '';
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('snap.token', token); }

const settings = store.get('snap.settings', { sens: 1, volume: 0.6 });
const sfx = new Sfx(); sfx.setVolume(settings.volume);
const socket = io({ transports: ['websocket', 'polling'] });
const game = new Game($<HTMLCanvasElement>('view'), socket, sfx);
game.sens = settings.sens;
(window as any).__snap = game;

let room: RoomInfo | null = null;
let roomCode = sessionStorage.getItem('snap.room') ?? '';
let mode: Mode = '1v1';
let myLoadout: Loadout = store.get('snap.loadout', DEFAULT_LOADOUT);
const urlCode = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase();

// ---------- 공통 ----------
let toastT = 0;
function toast(msg: string) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('on'), 2600); }
function show(id: 'home' | 'lobby' | 'result' | 'none') {
  for (const s of ['home', 'lobby', 'result']) $(s).hidden = s !== id;
  if (id !== 'none') $('pause').hidden = true;
}
const fxq = new URLSearchParams(location.search).get('fx') === 'low' ? '&fx=low' : '';
function setUrl(code: string) { history.replaceState(null, '', code ? `?room=${code}${fxq}` : location.pathname + fxq.replace('&', '?')); }
const nick = $<HTMLInputElement>('nick');
nick.value = store.get('snap.name', '');
function myName() { const n = nick.value.trim() || '플레이어'; store.set('snap.name', n); return n; }

function settingsUI(host: HTMLElement) {
  host.innerHTML = `<label>마우스 감도</label><input type="range" min="0.2" max="3" step="0.05" data-k="sens"><output></output>
    <label>음량</label><input type="range" min="0" max="1" step="0.05" data-k="volume"><output></output>`;
  host.querySelectorAll<HTMLInputElement>('input').forEach((inp) => {
    const k = inp.dataset.k as 'sens' | 'volume', outEl = inp.nextElementSibling as HTMLOutputElement;
    const sync = () => { inp.value = String(settings[k]); outEl.textContent = k === 'sens' ? settings.sens.toFixed(2) : Math.round(settings.volume * 100) + '%'; };
    inp.addEventListener('input', () => {
      settings[k] = Number(inp.value); store.set('snap.settings', settings);
      game.sens = settings.sens; sfx.setVolume(settings.volume);
      document.querySelectorAll<HTMLInputElement>(`input[data-k="${k}"]`).forEach((o) => o.dispatchEvent(new Event('sync')));
      if (k === 'volume') sfx.play('ui');
    });
    inp.addEventListener('sync', sync); sync();
  });
}
settingsUI($('settingsHome')); settingsUI($('settingsInline'));

function loadoutUI(host: HTMLElement) {
  host.innerHTML = SLOT_OPTIONS.map((opts, s) => `<div class="loRow"><h3><kbd>${s + 1}</kbd>${SLOT_NAMES[s]}</h3><div class="loOpts" role="radiogroup" aria-label="${SLOT_NAMES[s]}">${
    opts.map((id) => { const w = WEAPONS[id]; return `<button class="loOpt" role="radio" data-s="${s}" data-id="${id}"><b>${w.name}</b><i>${w.range}</i><span>${w.desc}</span></button>`; }).join('')
  }</div></div>`).join('');
  host.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.loOpt'); if (!b) return;
    myLoadout = [...myLoadout] as Loadout; myLoadout[Number(b.dataset.s)] = b.dataset.id!;
    store.set('snap.loadout', myLoadout); socket.emit('loadout', myLoadout); sfx.play('ui'); syncLoadout();
  });
}
function syncLoadout() {
  document.querySelectorAll<HTMLElement>('.loOpt').forEach((b) => b.setAttribute('aria-checked', String(myLoadout[Number(b.dataset.s)] === b.dataset.id)));
}
loadoutUI($('lobbyLoadout')); loadoutUI($('pauseLoadout')); syncLoadout();

// ---------- 홈 ----------
if (urlCode) { $('inviteBox').hidden = false; $('createBox').hidden = true; $('inviteCode').textContent = urlCode; }
document.querySelectorAll<HTMLElement>('.seg button').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode as Mode; sfx.play('ui');
  document.querySelectorAll('.seg button').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
}));
function create(m: Mode) {
  sfx.unlock(); $('homeErr').textContent = '';
  socket.emit('create', { name: myName(), mode: m, token, loadout: myLoadout }, (r: { ok: boolean; code: string }) => {
    if (!r?.ok) return; roomCode = r.code;
    if (m !== 'practice') { sessionStorage.setItem('snap.room', roomCode); setUrl(roomCode); }
  });
}
function join(code: string, silent = false) {
  sfx.unlock(); $('homeErr').textContent = '';
  socket.emit('join', { code, name: myName(), token, loadout: myLoadout }, (r: { ok: boolean; code: string; err?: string; rejoined?: boolean }) => {
    if (!r?.ok) {
      roomCode = ''; sessionStorage.removeItem('snap.room');
      if (!silent) $('homeErr').textContent = r?.err ?? '입장하지 못했어요.';
      return;
    }
    roomCode = r.code; sessionStorage.setItem('snap.room', roomCode); setUrl(roomCode);
    if (r.rejoined) toast('방에 다시 연결됐어요');
  });
}
$('create').addEventListener('click', () => create(mode));
$('practice').addEventListener('click', () => create('practice'));
$('joinInvite').addEventListener('click', () => join(urlCode));
$('joinForm').addEventListener('submit', (e) => { e.preventDefault(); const c = $<HTMLInputElement>('code').value.trim().toUpperCase(); if (c.length < 5) { $('homeErr').textContent = '방 코드는 5자리예요.'; return; } join(c); });
$('openSettings').addEventListener('click', () => { $('settingsDlg').hidden = false; });
$('closeSettings').addEventListener('click', () => { $('settingsDlg').hidden = true; });

// ---------- 로비 ----------
function leave() {
  socket.emit('leave'); room = null; roomCode = ''; sessionStorage.removeItem('snap.room'); setUrl('');
  game.room = null; game.phase = 'lobby'; game.unlock();
  $('inviteBox').hidden = true; $('createBox').hidden = false; $('pause').hidden = true;
  show('home');
}
$('leave').addEventListener('click', leave);
$('quit').addEventListener('click', leave);
$('copy').addEventListener('click', async () => {
  const link = $<HTMLInputElement>('link');
  try { await navigator.clipboard.writeText(link.value); toast('초대 링크를 복사했어요'); } catch { link.select(); document.execCommand('copy'); toast('초대 링크를 복사했어요'); }
});
$('ready').addEventListener('click', () => { const me = room?.players.find((p) => p.id === room!.you); socket.emit('ready', !me?.ready); sfx.play('ready'); });
$('swap').addEventListener('click', () => socket.emit('team'));
$('start').addEventListener('click', () => { socket.emit('start'); game.lock(); });

function renderLobby(r: RoomInfo) {
  const n = r.mode === '2v2' ? 2 : 1;
  $('lobbyMode').textContent = r.mode === '2v2' ? '· 2 대 2' : '· 1 대 1';
  $('lobbyCode').textContent = r.code;
  $<HTMLInputElement>('link').value = `${location.origin}${location.pathname}?room=${r.code}`;
  for (const t of [0, 1]) {
    const ps = r.players.filter((p) => p.team === t);
    let html = ps.map((p) => `<li><span class="name">${esc(p.name)}</span>${p.id === r.you ? '<span class="tag">나</span>' : ''}${p.id === r.hostId ? '<span class="tag">방장</span>' : ''}<span class="tag ${p.ready ? 'ok' : 'wait'}">${p.ready ? '준비 완료' : '준비 전'}</span></li>`).join('');
    for (let i = ps.length; i < n; i++) html += '<li class="empty">빈 자리 · 초대 링크를 보내세요</li>';
    $(t === 0 ? 'teamA' : 'teamB').innerHTML = html;
  }
  const me = r.players.find((p) => p.id === r.you)!;
  const rb = $('ready'); rb.textContent = me.ready ? '준비 취소' : '준비'; rb.classList.toggle('on', me.ready);
  const full = r.players.length === n * 2 && [0, 1].every((t) => r.players.filter((p) => p.team === t).length === n);
  const allReady = r.players.every((p) => p.ready);
  const host = r.hostId === r.you;
  const sb = $<HTMLButtonElement>('start'); sb.hidden = !host; sb.disabled = !(full && allReady);
  $('swap').toggleAttribute('disabled', r.players.filter((p) => p.team !== me.team).length >= n);
  $('lobbyHint').textContent = !full ? `${n * 2}명이 모이면 시작할 수 있어요 (${r.players.length}/${n * 2})` : !allReady ? '모두 준비하면 시작할 수 있어요' : host ? '모두 준비됐어요' : '방장이 시작하길 기다리는 중';
}

// ---------- 결과 ----------
$('rematch').addEventListener('click', () => { socket.emit('rematch'); sfx.play('ready'); });
$('resLobby').addEventListener('click', () => socket.emit('toLobby'));
function renderResult(r: RoomInfo) {
  const me = r.players.find((p) => p.id === r.you), res = r.result!;
  const won = res.winner === me?.team;
  $('resTitle').textContent = won ? '승리!' : '패배';
  $('resSub').textContent = res.forfeit ? `상대가 ${RULES.reconnectGraceMs / 1000}초 안에 돌아오지 않아 ${TEAM_NAMES[res.winner]} 팀의 기권승으로 끝났어요.` : `${TEAM_NAMES[res.winner]} 팀이 먼저 ${RULES.roundsToWin}라운드를 이겼어요.`;
  $('resA').textContent = String(r.score[0]); $('resB').textContent = String(r.score[1]);
  $('resTable').querySelector('tbody')!.innerHTML = [...r.players].sort((a, b) => a.team - b.team || b.kills - a.kills).map((p) =>
    `<tr data-team="${p.team}"><td>${esc(p.name)}${p.id === r.you ? ' (나)' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.dmg}</td><td>${!p.connected ? '<span class="tag off">연결 끊김</span>' : p.rematch ? '<span class="tag ok">원함</span>' : '<span class="tag wait">대기</span>'}</td></tr>`).join('');
  const n = r.mode === '2v2' ? 2 : 1;
  const full = [0, 1].every((t) => r.players.filter((p) => p.team === t && p.connected).length === n);
  const rb = $<HTMLButtonElement>('rematch'); rb.disabled = !full || !!me?.rematch;
  rb.textContent = me?.rematch ? '재대결 수락함' : '같은 멤버로 재대결';
  $('resHint').textContent = !full ? '멤버가 빠져서 재대결할 수 없어요. 로비에서 다시 모으세요.' : me?.rematch ? '다른 플레이어를 기다리는 중' : '모두 누르면 바로 다시 시작해요';
}

// ---------- 일시 정지(마우스 잠금 해제) ----------
function renderPause() {
  if (!room) return;
  const live = room.phase === 'live' || room.phase === 'roundEnd';
  $('pauseTitle').textContent = room.mode === 'practice' ? '혼자 연습장 (기록 없음)' : '일시 정지 · 경기는 계속 진행 중';
  $('loadoutNote').textContent = room.mode === 'practice' ? '연습장에서는 바꾼 장비가 바로 적용돼요.' : live ? '지금 바꾼 장비는 다음 라운드부터 적용돼요.' : '준비 시간에 바꾼 장비는 이번 라운드에 바로 적용돼요.';
}
game.onPause = (p) => { $('pause').hidden = !p; if (p) renderPause(); };
$('resume').addEventListener('click', () => game.lock());
addEventListener('keydown', (e) => { if (e.code === 'KeyB' && game.inMatch && game.active) game.unlock(); });

// ---------- 서버 ----------
socket.on('connect', () => { if (roomCode) join(roomCode, true); else if (urlCode && !room) { /* 닉네임 입력을 기다린다 */ } });
socket.on('disconnect', () => toast('서버와 연결이 끊겼어요. 다시 연결하는 중…'));
socket.on('room', (r: RoomInfo) => {
  const prev = room; room = r;
  const me = r.players.find((p) => p.id === r.you);
  if (me && (r.phase === 'lobby' || !prev)) { myLoadout = [...me.next] as Loadout; syncLoadout(); }
  game.onRoom(r);
  if (!$('pause').hidden) renderPause();
  if (r.phase === 'lobby') { show('lobby'); renderLobby(r); }
  else if (r.phase === 'matchEnd') { show('result'); renderResult(r); }
  else {
    show('none');
    if (!game.active && !game.dbg.on) { $('pause').hidden = false; renderPause(); }
  }
  if (prev && prev.phase !== 'lobby' && r.phase !== 'matchEnd') {
    for (const p of prev.players) {
      const now = r.players.find((q) => q.id === p.id);
      if (!now && !p.bot) toast(`${p.name} 님이 돌아오지 않아 기권 처리됐어요`);
      else if (now && p.connected && !now.connected) toast(`${p.name} 님 연결 끊김 · ${RULES.reconnectGraceMs / 1000}초 동안 자리를 지켜요`);
      else if (now && !p.connected && now.connected) toast(`${p.name} 님이 돌아왔어요`);
    }
  }
});
show('home');
if (!nick.value) nick.focus();
