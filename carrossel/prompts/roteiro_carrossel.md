# Como escrever o carrosseis.json (regras da Máquina de Carrosséis)

Você transforma roteiros de vídeo do cliente em carrosséis de Instagram (1080x1350) na identidade dele.
Tudo em português do Brasil, na voz do cliente (1ª pessoa quando o cliente é uma pessoa).

## Quantos carrosséis e de onde vem o conteúdo
- O pacote do pedido diz quantos: 1, 3, 6 ou 12. Entregue exatamente essa quantidade.
- Fonte: os roteiros ligados ao pedido. Se não houver, use os roteiros mais recentes do cliente no banco
  🎬 Pautas e Roteiros que ainda não viraram carrossel (veja os pedidos anteriores do mesmo cliente).
- Menos roteiros que carrosséis: tire mais de um carrossel do mesmo roteiro, sempre com formato e ângulo
  diferentes (ex.: um "Erros comuns" e outro "O que fazer amanhã"). Máximo 3 carrosséis por roteiro.
  Faltou roteiro mesmo assim: entregue o que der e explique no log.
- Use só o que está no roteiro (e no briefing do cliente). Nunca invente número, data, lei, caso ou promessa.
  Trecho marcado "PEDIR AO CLIENTE" ou "⚠️ conferir" não entra no carrossel.

## Formatos (varie dentro do pacote)
- **Erros comuns**: capa com a dor, 1 slide por erro (`passo` com número), o que fazer, CTA.
- **Passo a passo**: capa com a promessa, 1 slide por passo (`passo`), CTA.
- **Mito x verdade**: `comparacao` (errado x certo) para cada mito.
- **Sinais / checklist**: `lista` com 3 a 5 itens.
- **Virada**: capa forte, contexto (`texto`), a frase da virada (`frase` em tema escuro), aplicação, CTA.

## Estrutura de cada carrossel
- 6 a 8 slides (mínimo 5, máximo 10). Slide 1 = `capa`, último = `cta`.
- Capa: gancho curto (até 12 palavras) com 1 a 3 palavras em `*destaque*`. Subtítulo opcional (até 12 palavras).
  Use foto do cliente na capa quando houver foto profissional (`"foto": "assets/fotos/x.jpg"`).
- Slides internos: título até 9 palavras; texto até 35 palavras por slide (2 parágrafos curtos no máximo).
  Um slide escuro no meio (`"tema": "escuro"`) dá ritmo.
- CTA: frase de fechamento do roteiro + botão com a chamada que o roteiro usa (diagnóstico, link na bio,
  WhatsApp...). Se o roteiro não tem chamada de produto: "Assista ao vídeo completo no canal".
  Pergunta para comentar vem no texto do CTA.
- `rotulo`: tema curto do carrossel (1 a 3 palavras, ex.: "Liderança"), aparece no topo.

## Marcações de texto
`*palavra*` = cor de destaque · `==trecho==` = grifo · `**negrito**` · `\n` = quebra de linha.
Use destaque com moderação: no máximo 1 trecho por slide.

## Tipos de slide (campos)
```json
{"tipo":"capa","titulo":"...","subtitulo":"...","foto":"assets/fotos/1.jpg","tema":"escuro","altura_foto":57}
{"tipo":"texto","titulo":"...","texto":["parágrafo 1","parágrafo 2"]}
{"tipo":"passo","numero":"1","titulo":"...","texto":"..."}
{"tipo":"lista","titulo":"...","itens":[["Item","explicação curta"],["Item","..."]]}
{"tipo":"comparacao","titulo":"...","errado":{"rotulo":"Mito","texto":"..."},"certo":{"rotulo":"Verdade","texto":"..."}}
{"tipo":"comparacao","modo":"par","titulo":"...","errado":{"rotulo":"Erro 3","texto":"..."},"certo":{"rotulo":"Erro 4","texto":"..."}}
{"tipo":"citacao","titulo":"“frase”","autor":"Nome"}
{"tipo":"frase","titulo":"frase gigante","texto":"complemento opcional","tema":"escuro"}
{"tipo":"cta","titulo":"...","botao":{"texto":"Faça o diagnóstico","detalhe":"link na bio"},"texto":"...","foto":"assets/fotos/2.jpg"}
```
Qualquer slide aceita `"tema": "claro" | "escuro" | "destaque"` e `"rotulo"`. Foto em slide interno: `"foto"` e
`"foto_estilo": "lado"` (coluna à direita) ou `"selo"` (círculo no canto).

## Arquivo completo
```json
{"carrosseis":[{"titulo":"nome curto do carrossel","roteiro":"link do roteiro no Notion","formato":"Erros comuns",
  "rotulo":"Liderança","slides":[...],"legenda":"..."}]}
```

## Legenda (Instagram)
400 a 900 caracteres: gancho na 1ª linha, 2 a 3 linhas de valor, pedido de salvar ou comentar, menção ao vídeo
completo no YouTube, 3 a 5 hashtags no fim. Sem emoji em excesso. Nunca cite a Euforia.

## Fotos
Só fotos profissionais do cliente (pasta de fotos, ensaio, manual da marca). Nunca quadro tirado de vídeo, nunca
foto de banco de imagem com rosto de outra pessoa, nunca as cores da Euforia. Sem foto boa: carrossel só tipográfico.
