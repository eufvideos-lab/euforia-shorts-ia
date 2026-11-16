// Euforia Studio: o editor da Euforia como app de computador.
// Abre os projetos que a máquina deixou na pasta (Drive sincronizado), mostra a prévia, e renderiza com a força do PC.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RECURSOS = app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;
const EDITOR = path.join(RECURSOS, 'build', 'editor'); // build do remotion/editor
const BUNDLE = path.join(RECURSOS, 'build', 'render'); // site do Remotion já empacotado (npx remotion bundle)
const CONFIG = () => path.join(app.getPath('userData'), 'config.json');

// Pastas onde a máquina costuma deixar os projetos (Drive para computador). A primeira que existir vira a padrão.
const PADROES = [
  'G:\\Drives compartilhados\\EUFORIA MEDIA\\00 - SHORTS IA (MÁQUINA)\\EDITOR',
  'G:\\Shared drives\\EUFORIA MEDIA\\00 - SHORTS IA (MÁQUINA)\\EDITOR',
  path.join(os.homedir(), 'Documents', 'Euforia Studio'),
];

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')); } catch { return {}; }
}
function gravarConfig(c) {
  fs.mkdirSync(path.dirname(CONFIG()), { recursive: true });
  fs.writeFileSync(CONFIG(), JSON.stringify(c, null, 1));
}
function raiz() {
  const c = lerConfig();
  if (process.env.ESTUDIO_PASTA) return process.env.ESTUDIO_PASTA;
  if (c.raiz) return c.raiz;
  return PADROES.find((p) => fs.existsSync(p)) || PADROES[PADROES.length - 1];
}

/* ---------------------------------------------------------------- servidor local (com Range, para o vídeo andar) */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.map': 'application/json' };

function dentro(base, rel) {
  const alvo = path.resolve(base, '.' + path.sep + rel);
  return alvo === path.resolve(base) || alvo.startsWith(path.resolve(base) + path.sep) ? alvo : null;
}

function servirArquivo(req, res, arq) {
  fs.stat(arq, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    const tipo = TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream';
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const cab = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
    if (r) {
      const ini = r[1] ? Number(r[1]) : Math.max(0, st.size - Number(r[2]));
      const fim = r[1] && r[2] ? Math.min(Number(r[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { ...cab, 'Content-Range': `bytes ${ini}-${fim}/${st.size}`, 'Content-Length': fim - ini + 1 });
      return fs.createReadStream(arq, { start: ini, end: fim }).pipe(res);
    }
    res.writeHead(200, { ...cab, 'Content-Length': st.size });
    fs.createReadStream(arq).pipe(res);
  });
}

let porta = 0;
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  let arq = null;
  if (p.startsWith('/projetos/')) arq = dentro(raiz(), p.slice('/projetos/'.length));
  else if (p.startsWith('/render/')) {
    // /render/<pasta do pedido>/public/... = mídia do pedido; o resto = site do Remotion
    const [, , pasta, ...resto] = p.split('/');
    const rel = resto.join('/');
    if (rel.startsWith('public/')) arq = dentro(path.join(raiz(), pasta, basePasta(pasta)), rel.slice('public/'.length));
    else arq = dentro(BUNDLE, rel || 'index.html');
  } else arq = dentro(EDITOR, p === '/' ? 'index.html' : p.slice(1));
  if (!arq) { res.writeHead(403); return res.end(); }
  servirArquivo(req, res, arq);
});

/* ---------------------------------------------------------------- projetos */
// pasta da mídia do projeto: "midia" (como sai da máquina) ou "." (projeto plano, como sobe para o Drive)
function basePasta(pasta) {
  try {
    const dir = path.join(raiz(), pasta);
    const pj = fs.readdirSync(dir).find((f) => /^projeto-\d+\.json$/.test(f));
    return JSON.parse(fs.readFileSync(path.join(dir, pj), 'utf8')).base || 'midia';
  } catch { return 'midia'; }
}

function listar() {
  const r = raiz();
  const out = [];
  let pastas = [];
  try { pastas = fs.readdirSync(r, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const pasta of pastas) {
    let arqs = [];
    try { arqs = fs.readdirSync(path.join(r, pasta)).filter((f) => /^projeto-\d+\.json$/.test(f)); } catch { continue; }
    for (const arquivo of arqs) {
      try {
        const full = path.join(r, pasta, arquivo);
        const p = JSON.parse(fs.readFileSync(full, 'utf8'));
        const longo = p.tipo === 'longo' ? p.longo : null;
        const rendersDir = path.join(r, pasta, 'renders');
        const renders = fs.existsSync(rendersDir) ? fs.readdirSync(rendersDir).filter((f) => f.startsWith(p.id) && f.endsWith('.mp4')) : [];
        const ultimo = renders.map((f) => ({ f, t: fs.statSync(path.join(rendersDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
        out.push({
          pasta, arquivo, id: p.id, tipo: longo ? 'longo' : 'short', cliente: p.cliente, titulo: p.titulo, composicao: p.composicao,
          duracao: longo ? longo.trechos.reduce((n, t) => n + t.fim - t.ini, 0) : p.props?.duration ?? 0,
          confianca: p.maquina?.nota_confianca ?? null,
          url: `/projetos/${encodeURIComponent(pasta)}/${arquivo}`,
          capa: (longo?.previa || p.props?.video) ? `/projetos/${encodeURIComponent(pasta)}/${p.base || 'midia'}/${longo ? longo.previa : p.props.video}` : null,
          inicioCapa: longo ? 4 : p.props?.segments?.[0]?.srcStart ?? 0,
          criadoEm: fs.statSync(full).mtimeMs,
          render: ultimo ? path.join(rendersDir, ultimo.f) : null,
          renderEm: ultimo?.t ?? null,
          revisao: p.revisao?.obrigatoria ? (p.revisao.motivo || 'revisão obrigatória') : null,
        });
      } catch { /* projeto quebrado: ignora */ }
    }
  }
  return out.sort((a, b) => b.criadoEm - a.criadoEm);
}

/* ---------------------------------------------------------------- render no PC */
let cancelar = null;
async function renderizar(evento, { pasta, pacote }) {
  const envia = (x) => !evento.sender.isDestroyed() && evento.sender.send('estudio:progresso', x);
  const { ensureBrowser, selectComposition, renderMedia, makeCancelSignal } = require('@remotion/renderer');
  const dir = dentro(raiz(), pasta);
  if (!dir) throw new Error('pasta inválida');
  const rendersDir = path.join(dir, 'renders');
  fs.mkdirSync(rendersDir, { recursive: true });
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const nome = `${pacote.projeto} ${pacote.modo === 'automatico' ? 'maquina' : 'ajustado'} ${carimbo}`;
  fs.writeFileSync(path.join(rendersDir, nome + '.json'), JSON.stringify(pacote, null, 1));
  const { props, longo, ...semProps } = pacote;
  fs.appendFileSync(path.join(dir, 'ajustes.jsonl'), JSON.stringify({ ...semProps, pc: os.hostname() }) + '\n');

  if (pacote.tipo === 'longo') {
    // longo: ffmpeg do motor, com o mesmo acabamento da máquina de longos
    const { renderizarLongo } = require('./longo');
    const nucleos = os.cpus().length;
    const projArq = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /^projeto-\d+\.json$/.test(f))), 'utf8'));
    const midia = path.join(dir, projArq.base || 'midia');
    const saida = path.join(rendersDir, nome + '.mp4');
    envia({ fase: 'preparando', progresso: 0, nucleos });
    const r = renderizarLongo(longo, midia, saida, (x) => envia({ fase: 'renderizando', progresso: x.progresso, restante: x.restante, nucleos }));
    cancelar = r.cancelar;
    try {
      const { segundos } = await r.pronto;
      envia({ fase: 'pronto', progresso: 1, saida, segundos, nucleos });
      return { saida, segundos };
    } finally { cancelar = null; }
  }

  // o Chrome do render baixa só na primeira vez, para a pasta do app
  process.chdir(app.getPath('userData'));
  const browserExecutable = process.env.ESTUDIO_CHROME || null; // teste: usa um Chrome já instalado
  envia({ fase: 'motor', progresso: 0 });
  await ensureBrowser({
    browserExecutable,
    onBrowserDownload: () => ({ version: null, onProgress: ({ percent }) => envia({ fase: 'motor', progresso: percent }) }),
  });

  const nucleos = os.cpus().length;
  const concurrency = Math.max(1, Math.min(nucleos - 1, Math.round(nucleos * 0.75)));
  const serveUrl = `http://127.0.0.1:${porta}/render/${encodeURIComponent(pasta)}/`;
  envia({ fase: 'preparando', progresso: 0, nucleos: concurrency });
  const composition = await selectComposition({ serveUrl, id: pacote.composicao, inputProps: props, browserExecutable });
  const saida = path.join(rendersDir, nome + '.mp4');
  const { cancelSignal, cancel } = makeCancelSignal();
  cancelar = cancel;
  const t0 = Date.now();
  try {
    await renderMedia({
      composition, serveUrl, codec: 'h264', crf: 20, outputLocation: saida, inputProps: props, concurrency, cancelSignal, browserExecutable,
      hardwareAcceleration: 'if-possible',
      onProgress: (p) => envia({ fase: 'renderizando', progresso: p.progress, frames: p.renderedFrames, total: composition.durationInFrames,
        restante: p.renderEstimatedTime, etapa: p.stitchStage, nucleos: concurrency }),
    });
  } finally { cancelar = null; }
  const segundos = Math.round((Date.now() - t0) / 1000);
  envia({ fase: 'pronto', progresso: 1, saida, segundos, nucleos: concurrency });
  return { saida, segundos };
}

/* ---------------------------------------------------------------- janela */
function criarJanela() {
  const w = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 700, backgroundColor: '#050505', title: 'Euforia Studio',
    autoHideMenuBar: true, icon: path.join(RECURSOS, 'ui', 'icone.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  w.loadURL(`http://127.0.0.1:${porta}/`);
  w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

const atualizacao = require('./atualizar');
ipcMain.handle('estudio:atualizacao', () => atualizacao.procurar(app.getVersion(), raiz()));
ipcMain.handle('estudio:atualizar', async (e, instalador) => {
  await atualizacao.instalar(instalador, (p) => !e.sender.isDestroyed() && e.sender.send('estudio:baixando', p));
  setTimeout(() => app.quit(), 800); // o instalador fecha e reabre o Studio na versão nova
  return true;
});
// novidades: mostra uma vez, na primeira vez que a versão abre
ipcMain.handle('estudio:novidades', () => {
  const c = lerConfig();
  const v = app.getVersion();
  if (c.ultimaVersao === v) return null;
  gravarConfig({ ...c, ultimaVersao: v });
  if (!c.ultimaVersao) return null; // instalação nova: nada a contar
  try { return { versao: v, itens: JSON.parse(fs.readFileSync(path.join(__dirname, 'novidades.json'), 'utf8'))[v] || [] }; } catch { return null; }
});

ipcMain.handle('estudio:info', () => {
  const cpus = os.cpus();
  return { versao: app.getVersion(), nucleos: cpus.length, cpu: cpus[0]?.model?.trim() ?? '', memoria: Math.round(os.totalmem() / 2 ** 30),
    raiz: raiz(), raizExiste: fs.existsSync(raiz()), pc: os.hostname() };
});
ipcMain.handle('estudio:listar', () => listar());
ipcMain.handle('estudio:escolherPasta', async () => {
  const r = await dialog.showOpenDialog({ title: 'Pasta dos projetos da máquina', properties: ['openDirectory'], defaultPath: raiz() });
  if (r.canceled || !r.filePaths[0]) return null;
  gravarConfig({ ...lerConfig(), raiz: r.filePaths[0] });
  return r.filePaths[0];
});
ipcMain.handle('estudio:renderizar', renderizar);
ipcMain.handle('estudio:cancelar', () => { if (cancelar) cancelar(); return true; });
ipcMain.handle('estudio:mostrar', (_e, arq) => { shell.showItemInFolder(arq); return true; });
ipcMain.handle('estudio:abrir', (_e, arq) => shell.openPath(arq));

app.whenReady().then(() => {
  servidor.listen(0, '127.0.0.1', () => {
    porta = servidor.address().port;
    criarJanela();
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

module.exports = { listar, renderizar }; // para teste fora da janela
