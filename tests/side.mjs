// 장비 모델 옆모습 검수: node tests/side.mjs
import { launch, URL } from './lib.mjs';
import fs from 'fs';
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 640, height: 300 } })).newPage();
p.on('pageerror', (e) => console.log('ERR', e));
await p.goto(URL); await p.waitForTimeout(800);
await p.evaluate(() => { document.getElementById('home').hidden = true; });
const out = [];
for (const id of (process.argv[2] || 'ar,smg,shotgun,sniper,pistol,revolver,knife,karambit,balisong').split(',')) {
  const data = await p.evaluate((id) => {
    const g = window.__snap; g.debugVm(id, 'idle', 0);
    const r = g.vm.rig.root, gun = g.vm.rig.gun;
    const big = ['ar', 'shotgun', 'sniper'].includes(id);
    r.rotation.set(0.12, gun ? -1.35 : -0.9, 0); r.position.set(gun ? (big ? -0.75 : -0.52) : -0.35, gun ? (big ? 0.14 : 0.15) : 0.1, gun ? (big ? -0.55 : -0.33) : -0.2);
    g.renderer.clear(); g.renderer.render(g.vm.scene, g.vm.camera);
    return document.getElementById('view').toDataURL('image/jpeg', 0.9);
  }, id);
  const f = `tests/shots/side_${id}.jpg`; fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); out.push(f);
}
console.log(out.join(' '));
await b.close();
