// Modelo EDUCATIVO do Grupo Euforia: vídeos explicativos (clientes e equipe) com locução, capítulos,
// quiz "qual está certa?", checklist e legenda. Fundo claro da marca, Archivo + Inter.
// A peça é montada por educativo/montar.py (gera props.json + narracao.mp3).
import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, ILUSTRACOES } from './ilustracoes';

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const TIT = 'Archivo';
const TXT = 'Inter';

type Frase = { em: number; texto: string };
type Cena = {
  tipo: 'abertura' | 'capitulo' | 'pontos' | 'quiz' | 'checklist' | 'logo';
  de: number; ate: number;
  [k: string]: any;
};
type Palavra = { t: string; s: number; e: number; f: string; fimFrase: boolean };
export type EducativoProps = {
  fps: number; largura: number; altura: number; duracao: number;
  selo: string; audio: string; trilha?: string | null;
  capitulos: { n: number; titulo: string; de: number; ate: number }[];
  cenas: Cena[];
  checks: { em: number; texto: string }[];
  legendas: Palavra[];
};

const useT = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { f, fps, t: f / fps };
};
const ease = (t: number, a: number, d = 0.45) => interpolate(t, [a, a + d], [0, 1], { ...CL, easing: Easing.bezier(0.22, 1, 0.36, 1) });
const mola = (f: number, fps: number, em: number) => spring({ frame: f - Math.round(em * fps), fps, config: { damping: 14, mass: 0.7, stiffness: 130 } });

/* ---------- moldura fixa ---------- */
const Cabecalho: React.FC<{ selo: string; escuro?: boolean }> = ({ selo, escuro }) => (
  <div style={{ position: 'absolute', left: 80, right: 80, top: 46, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <Img src={staticFile(escuro ? 'educativo/logo-claro.svg' : 'educativo/logo.svg')} style={{ height: 46 }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: TXT, fontWeight: 700, fontSize: 22, letterSpacing: 5, color: escuro ? C.claro : C.preto }}>
      <div style={{ width: 14, height: 14, background: C.laranja }} />
      {selo}
    </div>
  </div>
);

const Progresso: React.FC<{ caps: EducativoProps['capitulos']; t: number }> = ({ caps, t }) => (
  <div style={{ position: 'absolute', left: 80, right: 80, bottom: 40, display: 'flex', gap: 14 }}>
    {caps.map((c) => {
      const p = interpolate(t, [c.de, c.ate], [0, 1], CL);
      const atual = t >= c.de && t < c.ate;
      return (
        <div key={c.n} style={{ flex: 1 }}>
          <div style={{ fontFamily: TXT, fontWeight: 700, fontSize: 17, letterSpacing: 2, color: C.preto, opacity: atual ? 1 : p >= 1 ? 0.55 : 0.3, marginBottom: 10 }}>
            {String(c.n).padStart(2, '0')} · {c.titulo}
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(5,5,5,0.12)', overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: C.laranja }} />
          </div>
        </div>
      );
    })}
  </div>
);

/* legenda: blocos de até 6 palavras, quebra em pontuação */
const blocos = (ws: Palavra[]) => {
  const out: Palavra[][] = [];
  let cur: Palavra[] = [];
  ws.forEach((w, i) => {
    cur.push(w);
    const prox = ws[i + 1];
    const fimPont = /[.?!:]$/.test(w.t) || (/,$/.test(w.t) && cur.length >= 3);
    if (!prox || prox.f !== w.f || fimPont || cur.length >= 6) {
      out.push(cur);
      cur = [];
    }
  });
  return out;
};

const Legenda: React.FC<{ ws: Palavra[]; t: number; escuro?: boolean }> = ({ ws, t, escuro }) => {
  const bs = React.useMemo(() => blocos(ws), [ws]);
  const i = bs.findIndex((b, k) => t >= b[0].s - 0.05 && t < (bs[k + 1] && bs[k + 1][0].f === b[0].f ? bs[k + 1][0].s - 0.05 : b[b.length - 1].e + 0.35));
  if (i < 0) return null;
  const b = bs[i];
  return (
    <div style={{ position: 'absolute', left: 160, right: 160, bottom: 132, textAlign: 'center', fontFamily: TXT, fontWeight: 600, fontSize: 40, lineHeight: 1.25, color: escuro ? C.claro : C.preto }}>
      {b.map((w, k) => (
        <span key={k} style={{ color: t >= w.s && t < w.e + 0.08 ? C.laranja : undefined }}>{w.t}{k < b.length - 1 ? ' ' : ''}</span>
      ))}
    </div>
  );
};

const Check: React.FC<{ checks: EducativoProps['checks']; t: number; total: number }> = ({ checks, t, total }) => {
  const k = checks.findIndex((c) => t >= c.em && t < c.em + 2.8);
  if (k < 0) return null;
  const c = checks[k];
  const e = ease(t, c.em, 0.4) * (1 - ease(t, c.em + 2.4, 0.4));
  return (
    <div style={{ position: 'absolute', right: 80, top: 128, transform: `translateY(${(1 - e) * -30}px)`, opacity: e, display: 'flex', alignItems: 'center', gap: 16, background: C.preto, color: C.claro, padding: '14px 26px 14px 16px', borderRadius: 40, border: '2px solid rgba(242,239,234,0.35)', fontFamily: TXT, fontWeight: 700, fontSize: 26 }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: C.laranja, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" viewBox="-12 -12 24 24"><path d="M-8 0 L-2 6 L8 -6" stroke={C.claro} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {c.texto}
      <span style={{ opacity: 0.5, fontWeight: 600 }}>{k + 1}/{total}</span>
    </div>
  );
};

/* ---------- cenas ---------- */
const Abertura: React.FC<{ c: Cena; t: number }> = ({ c, t }) => {
  const { f, fps } = useT();
  const palavras: string[] = c.titulo.split(' ');
  const sai = 1 - ease(t, c.ate - 0.35, 0.35);
  return (
    <AbsoluteFill style={{ opacity: sai }}>
      <div style={{ position: 'absolute', left: 120, top: 250, width: 1150 }}>
        <div style={{ fontFamily: TXT, fontWeight: 700, fontSize: 26, letterSpacing: 6, color: C.laranja, opacity: ease(t, c.de + 0.1) }}>{c.kicker}</div>
        <div style={{ fontFamily: TIT, fontWeight: 900, fontSize: 118, lineHeight: 1.0, color: C.preto, marginTop: 26, letterSpacing: -2 }}>
          {palavras.map((w, i) => {
            const m = mola(f, fps, c.de + 0.25 + i * 0.09);
            return (
              <span key={i} style={{ display: 'inline-block', marginRight: 28, transform: `translateY(${(1 - m) * 60}px)`, opacity: m, color: w === c.destaque ? C.laranja : C.preto }}>{w}</span>
            );
          })}
        </div>
        <div style={{ fontFamily: TXT, fontWeight: 500, fontSize: 36, color: C.preto, opacity: 0.65 * ease(t, c.de + 1.2), marginTop: 34 }}>{c.sub}</div>
      </div>
      {/* play deitado, símbolo da marca */}
      <svg style={{ position: 'absolute', right: 120, top: 270, transform: `rotate(${(1 - mola(f, fps, c.de + 0.5)) * -40}deg) scale(${mola(f, fps, c.de + 0.5)})` }} width="420" height="460" viewBox="0 0 420 460">
        <path d="M40 60 Q40 10 86 34 L382 196 Q420 230 382 262 L86 426 Q40 450 40 400 Z" fill={C.laranja} />
      </svg>
    </AbsoluteFill>
  );
};

const Capitulo: React.FC<{ c: Cena; t: number; caps: EducativoProps['capitulos'] }> = ({ c, t, caps }) => {
  const cap = caps.find((k) => k.n === c.n)!;
  const ent = ease(t, c.de, 0.4);
  const sai = ease(t, c.ate - 0.05, 0.4);
  return (
    <AbsoluteFill style={{ background: C.preto, clipPath: `inset(0 ${(1 - ent) * 100}% 0 ${sai * 100}%)` }}>
      <div style={{ position: 'absolute', left: 140, top: 300, display: 'flex', alignItems: 'center', gap: 60 }}>
        <div style={{ fontFamily: TIT, fontWeight: 900, fontSize: 360, lineHeight: 0.8, color: C.laranja, transform: `translateX(${(1 - ease(t, c.de + 0.1, 0.6)) * -80}px)` }}>{String(c.n).padStart(2, '0')}</div>
        <div style={{ transform: `translateX(${(1 - ease(t, c.de + 0.2, 0.6)) * 80}px)` }}>
          <div style={{ fontFamily: TXT, fontWeight: 700, fontSize: 28, letterSpacing: 6, color: C.claro, opacity: 0.6 }}>PASSO {c.n} DE {caps.length}</div>
          <div style={{ fontFamily: TIT, fontWeight: 900, fontSize: 120, color: C.claro, lineHeight: 1, marginTop: 14 }}>{cap.titulo}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Painel: React.FC<{ nome: string; style?: React.CSSProperties }> = ({ nome, style }) => {
  const Il = ILUSTRACOES[nome];
  return <div style={{ ...style }}>{Il ? <Il /> : null}</div>;
};

const Pontos: React.FC<{ c: Cena; t: number }> = ({ c, t }) => {
  const { f, fps } = useT();
  const fr: Frase[] = c.frases || [];
  const atual = fr.reduce((acc, x, i) => (t >= x.em ? i : acc), -1);
  const m = mola(f, fps, c.de);
  const sai = 1 - ease(t, c.ate - 0.3, 0.3);
  return (
    <AbsoluteFill style={{ opacity: sai }}>
      <Painel nome={c.ilustracao} style={{ position: 'absolute', left: 100, top: 190, width: 820, height: 461, transform: `scale(${0.9 + 0.1 * m})`, opacity: m }} />
      <div style={{ position: 'absolute', left: 990, top: 200, width: 830, height: 560, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
        {fr.map((x, i) => {
          const e = ease(t, x.em, 0.5);
          if (t < x.em - 0.01) return null;
          return (
            <div key={i} style={{ display: 'flex', gap: 24, alignItems: 'stretch', opacity: e * (i === atual ? 1 : 0.32), transform: `translateX(${(1 - e) * 60}px)` }}>
              <div style={{ width: 10, borderRadius: 5, background: i === atual ? C.laranja : C.preto }} />
              <div style={{ fontFamily: TIT, fontWeight: 800, fontSize: 56, lineHeight: 1.05, color: C.preto, letterSpacing: -0.5 }}>{x.texto}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Selo: React.FC<{ ok: boolean; s: number }> = ({ ok, s }) => (
  <div style={{ width: 92, height: 92, borderRadius: 46, background: ok ? C.laranja : C.brasa, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${s})`, boxShadow: '0 8px 0 rgba(5,5,5,0.15)' }}>
    <svg width="50" height="50" viewBox="-12 -12 24 24">
      {ok ? <path d="M-8 0 L-2 6 L8 -6" stroke={C.claro} strokeWidth={3.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke={C.claro} strokeWidth={3.6} strokeLinecap="round" />}
    </svg>
  </div>
);

const Quiz: React.FC<{ c: Cena; t: number }> = ({ c, t }) => {
  const { f, fps } = useT();
  const revelou = t >= c.revela;
  const mr = mola(f, fps, c.revela);
  const sai = 1 - ease(t, c.ate - 0.3, 0.3);
  const lados: ('a' | 'b')[] = ['a', 'b'];
  const restante = c.revela - t;
  const contando = t >= c.contagem && !revelou;
  return (
    <AbsoluteFill style={{ opacity: sai }}>
      <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center', fontFamily: TIT, fontWeight: 900, fontSize: 76, color: C.preto, transform: `scale(${mola(f, fps, c.de)})` }}>
        {revelou ? <>A CERTA É A <span style={{ color: C.laranja }}>{c.certa.toUpperCase()}</span></> : <>QUAL ESTÁ <span style={{ color: C.laranja }}>CERTA?</span></>}
      </div>
      {lados.map((l, i) => {
        const ok = c.certa === l;
        const m = mola(f, fps, c.de + 0.15 + i * 0.15);
        const apaga = revelou && !ok ? 0.4 * mr : 0;
        return (
          <div key={l} style={{ position: 'absolute', top: 270, left: i === 0 ? 110 : 1010, width: 800, transform: `translateY(${(1 - m) * 80}px) scale(${revelou && ok ? 1 + 0.03 * mr : 1})`, opacity: m * (1 - apaga) }}>
            <div style={{ position: 'relative', width: 800, height: 450, filter: revelou && !ok ? `grayscale(${mr})` : undefined }}>
              <Painel nome={c[l]} style={{ width: 800, height: 450 }} />
              {revelou && ok && <div style={{ position: 'absolute', inset: -6, border: `10px solid ${C.laranja}`, borderRadius: 26, opacity: mr }} />}
            </div>
            <div style={{ position: 'absolute', top: -28, left: -24, width: 72, height: 72, borderRadius: 36, background: C.preto, color: C.claro, fontFamily: TIT, fontWeight: 900, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{l.toUpperCase()}</div>
            {revelou && <div style={{ position: 'absolute', top: -40, right: -30 }}><Selo ok={ok} s={mr} /></div>}
            {revelou && c.rotulos && (
              <div style={{ marginTop: 20, textAlign: 'center', fontFamily: TIT, fontWeight: 800, fontSize: 40, color: ok ? C.laranja : C.preto, opacity: mr }}>{c.rotulos[i]}</div>
            )}
          </div>
        );
      })}
      {contando && (
        <div style={{ position: 'absolute', left: 960 - 85, top: 770, width: 170, height: 170 }}>
          <svg width="170" height="170" viewBox="0 0 170 170">
            <circle cx={85} cy={85} r={80} fill={C.preto} />
            <circle cx={85} cy={85} r={70} fill="none" stroke={C.laranja} strokeWidth={10} strokeDasharray={2 * Math.PI * 70} strokeDashoffset={2 * Math.PI * 70 * (1 - restante / (c.revela - c.contagem))} transform="rotate(-90 85 85)" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: TIT, fontWeight: 900, fontSize: 90, color: C.claro }}>{Math.max(1, Math.ceil(restante / ((c.revela - c.contagem) / 3)))}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const Checklist: React.FC<{ c: Cena; t: number }> = ({ c, t }) => {
  const sai = 1 - ease(t, c.ate - 0.3, 0.3);
  return (
    <AbsoluteFill style={{ opacity: sai }}>
      <div style={{ position: 'absolute', left: 160, top: 170 }}>
        <div style={{ fontFamily: TXT, fontWeight: 700, fontSize: 26, letterSpacing: 6, color: C.laranja, opacity: ease(t, c.de) }}>CHECKLIST</div>
        <div style={{ fontFamily: TIT, fontWeight: 900, fontSize: 92, color: C.preto, marginTop: 6, opacity: ease(t, c.de + 0.1) }}>{c.titulo}</div>
        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {c.itens.map((it: Frase, i: number) => {
            const e = ease(t, c.de + 0.3 + i * 0.12);
            const k = ease(t, it.em, 0.35);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: e, transform: `translateX(${(1 - e) * -40}px)` }}>
                <div style={{ width: 62, height: 62, borderRadius: 14, border: `5px solid ${C.preto}`, background: k > 0 ? C.laranja : 'transparent', borderColor: k > 0 ? C.laranja : C.preto, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="-12 -12 24 24"><path d="M-8 0 L-2 6 L8 -6" stroke={C.claro} strokeWidth={3.6} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={30} strokeDashoffset={30 * (1 - k)} /></svg>
                </div>
                <div style={{ fontFamily: TXT, fontWeight: 600, fontSize: 52, color: C.preto, opacity: 0.45 + 0.55 * k }}>{it.texto}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 160, top: 300, width: 420, padding: 40, background: C.preto, borderRadius: 28, color: C.claro, opacity: ease(t, c.de + 1) }}>
        <div style={{ fontFamily: TIT, fontWeight: 900, fontSize: 54, lineHeight: 1.05 }}>TIRE UM <span style={{ color: C.laranja }}>PRINT</span> DESTA TELA</div>
        <div style={{ fontFamily: TXT, fontWeight: 500, fontSize: 28, marginTop: 18, opacity: 0.7 }}>e confira antes de cada gravação.</div>
      </div>
    </AbsoluteFill>
  );
};

const Logo: React.FC<{ c: Cena; t: number }> = ({ c, t }) => {
  const { f, fps } = useT();
  const m = mola(f, fps, c.de + 0.1);
  return (
    <AbsoluteFill style={{ background: C.preto, clipPath: `circle(${ease(t, c.de, 0.6) * 120}% at 50% 50%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('educativo/logo-claro.svg')} style={{ width: 760, transform: `scale(${0.85 + 0.15 * m})`, opacity: m }} />
      <div style={{ fontFamily: TXT, fontWeight: 500, fontSize: 38, color: C.claro, opacity: 0.8 * ease(t, c.de + 0.8), marginTop: 50 }}>{c.frase}</div>
    </AbsoluteFill>
  );
};

export const Educativo: React.FC<EducativoProps> = (p) => {
  const { t } = useT();
  const ativas = p.cenas.filter((c) => t >= c.de - (c.tipo === 'capitulo' || c.tipo === 'logo' ? 0 : 0.4) && t < c.ate + (c.tipo === 'capitulo' ? 0.4 : 0.01));
  const noLogo = ativas.some((c) => c.tipo === 'logo');
  const naAbertura = ativas.some((c) => c.tipo === 'abertura');
  return (
    <AbsoluteFill style={{ background: C.claro }}>
      {ativas.map((c, i) => {
        switch (c.tipo) {
          case 'abertura': return <Abertura key={i} c={c} t={t} />;
          case 'pontos': return <Pontos key={i} c={c} t={t} />;
          case 'quiz': return <Quiz key={i} c={c} t={t} />;
          case 'checklist': return <Checklist key={i} c={c} t={t} />;
          default: return null;
        }
      })}
      {!noLogo && <Cabecalho selo={p.selo} />}
      {!noLogo && !naAbertura && <Progresso caps={p.capitulos} t={t} />}
      {ativas.filter((c) => c.tipo === 'capitulo').map((c, i) => <Capitulo key={`c${i}`} c={c} t={t} caps={p.capitulos} />)}
      {ativas.filter((c) => c.tipo === 'logo').map((c, i) => <Logo key={`l${i}`} c={c} t={t} />)}
      <Check checks={p.checks} t={t} total={p.checks.length} />
      {!noLogo && <Legenda ws={p.legendas} t={t} />}
      <Audio src={staticFile(p.audio)} />
      {p.trilha && <Audio src={staticFile(p.trilha)} loop volume={(f) => 0.035 * interpolate(f / p.fps, [0, 1, p.duracao - 3, p.duracao], [0, 1, 1, 0], CL)} />}
    </AbsoluteFill>
  );
};
