# Thumb e capas de short automáticas no Canva (desde 20/11/2026)

Pedido do Henrique (20/11/2026): quando a máquina entrega um vídeo, a thumb **editável no Canva** já vem junto, na
pasta do cliente, com o link no pedido, no card e na gaveta do horário da Grade. Ninguém precisa pedir no painel.
Mesma coisa para as **capas dos shorts** (hoje feitas à mão, ex.: Betânia e Dr. Gustavo).

Quem faz: a rotina **"Máquina de Editáveis no Canva"** (projeto Euforia · Máquinas), que é a única com o Canva.
Ela pega os cards `CLIENTE | EDITÁVEIS NO CANVA · THUMB AUTOMÁTICA` e `CLIENTE | EDITÁVEIS NO CANVA · CAPAS AUTOMÁTICAS`,
que a máquina de longos e a de shorts criam sozinhas ao entregar (veja `longos/TAREFA.md` e `TAREFA.md`).

## O que o card traz (Obs, uma linha cada)
- `Pedido: <link do pedido no Notion>` (🎞️ Longos ou 🎬 Shorts)
- `Card do vídeo: <link>` (se o pedido tinha "Card no Entregas")
- `Texto da thumb: ...` (longo: o `texto_thumb` do publicacao; shorts: uma linha `Short N: <título>` por short)
- `Pasta do vídeo: <link do Drive>`

## Peças fixas do cliente (fazer uma vez, depois só reaproveitar)
Ficha do cliente (banco Clientes):
- **"🎨 Modelo thumb (Canva)"** e **"🎨 Modelo capa short (Canva)"**: o design que a máquina COPIA a cada vídeo.
- **"Canva (editáveis)"**: pasta do cliente no Canva (`Clientes` = `FAHXPENKZJw`).
- Fotos: `01 - ELEMENTOS ESSENCIAIS/03 - FOTOS/RECORTES` no Drive (banco de fotos sem fundo).

### 1. Banco de fotos sem fundo (RECORTES)
Se RECORTES está vazio: baixe as fotos de `03 - FOTOS/PROFISSIONAIS` (`ponte.baixar`) e rode
```
pip install -q rembg "opencv-python-headless<5"
mkdir -p ~/.u2net && curl -sL -o ~/.u2net/birefnet-portrait.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-portrait-epoch_150.onnx
python3 pipeline/recortes.py fotos/ recortes/ --max 1     # repita até "feitos": [] (1 foto por processo: memória)
```
O script só aceita foto de **alta resolução** (lado menor ≥ 1400 px) com **um rosto de frente**, centraliza o rosto
e monta `_CONFERIR RECORTES.jpg` (folha para a equipe conferir cabelo e bordas). Suba os PNG e a folha em RECORTES
(`ponte.subir`). Sem foto profissional boa: card em **Falta do cliente** com "Precisa de foto profissional
(alta resolução, rosto de frente) em 03 - FOTOS/PROFISSIONAIS".

### 2. Modelo no Canva
Ficha sem "🎨 Modelo thumb (Canva)":
1. Pegue a thumb padrão do cliente: `PADRÃO ...` em `04 - IDENTIDADE VISUAL/MODELOS DE THUMB`, senão a mais recente
   dessa pasta (PNG/JPG 1920x1080 ou 1280x720).
2. Leve ao Canva pelo fluxo n8n **"Utilitário | Arquivo do Drive para o Canva (V1)"** (`GmStXWTIlRMmSYU5`):
   `create-upload-url` (Canva) → `execute_workflow` modo manual, webhook body `{file_id, upload_url}` → `get_execution`
   com `includeData` e `nodeNames: ["Resumo"]` (saída grande vai para arquivo: `jq '.data.resultData.runData["Resumo"][0].data.main[0][0].json'`)
   → `mediaId`.
3. `separate-image-layers` com o `mediaId`, título `[NOME DO CLIENTE] MODELO THUMB (MÁQUINA) [EUFORIA]`. O design
   volta com os **textos editáveis na fonte certa** e a foto como camada própria (retângulo grande do lado da pessoa).
4. `move-item-to-folder` para a pasta do cliente; grave o link do design na ficha.

Capa de short sem modelo: a mesma coisa com `04 - IDENTIDADE VISUAL/CAPAS DE SHORTS`. Se a pasta estiver vazia, monte
o fundo em HTML 1080x1920 com a identidade do cliente (cores, logo recortado da thumb, título em 2 linhas centralizado,
**tudo que importa na faixa y 420–1500**, regra do Henrique de 29/10), sem a foto; render com Playwright, suba pelo
Drive (`ponte.subir` + fluxo acima), `separate-image-layers`, e insira a foto (`insert_fill`, recorte do banco) da
metade para baixo. Exemplo pronto: Betânia Machado (20/11/2026).

## Para cada card (a cada vídeo)
1. `copy-design` do modelo → `read-design` com `open_transaction: true` e `thumbnails`.
2. `update_title`: `[NOME DO CLIENTE] THUMB <TEXTO> [EUFORIA]` (capa: `CAPA SHORT N <TÍTULO>`).
3. Texto: `replace_text` nos textos do título com o texto do card (linha 1 na cor de destaque, linha 2 na outra cor,
   como no modelo; o texto pequeno de apoio vira uma frase do título do vídeo, ou apague se não couber). Nada inventado:
   só o texto do card ou o título do vídeo.
4. Foto: `update_fill` na camada da pessoa com um recorte do banco **diferente do usado na última thumb do cliente**
   (anote no Obs qual foi). O recorte vai ao Canva pelo fluxo do Drive acima (um upload por recorte usado).
   Depois `crop_media` para o rosto ficar no alto do quadro: `top` 0 a 40, `left` ≈ -(largura × 0,04),
   `width` ≈ largura do elemento × 1,08, `height` = width × (altura/largura do recorte). Confira na miniatura:
   cabeça inteira, nada cortado no queixo.
5. Confira a miniatura (texto quebrando letra por letra = `resize_element` na largura; texto passando por cima do rosto =
   encurte). `finalize: "commit"`, `move-item-to-folder` para a pasta do cliente.
6. Shorts: uma capa por short do pedido (cópias do modelo), todas na subpasta `CAPAS - <pedido curto>` da pasta do
   cliente no Canva (`create-folder`); o link que vai para o pedido/painel é o dessa subpasta.

## Registro (tudo, sempre)
- Pedido: **"🎨 Thumb no Canva"** (longos) ou **"🎨 Capas no Canva"** (shorts) = link do design / subpasta.
- Card do vídeo (se houver): linha no topo do Obs `[Máquina dd/MM HH:mm] Thumb editável no Canva: <link>`.
- Painel (gaveta do horário na Grade): `python3 pipeline/thumb_painel.py "<link do pedido>" "<link do Canva>"`.
- Este card: Link do arquivo = link do Canva, Status **Em revisão**, "🏢 Escritório IA" = Feito pela IA, Obs
  `[Escritório dd/MM HH:mm] Thumb automática: <link> · foto: <recorte usado>`. É a conferência do Ismael antes de postar.
- Discord #dia-a-dia: só se algo travou. A entrega normal não avisa (o link já está no pedido e na grade).

## Limites
- Fonte: `separate-image-layers` escolhe uma fonte parecida no Canva; `replace_text` mantém a fonte do modelo.
- O Canva não troca a família da fonte pela API. Se o modelo saiu com fonte errada, refaça o modelo (passo 2), não a thumb.
- Erro: card "Precisa da Direção" com o motivo; para a equipe só "deu erro, a diretoria está resolvendo".
