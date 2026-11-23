import { launch, newPlayer, sleep } from './lib.mjs';
const b = await launch();
const A = await newPlayer(b, '연습');
await A.click('#practice');
await sleep(1500);
const S = () => A.evaluate(() => window.__snap.debugState());
console.log(JSON.stringify(await S()));
await A.evaluate(() => { const g = window.__snap; g.dbg.on = true; g.dbg.f = 1; });
for (let i = 0; i < 4; i++) { await sleep(500); const s = await S(); console.log(s.phase, s.x?.toFixed(2), s.z?.toFixed(2), 'pend', s.pending, 'err', s.err.toFixed(2), 'fps', s.fps, 'worst', s.worst.toFixed(3)); }
await A.screenshot({ path: 'tests/shots/practice.jpg', type: 'jpeg', quality: 70 });
console.log(A.errors);
await b.close();
