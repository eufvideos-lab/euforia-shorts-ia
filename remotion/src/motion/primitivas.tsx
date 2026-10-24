// Peças de animação reaproveitáveis da Máquina de Motion (todas leem as cores da marca)
import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Marca, Palavra } from './tipos';

export const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const useTempo = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  return { frame, fps, t: frame / fps, W: width, H: height };
};

// mola a partir de `em` segundos (0 antes, ~1 depois)
export const mola = (frame: number, fps: number, em: number, cfg: Partial<{ damping: number; mass: number; stiffness: number }> = {}) =>
  spring({ frame: frame - Math.round(em * fps), fps, config: { damping: 15, mass: 0.7, stiffness: 120, ...cfg } });

export const suave = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], { ...CL, easing: Easing.bezier(0.22, 1, 0.36, 1) });

/* Fundo claro: brilhos na cor da marca que respiram, grade de pontos e partículas subindo */
export const Fundo: React.FC<{ m: Marca; escuro?: boolean }> = ({ m, escuro }) => {
  const { t, W, H } = useTempo();
  const brilho = escuro ? 'rgba(255,255,255,0.10)' : `${m.secundaria}22`;
  return (
    <AbsoluteFill
      style={{
        background: escuro ? `radial-gradient(ellipse at 50% 45%, ${m.secundaria} 0%, ${m.primaria} 45%, ${m.escura} 100%)` : m.fundo,
        overflow: 'hidden',
      }}
    >
      {!escuro && (
        <>
          <div style={{ position: 'absolute', width: 1300, height: 1300, borderRadius: '50%', left: -350 + Math.sin(t * 0.5) * 60, top: -650 + Math.cos(t * 0.4) * 50, background: `radial-gradient(circle, ${brilho} 0%, transparent 65%)` }} />
          <div style={{ position: 'absolute', width: 1400, height: 1400, borderRadius: '50%', right: -500 + Math.cos(t * 0.45) * 70, bottom: -800 + Math.sin(t * 0.35) * 60, background: `radial-gradient(circle, ${m.primaria}1c 0%, transparent 65%)` }} />
          <AbsoluteFill
            style={{
              backgroundImage: `radial-gradient(${m.primaria}26 1.6px, transparent 1.6px)`,
              backgroundSize: '38px 38px',
              backgroundPosition: `${(t * 6) % 38}px ${(t * 4) % 38}px`,
              WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, transparent 30%, black 95%)',
              maskImage: 'radial-gradient(ellipse at 50% 50%, transparent 30%, black 95%)',
            }}
          />
        </>
      )}
      {new Array(28).fill(0).map((_, i) => {
        const x = random(`px${i}`) * W;
        const vel = 18 + random(`pv${i}`) * 40;
        const y = H + 40 - ((random(`py${i}`) * H + t * vel) % (H + 80));
        const r = 3 + random(`pr${i}`) * 6;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x + Math.sin(t + i) * 12, top: y, width: r, height: r, borderRadius: '50%',
              background: escuro ? 'rgba(255,255,255,0.35)' : i % 2 ? m.secundaria : m.primaria,
              opacity: escuro ? 0.6 : 0.18,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* Texto que entra palavra por palavra (sobe de dentro de uma máscara); destaque em serifa itálica sublinhada */
export const Palavras: React.FC<{
  m: Marca;
  palavras: Palavra[];
  tamanho: number;
  cor?: string;
  peso?: number;
  alinhar?: 'left' | 'center';
  largura?: number;
  claro?: boolean; // texto sobre fundo escuro
}> = ({ m, palavras, tamanho, cor, peso = 800, alinhar = 'left', largura = 1500, claro }) => {
  const { frame, fps } = useTempo();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: alinhar === 'center' ? 'center' : 'flex-start', maxWidth: largura, columnGap: tamanho * 0.26, rowGap: tamanho * 0.02 }}>
      {palavras.map((p, i) => {
        const s = mola(frame, fps, p.em, { damping: 16 });
        const sub = suave(frame / fps, p.em + 0.2, p.em + 0.65);
        if (p.imagem) {
          const tl = frame / fps - p.em;
          const rev = suave(frame / fps, p.em, p.em + 0.45);
          const brilho = Math.max(0, 1 - Math.max(0, tl) / 1.2);
          const el = (
            <span key={i} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: tamanho * 1.08, padding: `0 ${tamanho * 0.08}px`, marginBottom: -tamanho * 0.12 }}>
              {/* faixas de luz que atravessam o logo na entrada */}
              {tl > 0 && tl < 0.9 &&
                ['#ff1f2d', '#b20710', '#ff6a74', '#e50914', '#7a0408', '#ff3b47', '#c1121f'].map((cor, k) => {
                  const x = interpolate(tl, [0.04 * k, 0.04 * k + 0.6], [-4, 104], CL);
                  return <div key={k} style={{ position: 'absolute', top: -tamanho * 0.25, bottom: -tamanho * 0.25, left: `${x}%`, width: tamanho * (0.06 + 0.03 * (k % 3)), background: cor, opacity: 0.85 * (1 - tl / 0.9), filter: `blur(${2 + (k % 3) * 3}px)`, transform: 'skewX(-8deg)' }} />;
                })}
              <Img
                src={staticFile(p.imagem)}
                style={{
                  height: tamanho * 1.05, position: 'relative', clipPath: `inset(0 ${(1 - rev) * 100}% 0 0)`,
                  transform: `scale(${1.25 - 0.25 * s})`, filter: `drop-shadow(0 0 ${brilho * 40}px rgba(229,9,20,${0.9 * brilho})) drop-shadow(0 10px 18px rgba(0,0,0,0.18))`,
                }}
              />
            </span>
          );
          return p.quebra ? (
            <React.Fragment key={i}>
              <div style={{ flexBasis: '100%', height: 0 }} />
              {el}
            </React.Fragment>
          ) : el;
        }
        const el = (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', padding: `0 ${tamanho * 0.04}px ${tamanho * 0.16}px`, marginBottom: -tamanho * 0.12, position: 'relative' }}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - s) * 150}%) rotate(${(1 - s) * 4}deg)`,
                opacity: s < 0.02 ? 0 : 1,
                fontFamily: p.destaque ? m.fonteDestaque : m.fonteTitulo,
                fontStyle: p.destaque ? 'italic' : 'normal',
                fontWeight: p.destaque ? 700 : peso,
                fontSize: p.destaque ? tamanho * 1.18 : tamanho,
                lineHeight: 1.08,
                color: p.destaque ? (claro ? '#FFFFFF' : m.primaria) : cor ?? (claro ? '#FFFFFF' : m.escura),
                letterSpacing: p.destaque ? 0 : -tamanho * 0.015,
              }}
            >
              {p.t}
            </span>
            {p.destaque && (
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ position: 'absolute', left: '4%', bottom: tamanho * 0.08, width: '92%', height: tamanho * 0.16, overflow: 'visible', opacity: sub > 0.01 ? 1 : 0 }}>
                <path d="M2 7 Q 30 1 55 5 T 98 4" fill="none" stroke={claro ? m.secundaria : m.secundaria} strokeWidth={3.2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sub} vectorEffect="non-scaling-stroke" style={{ strokeWidth: tamanho * 0.07 }} />
              </svg>
            )}
          </span>
        );
        return p.quebra ? (
          <React.Fragment key={i}>
            <div style={{ flexBasis: '100%', height: 0 }} />
            {el}
          </React.Fragment>
        ) : (
          el
        );
      })}
    </div>
  );
};

/* Janela de navegador com a tela do produto */
export const Navegador: React.FC<{ src: string; w: number; h: number; m: Marca; posicao?: string; style?: React.CSSProperties }> = ({ src, w, h, m, posicao = 'center top', style }) => (
  <div
    style={{
      position: 'absolute', width: w, height: h, borderRadius: 18, overflow: 'hidden', background: '#111',
      boxShadow: `0 50px 90px -20px ${m.primaria}55, 0 18px 40px rgba(0,0,0,0.25)`, border: '1px solid rgba(255,255,255,0.6)', ...style,
    }}
  >
    <div style={{ height: 34, background: '#1b1d1c', display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 16 }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
      ))}
      <div style={{ marginLeft: 18, height: 18, width: Math.min(360, w * 0.4), borderRadius: 9, background: '#2c2f2e' }} />
    </div>
    <Img src={staticFile(src)} style={{ width: '100%', height: h - 34, objectFit: 'cover', objectPosition: posicao, display: 'block' }} />
  </div>
);

/* Faixa diagonal (cores da marca) que atravessa a tela e esconde o corte entre cenas */
export const Faixa: React.FC<{ m: Marca; em: number; dur?: number }> = ({ m, em, dur = 0.75 }) => {
  const { t, W, H } = useTempo();
  const camadas = [m.secundaria, m.primaria, m.fundo];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {camadas.map((c, i) => {
        const a = em - dur / 2 + i * 0.05;
        const p = interpolate(t, [a, a + dur], [0, 1], { ...CL, easing: Easing.inOut(Easing.cubic) });
        if (p <= 0 || p >= 1) return null;
        const larg = W * (i === 2 ? 0.05 : 1.7);
        const x = interpolate(p, [0, 1], [W * 1.2, -larg - W * 0.45]);
        return <div key={i} style={{ position: 'absolute', top: -H * 0.2, height: H * 1.4, left: x, width: larg, background: c, transform: 'skewX(-16deg)', opacity: i === 2 ? 0.8 : 1 }} />;
      })}
    </AbsoluteFill>
  );
};

/* Ícones de traço que se desenham */
const ICONES: Record<string, string[]> = {
  coluna: ['M22 22 H78', 'M26 30 H74', 'M30 30 V80', 'M42 30 V80', 'M58 30 V80', 'M70 30 V80', 'M24 80 H76', 'M18 88 H82', 'M30 22 Q 50 10 70 22'],
  livro: ['M50 30 V84', 'M50 30 Q 32 20 12 26 V78 Q 32 72 50 84', 'M50 30 Q 68 20 88 26 V78 Q 68 72 50 84', 'M20 40 Q 32 36 42 41', 'M58 41 Q 68 36 80 40', 'M20 52 Q 32 48 42 53', 'M58 53 Q 68 48 80 52'],
  coracao: ['M50 84 C 18 62 10 46 18 32 C 26 18 44 20 50 34 C 56 20 74 18 82 32 C 90 46 82 62 50 84 Z', 'M32 40 Q 36 33 43 34'],
};
export const Icone: React.FC<{ nome: string; cor: string; progresso: number; tam: number }> = ({ nome, cor, progresso, tam }) => (
  <svg viewBox="0 0 100 100" width={tam} height={tam}>
    {(ICONES[nome] ?? []).map((d, i, arr) => {
      const p = Math.max(0, Math.min(1, progresso * arr.length - i * 0.6));
      return <path key={i} d={d} fill="none" stroke={cor} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />;
    })}
  </svg>
);
