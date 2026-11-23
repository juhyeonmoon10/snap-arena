// 서버와 클라이언트가 함께 쓰는 결정적 시뮬레이션: 이동, 충돌, 무기 상태.
import { MOVE, WEAPONS, Loadout, GunCfg, MeleeCfg } from './config';
import { BOXES, Box } from './map';

export interface Input {
  seq: number;
  f: number; // 앞뒤 -1..1
  s: number; // 좌우 -1..1
  jump: boolean;
  sprint: boolean;
  fire: boolean;
  ads: boolean;
  reload: boolean;
  slot: number;
  yaw: number;
  pitch: number;
  rt: number; // 내가 보고 있던 상대 위치의 서버 시각(지연 보상용)
}

export interface WState {
  slot: number;
  ammo: [number, number];
  cd: number;
  reload: number;
  draw: number;
  ads: number;
  swing: number; // 근접 휘두르기 경과 시간, -1이면 없음
  prevFire: boolean;
  shots: number; // 연속 발사 수(반동 패턴 위치)
  sinceShot: number;
}
export interface PState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ground: boolean;
  w: WState;
}
export type SimEvent = 'fire' | 'reload' | 'reloaded' | 'switch' | 'swing' | 'meleeHit' | 'dry';

export function newWState(l: Loadout): WState {
  return {
    slot: 0, ammo: [(WEAPONS[l[0]] as GunCfg).mag, (WEAPONS[l[1]] as GunCfg).mag],
    cd: 0, reload: 0, draw: 0.3, ads: 0, swing: -1, prevFire: false, shots: 0, sinceShot: 9,
  };
}
export function newPState(x: number, z: number, l: Loadout): PState {
  return { x, y: 0, z, vx: 0, vy: 0, vz: 0, ground: true, w: newWState(l) };
}
export function cloneState(p: PState): PState {
  return { ...p, w: { ...p.w, ammo: [p.w.ammo[0], p.w.ammo[1]] } };
}

const R = MOVE.radius, H = MOVE.height, EPS = 1e-4;

function overlaps(b: Box, x: number, y: number, z: number) {
  return x + R > b.min[0] + EPS && x - R < b.max[0] - EPS && z + R > b.min[2] + EPS && z - R < b.max[2] - EPS &&
    y + H > b.min[1] + EPS && y < b.max[1] - EPS;
}
function blocked(x: number, y: number, z: number) {
  for (const b of BOXES) if (overlaps(b, x, y, z)) return true;
  return false;
}

function moveAxis(p: PState, axis: 0 | 2, d: number, wasGround: boolean) {
  if (d === 0) return;
  if (axis === 0) p.x += d; else p.z += d;
  for (const b of BOXES) {
    if (!overlaps(b, p.x, p.y, p.z)) continue;
    const rise = b.max[1] - p.y;
    if (wasGround && rise > 0 && rise <= MOVE.step && !blocked(p.x, b.max[1], p.z)) {
      p.y = b.max[1]; // 낮은 턱은 올라선다
      continue;
    }
    if (axis === 0) { p.x = d > 0 ? b.min[0] - R : b.max[0] + R; p.vx = 0; }
    else { p.z = d > 0 ? b.min[2] - R : b.max[2] + R; p.vz = 0; }
  }
}

/** 한 틱 진행. canMove=false면 제자리(준비 시간), canAct=false면 공격 불가. */
export function simulate(p: PState, inp: Input, dt: number, l: Loadout, canMove: boolean, canAct: boolean): SimEvent[] {
  const ev: SimEvent[] = [];
  const w = p.w;
  // ---- 무기 ----
  if (inp.slot !== w.slot && inp.slot >= 0 && inp.slot <= 2) {
    w.slot = inp.slot;
    w.draw = WEAPONS[l[w.slot]].draw;
    w.reload = 0; w.swing = -1; w.ads = 0; w.cd = 0; w.shots = 0;
    ev.push('switch');
  }
  const cfg = WEAPONS[l[w.slot]];
  w.cd = Math.max(0, w.cd - dt);
  w.draw = Math.max(0, w.draw - dt);
  w.sinceShot += dt;
  const moving = canMove && (inp.f !== 0 || inp.s !== 0);
  let sprinting = inp.sprint && inp.f > 0 && moving;
  if (cfg.kind === 'gun') {
    const g = cfg as GunCfg;
    if (inp.fire || inp.ads || w.reload > 0) sprinting = false;
    const adsT = inp.ads && w.reload === 0 && w.draw === 0 ? 1 : 0;
    const step = dt / g.adsTime;
    w.ads = adsT > w.ads ? Math.min(1, w.ads + step) : Math.max(0, w.ads - step);
    if (w.sinceShot > Math.max(0.25, g.interval * 1.6)) w.shots = 0;
    if (w.reload > 0) {
      w.reload -= dt;
      if (w.reload <= 0) { w.reload = 0; w.ammo[w.slot] = g.mag; ev.push('reloaded'); }
    } else if (w.draw === 0 && canAct) {
      const want = g.auto ? inp.fire : inp.fire && !w.prevFire;
      const ammo = w.ammo[w.slot];
      if ((inp.reload && ammo < g.mag) || (ammo === 0 && (want || w.cd === 0))) {
        w.reload = g.reload; ev.push('reload');
        if (want && ammo === 0) ev.push('dry');
      } else if (want && w.cd === 0 && ammo > 0) {
        w.ammo[w.slot] = ammo - 1; w.cd = g.interval; w.shots++; w.sinceShot = 0;
        ev.push('fire');
      }
    }
  } else {
    const m = cfg as MeleeCfg;
    w.ads = 0;
    if (w.swing >= 0) {
      const prev = w.swing;
      w.swing += dt;
      if (prev < m.hitTime && w.swing >= m.hitTime) ev.push('meleeHit');
      if (w.swing >= m.interval) w.swing = -1;
    }
    if (inp.fire && w.swing < 0 && w.draw === 0 && canAct) { w.swing = 0; ev.push('swing'); }
  }
  w.prevFire = inp.fire;

  // ---- 이동 ----
  const sin = Math.sin(inp.yaw), cos = Math.cos(inp.yaw);
  let wx = 0, wz = 0;
  if (canMove) {
    wx = -sin * inp.f + cos * inp.s;
    wz = -cos * inp.f - sin * inp.s;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
  }
  const speed = (sprinting ? MOVE.sprint : MOVE.walk) * cfg.move * (1 - (1 - MOVE.adsMul) * w.ads);
  const tx = wx * speed, tz = wz * speed;
  if (p.ground) {
    const k = Math.min(1, MOVE.groundAccel * dt);
    p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
  } else if (wx !== 0 || wz !== 0) {
    const k = Math.min(1, MOVE.airAccel * dt);
    p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
  }
  if (canMove && inp.jump && p.ground) { p.vy = MOVE.jump; p.ground = false; }
  p.vy -= MOVE.gravity * dt;
  const wasGround = p.ground;
  moveAxis(p, 0, p.vx * dt, wasGround);
  moveAxis(p, 2, p.vz * dt, wasGround);
  p.y += p.vy * dt;
  p.ground = false;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.ground = true; }
  for (const b of BOXES) {
    if (!overlaps(b, p.x, p.y, p.z)) continue;
    if (p.vy <= 0) { p.y = b.max[1]; p.ground = true; } else { p.y = b.min[1] - H; }
    p.vy = 0;
  }
  return ev;
}

export function aimDir(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

/** 광선과 AABB 교차 거리. 없으면 Infinity. */
export function rayBox(o: number[], d: number[], min: number[], max: number[]): number {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < min[i] || o[i] > max[i]) return Infinity; continue; }
    let a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i];
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0;
}
export function rayMap(o: number[], d: number[]): number {
  let best = Infinity;
  for (const b of BOXES) { const t = rayBox(o, d, b.min, b.max); if (t < best) best = t; }
  if (d[1] < -1e-9) { const t = -o[1] / d[1]; if (t >= 0 && t < best) best = t; }
  return best;
}
/** 플레이어 발 위치 기준 피격 판정. grow는 근접용 여유. 반환: 거리와 머리 여부 */
export function rayPlayer(o: number[], d: number[], x: number, y: number, z: number, grow = 0): { t: number; head: boolean } {
  const hs = MOVE.headSize / 2 + grow, r = R + grow;
  const body = rayBox(o, d, [x - r, y - grow, z - r], [x + r, y + H - MOVE.headSize, z + r]);
  const head = rayBox(o, d, [x - hs, y + H - MOVE.headSize, z - hs], [x + hs, y + H + grow, z + hs]);
  return head < body ? { t: head, head: true } : { t: body, head: false };
}
export function falloffMul(g: GunCfg, dist: number) {
  const [a, b, m] = g.falloff;
  if (dist <= a) return 1;
  if (dist >= b) return m;
  return 1 - ((dist - a) / (b - a)) * (1 - m);
}
/** 방향에 원뿔 산포 적용 */
export function spreadDir(d: [number, number, number], deg: number, r1: number, r2: number): [number, number, number] {
  if (deg <= 0) return d;
  const ang = (deg * Math.PI / 180) * Math.sqrt(r1), phi = r2 * Math.PI * 2;
  // d에 수직인 두 축
  let ux = -d[2], uy = 0, uz = d[0];
  const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
  const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
  const s = Math.sin(ang), c = Math.cos(ang), cp = Math.cos(phi) * s, sp = Math.sin(phi) * s;
  return [d[0] * c + ux * cp + vx * sp, d[1] * c + uy * cp + vy * sp, d[2] * c + uz * cp + vz * sp];
}
