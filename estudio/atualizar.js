// Atualização automática do Euforia Studio pelo Drive (16/11/2026).
// Quem edita já tem o Drive para computador (os projetos vêm de lá), então a versão nova fica numa pasta do Drive
// compartilhado: 00 - SHORTS IA (MÁQUINA)/STUDIO, com o instalador e um versao.json:
//   {"versao": "0.2.1", "arquivo": "Euforia-Studio-Setup-0.2.1.exe", "novidades": ["...", "..."]}
// O app confere ao abrir e a cada 30 min; se houver versão maior, mostra "Atualizar" e, no clique, copia o instalador
// para a pasta temporária, abre e fecha o app (o instalador de um clique troca a versão e abre o Studio de novo).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** A pasta no Drive compartilhado em qualquer letra (o Drive para computador costuma ser G:, mas nem sempre). */
function noDrive(sub) {
  const letras = ['G', ...'DEFHIJKLMNOPQRSTUVWXYZ'.split('')];
  const out = [];
  for (const l of letras) for (const d of ['Drives compartilhados', 'Shared drives']) out.push(`${l}:\\${d}\\EUFORIA MEDIA\\00 - SHORTS IA (MÁQUINA)\\${sub}`);
  return out;
}
const PASTAS = process.platform === 'win32' ? noDrive('STUDIO') : [];

function maior(a, b) { // a > b em versão x.y.z
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function pastas(raizProjetos) {
  const lista = [];
  if (process.env.ESTUDIO_ATUALIZACOES) lista.push(process.env.ESTUDIO_ATUALIZACOES);
  if (raizProjetos) lista.push(path.join(raizProjetos, '..', 'STUDIO')); // ao lado da pasta EDITOR
  return [...lista, ...PASTAS];
}

/** Versão nova disponível ou null. */
function procurar(versaoAtual, raizProjetos) {
  for (const p of pastas(raizProjetos)) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(p, 'versao.json'), 'utf8'));
      const inst = path.join(p, v.arquivo);
      if (v.versao && maior(v.versao, versaoAtual) && fs.existsSync(inst)) {
        return { versao: v.versao, novidades: v.novidades || [], instalador: inst };
      }
    } catch { /* pasta não existe aqui ou versao.json ainda sincronizando */ }
  }
  return null;
}

/** Copia o instalador (pode estar só na nuvem: a cópia baixa) e abre. Quem chama fecha o app depois. */
async function instalar(instalador, aoProgresso) {
  const destino = path.join(os.tmpdir(), path.basename(instalador));
  const total = fs.statSync(instalador).size;
  await new Promise((ok, falha) => {
    let feito = 0;
    const ler = fs.createReadStream(instalador);
    ler.on('data', (d) => { feito += d.length; aoProgresso?.(total ? feito / total : 0); });
    ler.on('error', falha);
    const escrever = fs.createWriteStream(destino);
    escrever.on('error', falha);
    escrever.on('finish', ok);
    ler.pipe(escrever);
  });
  if (process.platform === 'win32') spawn(destino, [], { detached: true, stdio: 'ignore' }).unref();
  return destino;
}

module.exports = { noDrive, procurar, instalar, maior };
