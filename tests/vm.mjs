// 칼/총 1인칭 자세 검수용 스크린샷: node tests/vm.mjs karambit inspect 0,0.2,0.4
import { launch, URL } from './lib.mjs';
const [id, clip, times] = process.argv.slice(2);
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
p.on('pageerror', (e) => console.log('ERR', e));
await p.goto(URL); await p.waitForTimeout(600);
await p.evaluate(() => { for (const s of ['home']) document.getElementById(s).hidden = true; });
const fs = await import('fs');
const names = [];
for (const t of times.split(',')) {
  const data = await p.evaluate(([id, clip, t]) => { const g = window.__snap; g.debugVm(id, clip, t); return document.getElementById('view').toDataURL('image/jpeg', 0.85); }, [id, clip, Number(t)]);
  const f = `tests/shots/vm_${id}_${clip}_${t}.jpg`; fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); names.push(f);
}
console.log(names.join(' '));
await b.close();
