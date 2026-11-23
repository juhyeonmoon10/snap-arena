import { chromium } from 'playwright-core';
export const URL = process.env.URL || 'http://localhost:3000';
export async function launch() {
  return chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
}
export async function newPlayer(browser, name, size = { width: 800, height: 450 }) {
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(URL + '?fx=low');
  await page.fill('#nick', name);
  return page;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
