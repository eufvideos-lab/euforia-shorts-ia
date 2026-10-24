import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { ShortProps, Cartao } from './types';

const W = 1080;
const H = 1920;

const ativo = <T extends { start: number; end: number }>(lista: T[], t: number) =>
  lista.find((x) => t >= x.start && t < x.end);

/* Cortina diagonal: entra da direita para a esquerda, sai continuando o movimento */
const cortina = (frame: number, durF: number, transF = 9, comSaida = true) => {
  const entra = interpolate(frame, [0, transF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sai = comSaida ? interpolate(frame, [durF - transF, durF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  // borda esquerda do cartão (em % da largura), com inclinação de 30% no topo
  const e = 130 - entra * 160; // 130 → -30
  const d = 130 - sai * 160;
  if (sai > 0) {
    // saindo: o vídeo volta pela direita
    return `polygon(-30% 0%, ${d}% 0%, ${d - 30}% 100%, -30% 100%)`;
  }
  return `polygon(${e}% 0%, 130% 0%, 130% 100%, ${e - 30}% 100%)`;
};

const CartaoTexto: React.FC<{ c: Cartao; p: ShortProps }> = ({ c, p }) => {
  const ultimo = c.end >= p.duration - 0.01; // cartão que fecha o short não sai
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durF = Math.round((c.end - c.start) * fps);
  const t = c.start + frame / fps;
  const e = p.estilo;
  const circ = c.circular ? c.circular.toLowerCase() : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: e.corFundoCartao ?? '#D0CABE',
        clipPath: cortina(frame, durF, 9, !ultimo),
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 110px',
      }}
    >
      {c.foto && (
        <Img
          src={staticFile(c.foto)}
          style={{
            width: 300, height: 300, borderRadius: '50%', objectFit: 'cover', marginBottom: 10,
            border: `6px solid ${e.corDestaque}`, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            transform: `scale(${interpolate(frame, [4, 16], [0.92, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
          }}
        />
      )}
      {c.autor && (
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 220, lineHeight: 1, color: e.corDestaque, marginBottom: -40, opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          “
        </div>
      )}
      <div
        style={{
          fontFamily: e.fonte,
          fontWeight: c.autor ? 500 : 600,
          fontStyle: c.autor ? 'italic' : 'normal',
          fontSize: c.palavras.length > 18 ? 46 : c.palavras.length > 8 ? 58 : 84,
          lineHeight: 1.22,
          color: e.corTextoCartao ?? '#102838',
          textAlign: 'center',
          textWrap: 'balance',
        }}
      >
        {c.palavras.map((w, i) => {
          const visivel = t >= w.start;
          const limpo = w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          const comCirculo = circ && limpo === circ.replace(/[^\p{L}\p{N}]/gu, '');
          const fCirc = Math.round((t - w.start) * fps);
          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block', marginRight: '0.28em', opacity: visivel ? 1 : 0 }}>
              {w.text}
              {comCirculo && visivel && (
                <svg
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', left: '-14%', top: '-22%', width: '128%', height: '144%', overflow: 'visible' }}
                >
                  <path
                    d="M8,22 C6,8 40,2 62,4 C88,6 98,14 94,26 C90,38 50,40 26,36 C10,33 4,26 12,16"
                    fill="none"
                    stroke={e.corDestaque}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={interpolate(fCirc, [0, 12], [1, 0], { extrapolateRight: 'clamp' })}
                  />
                </svg>
              )}
            </span>
          );
        })}
        {c.referencia && (
          <div style={{ fontSize: 30, fontWeight: 500, marginTop: 40, opacity: t >= c.palavras[c.palavras.length - 1].start ? 1 : 0 }}>
            {c.referencia}
          </div>
        )}
        {c.autor && (
          <div style={{ fontStyle: 'normal', fontSize: 34, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 48, color: e.corDestaque, opacity: t >= c.palavras[c.palavras.length - 1].start ? 1 : 0 }}>
            — {c.autor}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const ShortInstitucional: React.FC<ShortProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cartoes = p.cartoes ?? [];
  const noCartao = cartoes.some((c) => t >= c.start + 0.25 && (c.end >= p.duration - 0.01 || t < c.end - 0.25));
  const cap = ativo(p.captions, t);
  const e = p.estilo;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {p.musica && <Musica m={p.musica} dur={p.duration} />}
      {p.segments.map((s, i) => {
        const dur = Math.round((s.srcEnd - s.srcStart) * fps);
        return (
          <Sequence key={i} from={Math.round(s.outStart * fps)} durationInFrames={dur}>
            <OffthreadVideo
              src={staticFile(p.video)}
              startFrom={Math.round(s.srcStart * fps)}
              style={{ width: W, height: H, objectFit: 'cover' }}
              volume={(f) =>
                interpolate(f, [0, 3, dur - (i === p.segments.length - 1 ? 10 : 4), dur - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
              }
            />
          </Sequence>
        );
      })}

      {/* Final suave: segura o último quadro, sem som, até o fim */}
      {(() => {
        const ult = p.segments[p.segments.length - 1];
        const fimF = Math.round(ult.outStart * fps) + Math.round((ult.srcEnd - ult.srcStart) * fps);
        const resto = Math.round(p.duration * fps) - fimF;
        if (resto <= 0) return null;
        return (
          <Sequence from={fimF} durationInFrames={resto}>
            <Freeze frame={0}>
              <OffthreadVideo src={staticFile(p.video)} muted startFrom={Math.round(ult.srcEnd * fps) - 1} style={{ width: W, height: H, objectFit: 'cover' }} />
            </Freeze>
          </Sequence>
        );
      })()}

      {p.brolls.map((b, i) => {
        const durF = Math.max(1, Math.round((b.end - b.start) * fps));
        return (
          <Sequence key={`b${i}`} from={Math.round(b.start * fps)} durationInFrames={durF}>
            <BrollCheio src={b.src} durF={durF} legenda={b.legenda} fonte={e.fonte} />
          </Sequence>
        );
      })}

      {cartoes.map((c, i) => (
        <Sequence key={`c${i}`} from={Math.round(c.start * fps)} durationInFrames={Math.round((c.end - c.start) * fps)}>
          <CartaoTexto c={c} p={p} />
        </Sequence>
      ))}

      {cap && !noCartao && (
        <div
          style={{
            position: 'absolute',
            left: 120,
            right: 120,
            top: 1300,
            textAlign: 'center',
            fontFamily: e.fonte,
            fontWeight: 700,
            fontSize: 58,
            lineHeight: 1.18,
            color: e.corLegenda ?? '#FFFFFF',
            textShadow: e.corLegenda ? '0 2px 4px rgba(0,0,0,0.85), 0 0 14px rgba(0,0,0,0.55)' : '0 2px 10px rgba(0,0,0,0.45)',
            // legenda colorida (amarela) ganha contorno escuro para ler sobre foto clara ou amarela
            WebkitTextStroke: e.corLegenda ? '7px rgba(0,0,0,0.9)' : undefined,
            paintOrder: e.corLegenda ? 'stroke fill' : undefined,
            textWrap: 'balance',
          }}
        >
          {cap.words.map((w) => w.text).join(' ')}
        </div>
      )}

      {p.logo && !noCartao && (
        <Img src={staticFile(p.logo)} style={{ position: 'absolute', bottom: 110, left: (W - 180) / 2, width: 180, opacity: 0.6 }} />
      )}
    </AbsoluteFill>
  );
};

const BrollCheio: React.FC<{ src: string; durF: number; legenda?: string | null; fonte?: string }> = ({ src, durF, legenda, fonte }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 6, durF - 6, durF], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const zoom = { width: '100%', height: '100%', objectFit: 'cover' as const, transform: `scale(${interpolate(frame, [0, durF], [1.0, 1.06])})` };
  const foto = /\.(jpe?g|png|webp)$/i.test(src);
  return (
    <AbsoluteFill style={{ opacity: op }}>
      {foto ? <Img src={staticFile(src)} style={zoom} /> : <OffthreadVideo src={staticFile(src)} muted style={zoom} />}
      {legenda && (
        <div
          style={{
            position: 'absolute', left: 90, right: 90, top: 150, textAlign: 'center',
            fontFamily: fonte, fontWeight: 500, fontSize: 30, letterSpacing: 1, color: 'rgba(255,255,255,0.92)',
            textShadow: '0 1px 6px rgba(0,0,0,0.8)',
            opacity: interpolate(frame, [8, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          {legenda}
        </div>
      )}
    </AbsoluteFill>
  );
};

/* Trilha de fundo: volume baixo constante, entra e sai suave */
const Musica: React.FC<{ m: { src: string; volume: number }; dur: number }> = ({ m, dur }) => {
  const { fps } = useVideoConfig();
  const total = Math.round(dur * fps);
  return (
    <Audio
      src={staticFile(m.src)}
      loop
      volume={(f) =>
        m.volume * interpolate(f, [0, fps * 0.5, total - fps * 1.2, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      }
    />
  );
};
