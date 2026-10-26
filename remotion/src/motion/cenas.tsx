// Tipos de cena da Máquina de Motion. Cada cena recebe o tempo local (0 = início da cena).
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile } from 'remotion';
import type { Cena, Marca } from './tipos';
import { CL, Fundo, Icone, Navegador, Palavras, mola, suave, useTempo } from './primitivas';

type P<T extends Cena['tipo']> = { c: Extract<Cena, { tipo: T }>; m: Marca };

/* Pergunta grande no centro, palavra por palavra, com "?" gigante ao fundo */
export const Pergunta: React.FC<P<'pergunta'>> = ({ c, m }) => {
  const { t } = useTempo();
  const dur = c.fim - c.inicio;
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', fontFamily: m.fonteDestaque, fontStyle: 'italic', fontSize: 1100, color: m.primaria, opacity: 0.06 * suave(t, 0, 0.8), transform: `rotate(${-8 + t * 2}deg) scale(${1 + t * 0.02})`, lineHeight: 1 }}>{c.simbolo ?? '?'}</div>
        <div style={{ transform: `scale(${interpolate(t, [0, dur], [1, 1.06])})` }}>
          <Palavras m={m} palavras={c.palavras} tamanho={118} alinhar="center" largura={1560} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Telas do produto flutuando em 3D + pílulas de palavras-chave à esquerda */
export const Telas: React.FC<P<'telas'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const pos = [
    { x: 860, y: 230, w: 940, h: 590, rx: 4, ry: -16, z: 3, em: 0.05, pos: 'center top' },
    { x: 1190, y: 70, w: 640, h: 250, rx: 6, ry: -20, z: 1, em: 0.3, pos: 'center center' },
    { x: 980, y: 760, w: 600, h: 290, rx: 2, ry: -12, z: 4, em: 0.5, pos: 'center center' },
  ];
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <AbsoluteFill style={{ perspective: 2200 }}>
        {c.telas.slice(0, 3).map((src, i) => {
          const p = pos[i];
          const s = mola(frame, fps, p.em, { damping: 18 });
          return (
            <Navegador
              key={src}
              src={src}
              m={m}
              w={p.w}
              h={p.h}
              posicao={p.pos}
              style={{
                left: p.x + Math.sin(t * 0.8 + i) * 10,
                top: p.y + (1 - s) * 500 + Math.cos(t * 0.7 + i) * 8,
                opacity: s,
                zIndex: p.z,
                transform: `rotateX(${p.rx}deg) rotateY(${p.ry + t * 1.5}deg) scale(${0.96 + t * 0.012})`,
              }}
            />
          );
        })}
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 130, top: 250, width: 700 }}>
        <Palavras m={m} palavras={c.titulo} tamanho={62} peso={700} largura={680} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 40, alignItems: 'flex-start' }}>
          {c.pilulas.map((p, i) => {
            const s = mola(frame, fps, p.em, { damping: 11, mass: 0.6 });
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 22, padding: '14px 44px 14px 18px', borderRadius: 999,
                  background: i % 2 ? m.secundaria : m.primaria, color: '#fff', fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 70,
                  letterSpacing: 3, transform: `translateX(${(1 - s) * -80}px) scale(${0.6 + 0.4 * s})`, transformOrigin: 'left center', opacity: Math.min(1, s * 1.5),
                  boxShadow: `0 20px 40px -12px ${m.primaria}88`,
                }}
              >
                <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>✓</div>
                {p.t}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* "Sem aulas longas" (barra longa que se quebra em episódios) → "no seu ritmo" (player com progresso) */
export const Ritmo: React.FC<P<'ritmo'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const n = c.episodios;
  const quebra = mola(frame, fps, 0.65, { damping: 13 });
  const larg = 640;
  const gap = 16 * quebra;
  const seg = (larg - gap * (n - 1)) / n;
  const sPlayer = mola(frame, fps, 0.15, { damping: 17 });
  const prog = suave(t, c.troca, c.fim - c.inicio + 0.3);
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <div style={{ position: 'absolute', left: 130, top: 270, width: 720 }}>
        <Palavras m={m} palavras={c.linha1} tamanho={74} />
        <div style={{ position: 'relative', height: 90, marginTop: 34 }}>
          {new Array(n).fill(0).map((_, i) => {
            const ap = suave(t, 0.1, 0.5);
            return (
              <div key={i} style={{ position: 'absolute', left: i * (seg + gap), top: 40, width: seg * (i === 0 ? 1 : ap), height: 26, borderRadius: 13, background: i % 2 ? m.secundaria : m.primaria, transform: `translateY(${-quebra * (i % 2 ? 8 : -8) * (1 - quebra)}px)` }}>
                <div style={{ position: 'absolute', top: -40, left: 0, width: '100%', textAlign: 'center', fontFamily: m.fonteCorpo, fontWeight: 600, fontSize: 22, color: m.primaria, opacity: quebra }}>EP {i + 1}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 60 }}>
          <Palavras m={m} palavras={c.linha2} tamanho={86} />
        </div>
      </div>
      <AbsoluteFill style={{ perspective: 2000 }}>
        <div style={{ position: 'absolute', left: 900, top: 230, transform: `rotateY(${-14 + (1 - sPlayer) * -20}deg) translateX(${(1 - sPlayer) * 300}px)`, opacity: Math.min(1, 0.25 + sPlayer) }}>
          <Navegador src={c.tela} m={m} w={900} h={520} posicao="left top" style={{ position: 'relative' }} />
          <div style={{ position: 'absolute', left: 30, right: 30, bottom: 28, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.35)' }}>
            <div style={{ width: `${prog * 100}%`, height: '100%', borderRadius: 5, background: m.secundaria, boxShadow: `0 0 18px ${m.secundaria}` }} />
          </div>
          <div style={{ position: 'absolute', left: 450 - 60, top: 230 - 60, width: 120, height: 120, borderRadius: '50%', background: m.primaria, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${mola(frame, fps, c.troca + 0.1, { damping: 9 }) * (1 + Math.sin(t * 6) * 0.03)})`, boxShadow: `0 0 0 ${10 + Math.sin(t * 5) * 6}px ${m.secundaria}55` }}>
            <div style={{ width: 0, height: 0, borderTop: '26px solid transparent', borderBottom: '26px solid transparent', borderLeft: `42px solid #fff`, marginLeft: 10 }} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Parede 3D de capas do catálogo; o logo entra num cartão branco no centro */
export const Parede: React.FC<P<'parede'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const sLogo = mola(frame, fps, c.logoEm, { damping: 12 });
  const vel = 70;
  const fileiras = [0, 1, 2];
  const brilho = interpolate(t, [c.logoEm + 0.3, c.logoEm + 1.1], [-40, 140], CL);
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <AbsoluteFill style={{ perspective: 1600, filter: `blur(${sLogo * 5}px)` }}>
        <div style={{ position: 'absolute', left: -500, top: -260, transform: `rotateX(22deg) rotateY(-20deg) rotateZ(6deg) scale(${1.15 + t * 0.03})`, transformStyle: 'preserve-3d' }}>
          {fileiras.map((r) => (
            <div key={r} style={{ display: 'flex', gap: 26, marginBottom: 26, transform: `translateX(${(r % 2 ? -1 : 1) * t * vel - r * 120}px)` }}>
              {new Array(12).fill(0).map((_, i) => {
                const src = c.cards[(i + r * 5) % c.cards.length];
                const s = mola(frame, fps, 0.02 * i + 0.08 * r, { damping: 20 });
                return <Img key={i} src={staticFile(src)} style={{ width: 250, height: 360, objectFit: 'cover', borderRadius: 18, boxShadow: `0 24px 40px -14px ${m.primaria}77`, transform: `translateY(${(1 - s) * 200}px)`, opacity: s }} />;
              })}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: m.fundo, opacity: sLogo * 0.7 }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            position: 'relative', padding: '50px 90px 60px', borderRadius: 44, background: '#fff', overflow: 'hidden',
            boxShadow: `0 60px 120px -30px ${m.primaria}aa, 0 0 0 3px ${m.secundaria}44`, transform: `scale(${0.7 + 0.3 * sLogo}) rotate(${(1 - sLogo) * -4}deg)`, opacity: Math.min(1, sLogo * 1.4),
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
          }}
        >
          <Palavras m={m} palavras={c.texto} tamanho={54} peso={700} alinhar="center" largura={700} />
          <Img src={staticFile(c.logo)} style={{ width: 620 }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${brilho - 12}%, rgba(255,255,255,0.85) ${brilho}%, transparent ${brilho + 12}%)` }} />
        </div>
      </AbsoluteFill>
      {/* "essa é a" aparece antes do logo, sozinho */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 1 - sLogo }}>
        <div style={{ padding: '24px 50px', borderRadius: 30, background: '#fffffff0', boxShadow: `0 30px 60px -20px ${m.primaria}66` }}>
          <Palavras m={m} palavras={c.texto} tamanho={80} alinhar="center" largura={900} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const QUADRO = { x: 820, y: 110, w: 980, h: 860 };

/* Vídeo posicionado pelo foco (rosto): o ponto `foco` do arquivo fica no centro da caixa, com zoom k */
const VideoFoco: React.FC<{ c: { video: string; videoInicio: number; inicio: number; videoTamanho: [number, number]; foco: [number, number] }; w: number; h: number; k: number; fps: number }> = ({ c, w, h, k, fps }) => {
  const [vw, vh] = c.videoTamanho;
  // zoom mínimo para cobrir a caixa sem sobrar borda
  const kk = Math.max(k, w / vw, h / vh);
  const left = Math.min(0, Math.max(w - vw * kk, w / 2 - c.foco[0] * kk));
  const top = Math.min(0, Math.max(h - vh * kk, h / 2 - c.foco[1] * kk));
  return <OffthreadVideo src={staticFile(c.video)} startFrom={Math.round((c.inicio - c.videoInicio) * fps)} muted style={{ position: 'absolute', left, top, width: vw * kk, height: vh * kk, maxWidth: 'none' }} />;
};

/* Apresentadora num quadro com moldura deslocada; frase à esquerda */
export const Apresentador: React.FC<P<'apresentador'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const s = mola(frame, fps, 0.05, { damping: 20 });
  const s2 = mola(frame, fps, 0.3, { damping: 18 });
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <div style={{ position: 'absolute', left: QUADRO.x + 30, top: QUADRO.y + 30, width: QUADRO.w, height: QUADRO.h, borderRadius: 40, border: `4px solid ${m.secundaria}`, opacity: s2, transform: `translate(${(1 - s2) * -30}px, ${(1 - s2) * -30}px)` }} />
      <div style={{ position: 'absolute', left: QUADRO.x, top: QUADRO.y, width: QUADRO.w, height: QUADRO.h, borderRadius: 40, overflow: 'hidden', clipPath: `inset(${(1 - s) * 100}% 0 0 0 round 40px)`, boxShadow: `0 50px 100px -30px ${m.primaria}99` }}>
        <VideoFoco c={c} w={QUADRO.w} h={QUADRO.h} k={1.08 - 0.06 * s + t * 0.012} fps={fps} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(0deg, ${m.escura}55 0%, transparent 35%)` }} />
      </div>
      <div style={{ position: 'absolute', left: 130, top: 300, width: 640 }}>
        <div style={{ width: interpolate(s2, [0, 1], [0, 120]), height: 8, borderRadius: 4, background: m.secundaria, marginBottom: 34 }} />
        <Palavras m={m} palavras={c.texto} tamanho={82} largura={640} />
      </div>
    </AbsoluteFill>
  );
};

/* Preço: o quadro da apresentadora vira círculo e o valor rola até o número */
export const Preco: React.FC<P<'preco'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const mv = mola(frame, fps, 0, { damping: 18, stiffness: 90 });
  const d = 560;
  const x = interpolate(mv, [0, 1], [QUADRO.x, 430 - d / 2]);
  const y = interpolate(mv, [0, 1], [QUADRO.y, 540 - d / 2]);
  const w = interpolate(mv, [0, 1], [QUADRO.w, d]);
  const h = interpolate(mv, [0, 1], [QUADRO.h, d]);
  const r = interpolate(mv, [0, 1], [40, d / 2]);
  const alvo = parseFloat(c.valor.replace(/\./g, '').replace(',', '.'));
  const conta = interpolate(t, [0.35, 1.25], [0, alvo], { ...CL, easing: (v) => 1 - Math.pow(1 - v, 3) });
  const txt = conta.toFixed(2).replace('.', ',');
  const sV = mola(frame, fps, 0.3, { damping: 12 });
  const sSuf = mola(frame, fps, 1.2, { damping: 10 });
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      {[0, 1, 2].map((i) => {
        const p = ((t - 1.2 - i * 0.35) % 1.6) / 1.6;
        if (t < 1.2 + i * 0.35) return null;
        return <div key={i} style={{ position: 'absolute', left: 1300 - 300 * (1 + p), top: 520 - 300 * (1 + p), width: 600 * (1 + p), height: 600 * (1 + p), borderRadius: '50%', border: `3px solid ${m.secundaria}`, opacity: (1 - p) * 0.5 }} />;
      })}
      <svg style={{ position: 'absolute', left: 430 - d / 2 - 40, top: 540 - d / 2 - 40, width: d + 80, height: d + 80, opacity: mv, transform: `rotate(${t * 30}deg)` }} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="none" stroke={m.secundaria} strokeWidth="0.9" strokeDasharray="3 4" />
      </svg>
      <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: r, overflow: 'hidden', boxShadow: `0 40px 90px -30px ${m.primaria}aa`, border: `${mv * 10}px solid #fff` }}>
        <VideoFoco c={c} w={w} h={h} k={interpolate(mv, [0, 1], [1.06, 0.78])} fps={fps} />
        {c.cobrirEm !== undefined && <Cobertura m={m} t={t} em={c.cobrirEm} frame={frame} fps={fps} d={d} />}
      </div>
      <div style={{ position: 'absolute', left: 830, top: 260, width: 1040 }}>
        <div style={{ fontFamily: m.fonteCorpo, fontWeight: 600, fontSize: 52, color: m.texto, opacity: suave(t, 0.15, 0.5), transform: `translateY(${(1 - suave(t, 0.15, 0.5)) * 20}px)`, letterSpacing: 1 }}>{c.rotulo}</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, transform: `scale(${0.75 + 0.25 * sV})`, transformOrigin: 'left center', opacity: Math.min(1, sV * 1.5) }}>
          <span style={{ fontFamily: m.fonteTitulo, fontWeight: 700, fontSize: 110, color: m.primaria, marginTop: 40 }}>{c.moeda}</span>
          <span style={{ fontFamily: m.fonteTitulo, fontWeight: 900, fontSize: 250, lineHeight: 1, color: m.escura, fontVariantNumeric: 'tabular-nums', letterSpacing: -8 }}>{txt}</span>
        </div>
        <div style={{ display: 'inline-block', marginTop: 20, padding: '14px 46px', borderRadius: 999, background: m.primaria, color: '#fff', fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 62, transform: `scale(${sSuf})`, transformOrigin: 'left center', boxShadow: `0 20px 40px -12px ${m.primaria}99` }}>
          {c.sufixo}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* Tampa o rosto antes do vídeo acabar (evita o quadro congelado): disco na cor da marca abre do centro e um play surge */
const Cobertura = ({ m, t, em, frame, fps, d }: { m: Marca; t: number; em: number; frame: number; fps: number; d: number }) => {
  if (t < em) return null;
  const a = suave(t, em, em + 0.35);
  const sp = mola(frame, fps, em + 0.2, { damping: 11 });
  const giro = (t - em) * 40;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'absolute', width: d * 1.5, height: d * 1.5, borderRadius: '50%', transform: `scale(${a})`, background: `radial-gradient(circle at 35% 30%, ${m.secundaria}, ${m.primaria} 60%, ${m.escura})` }} />
      <svg style={{ position: 'absolute', width: d * 0.62, height: d * 0.62, opacity: a, transform: `rotate(${giro}deg)` }} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="#ffffff88" strokeWidth="1.2" strokeDasharray="4 5" />
      </svg>
      <svg style={{ position: 'absolute', width: d * 0.34, height: d * 0.34, transform: `scale(${sp})`, filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.3))' }} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="#fff" />
        <path d="M40 30 L72 50 L40 70 Z" fill={m.primaria} />
      </svg>
    </AbsoluteFill>
  );
};

/* Logo do produto em fundo na cor da marca, com brilho passando e botão */
export const Logo: React.FC<P<'logo'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const s = mola(frame, fps, 0.05, { damping: 13 });
  const rev = suave(t, 0.05, 0.6);
  const brilho = interpolate(t, [0.6, 1.4], [-30, 130], CL);
  const sb = mola(frame, fps, c.botaoEm, { damping: 10 });
  const pulso = (t - c.botaoEm) % 1.1;
  const url = `url(${staticFile(c.logo)})`;
  return (
    <AbsoluteFill>
      <Fundo m={m} escuro />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 70 }}>
        <div style={{ padding: '60px 110px', borderRadius: 56, background: '#fff', boxShadow: '0 60px 120px -30px rgba(0,0,0,0.5)', transform: `scale(${0.82 + 0.18 * s + t * 0.015}) rotate(${(1 - s) * -3}deg)`, opacity: Math.min(1, s * 1.6) }}>
          <div style={{ position: 'relative', width: 820, clipPath: `inset(0 ${(1 - rev) * 100}% 0 0)` }}>
            <Img src={staticFile(c.logo)} style={{ width: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: url, maskImage: url, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', background: `linear-gradient(105deg, transparent ${brilho - 10}%, rgba(255,255,255,0.55) ${brilho}%, transparent ${brilho + 10}%)` }} />
          </div>
        </div>
        <div style={{ position: 'relative', transform: `scale(${sb})` }}>
          {t > c.botaoEm && <div style={{ position: 'absolute', inset: -pulso * 30, borderRadius: 999, border: '3px solid #fff', opacity: (1 - pulso / 1.1) * 0.7 }} />}
          <div style={{ padding: '22px 70px', borderRadius: 999, background: '#fff', color: m.primaria, fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 54, letterSpacing: 4, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>{c.botao}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Cartão institucional: logo, nome, frase em linhas e os pilares com ícones que se desenham */
export const Institucional: React.FC<P<'institucional'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const dur = c.fim - c.inicio;
  const sl = suave(t, 0.1, 1.0);
  const linha = suave(t, 0.7, 1.4);
  const tit = suave(t, 0.9, 1.9);
  const fim = 1 - suave(t, dur - 0.9, dur - 0.1);
  const ciclo = (t - 2.2) % 4; // brilho passa no nome a cada 4 s
  const brilhoT = t < 2.2 ? -30 : interpolate(ciclo, [0, 1.2], [-30, 130], CL);
  const moldura = suave(t, 6.2, 9.0);
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <svg style={{ position: 'absolute', inset: 0, opacity: fim }} viewBox="0 0 1920 1080">
        <rect x="48" y="48" width="1824" height="984" rx="28" fill="none" stroke={m.secundaria} strokeWidth="2.5" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - moldura} opacity={0.55} />
        <rect x="66" y="66" width="1788" height="948" rx="20" fill="none" stroke={m.primaria} strokeWidth="1.2" pathLength={1} strokeDasharray={1} strokeDashoffset={-(1 - moldura)} opacity={0.35} />
      </svg>
      <AbsoluteFill style={{ alignItems: 'center', opacity: fim, transform: `scale(${interpolate(t, [0, dur], [1, 1.045])})` }}>
        <Img src={staticFile(c.logo)} style={{ marginTop: 92, width: 260, clipPath: `inset(${(1 - sl) * 100}% 0 0 0)`, transform: `translateY(${(1 - sl) * 30}px)` }} />
        <div style={{ width: 260 * linha, height: 3, background: m.secundaria, marginTop: 22, borderRadius: 2 }} />
        <div
          style={{
            marginTop: 26, fontFamily: m.fonteTitulo, fontWeight: 700, fontSize: 86, letterSpacing: `${interpolate(tit, [0, 1], [0.6, 0.16])}em`, opacity: tit, marginRight: '-0.16em',
            backgroundImage: `linear-gradient(105deg, ${m.primaria} ${brilhoT - 12}%, ${m.secundaria} ${brilhoT - 4}%, #9fe0d4 ${brilhoT}%, ${m.secundaria} ${brilhoT + 4}%, ${m.primaria} ${brilhoT + 12}%)`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}
        >
          {c.titulo}
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {c.linhas.map((l, i) => {
            const a = 1.9 + i * 0.6;
            return (
              <div key={i} style={{ display: 'flex', gap: 14 }}>
                {l.split(' ').map((w, j) => {
                  const p = suave(t, a + j * 0.07, a + j * 0.07 + 0.55);
                  return <span key={j} style={{ fontFamily: m.fonteCorpo, fontWeight: 500, fontSize: 54, color: m.texto, opacity: p, transform: `translateY(${(1 - p) * 24}px)`, display: 'inline-block', filter: `blur(${(1 - p) * 6}px)` }}>{w}</span>;
                })}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 130, marginTop: 44 }}>
          {c.pilares.map((p, i) => {
            const a = 1.9 + c.linhas.length * 0.6 + 0.3 + i * 0.45;
            const s = mola(frame, fps, a, { damping: 12 });
            const desenho = suave(t, a + 0.1, a + 1.3);
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, transform: `scale(${0.6 + 0.4 * s}) translateY(${Math.sin(t * 1.4 + i) * 4}px)`, opacity: Math.min(1, s * 1.5) }}>
                <div style={{ position: 'relative', width: 190, height: 190, borderRadius: '50%', background: `${m.secundaria}18`, border: `3px solid ${m.secundaria}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + Math.max(0, Math.sin((t - a) * 1.6 - i * 1.1)) * 0.05})` }}>
                  <svg style={{ position: 'absolute', inset: -22, width: 234, height: 234, transform: `rotate(${(t - a) * (i % 2 ? -25 : 25)}deg)`, opacity: desenho }} viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="48" fill="none" stroke={m.primaria} strokeWidth="0.8" strokeDasharray="2 5" />
                  </svg>
                  <Icone nome={p.icone} cor={m.primaria} progresso={desenho} tam={124} />
                </div>
                <div style={{ fontFamily: m.fonteTitulo, fontWeight: 700, fontSize: 48, color: m.escura, letterSpacing: 1 }}>{p.t}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Câmera em cadeia: cada ponto parte de onde a anterior parou e chega em 0,9 s */
const cadeia = <T extends { em: number }>(t: number, pts: T[], base: Omit<T, 'em'>, dur: number, campos: (keyof T)[]) => {
  const cur: Record<string, number> = { ...(base as Record<string, number>) };
  for (const p of pts) {
    const k = suave(t, p.em - (dur === 0.6 ? dur : 0), p.em + (dur === 0.6 ? 0 : dur));
    for (const c of campos) cur[c as string] = cur[c as string] + ((p[c] as unknown as number) - cur[c as string]) * k;
  }
  return cur as unknown as T;
};

/* Tela real do produto num navegador (ou celular): a câmera dá zoom nas áreas, o cursor anda e clica, destaques acendem */
export const NavegadorCena: React.FC<P<'navegador'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const cel = c.dispositivo === 'celular';
  const comTexto = !!c.texto?.length;
  // área da tela (conteúdo) e moldura
  const prop = c.proporcao ?? (cel ? 844 / 390 : 900 / 1440); // altura / largura da captura
  const cw = cel ? 440 : comTexto ? 1160 : c.rotulo ? 1380 : 1480;
  const ch = Math.round(cw * prop);
  const barra = cel ? 0 : 40;
  const borda = cel ? 14 : 0;
  const W = cw + borda * 2;
  const H = ch + barra + borda * 2;
  const x0 = comTexto ? 1920 - 110 - W : (1920 - W) / 2;
  const y0 = (1080 - H) / 2 + (c.rotulo && !comTexto ? 44 : 0);

  const s = mola(frame, fps, 0.05, { damping: 18, stiffness: 90 });
  const cam = cadeia(t, c.camera ?? [], { x: 0.5, y: 0.5, zoom: 1 }, 0.9, ['x', 'y', 'zoom']);
  const z = cam.zoom;
  const tx = Math.min(0, Math.max(cw - cw * z, cw / 2 - cam.x * cw * z));
  const ty = Math.min(0, Math.max(ch - ch * z, ch / 2 - cam.y * ch * z));
  const mapa = (x: number, y: number) => ({ x: tx + x * cw * z, y: ty + y * ch * z });

  const cur = c.cursor ?? [];
  const pc = cadeia(t, cur, { x: cur[0]?.x ?? 0.5, y: (cur[0]?.y ?? 0.5) + 0.25 }, 0.6, ['x', 'y']);
  const curVis = cur.length ? suave(t, cur[0].em - 0.9, cur[0].em - 0.5) : 0;
  const ultimoClique = [...cur].reverse().find((p) => p.clique && t >= p.em);
  const tc = ultimoClique ? t - ultimoClique.em : 9;
  const aperto = tc < 0.25 ? 1 - Math.sin((tc / 0.25) * Math.PI) * 0.18 : 1;
  const pcur = mapa(pc.x, pc.y);

  return (
    <AbsoluteFill>
      <Fundo m={m} />
      {comTexto && (
        <div style={{ position: 'absolute', left: 120, top: 0, bottom: 0, width: 1920 - W - 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {c.rotulo && <Rotulo m={m} t={c.rotulo} s={mola(frame, fps, 0.15, { damping: 12 })} />}
          <div style={{ width: interpolate(suave(t, 0.2, 0.8), [0, 1], [0, 120]), height: 8, borderRadius: 4, background: m.primaria, margin: '28px 0 34px' }} />
          <Palavras m={m} palavras={c.texto!} tamanho={76} largura={1920 - W - 300} />
        </div>
      )}
      {!comTexto && c.rotulo && (
        <div style={{ position: 'absolute', left: x0, top: y0 - 84 }}>
          <Rotulo m={m} t={c.rotulo} s={mola(frame, fps, 0.2, { damping: 12 })} />
        </div>
      )}
      <AbsoluteFill style={{ perspective: 2400 }}>
        <div
          style={{
            position: 'absolute', left: x0, top: y0 + Math.sin(t * 0.9) * 5, width: W, height: H,
            borderRadius: cel ? 58 : 20, overflow: 'hidden', background: cel ? '#141414' : '#fff',
            boxShadow: `0 60px 110px -30px ${m.primaria}66, 0 22px 50px rgba(0,0,0,0.22)`,
            border: cel ? 'none' : '1px solid rgba(0,0,0,0.08)',
            transform: `translateY(${(1 - s) * 260}px) rotateX(${(1 - s) * 22}deg) rotateY(${comTexto ? -4 * s + (1 - s) * -14 : 0}deg) scale(${0.9 + 0.1 * s + t * 0.0015})`,
            opacity: Math.min(1, s * 1.6), transformOrigin: 'center center',
          }}
        >
          {!cel && (
            <div style={{ height: barra, background: '#F1EFEB', display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 18, borderBottom: '1px solid #E6E3DE' }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((cor) => <div key={cor} style={{ width: 13, height: 13, borderRadius: '50%', background: cor }} />)}
              <div style={{ marginLeft: 22, height: 24, width: Math.min(460, cw * 0.42), borderRadius: 12, background: '#fff', border: '1px solid #E6E3DE', display: 'flex', alignItems: 'center', paddingLeft: 14, gap: 8, fontFamily: m.fonteCorpo, fontSize: 14, color: '#8a857e' }}>
                <span style={{ width: 9, height: 11, border: '2px solid #8a857e', borderRadius: 2 }} />
                portal do cliente
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', left: borda, top: barra + borda, width: cw, height: ch, overflow: 'hidden', borderRadius: cel ? 44 : 0, background: '#fff' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: cw, height: ch, transform: `translate(${tx}px, ${ty}px) scale(${z})`, transformOrigin: '0 0' }}>
              {c.telas.map((tl, i) => (
                <Img key={i} src={staticFile(tl.src)} style={{ position: 'absolute', inset: 0, width: cw, height: ch, objectFit: 'cover', objectPosition: 'top', opacity: i === 0 ? 1 : suave(t, tl.em, tl.em + 0.35) }} />
              ))}
            </div>
            {(c.destaques ?? []).map((d, i) => {
              const a = suave(t, d.em, d.em + 0.5) * (1 - suave(t, d.ate, d.ate + 0.3));
              if (a <= 0) return null;
              const p1 = mapa(d.x, d.y);
              const p2 = mapa(d.x + d.w, d.y + d.h);
              const pulso = 1 + Math.sin((t - d.em) * 5) * 0.012;
              return (
                <svg key={i} style={{ position: 'absolute', left: p1.x - 10, top: p1.y - 10, width: p2.x - p1.x + 20, height: p2.y - p1.y + 20, overflow: 'visible', transform: `scale(${pulso})`, filter: `drop-shadow(0 0 14px ${m.primaria}aa)` }}>
                  <rect x={5} y={5} width={p2.x - p1.x + 10} height={p2.y - p1.y + 10} rx={16} fill={`${m.primaria}10`} stroke={m.primaria} strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - a} opacity={Math.min(1, a * 1.5)} />
                </svg>
              );
            })}
            {curVis > 0 && (
              <>
                {tc < 0.7 && (
                  <div style={{ position: 'absolute', left: pcur.x - 40 * (tc / 0.7) - 6, top: pcur.y - 40 * (tc / 0.7) - 6, width: 80 * (tc / 0.7) + 12, height: 80 * (tc / 0.7) + 12, borderRadius: '50%', border: `4px solid ${m.primaria}`, opacity: 1 - tc / 0.7 }} />
                )}
                <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: pcur.x - 4, top: pcur.y - 2, width: cel ? 46 : 40, height: cel ? 46 : 40, opacity: curVis, transform: `scale(${aperto})`, transformOrigin: '4px 2px', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))' }}>
                  {cel ? <circle cx={8} cy={8} r={7} fill="rgba(20,20,20,0.35)" stroke="#fff" strokeWidth={2} /> : <path d="M4 2 L4 20 L9 15.5 L12.5 22.5 L15.5 21 L12 14 L19 14 Z" fill="#141414" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />}
                </svg>
              </>
            )}
          </div>
          {cel && <div style={{ position: 'absolute', left: W / 2 - 14, top: borda + 10, width: 28, height: 28, borderRadius: 14, background: '#141414' }} />}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Pílula com o nome da área (ex.: ENTREGAS) */
const Rotulo: React.FC<{ m: Marca; t: string; s: number }> = ({ m, t, s }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 30px 12px 18px', borderRadius: 999, background: `linear-gradient(90deg, ${m.secundaria}, ${m.primaria})`, color: '#fff', fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 40, letterSpacing: 4, textTransform: 'uppercase', transform: `scale(${0.6 + 0.4 * s})`, transformOrigin: 'left center', opacity: Math.min(1, s * 1.5), boxShadow: `0 18px 36px -12px ${m.primaria}aa`, alignSelf: 'flex-start' }}>
    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff' }} />
    {t}
  </div>
);

/* Abas/cartões que entram um a um; o último que entrou fica aceso na cor da marca */
export const Abas: React.FC<P<'abas'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const n = c.abas.length;
  const gap = 36;
  const larg = Math.min(420, (1680 - gap * (n - 1)) / n);
  const ativo = c.abas.reduce((acc, a, i) => (t >= a.em ? i : acc), -1);
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 150 }}>
        <Palavras m={m} palavras={c.titulo} tamanho={92} alinhar="center" largura={1600} />
        <div style={{ display: 'flex', gap, marginTop: 90 }}>
          {c.abas.map((a, i) => {
            const s = mola(frame, fps, a.em, { damping: 13 });
            const aceso = suave(t, a.em, a.em + 0.3) * (ativo === i ? 1 : 1 - suave(t, c.abas[i + 1]?.em ?? 999, (c.abas[i + 1]?.em ?? 999) + 0.3));
            const desenho = suave(t, a.em + 0.1, a.em + 1.1);
            return (
              <div
                key={i}
                style={{
                  position: 'relative', width: larg, padding: '46px 38px 50px', borderRadius: 34, overflow: 'hidden',
                  background: '#fff', border: `2px solid ${aceso > 0.5 ? 'transparent' : '#E6E3DE'}`,
                  boxShadow: `0 ${30 + aceso * 30}px ${60 + aceso * 40}px -30px ${m.primaria}${aceso > 0.5 ? 'bb' : '44'}`,
                  transform: `translateY(${(1 - s) * 160 - aceso * 18 + Math.sin(t * 1.3 + i) * 4}px) scale(${0.85 + 0.15 * s})`, opacity: Math.min(1, s * 1.5),
                  display: 'flex', flexDirection: 'column', gap: 22,
                }}
              >
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${m.secundaria}, ${m.primaria})`, opacity: aceso }} />
                <div style={{ position: 'relative', width: 120, height: 120, borderRadius: 30, background: aceso > 0.5 ? 'rgba(255,255,255,0.18)' : `${m.primaria}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icone nome={a.icone} cor={aceso > 0.5 ? '#fff' : m.primaria} progresso={desenho} tam={84} />
                </div>
                <div style={{ position: 'relative', fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 60, lineHeight: 1, color: aceso > 0.5 ? '#fff' : m.escura, textTransform: 'uppercase', letterSpacing: 1 }}>{a.t}</div>
                <div style={{ position: 'relative', fontFamily: m.fonteCorpo, fontWeight: 500, fontSize: 28, lineHeight: 1.35, color: aceso > 0.5 ? '#fff' : m.texto }}>{a.desc}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
