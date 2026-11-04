# Editáveis no Canva (parte da Máquina do Escritório)

Quando o cliente aprova o que mostramos na call ou na apresentação (identidade, thumbs, carrosséis, capas de short,
banner, foto de perfil), a equipe precisa das peças **editáveis no Canva da equipe**, não só a imagem dentro da
apresentação. Este arquivo é lido pela rotina da Máquina do Escritório (`escritorio/TAREFA.md`) quando o card é:

| Card no Entregas | De onde vem |
|---|---|
| `CLIENTE \| EDITÁVEIS NO CANVA (painel)` | Pedido no painel (Ismael, Rômulo ou diretoria), tipo "Editáveis no Canva (cliente aprovou)" |
| `CLIENTE \| EDITÁVEIS NO CANVA` | Criado à mão ou por outra máquina depois de uma aprovação |

**Só depois da aprovação.** Se a Obs não diz o que foi aprovado e não há sinal de aprovação (grupo do WhatsApp, card
Aprovado, anotação da call), marque **Falta informação** com "O que o cliente aprovou e em qual call/apresentação?".

## O que entra (cada peça vira um design separado no Canva)
| Peça | Tamanho | Modelo base no Canva (pasta `Clientes › _Modelos base (máquina)`) |
|---|---|---|
| Thumb (uma por modelo aprovado: A, B, C...) | 1280x720 | `DAHZ3dSo3dc` |
| Carrossel (capa + slides internos aprovados) | 1080x1350 | `DAHZ3fs4VqU` (4 páginas) |
| Capa de short | 1080x1920 | `DAHZ3bsxo0Q` |
| Banner do YouTube | 2560x1440 | `DAHZ3YRh6Es` |
| Foto de perfil | 800x800 | `DAHZ3f_YklE` |

Faça **só as peças aprovadas** (o que a Obs, a apresentação ou o grupo dizem). Na dúvida entre "aprovou" e "mostrou",
faça e escreva no Obs quais foram consideradas aprovadas.

## Fonte da verdade (nessa ordem)
1. A apresentação aprovada (link na Obs ou no card da call; HTML em `/mnt/project-files/<cliente>/...` ou no Drive).
   Cores, textos e fotos **iguais aos da apresentação**. Exemplo: Izaias seguiu a apresentação da call do clone.
2. Fontes das peças em `/mnt/project-files/<cliente>/**/_fonte/` (HTML + PNG de cada peça, recortes `recorte-*.png`,
   fundos). É daí que saem o texto, as cores e as imagens.
3. Ficha do cliente: "Identidade carrossel (IA)", "Identidade shorts (IA)", "Direção criativa", manual de marca no Drive.

## Passo a passo
1. **Pasta do cliente no Canva**: `search-folders` com o nome do cliente dentro de `Clientes` (`FAHXPENKZJw`).
   Não existe? `create-folder` com o nome do cliente (igual ao da ficha) e parent `FAHXPENKZJw`.
2. **Imagens para o Canva** (fotos recortadas, fundos, logo). O proxy da nuvem bloqueia canva.com, então o arquivo
   vai pela ponte do n8n:
   1. Ponha os PNG/JPG no branch de trabalho em `editaveis/<slug-do-cliente>/` e faça push.
   2. Para cada arquivo: `create-upload-url` (Canva) → `execute_workflow` (n8n) no fluxo
      **"Utilitário | Arquivo do repositório para o Canva"** (`Tf552vzGSLJAmiK7`), `executionMode: "manual"`, entrada
      webhook com body `{caminho, branch, upload_url}`. Um link de upload vale uma vez só.
   3. `get_execution` com `includeData: true` e `nodeNames: ["Resumo"]`; a saída é grande e vai para arquivo:
      leia com `jq '.data.resultData.runData["Resumo"][0].data.main[0][0].json'`. Use o `mediaId`.
   - Imagem sobe como mídia (`mediaId`). PDF sobe como arquivo solto e **não** vira design: não use PDF.
   - Fundo com degradê ou textura: gere um PNG só do fundo (HTML da peça sem textos e sem foto, Playwright) e suba.
3. **Cada peça**: `copy-design` do modelo base → `read-design` com `open_transaction: true` e `thumbnails` →
   `edit-design`:
   - `update_title`: `[NOME DO CLIENTE] TIPO TEMA [EUFORIA]` (ex.: `[IZAIAS ROBERTO] THUMB TERAPIA TEM FIM [EUFORIA]`),
     padrão que a equipe já usa no Canva.
   - Fundo: `update_fill` no locator da página com o `mediaId` do fundo.
   - Foto: `update_fill` no retângulo de imagem do modelo com o recorte do cliente. Apague enfeites do cliente antigo
     (logo, ícones, selos) com `delete_element`.
   - Textos: `replace_text` com o texto aprovado, `format_text` com as cores da apresentação; `resize_element` na
     largura (texto curto em caixa estreita quebra letra por letra).
   - Selo/tarja: `insert_shape` (retângulo na cor de destaque) + `layer_element` "back" para ficar atrás do texto.
   - Confira a miniatura que volta de cada `edit-design`; corrija o que quebrou; só então `finalize: "commit"`.
4. `move-item-to-folder` de cada design para a pasta do cliente.
5. **Registro**:
   - Ficha do cliente: campo **"Canva (editáveis)"** = link da pasta (`https://www.canva.com/folder/<id>`). É ele que o
     painel mostra no botão "Editáveis no Canva".
   - Card: Link do arquivo = link da pasta; Status **Em revisão**; "🏢 Escritório IA" = Feito pela IA; topo do Obs
     `[Escritório dd/MM HH:mm] Editáveis no Canva: <lista das peças com o link de edição de cada uma>`.
   - Aviso curto no #dia-a-dia (como os outros cards da máquina), marcando quem pediu.

## Limites conhecidos (03/11/2026)
- O conector não troca a **família da fonte**: o texto fica na fonte do modelo base (Canva). Cores, tamanhos,
  negrito, textos, fotos e posições ficam iguais aos aprovados. Se o cliente tem fonte própria obrigatória (manual de
  marca), escreva no Obs: "Trocar fonte para <fonte> no Canva (1 clique em cada texto)".
- Não dá para importar PDF como design pela API (o PDF vira arquivo solto). Por isso as peças são montadas no Canva a
  partir dos modelos base, e não importadas.
- Peça com muitos elementos (ex.: carrossel de 6 slides) pode ser feita em partes: deixe "Fazendo (IA)" e anote no
  Obs quais peças faltam.
- Editáveis ficam no Canva **interno** da equipe. Cliente sem pagamento confirmado pode ter editáveis (são internos),
  mas nada sobe no Drive dele.
