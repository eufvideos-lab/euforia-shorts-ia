// Monta o que o app leva dentro: o editor (remotion/editor) e o site do Remotion já empacotado (para renderizar).
// Uso: node preparar.mjs   (roda sozinho no "npm run dev" e no "npm run windows")
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const remotion = path.join(aqui, '..', 'remotion');
const build = path.join(aqui, 'build');
const vazio = path.join(build, '.publico-vazio');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(vazio, { recursive: true });

const rodar = (cmd) => execSync(cmd, { cwd: remotion, stdio: 'inherit' });
if (!fs.existsSync(path.join(remotion, 'node_modules'))) rodar('npm install');
rodar(`npx vite build --config editor/vite.config.mjs --outDir "${path.join(build, 'editor')}" --emptyOutDir`);
// a mídia de cada pedido entra por /render/<pasta>/public/ no servidor do app; o bundle vai sem public
rodar(`npx remotion bundle src/index.ts --out-dir "${path.join(build, 'render')}" --public-dir "${vazio}"`);
fs.rmSync(vazio, { recursive: true, force: true });
console.log('pronto: build/editor e build/render');
