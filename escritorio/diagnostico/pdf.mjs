// Uso: node escritorio/diagnostico/pdf.mjs entrada.html saida.pdf
// HTML -> PDF A4 (várias páginas), com cabeçalho/rodapé do próprio HTML.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const aqui = path.dirname(new URL(import.meta.url).pathname);
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  // máquina da rotina: usa o playwright-core da máquina de carrosséis (npm ci em carrossel/)
  ({ chromium } = createRequire(path.resolve(aqui, '../../carrossel/package.json'))('playwright-core'));
}

function acharChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const opcoes = ['/opt/pw-browsers/chromium'];
  for (const raiz of ['/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')]) {
    if (!fs.existsSync(raiz)) continue;
    for (const d of fs.readdirSync(raiz).sort().reverse()) {
      for (const sub of ['chrome-linux', 'chrome-linux64', 'chrome-headless-shell-linux64']) {
        opcoes.push(path.join(raiz, d, sub, 'chrome'), path.join(raiz, d, sub, 'headless_shell'), path.join(raiz, d, sub, 'chrome-headless-shell'));
      }
    }
  }
  opcoes.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
  return opcoes.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
}

const [entrada, saida] = process.argv.slice(2);
const exe = acharChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
await page.goto('file://' + path.resolve(entrada), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const rodape = await page.evaluate(() => document.body.dataset.rodape || '');
await page.pdf({
  path: saida,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:7.5px;color:#8a8f98;width:100%;padding:0 13mm;display:flex;justify-content:space-between">
    <span>${rodape}</span><span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log('ok', saida);
