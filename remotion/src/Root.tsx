import React from 'react';
import { Composition } from 'remotion';
import { ShortViral } from './ShortViral';
import { ShortInstitucional } from './ShortInstitucional';
import type { ShortProps } from './types';
import { MotionCena } from './motion/MotionCena';
import type { MotionProps } from './motion/tipos';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

const exemplo: ShortProps = {
  fps: 30,
  duration: 5,
  video: 'fala.mp4',
  segments: [{ srcStart: 0, srcEnd: 5, outStart: 0 }],
  framing: [{ start: 0, end: 5, scale: 1, originY: 0.3 }],
  captions: [],
  brolls: [],
  logo: null,
  estilo: { corDestaque: '#FAC800', fonte: 'Montserrat' },
};

const meta = ({ props }: { props: Record<string, unknown> }) => {
  const p = props as unknown as ShortProps;
  return { fps: p.fps, durationInFrames: Math.ceil(p.duration * p.fps) };
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="ShortViral"
      component={ShortViral as unknown as React.FC<Record<string, unknown>>}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={150}
      defaultProps={exemplo as unknown as Record<string, unknown>}
      calculateMetadata={meta}
    />
    <Composition
      id="ShortInstitucional"
      component={ShortInstitucional as unknown as React.FC<Record<string, unknown>>}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={150}
      defaultProps={{ ...exemplo, estilo: { corDestaque: '#E8B931', fonte: 'Poppins' } } as unknown as Record<string, unknown>}
      calculateMetadata={meta}
    />
    <Composition
      id="MotionCena"
      component={MotionCena as unknown as React.FC<Record<string, unknown>>}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={150}
      defaultProps={{ fps: 30, largura: 1920, altura: 1080, duracao: 5, marca: {}, cenas: [] } as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as MotionProps;
        return { fps: p.fps, width: p.largura, height: p.altura, durationInFrames: Math.ceil(p.duracao * p.fps) };
      }}
    />
  </>
);
