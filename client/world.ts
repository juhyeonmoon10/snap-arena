// 맵 외형: 해 질 녘의 화물 창고 마당. 콘크리트·컨테이너·합판 상자 질감은 전부 캔버스로 직접 그린다.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BOXES, MAP } from '../shared/map';
import { LOW, surface } from './fx';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function speckle(g: CanvasRenderingContext2D, s: number, n: number, dark: number, light: number) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * dark})` : `rgba(255,255,255,${rnd() * light})`;
    g.fillStyle = v; const r = 1 + rnd() * 2.5; g.fillRect(rnd() * s, rnd() * s, r, r);
  }
}
function stains(g: CanvasRenderingContext2D, s: number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = 20 + rnd() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a * rnd()})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const texConcrete = (base: string) => canvasTex(512, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s); stains(g, s, 26, 0.16); speckle(g, s, 9000, 0.16, 0.1);
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2); // 타설 줄눈
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1;
  for (let i = 0; i < 4; i++) { g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 60; y += rnd() * 40; g.lineTo(x, y); } g.stroke(); }
});
const texContainer = (base: string) => canvasTex(512, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 32) { // 골판 주름
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = gr; g.fillRect(x, 0, 32, s);
  }
  for (let i = 0; i < 40; i++) { // 녹 자국
    const x = rnd() * s, y = rnd() * s, h = 20 + rnd() * 90;
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(96,52,24,${0.35 * rnd()})`); gr.addColorStop(1, 'rgba(96,52,24,0)');
    g.fillStyle = gr; g.fillRect(x, y, 3 + rnd() * 10, h);
  }
  speckle(g, s, 3000, 0.15, 0.06);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 10, s, 10);
});
const texWood = () => canvasTex(512, (g, s) => {
  g.fillStyle = '#8a6a44'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 3) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,24,8' : '255,230,190'},${rnd() * 0.12})`; g.fillRect(0, y, s, 2 + rnd() * 2); }
  g.fillStyle = 'rgba(30,18,6,0.55)';
  for (let i = 0; i <= 4; i++) g.fillRect(0, (i * s) / 4 - 3, s, 6); // 판재 이음
  g.fillStyle = '#6e5333'; g.fillRect(0, 0, 44, s); g.fillRect(s - 44, 0, 44, s); g.fillRect(0, 0, s, 44); g.fillRect(0, s - 44, s, 44); // 테두리 각재
  speckle(g, s, 2500, 0.2, 0.05);
});
const texAsphalt = () => canvasTex(512, (g, s) => { g.fillStyle = '#4b4d4f'; g.fillRect(0, 0, s, s); stains(g, s, 30, 0.22); speckle(g, s, 16000, 0.3, 0.16); });

// 맵 데이터의 구역 색 → 실제 재질
type Kind = { tex: THREE.Texture; tile: number; rough: number; metal: number };
function kinds(): Record<number, Kind> {
  const cont = (c: string): Kind => ({ tex: texContainer(c), tile: 2.6, rough: 0.62, metal: 0.35 });
  const conc = (c: string): Kind => ({ tex: texConcrete(c), tile: 3, rough: 0.95, metal: 0 });
  return {
    0xfff3d6: conc('#9a9892'), // 외벽
    0x4f8dff: cont('#2f4a73'), // 블루 진영 컨테이너
    0xff8a3d: cont('#a3532a'), // 오렌지 진영 컨테이너
    0xffc61a: conc('#a8a08a'), // 중앙 콘크리트 구조물
    0x1fc79a: cont('#44604b'), // 북쪽 길: 녹색 컨테이너
    0x8e6bf2: cont('#4a5368'), // 남쪽 길: 청회색 컨테이너
    0xffffff: { tex: texWood(), tile: 1.2, rough: 0.85, metal: 0 }, // 합판 상자
    0xff5d73: cont('#7a2f26'), // 중앙 기둥: 붉은 철제
  };
}
/** 면 크기에 맞춰 UV를 늘려 질감이 늘어지지 않게 한 상자 */
function texturedBox(w: number, h: number, d: number, tile: number) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile); }
  return geo;
}

export function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  // 하늘: 저녁빛 그러데이션
  const sky = canvasTex(256, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, '#5f86b4'); gr.addColorStop(0.45, '#b7c6d4'); gr.addColorStop(0.62, '#ecd6b4'); gr.addColorStop(1, '#c9b79a');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping; sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.fog = new THREE.Fog(0xcdbfa8, 45, 190);
  if (!LOW) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    scene.environmentIntensity = 0.45;
  }

  scene.add(new THREE.HemisphereLight(0xbfd2ea, 0x6b5f4e, LOW ? 1.5 : 0.9));
  const sun = new THREE.DirectionalLight(0xffdcae, 3.1);
  sun.position.set(-26, 24, 16); sun.castShadow = !LOW;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const X = MAP.halfX, Z = MAP.halfZ;
  const flat = (x0: number, z0: number, x1: number, z1: number, m: THREE.Material, y: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
    p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); p.receiveShadow = true; scene.add(p); return p;
  };
  // 바닥: 아스팔트 + 중앙로는 밝은 콘크리트
  const asph = texAsphalt(); asph.repeat.set(X / 2, Z / 2);
  flat(-X, -Z, X, Z, surface({ map: asph, roughness: 0.96 }), 0);
  const slab = texConcrete('#8d8a82'); slab.repeat.set(10, 4.33);
  flat(-15, -6.5, 15, 6.5, surface({ map: slab, roughness: 0.93 }), 0.004);
  // 길 구분 도색: 중앙 노랑, 북 초록, 남 파랑, 진영 앞 팀 색
  const paint = (x0: number, z0: number, x1: number, z1: number, color: number) =>
    flat(x0, z0, x1, z1, surface({ color, roughness: 0.8, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -2 }), 0.008);
  paint(-15, -6.5, 15, -6.3, 0xd9a520); paint(-15, 6.3, 15, 6.5, 0xd9a520);
  for (let x = -14; x < 14; x += 2.4) { paint(x, -0.1, x + 1.2, 0.1, 0xd9a520); }
  paint(-X, -8.0, X, -7.8, 0x4f9a63); paint(-X, -14.9, X, -14.7, 0x4f9a63);
  paint(-X, 7.8, X, 8.0, 0x5677b8); paint(-X, 14.7, X, 14.9, 0x5677b8);
  paint(-21.9, -5, -16.8, -4.8, 0x3f86ff); paint(-21.9, 4.8, -16.8, 5, 0x3f86ff); paint(-17, -5, -16.8, 5, 0x3f86ff);
  paint(16.8, -5, 21.9, -4.8, 0xff7a2a); paint(16.8, 4.8, 21.9, 5, 0xff7a2a); paint(16.8, -5, 17, 5, 0xff7a2a);
  // 바닥 스텐실 글자
  const stencil = (text: string, x: number, z: number, color: string, rot: number) => {
    const t = canvasTex(256, (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = color; g.font = '700 150px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, s / 2, s / 2 + 8); });
    const p = flat(x - 2.2, z - 2.2, x + 2.2, z + 2.2, surface({ map: t, transparent: true, opacity: 0.75, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }), 0.01);
    p.rotation.z = rot;
  };
  stencil('N', -13, -11.3, '#6fbf83', -Math.PI / 2); stencil('N', 13, -11.3, '#6fbf83', Math.PI / 2);
  stencil('S', -13, 11.3, '#7f9fe0', -Math.PI / 2); stencil('S', 13, 11.3, '#7f9fe0', Math.PI / 2);
  stencil('MID', -11.5, 0, '#e6b730', -Math.PI / 2); stencil('MID', 11.5, 0, '#e6b730', Math.PI / 2);

  const K = kinds();
  const matCache = new Map<number, THREE.Material>();
  for (const b of BOXES) {
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
    const k = K[b.color] ?? K[0xfff3d6];
    let m = matCache.get(b.color);
    if (!m) { m = surface({ map: k.tex, roughness: k.rough, metalness: k.metal }); matCache.set(b.color, m); }
    const mesh = new THREE.Mesh(texturedBox(w, h, d, k.tile), m);
    mesh.position.set(b.min[0] + w / 2, b.min[1] + h / 2, b.min[2] + d / 2);
    mesh.castShadow = h < 6.5; mesh.receiveShadow = true; scene.add(mesh);
  }
  // 담장 위 철제 난간과 조명탑, 바깥의 창고 건물 실루엣
  const dark = surface({ color: 0x2b2e31, roughness: 0.6, metalness: 0.6 });
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = dark) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); scene.add(o); return o; };
  add(46.4, 0.12, 0.12, 0, MAP.wallH + 0.9, -15.5); add(46.4, 0.12, 0.12, 0, MAP.wallH + 0.9, 15.5);
  for (let x = -22; x <= 22; x += 4) { add(0.1, 0.9, 0.1, x, MAP.wallH + 0.45, -15.5); add(0.1, 0.9, 0.1, x, MAP.wallH + 0.45, 15.5); }
  const lampMat = surface({ color: 0xfff1d0, emissive: 0xffe2b0, emissiveIntensity: 2 });
  for (const [x, z] of [[-22.5, -15.5], [22.5, -15.5], [-22.5, 15.5], [22.5, 15.5]]) { add(0.3, 6, 0.3, x, MAP.wallH + 3, z); add(1.6, 0.5, 0.9, x * 0.985, MAP.wallH + 6, z * 0.97, lampMat); }
  const shed = surface({ color: 0x6f7377, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3, r = 62 + (i % 3) * 16, h = 12 + (i % 4) * 5;
    add(22 + (i % 3) * 8, h, 16, Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, shed);
  }
  flat(-260, -260, 260, 260, surface({ color: 0x5d5b55, roughness: 1 }), -0.05);
}
