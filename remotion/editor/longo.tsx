// Editor do vídeo LONGO (Euforia Studio): prévia ao vivo do que a máquina de longos montou, com a fala cortada,
// B-roll, telas cheias (título, cartões, mapa), textos-chave, lowers, tela final e trilha. A pessoa tira pedaços da
// fala, move/tira/troca elementos e manda renderizar no próprio PC (o render usa os arquivos 1080p da máquina).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { AbsoluteFill, Audio, Img, Sequence, Video, interpolate, staticFile, useCurrentFrame } from 'remotion';
import {
  NOME_CAMADA, anotarLongo, diferencasLongo, dividirTrecho, duracao, inicios, limparLongo, palavrasSaida, removerTrecho,
  sobreposicoes, tc, textoDoTrecho, type Camada, type LongoEd, type ProjetoLongo,
} from './longo-projeto';
import type { Pacote } from './estudio';
import { PainelPublicacao } from './publicacao';

type Sel = { tipo: 'tr' | 'el'; id: string } | null;
const r2 = (x: number) => Math.round(x * 100) / 100;
const ler = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const ganho = (db: number) => Math.min(1, 10 ** (db / 20));
const ehImagem = (a: string) => /\.(jpe?g|png|webp)$/i.test(a);

/* ------------------------------------------------------------------ prévia (composição do Remotion) */
const Fade: React.FC<{ dur: number; fd: number; fps: number; children: React.ReactNode }> = ({ dur, fd, fps, children }) => {
  const f = useCurrentFrame() / fps;
  const op = fd ? interpolate(f, [0, fd, Math.max(fd, dur - fd), dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return <AbsoluteFill style={{ opacity: op }}>{children}</AbsoluteFill>;
};
// B-roll com o movimento lento da máquina (10% maior, desliza 96x54 px no tempo do B-roll)
const KenBurns: React.FC<{ src: string; dur: number; fps: number }> = ({ src, dur, fps }) => {
  const p = Math.min(1, useCurrentFrame() / fps / Math.max(0.1, dur));
  const st: React.CSSProperties = { position: 'absolute', width: 2112, height: 1188, left: -96 * p, top: -54 * p, objectFit: 'cover', filter: 'contrast(1.04) saturate(1.05)' };
  return ehImagem(src) ? <Img src={staticFile(src)} style={st} /> : <Video src={staticFile(src)} muted loop style={st} />;
};

export const PreviaLongo: React.FC<{ L: LongoEd }> = ({ L }) => {
  const fps = L.fps;
  const os_ = inicios(L);
  const total = duracao(L);
  const fr = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {L.trechos.map((t, i) => (
        <Sequence key={t._id} from={fr(os_[i])} durationInFrames={Math.max(1, fr(os_[i] + t.fim - t.ini) - fr(os_[i]))} premountFor={fps}>
          <Video src={staticFile(L.previa)} trimBefore={fr(t.ini)} style={{ width: '100%', height: '100%' }} />
        </Sequence>
      ))}
      {[...L.elementos].sort((a, b) => ({ broll: 0, full: 1, kw: 2, lw: 3 }[a.camada] - { broll: 0, full: 1, kw: 2, lw: 3 }[b.camada]) || a.inicio - b.inicio).map((e) => (
        <Sequence key={e._id} from={fr(e.inicio)} durationInFrames={Math.max(1, fr(e.dur))} premountFor={fps}>
          {e.camada === 'broll' && <Fade dur={e.dur} fd={0.18} fps={fps}><KenBurns src={e.arquivo} dur={e.dur} fps={fps} /></Fade>}
          {e.camada === 'full' && <Fade dur={e.dur} fd={0.15} fps={fps}><Video src={staticFile(e.arquivo)} muted style={{ width: '100%', height: '100%' }} /></Fade>}
          {(e.camada === 'kw' || e.camada === 'lw') && (
            <Video src={staticFile(e.arquivo)} muted style={{ position: 'absolute', left: 0, top: e.y, width: e.w, height: e.h }} />
          )}
        </Sequence>
      ))}
      {L.fim && (
        <Sequence from={fr(total)} durationInFrames={Math.max(1, fr(L.fim.dur))}>
          <Video src={staticFile(L.fim.arquivo)} muted style={{ width: '100%', height: '100%' }} />
        </Sequence>
      )}
      {L.musica && <Audio src={staticFile(L.musica.arquivo)} volume={ganho(L.musica.volume_db) * 1.6} loop />}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ editor */
export function EditorLongo({ proj, aoVoltar, aoRenderizar }: { proj: ProjetoLongo; aoVoltar?: () => void; aoRenderizar?: (p: Pacote) => void }) {
  const original = useMemo(() => anotarLongo(proj.longo), [proj]);
  const [est, setEst] = useState<{ p: LongoEd; antes: LongoEd[]; depois: LongoEd[] }>({ p: original, antes: [], depois: [] });
  const L = est.p;
  const [sel, setSel] = useState<Sel>(null);
  const [frame, setFrame] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [quem, setQuem] = useState(ler('editor-quem'));
  const player = useRef<PlayerRef>(null);
  const contador = useRef(0);
  const fps = L.fps;
  const t = frame / fps;
  const total = duracao(L);
  const comFim = total + (L.fim?.dur ?? 0);

  const nomeArq = useCallback((s: string) => (proj.biblioteca ?? []).find((x) => x.src === s)?.descricao ?? s.split('/').pop() ?? s, [proj]);
  const ajustes = useMemo(() => diferencasLongo(original, L, nomeArq), [original, L, nomeArq]);
  const mexidos = useMemo(() => new Set(ajustes.map((a) => a.alvo)), [ajustes]);
  const cruzados = useMemo(() => sobreposicoes(L), [L]);

  const mudar = useCallback((f: (p: LongoEd) => LongoEd) => setEst((s) => {
    const n = f(s.p);
    return n === s.p ? s : { p: n, antes: [...s.antes.slice(-80), s.p], depois: [] };
  }), []);
  const mudarSemHist = useCallback((f: (p: LongoEd) => LongoEd) => setEst((s) => ({ ...s, p: f(s.p) })), []);
  const marcarHist = useCallback(() => setEst((s) => ({ ...s, antes: [...s.antes.slice(-80), s.p], depois: [] })), []);
  const desfazer = () => setEst((s) => (s.antes.length ? { p: s.antes[s.antes.length - 1], antes: s.antes.slice(0, -1), depois: [s.p, ...s.depois] } : s));
  const refazer = () => setEst((s) => (s.depois.length ? { p: s.depois[0], antes: [...s.antes, s.p], depois: s.depois.slice(1) } : s));

  useEffect(() => {
    const pl = player.current;
    if (!pl) return;
    const onF = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onP = () => setTocando(true);
    const onS = () => setTocando(false);
    pl.addEventListener('frameupdate', onF);
    pl.addEventListener('play', onP);
    pl.addEventListener('pause', onS);
    return () => { pl.removeEventListener('frameupdate', onF); pl.removeEventListener('play', onP); pl.removeEventListener('pause', onS); };
  }, []);

  const irPara = (s: number) => player.current?.seekTo(Math.max(0, Math.round(s * fps)));
  const avisar = (m: string) => { setAviso(m); setTimeout(() => setAviso(''), 2600); };

  const trAtual = () => { const os_ = inicios(L); const i = L.trechos.findIndex((x, k) => t >= os_[k] && t < os_[k] + x.fim - x.ini); return i < 0 ? null : L.trechos[i]; };
  const dividir = () => {
    const tr = trAtual();
    if (!tr) return;
    const id = `tn${++contador.current}`;
    mudar((p) => dividirTrecho(p, tr._id, t, id));
    setSel({ tipo: 'tr', id });
    avisar('Trecho dividido na agulha');
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); player.current?.toggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); }
      if (e.key === 'ArrowLeft') player.current?.seekTo(Math.max(0, frame - (e.shiftKey ? fps : 1)));
      if (e.key === 'ArrowRight') player.current?.seekTo(frame + (e.shiftKey ? fps : 1));
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) dividir();
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); tirar(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const el = sel?.tipo === 'el' ? L.elementos.find((x) => x._id === sel.id) : undefined;
  const tr = sel?.tipo === 'tr' ? L.trechos.find((x) => x._id === sel.id) : undefined;
  const trIni = tr ? inicios(L)[L.trechos.indexOf(tr)] : 0;
  const mudarEl = (f: (e: LongoEd['elementos'][number]) => LongoEd['elementos'][number]) =>
    mudar((p) => ({ ...p, elementos: p.elementos.map((x) => (x._id === sel?.id ? f(x) : x)) }));

  function tirar() {
    if (el) { mudar((p) => ({ ...p, elementos: p.elementos.filter((x) => x._id !== el._id) })); setSel(null); }
    else if (tr && L.trechos.length > 1) { mudar((p) => removerTrecho(p, tr._id)); setSel(null); avisar('Trecho tirado; o resto foi puxado para trás'); }
  }

  const porBroll = (src: string) => {
    const id = `en${++contador.current}`;
    const ini = r2(Math.min(t, Math.max(0, total - 3)));
    mudar((p) => ({ ...p, elementos: [...p.elementos, { _id: id, camada: 'broll', arquivo: src, inicio: ini, dur: 3, rotulo: nomeArq(src), w: 1920, h: 1080, y: 0 }] }));
    setSel({ tipo: 'el', id });
    avisar(`B-roll posto em ${tc(ini)}`);
  };

  const exportar = (modo: 'automatico' | 'ajustado') => {
    const pacote: Pacote = {
      projeto: proj.id, tipo: 'longo', cliente: proj.cliente, titulo: proj.titulo, composicao: 'Longo', modo,
      editado_por: quem || 'sem nome', editado_em: new Date().toISOString(),
      ajustes: modo === 'automatico' ? [] : ajustes,
      longo: limparLongo(modo === 'automatico' ? original : L),
    };
    if (aoRenderizar) { player.current?.pause(); aoRenderizar(pacote); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 1)], { type: 'application/json' }));
    a.download = `${proj.id}-${modo}.json`;
    a.click();
  };

  const bibl = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of proj.biblioteca ?? []) m.set(b.src, b.descricao);
    for (const e of original.elementos) if (e.camada === 'broll' && !m.has(e.arquivo)) m.set(e.arquivo, e.rotulo);
    return [...m.entries()].map(([src, descricao]) => ({ src, descricao }));
  }, [proj, original]);

  return (
    <div className="app longo">
      <header className="topo">
        {aoVoltar && <button className="bt" onClick={aoVoltar}>← Projetos</button>}
        <div className="marca">euforia <b>{aoRenderizar ? 'studio' : 'editor'}</b></div>
        <button className="bt" onClick={desfazer} disabled={!est.antes.length} title="Ctrl+Z">↶ Desfazer</button>
        <button className="bt" onClick={refazer} disabled={!est.depois.length} title="Ctrl+Shift+Z">↷ Refazer</button>
        <div className="titulo">
          <strong>{proj.titulo}</strong>
          <span>{proj.cliente} · {tc(total)} · Vídeo longo</span>
        </div>
        <select className="quem" value={quem} onChange={(e) => { setQuem(e.target.value); gravar('editor-quem', e.target.value); }}>
          <option value="">Quem está editando?</option>
          {['Ismael', 'Daniel', 'Lorena', 'Rômulo', 'Escritório'].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button className="bt" onClick={() => exportar('automatico')} title="Renderiza exatamente o que a máquina montou">{aoRenderizar ? 'Renderizar como está' : 'Aprovar como está'}</button>
        <button className="bt pri" onClick={() => exportar('ajustado')} disabled={!ajustes.length}>{aoRenderizar ? 'Renderizar' : 'Exportar'} com {ajustes.length} ajuste{ajustes.length === 1 ? '' : 's'}</button>
      </header>

      <div className="meio">
        <aside className="col">
          <PainelPublicacao id={proj.id} pub={proj.publicacao} />
          <div className="sec">
            <h3>Registro da máquina</h3>
            {proj.maquina?.por_que && <p style={{ margin: '0 0 8px', fontSize: 13 }}>{proj.maquina.por_que}</p>}
            <div className="reg">
              {(proj.registro ?? []).map((l, i) => {
                const m = l.match(/^(\[[^\]]+\])\s*(.*)$/);
                return <div key={i}>{m ? <><span className="ag">{m[1]}</span> {m[2]}</> : l}</div>;
              })}
            </div>
          </div>
          {cruzados.length > 0 && (
            <div className="sec">
              <h3>Atenção <span style={{ color: '#ff9a6b' }}>{cruzados.length}</span></h3>
              <ul className="ajustes">
                {cruzados.map(({ a, b }) => (
                  <li key={a._id + b._id} style={{ cursor: 'pointer' }} onClick={() => { setSel({ tipo: 'el', id: b._id }); irPara(b.inicio); }}>
                    <i>cruza</i><span>{NOME_CAMADA[a.camada]} "{a.rotulo}" entra em cima de {NOME_CAMADA[b.camada].toLowerCase()} "{b.rotulo}" ({tc(b.inicio)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="sec">
            <h3>Biblioteca de B-roll</h3>
            <p className="dica" style={{ margin: '-4px 0 10px' }}>Clique para pôr no ponto onde o vídeo está.</p>
            <div className="bib">
              {bibl.map((b) => (
                <button key={b.src} onClick={() => porBroll(b.src)} title={b.descricao}>
                  {ehImagem(b.src) ? <img src={staticFile(b.src)} alt="" /> : (
                    <video src={staticFile(b.src)} muted preload="metadata" onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                  )}
                  <span>{b.descricao}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="palco">
          <div className="video">
            <Player
              ref={player}
              component={PreviaLongo as unknown as React.FC<Record<string, unknown>>}
              inputProps={{ L } as unknown as Record<string, unknown>}
              durationInFrames={Math.max(1, Math.ceil(comFim * fps))}
              compositionWidth={L.largura}
              compositionHeight={L.altura}
              fps={fps}
              style={{ width: '100%', height: '100%' }}
              controls={false}
              clickToPlay
              acknowledgeRemotionLicense
            />
          </div>
        </main>

        <aside className="col">
          <div className="sec">
            {!sel && <><h3>Ajustar</h3><p className="vazio">Clique num trecho da fala ou num elemento na linha do tempo. Para tirar só um pedaço da fala, pare a agulha no ponto e aperte S (divide o trecho).</p></>}

            {el && (
              <>
                <h3>{NOME_CAMADA[el.camada]} <span className="tempo">{tc(el.inicio)}–{tc(el.inicio + el.dur)}</span></h3>
                <p style={{ margin: '0 0 10px' }}>{el.rotulo}</p>
                {el.camada === 'broll' && (
                  <>
                    <div className="campo">
                      <label>Arquivo</label>
                      <select value={el.arquivo} onChange={(e) => mudarEl((x) => ({ ...x, arquivo: e.target.value, rotulo: nomeArq(e.target.value) }))}>
                        {[...new Set([el.arquivo, ...bibl.map((b) => b.src)])].map((s) => <option key={s} value={s}>{nomeArq(s)}</option>)}
                      </select>
                    </div>
                    <div className="campo">
                      <label>Duração</label>
                      <div className="linha">
                        <button className="bt mini" onClick={() => mudarEl((x) => ({ ...x, dur: r2(Math.max(0.8, x.dur - 0.5)) }))}>−0,5 s</button>
                        <span className="tempo">{el.dur.toFixed(1)} s</span>
                        <button className="bt mini" onClick={() => mudarEl((x) => ({ ...x, dur: r2(Math.min(12, x.dur + 0.5)) }))}>+0,5 s</button>
                      </div>
                    </div>
                  </>
                )}
                <div className="campo">
                  <label>Início</label>
                  <div className="linha">
                    <button className="bt mini" onClick={() => mudarEl((x) => ({ ...x, inicio: r2(Math.max(0, x.inicio - 0.5)) }))}>−0,5 s</button>
                    <span className="tempo">{tc(el.inicio)}</span>
                    <button className="bt mini" onClick={() => mudarEl((x) => ({ ...x, inicio: r2(Math.min(total - 0.5, x.inicio + 0.5)) }))}>+0,5 s</button>
                    <button className="bt mini" onClick={() => mudarEl((x) => ({ ...x, inicio: r2(Math.min(t, total - 0.5)) }))}>Pôr na agulha</button>
                  </div>
                </div>
                <div className="linha">
                  <button className="bt mini" onClick={() => irPara(el.inicio)}>Ver</button>
                  <button className="bt mini perigo" onClick={tirar}>Tirar {NOME_CAMADA[el.camada].toLowerCase()}</button>
                </div>
                {el.camada !== 'broll' && <p className="dica">Texto e animação vêm prontos da máquina: aqui dá para mover ou tirar. Para trocar o texto, peça ajuste à máquina.</p>}
              </>
            )}

            {tr && (
              <>
                <h3>Trecho da fala <span className="tempo">{tc(trIni)}–{tc(trIni + tr.fim - tr.ini)}</span></h3>
                <p style={{ margin: '0 0 10px' }}>"{textoDoTrecho(L, tr.ini, tr.fim, 40)}"</p>
                <div className="linha">
                  <button className="bt mini" onClick={() => irPara(trIni)}>Ver</button>
                  <button className="bt mini" onClick={dividir} disabled={!(t > trIni + 0.2 && t < trIni + tr.fim - tr.ini - 0.2)} title="S">Dividir na agulha</button>
                  <button className="bt mini perigo" disabled={L.trechos.length < 2} onClick={tirar}>Tirar este trecho</button>
                </div>
                <p className="dica">Tirar um trecho apaga os elementos que começam nele e encurta o vídeo.</p>
              </>
            )}
          </div>

          {L.musica && (
            <div className="sec">
              <h3>Trilha</h3>
              <div className="campo">
                <label>Volume · {L.musica.volume_db} dB {L.musica.volume_db === original.musica?.volume_db ? '(o da máquina)' : ''}</label>
                <input type="range" min={-45} max={-20} step={1} value={L.musica.volume_db} onPointerDown={marcarHist}
                  onChange={(e) => mudarSemHist((p) => ({ ...p, musica: p.musica ? { ...p.musica, volume_db: Number(e.target.value) } : p.musica }))} />
              </div>
              <p className="dica">No vídeo final a trilha abaixa sozinha quando a pessoa fala.</p>
            </div>
          )}

          <div className="sec">
            <h3>Ajustes <span>{ajustes.length ? 'a máquina aprende com isso' : ''}</span></h3>
            {ajustes.length ? (
              <ul className="ajustes">{ajustes.map((a, i) => <li key={i}><i>{a.tipo.split('_')[0]}</i><span>{a.texto}</span></li>)}</ul>
            ) : <p className="vazio">Nada mudado. Se estiver bom, é só renderizar como está.</p>}
          </div>
        </aside>
      </div>

      <LinhaLonga L={L} t={t} total={total} comFim={comFim} tocando={tocando} sel={sel} setSel={setSel} irPara={irPara} mexidos={mexidos}
        play={() => player.current?.toggle()} mudarSemHist={mudarSemHist} marcarHist={marcarHist} dividir={dividir} />
      {aviso && <div className="aviso">{aviso}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ linha do tempo */
const TRILHAS: { camada: Camada; nome: string; cls: string }[] = [
  { camada: 'broll', nome: 'B-roll', cls: 'br' },
  { camada: 'full', nome: 'Tela cheia', cls: 'ca' },
  { camada: 'kw', nome: 'Textos', cls: 'kw' },
  { camada: 'lw', nome: 'Lowers', cls: 'lw' },
];

function LinhaLonga({ L, t, total, comFim, tocando, sel, setSel, irPara, mexidos, play, mudarSemHist, marcarHist, dividir }: {
  L: LongoEd; t: number; total: number; comFim: number; tocando: boolean; sel: Sel; setSel: (s: Sel) => void; irPara: (s: number) => void;
  mexidos: Set<string>; play: () => void; mudarSemHist: (f: (p: LongoEd) => LongoEd) => void; marcarHist: () => void; dividir: () => void;
}) {
  const corpo = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(14); // pixels por segundo
  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const px = 96 + t * pps;
    if (px < el.scrollLeft + 96 || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - 200);
  }, [t, pps]);
  const x = (s: number) => s * pps;
  const bloco = (ini: number, fim: number) => ({ left: x(ini), width: Math.max(3, x(fim) - x(ini) - 1) });
  const os_ = inicios(L);
  const palavras = useMemo(() => palavrasSaida(L), [L]);

  const arrastar = (e: React.PointerEvent, id: string, modo: 'mover' | 'd') => {
    e.stopPropagation();
    setSel({ tipo: 'el', id });
    const item = L.elementos.find((b) => b._id === id);
    if (!item) return;
    const x0 = e.clientX, s0 = item.inicio, d0 = item.dur;
    let marcou = false;
    const mv = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / pps;
      if (!marcou && Math.abs(ev.clientX - x0) > 2) { marcarHist(); marcou = true; }
      if (!marcou) return;
      const novo = modo === 'mover'
        ? { inicio: r2(Math.min(Math.max(0, s0 + d), total - 0.5)) }
        : { dur: r2(Math.min(12, Math.max(0.8, d0 + d))) };
      mudarSemHist((p) => ({ ...p, elementos: p.elementos.map((b) => (b._id === id ? { ...b, ...novo } : b)) }));
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const marcas: number[] = [];
  const passo = pps > 40 ? 2 : pps > 15 ? 5 : pps > 6 ? 10 : 30;
  for (let s = 0; s <= comFim; s += passo) marcas.push(s);
  const ativo = (tipo: string, id: string) => (sel?.tipo === tipo && sel.id === id ? ' sel' : '') + (mexidos.has(id) ? ' mexido' : '');

  return (
    <section className="tl">
      <div className="tl-barra">
        <button className="bt mini" onClick={play}>{tocando ? '❚❚ Pausar' : '▶ Tocar'}</button>
        <span className="tc">{tc(t)}</span>
        <span className="tempo">/ {tc(total)}</span>
        <button className="bt mini" onClick={dividir} title="S">✂ Dividir na agulha</button>
        <span style={{ flex: 1 }} />
        <span className="tempo">espaço toca · S divide · Delete tira · Ctrl+Z desfaz</span>
        <button className="bt mini" onClick={() => setPps((p) => Math.max(2, p / 1.5))}>−</button>
        <button className="bt mini" onClick={() => setPps((p) => Math.min(120, p * 1.5))}>+</button>
      </div>
      <div className="tl-corpo" ref={corpo}>
        <div className="tl-trilhas" style={{ width: x(comFim) + 96 + 16 }}>
          <div className="regua" onPointerDown={(e) => irPara((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)}>
            {marcas.map((s) => <span key={s} style={{ left: x(s) }}>{tc(s).replace(/\.0$/, '')}</span>)}
          </div>
          <div className="trilha fala"><div className="trilha-nome">Fala</div>
            {L.trechos.map((s, i) => (
              <div key={s._id} className={'bloco co' + ativo('tr', s._id)} style={bloco(os_[i], os_[i] + s.fim - s.ini)}
                onClick={(e) => { setSel({ tipo: 'tr', id: s._id }); irPara(os_[i] + (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps); }}
                title={textoDoTrecho(L, s.ini, s.fim, 60)}>
                {pps >= 45 ? palavras.filter((p) => p.t >= os_[i] && p.t < os_[i] + s.fim - s.ini).map((p, k) => (
                  <span key={k} className="pal" style={{ left: x(p.t - os_[i]) }}>{p.w}</span>
                )) : textoDoTrecho(L, s.ini, s.fim, 6)}
              </div>
            ))}
            {L.fim && <div className="bloco fr" style={bloco(total, comFim)}>tela final</div>}
          </div>
          {TRILHAS.map((tr) => (
            <div key={tr.camada} className="trilha"><div className="trilha-nome">{tr.nome}</div>
              {L.elementos.filter((e) => e.camada === tr.camada).map((e) => (
                <div key={e._id} className={`bloco ${tr.cls}` + ativo('el', e._id)} style={bloco(e.inicio, e.inicio + e.dur)}
                  onPointerDown={(ev) => arrastar(ev, e._id, 'mover')} title={e.rotulo}>
                  {e.rotulo}
                  {e.camada === 'broll' && <span className="alca d" onPointerDown={(ev) => arrastar(ev, e._id, 'd')} />}
                </div>
              ))}
            </div>
          ))}
          <div className="cabeca" style={{ left: x(t), top: 0 }} />
        </div>
      </div>
    </section>
  );
}
