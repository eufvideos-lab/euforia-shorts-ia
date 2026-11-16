// Render do vídeo LONGO no PC: o mesmo acabamento do longos/montar.py (B-roll com movimento lento, telas cheias com
// fade, textos-chave e lowers por cima, tela final, voz tratada, trilha que abaixa quando a pessoa fala e volume do
// YouTube), com o ffmpeg que vai junto no instalador. Usa todos os núcleos do PC.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ffmpeg completo (gyan.dev, via ffmpeg-static) vai junto no instalador em resources/ffmpeg; o do motor do Remotion
// vem sem overlay/fade/compressor e não serve para o longo.
function ffmpeg() {
  if (process.env.ESTUDIO_FFMPEG) return { bin: process.env.ESTUDIO_FFMPEG, env: process.env };
  const junto = process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (junto && fs.existsSync(junto)) return { bin: junto, env: process.env };
  return { bin: 'ffmpeg', env: process.env }; // teste fora do instalador: o ffmpeg do sistema
}

const f3 = (x) => Number(x).toFixed(3);

/** Monta o comando (argumentos + filtro) do vídeo final. midia = pasta midia/ do projeto. */
function comando(L, midia, saida) {
  const trechos = [...L.trechos].sort((a, b) => a.ini - b.ini);
  const TOTAL = trechos.reduce((n, t) => n + (t.fim - t.ini), 0);
  const END = L.fim ? L.fim.dur : 0;
  const arq = (r) => path.join(midia, r);
  const args = ['-v', 'error', '-y', '-nostats', '-progress', 'pipe:1', '-i', arq(L.video)];
  const fc = [];

  // fala: os trechos que ficaram (mesma ordem do base.mp4; tirar trecho não muda a ordem)
  const inteiro = trechos.length === L.trechos.length && trechos.every((t, i) => i === 0 || Math.abs(t.ini - trechos[i - 1].fim) < 0.002);
  if (inteiro && trechos[0].ini < 0.002) {
    fc.push('[0:v]fps=30,setsar=1[bv]', '[0:a]anull[ba]');
  } else {
    const expr = trechos.map((t) => `gte(t,${f3(t.ini)})*lt(t,${f3(t.fim)})`).join('+');
    fc.push(`[0:v]fps=30,select='${expr}',setpts=N/(30*TB),setsar=1[bv]`);
    fc.push(`[0:a]aselect='${expr}',asetpts=N/SR/TB[ba]`);
  }

  // elementos por cima, na mesma ordem de camadas do montar.py
  const ordem = { broll: 0, full: 1, kw: 2, lw: 3 };
  const EV = L.elementos.filter((e) => e.inicio < TOTAL - 0.1)
    .map((e) => ({ ...e, dur: Math.min(e.dur, TOTAL - e.inicio) }))
    .sort((a, b) => ordem[a.camada] - ordem[b.camada] || a.inicio - b.inicio);
  for (const e of EV) {
    const img = /\.(jpe?g|png|webp)$/i.test(e.arquivo);
    if (img) args.push('-loop', '1', '-framerate', '30');
    else if (e.camada === 'broll') args.push('-stream_loop', '-1');
    if (e.arquivo.endsWith('.webm')) args.push('-c:v', 'libvpx-vp9'); // decodifica com transparência
    args.push('-t', f3(e.dur), '-i', arq(e.arquivo));
  }
  let last = '[bv]';
  EV.forEach((e, i) => {
    const k = i + 1, d = e.dur;
    let pre = '', fd = 0;
    if (e.camada === 'broll') {
      pre = `scale=2112:1188:force_original_aspect_ratio=increase,crop=2112:1188,crop=1920:1080:x='96*t/${f3(d)}':y='54*t/${f3(d)}',eq=contrast=1.04:saturation=1.05,`;
      fd = 0.18;
    } else if (e.camada === 'full') fd = 0.15;
    const fade = fd ? `fade=t=in:st=0:d=${fd}:alpha=1,fade=t=out:st=${f3(d - fd)}:d=${fd}:alpha=1,` : '';
    fc.push(`[${k}:v]${pre}fps=30,setsar=1,format=yuva420p,${fade}setpts=PTS-STARTPTS+${f3(e.inicio)}/TB[g${k}]`);
    const y = { kw: e.y || 660, lw: e.y || 840 }[e.camada] ?? 0;
    fc.push(`${last}[g${k}]overlay=x=0:y=${y}:enable='between(t,${f3(e.inicio)},${f3(e.inicio + d)})':eof_action=pass[v${k}]`);
    last = `[v${k}]`;
  });
  let n = EV.length + 1;
  fc.push('[ba]highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=10:release=150:makeup=2,aformat=channel_layouts=stereo:sample_rates=48000[aa]');
  fc.push(`${last}fps=30,format=yuv420p,setsar=1[vm]`);
  if (L.fim) {
    args.push('-i', arq(L.fim.arquivo));
    fc.push(`[${n}:v]fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.4[endv]`);
    fc.push(`anullsrc=r=48000:cl=stereo,atrim=0:${f3(END)}[enda]`);
    fc.push('[vm][aa][endv][enda]concat=n=2:v=1:a=1[vo][voz]');
    n += 1;
  } else {
    fc.push('[vm]null[vo]', '[aa]anull[voz]');
  }
  const DUR = TOTAL + END;
  if (L.musica && fs.existsSync(arq(L.musica.arquivo))) {
    args.push('-stream_loop', '-1', '-i', arq(L.musica.arquivo));
    const vol = L.musica.volume_db ?? -31;
    fc.push('[voz]asplit=2[voz1][voz2]');
    fc.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${f3(DUR)},volume=${vol}dB,afade=t=in:st=0:d=1.5,afade=t=out:st=${f3(DUR - 3)}:d=3[mus]`);
    fc.push('[mus][voz2]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=450[musd]');
    fc.push('[voz1][musd]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao]');
  } else {
    fc.push('[voz]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao]');
  }
  const script = saida.replace(/\.mp4$/, '.filtro.txt');
  fs.writeFileSync(script, fc.join(';\n'));
  args.push('-filter_complex_script', script, '-map', '[vo]', '-map', '[ao]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', saida);
  return { args, script, DUR, elementos: EV.length };
}

/** Renderiza; aoProgresso({progresso 0..1, restante ms}); devolve { cancelar, pronto: Promise }. */
function renderizarLongo(L, midia, saida, aoProgresso) {
  const { bin, env } = ffmpeg();
  const { args, script, DUR } = comando(L, midia, saida);
  const p = spawn(bin, args, { env, windowsHide: true });
  const t0 = Date.now();
  let erro = '';
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d.toString();
    const linhas = buf.split('\n');
    buf = linhas.pop();
    for (const l of linhas) {
      const m = /^out_time_(?:ms|us)=(\d+)/.exec(l);
      if (m) {
        const prog = Math.min(0.999, Number(m[1]) / 1e6 / DUR);
        const passou = Date.now() - t0;
        aoProgresso({ progresso: prog, restante: prog > 0.02 ? (passou / prog) * (1 - prog) : null });
      }
    }
  });
  p.stderr.on('data', (d) => { erro = (erro + d.toString()).slice(-4000); });
  let cancelado = false;
  const pronto = new Promise((ok, falha) => {
    p.on('error', falha);
    p.on('close', (code) => {
      try { fs.unlinkSync(script); } catch { /* já foi */ }
      if (code === 0) return ok({ saida, segundos: Math.round((Date.now() - t0) / 1000) });
      try { fs.unlinkSync(saida); } catch { /* não chegou a criar */ }
      falha(new Error(cancelado ? 'Render cancelado.' : `O ffmpeg parou (código ${code}): ${erro.trim().split('\n').slice(-3).join(' ')}`));
    });
  });
  return { pronto, cancelar: () => { cancelado = true; p.kill(); } };
}

module.exports = { comando, renderizarLongo, ffmpeg };
