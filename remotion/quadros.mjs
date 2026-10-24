// Prévia rápida: renderiza quadros soltos (PNG) de uma composição para conferir antes do vídeo inteiro.
// Uso: node quadros.mjs props.json pasta_saida MotionCena 1.5 4.2 10   (tempos em segundos)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const [, , propsPath, outDir, compId, ...tempos] = process.argv;
const inputProps = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
const browserExecutable = process.env.CHROME || null;
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public') });
const composition = await selectComposition({ serveUrl, id: compId, inputProps, browserExecutable });
for (const t of tempos) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(t) * composition.fps));
  const output = path.join(outDir, `q_${String(t).padStart(5, '0')}.png`);
  await renderStill({ composition, serveUrl, inputProps, frame, output, browserExecutable, scale: 0.5 });
  console.log(output);
}
