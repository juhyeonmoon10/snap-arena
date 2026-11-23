// 독자 제작 메시: 손, 칼 3종, 총 6종, 블록형 캐릭터. 전부 단순 도형 조합.
import * as THREE from 'three';
import { surface } from './fx';

// 재질: 색마다 거칠기·금속성을 정해 둔 PBR 재질
const METAL = new Set([0xc9ced3, 0x8d9399, 0x6f757c, 0x565b61, 0x9aa0a6, 0xb08d3c, 0x4a4e53]);
const mats = new Map<number, THREE.Material>();
export function mat(color: number) {
  let m = mats.get(color);
  if (!m) {
    const metal = METAL.has(color);
    m = surface({ color, roughness: metal ? 0.32 : 0.78, metalness: metal ? 0.85 : 0.08 });
    mats.set(color, m);
  }
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(boxGeo, mat(color));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  parent?.add(m);
  return m;
}
function cyl(r: number, len: number, color: number, axis: 'x' | 'y' | 'z', x = 0, y = 0, z = 0, parent?: THREE.Object3D, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat(color));
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); parent?.add(m);
  return m;
}
const INK = 0x1b1d20, WHITE = 0x3d4248, STEEL = 0xc9ced3, SKIN = 0x26282b; // SKIN = 장갑

// ---------------- 손 ----------------
// 손 좌표계: +y 손목→손가락 뿌리, +x 새끼→검지(엄지 쪽), +z 손바닥이 향하는 쪽.
export interface Hand {
  root: THREE.Group; // 원점 = 손목
  grip: THREE.Group; // 손잡이가 놓이는 자리(손잡이 축 = x)
  ringSocket: THREE.Group; // 검지가 통과하는 고리 자리(카람빗). 고리 축 = z
  setCurl(c: number[]): void; // [검지, 중지, 약지, 새끼, 엄지] 0=폄 1=쥠
}
export function makeHand(sleeve: number): Hand {
  const root = new THREE.Group();
  box(0.086, 0.092, 0.03, SKIN, 0, 0.046, 0, root);
  box(0.09, 0.03, 0.036, sleeve, 0, -0.012, 0, root); // 소매 끝단
  const prox: THREE.Group[] = [], dist: THREE.Group[] = [];
  const xs = [0.032, 0.0107, -0.0107, -0.032], len = [0.042, 0.046, 0.043, 0.036];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group(); p.position.set(xs[i], 0.092, 0); root.add(p);
    box(0.0195, len[i], 0.021, SKIN, 0, len[i] / 2, 0, p);
    const d = new THREE.Group(); d.position.set(0, len[i], 0); p.add(d);
    box(0.0185, len[i] * 0.95, 0.019, SKIN, 0, len[i] * 0.475, 0, d);
    prox.push(p); dist.push(d);
  }
  // 엄지: 손바닥 옆에서 비스듬히
  const tb = new THREE.Group(); tb.position.set(0.043, 0.022, 0.006); tb.rotation.z = -0.75; root.add(tb);
  const t1 = new THREE.Group(); tb.add(t1);
  box(0.022, 0.044, 0.022, SKIN, 0, 0.022, 0, t1);
  const t2 = new THREE.Group(); t2.position.set(0, 0.044, 0); t1.add(t2);
  box(0.02, 0.036, 0.02, SKIN, 0, 0.018, 0, t2);
  const grip = new THREE.Group(); grip.position.set(0, 0.071, 0.025); root.add(grip);
  const ringSocket = new THREE.Group(); ringSocket.position.set(0.032, 0.096, 0.022); root.add(ringSocket);
  return {
    root, grip, ringSocket,
    setCurl(c) {
      for (let i = 0; i < 4; i++) { prox[i].rotation.x = c[i] * 1.5; dist[i].rotation.x = c[i] * 1.55; }
      t1.rotation.x = c[4] * 0.9; t1.rotation.z = c[4] * 0.55; t2.rotation.x = c[4] * 0.7;
    },
  };
}
/** 팔뚝: 손목에서 -y 방향으로 뻗는다 */
export function makeForearm(sleeve: number) {
  const g = new THREE.Group();
  box(0.078, 0.34, 0.062, sleeve, 0, -0.195, 0, g);
  return g;
}

// ---------------- 칼 ----------------
// 칼 좌표계: 손잡이 축 = x. 정그립 칼은 +x로 날이 나간다. 칼 면 = xy 평면.
export interface KnifeModel { root: THREE.Group; parts: Record<string, THREE.Object3D> }

export function makeKnife(): KnifeModel {
  const root = new THREE.Group();
  box(0.11, 0.026, 0.02, 0x24272a, -0.005, 0, 0, root); // 손잡이
  box(0.014, 0.05, 0.026, INK, 0.056, 0, 0, root); // 가드
  box(0.012, 0.03, 0.022, 0x565b61, -0.064, 0, 0, root); // 끝마개
  const blade = new THREE.Group(); blade.position.x = 0.063; root.add(blade);
  box(0.12, 0.032, 0.006, STEEL, 0.06, 0.002, 0, blade);
  const tip = box(0.034, 0.034, 0.006, STEEL, 0.126, 0.0045, 0, blade); tip.rotation.z = Math.PI / 4; tip.scale.set(0.03, 0.03, 0.006);
  box(0.1, 0.006, 0.008, 0x9aa0a6, 0.055, 0.016, 0, blade); // 등 쪽 색띠(면 구분용)
  box(0.03, 0.01, 0.007, 0x3c4045, 0.03, -0.004, 0.001, blade); // 한쪽 면에만 있는 표식
  return { root, parts: { blade } };
}

/** 카람빗. 원점 = 고리 중심. 손잡이는 -x로, 굽은 날은 그 끝에서 +y로 휜다. */
export function makeKarambit(): KnifeModel {
  const root = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0055, 8, 20), mat(0x8d9399));
  root.add(ring); // 고리 축 = z
  const HY = -0.024; // 손잡이는 고리 중심보다 손목 쪽으로 내려와 나머지 세 손가락 안에 들어간다
  box(0.02, 0.02, 0.016, 0x8d9399, -0.016, -0.016, 0, root); // 고리와 손잡이를 잇는 목
  box(0.09, 0.024, 0.017, 0x2a2d31, -0.058, HY, 0, root);
  box(0.01, 0.028, 0.02, WHITE, -0.04, HY, 0, root);
  box(0.01, 0.028, 0.02, WHITE, -0.085, HY, 0, root);
  // 굽은 날: 짧은 조각을 호 모양으로 이어 붙임. 손잡이 끝(-x)에서 +y로 휜다.
  let px = -0.1, py = HY, ang = Math.PI;
  for (let i = 0; i < 6; i++) {
    const L = 0.021, w = 0.03 - i * 0.0042;
    ang -= 0.27;
    const cx = px + Math.cos(ang) * L / 2, cy = py + Math.sin(ang) * L / 2;
    const seg = box(L + 0.004, w, 0.0055, STEEL, cx, cy, 0, root); seg.rotation.z = ang;
    const edge = box(L + 0.004, 0.005, 0.007, 0x9aa0a6, cx + Math.sin(ang) * w * 0.42, cy - Math.cos(ang) * w * 0.42, 0, root); edge.rotation.z = ang;
    px += Math.cos(ang) * L; py += Math.sin(ang) * L;
  }
  return { root, parts: { ring } };
}

/** 발리송. 원점 = 쥐는 손잡이(세이프) 중간. 피벗은 +x 끝. a1: 날, a2: 두 번째 손잡이(바이트). */
export function makeBalisong(): KnifeModel {
  const root = new THREE.Group();
  const HL = 0.112, PIV = HL / 2;
  const handle = (color: number) => {
    const g = new THREE.Group();
    box(HL, 0.0105, 0.012, color, -HL / 2, 0, 0, g);
    for (let i = 0; i < 3; i++) box(0.012, 0.0115, 0.013, WHITE, -0.025 - i * 0.03, 0, 0, g); // 구멍 무늬
    cyl(0.0052, 0.016, INK, 'z', 0, 0, 0, g, 8);
    return g;
  };
  const safe = handle(0x6f757c); safe.position.set(PIV, -0.0068, 0); root.add(safe);
  const bladePivot = new THREE.Group(); bladePivot.position.set(PIV, -0.0068, 0); root.add(bladePivot); // 세이프 쪽 핀
  box(0.1, 0.02, 0.0045, STEEL, 0.056, 0.0068, 0, bladePivot);
  const tip = box(0.02, 0.02, 0.0045, STEEL, 0.106, 0.0068, 0, bladePivot); tip.rotation.z = Math.PI / 4; tip.scale.set(0.0145, 0.0145, 0.0045);
  box(0.07, 0.004, 0.006, 0x9aa0a6, 0.05, 0.0153, 0, bladePivot);
  box(0.016, 0.024, 0.006, INK, 0.004, 0.0068, 0, bladePivot); // 탱
  const bitePivot = new THREE.Group(); bitePivot.position.set(0, 0.0136, 0); bladePivot.add(bitePivot); // 바이트 쪽 핀
  const bite = handle(0x565b61); bitePivot.add(bite);
  box(0.006, 0.016, 0.016, 0xb08d3c, -HL + 0.004, -0.004, 0, bite); // 걸쇠
  return { root, parts: { bladePivot, bitePivot } };
}

// ---------------- 총 ----------------
// 총 좌표계: 총구 -z, 위 +y. 원점 = 손잡이 위쪽.
export interface GunModel {
  root: THREE.Group; muzzle: THREE.Vector3; grip: THREE.Vector3; fore: THREE.Vector3 | null;
  mag: THREE.Object3D | null; action: THREE.Object3D | null; sightY: number; len: number;
}
export function makeGun(id: string): GunModel {
  const root = new THREE.Group();
  const r: GunModel = { root, muzzle: new THREE.Vector3(), grip: new THREE.Vector3(0, -0.055, 0.012), fore: null, mag: null, action: null, sightY: 0.08, len: 0.5 };
  const gripMesh = (c: number, h = 0.105) => { const g = box(0.04, h, 0.048, c, 0, -h / 2 + 0.005, 0.016, root); g.rotation.x = 0.22; };
  if (id === 'ar') {
    box(0.06, 0.085, 0.3, 0x30343a, 0, 0.03, -0.1, root);
    box(0.052, 0.062, 0.2, WHITE, 0, 0.03, -0.34, root);
    box(0.026, 0.026, 0.16, INK, 0, 0.035, -0.5, root);
    box(0.036, 0.036, 0.04, 0x1f2124, 0, 0.035, -0.58, root);
    box(0.05, 0.075, 0.2, 0x30343a, 0, 0.022, 0.15, root); box(0.054, 0.1, 0.03, INK, 0, 0.012, 0.26, root);
    box(0.016, 0.03, 0.02, INK, 0, 0.088, 0.0, root); box(0.012, 0.03, 0.012, 0x1f2124, 0, 0.088, -0.42, root);
    box(0.02, 0.014, 0.2, INK, 0, 0.079, -0.14, root);
    gripMesh(INK);
    r.mag = box(0.036, 0.14, 0.06, 0x1f2124, 0, -0.075, -0.1, root); r.mag.rotation.x = -0.12;
    r.muzzle.set(0, 0.035, -0.6); r.fore = new THREE.Vector3(0, 0.0, -0.33); r.sightY = 0.1; r.len = 0.6;
  } else if (id === 'smg') {
    box(0.062, 0.09, 0.24, 0x2a2d31, 0, 0.03, -0.07, root);
    box(0.03, 0.03, 0.09, INK, 0, 0.04, -0.23, root); box(0.044, 0.044, 0.05, WHITE, 0, 0.04, -0.29, root);
    box(0.02, 0.02, 0.17, INK, 0.026, 0.05, 0.13, root); box(0.02, 0.02, 0.17, INK, -0.026, 0.05, 0.13, root); box(0.075, 0.06, 0.02, INK, 0, 0.04, 0.22, root);
    box(0.014, 0.024, 0.02, INK, 0, 0.087, 0.02, root); box(0.012, 0.024, 0.012, WHITE, 0, 0.087, -0.17, root);
    gripMesh(INK);
    box(0.034, 0.07, 0.036, INK, 0, -0.04, -0.15, root); // 앞손잡이
    r.mag = box(0.03, 0.17, 0.045, 0x1f2124, 0, -0.1, -0.06, root);
    r.muzzle.set(0, 0.04, -0.32); r.fore = new THREE.Vector3(0, -0.035, -0.15); r.sightY = 0.096; r.len = 0.36;
  } else if (id === 'shotgun') {
    box(0.064, 0.085, 0.24, 0x26282b, 0, 0.03, -0.06, root);
    box(0.036, 0.036, 0.4, INK, 0, 0.05, -0.36, root);
    box(0.03, 0.03, 0.32, 0x4a4e53, 0, 0.012, -0.33, root);
    r.action = box(0.058, 0.052, 0.13, 0x6b4a2f, 0, 0.012, -0.3, root); // 펌프
    box(0.05, 0.07, 0.22, 0x6b4a2f, 0, 0.012, 0.16, root); box(0.054, 0.095, 0.03, INK, 0, 0.004, 0.28, root);
    box(0.012, 0.02, 0.012, WHITE, 0, 0.078, -0.54, root);
    gripMesh(0x6b4a2f, 0.09);
    r.muzzle.set(0, 0.05, -0.57); r.fore = new THREE.Vector3(0, 0.0, -0.3); r.sightY = 0.086; r.len = 0.58;
  } else if (id === 'sniper') {
    box(0.058, 0.08, 0.3, 0x4b5340, 0, 0.03, -0.08, root);
    box(0.026, 0.026, 0.5, INK, 0, 0.04, -0.47, root); box(0.04, 0.04, 0.07, 0x1f2124, 0, 0.04, -0.74, root);
    box(0.05, 0.05, 0.2, 0x4b5340, 0, 0.022, -0.32, root);
    box(0.05, 0.09, 0.26, 0x4b5340, 0, 0.012, 0.19, root); box(0.03, 0.03, 0.12, WHITE, 0, 0.075, 0.16, root); box(0.054, 0.11, 0.03, INK, 0, 0.0, 0.33, root);
    cyl(0.026, 0.24, INK, 'z', 0, 0.115, -0.09, root); cyl(0.034, 0.04, WHITE, 'z', 0, 0.115, -0.22, root); cyl(0.03, 0.03, WHITE, 'z', 0, 0.115, 0.04, root);
    box(0.014, 0.03, 0.02, INK, 0, 0.082, -0.02, root); box(0.014, 0.03, 0.02, INK, 0, 0.082, -0.16, root);
    r.action = new THREE.Group(); root.add(r.action);
    box(0.05, 0.016, 0.016, STEEL, 0.045, 0.05, 0.04, r.action); box(0.022, 0.022, 0.022, 0x1f2124, 0.075, 0.05, 0.04, r.action);
    gripMesh(INK);
    r.mag = box(0.04, 0.06, 0.07, INK, 0, -0.03, -0.1, root);
    r.muzzle.set(0, 0.04, -0.78); r.fore = new THREE.Vector3(0, -0.005, -0.32); r.sightY = 0.115; r.len = 0.78;
  } else if (id === 'pistol') {
    r.action = box(0.036, 0.04, 0.19, 0x33373c, 0, 0.034, -0.05, root); // 슬라이드
    box(0.034, 0.03, 0.17, INK, 0, 0.004, -0.045, root);
    box(0.012, 0.014, 0.012, WHITE, 0, 0.06, 0.03, root); box(0.008, 0.014, 0.01, WHITE, 0, 0.06, -0.13, root);
    gripMesh(INK, 0.1);
    r.mag = box(0.028, 0.09, 0.036, 0x1f2124, 0, -0.052, 0.018, root); r.mag.rotation.x = 0.22;
    r.muzzle.set(0, 0.034, -0.15); r.sightY = 0.07; r.len = 0.2;
  } else {
    box(0.034, 0.05, 0.1, STEEL, 0, 0.03, 0.01, root);
    box(0.026, 0.03, 0.2, STEEL, 0, 0.045, -0.13, root); box(0.02, 0.016, 0.16, INK, 0, 0.022, -0.12, root);
    r.action = cyl(0.03, 0.062, 0x8d9399, 'z', 0, 0.03, -0.02, root, 6); // 실린더
    box(0.012, 0.03, 0.02, INK, 0, 0.062, 0.05, root); // 해머
    box(0.008, 0.018, 0.01, 0x8d9399, 0, 0.068, -0.22, root);
    gripMesh(0x6b4a2f, 0.11);
    r.muzzle.set(0, 0.045, -0.24); r.sightY = 0.075; r.len = 0.28;
  }
  return r;
}

// ---------------- 캐릭터 ----------------
export interface Avatar {
  root: THREE.Group; armR: THREE.Group; armL: THREE.Group; legL: THREE.Group; legR: THREE.Group; head: THREE.Group;
  hold: THREE.Group; setWeapon(id: string): void;
}
export function makeAvatar(team: number): Avatar {
  const uni = team === 0 ? 0x2a3a52 : 0x7d6444, dark = team === 0 ? 0x1c2638 : 0x554429, mark = team === 0 ? 0x3f86ff : 0xff7a2a;
  const FACE = 0xc79a78, GEAR = 0x25282b;
  const markMat = surface({ color: mark, emissive: mark, emissiveIntensity: 0.55, roughness: 0.6 });
  const cap = (r: number, len: number, color: number, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat(color)); m.position.set(x, y, z); parent.add(m); return m;
  };
  const band = (w: number, h: number, d: number, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(boxGeo, markMat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m;
  };
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const torso = cap(0.17, 0.3, uni, root, 0, 1.12, 0); torso.scale.set(1.35, 1, 0.85);
  box(0.42, 0.34, 0.26, GEAR, 0, 1.17, 0, root); // 조끼
  box(0.3, 0.12, 0.06, 0x3a3e42, 0, 1.08, -0.15, root); // 탄입대
  box(0.44, 0.07, 0.25, GEAR, 0, 0.9, 0, root); // 벨트
  band(0.1, 0.07, 0.01, root, 0.11, 1.26, -0.135); // 가슴 표식
  band(0.2, 0.1, 0.01, root, 0, 1.2, 0.135); // 등 표식
  const head = new THREE.Group(); head.position.set(0, 1.47, 0); root.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), mat(FACE)); face.position.y = 0.14; head.add(face);
  cap(0.05, 0.05, FACE, head, 0, 0.01, 0);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), mat(dark)); helmet.position.y = 0.16; head.add(helmet);
  band(0.285, 0.03, 0.285, head, 0, 0.17, 0); // 헬멧 띠
  box(0.2, 0.05, 0.03, 0x15171a, 0, 0.15, -0.105, head); // 고글
  const limb = (x: number, y: number, r: number, len: number, c: number, endC: number) => {
    const g = new THREE.Group(); g.position.set(x, y, 0); root.add(g);
    cap(r, len - r * 2, c, g, 0, -len / 2, 0);
    cap(r * 1.02, 0.1, endC, g, 0, -len + r + 0.03, 0);
    return g;
  };
  const legL = limb(-0.105, 0.86, 0.085, 0.86, dark, 0x1a1b1d), legR = limb(0.105, 0.86, 0.085, 0.86, dark, 0x1a1b1d);
  const armL = limb(-0.29, 1.36, 0.062, 0.62, uni, GEAR), armR = limb(0.29, 1.36, 0.062, 0.62, uni, GEAR);
  band(0.135, 0.07, 0.135, armL, 0, -0.14, 0); band(0.135, 0.07, 0.135, armR, 0, -0.14, 0); // 완장
  const hold = new THREE.Group(); hold.position.set(0, -0.6, -0.02); hold.rotation.x = Math.PI / 2; armR.add(hold);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return {
    root, armR, armL, legL, legR, head, hold,
    setWeapon(id) {
      hold.clear();
      let m: THREE.Object3D;
      if (id === 'knife') { m = makeKnife().root; m.rotation.y = Math.PI / 2; }
      else if (id === 'karambit') { m = makeKarambit().root; m.rotation.set(0, Math.PI / 2, Math.PI); m.position.z = -0.06; }
      else if (id === 'balisong') { m = makeBalisong().root; m.rotation.y = Math.PI / 2; }
      else { m = makeGun(id).root; m.position.set(0, 0.05, 0); }
      m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      hold.add(m);
    },
  };
}
