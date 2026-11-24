// 독자 제작 메시: 손, 칼 3종, 총 6종, 캐릭터.
// 총과 칼날은 옆모습 윤곽을 그려 두께만큼 압출(모서리 베벨)하고, 나머지는 둥근 상자·원통·캡슐로 만든다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { surface, LOW } from './fx';

// 재질: 색마다 거칠기·금속성을 정해 둔다
const METAL = new Set([0xc9ced3, 0x8d9399, 0x6f757c, 0x565b61, 0x9aa0a6, 0xb08d3c, 0x4a4e53, 0x3a3d41]);
const mats = new Map<number, THREE.Material>();
export function mat(color: number) {
  let m = mats.get(color);
  if (!m) {
    const metal = METAL.has(color);
    m = surface({ color, roughness: metal ? 0.34 : 0.8, metalness: metal ? 0.85 : 0.06 });
    mats.set(color, m);
  }
  return m;
}
// 위장 무늬 천
const fabrics = new Map<number, THREE.Material>();
function fabric(color: number) {
  let m = fabrics.get(color);
  if (!m) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!, col = new THREE.Color(color);
    g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, 128, 128);
    let s = color % 9973 + 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 34; i++) {
      const k = rnd() < 0.5 ? 0.72 : 1.22;
      g.fillStyle = '#' + col.clone().multiplyScalar(k).getHexString(); g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(rnd() * 128, rnd() * 128, 6 + rnd() * 16, 4 + rnd() * 9, rnd() * 3, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace;
    m = surface({ map: t, roughness: 0.95, metalness: 0 }); fabrics.set(color, m);
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
function rbox(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D, r?: number, material?: THREE.Material) {
  // 저사양 모드에서는 둥근 모서리를 생략해 삼각형 수를 크게 줄인다
  const m = LOW ? new THREE.Mesh(boxGeo, material ?? mat(color)) : new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r ?? Math.min(w, h, d) * 0.28), material ?? mat(color));
  if (LOW) m.scale.set(w, h, d);
  m.position.set(x, y, z); parent?.add(m);
  return m;
}
function cyl(r: number, len: number, color: number, axis: 'x' | 'y' | 'z', x = 0, y = 0, z = 0, parent?: THREE.Object3D, seg = 14, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, LOW ? Math.min(seg, 7) : seg, 1), mat(color));
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); parent?.add(m);
  return m;
}
function capsule(r: number, len: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), LOW ? 2 : 4, LOW ? 6 : 12), material);
  m.position.set(x, y, z); parent.add(m); return m;
}
type Pt = [number, number];
/** xy 평면의 윤곽을 z 방향 두께 t로 압출. 모서리는 bevel만큼 깎는다. */
function plate(pts: Pt[], t: number, color: number, bevel = 0.002, hole?: Pt[]) {
  if (LOW) bevel = 0;
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  if (hole) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p[0], p[1]))));
  const depth = Math.max(0.0005, t - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mat(color));
}
/** 총 옆모습 윤곽: u = 앞(총구 방향), v = 위. 두께 t는 좌우. */
function side(pts: Pt[], t: number, color: number, parent: THREE.Object3D, bevel = 0.003, hole?: Pt[]) {
  const m = plate(pts, t, color, bevel, hole); m.rotation.y = Math.PI / 2; parent.add(m); return m;
}
const BLK = 0x1b1d20, GUN = 0x2b2e32, DARK = 0x0f1012, STEELD = 0x4a4e53, STEEL = 0xc9ced3, WOOD = 0x6b4a2f, OD = 0x4b5340, GLOVE = 0x26282b;

// ---------------- 손 ----------------
// 손 좌표계: +y 손목→손가락 뿌리, +x 새끼→검지(엄지 쪽), +z 손바닥이 향하는 쪽.
export interface Hand {
  root: THREE.Group; // 원점 = 손목
  grip: THREE.Group; // 손잡이가 놓이는 자리(손잡이 축 = x)
  ringSocket: THREE.Group; // 검지가 통과하는 고리 자리(카람빗). 고리 축 = z
  setCurl(c: number[]): void; // [검지, 중지, 약지, 새끼, 엄지] 0=폄 1=쥠
}
export function makeHand(_sleeve: number): Hand {
  const root = new THREE.Group();
  rbox(0.086, 0.092, 0.03, GLOVE, 0, 0.046, 0, root, 0.011); // 손바닥
  rbox(0.05, 0.038, 0.006, 0x33373c, 0, 0.046, -0.0155, root, 0.003); // 손등 덧댐
  rbox(0.082, 0.02, 0.012, DARK, 0, 0.084, -0.014, root, 0.005); // 너클 보호대
  rbox(0.083, 0.026, 0.037, DARK, 0, -0.01, 0, root, 0.009); // 손목 밴드
  box(0.026, 0.014, 0.004, 0x3a3d41, 0.018, -0.01, -0.0195, root); // 조임 끈
  const prox: THREE.Group[] = [], dist: THREE.Group[] = [];
  const xs = [0.032, 0.0107, -0.0107, -0.032], len = [0.042, 0.046, 0.043, 0.036];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group(); p.position.set(xs[i], 0.092, 0); root.add(p);
    rbox(0.0195, len[i] + 0.006, 0.021, GLOVE, 0, len[i] / 2, 0, p, 0.008);
    const d = new THREE.Group(); d.position.set(0, len[i], 0); p.add(d);
    rbox(0.0185, len[i] * 0.95 + 0.004, 0.019, GLOVE, 0, len[i] * 0.475, 0, d, 0.0085);
    prox.push(p); dist.push(d);
  }
  const tb = new THREE.Group(); tb.position.set(0.043, 0.022, 0.006); tb.rotation.z = -0.75; root.add(tb);
  const t1 = new THREE.Group(); tb.add(t1);
  rbox(0.023, 0.05, 0.023, GLOVE, 0, 0.022, 0, t1, 0.009);
  const t2 = new THREE.Group(); t2.position.set(0, 0.044, 0); t1.add(t2);
  rbox(0.021, 0.04, 0.021, GLOVE, 0, 0.018, 0, t2, 0.0095);
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
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.05, 0.36, 14), fabric(sleeve));
  m.position.y = -0.2; m.scale.z = 0.84; g.add(m);
  return g;
}

// ---------------- 칼 ----------------
// 칼 좌표계: 손잡이 축 = x. 정그립 칼은 +x로 날이 나간다. 칼 면 = xy 평면.
export interface KnifeModel { root: THREE.Group; parts: Record<string, THREE.Object3D> }

export function makeKnife(): KnifeModel {
  const root = new THREE.Group();
  for (let i = 0; i < 5; i++) rbox(0.0205, 0.027 - (i === 2 ? 0.002 : 0), 0.021, BLK, -0.046 + i * 0.022, 0, 0, root, 0.007); // 마디진 고무 손잡이
  rbox(0.009, 0.058, 0.025, STEELD, 0.0585, 0, 0, root, 0.003); // 가드
  rbox(0.014, 0.03, 0.022, STEELD, -0.064, 0, 0, root, 0.005); // 끝마개
  cyl(0.004, 0.024, DARK, 'z', -0.064, 0, 0, root, 8); // 끈 구멍
  const blade = new THREE.Group(); blade.position.x = 0.063; root.add(blade);
  blade.add(plate([[0, -0.016], [0.1, -0.016], [0.146, 0.005], [0.112, 0.012], [0.096, 0.0175], [0, 0.0175]], 0.0052, STEEL, 0.0023)); // 클립 포인트 날
  box(0.07, 0.0035, 0.0056, 0x9aa0a6, 0.045, 0.007, 0, blade); // 혈조
  for (let i = 0; i < 4; i++) box(0.004, 0.004, 0.0058, 0x565b61, 0.012 + i * 0.008, 0.0165, 0, blade); // 등 톱니
  box(0.022, 0.008, 0.001, 0x565b61, 0.02, -0.004, 0.0029, blade); // 한쪽 면의 각인
  return { root, parts: { blade } };
}

/** 카람빗. 원점 = 고리 중심. 손잡이는 -x로, 굽은 날은 그 끝에서 +y로 휜다. */
export function makeKarambit(): KnifeModel {
  const root = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0055, 10, 28), mat(0x8d9399));
  root.add(ring); // 고리 축 = z
  const HY = -0.024; // 손잡이는 고리 중심보다 손목 쪽으로 내려와 나머지 세 손가락 안에 들어간다
  rbox(0.022, 0.022, 0.015, 0x8d9399, -0.016, -0.016, 0, root, 0.005); // 고리와 손잡이를 잇는 목
  for (let i = 0; i < 3; i++) rbox(0.029, 0.0255, 0.0175, 0x2a2d31, -0.029 - i * 0.029, HY + (i === 1 ? -0.0012 : 0), 0, root, 0.007); // 손가락 홈 손잡이
  box(0.086, 0.021, 0.006, 0x565b61, -0.058, HY, 0, root); // 풀탱 심
  for (const x of [-0.03, -0.086]) cyl(0.0035, 0.0185, STEEL, 'z', x, HY, 0, root, 8); // 리벳
  // 굽은 날: 중심선을 따라 폭을 줄여 가며 윤곽을 만든다
  const L: Pt[] = [], R: Pt[] = [];
  let px = -0.1, py = HY, ang = Math.PI; const N = 18, total = 0.128;
  for (let i = 0; i <= N; i++) {
    const s = i / N, w = 0.0155 * Math.pow(1 - s, 0.75) + 0.0003;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    L.push([px + nx * w, py + ny * w]); R.push([px - nx * w * 0.9, py - ny * w * 0.9]);
    ang -= 1.62 / N; px += Math.cos(ang) * total / N; py += Math.sin(ang) * total / N;
  }
  root.add(plate([...L, ...R.reverse()], 0.0056, STEEL, 0.0024));
  return { root, parts: { ring } };
}

/** 발리송. 원점 = 쥐는 손잡이(세이프) 중간. 피벗은 +x 끝. a1: 날, a2: 두 번째 손잡이(바이트). */
export function makeBalisong(): KnifeModel {
  const root = new THREE.Group();
  const HL = 0.112, PIV = HL / 2;
  const handle = (color: number) => {
    const g = new THREE.Group();
    rbox(HL, 0.0108, 0.0125, color, -HL / 2, 0, 0, g, 0.0032);
    for (let i = 0; i < 4; i++) cyl(0.0031, 0.0128, DARK, 'z', -0.024 - i * 0.022, 0, 0, g, 8); // 경량화 구멍
    cyl(0.0052, 0.016, STEEL, 'z', 0, 0, 0, g, 10); // 피벗 나사
    return g;
  };
  const safe = handle(0x6f757c); safe.position.set(PIV, -0.0068, 0); root.add(safe);
  const bladePivot = new THREE.Group(); bladePivot.position.set(PIV, -0.0068, 0); root.add(bladePivot); // 세이프 쪽 핀
  const blade = plate([[0.004, -0.0095], [0.086, -0.0095], [0.114, 0.003], [0.092, 0.0098], [0.004, 0.0098]], 0.0046, STEEL, 0.0019);
  blade.position.y = 0.0068; bladePivot.add(blade);
  box(0.06, 0.003, 0.005, 0x9aa0a6, 0.05, 0.0105, 0, bladePivot);
  rbox(0.017, 0.025, 0.0062, STEELD, 0.004, 0.0068, 0, bladePivot, 0.002); // 탱
  const bitePivot = new THREE.Group(); bitePivot.position.set(0, 0.0136, 0); bladePivot.add(bitePivot); // 바이트 쪽 핀
  const bite = handle(0x565b61); bitePivot.add(bite);
  rbox(0.006, 0.016, 0.016, 0xb08d3c, -HL + 0.004, -0.004, 0, bite, 0.002); // 걸쇠
  return { root, parts: { bladePivot, bitePivot } };
}

// ---------------- 총 ----------------
// 총 좌표계: 총구 -z, 위 +y. 원점 = 손잡이 위쪽.
export interface GunModel {
  root: THREE.Group; muzzle: THREE.Vector3; grip: THREE.Vector3; fore: THREE.Vector3 | null;
  mag: THREE.Object3D | null; action: THREE.Object3D | null; sightY: number; len: number;
}
export function makeGun(id: string): GunModel {
  const g = new THREE.Group();
  const r: GunModel = { root: g, muzzle: new THREE.Vector3(), grip: new THREE.Vector3(0, -0.055, 0.012), fore: null, mag: null, action: null, sightY: 0.08, len: 0.5 };
  const grp = (x: number, y: number, z: number) => { const o = new THREE.Group(); o.position.set(x, y, z); g.add(o); return o; };
  const rail = (y: number, z0: number, n: number, color = BLK) => { for (let i = 0; i < n; i++) box(0.021, 0.006, 0.012, color, 0, y, z0 - i * 0.03, g); };
  const trigger = (zc: number, yBot: number, len = 0.06, color = BLK) => { // 방아쇠울과 방아쇠
    box(0.006, 0.004, len, color, 0, yBot, zc, g); box(0.006, -yBot + 0.004, 0.004, color, 0, yBot / 2, zc - len / 2 + 0.002, g);
    const t = rbox(0.005, 0.024, 0.007, STEELD, 0, -0.024, zc + 0.004, g, 0.002); t.rotation.x = 0.3;
  };
  if (id === 'ar') {
    side([[-0.06, 0.03], [0.25, 0.03], [0.25, 0.066], [0.235, 0.076], [-0.06, 0.076]], 0.046, GUN, g); // 상부 몸통
    side([[-0.05, -0.014], [0.05, -0.014], [0.056, -0.042], [0.136, -0.042], [0.142, -0.014], [0.2, -0.014], [0.2, 0.03], [-0.05, 0.03]], 0.042, GUN, g); // 하부 몸통 + 탄창 삽입구
    box(0.004, 0.02, 0.07, DARK, 0.0235, 0.052, -0.1, g); // 탄피 배출구
    cyl(0.005, 0.05, STEELD, 'x', 0, 0.02, -0.02, g, 8); // 조정간 축
    rail(0.08, 0.04, 10); rbox(0.03, 0.009, 0.022, BLK, 0, 0.072, 0.066, g, 0.003); // 상단 레일, 장전 손잡이
    rbox(0.046, 0.052, 0.2, BLK, 0, 0.05, -0.35, g, 0.013); rail(0.079, -0.265, 6, GUN); // 총열 덮개
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) box(0.003, 0.012, 0.03, DARK, sx * 0.0232, 0.05, -0.28 - i * 0.045, g); // 방열 구멍
    cyl(0.0095, 0.14, STEELD, 'z', 0, 0.05, -0.52, g); cyl(0.013, 0.03, STEELD, 'z', 0, 0.05, -0.465, g, 10); // 총열, 가스 블록
    const fh = cyl(0.014, 0.05, BLK, 'z', 0, 0.05, -0.605, g, 10); fh.scale.x = 1; for (let i = 0; i < 3; i++) box(0.03, 0.004, 0.008, DARK, 0, 0.05, -0.59 - i * 0.012, g); // 소염기
    cyl(0.014, 0.17, STEELD, 'z', 0, 0.052, 0.135, g, 12); // 완충 튜브
    side([[-0.13, 0.074], [-0.275, 0.078], [-0.285, -0.035], [-0.262, -0.04], [-0.215, 0.018], [-0.13, 0.026]], 0.04, BLK, g, 0.005); // 개머리판
    side([[0.018, -0.012], [-0.022, -0.012], [-0.046, -0.11], [-0.004, -0.118]], 0.034, BLK, g, 0.006); // 권총 손잡이
    trigger(-0.045, -0.048);
    const mg = grp(0, -0.02, -0.095); side([[-0.027, 0.012], [0.027, 0.012], [0.05, -0.125], [-0.006, -0.138]], 0.026, 0x3a3d41, mg, 0.003); r.mag = mg; // 굽은 탄창
    box(0.022, 0.01, 0.02, BLK, 0, 0.086, 0, g); for (const sx of [-1, 1]) box(0.004, 0.02, 0.012, BLK, sx * 0.007, 0.096, 0, g); // 가늠자
    box(0.024, 0.01, 0.02, BLK, 0, 0.084, -0.42, g); box(0.003, 0.022, 0.006, BLK, 0, 0.097, -0.42, g); for (const sx of [-1, 1]) box(0.003, 0.016, 0.012, BLK, sx * 0.009, 0.094, -0.42, g); // 가늠쇠
    r.muzzle.set(0, 0.05, -0.63); r.fore = new THREE.Vector3(0, 0.018, -0.35); r.sightY = 0.1; r.len = 0.63;
  } else if (id === 'smg') {
    side([[-0.05, 0.0], [0.2, 0.0], [0.2, 0.07], [0.18, 0.08], [-0.05, 0.08]], 0.044, GUN, g); // 각진 몸통
    box(0.004, 0.02, 0.05, DARK, 0.0225, 0.05, -0.08, g); rail(0.084, 0.03, 7);
    rbox(0.012, 0.012, 0.03, STEELD, -0.026, 0.058, -0.12, g, 0.004); // 장전 손잡이
    cyl(0.019, 0.1, BLK, 'z', 0, 0.045, -0.25, g, 14); for (let i = 0; i < 3; i++) for (const a of [0, Math.PI / 2]) { const h = box(0.04, 0.008, 0.012, DARK, 0, 0.045, -0.222 - i * 0.028, g); h.rotation.z = a; } // 구멍 뚫린 총열 덮개
    cyl(0.009, 0.045, STEELD, 'z', 0, 0.045, -0.318, g, 10);
    rbox(0.03, 0.078, 0.032, BLK, 0, -0.038, -0.15, g, 0.011); // 수직 손잡이
    side([[0.018, 0.0], [-0.02, 0.0], [-0.042, -0.1], [-0.002, -0.106]], 0.032, BLK, g, 0.006);
    trigger(-0.045, -0.04);
    const mg = grp(0, -0.01, -0.07); side([[-0.02, 0.012], [0.02, 0.012], [0.024, -0.17], [-0.016, -0.17]], 0.022, 0x3a3d41, mg, 0.003); r.mag = mg; // 긴 직선 탄창
    for (const sx of [-1, 1]) cyl(0.005, 0.2, STEELD, 'z', sx * 0.02, 0.06, 0.145, g, 8); rbox(0.052, 0.09, 0.016, BLK, 0, 0.04, 0.25, g, 0.006); // 철사 개머리판
    box(0.02, 0.008, 0.016, BLK, 0, 0.09, 0.02, g); for (const sx of [-1, 1]) box(0.004, 0.016, 0.01, BLK, sx * 0.007, 0.098, 0.02, g);
    box(0.003, 0.02, 0.006, BLK, 0, 0.096, -0.17, g);
    r.muzzle.set(0, 0.045, -0.34); r.fore = new THREE.Vector3(0, -0.035, -0.15); r.sightY = 0.1; r.len = 0.36;
  } else if (id === 'shotgun') {
    side([[-0.02, -0.012], [0.2, -0.012], [0.2, 0.066], [0.02, 0.07], [-0.02, 0.05]], 0.046, GUN, g); // 몸통
    box(0.004, 0.02, 0.06, DARK, 0.0235, 0.04, -0.1, g);
    cyl(0.0125, 0.4, STEELD, 'z', 0, 0.052, -0.38, g); cyl(0.0125, 0.3, STEELD, 'z', 0, 0.022, -0.34, g, 12); cyl(0.0145, 0.014, BLK, 'z', 0, 0.022, -0.495, g, 10); // 총열, 관형 탄창
    rbox(0.036, 0.052, 0.012, STEELD, 0, 0.037, -0.47, g, 0.004); // 고정 밴드
    const pump = grp(0, 0.02, -0.3); rbox(0.046, 0.042, 0.13, WOOD, 0, 0, 0, pump, 0.015); for (let i = 0; i < 5; i++) box(0.0475, 0.03, 0.005, 0x543924, 0, 0, -0.045 + i * 0.0225, pump); r.action = pump; // 펌프
    side([[-0.02, 0.05], [-0.07, 0.04], [-0.12, 0.022], [-0.3, 0.03], [-0.31, -0.085], [-0.29, -0.09], [-0.14, -0.05], [-0.075, -0.06], [-0.05, -0.012], [-0.02, -0.012]], 0.04, WOOD, g, 0.007); // 나무 개머리판
    rbox(0.042, 0.125, 0.014, BLK, 0, -0.028, 0.312, g, 0.005); // 반동 패드
    trigger(-0.035, -0.046, 0.066);
    cyl(0.003, 0.008, 0xb08d3c, 'y', 0, 0.068, -0.57, g, 8); // 구슬 가늠쇠
    r.muzzle.set(0, 0.052, -0.58); r.fore = new THREE.Vector3(0, 0.0, -0.3); r.grip.set(0, -0.035, 0.045); r.sightY = 0.076; r.len = 0.58;
  } else if (id === 'sniper') {
    side([[0.3, 0.0], [0.3, 0.03], [-0.05, 0.03], [-0.09, 0.02], [-0.12, 0.045], [-0.33, 0.05], [-0.34, -0.06], [-0.31, -0.065], [-0.2, -0.02], [-0.1, -0.02], [-0.085, -0.11], [-0.045, -0.115], [-0.025, -0.02], [0.02, -0.012], [0.02, 0.0]], 0.042, OD, g, 0.006); // 일체형 총몸
    rbox(0.03, 0.022, 0.11, BLK, 0, 0.062, 0.2, g, 0.008); rbox(0.044, 0.115, 0.014, BLK, 0, -0.005, 0.343, g, 0.005); // 볼받침, 패드
    cyl(0.0165, 0.26, GUN, 'z', 0, 0.047, -0.07, g); // 노리쇠 뭉치
    cyl(0.013, 0.5, STEELD, 'z', 0, 0.047, -0.45, g, 14, 0.009); // 가늘어지는 총열
    rbox(0.03, 0.03, 0.052, BLK, 0, 0.047, -0.722, g, 0.007); for (let i = 0; i < 2; i++) box(0.034, 0.012, 0.01, DARK, 0, 0.047, -0.71 - i * 0.02, g); // 제퇴기
    cyl(0.0145, 0.24, BLK, 'z', 0, 0.108, -0.07, g); cyl(0.023, 0.07, BLK, 'z', 0, 0.108, -0.215, g, 16); cyl(0.019, 0.05, BLK, 'z', 0, 0.108, 0.07, g, 16); // 조준경
    cyl(0.021, 0.002, 0x4a6f8f, 'z', 0, 0.108, -0.2505, g, 16); cyl(0.017, 0.002, 0x4a6f8f, 'z', 0, 0.108, 0.0955, g, 16); // 렌즈
    cyl(0.009, 0.022, BLK, 'y', 0, 0.13, -0.07, g, 10); cyl(0.009, 0.022, BLK, 'x', 0.022, 0.108, -0.07, g, 10); // 조절 다이얼
    for (const z of [0.0, -0.14]) rbox(0.022, 0.052, 0.016, GUN, 0, 0.086, z, g, 0.005); // 조준경 링
    const bolt = new THREE.Group(); g.add(bolt); cyl(0.005, 0.04, STEEL, 'x', 0.035, 0.05, 0.04, bolt, 8);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), mat(BLK)); knob.position.set(0.058, 0.046, 0.04); bolt.add(knob); r.action = bolt; // 노리쇠 손잡이
    const mg = grp(0, -0.01, -0.11); rbox(0.03, 0.05, 0.07, BLK, 0, 0, 0, mg, 0.006); r.mag = mg;
    box(0.006, 0.004, 0.055, BLK, 0, -0.05, 0.0, g); const t = rbox(0.005, 0.022, 0.007, STEELD, 0, -0.032, 0.006, g, 0.002); t.rotation.x = 0.3;
    for (const sx of [-1, 1]) cyl(0.005, 0.16, BLK, 'z', sx * 0.016, -0.008, -0.2, g, 8); // 접은 양각대
    r.muzzle.set(0, 0.047, -0.75); r.fore = new THREE.Vector3(0, 0.008, -0.2); r.grip.set(0, -0.065, 0.056); r.sightY = 0.108; r.len = 0.75;
  } else if (id === 'pistol') {
    const sl = new THREE.Group(); g.add(sl);
    side([[-0.05, 0.022], [0.14, 0.022], [0.14, 0.05], [0.128, 0.058], [-0.05, 0.058]], 0.03, GUN, sl, 0.003); // 슬라이드
    for (let i = 0; i < 5; i++) box(0.031, 0.026, 0.003, DARK, 0, 0.04, 0.018 + i * 0.006, sl); // 후방 홈
    box(0.012, 0.004, 0.035, DARK, 0.008, 0.057, -0.04, sl); // 배출구
    box(0.014, 0.008, 0.006, BLK, 0, 0.062, 0.042, sl); box(0.004, 0.008, 0.006, 0xdcdcd4, 0, 0.062, -0.13, sl); // 가늠자, 가늠쇠
    r.action = sl;
    side([[0.135, 0.022], [0.135, 0.004], [0.07, 0.0], [0.02, -0.004], [0.012, -0.012], [-0.012, -0.1], [-0.055, -0.094], [-0.04, -0.02], [-0.058, 0.005], [-0.05, 0.022]], 0.028, BLK, g, 0.005); // 프레임 + 손잡이
    box(0.018, 0.006, 0.05, BLK, 0, -0.003, -0.105, g); // 하부 레일
    trigger(-0.045, -0.04, 0.052);
    cyl(0.007, 0.012, STEELD, 'z', 0, 0.04, -0.143, g, 10);
    const mg = grp(0, -0.05, 0.028); mg.rotation.x = 0.24; rbox(0.02, 0.1, 0.03, 0x3a3d41, 0, 0, 0, mg, 0.004); rbox(0.026, 0.01, 0.038, BLK, 0, -0.052, 0, mg, 0.003); r.mag = mg;
    r.muzzle.set(0, 0.04, -0.15); r.grip.set(0, -0.055, 0.025); r.sightY = 0.066; r.len = 0.2;
  } else {
    side([[-0.045, -0.012], [0.075, -0.012], [0.075, 0.07], [-0.02, 0.07], [-0.045, 0.05]], 0.022, STEEL, g, 0.003, [[-0.012, 0.006], [0.05, 0.006], [0.05, 0.056], [-0.012, 0.056]]); // 창이 뚫린 프레임
    const cy = grp(0, 0.031, -0.019); cyl(0.0225, 0.058, 0x8d9399, 'z', 0, 0, 0, cy, 18);
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; cyl(0.0065, 0.036, 0x565b61, 'z', Math.cos(a) * 0.021, Math.sin(a) * 0.021, -0.013, cy, 8); } r.action = cy; // 홈 파인 실린더
    cyl(0.0105, 0.15, STEEL, 'z', 0, 0.052, -0.15, g); rbox(0.014, 0.02, 0.12, STEEL, 0, 0.033, -0.135, g, 0.005); box(0.006, 0.006, 0.15, STEEL, 0, 0.064, -0.15, g); // 총열, 하부 러그, 리브
    box(0.003, 0.012, 0.02, BLK, 0, 0.072, -0.215, g); box(0.012, 0.006, 0.008, BLK, 0, 0.073, 0.03, g);
    const hm = rbox(0.008, 0.026, 0.012, 0x565b61, 0, 0.064, 0.044, g, 0.003); hm.rotation.x = -0.4; // 공이치기
    side([[-0.02, -0.012], [-0.05, 0.03], [-0.075, 0.01], [-0.07, -0.06], [-0.085, -0.11], [-0.045, -0.125], [-0.02, -0.07], [0.0, -0.012]], 0.03, WOOD, g, 0.008); // 나무 손잡이
    cyl(0.004, 0.031, 0xb08d3c, 'x', 0, -0.06, 0.055, g, 8); // 손잡이 나사
    trigger(-0.03, -0.046, 0.05, 0x9aa0a6);
    r.muzzle.set(0, 0.052, -0.226); r.grip.set(0, -0.06, 0.045); r.sightY = 0.078; r.len = 0.28;
  }
  return r;
}

// ---------------- 캐릭터 ----------------
export interface Avatar {
  root: THREE.Group; armR: THREE.Group; armL: THREE.Group; foreR: THREE.Group; foreL: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; shinL: THREE.Group; shinR: THREE.Group; head: THREE.Group;
  hold: THREE.Group; setWeapon(id: string): void;
}
export function makeAvatar(team: number): Avatar {
  const uniC = team === 0 ? 0x2a3a52 : 0x7d6444, pantC = team === 0 ? 0x222e42 : 0x66523a, mark = team === 0 ? 0x3f86ff : 0xff7a2a;
  const FACE = 0xc79a78, GEAR = 0x25282b, POUCH = 0x33373a;
  const uni = fabric(uniC), pant = fabric(pantC);
  const markMat = surface({ color: mark, emissive: mark, emissiveIntensity: 0.55, roughness: 0.6 });
  const band = (w: number, h: number, d: number, parent: THREE.Object3D, x: number, y: number, z: number) => rbox(w, h, d, 0, x, y, z, parent, Math.min(w, h, d) * 0.3, markMat);
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  // 몸통
  rbox(0.34, 0.2, 0.22, 0, 0, 0.93, 0, root, 0.07, pant);
  rbox(0.38, 0.44, 0.22, 0, 0, 1.2, 0, root, 0.08, uni);
  rbox(0.36, 0.31, 0.27, GEAR, 0, 1.2, 0, root, 0.05); // 방탄 조끼
  for (let i = 0; i < 3; i++) { rbox(0.092, 0.115, 0.05, POUCH, -0.112 + i * 0.112, 1.1, -0.152, root, 0.012); box(0.07, 0.03, 0.004, GEAR, -0.112 + i * 0.112, 1.14, -0.178, root); } // 탄입대
  rbox(0.29, 0.3, 0.06, POUCH, 0, 1.22, 0.15, root, 0.02); rbox(0.05, 0.12, 0.045, BLK, -0.13, 1.33, 0.16, root, 0.01); cyl(0.004, 0.14, BLK, 'y', -0.13, 1.45, 0.16, root, 6); // 등판, 무전기
  rbox(0.37, 0.06, 0.255, BLK, 0, 1.0, 0, root, 0.015); rbox(0.06, 0.15, 0.09, BLK, 0.2, 0.9, 0.0, root, 0.015); rbox(0.07, 0.09, 0.05, POUCH, -0.19, 0.95, -0.04, root, 0.012); // 벨트, 권총집, 파우치
  for (const sx of [-1, 1]) { rbox(0.05, 0.14, 0.03, GEAR, sx * 0.11, 1.4, -0.03, root, 0.01); const s = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 10), uni); s.position.set(sx * 0.25, 1.385, 0); root.add(s); } // 어깨끈, 어깨
  band(0.09, 0.06, 0.008, root, 0.11, 1.3, -0.137); band(0.2, 0.09, 0.008, root, 0, 1.24, 0.182); // 가슴·등 표식
  cyl(0.047, 0.09, FACE, 'y', 0, 1.46, 0, root, 12);
  // 머리
  const head = new THREE.Group(); head.position.set(0, 1.47, 0); root.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), mat(FACE)); face.position.y = 0.135; face.scale.set(0.95, 1.12, 1); head.add(face);
  rbox(0.03, 0.034, 0.03, FACE, 0, 0.12, -0.105, head, 0.012); // 코
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(pantC)); helmet.position.y = 0.155; helmet.scale.set(1, 1.02, 1.1); head.add(helmet);
  band(0.283, 0.028, 0.31, head, 0, 0.165, 0); // 헬멧 띠
  for (const sx of [-1, 1]) { rbox(0.012, 0.03, 0.12, GEAR, sx * 0.136, 0.2, 0.0, head, 0.004); rbox(0.034, 0.075, 0.065, BLK, sx * 0.118, 0.115, 0.015, head, 0.014); } // 측면 레일, 헤드셋
  rbox(0.05, 0.04, 0.03, GEAR, 0, 0.235, -0.145, head, 0.008); // 야간 투시경 받침
  rbox(0.19, 0.055, 0.04, 0x15171a, 0, 0.155, -0.092, head, 0.016); // 고글
  box(0.012, 0.1, 0.004, GEAR, 0.085, 0.07, -0.06, head).rotation.z = 0.25; box(0.012, 0.1, 0.004, GEAR, -0.085, 0.07, -0.06, head).rotation.z = -0.25; // 턱끈
  // 팔: 어깨 → 팔꿈치 → 손
  const arm = (sx: number) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.262, 1.36, 0); root.add(sh);
    capsule(0.058, 0.3, uni, sh, 0, -0.14, 0); band(0.128, 0.06, 0.128, sh, 0, -0.13, 0); // 완장
    const el = new THREE.Group(); el.position.set(0, -0.28, 0); sh.add(el);
    capsule(0.05, 0.27, uni, el, 0, -0.125, 0); rbox(0.075, 0.09, 0.03, GEAR, 0, 0.0, 0.045, el, 0.012); // 팔꿈치 보호대
    rbox(0.07, 0.09, 0.05, GLOVE, 0, -0.29, 0, el, 0.02); // 장갑 낀 손
    return [sh, el] as const;
  };
  const [armL, foreL] = arm(-1), [armR, foreR] = arm(1);
  // 다리: 골반 → 무릎 → 발
  const leg = (sx: number) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0.87, 0); root.add(hip);
    capsule(0.082, 0.46, pant, hip, 0, -0.21, 0); if (sx > 0) rbox(0.05, 0.12, 0.1, POUCH, 0.085, -0.2, 0, hip, 0.015); // 허벅지 파우치
    const kn = new THREE.Group(); kn.position.set(0, -0.44, 0); hip.add(kn);
    capsule(0.066, 0.4, pant, kn, 0, -0.19, 0); rbox(0.11, 0.12, 0.05, GEAR, 0, 0.0, -0.062, kn, 0.02); // 무릎 보호대
    rbox(0.115, 0.13, 0.15, BLK, 0, -0.355, 0.0, kn, 0.03); rbox(0.112, 0.07, 0.27, BLK, 0, -0.39, -0.05, kn, 0.03); box(0.116, 0.02, 0.275, DARK, 0, -0.422, -0.05, kn); // 전투화
    return [hip, kn] as const;
  };
  const [legL, shinL] = leg(-1), [legR, shinR] = leg(1);
  const hold = new THREE.Group(); hold.position.set(0, -0.3, -0.02); hold.rotation.x = -Math.PI / 2; foreR.add(hold);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return {
    root, armR, armL, foreR, foreL, legL, legR, shinL, shinR, head, hold,
    setWeapon(id) {
      hold.clear();
      let m: THREE.Object3D;
      if (id === 'knife') { m = makeKnife().root; m.rotation.y = Math.PI / 2; }
      else if (id === 'karambit') { m = makeKarambit().root; m.rotation.set(Math.PI, Math.PI / 2, 0); m.position.set(0, 0, 0.03); }
      else if (id === 'balisong') { m = makeBalisong().root; m.rotation.y = Math.PI / 2; }
      else { const gm = makeGun(id); m = gm.root; m.position.set(0, -gm.grip.y, -gm.grip.z); }
      m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      hold.add(m);
    },
  };
}
