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
  ...(process.platform === 'win32' ? require('./atualizar').noDrive('EDITOR') : []),
  path.join(os.homedir(), 'Documents', 'Euforia Studio'),
];

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')); } catch { return {}; }
}
function gravarConfig(c) {
  fs.mkdirSync(path.dirname(CONFIG()), { recursive: true });
  fs.writeFileSync(CONFIG(), JSON.stringify(c, null, 1));
}
// Brutos abertos no Studio ficam no PC (não no Drive): a prévia de um bruto de 1 h passa de 200 MB.
const BRUTOS = () => process.env.ESTUDIO_BRUTOS || path.join(app.getPath('documents'), 'Euforia Studio', 'Brutos');
const PREFIXO_BRUTO = '@brutos/';
/** Pasta de um projeto pelo nome da lista ("<pasta>" na raiz ou "@brutos/<pasta>" no PC). */
function pastaDir(pasta) {
  return pasta.startsWith(PREFIXO_BRUTO) ? dentro(BRUTOS(), pasta.slice(PREFIXO_BRUTO.length)) : dentro(raiz(), pasta);
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
  if (p.startsWith('/projetos/' + PREFIXO_BRUTO)) arq = dentro(BRUTOS(), p.slice(('/projetos/' + PREFIXO_BRUTO).length));
  else if (p.startsWith('/projetos/')) arq = dentro(raiz(), p.slice('/projetos/'.length));
  else if (p.startsWith('/render/')) {
    // /render/<pasta do pedido>/public/... = mídia do pedido; o resto = site do Remotion
    const [, , pasta, ...resto] = p.split('/');
    const rel = resto.join('/');
    if (rel.startsWith('public/')) arq = dentro(path.join(pastaDir(pasta) || raiz(), basePasta(pasta)), rel.slice('public/'.length));
    else arq = dentro(BUNDLE, rel || 'index.html');
  } else arq = dentro(EDITOR, p === '/' ? 'index.html' : p.slice(1));
  if (!arq) { res.writeHead(403); return res.end(); }
  servirArquivo(req, res, arq);
});

/* ---------------------------------------------------------------- projetos */
const enc = (pasta) => pasta.split('/').map(encodeURIComponent).join('/');
// pasta da mídia do projeto: "midia" (como sai da máquina) ou "." (projeto plano, como sobe para o Drive)
function basePasta(pasta) {
  try {
    const dir = pastaDir(pasta);
    const pj = fs.readdirSync(dir).find((f) => /^projeto-\d+\.json$/.test(f));
    return JSON.parse(fs.readFileSync(path.join(dir, pj), 'utf8')).base || 'midia';
  } catch { return 'midia'; }
}

function listar() {
  const out = [];
  const ler = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
  const pastas = [...ler(raiz()), ...ler(BRUTOS()).map((n) => PREFIXO_BRUTO + n)];
  for (const pasta of pastas) {
    const dir = pastaDir(pasta);
    if (!dir) continue;
    let arqs = [];
    try { arqs = fs.readdirSync(dir).filter((f) => /^projeto-\d+\.json$/.test(f)); } catch { continue; }
    for (const arquivo of arqs) {
      try {
        const full = path.join(dir, arquivo);
        const p = JSON.parse(fs.readFileSync(full, 'utf8'));
        const longo = p.tipo === 'longo' ? p.longo : null;
        const rendersDir = path.join(dir, 'renders');
        const renders = fs.existsSync(rendersDir) ? fs.readdirSync(rendersDir).filter((f) => f.startsWith(p.id) && f.endsWith('.mp4')) : [];
        const ultimo = renders.map((f) => ({ f, t: fs.statSync(path.join(rendersDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
        out.push({
          pasta, arquivo, id: p.id, tipo: p.origem === 'bruto' ? 'bruto' : longo ? 'longo' : 'short', cliente: p.cliente, titulo: p.titulo, composicao: p.composicao,
          duracao: longo ? longo.trechos.reduce((n, t) => n + t.fim - t.ini, 0) : p.props?.duration ?? 0,
          confianca: p.maquina?.nota_confianca ?? null,
          url: `/projetos/${enc(pasta)}/${arquivo}`,
          capa: (longo?.previa || p.props?.video) ? `/projetos/${enc(pasta)}/${p.base || 'midia'}/${longo ? longo.previa : p.props.video}` : null,
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
  const dir = pastaDir(pasta);
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
    // textos feitos no Studio: desenha cada um (Remotion) antes, e o ffmpeg põe por cima como os da máquina
    const maquina = pacote.destino === 'maquina';
    if (!maquina && longo.elementos.some((e) => e.texto != null)) await desenharTextos(longo, rendersDir, envia);
    const projArq = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /^projeto-\d+\.json$/.test(f))), 'utf8'));
    const midia = path.join(dir, projArq.base || 'midia');
    let saida = path.join(rendersDir, nome + '.mp4');
    let pedido = null;
    if (maquina) { // o corte vai para a ENTRADA DO STUDIO no Drive; a máquina de longos pega e termina
      const limpo = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80);
      const base = `${limpo(pacote.cliente) || 'Sem cliente'} - ${limpo(pacote.titulo) || 'Sem título'} ${carimbo}`;
      const entrada = pastaEntrada();
      fs.mkdirSync(entrada, { recursive: true });
      saida = path.join(entrada, base + '.mp4');
      pedido = { versao: 1, cliente: pacote.cliente, titulo: pacote.titulo, observacoes: pacote.observacoes || '', enviado_por: pacote.editado_por,
        pc: os.hostname(), enviado_em: new Date().toISOString(), video: base + '.mp4', duracao: longo.trechos.reduce((n, x) => n + x.fim - x.ini, 0),
        cortes: longo.trechos.length - 1, origem: path.basename(longo.video || '') };
      longo.cru = true;
    }
    envia({ fase: 'preparando', progresso: 0, nucleos });
    const r = renderizarLongo(longo, midia, saida, (x) => envia({ fase: 'renderizando', progresso: x.progresso, restante: x.restante, nucleos }));
    cancelar = r.cancelar;
    try {
      const { segundos } = await r.pronto;
      // o .json por último: a máquina só pega o pedido quando ele aparece (o vídeo já terminou de gravar)
      if (pedido) fs.writeFileSync(saida.replace(/\.mp4$/, '.json'), JSON.stringify(pedido, null, 1));
      envia({ fase: 'pronto', progresso: 1, saida, segundos, nucleos, maquina });
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
  const serveUrl = `http://127.0.0.1:${porta}/render/${encodeURIComponent(pasta)}/`; // shorts: só da raiz
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

/** Desenha os textos novos (texto-chave e lower com transparência, cartão em mp4) e troca o arquivo de cada um.
 *  Guarda por conteúdo: o mesmo texto com as mesmas cores não é desenhado de novo. */
async function desenharTextos(L, rendersDir, envia) {
  const crypto = require('node:crypto');
  const { ensureBrowser, selectComposition, renderMedia } = require('@remotion/renderer');
  const browserExecutable = process.env.ESTUDIO_CHROME || null;
  process.chdir(app.getPath('userData'));
  envia({ fase: 'motor', progresso: 0 });
  await ensureBrowser({ browserExecutable, onBrowserDownload: () => ({ version: null, onProgress: ({ percent }) => envia({ fase: 'motor', progresso: percent }) }) });
  const pasta = path.join(rendersDir, 'textos');
  fs.mkdirSync(pasta, { recursive: true });
  const { w, h } = quadro(L);
  const paleta = { fundo: '#050505', destaque: '#FF6518', destaque2: '#FEB089', texto: '#FFFFFF', degrade: true, ...(L.paleta || {}) };
  const serveUrl = `http://127.0.0.1:${porta}/render/_/`;
  const textos = L.elementos.filter((e) => e.texto != null);
  const nucleos = os.cpus().length;
  for (const [i, e] of textos.entries()) {
    const props = { tipo: e.camada, texto: e.texto, sub: e.sub, dur: e.dur, paleta, largura: w, altura: h };
    const alfa = e.camada !== 'full';
    const saida = path.join(pasta, crypto.createHash('sha1').update(JSON.stringify(props)).digest('hex').slice(0, 16) + (alfa ? '.mov' : '.mp4'));
    envia({ fase: 'preparando', progresso: i / textos.length, msg: `Desenhando os textos (${i + 1} de ${textos.length})` });
    if (!fs.existsSync(saida)) {
      const id = { kw: 'TextoChave', lw: 'Lower', full: 'Cartao' }[e.camada];
      const composition = await selectComposition({ serveUrl, id, inputProps: props, browserExecutable });
      const tmp = saida + '.parte' + (alfa ? '.mov' : '.mp4');
      await renderMedia({
        composition, serveUrl, inputProps: props, browserExecutable, outputLocation: tmp, concurrency: Math.max(1, Math.min(nucleos - 1, 8)),
        ...(alfa ? { codec: 'prores', proResProfile: '4444', imageFormat: 'png', pixelFormat: 'yuva444p10le' } : { codec: 'h264', crf: 16 }),
      });
      fs.renameSync(tmp, saida);
    }
    e.arquivo = saida; // caminho completo: o longo.js aceita
  }
}
/** ENTRADA DO STUDIO: ao lado da pasta EDITOR no Drive (a máquina lê de lá); sem Drive, nos Documentos. */
function pastaEntrada() {
  if (process.env.ESTUDIO_ENTRADA) return process.env.ESTUDIO_ENTRADA;
  const r = raiz();
  if (path.basename(r).toUpperCase() === 'EDITOR' && fs.existsSync(path.dirname(r))) return path.join(path.dirname(r), 'ENTRADA DO STUDIO');
  return path.join(app.getPath('documents'), 'Euforia Studio', 'Para a máquina');
}
function quadro(L) { // igual ao do editor: até 1080p
  const { largura: w, altura: h } = L;
  if (w <= 1920 && h <= 1920) return { w, h };
  const par = (x) => Math.round(x / 2) * 2;
  return w >= h ? { w: 1920, h: par((h * 1920) / w) } : { w: par((w * 1920) / h), h: 1920 };
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
// Novo projeto com bruto: escolhe o vídeo, prepara prévia e onda, devolve o item para abrir direto
ipcMain.handle('estudio:novoBruto', async (e, teste) => {
  let arquivo = process.env.ESTUDIO_TESTE && teste ? teste : null; // teste automático sem a janela de escolher
  if (!arquivo) {
    const r = await dialog.showOpenDialog({ title: 'Escolha o vídeo bruto', properties: ['openFile'],
      filters: [{ name: 'Vídeos', extensions: ['mp4', 'mov', 'mkv', 'm4v', 'avi', 'mts', 'webm', 'MP4', 'MOV'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    arquivo = r.filePaths[0];
  }
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const nome = `${path.basename(arquivo).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)} ${carimbo}`;
  const { prepararBruto } = require('./bruto');
  const envia = (x) => !e.sender.isDestroyed() && e.sender.send('estudio:bruto', x);
  envia({ nome: path.basename(arquivo), progresso: 0 });
  const r = prepararBruto(arquivo, path.join(BRUTOS(), nome), (p) => envia({ nome: path.basename(arquivo), progresso: p }));
  cancelar = r.cancelar;
  try { await r.pronto; } finally { cancelar = null; }
  return listar().find((i) => i.pasta === PREFIXO_BRUTO + nome) ?? null;
});
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
