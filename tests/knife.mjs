// 칼 1인칭 연출 검증: 꺼내기 → 질주 → F 살펴보기 → 살펴보기 도중 공격 → 총기로 교체를 반복하며
// 프레임마다 자세 채널을 기록해 "튀는 프레임"(한 프레임에 비정상적으로 큰 변화)이 없는지 본다.
import { launch, sleep, URL } from './lib.mjs';
const full = process.argv.includes('--shots');
const b = await launch();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ 실패:', m); } };
for (const knife of ['karambit', 'balisong', 'knife']) {
  console.log(`\n[${knife}]`);
  const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
  await ctx.addInitScript((k) => localStorage.setItem('snap.loadout', JSON.stringify(['ar', 'pistol', k])), knife);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(URL + (full ? '' : '?fx=low')); await p.fill('#nick', '검수'); await p.click('#practice');
  await p.waitForFunction(() => window.__snap.debugState().x !== undefined);
  // 프레임 기록기
  await p.evaluate(() => {
    const g = window.__snap; g.dbg.on = true; document.getElementById('pause').hidden = true;
    window.__rec = []; let last = performance.now();
    const loop = () => { const n = performance.now(); window.__rec.push({ t: n, dt: n - last, clip: g.vm.clip, rig: g.vm.rig?.id, p: g.vm.poseArray() }); last = n; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const act = (fn, arg) => p.evaluate(fn, arg);
  const shot = async (n) => { if (full) await p.screenshot({ path: `tests/shots/k_${knife}_${n}.jpg`, type: 'jpeg', quality: 75 }); };
  const state = () => act(() => window.__snap.debugState());
  for (let rep = 0; rep < 3; rep++) {
    await act(() => window.__snap.setSlot(2)); await sleep(120); await shot(`${rep}_1draw`);
    await sleep(600);
    if (rep === 0) ok((await state()).rig === knife, '3번으로 칼 꺼내기');
    await act(() => { const g = window.__snap; g.yaw = -Math.PI / 2 + 0.9; g.dbg.f = 1; g.dbg.sprint = true; }); await sleep(450); await shot(`${rep}_2sprint`);
    await act(() => { const g = window.__snap; g.dbg.f = 0; g.dbg.sprint = false; }); await sleep(200);
    await act(() => window.__snap.inspect()); await sleep(380);
    if (rep === 0) ok((await state()).clip === 'inspect', 'F 살펴보기 재생');
    await shot(`${rep}_3inspect`);
    await act(() => { window.__snap.dbg.fire = true; }); await sleep(70);
    const s1 = await state();
    if (rep === 0) ok(s1.clip.startsWith('attack'), `살펴보기 도중 공격 입력이 바로 먹음 (현재 동작: ${s1.clip})`);
    await sleep(60); await shot(`${rep}_4attack`);
    await act(() => { window.__snap.dbg.fire = false; }); await sleep(120);
    await act(() => window.__snap.setSlot(0)); await sleep(100);
    const s2 = await state();
    if (rep === 0) ok(s2.rig === 'ar', '공격 직후 총기 교체가 바로 먹음');
    await shot(`${rep}_5gun`); await sleep(500);
  }
  // 반복 입력: 살펴보기 연타, 공격/살펴보기/교체 뒤섞기
  await act(() => window.__snap.setSlot(2)); await sleep(700);
  for (let i = 0; i < 8; i++) { await act(() => window.__snap.inspect()); await sleep(60); }
  for (let i = 0; i < 6; i++) {
    await act(() => window.__snap.inspect()); await sleep(90);
    await act(() => { window.__snap.dbg.fire = true; }); await sleep(50); await act(() => { window.__snap.dbg.fire = false; });
    await act((i) => window.__snap.setSlot(i % 2 ? 2 : 1), i); await sleep(70);
  }
  await act(() => window.__snap.setSlot(2)); await sleep(2200);
  const end = await act(() => { const g = window.__snap; const c = g.vm.poseArray().slice(0, 17), i = g.vm.idleArray(); return { clip: g.vm.clip, rig: g.vm.rig.id, d: Math.max(...c.map((v, k) => { let x = Math.abs(v - i[k]); if (k === 14) x = Math.abs(x - Math.round(x / (2 * Math.PI)) * 2 * Math.PI); return x; })) }; });
  ok(end.clip === 'idle' && end.rig === knife && end.d < 1e-3, `반복 입력 뒤 기본 자세로 정확히 복귀 (동작 ${end.clip}, 자세 오차 ${end.d.toExponential(1)})`);
  // 튀는 프레임 검사: 같은 장비 안에서 프레임 간 변화 속도
  const rec = await act(() => window.__rec);
  let worstPos = 0, worstRot = 0, worstAt = '', n = 0, slash = 0, draw = 0;
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1], c = rec[i];
    if (a.rig !== c.rig || !a.p.length || !c.p.length) continue; // 장비 교체는 새 모델이 아래에서 올라온다
    const dt = Math.max(c.dt, 8) / 1000; n++;
    const pos = Math.hypot(c.p[0] + c.p[17] - a.p[0] - a.p[17], c.p[1] + c.p[18] - a.p[1] - a.p[18], c.p[2] + c.p[19] - a.p[2] - a.p[19]) / dt;
    let rot = 0; for (const k of [3, 4, 5, 6, 7, 8]) rot = Math.max(rot, Math.abs(c.p[k] - a.p[k]) / dt);
    if (a.clip === c.clip && c.clip.startsWith('attack')) { if (pos > slash) slash = pos; continue; } // 베기 자체는 빠른 동작
    if (a.clip === c.clip && c.clip === 'draw') { if (pos > draw) draw = pos; continue; } // 꺼내기는 화면 아래에서 빠르게 올라온다
    if (pos > worstPos) { worstPos = pos; worstAt = `${a.clip}→${c.clip}`; }
    if (rot > worstRot) worstRot = rot;
  }
  console.log(`  · ${n}프레임 기록, 전환·대기·살펴보기 최대 이동 속도 ${worstPos.toFixed(2)} m/s (${worstAt}), 최대 회전 속도 ${worstRot.toFixed(1)} rad/s, 베기 ${slash.toFixed(1)} m/s, 꺼내기 ${draw.toFixed(1)} m/s`);
  ok(worstPos < 4.5, '동작 전환·대기·살펴보기에서 손 위치가 한 프레임에 튀지 않음 (4.5 m/s 미만)');
  ok(worstRot < 40, '손·손목 회전이 한 프레임에 뒤집히지 않음 (40 rad/s 미만)');
  ok(errors.length === 0, '브라우저 오류 없음' + errors.join('|'));
  await ctx.close();
}
await b.close();
console.log(`\n결과: 통과 ${pass}, 실패 ${fail}`);
process.exit(fail ? 1 : 0);
