# Thumbs e capas de short pelo molde (desde 27/11/2026)

Henrique escolheu em 27/11/2026 religar a "Máquina de Editáveis no Canva" usando este molde. A máquina passa a
entregar **PNG pronto** no Drive (pasta do vídeo). A equipe revisa e posta. O caminho do Canva
(`AUTOMATICO.md`) só é usado quando o card pede "editável no Canva" de forma explícita.

Ferramentas em `tools/molde/` (rodar **a partir da pasta do repositório**):
- `cut.py foto.jpg saida.png`: recorte sem fundo (rembg birefnet-portrait). Um processo por foto, senão estoura memória.
- `thumb.py spec.json saida.png`: thumb 1280x720. Pílula com o nome, título em 2 linhas, barra, frase de apoio e foto recortada à direita.
- `capa.py spec.json saida.png`: capa de short 1080x1920. Foto num círculo com anel, rosto centralizado, pílula com o nome e título em 2 ou 3 linhas embaixo.
- `rosto.py`: acha o rosto. Os dois moldes usam `rosto_w` (largura do rosto) para deixar o rosto grande e centralizado.
- Exemplos de spec aprovados para revisão: `tools/molde/exemplos/`.

## Preparar (uma vez por rodada)
```
pip install -q rembg "opencv-python-headless<5" playwright
mkdir -p ~/.u2net && [ -s ~/.u2net/birefnet-portrait.onnx ] || curl -sL -o ~/.u2net/birefnet-portrait.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-portrait-epoch_150.onnx
```

## Para cada card
1. **Texto.** Pegue o texto do card: "Texto da thumb", ou uma linha "Short N" por short.
   - Use CAIXA ALTA.
   - A linha 2 é a palavra forte, na cor de destaque.
   - Na thumb, o `apoio` é uma frase curta tirada do título do vídeo (está no `.txt` da pasta do vídeo).
   - Nunca invente texto.
2. **Foto** (regra de capricho do Henrique, 25/11). Procure nesta ordem:
   - `01 - ELEMENTOS ESSENCIAIS/03 - FOTOS` (PROFISSIONAIS/RECORTES) do cliente.
   - Pastas de ensaio com o nome do cliente.
   - `03 - ARQUIVOS BRUTOS`.

   Prefira a maior resolução disponível. Monte uma folha lado a lado com as candidatas e olhe antes de escolher:
   - Só uma pessoa no quadro.
   - Rosto de frente.
   - Pose ligada ao tema.

   Use uma foto diferente por peça sempre que houver opção. Se aparecer gente ou objeto junto no recorte, corte o PNG antes de usar.

   Se o cliente não tiver foto boa, use a melhor que houver e anote no Obs "pedir ensaio". Se não houver nenhuma, marque o card **Falta do cliente**.
3. **Cores.** Tire as cores da identidade do cliente: thumbs antigas em `04 - IDENTIDADE VISUAL` ou o logo. Paletas já usadas:
   - Valicir: #F2EAE4 / #233250 / #D9587A
   - Rodrigo: #15102B / #452575 / #2FAABF
   - Valéria: #0E2238 / #1D3F63 / #D9B46A
   - Edjane: #EEF0EE / #123F45 / #3E8E8A
   - Giuliano: #F1F1EF / #1B2433 / #E0A526
4. **Render e conferência.**
   - Abra o PNG e confira: rosto grande e inteiro, texto sem passar por cima do rosto, nenhuma borda dura de recorte.
   - Na capa, `capa.py` imprime `texto_ate_y`. Ele precisa ficar abaixo de ~1750. Se passar, baixe `tam` (70–84) ou quebre a frase em 3 linhas.
   - Para shorts, monte uma folha com as capas lado a lado e confira antes de subir.
5. **Subir.** Use `ponte.subir(png, <pasta do vídeo>, nome)`, com o nome `THUMB - <TEXTO>.png` ou `CAPA SHORT N.png`.
6. **Card.**
   - Link do arquivo: o arquivo (thumb) ou a pasta do vídeo (capas).
   - Status: **Em revisão**.
   - Revisor: Lorena.
   - "🏢 Escritório IA": Feito pela IA.
   - Uma linha no topo do Obs: `[Escritório dd/MM HH:mm] Molde: <arquivo> · foto: <qual>`.
7. **Painel.** Se o card tem "Pedido", rode `python3 pipeline/thumb_painel.py "<link do pedido>" "<link do Drive>"` para o link aparecer na gaveta da Grade.

## Regras
- Nunca envie nada a cliente nem em grupo de cliente.
- Cliente em cancelamento (Clima "Em rescisão" na ficha): não produza. Marque **Precisa da Direção** com "cliente em cancelamento".
- Se der erro, marque o card "Precisa da Direção" com o motivo. Para a equipe, escreva só "deu erro, a diretoria está resolvendo".
- Não faça commit, push nem pull request.
