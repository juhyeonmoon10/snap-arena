// Playwright 종단 검증: 독립된 브라우저 세션 2개(1v1)와 4개(2v2).
// 서버를 SNAP_TEST="freeze=3,end=1.2,grace=5000,round=14" 로 띄운 뒤 실행한다.
import { launch, newPlayer, sleep, URL } from './lib.mjs';
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ 실패:', msg); } };
const S = (p) => p.evaluate(() => window.__snap.debugState());
const set = (p, o) => p.evaluate((o) => { const g = window.__snap; g.dbg.on = true; Object.assign(g.dbg, o.dbg ?? {}); if (o.yaw !== undefined) g.yaw = o.yaw; if (o.pitch !== undefined) g.pitch = o.pitch; if (o.slot !== undefined) g.setSlot(o.slot); }, o);
const stop = (p) => set(p, { dbg: { f: 0, s: 0, fire: false, jump: false, sprint: false, ads: false } });
async function until(fn, ms, step = 60) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } }
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel);
async function goto(p, x, z, sprint = true) {
  return until(async () => {
    const s = await S(p); if (s.x === undefined) return false;
    const dx = x - s.x, dz = z - s.z;
    if (Math.hypot(dx, dz) < 0.45) { await stop(p); return true; }
    await set(p, { yaw: Math.atan2(-dx, -dz), pitch: 0, dbg: { f: 1, sprint } });
    return false;
  }, 9000, 30);
}
async function path(p, pts) { for (const [x, z] of pts) if (!(await goto(p, x, z))) return false; return true; }
async function aimAt(p, name, yOff = 1.15) {
  const s = await S(p); const t = s.remotes.find((r) => r.name === name);
  if (!t || s.x === undefined) return false;
  const dx = t.x - s.x, dy = t.y + yOff - (s.y + 1.6), dz = t.z - s.z;
  await set(p, { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) });
  return true;
}
async function shootUntilDead(p, name, ms = 8000, fire = { fire: true }) {
  const r = await until(async () => {
    const s = await S(p); const t = s.remotes.find((r) => r.name === name);
    if (!t || !t.alive || s.phase !== 'live') { await stop(p); return true; }
    await aimAt(p, name); await set(p, { dbg: fire });
    return false;
  }, ms, 40);
  await stop(p); return r;
}
const BLUE = [[-17.6, -5.8], [-12, -5.8], [-5, -5]], ORANGE = [[17.6, 5.8], [12, 5.8], [12, -5], [5, -5]];
const waitPhase = (p, ph, ms = 20000) => until(async () => (await S(p)).phase === ph, ms);
async function shot(p, name) { await p.screenshot({ path: `tests/shots/${name}.jpg`, type: 'jpeg', quality: 70 }); }

async function lobby(browser, names, mode) {
  const host = await newPlayer(browser, names[0]);
  if (mode === '2v2') await host.click('[data-mode="2v2"]');
  await host.click('#create');
  await host.waitForSelector('#lobby:not([hidden])');
  const code = await host.textContent('#lobbyCode');
  const link = await host.inputValue('#link');
  ok(/^[A-Z2-9]{5}$/.test(code) && link.includes('?room=' + code), `방 생성: 코드 ${code}, 초대 링크 ${link}`);
  ok(await host.isDisabled('#start'), '정원이 차기 전에는 경기 시작 버튼이 잠겨 있음');
  const pages = [host];
  for (const n of names.slice(1)) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
    const p = await ctx.newPage(); p.errors = [];
    p.on('pageerror', (e) => p.errors.push(String(e)));
    await p.goto(link + '&fx=low'); await p.fill('#nick', n); await p.click('#joinInvite');
    await p.waitForSelector('#lobby:not([hidden])');
    pages.push(p);
  }
  return { pages, code, link };
}

async function test1v1(browser) {
  console.log('\n[1v1] 방 생성 → 링크 입장 → 경기 → 재대결 → 재접속/기권');
  const { pages: [A, B], code } = await lobby(browser, ['알파', '브라보'], '1v1');
  ok((await A.textContent('#teamA')).includes('알파') && (await A.textContent('#teamB')).includes('브라보'), '팀 배정: 알파=블루, 브라보=오렌지');
  // 정원 초과 입장 거부
  const C = await newPlayer(browser, '초과'); await C.goto(URL + '?room=' + code + '&fx=low'); await C.fill('#nick', '초과'); await C.click('#joinInvite');
  ok(await until(async () => (await C.textContent('#homeErr')).includes('가득'), 3000), '정원이 찬 방은 입장 거부 메시지');
  await C.context().close();
  await A.click('#ready');
  ok(await A.isDisabled('#start'), '한 명만 준비하면 시작 불가');
  await B.click('#ready');
  ok(await until(async () => !(await A.isDisabled('#start')), 3000), '전원 준비 후 방장 시작 버튼 활성화');
  ok(await B.evaluate(() => document.getElementById('start').hidden), '방장이 아니면 시작 버튼이 보이지 않음');
  await shot(A, '1v1_lobby');
  await A.click('#start');
  ok(await waitPhase(A, 'freeze', 4000) && await waitPhase(B, 'freeze', 4000), '경기 시작: 준비 시간 진입');
  await set(A, {}); await set(B, {});
  let a = await S(A), b = await S(B);
  ok(Math.abs(a.x + 19.5) < 0.2 && Math.abs(b.x - 19.5) < 0.2, `스폰 위치: 알파 x=${a.x.toFixed(1)}, 브라보 x=${b.x.toFixed(1)}`);
  await set(A, { dbg: { f: 1 } }); await sleep(500);
  ok(Math.abs((await S(A)).x + 19.5) < 0.2, '준비 시간에는 이동 불가');
  await stop(A);

  // 라운드 1: 전원 탈락 승리
  await waitPhase(A, 'live');
  await Promise.all([path(A, BLUE), path(B, ORANGE)]);
  await sleep(600); // 관성으로 미끄러진 뒤 멈춘 위치를 비교
  a = await S(A); b = await S(B);
  ok(Math.hypot(a.x + 5, a.z + 5) < 1.2 && Math.hypot(b.x - 5, b.z + 5) < 1.2, `두 플레이어가 맵을 가로질러 교전 위치 도달 (알파 ${a.x.toFixed(1)},${a.z.toFixed(1)} / 브라보 ${b.x.toFixed(1)},${b.z.toFixed(1)})`);
  const seen = a.remotes[0];
  ok(Math.hypot(seen.x - b.x, seen.z - b.z) < 0.3, `상대 위치 보간: 알파 화면의 브라보 오차 ${Math.hypot(seen.x - b.x, seen.z - b.z).toFixed(2)}m`);
  await aimAt(A, '브라보'); await sleep(150); await shot(A, '1v1_aim');
  await shootUntilDead(A, '브라보');
  ok(await until(async () => (await S(A)).score[0] === 1, 4000), '라운드 1: 상대 전원 탈락 → 블루 1점');
  ok((await S(B)).alive === false, '탈락한 쪽은 리스폰 없음');
  await shot(A, '1v1_roundwin'); await shot(B, '1v1_dead');

  // 라운드 2: 시간 초과, 체력 우세 (브라보가 알파를 조금 맞힌 뒤 대기)
  await until(async () => (await S(A)).round === 2 && (await S(A)).phase === 'live', 15000);
  a = await S(A); b = await S(B);
  ok(a.hp === 100 && b.alive && b.hp === 100 && a.ammo[0] === 30 && Math.abs(a.x + 19.5) < 0.3, '새 라운드: 체력·탄약·위치 초기화');
  await Promise.all([path(A, BLUE), path(B, ORANGE)]);
  await until(async () => { await aimAt(B, '알파'); await set(B, { dbg: { fire: true } }); return (await S(A)).hp < 100; }, 4000, 40);
  await stop(B);
  const hpA = (await S(A)).hp;
  ok(hpA < 100 && hpA > 0, `피격: 알파 체력 ${hpA}`);
  ok(await until(async () => (await S(A)).score[1] === 1, 16000, 200), '라운드 2: 시간 초과 → 남은 체력 우세로 오렌지 1점');
  const reason = await A.evaluate(() => window.__snap.room.lastRound.reason);
  ok(reason.includes('체력'), `판정 사유 표시: "${reason}"`);

  // 라운드 3: 시간 초과 무승부 → 점수 없음
  await until(async () => (await S(A)).round === 3 && (await S(A)).phase === 'live', 15000);
  ok(await until(async () => (await S(A)).round === 4, 20000, 200), '라운드 3: 아무도 피해 없이 시간 초과 → 새 라운드');
  a = await S(A);
  ok(a.score[0] === 1 && a.score[1] === 1, '무승부는 점수 없음 (1:1 유지)');

  // 남은 라운드: 알파가 4번 더 이김
  for (let i = 0; i < 4; i++) {
    const r = (await S(A)).round;
    await until(async () => (await S(A)).phase === 'live', 15000);
    await Promise.all([path(A, BLUE), path(B, ORANGE)]);
    await shootUntilDead(A, '브라보');
    await until(async () => { const s = await S(A); return s.round > r || s.phase === 'matchEnd'; }, 10000);
  }
  ok(await waitPhase(A, 'matchEnd', 5000), '먼저 5라운드를 이기면 경기 종료');
  ok(await visible(A, '#result') && (await A.textContent('#resTitle')).includes('승리') && (await B.textContent('#resTitle')).includes('패배'), '결과 화면: 승패 표시');
  ok((await A.textContent('#resA')) === '5' && (await A.textContent('#resB')) === '1', '결과 화면: 팀 점수 5:1');
  const row = await A.textContent('#resTable tbody');
  ok(row.includes('알파') && row.includes('브라보'), '결과 화면: 개인 기록 표');
  await shot(A, '1v1_result');

  // 재대결
  await A.click('#rematch');
  await sleep(300);
  ok((await S(A)).phase === 'matchEnd', '한 명만 누르면 재대결이 시작되지 않음');
  await B.click('#rematch');
  ok(await waitPhase(A, 'freeze', 4000), '둘 다 누르면 재대결 시작');
  await waitPhase(A, 'live');
  a = await S(A); b = await S(B);
  ok(a.score[0] === 0 && a.score[1] === 0 && a.round === 1, '재대결: 점수와 라운드 초기화');
  ok(a.hp === 100 && b.hp === 100 && a.ammo[0] === 30 && Math.abs(a.x + 19.5) < 0.3 && Math.abs(b.x - 19.5) < 0.3 && a.tl > 9, '재대결: 타이머·위치·체력·탄약 초기화');

  // 재접속: 새로고침 후 원래 슬롯 복구
  await B.reload();
  ok(await until(async () => (await A.evaluate(() => window.__snap.room.players.find((p) => p.name === '브라보')?.connected)) === false, 3000), '상대 연결 끊김이 방에 반영됨');
  ok(await until(async () => { try { const s = await S(B); return s.phase !== 'lobby' && s.score; } catch { return false; } }, 6000), '유예 시간 안에 복귀: 진행 중인 경기로 재입장');
  const pb = await B.evaluate(() => { const r = window.__snap.room; const me = r.players.find((p) => p.id === r.you); return { name: me.name, team: me.team, n: r.players.length }; });
  ok(pb.name === '브라보' && pb.team === 1 && pb.n === 2, '원래 슬롯(오렌지 팀) 복구');
  // 기권: 유예 시간이 지나도록 돌아오지 않음
  await B.context().close();
  ok(await waitPhase(A, 'matchEnd', 12000), '유예 시간 초과 → 경기 종료');
  ok((await A.textContent('#resSub')).includes('기권'), '기권승 안내 표시: ' + (await A.textContent('#resSub')).slice(0, 40));
  ok(await A.isDisabled('#rematch'), '멤버가 빠지면 재대결 불가, 로비 복귀만 가능');
  await A.click('#resLobby');
  ok(await A.waitForSelector('#lobby:not([hidden])', { timeout: 3000 }).then(() => true, () => false), '로비로 돌아가기');
  ok(A.errors.length === 0, '브라우저 오류 없음' + (A.errors.length ? ': ' + A.errors.join(' | ') : ''));
  await A.context().close();
}

async function test2v2(browser) {
  console.log('\n[2v2] 4인 로비 → 팀 배정 → 관전 → 라운드 전환 → 재대결');
  const { pages } = await lobby(browser, ['가', '나', '다', '라'], '2v2');
  const [P1, P2, P3, P4] = pages;
  const ta = await P1.textContent('#teamA'), tb = await P1.textContent('#teamB');
  ok(['가', '다'].every((n) => ta.includes(n)) && ['나', '라'].every((n) => tb.includes(n)), `자동 팀 배정 2:2 (블루: 가·다 / 오렌지: 나·라)`);
  // 팀이 가득 차면 팀 바꾸기 불가
  ok(await P1.isDisabled('#swap'), '상대 팀이 가득 차면 팀 바꾸기 잠김');
  for (const p of pages) await p.click('#ready');
  await until(async () => !(await P1.isDisabled('#start')), 3000);
  await shot(P1, '2v2_lobby');
  await P1.click('#start');
  for (const p of pages) { await waitPhase(p, 'freeze', 4000); await set(p, {}); }
  const st = await Promise.all(pages.map(S));
  ok(st[0].x < 0 && st[2].x < 0 && st[1].x > 0 && st[3].x > 0 && Math.abs(st[0].z - st[2].z) > 2, '4명이 팀별 스폰에 겹치지 않게 배치');
  ok(st[0].remotes.length === 3, '각 화면에 다른 3명이 보임');
  await waitPhase(P1, 'live');
  // 가·다(블루)와 나(오렌지)가 교전 위치로. 가가 나를 탈락시킨다.
  await Promise.all([path(P1, BLUE), path(P2, ORANGE)]);
  // 팀 피해 없음: 다가 가를 쏴도 피해 없음
  await path(P3, [[-17.6, -5.8], [-12, -5.8], [-9, -5]]);
  await aimAt(P3, '가'); await set(P3, { dbg: { fire: true } }); await sleep(700); await stop(P3);
  ok((await S(P1)).hp === 100, '팀 피해 꺼짐: 아군 사격으로 체력이 줄지 않음');
  await shootUntilDead(P1, '나');
  ok(await until(async () => (await S(P2)).alive === false, 3000), '나 탈락');
  ok((await S(P1)).phase === 'live', '2v2: 한 명 탈락해도 라운드 계속');
  await sleep(300);
  const spec = await P2.textContent('#spectate');
  ok(spec.includes('라') && spec.includes('관전'), `탈락 후 팀원 관전 표시: "${spec}"`);
  await shot(P2, '2v2_spectate');
  // 라를 찾아가 탈락시켜 라운드 종료
  await path(P1, [[5, -5], [12, -5], [12, 5.8], [16.8, 5.8]]);
  await shootUntilDead(P1, '라', 10000);
  ok(await until(async () => (await S(P1)).score[0] === 1, 5000), '상대 팀 전원 탈락 → 블루 1점');
  ok(await until(async () => (await S(P2)).round === 2 && (await S(P2)).alive, 10000), '다음 라운드에 탈락자 복귀');
  // 2v2 이탈: 라가 나가고 돌아오지 않음 → 1명 남은 팀으로 계속
  await P4.context().close();
  ok(await until(async () => (await P1.evaluate(() => window.__snap.room.players.length)) === 3, 12000), '2v2 이탈: 유예 후 기권 처리, 남은 3명으로 계속');
  ok((await S(P1)).phase !== 'matchEnd', '팀원이 남아 있으면 경기는 끝나지 않음');
  // 남은 오렌지(나)까지 이탈 → 기권승
  await P2.context().close();
  ok(await waitPhase(P1, 'matchEnd', 14000), '오렌지 팀 전원 이탈 → 블루 기권승으로 종료');
  const errs = [P1, P3].flatMap((p) => p.errors);
  ok(errs.length === 0, '브라우저 오류 없음' + (errs.length ? ': ' + errs.join(' | ') : ''));
  const fps = await S(P1); console.log(`  · 참고: 헤드리스 소프트웨어 렌더링 ${fps.fps}fps`);
  await P1.context().close(); await P3.context().close();
}

async function test2v2Rematch(browser) {
  console.log('\n[2v2] 재대결 흐름');
  const { pages } = await lobby(browser, ['가', '나', '다', '라'], '2v2');
  for (const p of pages) await p.click('#ready');
  await until(async () => !(await pages[0].isDisabled('#start')), 3000);
  await pages[0].click('#start');
  for (const p of pages) { await waitPhase(p, 'freeze', 4000); await set(p, {}); }
  // 시간 초과 판정을 빠르게: 가가 나를 탈락시켜 생존 인원 우세로 5라운드
  for (let i = 0; i < 5; i++) {
    await until(async () => (await S(pages[0])).phase === 'live', 15000);
    const r = (await S(pages[0])).round;
    await Promise.all([path(pages[0], BLUE), path(pages[1], ORANGE)]);
    await shootUntilDead(pages[0], '나');
    if (i === 0) {
      ok(await until(async () => (await S(pages[0])).score[0] === 1, 16000, 200), '시간 초과 → 생존 인원 우세(2 대 1)로 블루 1점');
      ok((await pages[0].evaluate(() => window.__snap.room.lastRound.reason)).includes('생존'), '판정 사유: 생존 인원');
    }
    await until(async () => { const s = await S(pages[0]); return s.round > r || s.phase === 'matchEnd'; }, 20000, 200);
  }
  ok(await waitPhase(pages[0], 'matchEnd', 5000), '2v2 경기 종료(5:0)');
  for (const p of pages) await p.click('#rematch');
  ok(await waitPhase(pages[3], 'freeze', 4000), '4명 모두 수락 → 재대결 시작');
  const s = await S(pages[3]);
  ok(s.score[0] === 0 && s.score[1] === 0 && s.round === 1 && s.hp === 100, '재대결: 점수·라운드·체력 초기화');
  for (const p of pages) await p.context().close();
}

const browser = await launch();
fs.mkdirSync('tests/shots', { recursive: true });
const only = process.argv[2];
try {
  if (!only || only === '1') await test1v1(browser);
  if (!only || only === '2') await test2v2(browser);
  if (!only || only === '3') await test2v2Rematch(browser);
} catch (e) { fail++; console.log('  ✗ 예외:', e); }
await browser.close();
console.log(`\n결과: 통과 ${pass}, 실패 ${fail}`);
process.exit(fail ? 1 : 0);
