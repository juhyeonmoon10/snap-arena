// 맵 검증: 점대칭, 스폰 간 시야 차단, 첫 교전 위치까지 걸리는 시간.  실행: npx tsx tests/map-check.ts
import { BOXES, SPAWNS, MAP } from '../shared/map';
import { MOVE } from '../shared/config';
import { rayMap } from '../shared/sim';

let bad = 0;
const ok = (c: boolean, m: string) => { console.log(c ? '  ✓' : '  ✗ 실패:', m); if (!c) bad++; };
// 1) 점대칭
const key = (b: { min: number[]; max: number[] }) => [...b.min, ...b.max].map((v) => v.toFixed(2)).join(',');
const set = new Set(BOXES.map(key));
ok(BOXES.every((b) => set.has(key({ min: [-b.max[0], b.min[1], -b.max[2]], max: [-b.min[0], b.max[1], -b.min[2]] }))), `블록 ${BOXES.length}개가 모두 180도 회전 대칭 짝을 가짐`);
// 2) 스폰 구역끼리 시야 차단 (서 있을 때 눈높이 ~ 점프 최고점)
let seen = 0, n = 0;
const jumpTop = MOVE.jump * MOVE.jump / (2 * MOVE.gravity);
for (let ax = -21.5; ax <= -16.8; ax += 0.6) for (let az = -4.5; az <= 4.5; az += 0.75)
  for (let bx = 16.8; bx <= 21.5; bx += 0.6) for (let bz = -4.5; bz <= 4.5; bz += 0.75)
    for (const h of [MOVE.eye, MOVE.eye + jumpTop]) for (const th of [0.3, 1.0, MOVE.height, MOVE.height + jumpTop]) {
      const o = [ax, h, az], d = [bx - ax, th - h, bz - az], len = Math.hypot(d[0], d[1], d[2]);
      n++; if (rayMap(o, d.map((v) => v / len)) >= len - 1e-6) seen++;
    }
ok(seen === 0, `스폰 구역 사이 시야 ${n}개 표본 중 뚫린 선 ${seen}개 (점프 최고 눈높이 ${(MOVE.eye + jumpTop).toFixed(2)}m 포함)`);
// 3) 이동 시간: 격자 최단 경로로 각 팀 스폰에서 주요 교전 지점까지
const cell = 0.25, W = Math.round((MAP.halfX * 2) / cell), H = Math.round((MAP.halfZ * 2) / cell);
const free = (i: number, j: number) => {
  const x = -MAP.halfX + (i + 0.5) * cell, z = -MAP.halfZ + (j + 0.5) * cell, r = MOVE.radius;
  return !BOXES.some((b) => b.max[1] > MOVE.step && x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]);
};
function dist(from: number[]) {
  const d = new Float32Array(W * H).fill(Infinity), q: number[] = [];
  const s = Math.floor((from[0] + MAP.halfX) / cell) + Math.floor((from[1] + MAP.halfZ) / cell) * W;
  d[s] = 0; q.push(s);
  const done = new Uint8Array(W * H);
  for (;;) { // 단순 다익스트라
    let best = -1, bd = Infinity;
    for (const k of q) if (!done[k] && d[k] < bd) { bd = d[k]; best = k; }
    if (best < 0) break;
    done[best] = 1; q.splice(q.indexOf(best), 1);
    const i = best % W, j = (best - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b2 = j + dj; if (a < 0 || b2 < 0 || a >= W || b2 >= H || !free(a, b2)) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
      const k = a + b2 * W, nd = d[best] + cell * Math.hypot(di, dj);
      if (nd < d[k]) { d[k] = nd; if (!q.includes(k)) q.push(k); }
    }
  }
  return (x: number, z: number) => d[Math.floor((x + MAP.halfX) / cell) + Math.floor((z + MAP.halfZ) / cell) * W];
}
const dA = dist(SPAWNS[0][0]), dB = dist(SPAWNS[1][0]);
for (const [name, x, z] of [['중앙 단상 앞', -3.5, -4.5], ['북쪽 길 고지대 앞', -6, -9.5], ['남쪽 길 고지대 앞', -6, 9.5]] as [string, number, number][]) {
  const a = dA(x, z) / MOVE.sprint, b = dB(-x, -z) / MOVE.sprint;
  ok(Math.abs(a - b) < 0.15 && isFinite(a), `${name}: 블루 ${a.toFixed(1)}초 / 오렌지(대칭 지점) ${b.toFixed(1)}초 (질주 기준)`);
}
const mid = dA(0, -3.2) / MOVE.sprint, midB = dB(0, 3.2) / MOVE.sprint;
ok(Math.abs(mid - midB) < 0.15, `맵 정중앙 옆 통로까지: 블루 ${mid.toFixed(1)}초 / 오렌지 ${midB.toFixed(1)}초`);
process.exit(bad ? 1 : 0);
