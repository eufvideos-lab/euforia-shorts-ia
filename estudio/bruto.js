// "Novo projeto com bruto" (0.3.0): a pessoa escolhe um vídeo do PC e o Studio prepara um projeto de longo para
// cortar à mão. Uma passada só do ffmpeg faz a prévia leve (540p, quadro-chave a cada 0,5 s, para a agulha andar
// rápido) e lê o áudio para desenhar a onda. O bruto não é copiado: o render lê direto do arquivo original.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ffmpeg } = require('./longo');

const PASSO = 0.05; // um pico da onda a cada 50 ms
const TAXA = 2000; // amostras por segundo do áudio lido para a onda

const segundos = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);

/** Prepara a pasta do projeto. aoProgresso(0..1). Devolve { pronto: Promise<projeto>, cancelar }. */
function prepararBruto(arquivo, pasta, aoProgresso) {
  fs.mkdirSync(pasta, { recursive: true });
  const previa = path.join(pasta, 'previa.mp4');
  const { bin, env } = ffmpeg();
  const lado = "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'";
  const args = ['-hide_banner', '-nostats', '-y', '-progress', 'pipe:2', '-i', arquivo,
    '-map', '0:v:0', '-map', '0:a:0', '-vf', `${lado},fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-g', '15', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', previa,
    '-map', '0:a:0', '-ac', '1', '-ar', String(TAXA), '-f', 's16le', 'pipe:1'];
  const p = spawn(bin, args, { env, windowsHide: true });

  const porPico = Math.round(TAXA * PASSO);
  const picos = [];
  let resto = Buffer.alloc(0), n = 0, max = 0;
  p.stdout.on('data', (d) => {
    const b = resto.length ? Buffer.concat([resto, d]) : d;
    const inteiros = b.length - (b.length % 2);
    for (let i = 0; i < inteiros; i += 2) {
      const v = Math.abs(b.readInt16LE(i));
      if (v > max) max = v;
      if (++n === porPico) { picos.push(Math.round((max / 32768) * 1000) / 1000); n = 0; max = 0; }
    }
    resto = b.subarray(inteiros);
  });

  let log = '', dur = 0, largura = 0, altura = 0, giro = 0;
  p.stderr.on('data', (d) => {
    const s = d.toString();
    log = (log + s).slice(-6000);
    if (!dur) { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log); if (m) dur = segundos(m[1], m[2], m[3]); }
    if (!largura) { const m = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(log); if (m) { largura = Number(m[1]); altura = Number(m[2]); } }
    if (!giro) { const m = /rotation of (-?[\d.]+)|rotate\s*:\s*(-?\d+)/.exec(log); if (m) giro = Math.abs(Number(m[1] ?? m[2])) % 180; }
    for (const m of s.matchAll(/out_time_(?:ms|us)=(\d+)/g)) if (dur) aoProgresso(Math.min(0.99, Number(m[1]) / 1e6 / dur));
  });

  let cancelado = false;
  const pronto = new Promise((ok, falha) => {
    p.on('error', falha);
    p.on('close', (code) => {
      if (code !== 0) {
        try { fs.rmSync(pasta, { recursive: true, force: true }); } catch { /* nada a limpar */ }
        if (cancelado) return falha(new Error('Cancelado.'));
        const semAudio = /matches no streams|Stream map '0:a:0'/.test(log);
        return falha(new Error(semAudio ? 'Esse vídeo não tem áudio. O Studio corta pela fala, então precisa de um bruto com som.'
          : `Não consegui ler esse vídeo (código ${code}): ${log.trim().split('\n').slice(-2).join(' ')}`));
      }
      if (giro === 90) [largura, altura] = [altura, largura]; // celular gravado em pé
      const total = Math.round(Math.min(dur || Infinity, picos.length * PASSO || Infinity) * 1000) / 1000;
      const nome = path.basename(arquivo).replace(/\.[^.]+$/, '');
      const projeto = {
        versao: 1, tipo: 'longo', origem: 'bruto', id: `bruto-${path.basename(pasta)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        cliente: 'Bruto', titulo: nome, composicao: 'Longo', base: '.',
        registro: [`[bruto] ${path.basename(arquivo)} · ${largura}x${altura} · ${Math.floor(total / 60)} min ${Math.round(total % 60)} s`],
        longo: {
          fps: 30, largura: largura || 1920, altura: altura || 1080, video: arquivo, previa: 'previa.mp4',
          trechos: [{ ini: 0, fim: total }], elementos: [], fim: null, musica: null, palavras: [],
          onda: { passo: PASSO, picos },
        },
        biblioteca: [],
      };
      fs.writeFileSync(path.join(pasta, 'projeto-1.json'), JSON.stringify(projeto));
      aoProgresso(1);
      ok(projeto);
    });
  });
  return { pronto, cancelar: () => { cancelado = true; p.kill(); } };
}

module.exports = { prepararBruto };
