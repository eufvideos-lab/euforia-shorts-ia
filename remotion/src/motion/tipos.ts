// Máquina de Motion: uma peça = marca do cliente + lista de cenas (cada uma de um tipo pronto).
// Tempos em segundos. Nas cenas, `em` é contado a partir do início da cena.

export type Marca = {
  primaria: string; // cor principal (ex.: verde NA #076358)
  secundaria: string; // cor de apoio (ex.: #2A978B)
  escura: string; // fundo escuro / texto forte
  fundo: string; // fundo claro (normalmente branco)
  texto: string; // cor do texto corrido
  fonteTitulo: string;
  fonteCorpo: string;
  fonteDestaque: string; // palavra em destaque (serifa itálica)
};

export type Palavra = { t: string; em: number; destaque?: boolean; quebra?: boolean };

// transicao: faixa diagonal nas cores da marca cobrindo o corte (padrão) ou nenhuma (cena continua a anterior)
type Base = { inicio: number; fim: number; transicao?: 'faixa' | 'nenhuma' };

export type Cena = Base &
  (
    | { tipo: 'pergunta'; palavras: Palavra[] }
    | { tipo: 'telas'; telas: string[]; titulo: Palavra[]; pilulas: { t: string; em: number }[] }
    | { tipo: 'ritmo'; linha1: Palavra[]; linha2: Palavra[]; tela: string; troca: number; episodios: number }
    | { tipo: 'parede'; cards: string[]; texto: Palavra[]; logo: string; logoEm: number }
    | { tipo: 'apresentador'; video: string; videoInicio: number; texto: Palavra[] }
    | { tipo: 'preco'; video: string; videoInicio: number; rotulo: string; moeda: string; valor: string; sufixo: string }
    | { tipo: 'logo'; logo: string; botao: string; botaoEm: number }
    | { tipo: 'institucional'; logo: string; titulo: string; linhas: string[]; pilares: { t: string; icone: 'coluna' | 'livro' | 'coracao' }[] }
  );

export type MotionProps = {
  fps: number;
  largura: number;
  altura: number;
  duracao: number;
  audio?: string | null; // arquivo em public/ (narração/trilha original)
  marca: Marca;
  cenas: Cena[];
};
