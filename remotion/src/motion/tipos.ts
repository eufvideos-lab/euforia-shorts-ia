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

// imagem: a palavra vira um logo (ex.: Netflix) que entra com brilho e faixas de luz
export type Palavra = { t: string; em: number; destaque?: boolean; quebra?: boolean; imagem?: string };

// Vídeo da pessoa: tamanho do arquivo e ponto do rosto (px no arquivo) que fica no centro do quadro
export type Enquadre = { videoTamanho: [number, number]; foco: [number, number] };

// Navegador: câmera, cursor e destaques em frações da tela (0 a 1); `em` em segundos desde o início da cena
export type Camera = { em: number; x: number; y: number; zoom: number };
export type Cursor = { em: number; x: number; y: number; clique?: boolean };
export type Destaque = { em: number; ate: number; x: number; y: number; w: number; h: number };
export type Aba = { t: string; desc: string; em: number; icone: string };

// transicao: faixa diagonal nas cores da marca cobrindo o corte (padrão) ou nenhuma (cena continua a anterior)
type Base = { inicio: number; fim: number; transicao?: 'faixa' | 'nenhuma' };

export type Cena = Base &
  (
    | { tipo: 'pergunta'; palavras: Palavra[]; simbolo?: string } // simbolo: marca d'água ao fundo ('?' padrão, '' tira)
    | { tipo: 'telas'; telas: string[]; titulo: Palavra[]; pilulas: { t: string; em: number }[] }
    | { tipo: 'ritmo'; linha1: Palavra[]; linha2: Palavra[]; tela: string; troca: number; episodios: number }
    | { tipo: 'parede'; cards: string[]; texto: Palavra[]; logo: string; logoEm: number }
    | ({ tipo: 'apresentador'; video: string; videoInicio: number; texto: Palavra[] } & Enquadre)
    | ({ tipo: 'preco'; video: string; videoInicio: number; rotulo: string; moeda: string; valor: string; sufixo: string; cobrirEm?: number } & Enquadre)
    | { tipo: 'logo'; logo: string; botao: string; botaoEm: number }
    | { tipo: 'lista'; titulo: Palavra[]; itens: { t: string; sub?: string; em: number; cor?: string }[]; estilo?: 'numeros' | 'faixas' }
    | { tipo: 'ciclo'; titulo: Palavra[]; card: string; etapas: { t: string; quem?: string; em: number }[]; saiEm?: number; saiTexto?: string }
    | { tipo: 'navegador'; telas: { src: string; em: number }[]; dispositivo?: 'computador' | 'celular'; proporcao?: number; rotulo?: string; endereco?: string; texto?: Palavra[]; camera?: Camera[]; cursor?: Cursor[]; destaques?: Destaque[] }
    | { tipo: 'abas'; titulo: Palavra[]; abas: Aba[] }
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
