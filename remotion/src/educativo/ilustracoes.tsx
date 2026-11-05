// Ilustrações chapadas do modelo Educativo (cores da marca Euforia). Todas em viewBox 800x450.
import React from 'react';

export const C = {
  preto: '#050505',
  claro: '#F2EFEA',
  laranja: '#FF6518',
  brasa: '#C2410C',
  pele: '#D9A27E',
  pele2: '#C98E69',
  parede: '#E3DCD2',
  parede2: '#D6CDC1',
  cinza: '#8A847C',
};

type PessoaP = { x: number; y: number; s?: number; olhar?: 'baixo' | 'frente'; silhueta?: boolean; rot?: number };

/* Pessoa do peito para cima. (x, y) = centro do rosto. */
export const Pessoa: React.FC<PessoaP> = ({ x, y, s = 1, olhar = 'frente', silhueta, rot = 0 }) => {
  const pele = silhueta ? '#141414' : C.pele;
  const roupa = silhueta ? '#0b0b0b' : C.preto;
  const cabelo = silhueta ? '#0b0b0b' : '#2A1A12';
  const py = olhar === 'baixo' ? 7 : 0;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {/* ombros */}
      <path d="M-170 260 C-165 170 -110 130 -40 120 L40 120 C110 130 165 170 170 260 Z" fill={roupa} />
      <path d="M-26 120 L0 158 L26 120 Z" fill={silhueta ? '#141414' : C.claro} />
      {/* pescoço */}
      <rect x={-24} y={60} width={48} height={66} rx={18} fill={silhueta ? pele : C.pele2} />
      {/* cabeça */}
      <ellipse cx={0} cy={0} rx={70} ry={84} fill={pele} />
      <path d="M-74 -6 C-80 -70 -40 -100 0 -100 C46 -100 82 -72 74 -6 C64 -40 30 -58 -6 -56 C-40 -54 -62 -36 -74 -6 Z" fill={cabelo} />
      {!silhueta && (
        <>
          {/* olhos */}
          {[-26, 26].map((ex) => (
            <g key={ex}>
              <ellipse cx={ex} cy={6} rx={13} ry={9} fill="#FFFFFF" />
              <circle cx={ex} cy={6 + py * 0.6} r={6} fill={C.preto} />
              {olhar === 'baixo' && <path d={`M${ex - 14} 6 Q${ex} -6 ${ex + 14} 6 L${ex + 14} -4 L${ex - 14} -4 Z`} fill={C.pele} />}
              {olhar === 'baixo' && <path d={`M${ex - 14} 5 Q${ex} 1 ${ex + 14} 5`} stroke={C.pele2} strokeWidth={3} fill="none" />}
            </g>
          ))}
          <path d="M-40 -16 L-14 -18 M14 -18 L40 -16" stroke="#2A1A12" strokeWidth={5} strokeLinecap="round" />
          <path d="M0 14 L-6 34 L6 34" stroke={C.pele2} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d={olhar === 'baixo' ? 'M-16 52 L16 52' : 'M-18 48 Q0 60 18 48'} stroke="#8E4A35" strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      )}
    </g>
  );
};

/* Moldura de câmera (o que a câmera vê) */
export const Quadro: React.FC<{ x: number; y: number; w: number; h: number; fundo?: string; rec?: boolean; children?: React.ReactNode; id: string }> = ({ x, y, w, h, fundo = C.parede, rec = true, children, id }) => (
  <g>
    <clipPath id={id}>
      <rect x={x} y={y} width={w} height={h} rx={18} />
    </clipPath>
    <g clipPath={`url(#${id})`}>
      <rect x={x} y={y} width={w} height={h} fill={fundo} />
      {children}
    </g>
    <rect x={x} y={y} width={w} height={h} rx={18} fill="none" stroke={C.preto} strokeWidth={6} />
    {rec && (
      <g>
        <circle cx={x + 30} cy={y + 30} r={9} fill={C.brasa} />
        <text x={x + 46} y={y + 38} fontFamily="Inter" fontWeight={700} fontSize={22} fill={C.preto}>REC</text>
      </g>
    )}
  </g>
);

const Cantos: React.FC<{ cx: number; cy: number; r: number }> = ({ cx, cy, r }) => (
  <g stroke={C.laranja} strokeWidth={6} fill="none" strokeLinecap="round">
    <path d={`M${cx - r} ${cy - r + 30} V${cy - r} H${cx - r + 30}`} />
    <path d={`M${cx + r - 30} ${cy - r} H${cx + r} V${cy - r + 30}`} />
    <path d={`M${cx - r} ${cy + r - 30} V${cy + r} H${cx - r + 30}`} />
    <path d={`M${cx + r - 30} ${cy + r} H${cx + r} V${cy + r - 30}`} />
  </g>
);

const Fundo: React.FC = () => (
  <g>
    <rect x={0} y={330} width={800} height={120} fill={C.parede2} />
    <rect x={560} y={70} width={130} height={170} rx={6} fill={C.claro} stroke={C.parede2} strokeWidth={6} />
    <rect x={585} y={95} width={80} height={60} fill={C.laranja} opacity={0.5} />
  </g>
);

export const OlharBaixo: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <Quadro id="ob" x={10} y={10} w={780} h={430}>
      <Fundo />
      <Pessoa x={400} y={190} s={1.05} olhar="baixo" />
      {/* papel / tablet embaixo */}
      <g transform="translate(470 360) rotate(-8)">
        <rect x={0} y={0} width={200} height={130} rx={10} fill={C.claro} stroke={C.preto} strokeWidth={5} />
        {[22, 44, 66, 88].map((yy) => <rect key={yy} x={20} y={yy} width={150 - (yy % 3) * 20} height={8} rx={4} fill={C.cinza} />)}
      </g>
    </Quadro>
  </svg>
);

export const OlharLente: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <Quadro id="ol" x={10} y={10} w={780} h={430}>
      <Fundo />
      <Pessoa x={400} y={190} s={1.05} olhar="frente" />
      <Cantos cx={400} cy={200} r={120} />
    </Quadro>
  </svg>
);

const Camera: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={0} y={-50} width={170} height={100} rx={16} fill={C.preto} />
    <rect x={-40} y={-30} width={44} height={60} rx={8} fill={C.preto} />
    <circle cx={-40} cy={0} r={22} fill="#333" stroke={C.laranja} strokeWidth={5} />
    <rect x={120} y={-66} width={36} height={18} rx={4} fill={C.preto} />
    <path d="M85 50 L60 160 M85 50 L110 160 M85 50 L85 160" stroke={C.preto} strokeWidth={6} />
  </g>
);

const Olho: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-34 0 Q0 -28 34 0 Q0 28 -34 0 Z" fill="#FFFFFF" stroke={C.preto} strokeWidth={5} />
    <circle cx={6} cy={0} r={11} fill={C.preto} />
  </g>
);

const Marca: React.FC<{ x: number; y: number; ok: boolean }> = ({ x, y, ok }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={30} fill={ok ? C.laranja : C.brasa} />
    {ok ? <path d="M-13 1 L-4 11 L14 -10" stroke={C.claro} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      : <path d="M-11 -11 L11 11 M11 -11 L-11 11" stroke={C.claro} strokeWidth={7} strokeLinecap="round" />}
  </g>
);

const Texto: React.FC<{ x: number; y: number; w?: number }> = ({ x, y, w = 120 }) => (
  <g>
    <rect x={x} y={y} width={w} height={74} rx={8} fill={C.claro} stroke={C.preto} strokeWidth={5} />
    {[16, 34, 52].map((yy) => <rect key={yy} x={x + 14} y={y + yy} width={w - 28 - (yy % 4) * 8} height={7} rx={3} fill={C.cinza} />)}
  </g>
);

export const Prompter: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <rect x={10} y={10} width={385} height={430} rx={18} fill={C.parede} />
    <rect x={405} y={10} width={385} height={430} rx={18} fill={C.parede} />
    {/* errado: texto abaixo da lente */}
    <Olho x={60} y={150} />
    <Camera x={210} y={150} />
    <Texto x={120} y={300} w={110} />
    <path d="M90 158 L150 300" stroke={C.brasa} strokeWidth={5} strokeDasharray="12 10" />
    <Marca x={350} y={60} ok={false} />
    {/* certo: texto colado na lente */}
    <Olho x={455} y={150} />
    <Camera x={640} y={150} />
    <g>
      <path d="M560 70 L612 230" stroke={C.laranja} strokeWidth={6} />
      <rect x={512} y={110} width={64} height={80} rx={6} fill={C.claro} stroke={C.preto} strokeWidth={4} opacity={0.95} />
      {[128, 146, 164].map((yy) => <rect key={yy} x={522} y={yy} width={42} height={6} rx={3} fill={C.cinza} />)}
    </g>
    <path d="M490 150 L505 150" stroke={C.laranja} strokeWidth={5} strokeDasharray="12 10" />
    <Marca x={745} y={60} ok />
    <text x={202} y={420} textAnchor="middle" fontFamily="Inter" fontWeight={700} fontSize={26} fill={C.preto}>texto abaixo da lente</text>
    <text x={597} y={420} textAnchor="middle" fontFamily="Inter" fontWeight={700} fontSize={26} fill={C.preto}>texto na frente da lente</text>
  </svg>
);

export const EnquadraErrado: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <rect x={0} y={0} width={800} height={450} fill="transparent" />
    <Quadro id="ee" x={290} y={10} w={230} h={430} fundo={C.parede}>
      <rect x={290} y={10} width={230} height={90} fill="#F7F3EC" />
      <circle cx={405} cy={40} r={22} fill={C.laranja} opacity={0.6} />
      <Pessoa x={420} y={120} s={1.25} rot={-7} />
    </Quadro>
  </svg>
);

export const EnquadraCerto: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <Quadro id="ec" x={10} y={10} w={780} h={430}>
      <Fundo />
      <Pessoa x={400} y={190} s={1.05} />
      {[270, 530].map((xx) => <line key={xx} x1={xx} y1={10} x2={xx} y2={440} stroke={C.laranja} strokeWidth={2} opacity={0.5} />)}
      {[153, 296].map((yy) => <line key={yy} x1={10} y1={yy} x2={790} y2={yy} stroke={C.laranja} strokeWidth={2} opacity={0.5} />)}
      <path d="M20 196 H130" stroke={C.laranja} strokeWidth={5} strokeDasharray="10 8" />
      <path d="M670 196 H780" stroke={C.laranja} strokeWidth={5} strokeDasharray="10 8" />
      <text x={725} y={182} textAnchor="middle" fontFamily="Inter" fontWeight={700} fontSize={20} fill={C.brasa}>olhos</text>
    </Quadro>
  </svg>
);

export const LuzFrente: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <Quadro id="lf" x={10} y={10} w={780} h={430} fundo={C.parede}>
      <rect x={0} y={330} width={800} height={120} fill={C.parede2} />
      <Pessoa x={400} y={190} s={1.05} />
      {/* luz vindo da frente */}
      <g opacity={0.9}>
        <circle cx={110} cy={110} r={34} fill={C.laranja} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={110 + Math.cos((a * Math.PI) / 180) * 46} y1={110 + Math.sin((a * Math.PI) / 180) * 46} x2={110 + Math.cos((a * Math.PI) / 180) * 64} y2={110 + Math.sin((a * Math.PI) / 180) * 64} stroke={C.laranja} strokeWidth={6} strokeLinecap="round" />
        ))}
      </g>
    </Quadro>
  </svg>
);

export const LuzCostas: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <Quadro id="lc" x={10} y={10} w={780} h={430} fundo="#9C958B">
      <rect x={170} y={30} width={460} height={330} fill="#FFFDF8" />
      <rect x={170} y={30} width={460} height={330} fill="none" stroke="#D9D2C6" strokeWidth={14} />
      <line x1={400} y1={30} x2={400} y2={360} stroke="#D9D2C6" strokeWidth={12} />
      <line x1={170} y1={195} x2={630} y2={195} stroke="#D9D2C6" strokeWidth={12} />
      <Pessoa x={400} y={190} s={1.05} silhueta />
    </Quadro>
  </svg>
);

export const Audio: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <rect x={10} y={10} width={780} height={430} rx={18} fill={C.parede} />
    {/* lapela */}
    <g transform="translate(150 170)">
      <circle r={78} fill={C.claro} />
      <rect x={-16} y={-40} width={32} height={56} rx={16} fill={C.preto} />
      <rect x={-6} y={16} width={12} height={22} fill={C.preto} />
      <path d="M0 38 C0 70 40 70 50 90" stroke={C.preto} strokeWidth={5} fill="none" />
      <rect x={-24} y={-6} width={48} height={10} rx={3} fill={C.laranja} />
    </g>
    {/* sala sem eco */}
    <g transform="translate(400 170)">
      <circle r={78} fill={C.claro} />
      <path d="M-44 10 L0 -32 L44 10 V44 H-44 Z" fill={C.preto} />
      <rect x={-10} y={18} width={20} height={26} fill={C.claro} />
      <path d="M52 -30 Q66 -16 52 -2 M62 -40 Q84 -16 62 8" stroke={C.brasa} strokeWidth={5} fill="none" strokeLinecap="round" />
      <line x1={46} y1={-46} x2={82} y2={14} stroke={C.preto} strokeWidth={6} strokeLinecap="round" />
    </g>
    {/* celular silencioso */}
    <g transform="translate(650 170)">
      <circle r={78} fill={C.claro} />
      <rect x={-26} y={-46} width={52} height={92} rx={10} fill={C.preto} />
      <path d="M-12 -10 Q-12 -24 0 -24 Q12 -24 12 -10 V4 L18 10 H-18 L-12 4 Z" fill={C.claro} />
      <line x1={-20} y1={16} x2={20} y2={-30} stroke={C.laranja} strokeWidth={6} strokeLinecap="round" />
    </g>
    {/* onda limpa */}
    <path d={Array.from({ length: 60 }, (_, i) => {
      const x = 80 + i * 10.7;
      const a = Math.sin(i * 0.55) * (18 + 26 * Math.abs(Math.sin(i * 0.17)));
      return `M${x} ${360 - a} L${x} ${360 + a}`;
    }).join(' ')} stroke={C.laranja} strokeWidth={6} strokeLinecap="round" />
  </svg>
);

const Arq: React.FC<{ x: number; y: number; s?: number; rotulo?: string }> = ({ x, y, s = 1, rotulo }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0 H70 L100 30 V130 H0 Z" fill={C.claro} stroke={C.preto} strokeWidth={5} />
    <path d="M70 0 V30 H100" fill="none" stroke={C.preto} strokeWidth={5} />
    <path d="M32 58 L32 98 L66 78 Z" fill={C.laranja} />
    {rotulo && <text x={50} y={160} textAnchor="middle" fontFamily="Archivo" fontWeight={900} fontSize={28} fill={C.preto}>{rotulo}</text>}
  </g>
);

export const Arquivo: React.FC = () => (
  <svg viewBox="0 0 800 450" width="100%" height="100%">
    <rect x={10} y={10} width={780} height={430} rx={18} fill={C.parede} />
    {/* certo: arquivo inteiro na pasta */}
    <Arq x={90} y={30} rotulo="1080p" />
    <path d="M230 95 H330" stroke={C.preto} strokeWidth={6} />
    <path d="M318 80 L340 95 L318 110" stroke={C.preto} strokeWidth={6} fill="none" strokeLinejoin="round" />
    <g transform="translate(370 40)">
      <path d="M0 20 H60 L76 36 H170 V130 H0 Z" fill={C.laranja} />
      <text x={85} y={98} textAnchor="middle" fontFamily="Inter" fontWeight={700} fontSize={22} fill={C.claro}>Drive · Portal</text>
    </g>
    <Marca x={640} y={95} ok />
    {/* errado: WhatsApp encolhe */}
    <g transform="translate(90 260)">
      <path d="M0 0 H220 Q240 0 240 20 V100 Q240 120 220 120 H40 L10 146 L18 120 Q0 120 0 100 Z" fill="#25D366" />
      <text x={120} y={70} textAnchor="middle" fontFamily="Inter" fontWeight={700} fontSize={26} fill="#FFFFFF">WhatsApp</text>
    </g>
    <path d="M360 325 H440" stroke={C.preto} strokeWidth={6} />
    <path d="M428 310 L450 325 L428 340" stroke={C.preto} strokeWidth={6} fill="none" strokeLinejoin="round" />
    <Arq x={480} y={292} s={0.45} />
    <text x={503} y={385} textAnchor="middle" fontFamily="Inter" fontWeight={700} fontSize={20} fill={C.brasa}>comprimido</text>
    <Marca x={640} y={325} ok={false} />
  </svg>
);

export const ILUSTRACOES: Record<string, React.FC> = {
  'olhar-baixo': OlharBaixo,
  'olhar-lente': OlharLente,
  prompter: Prompter,
  'enquadra-errado': EnquadraErrado,
  'enquadra-certo': EnquadraCerto,
  'luz-frente': LuzFrente,
  'luz-costas': LuzCostas,
  audio: Audio,
  arquivo: Arquivo,
};
