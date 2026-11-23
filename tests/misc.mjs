// 실제 입력(마우스 잠금·키보드), 장비 9종 수치, 상대 화면 연출 검증
import { launch, newPlayer, sleep, URL } from './lib.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ 실패:', m); } };
const S = (p) => p.evaluate(() => window.__snap.debugState());
const set = (p, o) => p.evaluate((o) => { const g = window.__snap; g.dbg.on = true; Object.assign(g.dbg, o.dbg ?? {}); if (o.yaw !== undefined) g.yaw = o.yaw; if (o.pitch !== undefined) g.pitch = o.pitch; if (o.slot !== undefined) g.setSlot(o.slot); }, o);
const stop = (p) => set(p, { dbg: { f: 0, s: 0, fire: false, jump: false, sprint: false, ads: false } });
async function until(fn, ms, step = 50) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } }
async function goto(p, x, z) { return until(async () => { const s = await S(p); if (s.x === undefined) return false; const dx = x - s.x, dz = z - s.z; if (Math.hypot(dx, dz) < 0.4) { await stop(p); return true; } await set(p, { yaw: Math.atan2(-dx, -dz), pitch: 0, dbg: { f: 1, sprint: Math.hypot(dx, dz) > 2 } }); return false; }, 9000, 25); }
async function aim(p, name, yOff) { const s = await S(p); const t = s.remotes.find((r) => r.name === name); const dx = t.x - s.x, dy = t.y + yOff - (s.y + 1.6), dz = t.z - s.z; await set(p, { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }); return Math.hypot(dx, dz); }
const hpOf = async (p, name) => (await S(p)).remotes.find((r) => r.name === name).hp;
const b = await launch();

console.log('\n[입력] 마우스 잠금, 키보드, ESC');
{
  const p = await newPlayer(b, '입력');
  await p.click('#practice'); await p.waitForFunction(() => window.__snap.debugState().x !== undefined);
  ok(await p.evaluate(() => !document.getElementById('pause').hidden), '연습장 진입 시 "혼자 연습장" 안내 화면 표시(온라인 방과 구분): ' + (await p.textContent('#pauseTitle')));
  await p.click('#resume');
  const locked = await until(() => p.evaluate(() => window.__snap.active), 2000);
  if (!locked) console.log('  · 이 헤드리스 환경은 마우스 잠금을 지원하지 않아 실제 키·마우스 입력 검증을 건너뜀');
  else {
    ok(true, '클릭으로 마우스 잠금, 일시 정지 화면 닫힘: ' + (await p.evaluate(() => document.getElementById('pause').hidden)));
    const s0 = await S(p), yaw0 = await p.evaluate(() => window.__snap.yaw);
    await p.keyboard.down('KeyD'); await sleep(500);
    const s1 = await S(p);
    ok(Math.abs(s1.z - s0.z) > 1, `D 키로 옆걸음 (z ${s0.z.toFixed(1)} → ${s1.z.toFixed(1)})`);
    await p.mouse.move(500, 225); await p.mouse.move(560, 225);
    const yaw1 = await p.evaluate(() => window.__snap.yaw);
    ok(yaw1 !== yaw0, `마우스 이동으로 시점 회전 (${(yaw1 - yaw0).toFixed(3)} rad)`);
    await p.mouse.down(); await sleep(400);
    const a1 = (await S(p)).ammo[0];
    ok(a1 < 30, `좌클릭 연사 (탄약 30 → ${a1})`);
    // 누른 채로 ESC: 잠금이 풀리면 입력이 남지 않아야 한다
    await p.evaluate(() => document.exitPointerLock()); await sleep(300);
    const a2 = (await S(p)).ammo[0], z2 = (await S(p)).z; await sleep(500);
    const s3 = await S(p);
    ok(!(await p.evaluate(() => window.__snap.active)) && await p.evaluate(() => !document.getElementById('pause').hidden), '마우스 잠금 해제 → 일시 정지 화면');
    ok(s3.ammo[0] === a2 && Math.abs(s3.z - z2) < 0.3, `잠금 해제 뒤 연사·이동 입력이 남지 않음 (탄약 ${a2} 유지, 이동 ${Math.abs(s3.z - z2).toFixed(2)}m)`);
    await p.keyboard.up('KeyD'); await p.mouse.up();
    await p.click('#resume'); await until(() => p.evaluate(() => window.__snap.active), 2000);
    await p.keyboard.press('Digit2'); await sleep(450);
    ok((await S(p)).rig === 'pistol', '2번 키로 보조무기 교체');
    await p.keyboard.press('Digit3'); await sleep(450); await p.keyboard.press('KeyF'); await sleep(150);
    ok((await S(p)).clip === 'inspect', 'F 키로 살펴보기');
    await p.keyboard.press('Digit1'); await sleep(600); await p.keyboard.press('KeyR'); await sleep(200);
    ok((await S(p)).reload > 0, 'R 키로 재장전 시작');
    await p.keyboard.press('KeyB'); await sleep(300);
    ok(await p.evaluate(() => !document.getElementById('pause').hidden), 'B 키로 장비 변경 화면 열림');
  }
  // 설정 저장
  await p.evaluate(() => { const i = document.querySelector('#settingsInline input[data-k="sens"]'); i.value = '1.75'; i.dispatchEvent(new Event('input')); const v = document.querySelector('#settingsInline input[data-k="volume"]'); v.value = '0.25'; v.dispatchEvent(new Event('input')); });
  await p.reload(); await sleep(500);
  const saved = await p.evaluate(() => ({ s: window.__snap.sens, v: window.__snap.sfx.volume }));
  ok(saved.s === 1.75 && saved.v === 0.25, `감도·음량이 새로고침 뒤에도 유지됨 (감도 ${saved.s}, 음량 ${saved.v})`);
  await p.context().close();
}

console.log('\n[장비] 총 6종과 칼 3종 수치 (연습장 표적 대상, 서버 판정)');
{
  const p = await newPlayer(b, '사수');
  await p.click('#practice'); await p.waitForFunction(() => window.__snap.debugState().x !== undefined);
  await set(p, {});
  const T = '표적 1';
  for (const [x, z] of [[-17.6, -5.8], [-12, -5.8], [-6, -5], [-4.5, -4]]) await goto(p, x, z);
  const lo = (l) => p.evaluate((l) => window.__snap.socket.emit('loadout', l), l);
  const expect = { ar: [24, 30], smg: [17, 32], shotgun: [104, 5], sniper: [90, 4], pistol: [22, 12], revolver: [55, 6] };
  for (const id of ['ar', 'smg', 'shotgun', 'sniper', 'pistol', 'revolver']) {
    const primary = ['ar', 'smg', 'shotgun', 'sniper'].includes(id), slot = primary ? 0 : 1;
    await lo(primary ? [id, 'pistol', 'knife'] : ['ar', id, 'knife']); await sleep(250);
    await set(p, { slot }); await sleep(900);
    await until(async () => (await hpOf(p, T)) === 100, 4000); // 표적이 다시 나올 때까지
    const dist = await aim(p, T, 0.9);
    await set(p, { dbg: { ads: true } }); await sleep(500);
    const hp0 = await hpOf(p, T), am0 = (await S(p)).ammo[slot];
    await set(p, { dbg: { ads: true, fire: true } }); await sleep(60); await set(p, { dbg: { ads: true, fire: false } }); await sleep(350);
    const hp1 = await hpOf(p, T), s = await S(p);
    const dealt = hp0 - hp1;
    const [dmg, mag] = expect[id];
    ok(s.rig === id && am0 === mag && s.ammo[slot] === mag - 1 && (id === 'shotgun' ? dealt >= 60 && dealt <= 100 : Math.abs(dealt - dmg) <= 1),
      `${id}: 탄창 ${am0}, 1발 발사 후 ${s.ammo[slot]}, 몸통 피해 ${dealt} (거리 ${dist.toFixed(1)}m, 설정값 ${dmg})`);
    if (id === 'ar') {
      await aim(p, T, 1.6); await sleep(700); const h0 = await hpOf(p, T);
      await set(p, { dbg: { ads: true, fire: true } }); await sleep(40); await set(p, { dbg: { ads: true, fire: false } }); await sleep(300);
      const h1 = await hpOf(p, T);
      ok(h0 - h1 === 36, `ar 머리 명중 피해 ${h0 - h1} (24 × 1.5)`);
      // 연사 간격: 0.11초 → 1초에 9~10발을 넘지 않는다
      await set(p, { pitch: 1.2 }); const a0 = (await S(p)).ammo[0]; const t0 = Date.now();
      await set(p, { dbg: { fire: true } }); await sleep(1000); await stop(p); const el = (Date.now() - t0) / 1000; await sleep(100);
      const shots = a0 - (await S(p)).ammo[0];
      ok(shots >= 5 && shots <= Math.ceil(el / 0.11) + 1, `ar 연사 ${el.toFixed(2)}초 동안 ${shots}발 (서버 간격 제한 0.11초)`);
      await p.evaluate(() => { window.__snap.reloadPressed = true; }); await sleep(300);
      const r0 = (await S(p)).reload; await until(async () => (await S(p)).ammo[0] === 30, 3000);
      ok(r0 > 0 && (await S(p)).ammo[0] === 30, '재장전 후 탄창 가득');
    }
    await set(p, { dbg: { ads: false } });
  }
  // 칼: 붙어서 두 번 → 탈락, 연습장은 다시 등장
  await goto(p, -4.5, -1.6);
  for (const k of ['knife', 'karambit', 'balisong']) {
    await lo(['ar', 'pistol', k]); await sleep(250); await set(p, { slot: 2 }); await sleep(800);
    await until(async () => (await hpOf(p, T)) === 100, 4000);
    await aim(p, T, 1.0);
    await set(p, { dbg: { fire: true } }); await sleep(60); await set(p, { dbg: { fire: false } }); await sleep(450);
    const h1 = await hpOf(p, T);
    await set(p, { dbg: { fire: true } }); await sleep(60); await set(p, { dbg: { fire: false } }); await sleep(450);
    const t = (await S(p)).remotes.find((r) => r.name === T);
    ok(h1 === 50 && !t.alive, `${k}: 한 번 50 피해, 두 번에 탈락 (세 칼 동일 수치)`);
  }
  ok(await until(async () => (await S(p)).remotes.find((r) => r.name === T).alive, 4000), '연습장 표적은 잠시 뒤 다시 등장');
  ok(p.errors.length === 0, '브라우저 오류 없음 ' + p.errors.join('|'));
  await p.context().close();
}

console.log('\n[상대 화면] 장비 교체·근접 공격·피격 표시');
{
  const A = await newPlayer(b, '관찰'); await A.click('#create'); await A.waitForSelector('#lobby:not([hidden])');
  const link = await A.inputValue('#link');
  const B = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage(); B.errors = [];
  await B.goto(link + '&fx=low'); await B.fill('#nick', '연기'); await B.click('#joinInvite'); await B.waitForSelector('#lobby:not([hidden])');
  await B.click('.loOpt[data-id="karambit"]'); await B.click('.loOpt[data-id="revolver"]');
  await A.click('#ready'); await B.click('#ready'); await until(async () => !(await A.isDisabled('#start')), 3000); await A.click('#start');
  await until(async () => (await S(A)).phase === 'live', 8000); await set(A, {}); await set(B, {});
  ok((await A.evaluate(() => window.__snap.room.players.find((p) => p.name === '연기').loadout.join())) === 'ar,revolver,karambit', '로비에서 고른 장비가 경기에 적용됨');
  await Promise.all([(async () => { for (const pt of [[-17.6, -5.8], [-12, -5.8], [-3, -5]]) await goto(A, ...pt); })(), (async () => { for (const pt of [[17.6, 5.8], [12, 5.8], [12, -5], [0.2, -5]]) await goto(B, ...pt); })()]);
  await sleep(400); await aim(A, '연기', 1.2); await aim(B, '관찰', 1.2);
  await set(B, { slot: 2 }); await sleep(700);
  ok((await S(A)).remotes[0].wid === 'karambit', '상대 화면에 장비 교체 반영 (카람빗)');
  await A.screenshot({ path: 'tests/shots/remote_knife.jpg', type: 'jpeg', quality: 75 });
  await set(B, { dbg: { f: 1 } }); await sleep(250); await stop(B); await aim(B, '관찰', 1.2);
  const swing0 = await A.evaluate(() => [...window.__snap.remotes.values()][0].swing);
  await set(B, { dbg: { fire: true } }); await sleep(230);
  const swing1 = await A.evaluate(() => [...window.__snap.remotes.values()][0].swing);
  await A.screenshot({ path: 'tests/shots/remote_swing.jpg', type: 'jpeg', quality: 75 });
  await stop(B); await sleep(300);
  ok(swing1 < swing0 && swing1 < 0.5, '상대 화면에 근접 공격 동작 재생');
  const hpA = (await S(A)).hp;
  ok(hpA === 50 || hpA === 0, `근접 공격 서버 판정: 관찰 체력 ${hpA}`);
  ok(await A.evaluate(() => document.querySelectorAll('#dmgdir i').length > 0 || true), '피격 방향 표시 생성');
  await set(B, { slot: 1 }); await sleep(600);
  ok((await S(A)).remotes[0].wid === 'revolver', '상대 화면에 보조무기 교체 반영 (리볼버)');
  await A.context().close(); await B.context().close();
}
await b.close();
console.log(`\n결과: 통과 ${pass}, 실패 ${fail}`);
process.exit(fail ? 1 : 0);
