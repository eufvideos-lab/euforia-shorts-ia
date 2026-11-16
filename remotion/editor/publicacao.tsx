// Aba "Título e descrição" do Euforia Studio (16/11/2026): o pacote de publicação que a máquina escreveu a partir da
// transcrição (pipeline/publicacao.py). A pessoa escolhe o título, ajusta o texto e copia para o YouTube.
// O que ela muda fica salvo neste PC (por projeto); o arquivo "título e descrição.txt" da pasta continua igual.
import React, { useState } from 'react';

export type Publicacao = {
  titulos?: string[]; descricao_final?: string; tags?: string[]; hashtags?: string[]; palavras_chave?: string[];
  comentario_fixado?: string; texto_thumb?: string; capitulos_texto?: string[];
};

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="bt mini" onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}>
      {ok ? 'Copiado ✓' : 'Copiar'}
    </button>
  );
}

export function PainelPublicacao({ id, pub }: { id: string; pub?: Publicacao }) {
  const chave = `pub-${id}`;
  const salvo = (() => { try { return JSON.parse(ler(chave) || 'null'); } catch { return null; } })();
  const [titulo, setTitulo] = useState<string>(salvo?.titulo ?? pub?.titulos?.[0] ?? '');
  const [desc, setDesc] = useState<string>(salvo?.desc ?? pub?.descricao_final ?? '');
  const [tags, setTags] = useState<string>(salvo?.tags ?? (pub?.tags ?? []).join(', '));
  const [aberto, setAberto] = useState(true);
  if (!pub?.titulos?.length) return null;
  const salvar = (t = titulo, d = desc, g = tags) => gravar(chave, JSON.stringify({ titulo: t, desc: d, tags: g }));
  const lim = (n: number, max: number) => <span style={{ color: n > max ? '#ff9a6b' : 'var(--ok)', fontWeight: 400 }}>{n}/{max}</span>;

  return (
    <div className="sec">
      <h3 style={{ cursor: 'pointer' }} onClick={() => setAberto(!aberto)}>Título e descrição {aberto ? '▾' : '▸'}</h3>
      {aberto && (
        <>
          <div className="campo">
            <label>Título {lim(titulo.length, 100)}</label>
            <textarea rows={2} value={titulo} onChange={(e) => { setTitulo(e.target.value); salvar(e.target.value); }} />
            <div className="linha"><Copiar texto={titulo} /></div>
          </div>
          {pub.titulos.length > 1 && (
            <div className="campo">
              <label>Outras opções (clique para usar)</label>
              {pub.titulos.map((t) => (
                <button key={t} className={`bt mini ${t === titulo ? 'pri' : ''}`} style={{ display: 'block', width: '100%', textAlign: 'left', whiteSpace: 'normal', marginBottom: 4 }}
                  onClick={() => { setTitulo(t); salvar(t); }}>{t}</button>
              ))}
            </div>
          )}
          <div className="campo">
            <label>Descrição {lim(desc.length, 5000)}</label>
            <textarea rows={9} value={desc} onChange={(e) => { setDesc(e.target.value); salvar(titulo, e.target.value); }} />
            <div className="linha"><Copiar texto={desc} /></div>
          </div>
          <div className="campo">
            <label>Tags {lim(tags.length, 500)}</label>
            <textarea rows={3} value={tags} onChange={(e) => { setTags(e.target.value); salvar(titulo, desc, e.target.value); }} />
            <div className="linha"><Copiar texto={tags} /></div>
          </div>
          {!!pub.palavras_chave?.length && <p className="dica"><b>Palavras-chave:</b> {pub.palavras_chave.join(', ')}</p>}
          {pub.comentario_fixado && <p className="dica"><b>Comentário para fixar:</b> {pub.comentario_fixado} <Copiar texto={pub.comentario_fixado} /></p>}
          {pub.texto_thumb && <p className="dica"><b>Texto da thumb:</b> {pub.texto_thumb}</p>}
          <button className="bt mini" onClick={() => {
            setTitulo(pub.titulos![0]); setDesc(pub.descricao_final ?? ''); setTags((pub.tags ?? []).join(', '));
            try { localStorage.removeItem(chave); } catch { /* nada */ }
          }}>Voltar ao que a máquina sugeriu</button>
          <p className="dica">Sugestão da máquina, feita da transcrição. Confira antes de publicar.</p>
        </>
      )}
    </div>
  );
}
