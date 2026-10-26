// Uso: node escritorio/identidade/render.mjs jobs.json
// jobs.json = [{ "html": "/caminho/banner.html", "w": 2560, "h": 1440, "out": "/caminho/banner.png" }, ...]
// "pdf": true no job gera PDF em vez de PNG (prancha da identidade). "h": 0 = altura da página inteira.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// usa o playwright-core já instalado pela máquina de carrosséis
const require = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../carrossel/package.json'));
const { chromium } = require('playwright-core');

function acharChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const opcoes = [];
  for (const raiz of ['/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')]) {
    if (!fs.existsSync(raiz)) continue;
    for (const d of fs.readdirSync(raiz).sort().reverse()) {
      for (const sub of ['chrome-linux', 'chrome-linux64', 'chrome-headless-shell-linux64']) {
        opcoes.push(path.join(raiz, d, sub, 'chrome'), path.join(raiz, d, sub, 'headless_shell'), path.join(raiz, d, sub, 'chrome-headless-shell'));
      }
    }
  }
  opcoes.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
  return opcoes.find((p) => fs.existsSync(p));
}

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ executablePath: acharChrome(), args: ['--allow-file-access-from-files'] });
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h || 900 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(j.html), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  if (j.pdf) {
    const h = j.h || (await page.evaluate(() => document.documentElement.scrollHeight));
    await page.pdf({ path: j.out, width: j.w + 'px', height: h + 'px', printBackground: true });
  } else if (j.h) {
    await page.screenshot({ path: j.out, clip: { x: 0, y: 0, width: j.w, height: j.h } });
  } else {
    await page.screenshot({ path: j.out, fullPage: true });
  }
  await page.close();
  console.log('ok', path.basename(j.out));
}
await browser.close();
