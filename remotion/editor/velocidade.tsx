// Velocidade da prévia (1x a 4x), lembrada entre aberturas. Um estado só para o editor de short e o de longo.
import { useEffect, useState } from 'react';

export const VELOCIDADES = [1, 1.5, 2, 4];
const ouvintes = new Set<(v: number) => void>();
let atual = (() => { try { const v = Number(localStorage.getItem('velocidade')); return VELOCIDADES.includes(v) ? v : 1; } catch { return 1; } })();

export function useVelocidade(): [number, (v: number) => void] {
  const [v, setV] = useState(atual);
  useEffect(() => { ouvintes.add(setV); return () => { ouvintes.delete(setV); }; }, []);
  const mudar = (n: number) => { atual = n; try { localStorage.setItem('velocidade', String(n)); } catch { /* sem storage */ } ouvintes.forEach((f) => f(n)); };
  return [v, mudar];
}

/** Botões 1x · 1,5x · 2x · 4x na barra da linha do tempo. */
export function Velocidade() {
  const [v, mudar] = useVelocidade();
  return (
    <span className="vel" title="Velocidade da prévia (só para ver; o render sai normal)">
      {VELOCIDADES.map((x) => (
        <button key={x} className={'bt mini' + (x === v ? ' pri' : '')} onClick={(e) => { mudar(x); e.currentTarget.blur(); }}>{String(x).replace('.', ',')}x</button>
      ))}
    </span>
  );
}
