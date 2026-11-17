// Editor Euforia: abre o projeto que a máquina de shorts montou, mostra a prévia ao vivo (sem renderizar),
// deixa a equipe ajustar legenda, destaque, B-roll, cartão e cortes, e exporta o projeto ajustado + a lista de ajustes.
import { Velocidade, useVelocidade } from './velocidade';
import { lerRascunho, maiorId, useRascunho } from './rascunho';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, type PlayerRef } from '@remotion/player';
import { ShortViral } from '../src/ShortViral';
import { ShortInstitucional } from '../src/ShortInstitucional';
import { anotar, diferencas, durSeg, limpar, removerCorte, type Projeto, type PropsEditor } from './projeto';
import { Estudio, type Pacote } from './estudio';
import { EditorLongo } from './longo';
import { PainelPublicacao } from './publicacao';
import type { ProjetoLongo } from './longo-projeto';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';

type Sel = { tipo: 'leg' | 'br' | 'ca' | 'co'; id: string } | null;
const COMPS = { ShortViral, ShortInstitucional } as const;
const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const r2 = (x: number) => Math.round(x * 100) / 100;
const ler = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

/* ------------------------------------------------------------------ abrir projeto */
// staticFile do Remotion só aceita caminho no mesmo endereço do editor: mídia e editor ficam juntos na hospedagem
function usarProjeto(p: Projeto, urlProjeto?: string) {
  window.remotion_staticBase = new URL(p.base || '.', urlProjeto ?? window.location.href).pathname.replace(/\/$/, '');
}

function App() {
  const [proj, setProj] = useState<Projeto | null>(null);
  const [erro, setErro] = useState('');

  const usar = useCallback((p: Projeto, urlProjeto?: string) => {
    usarProjeto(p, urlProjeto);
    setProj(p);
  }, []);

  useEffect(() => {
    if (window.estudio) return; // no app, a tela de projetos abre os projetos
    // sem ?projeto=, tenta o projeto padrão ao lado do editor (demonstração)
    const u = new URLSearchParams(window.location.search).get('projeto') ?? 'projetos/projeto-1.json';
    const abs = new URL(u, window.location.href).href;
    fetch(abs)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((p) => usar(p, abs))
      .catch((e) => { if (new URLSearchParams(window.location.search).get('projeto')) setErro(`Não abriu o projeto (${e.message}).`); });
  }, [usar]);

  if (window.estudio) return <Estudio Editor={EditorQualquer} usar={usarProjeto} />;
  if (proj) return <EditorQualquer proj={proj} />;
  return (
    <div className="abrir">
      <div className="marca">euforia <b>editor</b></div>
      <p className="vazio">Abra o projeto que a máquina montou (arquivo projeto.json do short).</p>
      <label className="bt pri">
        Abrir projeto
        <input type="file" accept=".json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { usar(JSON.parse(await f.text())); } catch { setErro('Arquivo inválido.'); }
        }} />
      </label>
      {erro && <p style={{ color: '#ff9a6b' }}>{erro}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ editor */
// short ou longo: o projeto diz (longos/studio.py grava "tipo": "longo")
type PropsEditorTela = { proj: Projeto; aoVoltar?: () => void; aoRenderizar?: (p: Pacote) => void };
function EditorQualquer(p: PropsEditorTela) {
  const pl = p.proj as unknown as ProjetoLongo;
  return pl.tipo === 'longo' ? <EditorLongo proj={pl} aoVoltar={p.aoVoltar} aoRenderizar={p.aoRenderizar} /> : <Editor {...p} />;
}

function Editor({ proj, aoVoltar, aoRenderizar }: { proj: Projeto; aoVoltar?: () => void; aoRenderizar?: (p: Pacote) => void }) {
  const original = useMemo(() => anotar(proj.props), [proj]);
  // estado + histórico juntos, para desfazer/refazer sem corrida
  const [est, setEst] = useState<{ p: PropsEditor; antes: PropsEditor[]; depois: PropsEditor[] }>(() => ({ p: lerRascunho<PropsEditor>(proj.id) ?? original, antes: [], depois: [] }));
  const props = est.p;
  const hist = est;
  const [sel, setSel] = useState<Sel>(null);
  const [frame, setFrame] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [fim, setFim] = useState<null | { ajustes: number; modo: string }>(null);
  const [quem, setQuem] = useState(ler('editor-quem'));
  const player = useRef<PlayerRef>(null);
  const [vel] = useVelocidade();
  const [idIni] = useState(() => maiorId(est.p));
  const contador = useRef(idIni);
  const retomado = useRef(est.p !== original);
  useRascunho(proj.id, est.p, original);

  const fps = props.fps;
  const t = frame / fps;
  // nome legível do B-roll: descrição da biblioteca, senão "B-roll da máquina N"
  const nomeBr = (src: string) => (proj.biblioteca ?? []).find((x) => x.src === src)?.descricao
    ?? `B-roll da máquina ${original.brolls.findIndex((b) => b.src === src) + 1 || ''}`.trim();
  const ajustes = useMemo(() => diferencas(original, props, (s) => `"${nomeBr(s)}"`), [original, props]); // eslint-disable-line
  const mexidos = useMemo(() => new Set(ajustes.map((a) => a.alvo)), [ajustes]);

  // toda mudança passa por aqui: guarda o estado anterior para desfazer
  const mudar = useCallback((f: (p: PropsEditor) => PropsEditor) => setEst((s) => {
    const n = f(s.p);
    return n === s.p ? s : { p: n, antes: [...s.antes.slice(-80), s.p], depois: [] };
  }), []);
  // durante arraste/cor/volume: muda sem empilhar (marcarHist guarda o estado no começo do gesto)
  const mudarSemHist = useCallback((f: (p: PropsEditor) => PropsEditor) => setEst((s) => ({ ...s, p: f(s.p) })), []);
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

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); player.current?.toggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); }
      if (e.key === 'ArrowLeft') player.current?.seekTo(Math.max(0, frame - (e.shiftKey ? fps : 1)));
      if (e.key === 'ArrowRight') player.current?.seekTo(frame + (e.shiftKey ? fps : 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const irPara = (seg: number) => player.current?.seekTo(Math.max(0, Math.round(seg * fps)));
  const avisar = (m: string) => { setAviso(m); setTimeout(() => setAviso(''), 2600); };
  useEffect(() => { if (retomado.current) { setAviso('Abri do jeito que você deixou da última vez.'); setTimeout(() => setAviso(''), 4000); } }, []);

  const exportar = async (modo: 'automatico' | 'ajustado') => {
    const pacote = {
      projeto: proj.id,
      cliente: proj.cliente,
      titulo: proj.titulo,
      composicao: proj.composicao,
      modo,
      editado_por: quem || 'sem nome',
      editado_em: new Date().toISOString(),
      ajustes: modo === 'automatico' ? [] : ajustes,
      props: limpar(modo === 'automatico' ? original : props),
    };
    if (aoRenderizar) { player.current?.pause(); aoRenderizar(pacote); return; } // app: renderiza neste PC
    const json = JSON.stringify(pacote, null, 1);
    let foi = false;
    if (proj.salvar) {
      try {
        const r = await fetch(proj.salvar, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
        foi = r.ok;
      } catch { foi = false; }
    }
    if (!foi) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `${proj.id}-${modo}.json`;
      a.click();
    }
    setFim({ ajustes: pacote.ajustes.length, modo });
  };

  /* ---------- itens selecionados ---------- */
  const leg = sel?.tipo === 'leg' ? props.captions.find((c) => c._id === sel.id) : undefined;
  const br = sel?.tipo === 'br' ? props.brolls.find((c) => c._id === sel.id) : undefined;
  const ca = sel?.tipo === 'ca' ? props.cartoes.find((c) => c._id === sel.id) : undefined;
  const co = sel?.tipo === 'co' ? props.segments.find((c) => c._id === sel.id) : undefined;

  const mudarLeg = (f: (c: PropsEditor['captions'][number]) => PropsEditor['captions'][number]) =>
    mudar((p) => ({ ...p, captions: p.captions.map((c) => (c._id === sel?.id ? f(c) : c)) }));
  const mudarBr = (f: (c: PropsEditor['brolls'][number]) => PropsEditor['brolls'][number]) =>
    mudar((p) => ({ ...p, brolls: p.brolls.map((c) => (c._id === sel?.id ? f(c) : c)) }));
  const mudarCa = (f: (c: PropsEditor['cartoes'][number]) => PropsEditor['cartoes'][number]) =>
    mudar((p) => ({ ...p, cartoes: p.cartoes.map((c) => (c._id === sel?.id ? f(c) : c)) }));

  const porBroll = (src: string) => {
    const id = `brn${++contador.current}`;
    const ini = r2(Math.min(t, Math.max(0, props.duration - 2.5)));
    mudar((p) => ({ ...p, brolls: [...p.brolls, { _id: id, src, start: ini, end: r2(Math.min(p.duration, ini + 2.5)), mode: 'dividido', legenda: null }] }));
    setSel({ tipo: 'br', id });
    avisar(`B-roll posto em ${tc(ini)}`);
  };

  const Comp = COMPS[proj.composicao] as unknown as React.FC<Record<string, unknown>>;
  const nota = proj.maquina?.nota_confianca;

  return (
    <div className="app">
      <header className="topo">
        {aoVoltar && <button className="bt" onClick={aoVoltar}>← Projetos</button>}
        {est.p !== original && <button className="bt" title="Desfaz tudo o que foi mexido neste projeto (Ctrl+Z traz de volta)" onClick={() => { mudar(() => original); avisar('Voltei ao original. Ctrl+Z traz seus ajustes de volta.'); }}>↺ Original</button>}
        <div className="marca">euforia <b>{aoRenderizar ? 'studio' : 'editor'}</b></div>
        <button className="bt" onClick={desfazer} disabled={!hist.antes.length} title="Ctrl+Z">↶ Desfazer</button>
        <button className="bt" onClick={refazer} disabled={!hist.depois.length} title="Ctrl+Shift+Z">↷ Refazer</button>
        <div className="titulo">
          <strong>{proj.titulo}</strong>
          <span>{proj.cliente} · {tc(props.duration)} · {proj.composicao === 'ShortViral' ? 'Viral' : 'Institucional'}</span>
        </div>
        <select className="quem" value={quem} onChange={(e) => { setQuem(e.target.value); gravar('editor-quem', e.target.value); }}>
          <option value="">Quem está editando?</option>
          {['Ismael', 'Daniel', 'Lorena', 'Rômulo', 'Victor', 'Escritório'].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button className="bt" onClick={() => exportar('automatico')} title="Renderiza exatamente o que a máquina montou">{aoRenderizar ? 'Renderizar como está' : 'Aprovar como está'}</button>
        <button className="bt pri" onClick={() => exportar('ajustado')} disabled={!ajustes.length}>{aoRenderizar ? 'Renderizar' : 'Exportar'} com {ajustes.length} ajuste{ajustes.length === 1 ? '' : 's'}</button>
      </header>

      <div className="meio">
        {/* ---------- esquerda: o que a máquina fez + biblioteca ---------- */}
        <aside className="col">
          <PainelPublicacao id={proj.id} pub={proj.publicacao} />
          <div className="sec">
            <h3>Registro da máquina {nota != null && <span style={{ color: nota < 0.6 ? '#ff9a6b' : 'var(--ok)' }}>confiança {Math.round(nota * 100)}%</span>}</h3>
            {proj.maquina?.por_que && <p style={{ margin: '0 0 8px', fontSize: 13 }}>{proj.maquina.por_que}</p>}
            <div className="reg">
              {(proj.registro ?? []).map((l, i) => {
                const m = l.match(/^(\[[^\]]+\])\s*(.*)$/);
                return <div key={i}>{m ? <><span className="ag">{m[1]}</span> {m[2]}</> : l}</div>;
              })}
              <div><span className="ag">[montagem]</span> {original.segments.length} cortes, {original.captions.length} legendas, {original.captions.reduce((n, c) => n + c.words.filter((w) => w.hl).length, 0)} destaques, {original.brolls.length} B-rolls, {original.cartoes.length} cartões</div>
            </div>
          </div>
          <div className="sec">
            <h3>Biblioteca de B-roll</h3>
            <p className="dica" style={{ margin: '-4px 0 10px' }}>Clique para pôr no ponto onde o vídeo está.</p>
            {proj.biblioteca?.length ? (
              <div className="bib">
                {proj.biblioteca.map((b) => (
                  <button key={b.src} onClick={() => porBroll(b.src)} title={b.descricao}>
                    <video src={`${window.remotion_staticBase}/${b.src}`} muted preload="metadata" onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                    <span>{b.descricao}</span>
                  </button>
                ))}
              </div>
            ) : <p className="vazio">Sem B-rolls extras neste projeto.</p>}
          </div>
        </aside>

        {/* ---------- centro: prévia ao vivo ---------- */}
        <main className="palco">
          <div className="video">
            <Player
              ref={player}
              playbackRate={vel}
              component={Comp}
              inputProps={props as unknown as Record<string, unknown>}
              durationInFrames={Math.max(1, Math.ceil(props.duration * fps))}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={fps}
              style={{ width: '100%', height: '100%' }}
              controls={false}
              clickToPlay
              acknowledgeRemotionLicense
            />
          </div>
        </main>

        {/* ---------- direita: inspetor + ajustes ---------- */}
        <aside className="col">
          <div className="sec">
            {!sel && <><h3>Ajustar</h3><p className="vazio">Clique numa legenda, B-roll, cartão ou corte na linha do tempo.</p></>}

            {leg && (
              <>
                <h3>Legenda <span className="tempo">{tc(leg.start)}–{tc(leg.end)}</span></h3>
                <div className="palavras">
                  {leg.words.map((w, i) => (
                    <div key={i} className={`palavra ${w.hl ? 'hl' : ''}`}>
                      <input type="text" value={w.text} size={Math.max(2, w.text.length)} onChange={(e) => mudarLeg((c) => ({ ...c, words: c.words.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                      <button title="Destaque" onClick={() => mudarLeg((c) => ({ ...c, words: c.words.map((x, j) => (j === i ? { ...x, hl: !x.hl } : x)) }))}>★</button>
                    </div>
                  ))}
                </div>
                <div className="linha">
                  <button className="bt mini" onClick={() => irPara(leg.start)}>Ver</button>
                  <button className="bt mini perigo" onClick={() => { mudar((p) => ({ ...p, captions: p.captions.filter((c) => c._id !== leg._id) })); setSel(null); }}>Apagar legenda</button>
                </div>
                <p className="dica">★ liga ou desliga o destaque da palavra. O texto muda só a legenda, não a fala.</p>
              </>
            )}

            {br && (
              <>
                <h3>B-roll <span className="tempo">{tc(br.start)}–{tc(br.end)}</span></h3>
                <div className="campo">
                  <label>Arquivo</label>
                  <select value={br.src} onChange={(e) => mudarBr((b) => ({ ...b, src: e.target.value }))}>
                    {[...new Set([br.src, ...props.brolls.map((x) => x.src), ...(proj.biblioteca ?? []).map((x) => x.src)])].map((s) => (
                      <option key={s} value={s}>{nomeBr(s)}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Como aparece</label>
                  <div className="linha">
                    {(['dividido', 'cheio'] as const).map((m) => (
                      <button key={m} className={`bt mini ${br.mode === m ? 'pri' : ''}`} onClick={() => mudarBr((b) => ({ ...b, mode: m }))}>{m === 'dividido' ? 'Tela dividida' : 'Tela cheia'}</button>
                    ))}
                  </div>
                </div>
                <div className="campo">
                  <label>Duração</label>
                  <div className="linha">
                    <button className="bt mini" onClick={() => mudarBr((b) => ({ ...b, end: r2(Math.max(b.start + 0.5, b.end - 0.5)) }))}>−0,5 s</button>
                    <span className="tempo">{(br.end - br.start).toFixed(1)} s</span>
                    <button className="bt mini" onClick={() => mudarBr((b) => ({ ...b, end: r2(Math.min(props.duration, b.end + 0.5)) }))}>+0,5 s</button>
                  </div>
                </div>
                <div className="linha">
                  <button className="bt mini" onClick={() => irPara(br.start)}>Ver</button>
                  <button className="bt mini perigo" onClick={() => { mudar((p) => ({ ...p, brolls: p.brolls.filter((b) => b._id !== br._id) })); setSel(null); }}>Tirar B-roll</button>
                </div>
                <p className="dica">Arraste o bloco na linha do tempo para mover; puxe as bordas para mudar a duração.</p>
              </>
            )}

            {ca && (
              <>
                <h3>Cartão <span className="tempo">{tc(ca.start)}–{tc(ca.end)}</span></h3>
                <div className="campo">
                  <label>Texto</label>
                  <textarea rows={3} value={ca.palavras.map((w) => w.text).join(' ')} onChange={(e) => {
                    const ws = e.target.value.split(/\s+/).filter(Boolean);
                    mudarCa((c) => ({ ...c, palavras: ws.map((x, i) => ({ text: x, start: c.palavras[Math.min(i, c.palavras.length - 1)]?.start ?? c.start })) }));
                  }} />
                </div>
                {ca.autor != null && (
                  <div className="campo"><label>Autor</label><input type="text" value={ca.autor ?? ''} onChange={(e) => mudarCa((c) => ({ ...c, autor: e.target.value }))} /></div>
                )}
                <div className="linha">
                  <button className="bt mini" onClick={() => irPara(ca.start)}>Ver</button>
                  <button className="bt mini perigo" onClick={() => { mudar((p) => ({ ...p, cartoes: p.cartoes.filter((c) => c._id !== ca._id) })); setSel(null); }}>Tirar cartão</button>
                </div>
              </>
            )}

            {co && (
              <>
                <h3>Corte <span className="tempo">{tc(co.outStart)}–{tc(co.outStart + durSeg(co))}</span></h3>
                <p style={{ margin: '0 0 10px' }}>Trecho de {durSeg(co).toFixed(1)} s, do minuto {tc(co.srcStart)} do vídeo original.</p>
                <div className="linha">
                  <button className="bt mini" onClick={() => irPara(co.outStart)}>Ver</button>
                  <button className="bt mini perigo" disabled={props.segments.length < 2} onClick={() => { mudar((p) => removerCorte(p, co._id)); setSel(null); avisar('Trecho tirado; o resto foi puxado para trás'); }}>Tirar este trecho</button>
                </div>
                <p className="dica">Tirar um trecho apaga as legendas e grafismos dele e encurta o short.</p>
              </>
            )}
          </div>

          <div className="sec">
            <h3>Estilo</h3>
            <div className="campo">
              <label>Cor do destaque</label>
              <div className="linha">
                <input type="color" value={props.estilo.corDestaque} onChange={(e) => mudarSemHist((p) => ({ ...p, estilo: { ...p.estilo, corDestaque: e.target.value } }))} onFocus={marcarHist} />
                <span className="tempo">{props.estilo.corDestaque}</span>
              </div>
            </div>
            {props.musica && (
              <div className="campo">
                <label>Volume da trilha · {Math.round(props.musica.volume * 100)}%</label>
                <input type="range" min={0} max={0.3} step={0.01} value={props.musica.volume} onPointerDown={marcarHist}
                  onChange={(e) => mudarSemHist((p) => ({ ...p, musica: p.musica ? { ...p.musica, volume: Number(e.target.value) } : p.musica }))} />
              </div>
            )}
          </div>

          <div className="sec">
            <h3>Ajustes <span>{ajustes.length ? 'a máquina aprende com isso' : ''}</span></h3>
            {ajustes.length ? (
              <ul className="ajustes">
                {ajustes.map((a, i) => <li key={i}><i>{a.tipo.split('_')[0]}</i><span>{a.texto}</span></li>)}
              </ul>
            ) : <p className="vazio">Nada mudado. Se estiver bom, é só aprovar como está.</p>}
          </div>
        </aside>
      </div>

      <LinhaDoTempo props={props} t={t} tocando={tocando} sel={sel} setSel={setSel} irPara={irPara} mexidos={mexidos}
        play={() => player.current?.toggle()} mudarSemHist={mudarSemHist} marcarHist={marcarHist} nomeBr={nomeBr} />

      {aviso && <div className="aviso">{aviso}</div>}
      {fim && (
        <div className="modal" onClick={() => setFim(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h2>{fim.modo === 'automatico' ? 'Aprovado como a máquina fez' : 'Projeto exportado'}</h2>
            <p>{fim.modo === 'automatico'
              ? 'O short vai ser renderizado exatamente como a máquina montou.'
              : `O short vai ser renderizado com os ${fim.ajustes} ajustes. Eles ficam guardados para a máquina errar menos nos próximos.`}</p>
            {!proj.salvar && <p className="vazio">Protótipo: o arquivo foi baixado no seu computador. Na versão ligada ao painel, ele vai direto para a fila de render.</p>}
            <button className="bt pri" onClick={() => setFim(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ linha do tempo */
type TLProps = {
  props: PropsEditor; t: number; tocando: boolean; sel: Sel; setSel: (s: Sel) => void; irPara: (s: number) => void;
  mexidos: Set<string>; play: () => void; mudarSemHist: (f: (p: PropsEditor) => PropsEditor) => void; marcarHist: () => void; nomeBr: (s: string) => string;
};

function LinhaDoTempo({ props, t, tocando, sel, setSel, irPara, mexidos, play, mudarSemHist, marcarHist, nomeBr }: TLProps) {
  const corpo = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(1000);
  const [zoom, setZoom] = useState(0); // 0 = ainda não calculado: começa com ~45 px por segundo
  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLarg(el.clientWidth - 96 - 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const z = zoom || Math.max(1, (45 * props.duration) / Math.max(1, larg));
  const pps = (larg / Math.max(1, props.duration)) * z; // pixels por segundo
  // a linha do tempo acompanha a reprodução
  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const px = 96 + t * pps;
    if (px < el.scrollLeft + 96 || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - 200);
  }, [t, pps]);
  const x = (s: number) => s * pps;

  const arrastar = (e: React.PointerEvent, tipo: 'br' | 'ca', id: string, modo: 'mover' | 'e' | 'd') => {
    e.stopPropagation();
    setSel({ tipo, id });
    const x0 = e.clientX;
    const lista = tipo === 'br' ? props.brolls : props.cartoes;
    const item = lista.find((b) => b._id === id);
    if (!item) return;
    const { start: s0, end: e0 } = item;
    let marcou = false;
    const mv = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / pps;
      if (!marcou && Math.abs(ev.clientX - x0) > 2) { marcarHist(); marcou = true; }
      if (!marcou) return;
      let s = s0, f = e0;
      if (modo === 'mover') { s = Math.min(Math.max(0, s0 + d), props.duration - (e0 - s0)); f = s + (e0 - s0); }
      if (modo === 'e') s = Math.min(Math.max(0, s0 + d), e0 - 0.5);
      if (modo === 'd') f = Math.max(Math.min(props.duration, e0 + d), s0 + 0.5);
      const novo = { start: r2(s), end: r2(f) };
      mudarSemHist((p) => (tipo === 'br'
        ? { ...p, brolls: p.brolls.map((b) => (b._id === id ? { ...b, ...novo } : b)) }
        : { ...p, cartoes: p.cartoes.map((b) => (b._id === id ? { ...b, ...novo } : b)) }));
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const marcas = [];
  const passo = pps > 60 ? 1 : pps > 25 ? 2 : 5;
  for (let s = 0; s <= props.duration; s += passo) marcas.push(s);
  const ativo = (tipo: string, id: string) => (sel?.tipo === tipo && sel.id === id ? ' sel' : '') + (mexidos.has(id) ? ' mexido' : '');
  const bloco = (ini: number, fim: number) => ({ left: x(ini), width: Math.max(4, x(fim) - x(ini) - 2) });

  return (
    <section className="tl">
      <div className="tl-barra">
        <button className="bt mini" onClick={play}>{tocando ? '❚❚ Pausar' : '▶ Tocar'}</button>
        <span className="tc">{tc(t)}</span>
        <span className="tempo">/ {tc(props.duration)}</span>
        <Velocidade />
        <span style={{ flex: 1 }} />
        <span className="tempo">espaço toca · ← → anda · Ctrl+Z desfaz</span>
        <button className="bt mini" onClick={() => setZoom(Math.max(1, z / 1.5))}>−</button>
        <button className="bt mini" onClick={() => setZoom(Math.min(12, z * 1.5))}>+</button>
      </div>
      <div className="tl-corpo" ref={corpo}>
        <div className="tl-trilhas" style={{ width: x(props.duration) + 96 + 16 }}>
          <div className="regua" onPointerDown={(e) => irPara((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)}>
            {marcas.map((s) => <span key={s} style={{ left: x(s) }}>{tc(s).replace(/\.0$/, '')}</span>)}
          </div>
          <div className="trilha"><div className="trilha-nome">Cortes</div>
            {props.segments.map((s) => (
              <div key={s._id} className={'bloco co' + ativo('co', s._id)} style={bloco(s.outStart, s.outStart + durSeg(s))}
                onClick={() => { setSel({ tipo: 'co', id: s._id }); irPara(s.outStart); }}>{durSeg(s).toFixed(1)} s</div>
            ))}
          </div>
          <div className="trilha"><div className="trilha-nome">Legenda</div>
            {props.captions.map((c) => (
              <div key={c._id} className={'bloco leg' + (c.hook ? ' gancho' : '') + ativo('leg', c._id)} style={bloco(c.start, c.end)}
                onClick={() => { setSel({ tipo: 'leg', id: c._id }); irPara(c.start); }} title={c.words.map((w) => w.text).join(' ')}>
                {c.words.map((w) => (w.hl ? w.text.toUpperCase() : w.text)).join(' ')}
              </div>
            ))}
          </div>
          <div className="trilha"><div className="trilha-nome">B-roll</div>
            {props.brolls.map((b) => (
              <div key={b._id} className={'bloco br' + ativo('br', b._id)} style={bloco(b.start, b.end)} onPointerDown={(e) => arrastar(e, 'br', b._id, 'mover')}>
                <span className="alca e" onPointerDown={(e) => arrastar(e, 'br', b._id, 'e')} />
                {b.mode === 'cheio' ? '▣ ' : '◧ '}{nomeBr(b.src)}
                <span className="alca d" onPointerDown={(e) => arrastar(e, 'br', b._id, 'd')} />
              </div>
            ))}
          </div>
          <div className="trilha"><div className="trilha-nome">Cartões</div>
            {props.cartoes.map((c) => (
              <div key={c._id} className={'bloco ca' + ativo('ca', c._id)} style={bloco(c.start, c.end)} onPointerDown={(e) => arrastar(e, 'ca', c._id, 'mover')}>
                <span className="alca e" onPointerDown={(e) => arrastar(e, 'ca', c._id, 'e')} />
                {c.palavras.map((w) => w.text).join(' ')}
                <span className="alca d" onPointerDown={(e) => arrastar(e, 'ca', c._id, 'd')} />
              </div>
            ))}
          </div>
          <div className="trilha"><div className="trilha-nome">Câmera</div>
            {props.framing.map((f, i) => (
              <div key={i} className="bloco fr" style={bloco(f.start, f.end)}>{f.scale > 1.05 ? 'fechado' : 'aberto'}</div>
            ))}
          </div>
          <div className="cabeca" style={{ left: x(t), top: 0 }} />
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
