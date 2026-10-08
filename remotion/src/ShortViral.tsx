import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Broll, Caption, ShortProps } from './types';

const W = 1080;
const H = 1920;
const METADE = H / 2;

const ativo = <T extends { start: number; end: number }>(lista: T[], t: number) =>
  lista.find((x) => t >= x.start && t < x.end);

/* ---------- Falante (vídeo principal com cortes secos e troca de enquadramento) ---------- */
const Falante: React.FC<{ p: ShortProps; dividido: boolean }> = ({ p, dividido }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fr = ativo(p.framing, t) ?? { scale: 1, originY: 0.3 };
  const escala = dividido ? Math.max(fr.scale, 1.0) : fr.scale;

  return (
    <AbsoluteFill
      style={{
        top: 0,
        height: dividido ? METADE : H,
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          height: H,
          transform: `translateY(${dividido ? -200 : 0}px) scale(${escala})`,
          transformOrigin: `50% ${fr.originY * 100}%`,
        }}
      >
        {p.segments.map((s, i) => {
          const dur = Math.round((s.srcEnd - s.srcStart) * fps);
          const ini = Math.round(s.outStart * fps);
          return (
            <Sequence key={i} from={ini} durationInFrames={dur} layout="none">
              <OffthreadVideo
                src={staticFile(p.video)}
                startFrom={Math.round(s.srcStart * fps)}
                style={{ width: W, height: H, objectFit: 'cover', position: 'absolute' }}
                volume={(f) =>
                  interpolate(f, [0, 2, dur - (i === p.segments.length - 1 ? 10 : 3), dur - 1], [0, 1, 1, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  })
                }
              />
            </Sequence>
          );
        })}
        {(() => {
          const ult = p.segments[p.segments.length - 1];
          const fimF = Math.round(ult.outStart * fps) + Math.round((ult.srcEnd - ult.srcStart) * fps);
          const resto = Math.round(p.duration * fps) - fimF;
          if (resto <= 0) return null;
          return (
            <Sequence from={fimF} durationInFrames={resto} layout="none">
              <Freeze frame={0}>
                <OffthreadVideo src={staticFile(p.video)} muted startFrom={Math.round(ult.srcEnd * fps) - 1} style={{ width: W, height: H, objectFit: 'cover', position: 'absolute' }} />
              </Freeze>
            </Sequence>
          );
        })()}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- B-roll (tela dividida embaixo ou tela cheia) ---------- */
const BrollCamada: React.FC<{ b: Broll }> = ({ b }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 7 });
  const dividido = b.mode === 'dividido';
  // entra com corte seco + leve 'pop' de escala (como na referência)
  const zoom = interpolate(entrada, [0, 1], [1.12, 1.0]) * (dividido ? 1 : interpolate(frame, [0, (b.end - b.start) * fps], [1.04, 1.0]));
  return (
    <AbsoluteFill
      style={{
        top: dividido ? METADE : 0,
        height: dividido ? METADE : H,
        overflow: 'hidden',
      }}
    >
      <OffthreadVideo
        src={staticFile(b.src)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }}
      />
    </AbsoluteFill>
  );
};

/* ---------- Legenda ---------- */
const sombra = '0 4px 14px rgba(0,0,0,0.65), 0 0 3px rgba(0,0,0,0.9)';

const Legenda: React.FC<{ c: Caption; p: ShortProps; dividido: boolean }> = ({ c, p, dividido }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  if (c.hook) {
    // Gancho: palavras grandes empilhadas em cascata (até 2 palavras / 11 letras por linha)
    const linhas: { text: string; start: number; hl: boolean }[][] = [];
    for (const w of c.words) {
      const ult = linhas[linhas.length - 1];
      const tam = ult ? ult.map((x) => x.text).join(' ').length + 1 + w.text.length : 99;
      if (!ult || ult.length >= 2 || tam > 11) linhas.push([w]);
      else ult.push(w);
    }
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: dividido ? METADE - 260 : 820,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          fontFamily: p.estilo.fonte,
          fontWeight: 900,
          fontSize: 108,
          lineHeight: 0.98,
          letterSpacing: -2,
        }}
      >
        {linhas.map((ln, li) => (
          <div key={li} style={{ transform: `translateX(${(li % 2 === 0 ? -1 : 1) * 60}px)`, whiteSpace: 'nowrap' }}>
            {ln.map((w, i) => {
              const s = spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 14, stiffness: 260 } });
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    marginRight: 28,
                    color: w.hl ? p.estilo.corDestaque : '#FFFFFF',
                    textShadow: sombra,
                    opacity: t >= w.start ? 1 : 0,
                    transform: `scale(${t >= w.start ? interpolate(s, [0, 1], [0.6, 1]) : 0.6})`,
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        top: dividido ? METADE - 48 : 1090,
        textAlign: 'center',
        fontFamily: p.estilo.fonte,
        fontWeight: 800,
        fontSize: 66,
        lineHeight: 1.1,
      }}
    >
      {c.words.map((w, i) => {
        const inicioF = Math.round(w.start * fps);
        const s = spring({ frame: frame - inicioF, fps, config: { damping: 16, stiffness: 300 }, durationInFrames: 6 });
        const visivel = frame >= inicioF;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: 16,
              color: w.hl ? p.estilo.corDestaque : '#FFFFFF',
              textShadow: sombra,
              opacity: visivel ? 1 : 0,
              transform: `scale(${visivel ? interpolate(s, [0, 1], [0.8, 1]) : 0.8})`,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

/* ---------- Composição ---------- */
export const ShortViral: React.FC<ShortProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const broll = ativo(p.brolls, t);
  const dividido = broll?.mode === 'dividido';
  const cheio = broll?.mode === 'cheio';
  const cap = ativo(p.captions, t);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {p.musica && <Musica m={p.musica} dur={p.duration} />}
      <Falante p={p} dividido={dividido} />

      {p.brolls.map((b, i) => (
        <Sequence
          key={i}
          from={Math.round(b.start * fps)}
          durationInFrames={Math.max(1, Math.round((b.end - b.start) * fps))}
        >
          <BrollCamada b={b} />
        </Sequence>
      ))}

      {dividido && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: METADE - 2, height: 4, background: 'rgba(0,0,0,0.35)' }} />
      )}

      {cap && <Legenda c={cap} p={p} dividido={dividido} />}

      {p.logo && (
        <Img
          src={staticFile(p.logo)}
          style={{
            position: 'absolute',
            bottom: 150,
            left: (W - 300) / 2,
            width: 300,
            opacity: cheio ? 0.75 : 0.85,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
          }}
        />
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
