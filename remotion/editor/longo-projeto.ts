// Projeto do vídeo LONGO no Studio: o que a máquina de longos montou (longos/studio.py) + o que a pessoa ajustou.
// Trechos = pedaços do base.mp4 (a fala já cortada pela máquina) que ficam, na ordem; elementos = B-roll, telas cheias
// (título, cartões, mapa), textos-chave e lowers, com tempo no vídeo final. Funções puras, sem React.
import type { Ajuste } from './projeto';

export type Camada = 'broll' | 'full' | 'kw' | 'lw';
export type Elemento = { camada: Camada; arquivo: string; inicio: number; dur: number; rotulo: string; w: number; h: number; y: number };
export type Trecho = { ini: number; fim: number };
export type DadosLongo = {
  fps: number; largura: number; altura: number; video: string; previa: string;
  trechos: Trecho[]; elementos: Elemento[];
  fim: { arquivo: string; dur: number } | null;
  musica: { arquivo: string; volume_db: number } | null;
  palavras: { w: string; t: number }[];
};
export type ProjetoLongo = {
  versao: 1; tipo: 'longo'; id: string; cliente: string; titulo: string; composicao: 'Longo'; base: string;
  longo: DadosLongo; registro?: string[]; maquina?: { por_que?: string; nota_confianca?: number };
  biblioteca?: { src: string; descricao: string }[];
};
type ComId<T> = T & { _id: string };
export type LongoEd = Omit<DadosLongo, 'trechos' | 'elementos'> & { trechos: ComId<Trecho>[]; elementos: ComId<Elemento>[] };

export const NOME_CAMADA: Record<Camada, string> = { broll: 'B-roll', full: 'Tela cheia', kw: 'Texto-chave', lw: 'Lower' };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function anotarLongo(d: DadosLongo): LongoEd {
  return { ...d, trechos: d.trechos.map((t, i) => ({ ...t, _id: `t${i}` })), elementos: d.elementos.map((e, i) => ({ ...e, _id: `e${i}` })) };
}
export function limparLongo(L: LongoEd): DadosLongo {
  return {
    ...L,
    trechos: L.trechos.map(({ _id, ...t }) => t), // eslint-disable-line @typescript-eslint/no-unused-vars
    elementos: [...L.elementos].sort((a, b) => a.inicio - b.inicio).map(({ _id, ...e }) => e), // eslint-disable-line @typescript-eslint/no-unused-vars
  };
}

/** Duração da fala (sem a tela final). */
export const duracao = (L: { trechos: Trecho[] }) => L.trechos.reduce((n, t) => n + (t.fim - t.ini), 0);
/** Onde cada trecho começa no vídeo final. */
export function inicios(L: { trechos: Trecho[] }): number[] {
  let o = 0;
  return L.trechos.map((t) => { const x = o; o += t.fim - t.ini; return x; });
}
/** Tempo do vídeo final → tempo no base.mp4 (o "conteúdo": o que está sendo falado ali). */
export function paraBase(L: { trechos: Trecho[] }, tOut: number): number {
  const os_ = inicios(L);
  for (let i = 0; i < L.trechos.length; i++) {
    const d = L.trechos[i].fim - L.trechos[i].ini;
    if (tOut < os_[i] + d || i === L.trechos.length - 1) return L.trechos[i].ini + Math.max(0, tOut - os_[i]);
  }
  return tOut;
}
/** Palavras com o tempo no vídeo final (só as dos trechos que ficaram). */
export function palavrasSaida(L: LongoEd): { w: string; t: number }[] {
  const os_ = inicios(L);
  const out: { w: string; t: number }[] = [];
  L.trechos.forEach((tr, i) => {
    for (const p of L.palavras) if (p.t >= tr.ini - 0.01 && p.t < tr.fim) out.push({ w: p.w, t: os_[i] + (p.t - tr.ini) });
  });
  return out;
}
export function textoDoTrecho(L: { palavras: { w: string; t: number }[] }, ini: number, fim: number, max = 12): string {
  const ws = L.palavras.filter((p) => p.t >= ini - 0.01 && p.t < fim).map((p) => p.w);
  return ws.length > max ? `${ws.slice(0, max).join(' ')}…` : ws.join(' ');
}

/** Tira um trecho: o que começa dentro dele sai junto; o que vem depois é puxado para trás. */
export function removerTrecho(L: LongoEd, id: string): LongoEd {
  const i = L.trechos.findIndex((t) => t._id === id);
  if (i < 0 || L.trechos.length < 2) return L;
  const o = inicios(L)[i];
  const d = L.trechos[i].fim - L.trechos[i].ini;
  return {
    ...L,
    trechos: L.trechos.filter((t) => t._id !== id),
    elementos: L.elementos
      .filter((e) => e.inicio < o - 0.01 || e.inicio >= o + d - 0.01)
      .map((e) => (e.inicio >= o + d - 0.01 ? { ...e, inicio: r3(e.inicio - d) } : e)),
  };
}
/** Divide o trecho no ponto tOut do vídeo final (para depois tirar só um pedaço). */
export function dividirTrecho(L: LongoEd, id: string, tOut: number, novoId: string): LongoEd {
  const i = L.trechos.findIndex((t) => t._id === id);
  if (i < 0) return L;
  const tr = L.trechos[i];
  const corte = r3(tr.ini + (tOut - inicios(L)[i]));
  if (corte - tr.ini < 0.2 || tr.fim - corte < 0.2) return L;
  const trechos = [...L.trechos];
  trechos.splice(i, 1, { ...tr, fim: corte }, { _id: novoId, ini: corte, fim: tr.fim });
  return { ...L, trechos };
}

/** Elementos que se cruzam (a máquina também para nisso): tela cheia com tela cheia, texto de baixo com texto de baixo. */
export function sobreposicoes(L: LongoEd): { a: ComId<Elemento>; b: ComId<Elemento> }[] {
  const out: { a: ComId<Elemento>; b: ComId<Elemento> }[] = [];
  for (const grupo of [['broll', 'full'], ['kw', 'lw']]) {
    const xs = L.elementos.filter((e) => grupo.includes(e.camada)).sort((a, b) => a.inicio - b.inicio);
    for (let k = 1; k < xs.length; k++) if (xs[k - 1].inicio + xs[k - 1].dur > xs[k].inicio + 0.05) out.push({ a: xs[k - 1], b: xs[k] });
  }
  return out;
}

/** O que a pessoa mudou em relação à máquina (vai para ajustes.jsonl; a máquina aprende com isso). */
export function diferencasLongo(orig: LongoEd, atual: LongoEd, nomeArq: (s: string) => string): Ajuste[] {
  const out: Ajuste[] = [];
  // trechos tirados: partes do base que a máquina mantinha e não estão mais
  const fica = atual.trechos.map((t) => [t.ini, t.fim]).sort((a, b) => a[0] - b[0]);
  for (const t of orig.trechos) {
    let cur = t.ini;
    const pedacos: [number, number][] = [];
    for (const [a, b] of fica) {
      if (b <= cur || a >= t.fim) continue;
      if (a > cur) pedacos.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < t.fim) pedacos.push([cur, t.fim]);
    for (const [a, b] of pedacos) {
      if (b - a < 0.05) continue;
      out.push({ tipo: 'trecho_removido', alvo: `base:${r3(a)}`, de: { ini: r3(a), fim: r3(b) },
        texto: `Tirou ${(b - a).toFixed(1)} s da fala: "${textoDoTrecho(orig, a, b) || '(sem fala)'}"` });
    }
  }
  const porId = new Map(atual.elementos.map((e) => [e._id, e]));
  for (const e of orig.elementos) {
    const n = porId.get(e._id);
    const nome = `${NOME_CAMADA[e.camada]} "${e.camada === 'broll' ? nomeArq(e.arquivo) : e.rotulo}"`;
    if (!n) {
      // saiu junto com um trecho tirado? isso já está no ajuste do trecho
      const base = paraBase(orig, e.inicio);
      if (atual.trechos.some((t) => base >= t.ini - 0.01 && base < t.fim)) out.push({ tipo: 'elemento_removido', alvo: e._id, de: e.camada, texto: `Tirou ${nome}` });
      continue;
    }
    if (n.arquivo !== e.arquivo) out.push({ tipo: 'broll_trocado', alvo: e._id, de: nomeArq(e.arquivo), para: nomeArq(n.arquivo), texto: `Trocou o B-roll "${nomeArq(e.arquivo)}" por "${nomeArq(n.arquivo)}"` });
    const b0 = paraBase(orig, e.inicio), b1 = paraBase(atual, n.inicio);
    if (Math.abs(b0 - b1) > 0.05) out.push({ tipo: 'elemento_tempo', alvo: e._id, de: r3(e.inicio), para: r3(n.inicio), texto: `Moveu ${nome} ${b1 > b0 ? 'para depois' : 'para antes'} (${Math.abs(b1 - b0).toFixed(1)} s)` });
    if (Math.abs(n.dur - e.dur) > 0.05) out.push({ tipo: 'elemento_duracao', alvo: e._id, de: r3(e.dur), para: r3(n.dur), texto: `${nome}: ${e.dur.toFixed(1)} s → ${n.dur.toFixed(1)} s` });
  }
  const ids = new Set(orig.elementos.map((e) => e._id));
  for (const n of atual.elementos) {
    if (!ids.has(n._id)) out.push({ tipo: 'broll_novo', alvo: n._id, para: nomeArq(n.arquivo), texto: `Pôs o B-roll "${nomeArq(n.arquivo)}" em ${tc(n.inicio)}` });
  }
  if (orig.musica && atual.musica && orig.musica.volume_db !== atual.musica.volume_db) {
    out.push({ tipo: 'musica_volume', alvo: 'musica', de: orig.musica.volume_db, para: atual.musica.volume_db, texto: `Trilha de ${orig.musica.volume_db} dB para ${atual.musica.volume_db} dB` });
  }
  return out;
}
