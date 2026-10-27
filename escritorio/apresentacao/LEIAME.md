# Apresentação de call (modelo fixo)

A máquina NÃO desenha slides. Ela escreve só o conteúdo num JSON e roda:

```
python3 escritorio/apresentacao/gerar.py pedidos/<id>/conteudo.json pedidos/<id>/apresentacao.html --prints pedidos/<id>/prints
```

O gerador recusa (e diz o que corrigir) quando há placeholder à mostra ("[", "a confirmar"), texto comprido demais,
mais de 3 cards ou 5 itens num slide, mais de 18 slides, ou quando falta o slide de feedback ou o agradecimento no fim.
Confira os PNGs de `--prints` antes de publicar.

## Formato do JSON (veja `exemplo.json`)

- `titulo`, `data` ("28 de outubro de 2026"), `cores` do cliente: `escuro`, `medio`, `forte`, `destaque`, `acento`,
  `acento2`, `claro`, `texto`, `cartao` (só `escuro` e `destaque` são obrigatórias). Opcional: `fonte_titulo`,
  `fonte_texto` (Google Fonts; padrão Fraunces + Inter).
- `slides`: lista, cada um com `tipo`, os campos do tipo e `notas` (roteiro do apresentador, tecla N; é aqui que vai
  tudo que precisa conferir ou que ainda não está confirmado).

| tipo | campos | uso |
|---|---|---|
| `capa` | kicker, titulo, titulo_destaque, sub, foto (recorte sem fundo, opcional) | abertura |
| `agenda` | kicker, titulo, itens (até 5, curtos) | o que vamos resolver |
| `cards` | kicker, titulo, cards (até 3: rotulo, texto, titulo opcional), rodape | 3 ideias lado a lado |
| `etapas` | igual a `cards` | próximos passos (Hoje / Com você / Depois) |
| `lista` | kicker, titulo, itens (até 5, uma linha cada) | dicas, checklist |
| `divisor` | numero ("01"), titulo, sub, citacao, fonte | abre cada bloco |
| `frase` | kicker, titulo, sub | uma afirmação grande |
| `imagens` | kicker, titulo, imagens (1 a 4 caminhos), rodape | prévias de thumbs, canal, identidade |
| `feedback` | sub (opcional) | sempre, antes do agradecimento |
| `obrigado` | titulo, sub, foto (recorte sem fundo, opcional) | sempre o último |

Regras de conteúdo: um assunto por slide; título com no máximo 70 caracteres; card com no máximo 170; item de lista
com no máximo 60. Nada de "[a confirmar]" no slide: isso vai nas notas. Números do canal só em percentual. Nada de
valores, nada inventado, nunca o nome do Henrique. Imagens são embutidas (reduzidas a 1600 px); o recorte da capa
fica transparente.

Fotos do cliente: sempre as profissionais em alta, de `03 - FOTOS/PROFISSIONAIS` (ou um recorte já pronto em
`RECORTES`). Para a capa, recorte o fundo (`rembg`, modelo `isnet-general-use`) e corte da cabeça até a cintura.
Foto de rede social ou print pequeno fica borrada no telão: o gerador recusa foto com menos de 900 px de altura.
