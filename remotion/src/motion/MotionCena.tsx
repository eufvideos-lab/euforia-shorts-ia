// Composição da Máquina de Motion: monta as cenas do JSON em sequência, com o áudio e as transições
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { Cena, MotionProps } from './tipos';
import { Faixa } from './primitivas';
import { Apresentador, Institucional, Logo, Parede, Pergunta, Preco, Ritmo, Telas } from './cenas';
import { Ciclo, Lista } from './cenas-extra';

const SOBRA = 0.4; // a cena fica um pouco além do fim, por baixo da faixa da próxima

const render = (c: Cena, m: MotionProps['marca']) => {
  switch (c.tipo) {
    case 'pergunta': return <Pergunta c={c} m={m} />;
    case 'telas': return <Telas c={c} m={m} />;
    case 'ritmo': return <Ritmo c={c} m={m} />;
    case 'parede': return <Parede c={c} m={m} />;
    case 'apresentador': return <Apresentador c={c} m={m} />;
    case 'preco': return <Preco c={c} m={m} />;
    case 'logo': return <Logo c={c} m={m} />;
    case 'institucional': return <Institucional c={c} m={m} />;
    case 'lista': return <Lista c={c} m={m} />;
    case 'ciclo': return <Ciclo c={c} m={m} />;
  }
};

export const MotionCena: React.FC<MotionProps> = (p) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: p.marca.fundo }}>
      {p.cenas.map((c, i) => {
        const ultimo = i === p.cenas.length - 1;
        const de = Math.round(c.inicio * fps);
        const ate = Math.round((ultimo ? c.fim : c.fim + SOBRA) * fps);
        return (
          <Sequence key={i} from={de} durationInFrames={ate - de} name={`${i + 1} ${c.tipo}`}>
            {render(c, p.marca)}
          </Sequence>
        );
      })}
      {p.cenas.map((c, i) => (i > 0 && (c.transicao ?? 'faixa') === 'faixa' ? <Faixa key={`f${i}`} m={p.marca} em={c.inicio} /> : null))}
      {p.audio && <Audio src={staticFile(p.audio)} />}
    </AbsoluteFill>
  );
};
