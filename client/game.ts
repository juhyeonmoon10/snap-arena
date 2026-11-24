// 경기 화면: 입력, 클라이언트 예측/서버 보정, 상대 보간, 연출, HUD 갱신.
import * as THREE from 'three';
import type { Socket } from 'socket.io-client';
import { TICK, MOVE, RULES, WEAPONS, GunCfg, Loadout, TEAM_COLORS, TEAM_NAMES } from '../shared/config';
import { Input, PState, simulate, cloneState, aimDir, rayMap, rayPlayer, spreadDir } from '../shared/sim';
import { RoomInfo, Snap, GameEvent, Phase, PlayerInfo } from '../shared/protocol';
import { buildWorld } from './world';
import { makeAvatar, Avatar, box } from './models';
import { ViewModel } from './viewmodel';
import { Sfx } from './audio';
import { LOW } from './fx';

interface Remote {
  info: PlayerInfo; av: Avatar; buf: { t: number; x: number; y: number; z: number; yaw: number; pitch: number }[];
  hp: number; alive: boolean; slot: number; wid: string; walk: number; swing: number; kick: number; inspect: number;
  pos: THREE.Vector3; yaw: number; pitch: number; tag: THREE.Sprite | null; dead: number;
}
interface Particle { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number; grav: number; spin: number }
const $ = (id: string) => document.getElementById(id)!;
const BASE_FOV = 80;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 300);
  vm = new ViewModel();
  room: RoomInfo | null = null;
  phase: Phase = 'lobby';
  timeLeft = 0;
  st: PState | null = null;
  hp = 100; alive = false;
  yaw = 0; pitch = 0;
  sens = 1;
  active = false; // 마우스 잠금 상태(조작 가능)
  dbg: { on: boolean; f: number; s: number; jump: boolean; sprint: boolean; fire: boolean; ads: boolean } = { on: false, f: 0, s: 0, jump: false, sprint: false, fire: false, ads: false };
  onPause: (paused: boolean) => void = () => {};
  stats = { fps: 0, frames: 0, worst: 0 };

  private keys = new Set<string>();
  private mouseL = false; private mouseR = false; reloadPressed = false;
  private slot = 0;
  private pending: Input[] = []; private outbox: Input[] = []; private seq = 0;
  remotes = new Map<number, Remote>();
  private offset: number | null = null;
  private acc = 0; private last = performance.now();
  private prevPos = new THREE.Vector3(); private err = new THREE.Vector3(); private eyeY = 0;
  private recoil = { p: 0, y: 0 };
  private lookDx = 0; private lookDy = 0;
  private parts: Particle[] = []; private tracers: { m: THREE.Mesh; life: number }[] = [];
  private dmgDirs: { x: number; z: number; life: number; el: HTMLElement }[] = [];
  private hitT = 0; private flashT = 0; private shake = 0;
  private lastBeep = -1; private fpsT = 0; private fpsN = 0;
  private orbit = 0;
  private deathPos = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, public socket: Socket, public sfx: Sfx) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const low = LOW; // 느린 기기용: 그림자 끔, 해상도 절반, 가벼운 재질
    this.renderer.setPixelRatio(low ? 0.5 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !low; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.camera.rotation.order = 'YXZ';
    this.renderer.toneMapping = LOW ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    buildWorld(this.scene, this.renderer);
    this.vm.scene.environment = this.scene.environment; this.vm.scene.environmentIntensity = 0.5;
    this.vm.onCue = (name) => this.sfx.play(name);
    this.resize(); addEventListener('resize', () => this.resize());
    this.bindInput();
    socket.on('snap', (s: Snap) => this.onSnap(s));
    socket.on('ev', (e: GameEvent[]) => e.forEach((x) => this.onEvent(x)));
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------------- 입력 ----------------
  private clearInput() { this.keys.clear(); this.mouseL = this.mouseR = false; this.reloadPressed = false; }
  private bindInput() {
    const c = this.canvas;
    c.addEventListener('click', () => { if (this.inMatch && !this.active) this.lock(); });
    document.addEventListener('pointerlockchange', () => {
      this.active = document.pointerLockElement === c;
      this.clearInput(); // 잠금이 풀리면 연사·이동 입력이 남지 않게 한다
      this.onPause(!this.active && this.inMatch);
    });
    addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => this.clearInput());
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Digit1') this.slot = 0; else if (e.code === 'Digit2') this.slot = 1; else if (e.code === 'Digit3') this.slot = 2;
      else if (e.code === 'KeyR') this.reloadPressed = true;
      else if (e.code === 'KeyF') this.inspect();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      const k = 0.0022 * this.sens * (this.camera.fov / BASE_FOV);
      this.yaw -= e.movementX * k; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * k));
      this.lookDx += e.movementX; this.lookDy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => { if (!this.active) return; if (e.button === 0) this.mouseL = true; if (e.button === 2) this.mouseR = true; });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseL = false; if (e.button === 2) this.mouseR = false; });
    document.addEventListener('contextmenu', (e) => { if (this.inMatch) e.preventDefault(); });
  }
  lock() { this.sfx.unlock(); this.canvas.requestPointerLock?.(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  inspect() { if (!this.alive || !this.st) return; this.vm.inspect(); this.socket.emit('inspect'); }
  setSlot(s: number) { this.slot = s; }
  get inMatch() { return !!this.room && this.phase !== 'lobby' && this.phase !== 'matchEnd'; }
  get me() { return this.room?.players.find((p) => p.id === this.room!.you); }
  private get loadout(): Loadout { return this.me?.loadout ?? ['ar', 'pistol', 'knife']; }
  private resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.vm.camera.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.vm.camera.updateProjectionMatrix();
  }

  // ---------------- 서버 메시지 ----------------
  onRoom(info: RoomInfo) {
    const prev = this.room, prevPhase = this.phase;
    this.room = info; this.phase = info.phase;
    const ids = new Set(info.players.map((p) => p.id));
    for (const [id, r] of this.remotes) if (!ids.has(id) || id === info.you || r.info.team !== info.players.find((p) => p.id === id)!.team) { this.scene.remove(r.av.root); this.remotes.delete(id); }
    const myTeam = this.me?.team ?? 0;
    for (const p of info.players) {
      if (p.id === info.you) continue;
      let r = this.remotes.get(p.id);
      if (!r) {
        const av = makeAvatar(p.team); av.root.visible = false; this.scene.add(av.root);
        r = { info: p, av, buf: [], hp: 100, alive: true, slot: 0, wid: '', walk: 0, swing: 9, kick: 0, inspect: 0, pos: new THREE.Vector3(), yaw: 0, pitch: 0, tag: null, dead: 0 };
        this.remotes.set(p.id, r);
      }
      r.info = p;
      if (p.team === myTeam && !p.bot && !r.tag) { r.tag = nameTag(p.name, TEAM_COLORS[p.team]); r.tag.position.y = 2.2; r.av.root.add(r.tag); }
      if (p.team !== myTeam && r.tag) { r.av.root.remove(r.tag); r.tag = null; }
    }
    this.vm.setTeam(myTeam);
    const lo = this.me?.loadout, plo = prev?.players.find((p) => p.id === info.you)?.loadout;
    if (lo && plo && this.st && lo.join() !== plo.join()) this.vm.equip(lo[this.st.w.slot]); // 준비 시간·연습장에서 장비를 바꾸면 손에 든 것도 바뀐다
    if (info.phase === 'lobby' || info.phase === 'matchEnd') { this.st = null; this.alive = false; this.unlock(); for (const r of this.remotes.values()) r.av.root.visible = false; }
    if (prevPhase !== info.phase || prev?.round !== info.round) this.onPhase(prevPhase);
    this.updateScore();
  }
  private onPhase(prevPhase: Phase) {
    const info = this.room!, myTeam = this.me?.team ?? 0;
    const banner = $('banner'), sub = $('bannerSub');
    banner.className = ''; banner.textContent = ''; sub.textContent = '';
    if (info.phase === 'roundEnd' || (info.phase === 'matchEnd' && prevPhase !== 'matchEnd')) {
      const w = info.lastRound?.winner ?? -1;
      if (info.phase === 'roundEnd') {
        banner.textContent = w < 0 ? '무승부' : w === myTeam ? '라운드 승리' : '라운드 패배';
        banner.className = w < 0 ? 'show draw' : w === myTeam ? 'show win' : 'show lose';
        sub.textContent = (info.lastRound?.reason ?? '') + (w < 0 ? ' · 점수 없이 다시' : '');
        this.sfx.play(w === myTeam ? 'roundWin' : 'roundLose');
      } else this.sfx.play(info.result?.winner === myTeam ? 'matchWin' : 'matchLose');
    }
    if (info.phase === 'freeze') { this.lastBeep = -1; }
    if (info.phase === 'live' && prevPhase === 'freeze') { this.sfx.play('go'); banner.textContent = '시작!'; banner.className = 'show go'; setTimeout(() => { if (banner.textContent === '시작!') banner.className = ''; }, 700); }
  }
  private updateScore() {
    const r = this.room; if (!r) return;
    $('scoreA').textContent = String(r.score[0]); $('scoreB').textContent = String(r.score[1]);
    const dots = (t: number) => r.players.filter((p) => p.team === t).map((p) => {
      const rem = this.remotes.get(p.id); const alive = p.id === r.you ? this.alive : rem?.alive ?? true;
      return `<i class="${alive ? '' : 'dead'}${p.connected ? '' : ' dc'}"></i>`;
    }).join('');
    $('aliveA').innerHTML = dots(0); $('aliveB').innerHTML = dots(1);
    $('hudTop').dataset.team = String(this.me?.team ?? 0);
  }
  private onSnap(s: Snap) {
    const now = performance.now();
    const off = s.t - now;
    this.offset = this.offset === null || Math.abs(off - this.offset) > 500 ? off : this.offset + (off - this.offset) * 0.05;
    this.timeLeft = s.tl;
    if (s.ph !== this.phase && this.room) { /* 방 정보가 곧 따라온다 */ }
    for (const p of s.pl) {
      const r = this.remotes.get(p[0]); if (!r) continue;
      r.buf.push({ t: s.t, x: p[1], y: p[2], z: p[3], yaw: p[4], pitch: p[5] });
      if (r.buf.length > 30) r.buf.shift();
      const was = r.alive; r.hp = p[6]; r.alive = !!p[7]; r.slot = p[8];
      if (was !== r.alive) this.updateScore();
      const wid = r.info.loadout[r.slot];
      if (wid !== r.wid) { r.wid = wid; r.av.setWeapon(wid); }
    }
    const me = s.me; if (!me) return;
    this.hp = me.hp;
    if (this.alive && !me.alive) { this.deathPos.copy(this.camera.position); this.unlockOnDeath(); }
    if (!this.alive && me.alive) this.updateScore();
    this.alive = me.alive;
    if (!me.alive) { this.st = null; this.pending.length = 0; return; }
    const first = !this.st;
    const before = this.st ? [this.st.x, this.st.y, this.st.z] : null;
    this.st = cloneState(me.st);
    let i = 0; while (i < this.pending.length && this.pending[i].seq <= me.ack) i++;
    if (i) this.pending.splice(0, i);
    const ph = this.phase;
    for (const inp of this.pending) simulate(this.st, inp, TICK, this.loadout, ph !== 'freeze', ph === 'live');
    if (before && !first) {
      this.err.x += before[0] - this.st.x; this.err.y += before[1] - this.st.y; this.err.z += before[2] - this.st.z;
      if (this.err.lengthSq() > 2.5) this.err.set(0, 0, 0);
    } else { this.prevPos.set(this.st.x, this.st.y, this.st.z); this.eyeY = this.st.y; }
  }
  private unlockOnDeath() { this.sfx.play('out'); this.updateScore(); }
  private onEvent(e: GameEvent) {
    const my = this.room?.you;
    if (e.k === 'respawn') {
      if (e.id === my) {
        this.slot = 0; this.pending.length = 0; this.st = null; this.err.set(0, 0, 0); this.recoil.p = this.recoil.y = 0;
        this.yaw = (this.me?.team ?? 0) === 0 ? -Math.PI / 2 : Math.PI / 2; this.pitch = 0;
        this.vm.equip(this.loadout[0]);
      } else { const r = this.remotes.get(e.id); if (r) r.buf.length = 0; }
    } else if (e.k === 'shot') {
      if (e.id === my) return;
      const r = this.remotes.get(e.id); if (!r) return;
      r.kick = 1;
      const from = new THREE.Vector3(e.o[0], e.o[1] - 0.25, e.o[2]).add(new THREE.Vector3(...aimDir(r.yaw, r.pitch)).multiplyScalar(0.7));
      for (const end of e.ends) this.tracer(from, new THREE.Vector3(end[0], end[1], end[2]));
      this.sfx.play('shot_' + e.wid, this.falloff(from) * 0.8);
    } else if (e.k === 'act') {
      if (e.id === my) return;
      const r = this.remotes.get(e.id); if (!r) return;
      if (e.a === 'swing') { r.swing = 0; this.sfx.play('swing', this.falloff(r.pos)); }
      else if (e.a === 'inspect') r.inspect = 1;
    } else if (e.k === 'hit') {
      const pos = new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);
      const vic = this.room?.players.find((p) => p.id === e.vic);
      this.burst(pos, 5, 0xb9b3a6, 0.55); // 피 대신 옷감·먼지가 튄다
      if (e.att === my) {
        this.hitT = e.kill ? 0.3 : 0.16;
        const hm = $('hitmarker'); hm.className = e.kill ? 'kill' : e.head ? 'head' : 'hit'; void hm.offsetWidth; hm.classList.add('on');
        this.sfx.play(e.kill ? 'kill' : e.head ? 'head' : e.melee ? 'meleeHit' : 'hit');
        if (e.melee && !e.kill) this.sfx.play('hit');
      }
      if (e.vic === my) {
        this.sfx.play('hurt'); this.flashT = 0.25; this.shake = Math.min(0.5, this.shake + 0.25);
        const el = document.createElement('i'); $('dmgdir').appendChild(el);
        this.dmgDirs.push({ x: e.from[0], z: e.from[2], life: 1.2, el });
      }
      if (e.kill) {
        const r = this.remotes.get(e.vic);
        const at = r ? r.pos.clone().setY(r.pos.y + 1) : pos;
        this.burst(at, 8, 0xb9b3a6, 0.6);
        this.sfx.play('pop', e.att === my ? 1 : this.falloff(at));
        const att = this.room?.players.find((p) => p.id === e.att);
        const li = document.createElement('li');
        li.innerHTML = `<b data-team="${att?.team}">${esc(att?.name ?? '?')}</b><span>${e.melee ? '칼' : e.head ? '머리' : '탈락'}</span><b data-team="${vic?.team}">${esc(vic?.name ?? '?')}</b>`;
        $('feed').appendChild(li); setTimeout(() => li.remove(), 4200);
      }
    }
  }
  private falloff(p: THREE.Vector3) { return Math.max(0.12, 1 - p.distanceTo(this.camera.position) / 45); }

  // ---------------- 시뮬레이션 틱 ----------------
  private tick() {
    const st = this.st;
    if (!st || !this.alive || !this.inMatch) return;
    const d = this.dbg, on = this.active || d.on, K = this.keys;
    const inp: Input = {
      seq: ++this.seq,
      f: d.on ? d.f : on ? (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0) : 0,
      s: d.on ? d.s : on ? (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0) : 0,
      jump: d.on ? d.jump : on && K.has('Space'),
      sprint: d.on ? d.sprint : on && (K.has('ShiftLeft') || K.has('ShiftRight')),
      fire: d.on ? d.fire : on && this.mouseL, ads: d.on ? d.ads : on && this.mouseR,
      reload: this.reloadPressed, slot: this.slot, yaw: this.yaw, pitch: this.pitch,
      rt: this.offset === null ? 0 : performance.now() + this.offset - 100,
    };
    this.reloadPressed = false;
    this.prevPos.set(st.x, st.y, st.z);
    const evs = simulate(st, inp, TICK, this.loadout, this.phase !== 'freeze', this.phase === 'live');
    this.pending.push(inp); this.outbox.push(inp);
    if (this.pending.length > 120) this.pending.shift();
    for (const e of evs) {
      if (e === 'fire') this.localFire(inp);
      else if (e === 'switch') this.vm.equip(this.loadout[st.w.slot]);
      else if (e === 'reload') this.vm.reload();
      else if (e === 'swing') this.vm.attack();
      else if (e === 'dry') this.sfx.play('dry');
    }
  }
  private localFire(inp: Input) {
    const st = this.st!, wid = this.loadout[st.w.slot], g = WEAPONS[wid] as GunCfg;
    this.vm.fire(); this.sfx.play('shot_' + wid);
    // 반동: 패턴대로 시점이 튀고 일부만 되돌아온다
    const pat = g.recoil.pattern[(st.w.shots - 1) % g.recoil.pattern.length];
    const m = (Math.PI / 180) * (1 - 0.3 * st.w.ads);
    const up = (pat[0] + (Math.random() - 0.5) * g.recoil.rand) * m, side = (pat[1] + (Math.random() - 0.5) * g.recoil.rand * 2) * m;
    this.pitch = Math.min(1.5, this.pitch + up); this.yaw += side;
    this.recoil.p += up * 0.65; this.recoil.y += side * 0.65;
    // 예광탄(연출용, 판정은 서버)
    const o = [st.x, st.y + MOVE.eye, st.z], base = aimDir(inp.yaw, inp.pitch);
    const spread = g.spreadHip + (g.spreadAds - g.spreadHip) * st.w.ads;
    const from = this.muzzleWorldPos();
    for (let i = 0; i < g.pellets; i++) {
      const dir = spreadDir(base, spread, Math.random(), Math.random());
      let t = rayMap(o, dir), wall = true;
      for (const r of this.remotes.values()) if (r.alive && r.info.team !== this.me?.team) { const h = rayPlayer(o, dir, r.pos.x, r.pos.y, r.pos.z); if (h.t < t) { t = h.t; wall = false; } }
      if (t === Infinity) { t = 80; wall = false; }
      const end = new THREE.Vector3(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
      this.tracer(from, end);
      if (wall) this.burst(end, 3, 0x8c8a84, 0.6);
    }
  }
  private muzzleWorldPos() {
    const v = this.vm.muzzleWorld(new THREE.Vector3());
    // 뷰모델 공간 → 월드: 시야각 차이는 무시해도 될 만큼 작다
    return v.applyQuaternion(this.camera.quaternion).add(this.camera.position);
  }

  // ---------------- 연출 ----------------
  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const len = a.distanceTo(b); if (len < 0.5) return;
    const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
    m.position.copy(a).lerp(b, 0.5); m.scale.set(0.018, 0.018, len); m.lookAt(b);
    this.scene.add(m); this.tracers.push({ m, life: 0.06 });
  }
  private burst(pos: THREE.Vector3, n: number, color: number, speed = 1) {
    const cols = [color, 0x6e6b66, 0xffc27a];
    for (let i = 0; i < n; i++) {
      const sz = 0.025 + Math.random() * 0.03; const m = box(sz, sz, sz, cols[i % 3]); m.position.copy(pos); this.scene.add(m);
      this.parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5).multiplyScalar(speed), life: 0.45, max: 0.45, grav: 12, spin: Math.random() * 10 });
    }
  }
  private updateFx(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.m); this.parts.splice(i, 1); continue; }
      p.v.y -= p.grav * dt; p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.y *= -0.4; p.v.x *= 0.7; p.v.z *= 0.7; }
      p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * dt * 0.7;
      const k = Math.min(1, p.life / (p.max * 0.4)); p.m.scale.multiplyScalar(k < 1 ? 0.92 : 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt;
      (t.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / 0.06) * 0.7;
      if (t.life <= 0) { this.scene.remove(t.m); this.tracers.splice(i, 1); }
    }
  }
  private updateRemotes(dt: number) {
    const rt = this.offset === null ? 0 : performance.now() + this.offset - 100;
    for (const r of this.remotes.values()) {
      const b = r.buf;
      const show = this.inMatch && b.length > 0;
      r.av.root.visible = show;
      if (!show) continue;
      if (!r.alive) { // 탈락: 그 자리에 쓰러져 라운드가 끝날 때까지 남는다
        r.dead = Math.min(1, r.dead + dt / 0.5);
        const k = r.dead * r.dead;
        r.av.root.rotation.x = k * 1.5; r.av.root.position.y = r.pos.y + k * 0.16;
        r.av.armR.rotation.set(0.4, 0, -0.3); r.av.armL.rotation.set(-0.3, 0, 0.3); r.av.foreR.rotation.x = 0.3; r.av.foreL.rotation.x = 0.2;
        r.av.legL.rotation.x = 0.15; r.av.legR.rotation.x = -0.1; r.av.shinL.rotation.x = -0.2; r.av.shinR.rotation.x = -0.05;
        continue;
      }
      r.dead = 0; r.av.root.rotation.x = 0;
      let a = b[0], c = b[0];
      for (let i = b.length - 1; i >= 0; i--) if (b[i].t <= rt) { a = b[i]; c = b[Math.min(i + 1, b.length - 1)]; break; }
      const k = c.t > a.t ? Math.min(1.2, (rt - a.t) / (c.t - a.t)) : 0;
      const nx = a.x + (c.x - a.x) * k, ny = a.y + (c.y - a.y) * k, nz = a.z + (c.z - a.z) * k;
      const sp = Math.hypot(nx - r.pos.x, nz - r.pos.z) / Math.max(dt, 0.001);
      r.pos.set(nx, ny, nz);
      let dy = c.yaw - a.yaw; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      r.yaw = a.yaw + dy * Math.min(1, k); r.pitch = a.pitch + (c.pitch - a.pitch) * Math.min(1, k);
      const av = r.av;
      av.root.position.copy(r.pos); av.root.rotation.y = r.yaw;
      r.walk += dt * Math.min(sp, 9) * 1.5;
      const sw = Math.sin(r.walk) * Math.min(1, sp / 4) * 0.7;
      av.legL.rotation.x = sw; av.legR.rotation.x = -sw;
      av.shinL.rotation.x = -(0.08 + Math.max(0, -sw) * 1.3); av.shinR.rotation.x = -(0.08 + Math.max(0, sw) * 1.3); // 뒤로 차는 다리는 무릎을 접는다
      av.head.rotation.x = r.pitch * 0.6;
      r.swing += dt; r.kick = Math.max(0, r.kick - dt * 9); r.inspect = Math.max(0, r.inspect - dt);
      const melee = WEAPONS[r.wid]?.kind === 'melee';
      const aim = Math.PI / 2 + r.pitch;
      if (melee) {
        let a = 0.55 + r.pitch * 0.6, z = 0;
        if (r.swing < 0.4) { const u = r.swing / 0.4; a += Math.sin(Math.min(1, u * 2.2) * Math.PI) * 1.2; z = Math.sin(u * Math.PI) * 0.6; }
        av.armR.rotation.set(a, 0, z - 0.1); av.foreR.rotation.x = 0.95;
        av.armL.rotation.set(0.35 - sw * 0.5, 0, 0.15); av.foreL.rotation.x = 0.7;
      } else {
        // 오른팔: 팔꿈치를 접어 총을 가슴 높이로, 아래팔이 조준 방향을 따른다. 왼팔은 총열 쪽을 받친다.
        av.armR.rotation.set(aim - 1.0 + r.kick * 0.08, 0, -0.1); av.foreR.rotation.x = 1.0;
        av.armL.rotation.set(aim - 0.45, 0, 0.62); av.foreL.rotation.x = 0.5;
      }
      if (r.inspect > 0) av.armR.rotation.z += Math.sin(r.inspect * 12) * 0.3;
    }
  }

  // ---------------- 프레임 ----------------
  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.fpsT += dt; this.fpsN++; if (dt > this.stats.worst) this.stats.worst = dt;
    if (this.fpsT >= 1) { this.stats.fps = Math.round(this.fpsN / this.fpsT); this.fpsT = 0; this.fpsN = 0; }
    this.stats.frames++;
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n++ < 8) { this.acc -= TICK; this.tick(); }
    if (this.acc > TICK * 8) this.acc = 0;
    if (this.outbox.length) { this.socket.volatile.emit('in', this.outbox); this.outbox = []; }
    this.updateRemotes(dt); this.updateFx(dt);
    const st = this.st;
    const hud = $('hud');
    let drawVm = false, spec: Remote | null = null;
    if (st && this.alive && this.inMatch) {
      // 반동 회복, 보정 오차 감쇠
      const g = WEAPONS[this.loadout[st.w.slot]];
      const rec = Math.min(1, (g.kind === 'gun' ? g.recoil.recover : 8) * dt);
      this.pitch -= this.recoil.p * rec; this.recoil.p *= 1 - rec; this.yaw -= this.recoil.y * rec; this.recoil.y *= 1 - rec;
      this.err.multiplyScalar(Math.max(0, 1 - dt * 12));
      const a = this.acc / TICK;
      const x = this.prevPos.x + (st.x - this.prevPos.x) * a, y = this.prevPos.y + (st.y - this.prevPos.y) * a, z = this.prevPos.z + (st.z - this.prevPos.z) * a;
      this.eyeY = Math.abs(y - this.eyeY) > 0.8 || !st.ground ? y : this.eyeY + (y - this.eyeY) * Math.min(1, dt * 20);
      this.shake = Math.max(0, this.shake - dt * 3);
      const sh = this.shake * 0.012;
      this.camera.position.set(x + this.err.x, this.eyeY + this.err.y + MOVE.eye, z + this.err.z);
      this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * sh, this.yaw + (Math.random() - 0.5) * sh, 0);
      const ads = g.kind === 'gun' ? st.w.ads : 0;
      const fov = BASE_FOV + ((g.kind === 'gun' ? g.adsFov : BASE_FOV) - BASE_FOV) * ads * ads * (3 - 2 * ads);
      if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      const speed = Math.hypot(st.vx, st.vz);
      const K = this.keys, d = this.dbg;
      const sprint = (d.on ? d.sprint : K.has('ShiftLeft') || K.has('ShiftRight')) && speed > MOVE.walk * 0.9 && !(g.kind === 'gun' && (this.mouseL || this.mouseR || st.w.reload > 0));
      this.vm.update({ dt, speed, sprint, ground: st.ground, ads, lookDx: this.lookDx, lookDy: this.lookDy });
      const scoped = this.loadout[st.w.slot] === 'sniper' && ads > 0.85;
      $('scope').classList.toggle('on', scoped);
      drawVm = !scoped;
      this.updateHud(st, ads, speed);
    } else {
      $('scope').classList.remove('on');
      if (this.camera.fov !== BASE_FOV) { this.camera.fov = BASE_FOV; this.camera.updateProjectionMatrix(); }
      if (this.inMatch) {
        // 탈락 후: 살아 있는 팀원 시점으로 관전
        const team = this.me?.team;
        for (const r of this.remotes.values()) if (r.alive && r.info.team === team && r.buf.length) { spec = r; break; }
        if (spec) {
          spec.av.root.visible = false;
          this.camera.position.set(spec.pos.x, spec.pos.y + MOVE.eye, spec.pos.z); this.camera.rotation.set(spec.pitch, spec.yaw, 0);
        } else { this.camera.position.copy(this.deathPos).setY(Math.max(3.2, this.deathPos.y + 1.6)); this.camera.rotation.set(Math.min(this.pitch, -0.35), this.yaw, 0); }
      } else {
        this.orbit += dt * 0.12;
        this.camera.position.set(Math.cos(this.orbit) * 30, 17, Math.sin(this.orbit) * 24); this.camera.lookAt(0, 1, 0);
      }
    }
    this.lookDx = this.lookDy = 0;
    hud.classList.toggle('on', this.inMatch);
    hud.classList.toggle('dead', this.inMatch && !this.alive);
    if (this.inMatch) this.updateOverlay(dt, spec);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (drawVm) { this.renderer.clearDepth(); this.renderer.render(this.vm.scene, this.vm.camera); }
  }
  private updateHud(st: PState, ads: number, speed: number) {
    const lo = this.loadout, cfg = WEAPONS[lo[st.w.slot]];
    $('hp').textContent = String(Math.ceil(this.hp));
    ($('hpBar') as HTMLElement).style.width = this.hp + '%';
    $('hpBox').classList.toggle('low', this.hp <= 35);
    if (cfg.kind === 'gun') {
      $('ammo').textContent = st.w.reload > 0 ? '장전 중' : String(st.w.ammo[st.w.slot]);
      $('ammoMax').textContent = st.w.reload > 0 ? '' : '/ ' + cfg.mag;
    } else { $('ammo').textContent = '근접'; $('ammoMax').textContent = ''; }
    $('wname').textContent = cfg.name;
    for (let i = 0; i < 3; i++) {
      const el = $('slot' + i); el.classList.toggle('on', st.w.slot === i);
      const nm = WEAPONS[lo[i]].name; if (el.dataset.n !== nm) { el.dataset.n = nm; el.querySelector('span')!.textContent = nm; }
    }
    const ch = $('crosshair');
    let gap = 5;
    if (cfg.kind === 'gun') gap = 3 + (cfg.spreadHip + (cfg.spreadAds - cfg.spreadHip) * ads) * 5 + (st.ground ? speed * 0.5 : 9) + Math.min(8, st.w.shots * 0.6) * (st.w.sinceShot < 0.2 ? 1 : 0);
    ch.style.setProperty('--gap', gap.toFixed(1) + 'px');
    ch.classList.toggle('hide', cfg.kind === 'gun' && ads > 0.5);
    ch.classList.toggle('melee', cfg.kind === 'melee');
  }
  private updateOverlay(dt: number, spec: Remote | null) {
    const tl = this.timeLeft, timer = $('timer');
    if (this.room?.mode === 'practice') timer.textContent = '연습장';
    else if (this.phase === 'live') { const s = Math.ceil(tl); timer.textContent = `0:${String(s).padStart(2, '0')}`; timer.classList.toggle('hurry', s <= 10); }
    else if (this.phase === 'freeze') {
      timer.textContent = `0:${RULES.roundTime}`; timer.classList.remove('hurry');
      const s = Math.ceil(tl), b = $('banner');
      b.textContent = String(Math.max(1, s)); b.className = 'show count';
      $('bannerSub').textContent = `${this.room!.round}라운드 준비 · B로 장비 변경`;
      if (s !== this.lastBeep) { this.lastBeep = s; this.sfx.play('beep'); }
    }
    const sp = $('spectate');
    if (!this.alive && this.phase !== 'freeze') {
      sp.classList.add('on');
      sp.textContent = spec ? `탈락 · ${spec.info.name} 관전 중` : this.room?.mode === 'practice' ? '탈락 · 곧 다시 시작' : '탈락 · 라운드가 끝나길 기다리는 중';
    } else sp.classList.remove('on');
    this.flashT = Math.max(0, this.flashT - dt);
    ($('hurt') as HTMLElement).style.opacity = String(this.flashT * 2.2);
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i]; d.life -= dt;
      if (d.life <= 0) { d.el.remove(); this.dmgDirs.splice(i, 1); continue; }
      const p = this.camera.position;
      const ang = Math.atan2(d.x - p.x, -(d.z - p.z)) + this.yaw; // 화면 위 = 정면
      d.el.style.transform = `rotate(${ang}rad)`; d.el.style.opacity = String(Math.min(1, d.life * 1.5));
    }
  }
  /** 자동 검증용 상태 요약 */
  debugState() {
    const st = this.st;
    return {
      phase: this.phase, round: this.room?.round, score: this.room?.score, alive: this.alive, hp: this.hp, tl: this.timeLeft,
      x: st?.x, y: st?.y, z: st?.z, slot: st?.w.slot, ammo: st?.w.ammo, reload: st?.w.reload, clip: this.vm.clip, rig: this.vm.rig?.id,
      calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, pending: this.pending.length, err: this.err.length(), fps: this.stats.fps, worst: this.stats.worst,
      remotes: [...this.remotes.values()].map((r) => ({ id: r.info.id, name: r.info.name, team: r.info.team, x: r.pos.x, y: r.pos.y, z: r.pos.z, alive: r.alive, hp: r.hp, wid: r.wid, visible: r.av.root.visible })),
    };
  }
  /** 검수용: 칼 자세만 띄워 보기 */
  debugVm(id: string, clip: string, t: number) {
    this.vm.debugPose(id, clip, t);
    this.renderer.setClearColor(0xbfe3f7); this.renderer.clear(); this.renderer.render(this.vm.scene, this.vm.camera);
  }
}

const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
function esc(s: string) { return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }
function nameTag(name: string, color: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '600 32px "Barlow Condensed", "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText('▼ ' + name, 128, 32);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillText('▼ ' + name, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.8, 0.45, 1); s.renderOrder = 10;
  return s;
}
