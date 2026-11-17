// Guarda no PC o que a pessoa mexeu em cada projeto, para não perder ao voltar aos projetos ou fechar o Studio (17/11/2026).
import { useEffect, useRef } from 'react';

const chave = (id: string) => `rascunho:${id}`;

export function lerRascunho<T>(id: string): T | null {
  try { const s = localStorage.getItem(chave(id)); return s ? (JSON.parse(s).p as T) : null; } catch { return null; }
}

function gravar(id: string, p: unknown) {
  try { localStorage.setItem(chave(id), JSON.stringify({ em: Date.now(), p })); } catch { /* sem espaço: segue sem rascunho */ }
}

function apagar(id: string) {
  try { localStorage.removeItem(chave(id)); } catch { /* nada */ }
}

/** Maior número usado nos ids novos (tn12, en3, brn7…), para continuar contando sem repetir depois de reabrir. */
export function maiorId(p: unknown): number {
  let m = 0;
  JSON.stringify(p).replace(/"[a-z]+n(\d+)"/g, (_, n) => { m = Math.max(m, Number(n)); return ''; });
  return m;
}

/** Grava o estado atual pouco depois de cada mudança e ao sair do editor. Igual ao original: apaga o rascunho. */
export function useRascunho<T>(id: string, atual: T, original: T) {
  const ult = useRef(atual);
  ult.current = atual;
  const salvar = () => (ult.current === original ? apagar(id) : gravar(id, ult.current));
  useEffect(() => {
    const k = setTimeout(salvar, 500);
    return () => clearTimeout(k);
  }, [atual]); // eslint-disable-line
  useEffect(() => {
    window.addEventListener('beforeunload', salvar);
    return () => { window.removeEventListener('beforeunload', salvar); salvar(); };
  }, []); // eslint-disable-line
}
