import * as THREE from 'three';
import { BOXES, MAP, ZONE } from '../shared/map';
import { mat } from './models';

function studTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.07)'; g.beginPath(); g.arc(32, 34, 13, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(32, 31, 13, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 60, 140);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa9c4e8, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4d6, 2.0);
  sun.position.set(-14, 30, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const tex = studTexture();
  const floor = (x0: number, z0: number, x1: number, z1: number, color: number, y: number) => {
    const t = tex.clone(); t.repeat.set(x1 - x0, z1 - z0); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color, map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
  };
  const X = MAP.halfX, Z = MAP.halfZ;
  floor(-X, -Z, X, Z, 0xfff3d6, 0);
  floor(-15, -6.5, 15, 6.5, ZONE.mid, 0.004); // 중앙로: 레몬
  floor(-X, -Z, X, -7.5, ZONE.north, 0.004); // 북쪽 길: 민트
  floor(-X, 7.5, X, Z, ZONE.south, 0.004); // 남쪽 길: 라일락
  floor(-X, -6.5, -16.6, 6.5, ZONE.blue, 0.006);
  floor(16.6, -6.5, X, 6.5, ZONE.orange, 0.006);

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x26304f, transparent: true, opacity: 0.35 });
  const unit = new THREE.BoxGeometry(1, 1, 1), unitEdges = new THREE.EdgesGeometry(unit);
  for (const b of BOXES) {
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
    const m = new THREE.Mesh(unit, mat(b.color));
    m.scale.set(w, h, d); m.position.set(b.min[0] + w / 2, b.min[1] + h / 2, b.min[2] + d / 2);
    m.castShadow = h < 6; m.receiveShadow = true; scene.add(m);
    const e = new THREE.LineSegments(unitEdges, edgeMat); e.scale.copy(m.scale); e.position.copy(m.position); scene.add(e);
  }
  // 바깥 구름 블록
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 55 + (i % 3) * 14;
    const c = new THREE.Mesh(unit, mat(0xffffff)); c.scale.set(10 + (i % 4) * 4, 3, 6);
    c.position.set(Math.cos(a) * r, 16 + (i % 5) * 4, Math.sin(a) * r); scene.add(c);
  }
}
