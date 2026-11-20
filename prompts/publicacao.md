# Pacote de publicação (título, descrição e SEO) — 16/11/2026

Substitui o "cola a transcrição no Gemini" que a equipe fazia à mão. A máquina já tem a transcrição; o Claude da
rotina escreve `publicacao.json` na pasta do pedido e `pipeline/publicacao.py` confere, converte os capítulos para
minuto:segundo, grava um .txt por vídeo (o que a equipe copia e cola no YouTube) e põe o pacote no projeto do Studio.

## O que ler antes de escrever
- A transcrição (`palavras.txt`) e, se houver, o roteiro do vídeo (banco 🎬 Pautas e Roteiros): a pauta do roteiro
  costuma já trazer o tema e a palavra-chave que o escritório escolheu. Use.
- Ficha do cliente: nicho, "Direção criativa (gosta / não gosta)", "Padrões de edição", "Obs importante",
  links (Instagram, YouTube, TikTok) e o campo "📝 Rodapé da descrição (YouTube)" (texto fixo que o cliente quer no fim
  de toda descrição: links, contato, CTA). Rodapé vazio: monte só com os links da ficha que existirem.
- Nunca invente link, número, preço, data, curso ou promessa que não esteja na fala ou na ficha.

## Regras
**Título (3 opções, a 1ª é a recomendada)**
- Longo: até 70 caracteres (o YouTube corta por volta disso na busca). Short: até 60, com o gancho do short.
- A palavra-chave principal (o que a pessoa digitaria na busca do YouTube) aparece no começo do título.
- Promessa clara e verdadeira, sem clickbait mentiroso. Pode número, pergunta, "como", "por que", "o erro de".
- No máximo 1 palavra em CAPS (ou nenhuma). Sem emoji no título do longo; no short pode 1 no fim.
- Respeite o tom da ficha (cliente técnico/sóbrio: nada de "CHOCANTE", "você não vai acreditar").
- As 3 opções exploram ângulos diferentes (benefício, curiosidade, erro/medo), não sinônimos.

**Descrição do longo** (até 5000 caracteres; o que importa está nas 2 primeiras linhas, que aparecem na busca)
1. Linhas 1–2: o gancho com a palavra-chave principal e o que a pessoa vai aprender. Frases curtas.
2. Parágrafo de 3–5 linhas resumindo o vídeo, usando naturalmente 2–4 palavras-chave secundárias (sem lista de palavras).
3. Capítulos (só quando o longo foi editado pela máquina e tem mais de 3 min): campo `capitulos`, 4 a 10 itens,
   o 1º na palavra 0, cada um com pelo menos 30 s de distância, títulos de 2–6 palavras que dizem o assunto
   (não "Parte 2"). O script escreve os minutos. Longo editado à mão: use `topicos` ("Neste vídeo você vai ver:")
   em vez de capítulos, porque os minutos do bruto não batem com o vídeo final.
4. Chamada para ação curta ligada ao tema (inscrever, comentar uma pergunta concreta, ver outro vídeo).
5. Rodapé do cliente (campo `rodape`, copiado da ficha) e 3 hashtags no fim.

**Descrição do short**: 1–2 frases (gancho + contexto), uma pergunta para comentar e 3 hashtags. Até 300 caracteres.

**Tags** (campo `tags`): 10 a 20, somando no máximo 450 caracteres. Mistura: palavra-chave principal, variações,
termos do nicho, nome do cliente e do canal, erros comuns de grafia só se forem muito buscados.

**Hashtags**: 3 (o YouTube mostra as 3 primeiras acima do título). Sem acento, sem espaço, a 1ª é o tema principal.
Nunca #shorts no longo; no short a 1ª pode ser #shorts.

**Palavras-chave** (campo `palavras_chave`): a principal primeiro e 3 a 6 secundárias. É o que a equipe usa para
conferir e para a thumb.

**Comentário fixado** (opcional, `comentario_fixado`): uma pergunta que puxa conversa sobre o tema.

**Thumb** (opcional, `texto_thumb`): 2 a 4 palavras fortes para a thumb, diferentes do título.

## Formato do publicacao.json
```json
{
  "longo": {
    "nome": "Vídeo 03",
    "titulos": ["...", "...", "..."],
    "descricao": "Linha 1 do gancho.\nLinha 2.\n\nResumo...",
    "capitulos": [{"palavra": 0, "titulo": "O erro mais comum"}, {"palavra": 412, "titulo": "Como corrigir"}],
    "topicos": [],
    "cta": "Comenta aqui: ...",
    "rodape": "Instagram: https://instagram.com/...",
    "tags": ["..."],
    "hashtags": ["#tema", "#nicho", "#cliente"],
    "palavras_chave": ["principal", "secundária 1"],
    "comentario_fixado": "...",
    "texto_thumb": "..."
  },
  "shorts": [
    {"titulos": ["...", "...", "..."], "descricao": "...", "tags": ["..."], "hashtags": ["#shorts", "#tema", "#nicho"],
     "palavras_chave": ["..."]}
  ]
}
```
- Máquina de shorts: `shorts` na mesma ordem do `plano.json` e, sempre que o pedido for de um vídeo que também vira
  longo (o normal), `longo` com `topicos` (sem capítulos). Assim o longo editado à mão também sai com título e descrição.
- Máquina de longos: só `longo`, com `capitulos` (índices de palavra do `palavras.txt`, em trechos mantidos).
- Vídeo editado à mão (rotina `publicacao/TAREFA.md`, 20/11/2026): `pipeline/seo_video.py` transcreve o vídeo PRONTO;
  `longo` com `capitulos` (índices do `palavras.txt` dele) ou `shorts` com 1 item.
- `descricao` NÃO repete capítulos, CTA, rodapé nem hashtags: o script junta tudo na ordem certa.
