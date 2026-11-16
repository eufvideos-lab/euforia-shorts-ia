// Euforia Studio (app de computador): tela de projetos e render com a força do PC.
// Só aparece quando o editor roda dentro do app (window.estudio vem do preload do Electron).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import logo from './logo-claro.svg';
import type { Projeto } from './projeto';

export type ItemProjeto = {
  pasta: string; arquivo: string; id: string; tipo?: 'short' | 'longo' | 'bruto'; cliente: string; titulo: string; composicao: string;
  duracao: number; confianca: number | null; url: string; capa: string | null; inicioCapa: number;
  criadoEm: number; render: string | null; renderEm: number | null; revisao?: string | null;
};
export type InfoPC = { versao: string; nucleos: number; cpu: string; memoria: number; raiz: string; raizExiste: boolean; pc: string };
export type Progresso = {
  fase: 'motor' | 'preparando' | 'renderizando' | 'pronto' | 'erro'; progresso: number; frames?: number; total?: number;
  restante?: number; nucleos?: number; saida?: string; segundos?: number; msg?: string;
};
export type Pacote = { projeto: string; modo: string; composicao: string; [k: string]: unknown };
type API = {
  info(): Promise<InfoPC>; listar(): Promise<ItemProjeto[]>; escolherPasta(): Promise<string | null>;
  renderizar(p: { pasta: string; pacote: Pacote }): Promise<{ saida: string; segundos: number }>;
  cancelar(): Promise<boolean>; mostrar(a: string): Promise<boolean>; abrir(a: string): Promise<string>;
  aoProgresso(cb: (p: Progresso) => void): () => void;
  atualizacao?(): Promise<Atualizacao | null>; atualizar?(instalador: string): Promise<boolean>;
  novidades?(): Promise<{ versao: string; itens: string[] } | null>; aoBaixar?(cb: (p: number) => void): () => void;
  novoBruto?(teste?: string): Promise<ItemProjeto | null>; aoBruto?(cb: (x: { nome: string; progresso: number }) => void): () => void;
};
export type Atualizacao = { versao: string; novidades: string[]; instalador: string };
declare global { interface Window { estudio?: API } }

const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const quando = (ms: number) => {
  const d = (Date.now() - ms) / 1000;
  if (d < 90) return 'agora';
  if (d < 3600) return `há ${Math.round(d / 60)} min`;
  if (d < 86400) return `há ${Math.round(d / 3600)} h`;
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/* ------------------------------------------------------------------ app */
export function Estudio({ Editor, usar }: {
  Editor: React.FC<{ proj: Projeto; aoVoltar: () => void; aoRenderizar: (p: Pacote) => void }>;
  usar: (p: Projeto, url: string) => void;
}) {
  const api = window.estudio!;
  const [info, setInfo] = useState<InfoPC | null>(null);
  const [itens, setItens] = useState<ItemProjeto[] | null>(null);
  const [aberto, setAberto] = useState<{ item: ItemProjeto; proj: Projeto } | null>(null);
  const [render, setRender] = useState<{ item: ItemProjeto; pacote: Pacote; p: Progresso } | null>(null);
  const [nova, setNova] = useState<Atualizacao | null>(null);
  const [baixando, setBaixando] = useState<number | null>(null);
  const [novidades, setNovidades] = useState<{ versao: string; itens: string[] } | null>(null);
  const [bruto, setBruto] = useState<{ nome: string; progresso: number; erro?: string } | null>(null);
  useEffect(() => api.aoBruto?.((x) => setBruto((b) => (b?.erro ? b : x))), [api]);

  // versão nova no Drive: confere ao abrir e a cada 30 min
  useEffect(() => {
    if (!api.atualizacao) return;
    const ver = () => api.atualizacao!().then(setNova).catch(() => {});
    ver();
    const id = setInterval(ver, 30 * 60 * 1000);
    api.novidades?.().then((n) => n?.itens.length && setNovidades(n)).catch(() => {});
    const tira = api.aoBaixar?.((p) => setBaixando(p));
    return () => { clearInterval(id); tira?.(); };
  }, [api]);
  const atualizar = async () => {
    if (!nova || !api.atualizar) return;
    setBaixando(0);
    try { await api.atualizar(nova.instalador); } catch { setBaixando(null); }
  };

  const carregar = useCallback(async () => {
    setInfo(await api.info());
    setItens(await api.listar());
  }, [api]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => api.aoProgresso((p) => setRender((r) => (r ? { ...r, p } : r))), [api]);

  const abrir = async (item: ItemProjeto) => {
    const url = new URL(item.url, window.location.href).href;
    const proj = (await fetch(url).then((r) => r.json())) as Projeto;
    usar(proj, url);
    setAberto({ item, proj });
  };

  const novoBruto = async () => {
    if (!api.novoBruto) return;
    try {
      const item = await api.novoBruto((window as unknown as { __brutoTeste?: string }).__brutoTeste);
      setBruto(null);
      if (item) { await carregar(); await abrir(item); }
    } catch (e) {
      const msg = String((e as Error).message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setBruto((b) => ({ nome: b?.nome ?? '', progresso: 0, erro: msg }));
    }
  };

  const renderizar = async (item: ItemProjeto, pacote: Pacote) => {
    setRender({ item, pacote, p: { fase: 'preparando', progresso: 0 } });
    try {
      await api.renderizar({ pasta: item.pasta, pacote });
    } catch (e) {
      const msg = String((e as Error).message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setRender((r) => (r ? { ...r, p: { ...r.p, fase: 'erro', msg } } : r));
    }
    carregar();
  };

  return (
    <>
      {aberto
        ? <Editor key={aberto.item.url} proj={aberto.proj} aoVoltar={() => { setAberto(null); carregar(); }} aoRenderizar={(p) => renderizar(aberto.item, p)} />
        : <Inicio info={info} itens={itens} abrir={abrir} recarregar={carregar}
            trocarPasta={async () => { if (await api.escolherPasta()) carregar(); }}
            assistir={(a) => api.abrir(a)} nova={nova} baixando={baixando} atualizar={atualizar}
            novoBruto={api.novoBruto ? novoBruto : undefined} />}
      {bruto && (
        <div className="modal">
          <div>
            <h2>{bruto.erro ? 'Não deu para abrir esse bruto' : 'Preparando o bruto'}</h2>
            <p style={{ color: 'var(--fraco)', margin: '0 0 14px', wordBreak: 'break-all' }}>{bruto.erro ?? bruto.nome}</p>
            {!bruto.erro && <>
              <div className="st-barra"><i style={{ width: `${Math.round(bruto.progresso * 100)}%` }} /></div>
              <p className="dica">Fazendo a prévia leve e lendo o áudio para desenhar a onda. Um bruto de 1 h leva uns minutos; o original não é copiado.</p>
            </>}
            <button className="bt" onClick={() => { if (!bruto.erro) api.cancelar(); setBruto(null); }}>{bruto.erro ? 'Fechar' : 'Cancelar'}</button>
          </div>
        </div>
      )}
      {novidades && (
        <div className="modal" onClick={() => setNovidades(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h2>Novidades da versão {novidades.versao}</h2>
            <ul className="st-novas">{novidades.itens.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <button className="bt pri" onClick={() => setNovidades(null)}>Bora</button>
          </div>
        </div>
      )}
      {render && (
        <TelaRender r={render} info={info} api={api}
          fechar={() => setRender(null)}
          voltar={() => { setRender(null); setAberto(null); carregar(); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ início: projetos */
function Inicio({ info, itens, abrir, recarregar, trocarPasta, assistir, nova, baixando, atualizar, novoBruto }: {
  info: InfoPC | null; itens: ItemProjeto[] | null; abrir: (i: ItemProjeto) => void; recarregar: () => void;
  trocarPasta: () => void; assistir: (a: string) => void;
  nova: Atualizacao | null; baixando: number | null; atualizar: () => void; novoBruto?: () => void;
}) {
  const [filtro, setFiltro] = useState<'todos' | 'obrigatorios' | 'revisar' | 'prontos'>('todos');
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => (itens ?? [])
    .filter((i) => (filtro === 'todos' ? true : filtro === 'obrigatorios' ? !!i.revisao && !i.render : filtro === 'revisar' ? !i.render : !!i.render))
    .filter((i) => !busca || `${i.cliente} ${i.titulo}`.toLowerCase().includes(busca.toLowerCase())), [itens, filtro, busca]);
  const nRevisar = (itens ?? []).filter((i) => !i.render).length;
  const nProntos = (itens ?? []).length - nRevisar;

  return (
    <div className="st">
      <aside className="st-lado">
        <img src={logo} alt="Grupo Euforia" className="st-logo" />
        <div className="st-app">Studio</div>
        <nav className="st-nav">
          <button className="ativo">▸ Projetos</button>
        </nav>
        {nova && (
          <div className="st-nova">
            <div className="st-pc-rot">Versão nova</div>
            <strong>Studio {nova.versao}</strong>
            <ul>{nova.novidades.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
            <button className="bt pri" onClick={atualizar} disabled={baixando !== null}>
              {baixando === null ? 'Atualizar agora' : baixando < 1 ? `Baixando ${Math.round(baixando * 100)}%` : 'Abrindo o instalador…'}
            </button>
          </div>
        )}
        <div className="st-pc">
          <div className="st-pc-rot">Este computador</div>
          <strong>{info?.pc ?? '…'}</strong>
          <div className="st-nucleos" aria-label={`${info?.nucleos ?? 0} núcleos`}>
            {Array.from({ length: Math.min(32, info?.nucleos ?? 0) }).map((_, i) => <i key={i} />)}
          </div>
          <span>{info ? `${info.nucleos} núcleos · ${info.memoria} GB` : ''}</span>
          <small title={info?.cpu}>{info?.cpu}</small>
        </div>
        <div className="st-versao">v{info?.versao}</div>
      </aside>

      <main className="st-main">
        <header className="st-topo">
          <div>
            <h1>Projetos da máquina</h1>
            <p>{nRevisar} para revisar · {nProntos} renderizados</p>
          </div>
          <div className="st-acoes">
            <input className="st-busca" placeholder="Buscar cliente ou título" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <button className="bt" onClick={recarregar}>↻ Atualizar</button>
            {novoBruto && <button className="bt pri" onClick={novoBruto} title="Escolha um vídeo do PC para cortar à mão">＋ Novo projeto com bruto</button>}
          </div>
        </header>

        <div className="st-filtros">
          {([['todos', 'Todos'], ['obrigatorios', '🔎 Revisão obrigatória'], ['revisar', 'Para revisar'], ['prontos', 'Renderizados']] as const).map(([k, n]) => (
            <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{n}</button>
          ))}
          <span className="st-pasta" title={info?.raiz}>📁 {info?.raiz}</span>
          <button className="bt mini" onClick={trocarPasta}>Trocar pasta</button>
        </div>

        {itens === null ? <p className="vazio">Lendo a pasta…</p>
          : !lista.length ? (
            <div className="st-vazio">
              <h2>{itens.length ? 'Nada neste filtro' : 'Nenhum projeto nesta pasta ainda'}</h2>
              <p>{itens.length ? 'Troque o filtro ou a busca.' : 'Quando a máquina terminar um short ou um longo, o projeto aparece aqui sozinho (a pasta é a do Drive). Também dá para escolher outra pasta.'}</p>
              {!itens.length && <button className="bt pri" onClick={trocarPasta}>Escolher pasta</button>}
            </div>
          ) : (
            <div className="st-grade">
              {lista.map((i) => <Cartao key={i.url} i={i} abrir={() => abrir(i)} assistir={() => i.render && assistir(i.render)} />)}
            </div>
          )}
      </main>
    </div>
  );
}

function Cartao({ i, abrir, assistir }: { i: ItemProjeto; abrir: () => void; assistir: () => void }) {
  const conf = i.confianca;
  return (
    <article className={`st-card ${i.tipo === 'longo' || i.tipo === 'bruto' ? 'longo' : ''}`}>
      <button className="st-capa" onClick={abrir} aria-label={`Abrir ${i.titulo}`}>
        {i.capa && (
          <video src={`${i.capa}#t=${i.inicioCapa + 1}`} muted preload="metadata"
            onMouseEnter={(e) => { e.currentTarget.currentTime = i.inicioCapa + 1; e.currentTarget.play().catch(() => {}); }}
            onMouseLeave={(e) => e.currentTarget.pause()} />
        )}
        <span className="st-dur">{dur(i.duracao)}</span>
        <span className="st-tipo">{i.tipo === 'bruto' ? 'BRUTO' : i.tipo === 'longo' ? 'LONGO' : 'SHORT'}</span>
        <span className={`st-status ${i.render ? 'ok' : ''}`}>{i.render ? '✓ Renderizado' : i.revisao ? '🔎 Revisão obrigatória' : '● Para revisar'}</span>
      </button>
      <div className="st-card-txt">
        <small>{i.cliente}</small>
        <h3>{i.titulo}</h3>
        {i.revisao && !i.render && <div className="st-motivo" title="A Lorena revisa antes de postar">Lorena · {i.revisao}</div>}
        {conf != null && (
          <div className="st-conf" title="Confiança da máquina neste corte">
            <div><i style={{ width: `${Math.round(conf * 100)}%`, background: conf < 0.6 ? 'var(--brasa)' : 'var(--laranja)' }} /></div>
            <span>{Math.round(conf * 100)}%</span>
          </div>
        )}
        <div className="st-card-pe">
          <span>{i.render && i.renderEm ? `render ${quando(i.renderEm)}` : `chegou ${quando(i.criadoEm)}`}</span>
          <div>
            {i.render && <button className="bt mini" onClick={assistir}>▶ Ver</button>}
            <button className="bt mini pri" onClick={abrir}>{i.render ? 'Reabrir' : 'Abrir'}</button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ render no PC */
function TelaRender({ r, info, api, fechar, voltar }: {
  r: { item: ItemProjeto; pacote: Pacote; p: Progresso }; info: InfoPC | null; api: API; fechar: () => void; voltar: () => void;
}) {
  const { p } = r;
  const pct = Math.round((p.progresso || 0) * 100);
  const R = 120, C = 2 * Math.PI * R;
  const titulo = { motor: 'Preparando o motor de render', preparando: 'Abrindo o projeto', renderizando: 'Renderizando', pronto: 'Pronto', erro: 'Não deu certo' }[p.fase];
  const sub = {
    motor: 'Só na primeira vez: baixando o navegador que desenha os quadros.',
    preparando: 'Lendo o vídeo e os grafismos.',
    renderizando: `Usando ${p.nucleos ?? '?'} de ${info?.nucleos ?? '?'} núcleos deste PC${p.frames != null && p.total ? ` · quadro ${p.frames} de ${p.total}` : ''}`,
    pronto: `Feito em ${p.segundos ?? 0} s com ${p.nucleos ?? '?'} núcleos deste PC. Salvo na pasta do projeto${r.pacote.modo === 'ajustado' ? ', junto com os ajustes' : ''}.`,
    erro: p.msg ?? 'Erro desconhecido.',
  }[p.fase];
  const falta = p.fase === 'renderizando' && p.restante ? Math.max(1, Math.round(p.restante / 1000)) : null;

  return (
    <div className="st-render">
      <div className="st-render-box">
        <small className="st-render-cli">{r.item.cliente} · {r.pacote.modo === 'ajustado' ? 'versão ajustada' : 'como a máquina fez'}</small>
        <h2>{r.item.titulo}</h2>
        <svg viewBox="0 0 280 280" className={`st-anel ${p.fase}`}>
          <circle cx="140" cy="140" r={R} className="fundo" />
          <circle cx="140" cy="140" r={R} className="frente" strokeDasharray={C}
            strokeDashoffset={p.fase === 'pronto' ? 0 : C * (1 - (p.progresso || 0))} />
          <text x="140" y="150" textAnchor="middle" className="pct">{p.fase === 'pronto' ? '✓' : p.fase === 'erro' ? '!' : `${pct}%`}</text>
          {falta && <text x="140" y="185" textAnchor="middle" className="falta">faltam ~{falta} s</text>}
        </svg>
        <h3>{titulo}</h3>
        <p>{sub}</p>
        <div className="linha" style={{ justifyContent: 'center' }}>
          {p.fase === 'pronto' && p.saida && <>
            <button className="bt pri" onClick={() => api.abrir(p.saida!)}>▶ Assistir</button>
            <button className="bt" onClick={() => api.mostrar(p.saida!)}>Mostrar na pasta</button>
            <button className="bt" onClick={voltar}>Voltar aos projetos</button>
          </>}
          {p.fase === 'erro' && <button className="bt" onClick={fechar}>Fechar</button>}
          {p.fase !== 'pronto' && p.fase !== 'erro' && <button className="bt" onClick={() => api.cancelar()}>Cancelar</button>}
        </div>
      </div>
    </div>
  );
}
