// Tira um PNG de cada slide: node escritorio/apresentacao/prints.mjs apresentacao.html pasta N
import { createRequire } from 'module';
// require (e não import) para achar o playwright global pelo NODE_PATH
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'path';
import fs from 'fs';
const [arq, pasta, n] = process.argv.slice(2);
fs.mkdirSync(pasta, { recursive: true });
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await pg.goto('file://' + path.resolve(arq));
await pg.waitForTimeout(1500);
for (let k = 1; k <= Number(n); k++) {
  await pg.screenshot({ path: path.join(pasta, `slide-${String(k).padStart(2, '0')}.png`) });
  await pg.keyboard.press('ArrowRight');
  await pg.waitForTimeout(150);
}
await b.close();
