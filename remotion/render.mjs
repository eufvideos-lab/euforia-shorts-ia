// Uso: node render.mjs props.json saida.mp4 [ShortViral|ShortInstitucional]
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const [, , propsPath, out, compId = 'ShortViral'] = process.argv;
const inputProps = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
// Chrome: usa o instalado na máquina se existir (variável CHROME), senão o Remotion baixa o dele
const browserExecutable = process.env.CHROME || null;

const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public') });
const composition = await selectComposition({ serveUrl, id: compId, inputProps, browserExecutable });
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  crf: 20,
  outputLocation: out,
  inputProps,
  browserExecutable,
  concurrency: Number(process.env.CONCURRENCY || 2),
  onProgress: ({ progress }) => {
    const p = Math.round(progress * 100);
    if (p % 10 === 0) process.stdout.write(`\r${p}%`);
  },
});
console.log(`\nOK ${out} em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
