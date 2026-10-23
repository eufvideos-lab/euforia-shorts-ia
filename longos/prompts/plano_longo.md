# Como montar o plano.json do vídeo longo (formato Padrão)

Você recebe `palavras.txt` (cada palavra como `índice:palavra[tempo]`, uma frase por linha) e escreve
`plano.json`. Todo tempo no plano é um **índice de palavra** do bruto; a máquina converte para o tempo do vídeo final.

## Regras do Flau (aprovadas em 17/10/2026)
- **Cortes:** tire conversa paralela, comandos de gravação ("vou gravar o gancho", "corta"), repetições, takes ruins
  e respiros longos. Do bruto de 30 a 40 min sai um vídeo de 8 a 10 min (ou o que a fala render, sem encher).
  Abra com o **gancho** (a frase mais forte da história), depois a apresentação. Corte nunca no meio de palavra.
- **Gancho simples (Flau, 23/10/2026):** o gancho é UM trecho contínuo do bruto (uma ou duas frases seguidas),
  nunca vários pedaços colados. A máquina deixa a pessoa respirar no gancho (`"gancho": 1` = quantos trechos do
  início contam como gancho). Depois do gancho, os cortes seguem normais.
- **Zoom alternado** entre os segmentos: a máquina faz sozinha (`zoom` 1.22, `centro_zoom` [x, y] do rosto, 0 a 1).
- **Pessoa fora do centro** (gravou mais para o canto, ou as observações pedem para centralizar): ponha `"centralizar": true`.
  O plano aberto também corta em volta do rosto e a pessoa fica no meio. Confira num quadro do segmento 000 que ela
  ficou centralizada e sem cortar a cabeça; se precisar, ajuste com `"zoom_aberto"` (1.0 a 1.6). Em bruto 1080p,
  zoom acima de ~1.4 perde nitidez: prefira centralizar só até onde a imagem continua boa (bruto 4K aguenta tudo).
- **Textos-chave** (`keywords`): só termos importantes, 8 a 14 num vídeo de 8 min. GRANDES, CAPS, brancos com sombra,
  sem tarja; `*palavra*` sai no degradê do cliente. Máximo ~30 letras; use `|` para quebrar em duas linhas.
- **Cartões de tópico** (`cartoes`): frases de impacto em tela cheia na cor do cliente, ~5 s, 4 a 6 por vídeo.
  Até 3 linhas curtas (máx. ~22 letras cada). Um cartão de título (`titulo`) logo depois do gancho.
- **Mapa** (`mapa`, opcional): quando a pessoa cita 3 ou mais cidades seguidas. Uma imagem única, sem piscar.
- **B-roll é obrigatório**, 10 a 16 num vídeo de 8 min, 2,5 a 3,5 s cada:
  - `"fonte": "pixabay"` para o genérico (`busca` em inglês, 2 a 4 palavras, cena real, nada de desenho);
  - `"fonte": "foto"` para o específico (pessoa citada, faculdade, empresa, lugar): busque no Google pelo fluxo de
    fotos do n8n (ver TAREFA) e ponha os `file_ids` das partes salvas no Drive;
  - nunca trecho de vídeo do YouTube.
- **Lowers** (`lowers`): "inscreva" 2 vezes e "like" 1 vez (de preferência quando a pessoa pede para se inscrever
  ou comentar). Lower de nome (`"tipo": "nome"` + campo `nome`) só se o cliente mandar o nome/cargo.
- **Trilha** royalty free bem baixa (-31 dB com ducking); a máquina cuida.
- **Paleta do cliente sempre, em TODOS os elementos** (textos-chave, cartões, lowers, inscreva-se, tela final): campo
  "Identidade shorts (IA)" do cliente no Notion, copiado como está para `paleta`. Chaves: `fundo` (cartões e tela
  final), `texto`, `destaque` (palavra destacada, barras, contornos), `destaque2` (meio do degradê), `caixa` (fundo dos
  lowers; padrão = destaque), `brilho` (luz no fundo dos cartões; padrão = destaque) e `degrade` (`nao` = destaque em
  cor sólida; o degradê branco→destaque2→destaque é do Grupo Euforia). Nunca deixe laranja da Euforia em cliente
  com outra paleta. Sem paleta cadastrada: procure no Drive do cliente (manual de marca, tela final, carrosséis) e
  grave no cliente. Paleta padrão = Grupo Euforia.
- Nada pode se sobrepor: dois elementos de tela cheia (B-roll, cartão, título, mapa) não podem se cruzar,
  nem dois textos de baixo (texto-chave e lower). `montar.py` avisa e para; ajuste a palavra.

## Formato
```json
{
  "paleta": {"fundo": "#050505", "destaque": "#FF6518", "destaque2": "#FEB089", "texto": "#FFFFFF"},
  "trechos": [[67, 82], [83, 128], [15, 60]],
  "centro_zoom": [0.45, 0.40],
  "titulo": {"sub": "O DIA QUE EU VIREI", "linhas": ["SÓCIO DO *RAIAM*"], "palavra": 15, "dur": 5},
  "keywords": [{"texto": "Pix de *R$ 1 milhão*", "palavra": 75}],
  "cartoes": [{"linhas": ["O resultado *grita*", "mais do que a sua voz."], "palavra": 640, "dur": 5}],
  "mapa": {"titulo": "PARA ONDE ELE CHAMAVA", "cidades": [{"nome": "Recife", "palavra": 900}]},
  "brolls": [
    {"id": "b1", "fonte": "pixabay", "busca": "sao paulo city aerial", "palavra": 49, "dur": 2.6},
    {"id": "b2", "fonte": "foto", "busca": "Raiam Santos", "palavra": 56, "dur": 3, "file_ids": ["1Ykd..."]}
  ],
  "lowers": [{"tipo": "inscreva", "palavra": 500}, {"tipo": "like", "palavra": 1800}],
  "nome": null,
  "musica_file_id": "15UN5dqdxX_VcaJAdcJ1vOyuGgtmBSoiQ"
}
```
- `trechos`: lista na ordem do vídeo final; cada um é [primeira palavra, última palavra], inclusive.
- `palavra` de qualquer elemento precisa estar dentro de um trecho mantido.
