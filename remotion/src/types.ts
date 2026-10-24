export type Segment = { srcStart: number; srcEnd: number; outStart: number };
export type Framing = { start: number; end: number; scale: number; originY: number };
export type CapWord = { text: string; start: number; hl: boolean };
export type Caption = { start: number; end: number; hook: boolean; words: CapWord[] };
export type Cartao = {
  start: number;
  end: number;
  palavras: { text: string; start: number }[];
  circular?: string | null;
  referencia?: string | null;
  autor?: string | null; // citação: nome do autor embaixo, com aspas grandes (modelo Nova Acrópole)
};
// src .jpg/.png = foto real (entra com movimento lento); legenda = crédito discreto (obra, autor, museu)
export type Broll = { start: number; end: number; src: string; mode: 'dividido' | 'cheio'; legenda?: string | null };

export type ShortProps = {
  fps: number;
  duration: number; // segundos
  video: string; // arquivo em public/
  segments: Segment[];
  framing: Framing[];
  captions: Caption[];
  brolls: Broll[];
  cartoes?: Cartao[];
  logo: string | null;
  musica?: { src: string; volume: number } | null; // trilha em public/, volume 0-1 (ex.: 0.08)
  estilo: {
    corDestaque: string; // viral: #FAC800
    fonte: string;
    corFundoCartao?: string; // institucional: cor clara do cliente
    corTextoCartao?: string; // institucional: cor escura do cliente
    corLegenda?: string; // institucional: legenda branca por padrão; Nova Acrópole: amarela
  };
};
