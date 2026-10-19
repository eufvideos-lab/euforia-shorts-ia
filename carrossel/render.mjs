// Uso: node render.mjs jobs.json  (chamado pelo gerar.py)
// Abre cada slide no Chrome sem tela, reduz o texto que não cabe e tira o PNG 1080x1350.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

function acharChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const opcoes = [];
  for (const raiz of ['/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')]) {
    if (!fs.existsSync(raiz)) continue;
    for (const d of fs.readdirSync(raiz).sort().reverse()) {
      opcoes.push(path.join(raiz, d, 'chrome-linux/chrome'), path.join(raiz, d, 'chrome-linux/headless_shell'));
    }
  }
  // Chrome que o Remotion da máquina de shorts já baixou
  const rem = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../remotion/node_modules/.remotion');
  if (fs.existsSync(rem)) {
    for (const d of fs.readdirSync(rem)) opcoes.push(path.join(rem, d, 'chrome-headless-shell-linux64/chrome-headless-shell'));
  }
  opcoes.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
  return opcoes.find((p) => fs.existsSync(p));
}

const { jobs, fit } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ executablePath: acharChrome(), args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
const res = [];
for (const j of jobs) {
  await page.goto('file://' + j.html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const r = await page.evaluate(`(${fit})()`);
  await page.screenshot({ path: j.png, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  res.push({ ...j, ...r });
  console.log('ok', path.basename(path.dirname(j.png)) + '/' + path.basename(j.png), r.k, r.estoura ? 'ESTOURA' : '');
}
await browser.close();
fs.writeFileSync(process.argv[2] + '.res', JSON.stringify(res));
