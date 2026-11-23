// 1인칭 손·장비 연출. 키프레임 클립을 상태 기계로 재생하고,
// 동작이 바뀔 때는 "지금 자세"에서 새 클립으로 짧게 블렌딩해 튀지 않게 한다.
import * as THREE from 'three';
import { WEAPONS, GunCfg, TEAM_COLORS } from '../shared/config';
import { makeHand, makeForearm, makeKnife, makeKarambit, makeBalisong, makeGun, Hand, GunModel } from './models';

// 자세 채널: 0-2 팔 위치, 3-5 팔 회전(YXZ), 6-8 손목 회전, 9-13 손가락(검지,중지,약지,새끼,엄지), 14-16 장비 전용
const N = 17;
type Pose = Float32Array;
type Ease = (x: number) => number;
type Key = [number, number, Ease?];
const smooth: Ease = (x) => x * x * (3 - 2 * x);
const out: Ease = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
const inn: Ease = (x) => x * x;
const snap: Ease = (x) => 1 - Math.pow(1 - x, 5);
const lin: Ease = (x) => x;
function kf(t: number, keys: Key[]) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      return a[1] + (b[1] - a[1]) * (b[2] ?? smooth)((t - a[0]) / (b[0] - a[0]));
    }
  }
  return keys[keys.length - 1][1];
}
interface Clip { dur: number; fn: (t: number, p: Pose, idle: Pose) => void; cues?: [number, string][]; loop?: boolean }
interface Rig {
  id: string; gun: boolean; root: THREE.Group; idle: Pose; clips: Record<string, Clip>;
  apply(p: Pose): void; sprint: number[]; ads?: number[]; muzzle?: THREE.Object3D; wrapCh?: number;
}
const P = (...v: number[]) => { const p = new Float32Array(N); p.set(v); return p; };
const TAU = Math.PI * 2;

// 손 기본 방향: 손잡이 축(x) = 위, 손목→손가락 뿌리(y) = 앞, 손바닥(z) = 왼쪽
const HAND_BASE = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));

/** 팔 + 손목 + 손. 회전 중심이 쥐는 자리(grip)라서 팔을 돌려도 장비가 화면에서 크게 흔들리지 않는다. */
function makeArm(sleeve: number, pivot: 'grip' | 'ring') {
  const arm = new THREE.Group(); arm.rotation.order = 'YXZ';
  const base = new THREE.Group(); base.quaternion.copy(HAND_BASE); arm.add(base);
  const hand: Hand = makeHand(sleeve);
  const off = new THREE.Group(); base.add(off);
  off.position.copy((pivot === 'grip' ? hand.grip : hand.ringSocket).position).multiplyScalar(-1);
  const fore = makeForearm(sleeve); fore.scale.y = 1.6; off.add(fore);
  const wrist = new THREE.Group(); off.add(wrist); wrist.add(hand.root);
  return { arm, wrist, hand };
}

function knifeRig(id: string, sleeve: number): Rig {
  const { arm, wrist, hand } = makeArm(sleeve, id === 'karambit' ? 'ring' : 'grip');
  const root = new THREE.Group(); root.add(arm);
  const model = id === 'karambit' ? makeKarambit() : id === 'balisong' ? makeBalisong() : makeKnife();
  (id === 'karambit' ? hand.ringSocket : hand.grip).add(model.root);
  const base = (p: Pose) => {
    arm.position.set(p[0], p[1], p[2]); arm.rotation.set(p[3], p[4], p[5]);
    wrist.rotation.set(p[6], p[7], p[8]);
    hand.setCurl([p[9], p[10], p[11], p[12], p[13]]);
  };
  // 공격: 세 칼 모두 같은 타이밍(0.14초에 화면 가운데를 지나감), 궤적만 다르다
  const slash = (dir: number, stab = 0): Clip => ({
    dur: 0.46,
    cues: [[0.03, 'swing']],
    fn: (t, p, I) => {
      const w = kf(t, [[0, 0], [0.06, -1, out], [0.2, 1, lin], [0.3, 1.05], [0.46, 0, smooth]]); // -1 준비, +1 벤 뒤
      const reach = kf(t, [[0, 0], [0.06, -0.3], [0.14, 1, out], [0.24, 0.8], [0.46, 0]]);
      p[0] = I[0] - dir * w * 0.17 * (1 - stab) - 0.05 * reach;
      p[1] = I[1] + 0.03 * reach - Math.abs(w) * 0.02 * dir;
      p[2] = I[2] - 0.13 * reach - 0.1 * stab * reach;
      p[3] = I[3] - 0.45 * reach * (stab ? 1.4 : 1);
      p[4] = I[4] + dir * w * 0.55 * (1 - stab);
      p[5] = I[5] + dir * w * 0.5 * (1 - stab);
    },
  });

  if (id === 'knife') {
    const idle = P(0.15, -0.105, -0.33, 0.45, 0.3, -0.12, 0, 0, 0.8, 1, 1, 1, 1, 0.9);
    return {
      id, gun: false, root, idle, sprint: [-0.02, -0.14, 0.04, -0.5, 0.3, 0], apply: base,
      clips: {
        draw: { dur: 0.3, cues: [[0.02, 'draw']], fn: (t, p, I) => { const k = kf(t, [[0, 1], [0.3, 0, snap]]); p[1] = I[1] - 0.3 * k; p[3] = I[3] - 1.1 * k; p[4] = I[4] + 0.5 * k; } },
        attack: slash(1), attack2: slash(-1),
        // 살펴보기: 손목을 짧게 틀어 양면을 보여주고 바로 복귀
        inspect: {
          dur: 0.85, cues: [[0.1, 'tick'], [0.42, 'tick']],
          fn: (t, p, I) => {
            const up = kf(t, [[0, 0], [0.16, 1, out], [0.62, 1], [0.85, 0]]);
            p[0] = I[0] - 0.05 * up; p[1] = I[1] + 0.045 * up; p[3] = I[3] + 0.25 * up; p[4] = I[4] + 0.5 * up;
            p[6] = kf(t, [[0, 0], [0.18, 1.15, out], [0.36, 1.15], [0.52, -1.0, smooth], [0.66, -1.0], [0.85, 0]]);
          },
        },
      },
    };
  }

  if (id === 'karambit') {
    // k0 = 고리 축 회전각. 검지 굽힘(0.93)은 모든 클립에서 고정이라 고리와 손가락 접점이 움직이지 않는다.
    const IDX = 0.93;
    const idle = P(0.15, -0.065, -0.32, 0.6, 0.45, 0.1, 0, 0, 0, IDX, 1, 1, 1, 0.85, 0);
    const apply = (p: Pose) => { base(p); model.root.rotation.z = p[14]; };
    const open = (p: Pose, k: number) => { p[10] = 1 - 0.9 * k; p[11] = 1 - 0.92 * k; p[12] = 1 - 0.94 * k; p[13] = 0.85 - 0.6 * k; };
    return {
      id, gun: false, root, idle, sprint: [-0.02, -0.16, 0.04, -0.45, 0.2, 0], apply, wrapCh: 14,
      clips: {
        draw: {
          dur: 0.45, cues: [[0.02, 'draw'], [0.14, 'spin'], [0.4, 'catch']],
          fn: (t, p, I) => {
            const k = kf(t, [[0, 1], [0.24, 0, out]]);
            p[1] = I[1] - 0.32 * k; p[3] = I[3] - 0.8 * k;
            open(p, kf(t, [[0.06, 0], [0.13, 1, out], [0.33, 1], [0.41, 0, inn]]));
            p[14] = kf(t, [[0.1, 0], [0.4, TAU, smooth]]);
            p[4] = I[4] + 0.35 * kf(t, [[0.08, 0], [0.2, 1], [0.45, 0]]);
          },
        },
        attack: slash(1), attack2: slash(-1),
        // 살펴보기: 손바닥을 살짝 돌려 보이며 고리 축으로 2.5바퀴 → 한 박자 정지 → 반 바퀴로 역그립 복귀
        inspect: {
          dur: 1.25, cues: [[0.12, 'spin'], [0.62, 'tick'], [0.86, 'spin2'], [1.02, 'catch']],
          fn: (t, p, I) => {
            const show = kf(t, [[0, 0], [0.16, 1, out], [0.9, 1], [1.25, 0]]);
            p[0] = I[0] - 0.045 * show; p[1] = I[1] + 0.02 * show; p[2] = I[2] - 0.02 * show;
            p[3] = I[3] - 0.25 * show; p[4] = I[4] + 0.8 * show; p[5] = I[5] - 0.2 * show;
            open(p, kf(t, [[0.04, 0], [0.13, 1, out], [0.92, 1], [1.04, 0, inn]]));
            p[14] = kf(t, [[0.1, 0], [0.62, TAU * 2.5, out], [0.84, TAU * 2.5], [1.02, TAU * 3, smooth]]);
            // 멈추는 박자에 손목이 살짝 받아 준다
            p[8] = 0.16 * kf(t, [[0.56, 0], [0.64, 1, out], [0.84, 0.7], [1.0, 0]]);
          },
        },
      },
    };
  }

  // 발리송: k0 = 날 각도(a1), k1 = 바이트 손잡이 각도(a2). 0,0 = 펼침 / π,π = 접힘
  const PI = Math.PI;
  const idle = P(0.15, -0.105, -0.33, 0.45, 0.35, -0.1, 0, 0, 0.8, 1, 1, 1, 1, 0.95, 0, 0);
  const apply = (p: Pose) => { base(p); model.parts.bladePivot.rotation.z = p[14]; model.parts.bitePivot.rotation.z = p[15]; };
  // 손가락을 펴서 손잡이가 지나갈 길을 내주고, 엄지로 세이프 손잡이를 눌러 잡는다
  const open = (p: Pose, k: number) => { for (let i = 9; i <= 12; i++) p[i] = 1 - 0.93 * k; p[13] = 0.95 + 0.05 * k; };
  return {
    id, gun: false, root, idle, sprint: [-0.02, -0.14, 0.04, -0.5, 0.3, 0], apply,
    clips: {
      // 꺼내기: 접힌 채 올라와서 ① 날+바이트가 넘어가고 ② 바이트 손잡이가 따라 돌아와 닫힌다
      draw: {
        dur: 0.55, cues: [[0.02, 'draw'], [0.3, 'clack'], [0.47, 'clack2']],
        fn: (t, p, I) => {
          const k = kf(t, [[0, 1], [0.2, 0, out]]);
          p[1] = I[1] - 0.3 * k; p[3] = I[3] - 0.6 * k;
          open(p, kf(t, [[0, 1], [0.44, 1], [0.53, 0, inn]]));
          p[14] = kf(t, [[0.1, PI], [0.3, 0, inn]]);
          p[15] = kf(t, [[0.29, -PI], [0.47, 0, inn]]); // 손가락 쪽으로 돌아 들어온다(손목을 지나지 않게)
          p[8] = kf(t, [[0.08, 0], [0.18, -0.4, out], [0.3, 0.25, lin], [0.4, -0.1], [0.55, 0]]); // 손목 스냅
          p[4] = I[4] + 0.35 * kf(t, [[0.05, 0], [0.2, 1], [0.55, 0]]);
        },
      },
      attack: slash(1, 0.55), attack2: slash(-1, 0.55),
      // 살펴보기: 끊어 치는 세 박자. 바이트 넘기기 → 통째로 접기 → 연속으로 펼치기
      inspect: {
        dur: 1.12, cues: [[0.26, 'clack'], [0.5, 'clack2'], [0.74, 'clack'], [0.9, 'clack2']],
        fn: (t, p, I) => {
          const show = kf(t, [[0, 0], [0.14, 1, out], [0.9, 1], [1.12, 0]]);
          p[0] = I[0] - 0.05 * show; p[1] = I[1] + 0.025 * show;
          p[3] = I[3] - 0.15 * show; p[4] = I[4] + 0.75 * show;
          open(p, kf(t, [[0.02, 0], [0.1, 1, out], [0.9, 1], [1.0, 0, inn]]));
          p[15] = kf(t, [[0.1, 0], [0.26, -PI, inn], [0.74, -PI], [0.9, 0, inn]]);
          p[14] = kf(t, [[0.34, 0], [0.5, PI, inn], [0.58, PI], [0.74, 0, inn]]);
          // 각 박자 끝에서 손목이 반대로 받아쳐 손잡이와 맞물린다
          p[8] = kf(t, [[0.08, 0], [0.18, 0.3, out], [0.27, -0.28, lin], [0.36, 0.1], [0.42, 0.32, out], [0.51, -0.3, lin], [0.6, -0.28], [0.66, -0.4, out], [0.75, 0.3, lin], [0.83, 0.05], [0.91, -0.22, lin], [1.05, 0]]);
          p[6] = 0.5 * kf(t, [[0.3, 0], [0.5, 1], [0.6, 1], [0.8, 0]]);
        },
      },
    },
  };
}

function gunRig(id: string, sleeve: number): Rig {
  const cfg = WEAPONS[id] as GunCfg;
  const m: GunModel = makeGun(id);
  const root = new THREE.Group();
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; root.add(g); g.add(m.root);
  const mk = (left: boolean) => {
    const h = makeHand(sleeve); h.setCurl(left ? [0.85, 0.85, 0.85, 0.85, 0.5] : [0.6, 1, 1, 1, 0.7]);
    const o = new THREE.Group(); o.quaternion.copy(HAND_BASE);
    const inner = new THREE.Group(); inner.position.copy(h.grip.position).multiplyScalar(-1); o.add(inner);
    const fore = makeForearm(sleeve); fore.scale.y = 1.5; inner.add(fore); inner.add(h.root);
    const wrap = new THREE.Group(); wrap.add(o); if (left) wrap.scale.x = -1;
    g.add(wrap);
    return wrap;
  };
  const rh = mk(false); rh.position.copy(m.grip); rh.rotation.x = 0.25;
  const lh = mk(true); lh.rotation.set(0.2, 0, -0.5);
  const lRest = m.fore ? m.fore.clone() : new THREE.Vector3(-0.05, -0.4, 0.05);
  const magHome = m.mag ? m.mag.position.clone() : new THREE.Vector3(0, -0.06, -0.08);
  const actHome = m.action ? m.action.position.clone() : null;
  const muzzle = new THREE.Group(); muzzle.position.copy(m.muzzle); g.add(muzzle);
  const primary = cfg.slot === 0;
  const idle = primary ? P(0.15, -0.15, -0.47, 0, 0.05, 0) : P(0.15, -0.14, -0.46, 0, 0.04, 0);
  const apply = (p: Pose) => {
    g.position.set(p[0], p[1], p[2]); g.rotation.set(p[3], p[4], p[5]);
    if (m.mag) m.mag.position.set(magHome.x, magHome.y - p[14] * 0.24, magHome.z);
    lh.position.set(
      lRest.x + (magHome.x - lRest.x) * p[15], lRest.y + (magHome.y - 0.05 - p[14] * 0.2 - lRest.y) * p[15], lRest.z + (magHome.z - lRest.z) * p[15]);
    if (m.action && actHome) {
      const a = p[16];
      if (id === 'pistol') m.action.position.z = actHome.z + a * 0.045;
      else if (id === 'shotgun') m.action.position.z = actHome.z + a * 0.09;
      else if (id === 'sniper') { m.action.position.z = a * 0.07; m.action.rotation.z = Math.min(1, a * 2) * 0.9; }
      else if (id === 'revolver') { m.action.rotation.z = a * 1.05; m.action.position.x = actHome.x - Math.min(1, p[14] * 3) * 0.035; }
    }
  };
  const iv = cfg.interval, K = cfg.recoil.kick, R = cfg.reload;
  const fireDur = Math.min(Math.max(iv, 0.12), 1.2);
  const clips: Record<string, Clip> = {
    draw: { dur: cfg.draw, cues: [[0.02, 'draw']], fn: (t, p, I) => { const k = kf(t, [[0, 1], [cfg.draw, 0, snap]]); p[1] = I[1] - 0.28 * k; p[3] = I[3] - 0.9 * k; p[5] = I[5] + 0.3 * k; } },
    fire: {
      dur: fireDur,
      cues: id === 'shotgun' ? [[0.3, 'pump']] : id === 'sniper' ? [[0.35, 'bolt']] : [],
      fn: (t, p, I) => {
        const k = kf(t, [[0, 0], [0.035, 1, out], [Math.min(fireDur, 0.22), 0, smooth]]);
        p[2] = I[2] + K * k; p[3] = I[3] + K * 2.4 * k; p[1] = I[1] + K * 0.25 * k;
        if (id === 'pistol') p[16] = kf(t, [[0, 0], [0.03, 1, out], [0.11, 0]]);
        if (id === 'revolver') p[16] = kf(t, [[0, 0], [0.2, 1, smooth]]);
        if (id === 'shotgun') { p[16] = kf(t, [[0.25, 0], [0.4, 1, inn], [0.56, 0, inn]]); p[15] = 0; p[3] += 0.12 * kf(t, [[0.22, 0], [0.4, 1], [0.6, 0]]); }
        if (id === 'sniper') { p[16] = kf(t, [[0.28, 0], [0.5, 1], [0.62, 1], [0.84, 0]]); p[5] = I[5] - 0.22 * kf(t, [[0.25, 0], [0.45, 1], [0.7, 1], [0.95, 0]]); p[3] += 0.1 * kf(t, [[0.25, 0], [0.45, 1], [0.7, 1], [0.95, 0]]); }
      },
    },
    reload: {
      dur: R,
      cues: id === 'shotgun' ? [[R * 0.2, 'shell'], [R * 0.4, 'shell'], [R * 0.6, 'shell'], [R * 0.86, 'pump']]
        : [[R * 0.16, 'magout'], [R * 0.6, 'magin'], [R * 0.86, id === 'sniper' ? 'bolt' : 'rack']],
      fn: (t, p, I) => {
        const u = t / R;
        const tilt = kf(u, [[0, 0], [0.12, 1, out], [0.78, 1], [1, 0]]);
        p[3] = I[3] + 0.32 * tilt; p[5] = I[5] + (primary ? 0.38 : -0.4) * tilt; p[1] = I[1] + 0.02 * tilt; p[0] = I[0] - 0.03 * tilt;
        if (id === 'shotgun') {
          p[15] = kf(u, [[0, 0], [0.12, 1], [0.7, 1], [0.8, 0]]);
          p[14] = 0.35 * (0.5 + 0.5 * Math.sin(kf(u, [[0.12, 0], [0.7, 1, lin]]) * TAU * 3 - 1.2)) * kf(u, [[0.1, 0], [0.15, 1], [0.68, 1], [0.72, 0]]);
          p[16] = kf(u, [[0.8, 0], [0.87, 1, inn], [0.95, 0, inn]]);
        } else {
          p[15] = kf(u, [[0.04, 0], [0.14, 1], [0.68, 1], [0.8, 0]]);
          p[14] = kf(u, [[0.14, 0], [0.26, 1, inn], [0.46, 1], [0.6, 0, out]]);
          p[16] = id === 'revolver' ? kf(u, [[0.1, 0], [0.2, 1], [0.6, 1], [0.7, 0], [0.75, 0], [0.95, 1]]) % 1 : kf(u, [[0.8, 0], [0.86, 1, inn], [0.93, 0, inn]]);
          p[3] += 0.12 * kf(u, [[0.56, 0], [0.61, 1, out], [0.7, 0]]);
        }
      },
    },
    inspect: {
      dur: 1.5,
      fn: (t, p, I) => {
        const a = kf(t, [[0, 0], [0.3, 1], [0.6, 1], [0.95, -1], [1.2, -1], [1.5, 0]]);
        const up = kf(t, [[0, 0], [0.3, 1], [1.2, 1], [1.5, 0]]);
        p[4] = I[4] + (a > 0 ? 0.95 : 0.5) * a; p[5] = I[5] + 0.5 * a; p[3] = I[3] + 0.2 * up; p[0] = I[0] - 0.05 * up; p[1] = I[1] + 0.03 * up;
      },
    },
  };
  return {
    id, gun: true, root, idle, apply, clips, muzzle,
    sprint: primary ? [-0.06, -0.07, 0.05, -0.12, 0.75, 0.25] : [0, -0.1, 0.06, -0.55, 0.25, 0],
    ads: [0, -m.sightY, id === 'sniper' ? -0.2 : primary ? -0.3 : -0.42],
  };
}

export interface VMFrame { dt: number; speed: number; sprint: boolean; ground: boolean; ads: number; lookDx: number; lookDy: number }

export class ViewModel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  onCue: (name: string, rig: string) => void = () => {};
  private rigs = new Map<string, Rig>();
  rig: Rig | null = null;
  clip = 'idle';
  private t = 0;
  private from = new Float32Array(N);
  private blend = 0; private blendDur = 0;
  private cur = new Float32Array(N); private tmp = new Float32Array(N);
  private sprintW = 0; private bobT = 0; private sway = new THREE.Vector2(); private land = 0; private wasGround = true;
  private altAttack = false;
  private sleeve = TEAM_COLORS[0];
  private flash: THREE.Mesh;
  private flashT = 0;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8d0, 2.1));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(-1, 2, 1.5); this.scene.add(d);
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.95 }));
    this.flash.visible = false; this.scene.add(this.flash);
  }
  setTeam(team: number) { if (this.sleeve !== TEAM_COLORS[team]) { this.sleeve = TEAM_COLORS[team]; this.rigs.clear(); if (this.rig) { const id = this.rig.id; this.scene.remove(this.rig.root); this.rig = null; this.equip(id, false); } } }
  private getRig(id: string) {
    let r = this.rigs.get(id);
    if (!r) { r = WEAPONS[id].kind === 'gun' ? gunRig(id, this.sleeve) : knifeRig(id, this.sleeve); this.rigs.set(id, r); }
    return r;
  }
  equip(id: string, anim = true) {
    const r = this.getRig(id);
    if (this.rig && this.rig !== r) this.scene.remove(this.rig.root);
    const changed = this.rig !== r;
    this.rig = r; this.scene.add(r.root);
    if (changed) { this.cur.set(r.idle); this.from.set(r.idle); }
    if (anim) this.play('draw', changed ? 0 : 0.07); else this.play('idle', 0);
  }
  /** 현재 자세에서 새 동작으로 블렌딩해 넘어간다 */
  play(name: string, blend = 0.08) {
    const r = this.rig; if (!r) return;
    if (name !== 'idle' && !r.clips[name]) return;
    this.from.set(this.cur);
    if (r.wrapCh !== undefined) { // 회전 채널은 가까운 쪽 각도로 정규화: 중간에 끊겨도 반대로 되감기지 않는다
      const c = r.wrapCh; this.from[c] -= Math.round(this.from[c] / TAU) * TAU;
    }
    this.clip = name; this.t = 0; this.blend = 0; this.blendDur = blend;
  }
  fire() { this.play('fire', 0.02); this.flashT = 0.05; }
  attack() { this.altAttack = !this.altAttack; this.play(this.altAttack ? 'attack' : 'attack2', 0.06); }
  reload() { this.play('reload', 0.1); }
  inspect() { if (this.clip === 'idle' || this.clip === 'inspect') this.play('inspect', 0.09); }
  get busyInspect() { return this.clip === 'inspect'; }

  private evalClip(name: string, t: number, outP: Pose) {
    const r = this.rig!;
    outP.set(r.idle);
    if (name !== 'idle') r.clips[name].fn(t, outP, r.idle);
  }
  update(f: VMFrame) {
    const r = this.rig; if (!r) return;
    const prevT = this.t;
    this.t += f.dt;
    const clip = this.clip === 'idle' ? null : r.clips[this.clip];
    if (clip) {
      if (clip.cues) for (const [ct, name] of clip.cues) if (prevT <= ct && this.t > ct) this.onCue(name, r.id);
      if (this.t >= clip.dur) { this.evalClip(this.clip, clip.dur, this.cur); this.play('idle', 0.1); }
    }
    this.evalClip(this.clip, this.t, this.tmp);
    this.blend += f.dt;
    const k = this.blendDur <= 0 ? 1 : smooth(Math.min(1, this.blend / this.blendDur));
    for (let i = 0; i < N; i++) this.cur[i] = this.from[i] + (this.tmp[i] - this.from[i]) * k;
    r.apply(this.cur);

    // ---- 절차적 덧입힘: 걷기 흔들림, 질주 내림, 시점 끌림, 착지 ----
    const idleLike = this.clip === 'idle';
    const sprintT = f.sprint && idleLike && f.ground ? 1 : 0;
    this.sprintW += (sprintT - this.sprintW) * Math.min(1, f.dt * (sprintT ? 9 : 16));
    const moveK = Math.min(1, f.speed / 6.4) * (f.ground ? 1 : 0.2);
    this.bobT += f.dt * (f.sprint ? 13 : 9.5) * moveK;
    const calm = (1 - f.ads * 0.85) * (this.clip === 'inspect' ? 0.5 : 1);
    const bx = Math.sin(this.bobT) * 0.006 * moveK * calm * (1 + this.sprintW * 1.4);
    const by = -Math.abs(Math.cos(this.bobT)) * 0.007 * moveK * calm * (1 + this.sprintW * 1.2);
    this.sway.x += (THREE.MathUtils.clamp(-f.lookDx * 0.0012, -0.02, 0.02) - this.sway.x) * Math.min(1, f.dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(f.lookDy * 0.0012, -0.02, 0.02) - this.sway.y) * Math.min(1, f.dt * 10);
    if (f.ground && !this.wasGround) this.land = 1;
    this.wasGround = f.ground;
    this.land = Math.max(0, this.land - f.dt * 6);
    const s = r.sprint, w = this.sprintW;
    const root = r.root;
    root.position.set(bx + this.sway.x * calm + s[0] * w, by + this.sway.y * calm + s[1] * w - Math.sin(this.land * Math.PI) * 0.018, s[2] * w);
    root.rotation.set(s[3] * w + this.sway.y * 1.2 * calm, s[4] * w + this.sway.x * 1.5 * calm, s[5] * w + bx * 1.5);
    if (r.gun && r.ads && f.ads > 0) { // 조준: 가늠자를 화면 중앙으로
      const a = smooth(f.ads), g = root.children[0];
      g.position.lerp(new THREE.Vector3(r.ads[0], r.ads[1], r.ads[2]), a);
      g.rotation.x *= 1 - a * 0.6; g.rotation.y *= 1 - a; g.rotation.z *= 1 - a;
    }
    if (this.flashT > 0 && r.muzzle) {
      this.flashT -= f.dt; this.flash.visible = true;
      r.muzzle.getWorldPosition(this.flash.position);
      this.flash.rotation.z += 1.7; this.flash.scale.setScalar(0.6 + Math.random() * 0.8);
    } else this.flash.visible = false;
  }
  /** 총구의 화면상 위치(예광탄 시작점용) */
  muzzleWorld(v: THREE.Vector3) { if (this.rig?.muzzle) this.rig.muzzle.getWorldPosition(v); else v.set(0.15, -0.1, -0.5); return v; }
  /** 검수용: 현재 자세 채널 + 덧입힘 값 */
  poseArray() { const r = this.rig; return r ? [...this.cur, r.root.position.x, r.root.position.y, r.root.position.z, r.root.rotation.x, r.root.rotation.y] : []; }
  idleArray() { return this.rig ? [...this.rig.idle] : []; }
  /** 검수용: 특정 클립의 특정 시점 자세를 그대로 보여준다 */
  debugPose(id: string, clip: string, t: number) {
    this.equip(id, false);
    this.evalClip(clip, t, this.cur); this.rig!.apply(this.cur);
    this.rig!.root.position.set(0, 0, 0); this.rig!.root.rotation.set(0, 0, 0);
  }
}
