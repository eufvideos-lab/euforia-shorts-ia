// Grafismos do vídeo longo (formato Padrão) em React, iguais aos que a máquina desenha em longos/gfx.py:
// texto-chave (caps grande com sombra e pop), lower (caixa na cor da marca que abre do centro) e cartão de tela cheia.
// Servem para a prévia do Studio (Player) e para o render no PC (composições TextoChave, Lower e Cartao), sempre nas
// cores do cliente. Texto: "|" quebra a linha e *palavra* vira destaque na cor do cliente.
import React from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import black from './fontes/InterDisplay-Black.otf';
import semibold from './fontes/InterDisplay-SemiBold.otf';

export type Paleta = { fundo: string; destaque: string; destaque2: string; texto: string; caixa?: string; brilho?: string; degrade: boolean };
export const PALETA_EUFORIA: Paleta = { fundo: '#050505', destaque: '#FF6518', destaque2: '#FEB089', texto: '#FFFFFF', degrade: true };
export type TipoTexto = 'kw' | 'lw' | 'full';
export type TextoProps = { tipo: TipoTexto; texto: string; sub?: string; dur: number; paleta: Paleta; largura: number; altura: number };
/** Altura de cada grafismo (o texto-chave e o lower ficam colados embaixo do quadro). */
export const ALTURA = (tipo: TipoTexto, altura: number) => (tipo === 'kw' ? 420 : tipo === 'lw' ? 240 : altura);

// fonte da marca (Inter Display), carregada uma vez
const FONTE = 'Inter Display Euforia';
let carregada: Promise<unknown> | null = null;
function carregarFonte() {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return null;
  if (!carregada) {
    const fs = [new FontFace(FONTE, `url(${black})`, { weight: '900' }), new FontFace(FONTE, `url(${semibold})`, { weight: '600' })];
    carregada = Promise.all(fs.map((f) => f.load().then((x) => document.fonts.add(x)))).catch(() => null);
  }
  return carregada;
}
function useFonte() {
  const [h] = React.useState(() => delayRender('fonte Inter Display'));
  React.useEffect(() => {
    const p = carregarFonte();
    if (!p) { continueRender(h); return; }
    p.then(() => continueRender(h));
  }, [h]);
}

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const easeIn = (x: number) => clamp(x) ** 3;
const easeBack = (x: number) => { const c1 = 1.7, c3 = c1 + 1, y = clamp(x); return 1 + c3 * (y - 1) ** 3 + c1 * (y - 1) ** 2; };

/** "Somos *líderes*" → partes com destaque. */
function partes(linha: string) {
  return linha.split('*').map((t, i) => ({ t, hl: i % 2 === 1 })).filter((p) => p.t);
}
const destaque = (P: Paleta): React.CSSProperties => (P.degrade
  ? { backgroundImage: `linear-gradient(90deg, ${P.destaque2}, ${P.destaque})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
  : { color: P.destaque });
const sombra = 'drop-shadow(0 8px 14px rgba(0,0,0,.85)) drop-shadow(2px 4px 2px rgba(0,0,0,.6))';

function Linha({ texto, P, tam, caps }: { texto: string; P: Paleta; tam: number; caps?: boolean }) {
  return (
    <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: tam, lineHeight: 1.1, whiteSpace: 'nowrap', color: P.texto, filter: sombra,
      wordSpacing: tam >= 80 ? '0.22em' : undefined }}>
      {partes(caps ? texto.toUpperCase() : texto).map((p, i) => <span key={i} style={p.hl ? destaque(P) : undefined}>{p.t}</span>)}
    </div>
  );
}

/** Texto-chave: caps grande, sombra, surge com pop e sai encolhendo (até 3 linhas com "|"). */
export const TextoChave: React.FC<{ texto: string; dur: number; paleta: Paleta; alt?: number }> = ({ texto, dur, paleta, alt }) => {
  useFonte();
  const cfg = useVideoConfig();
  const t = useCurrentFrame() / cfg.fps;
  const height = alt ?? cfg.height;
  const linhas = texto.split('|').map((l) => l.trim()).filter(Boolean);
  return (
    <AbsoluteFill>
      {linhas.map((l, i) => {
        const p = (t - 0.07 * i) / 0.38;
        const q = (t - (dur - 0.28)) / 0.28;
        const a = easeOut(p / 0.6) * (1 - easeIn(q));
        const sc = (p < 1 ? 0.55 + 0.45 * easeBack(p) : 1) * (1 - 0.12 * easeIn(q));
        const cy = height - 60 - (linhas.length - i - 0.5) * 112 + (1 - easeOut(p)) * 30;
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: cy, display: 'flex', justifyContent: 'center',
            transform: `translateY(-50%) scale(${sc})`, opacity: a }}>
            <Linha texto={l} P={paleta} tam={92} caps />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Lower: caixa na cor (ou degradê) da marca abre do centro, texto sobe; sai ao contrário. */
export const Lower: React.FC<{ texto: string; dur: number; paleta: Paleta; alt?: number }> = ({ texto, dur, paleta, alt }) => {
  useFonte();
  const cfg = useVideoConfig();
  const t = useCurrentFrame() / cfg.fps;
  const height = alt ?? cfg.height;
  const caixa = paleta.caixa || paleta.destaque;
  const pout = easeIn((t - (dur - 0.4)) / 0.4);
  const p = easeOut(t / 0.45) * (1 - pout);
  const ta = easeOut((t - 0.2) / 0.35) * (1 - pout);
  const fim = paleta.degrade ? `color-mix(in srgb, ${paleta.destaque2} 55%, ${caixa})` : caixa;
  const recorte = `inset(0 ${((1 - p) / 2) * 100}% 0 ${((1 - p) / 2) * 100}% round 16px)`;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: height - 60 - 74, display: 'flex', justifyContent: 'center' }}>
        <div style={{ filter: `drop-shadow(0 6px 14px rgba(0,0,0,${0.6 * p}))` }}>
          <div style={{ height: 74, padding: '0 34px', display: 'flex', alignItems: 'center', borderRadius: 16, clipPath: recorte,
            background: `linear-gradient(90deg, ${caixa}, ${fim})`, opacity: p > 0.01 ? 1 : 0 }}>
            <span style={{ fontFamily: FONTE, fontWeight: 900, fontSize: 40, color: paleta.texto, whiteSpace: 'nowrap', opacity: ta,
              transform: `translateY(${(1 - easeOut((t - 0.2) / 0.35)) * 14}px)` }}>{texto}</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Cartão de tela cheia: fundo da marca com luz que passeia, linhas surgem com pop e uma barra cresce embaixo. */
export const Cartao: React.FC<{ texto: string; sub?: string; paleta: Paleta; larg?: number; alt?: number }> = ({ texto, sub, paleta, larg, alt }) => {
  useFonte();
  const cfg = useVideoConfig();
  const t = useCurrentFrame() / cfg.fps;
  const width = larg ?? cfg.width, height = alt ?? cfg.height;
  const linhas = texto.split('|').map((l) => l.trim()).filter(Boolean);
  const tam = 104, lh = Math.round(tam * 1.18);
  const tot = lh * linhas.length + (sub ? 70 : 0);
  const y0 = height / 2 - tot / 2;
  const cx = 50 + 18 * Math.sin(t * 0.5), cy = 55 + 10 * Math.cos(t * 0.4);
  const brilho = paleta.brilho || paleta.destaque;
  const sa = easeOut(t / 0.35);
  const bw = easeOut((t - 0.35) / 0.5) * 170;
  return (
    <AbsoluteFill style={{ background: paleta.fundo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${cx}% ${cy}%, color-mix(in srgb, ${brilho} 38%, transparent), transparent ${Math.round(width * 0.85)}px)` }} />
      {sub && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: y0 - 40 - (1 - sa) * 20, textAlign: 'center', opacity: sa,
          fontFamily: FONTE, fontWeight: 600, fontSize: 46, color: paleta.texto, filter: sombra }}>{sub}</div>
      )}
      {linhas.map((l, i) => {
        const p = (t - 0.12 - 0.12 * i) / 0.42;
        if (p <= 0) return null;
        const sc = p < 1 ? 0.7 + 0.3 * easeBack(p) : 1;
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: y0 + (sub ? 70 : 0) + lh * (i + 0.5), display: 'flex',
            justifyContent: 'center', transform: `translateY(-50%) scale(${sc})`, opacity: easeOut(p / 0.6) }}>
            <Linha texto={l} P={paleta} tam={tam} />
          </div>
        );
      })}
      {bw > 1 && (
        <div style={{ position: 'absolute', left: width / 2 - bw, width: bw * 2, height: 9, borderRadius: 4, background: paleta.destaque,
          top: y0 + (sub ? 70 : 0) + lh * linhas.length + 26 }} />
      )}
    </AbsoluteFill>
  );
};

/** Um grafismo qualquer pelo tipo (o que o Studio põe na prévia e o que o render desenha). */
export const Grafismo: React.FC<TextoProps> = ({ tipo, texto, sub, dur, paleta, largura, altura }) => {
  const alt = ALTURA(tipo, altura);
  return tipo === 'kw' ? <TextoChave texto={texto} dur={dur} paleta={paleta} alt={alt} />
    : tipo === 'lw' ? <Lower texto={texto} dur={dur} paleta={paleta} alt={alt} />
      : <Cartao texto={texto} sub={sub} paleta={paleta} larg={largura} alt={alt} />;
};

/** Composição do render: tamanho e duração vêm das props. */
export const GrafismoRender: React.FC<Record<string, unknown>> = (p) => <Grafismo {...(p as unknown as TextoProps)} />;
export const metaGrafismo = ({ props }: { props: Record<string, unknown> }) => {
  const p = props as unknown as TextoProps;
  return { fps: 30, durationInFrames: Math.max(1, Math.round(p.dur * 30)), width: p.largura, height: ALTURA(p.tipo, p.altura) };
};
