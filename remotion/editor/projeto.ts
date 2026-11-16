// Projeto do editor: o que a máquina de shorts montou (props do Remotion) + o que a pessoa ajustou.
// Funções puras, sem React, para dar para testar e reaproveitar no servidor.
import type { Broll, Caption, Cartao, Segment, ShortProps } from '../src/types';

export type ComId<T> = T & { _id: string };
export type PropsEditor = Omit<ShortProps, 'captions' | 'brolls' | 'cartoes' | 'segments'> & {
  captions: ComId<Caption>[];
  brolls: ComId<Broll>[];
  cartoes: ComId<Cartao>[];
  segments: ComId<Segment>[];
};

export type Projeto = {
  versao: 1;
  id: string; // ex.: "elis-sarlo-video-03-short-1"
  cliente: string;
  titulo: string;
  composicao: 'ShortViral' | 'ShortInstitucional';
  base: string; // URL (ou caminho relativo) onde estão vídeo, B-rolls, logo e trilha
  props: ShortProps;
  registro?: string[]; // o que a máquina fez, linha a linha
  maquina?: { por_que?: string; nota_confianca?: number; gancho?: string };
  biblioteca?: { src: string; descricao: string }[]; // B-rolls que a pessoa pode pôr no short
  salvar?: string; // endpoint que recebe o resultado (n8n); sem ele, baixa o arquivo
};

export type Ajuste = { tipo: string; alvo: string; de?: unknown; para?: unknown; texto: string };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function anotar(p: ShortProps): PropsEditor {
  return {
    ...p,
    captions: p.captions.map((c, i) => ({ ...c, words: c.words.map((w) => ({ ...w })), _id: `leg${i}` })),
    brolls: p.brolls.map((b, i) => ({ ...b, _id: `br${i}` })),
    cartoes: (p.cartoes ?? []).map((c, i) => ({ ...c, palavras: c.palavras.map((w) => ({ ...w })), _id: `ca${i}` })),
    segments: p.segments.map((s, i) => ({ ...s, _id: `co${i}` })),
  };
}

/** Props limpas para o render (sem os _id do editor). */
export function limpar(p: PropsEditor): ShortProps {
  const tira = <T extends { _id?: string }>(x: T) => {
    const { _id, ...resto } = x;
    return resto;
  };
  return {
    ...p,
    captions: p.captions.map(tira) as Caption[],
    brolls: p.brolls.map(tira) as Broll[],
    cartoes: p.cartoes.map(tira) as Cartao[],
    segments: p.segments.map(tira) as Segment[],
  };
}

export const durSeg = (s: Segment) => s.srcEnd - s.srcStart;

/** Tira um pedaço (corte) do short: some o que estava dentro e puxa o resto para trás. */
export function removerCorte(p: PropsEditor, id: string): PropsEditor {
  const s = p.segments.find((x) => x._id === id);
  if (!s || p.segments.length < 2) return p;
  const a = s.outStart;
  const b = a + durSeg(s);
  const d = b - a;
  const desloca = (t: number) => (t >= b ? t - d : t > a ? a : t);
  const sobra = <T extends { start: number; end: number }>(x: T) => !(x.start >= a - 0.01 && x.end <= b + 0.01);
  const ajusta = <T extends { start: number; end: number }>(x: T): T => ({ ...x, start: r2(desloca(x.start)), end: r2(desloca(x.end)) });
  return {
    ...p,
    duration: r2(p.duration - d),
    segments: p.segments.filter((x) => x._id !== id).map((x) => (x.outStart >= b - 0.01 ? { ...x, outStart: r2(x.outStart - d) } : x)),
    captions: p.captions
      .filter((c) => !(c.start >= a - 0.01 && c.start < b - 0.01))
      .map((c) => ({ ...ajusta(c), words: c.words.map((w) => ({ ...w, start: r2(desloca(w.start)) })) })),
    brolls: p.brolls.filter(sobra).map(ajusta).filter((x) => x.end - x.start > 0.3),
    cartoes: p.cartoes
      .filter(sobra)
      .map((c) => ({ ...ajusta(c), palavras: c.palavras.map((w) => ({ ...w, start: r2(desloca(w.start)) })) }))
      .filter((x) => x.end - x.start > 0.3),
    framing: p.framing.filter(sobra).map(ajusta).filter((x) => x.end - x.start > 0.05),
  };
}

const textoLeg = (c: Caption) => c.words.map((w) => w.text).join(' ');
const hlLeg = (c: Caption) => c.words.filter((w) => w.hl).map((w) => w.text).join(', ');
const textoCartao = (c: Cartao) => c.palavras.map((w) => w.text).join(' ');
const mudouTempo = (x: { start: number; end: number }, y: { start: number; end: number }) =>
  Math.abs(x.start - y.start) > 0.05 || Math.abs(x.end - y.end) > 0.05;
const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** O que a pessoa mudou em relação ao que a máquina entregou. É isso que vira aprendizado. */
export function diferencas(orig: PropsEditor, atual: PropsEditor, nomeArq: (src: string) => string = (s) => s.split('/').pop() ?? s): Ajuste[] {
  const out: Ajuste[] = [];
  const porId = <T extends { _id: string }>(l: T[]) => new Map(l.map((x) => [x._id, x]));

  const segA = porId(atual.segments);
  for (const s of orig.segments)
    if (!segA.has(s._id))
      out.push({ tipo: 'corte_removido', alvo: s._id, de: [s.srcStart, s.srcEnd], texto: `Tirou o trecho ${tc(s.srcStart)}–${tc(s.srcEnd)} do original (${durSeg(s).toFixed(1)} s)` });

  const legA = porId(atual.captions);
  for (const c of orig.captions) {
    const n = legA.get(c._id);
    if (!n) {
      if (segA.size === orig.segments.length) out.push({ tipo: 'legenda_removida', alvo: c._id, de: textoLeg(c), texto: `Apagou a legenda "${textoLeg(c)}"` });
      continue;
    }
    if (textoLeg(c) !== textoLeg(n)) out.push({ tipo: 'legenda_texto', alvo: c._id, de: textoLeg(c), para: textoLeg(n), texto: `Legenda: "${textoLeg(c)}" → "${textoLeg(n)}"` });
    if (hlLeg(c) !== hlLeg(n)) out.push({ tipo: 'legenda_destaque', alvo: c._id, de: hlLeg(c), para: hlLeg(n), texto: `Destaque: "${hlLeg(c) || 'nenhum'}" → "${hlLeg(n) || 'nenhum'}"` });
  }

  const brA = porId(atual.brolls);
  const brO = porId(orig.brolls);
  for (const b of orig.brolls) {
    const n = brA.get(b._id);
    if (!n) out.push({ tipo: 'broll_removido', alvo: b._id, de: b.src, texto: `Tirou o B-roll ${nomeArq(b.src)} (${tc(b.start)})` });
    else {
      if (n.src !== b.src) out.push({ tipo: 'broll_trocado', alvo: b._id, de: b.src, para: n.src, texto: `Trocou o B-roll ${nomeArq(b.src)} por ${nomeArq(n.src)}` });
      if (n.mode !== b.mode) out.push({ tipo: 'broll_modo', alvo: b._id, de: b.mode, para: n.mode, texto: `B-roll ${nomeArq(n.src)}: ${b.mode} → ${n.mode}` });
      if (mudouTempo(b, n) && segA.size === orig.segments.length)
        out.push({ tipo: 'broll_tempo', alvo: b._id, de: [b.start, b.end], para: [n.start, n.end], texto: `Moveu o B-roll ${nomeArq(n.src)} para ${tc(n.start)}–${tc(n.end)}` });
    }
  }
  for (const b of atual.brolls)
    if (!brO.has(b._id)) out.push({ tipo: 'broll_novo', alvo: b._id, para: b.src, texto: `Pôs o B-roll ${nomeArq(b.src)} em ${tc(b.start)}` });

  const caA = porId(atual.cartoes);
  for (const c of orig.cartoes) {
    const n = caA.get(c._id);
    if (!n) out.push({ tipo: 'cartao_removido', alvo: c._id, de: textoCartao(c), texto: `Tirou o cartão "${textoCartao(c)}"` });
    else if (textoCartao(c) !== textoCartao(n)) out.push({ tipo: 'cartao_texto', alvo: c._id, de: textoCartao(c), para: textoCartao(n), texto: `Cartão: "${textoCartao(c)}" → "${textoCartao(n)}"` });
  }

  if (orig.estilo.corDestaque !== atual.estilo.corDestaque)
    out.push({ tipo: 'cor_destaque', alvo: 'estilo', de: orig.estilo.corDestaque, para: atual.estilo.corDestaque, texto: `Cor do destaque ${orig.estilo.corDestaque} → ${atual.estilo.corDestaque}` });
  const vo = orig.musica?.volume ?? 0;
  const va = atual.musica?.volume ?? 0;
  if (Math.abs(vo - va) > 0.001) out.push({ tipo: 'musica_volume', alvo: 'musica', de: vo, para: va, texto: `Volume da trilha ${Math.round(vo * 100)}% → ${Math.round(va * 100)}%` });
  return out;
}
