import { launch, URL, sleep } from './lib.mjs';
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(URL); await sleep(2500);
await p.screenshot({ path: 'tests/shots/home.jpg', type: 'jpeg', quality: 80 });
await b.close();
