// Baixa o ffmpeg completo do Windows (ffmpeg-static → build gyan.dev) para ir junto no instalador (render dos longos).
// O ffmpeg que vem com o motor do Remotion não tem overlay/fade/compressor. Uso: node ffmpeg-windows.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ffmpeg-win');
const exe = path.join(dir, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
if (fs.existsSync(exe)) { console.log('ffmpeg do Windows já está aqui'); process.exit(0); }
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"ffmpeg-win","private":true}');
execSync('npm install --no-audit --no-fund ffmpeg-static@5.2.0', {
  cwd: dir, stdio: 'inherit', env: { ...process.env, npm_config_platform: 'win32', npm_config_arch: 'x64' },
});
if (!fs.existsSync(exe)) throw new Error('ffmpeg.exe não veio');
console.log('pronto:', exe);
