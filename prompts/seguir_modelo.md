# Seguir o modelo (thumb, carrossel e arte)

Lido pela Máquina do Escritório (thumb e arte) e pela Máquina de Carrosséis quando o pedido traz a linha
`Modelo para seguir: ...` (vem do painel, no card do Entregas e nas "Observações para a máquina" do quadro de
carrosséis), ou quando o cliente já tem um **modelo padrão** salvo (item 5).

O objetivo é a equipe parar de refazer à mão: a peça tem de sair **com a cara do modelo**, com o conteúdo e a
identidade do cliente.

## 1. Pegar o modelo
A linha traz um ou mais links (separados por espaço ou vírgula). Para cada um:
- **Arquivo do Drive** (anexo do painel, pasta PEDIDOS DO PAINEL, ou link `drive.google.com/...`): tire o ID e baixe
  com `ponte.baixar('<id>', 'pedidos/<id-curto>/modelo/modelo-N.<ext>')`. Pasta: baixe até 5 imagens dela.
- **Vídeo do YouTube** (link `youtube.com/watch?v=` ou `youtu.be/`): a thumb é
  `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` (se der 404, `hqdefault.jpg`).
- **PDF** (carrossel exportado): converta as páginas em PNG (`pdftoppm -png -r 72`).
- **Instagram ou outro site**: tente baixar a imagem. Se não der, siga o padrão do cliente e escreva no log/Obs:
  "Não consegui abrir o modelo do Instagram. Da próxima vez mande o print ou o arquivo."
Monte a folha e **olhe**: `python3 carrossel/analisar.py folha pedidos/<id-curto>/modelo/folha.jpg <modelos>`.
Cores do modelo: `python3 carrossel/analisar.py cores <modelo>`.

## 2. O que copiar do modelo (o "jeito")
Anote em `pedidos/<id-curto>/modelo/leitura.md`, em tópicos curtos:
- **Composição:** onde fica o rosto/pessoa (esquerda, direita, centro, recortado sem fundo), onde fica o texto,
  quanto da área cada um ocupa.
- **Texto:** quantas palavras, quantas linhas, caixa alta ou não, palavra destacada com cor/fundo/sublinhado,
  peso e tipo de fonte (serifada, sans pesada, condensada, manuscrita).
- **Fundo:** liso, foto, gradiente, textura, desfocado; claro ou escuro.
- **Elementos:** setas, círculos, faixas, molduras, ícones, número grande, selo, emoji, borda.
- **Carrossel:** quantos slides, como a capa chama, como os slides internos se organizam (título + texto, lista,
  numeração, foto em cima), slide final (CTA), onde fica o @/logo.
- **Clima:** sóbrio, chamativo, editorial, "print de notícia", minimalista.

## 3. O que NUNCA copiar
- Texto, frase, título ou número do modelo. O texto sai do roteiro/tema do cliente.
- Logo, marca, @, nome ou rosto de outra pessoa. Foto de terceiro do modelo.
- Cores do modelo **quando o modelo não é do cliente**: use a identidade do cliente (ficha, manual, MODELOS DE
  THUMB/CARROSSEL) e aplique as cores dele na mesma estrutura. Se o modelo **é do próprio cliente** (peça dele já
  postada, ou o pedido diz "usar estas cores"), copie as cores também.
- Nunca o laranja Euforia em peça de cliente.

## 4. Fazer e conferir
- **Thumb e arte:** monte o HTML reproduzindo a composição do modelo (mesma posição de rosto e texto, mesma
  hierarquia, mesmos elementos), com a foto e o texto do cliente. 1280×720 para thumb.
- **Carrossel:** escolha os `tipo` de slide (`capa`, `lista`, `passo`, `frase`, `citacao`, `comparacao`, `cta`) que
  mais se parecem com o modelo e use `css_extra` no `identidade.json` para chegar perto do jeito dele (tamanho e
  caixa do título, alinhamento, faixa atrás da palavra destacada, borda, numeração, posição do logo). Mesma
  quantidade de slides do modelo quando o pacote/roteiro permitir.
- **Comparação:** faça `comparacao-modelo.jpg` com o modelo à esquerda e a peça nova à direita
  (`analisar.py folha`). Olhe: se alguém da equipe batesse o olho, diria que é "o mesmo estilo"? Se não, refaça
  (até 2 vezes). Suba a comparação junto com a entrega, para o Ismael revisar comparando.
- No Obs/log: "Segui o modelo <nome do arquivo>: <2–3 pontos copiados>. Texto do roteiro <qual>."

## 5. Modelo padrão do cliente
Assim que uma peça feita a partir de um modelo é entregue, o modelo vira o padrão do cliente para aquele tipo:
- Suba o arquivo do modelo para a pasta do cliente `04 - IDENTIDADE VISUAL/MODELOS DE THUMB` (thumb e arte) ou
  `MODELOS DE CARROSSEL` (carrossel), com o nome `PADRÃO AAAA-MM-DD - <nome original>` (crie a subpasta se faltar,
  ver `PASTAS.md`).
- Carrossel: grave também no campo "Identidade carrossel (IA)" da ficha as chaves `"modelo":"<id do arquivo no
  Drive>"` e `"css_extra":"..."` (o CSS que deu certo), sem apagar as outras chaves.
- Pedido **sem** "Modelo para seguir": se houver arquivo `PADRÃO ...` nessas pastas, o mais recente é o modelo
  (siga os itens 1 a 4 com ele). Diga no log "segui o modelo padrão do cliente".
- Se o Ismael devolver com "Ajustar"/"diferente do modelo", corrija a peça e, se a correção for de estilo,
  atualize o `css_extra` salvo.

## 6. Texto da peça (de onde vem)
O modelo só manda no visual. O texto vem, nesta ordem: o que o pedido escreveu ("Tema da thumb", "Vídeo ou tema",
detalhe) → o roteiro do vídeo no 🎬 Pautas e Roteiros → a transcrição do vídeo. `Tema da thumb: do roteiro do
vídeo` quer dizer que a equipe não escreveu tema: ache o roteiro do vídeo do link/pasta do pedido e proponha 2–3
textos curtos (até 5 palavras) tirados dele; a thumb sai com o melhor e as outras opções vão no Obs.
