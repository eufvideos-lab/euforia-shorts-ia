// Cenas de explicação de sistema (listas e ciclos de etapas). Mesmo padrão de cenas.tsx: tempo local, cores da marca.
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type { Cena, Marca } from './tipos';
import { CL, Fundo, Palavras, mola, suave, useTempo } from './primitivas';

type P<T extends Cena['tipo']> = { c: Extract<Cena, { tipo: T }>; m: Marca };

/* Título + itens que entram um a um: números grandes (ordem) ou faixas coloridas (legenda de cores) */
export const Lista: React.FC<P<'lista'>> = ({ c, m }) => {
  const { frame, fps, t } = useTempo();
  const faixas = c.estilo === 'faixas';
  const atual = c.itens.reduce((a, it, i) => (t >= it.em ? i : a), -1);
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <div style={{ position: 'absolute', left: 130, top: 150, width: 1660 }}>
        <Palavras m={m} palavras={c.titulo} tamanho={86} largura={1660} />
      </div>
      <div style={{ position: 'absolute', left: 130, right: 130, top: c.titulo.length > 5 ? 430 : 340, display: 'flex', flexDirection: 'column', gap: faixas ? 34 : 26 }}>
        {c.itens.map((it, i) => {
          const s = mola(frame, fps, it.em, { damping: 14 });
          const cor = it.cor ?? (i % 2 ? m.secundaria : m.primaria);
          const ativo = i === atual;
          const apaga = atual > i ? 0.55 : 1;
          return (
            <div
              key={i}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 44, padding: faixas ? '30px 48px 30px 0' : '22px 48px 22px 34px', borderRadius: 28,
                background: '#fff', boxShadow: ativo ? `0 30px 60px -18px ${cor}99, 0 0 0 3px ${cor}` : '0 14px 30px -14px rgba(0,0,0,0.18)',
                transform: `translateX(${(1 - s) * -160}px) scale(${(0.9 + 0.1 * s) * (ativo ? 1.02 : 1)})`, transformOrigin: 'left center',
                opacity: Math.min(1, s * 1.4) * apaga, overflow: 'hidden',
              }}
            >
              {faixas ? (
                <div style={{ width: 34, alignSelf: 'stretch', margin: '-30px 0', background: cor, transform: `scaleY(${suave(t, it.em + 0.1, it.em + 0.5)})`, transformOrigin: 'top' }} />
              ) : (
                <div style={{ width: 96, height: 96, borderRadius: '50%', background: cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: m.fonteTitulo, fontWeight: 900, fontSize: 54, flexShrink: 0 }}>{i + 1}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: faixas ? 64 : 58, color: faixas ? cor : m.escura, letterSpacing: -1 }}>{it.t}</div>
                {it.sub && <div style={{ fontFamily: m.fonteCorpo, fontWeight: 500, fontSize: 34, color: m.texto }}>{it.sub}</div>}
              </div>
              {/* brilho que passa no item quando ele entra */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, width: 180, left: `${interpolate(t, [it.em + 0.2, it.em + 0.9], [-15, 110], CL)}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)', transform: 'skewX(-18deg)' }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* Trilho de etapas: cada etapa acende no seu tempo e um card anda até ela; no fim o card sai da fila */
export const Ciclo: React.FC<P<'ciclo'>> = ({ c, m }) => {
  const { frame, fps, t, W } = useTempo();
  const n = c.etapas.length;
  const x0 = 170;
  const passo = (W - 2 * x0) / (n - 1);
  const y = 620;
  let pos = 0;
  c.etapas.forEach((e, i) => {
    if (i > 0) pos += mola(frame, fps, e.em, { damping: 16 });
  });
  const sai = c.saiEm != null ? mola(frame, fps, c.saiEm, { damping: 14 }) : 0;
  const entrada = suave(t, 0, 0.6);
  return (
    <AbsoluteFill>
      <Fundo m={m} />
      <div style={{ position: 'absolute', left: 130, top: 140, width: 1660 }}>
        <Palavras m={m} palavras={c.titulo} tamanho={80} largura={1660} />
      </div>
      {/* trilho */}
      <div style={{ position: 'absolute', left: x0, top: y - 5, height: 10, width: (W - 2 * x0) * entrada, borderRadius: 5, background: `${m.primaria}22` }} />
      <div style={{ position: 'absolute', left: x0, top: y - 5, height: 10, width: passo * Math.min(pos, n - 1), borderRadius: 5, background: `linear-gradient(90deg, ${m.secundaria}, ${m.primaria})`, boxShadow: `0 0 24px ${m.primaria}88` }} />
      {c.etapas.map((e, i) => {
        const aceso = i === 0 ? 1 : mola(frame, fps, e.em, { damping: 12 });
        const ap = mola(frame, fps, 0.1 + i * 0.07, { damping: 14 });
        const cx = x0 + i * passo;
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: cx - 30, top: y - 30, width: 60, height: 60, borderRadius: '50%', background: '#fff', border: `6px solid ${aceso > 0.5 ? m.primaria : '#D8D3CC'}`, transform: `scale(${ap * (1 + 0.25 * aceso * Math.max(0, 1 - Math.abs(t - e.em) * 2))})`, boxShadow: aceso > 0.5 ? `0 0 0 ${10 * aceso}px ${m.primaria}22` : 'none' }}>
              <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: m.primaria, transform: `scale(${aceso})` }} />
            </div>
            <div style={{ position: 'absolute', left: cx - 120, width: 240, top: y + (i % 2 ? -150 : 60), textAlign: 'center', fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 34, lineHeight: 1.1, color: aceso > 0.5 ? m.escura : '#A8A39B', opacity: ap }}>
              {e.t}
              {e.quem && <div style={{ fontFamily: m.fonteCorpo, fontWeight: 500, fontSize: 24, color: m.texto, marginTop: 6 }}>{e.quem}</div>}
            </div>
          </React.Fragment>
        );
      })}
      {/* card que anda pelas etapas */}
      <div
        style={{
          position: 'absolute', left: x0 + passo * Math.min(pos, n - 1) - 110, top: y - 300 - sai * 300, width: 220, padding: '16px 20px', borderRadius: 18, background: '#fff',
          boxShadow: `0 24px 50px -14px ${m.primaria}aa`, borderLeft: `10px solid ${m.primaria}`, opacity: entrada * (1 - sai), transform: `rotate(${Math.sin(t * 3) * 1.5 - sai * 12}deg) scale(${1 - sai * 0.3})`,
          fontFamily: m.fonteCorpo, fontWeight: 700, fontSize: 24, color: m.escura,
        }}
      >
        {c.card}
        <div style={{ height: 8, borderRadius: 4, background: `${m.primaria}22`, marginTop: 10 }} />
        <div style={{ height: 8, width: '60%', borderRadius: 4, background: `${m.primaria}22`, marginTop: 8 }} />
      </div>
      {c.saiEm != null && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 860, textAlign: 'center', opacity: mola(frame, fps, c.saiEm + 0.2, { damping: 12 }) }}>
          <span style={{ display: 'inline-block', padding: '18px 54px', borderRadius: 999, background: m.primaria, color: '#fff', fontFamily: m.fonteTitulo, fontWeight: 800, fontSize: 46, boxShadow: `0 20px 40px -10px ${m.primaria}aa` }}>✓ {c.saiTexto ?? 'Saiu da fila'}</span>
        </div>
      )}
    </AbsoluteFill>
  );
};
