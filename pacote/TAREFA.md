# Rotina: Maestro do pacote semanal (Grupo Euforia, 25/11/2026)

Pedido do Henrique (25/11/2026, caso Jean Crapanzani): um pedido só, "entrega da semana do cliente X", e a semana
inteira sai junta, completa e conferida: vídeo longo, thumb, SEO, 3 shorts com capa, carrossel, capa de story de
divulgação e os textos do Instagram com o cronograma. "Meu maior erro foi deixar esse maestro sem estar criado."

O maestro NÃO edita nada que outra máquina já faz. Ele abre a pasta da semana, pede às máquinas o que falta (com a
pasta do pacote, ou a subpasta INSTAGRAM, como "Pasta de entrega"), faz só as peças novas (story e textos), junta, confere item por item e só
libera o aviso ao cliente quando a pasta está completa, 48h antes do vídeo no YouTube.
Tudo em português do Brasil. Sem commit nem push.

## Endereços fixos
- Entregas (Notion): collection://932e6b5a-0cef-49f2-a7f5-57052239f8d0 (a fila do maestro são os cards
  `<CLIENTE> | PACOTE SEMANAL · <DIA dd/MM>`, criados pelo fluxo n8n "Pacote | Abrir pacote semanal (V1)")
- Clientes (Notion): collection://44f009f6-e49b-4b88-b155-3e73ee1ab79b
- 🎬 Pedidos de Shorts IA: collection://ee1fefc1-6ee5-4751-92e3-22dab57f7356
- 🖼️ Pedidos de Carrosséis IA: collection://f2c8d9eb-781a-4726-bce4-a9121fcef406
- 🎞️ Pedidos de Vídeos Longos IA: collection://22cfb89c-4bc6-4532-9cd7-8877a59d0125
- Escritório (Flau + IA), ficha na Equipe: 3ea98c0c-dde0-812b-ba06-cba7e4261426 · Ismael: 3ea98c0c-dde0-812d-9cb4-c41ce70df4ae
  · Rômulo: 3ea98c0c-dde0-8129-9709-cf901fac7275 · Lorena: 3ea98c0c-dde0-8163-bd16-f0213b098cb5
- Drive compartilhado EUFORIA MEDIA: 0AGhEQwuC5NyjUk9PVA
- Discord: #dia-a-dia 1556642691410956339 (equipe, curto) · #ia-status 1559987978774777998 (detalhe técnico)
- Regras dos textos: `prompts/textos_instagram.md` · story: `pipeline/story.py` · conferência: `pipeline/pacote.py`
- Fluxo n8n "Utilitário | Locução do clone e arquivos para o Drive (V1)" (Je0BxnMdTeM5P0al, manual,
  body `{"acao":"salvar","url":...,"nome":...,"drive":"0AGhEQwuC5NyjUk9PVA","pasta":...}`): baixa uma URL (export
  do Canva) e salva na pasta do Drive.

## O pacote (o que tem que estar na pasta)
Pasta `PACOTE SEMANAL - <DIA> <dd-mm>` dentro da pasta do cliente (campo "Drive" da ficha), com DUAS subpastas
(pedido do Henrique, 25/11/2026: "na pasta do insta fica só realmente o que o cliente irá usar"):

```
PACOTE SEMANAL - SEX 27-11/
  00 - CONFERÊNCIA.txt               ← fora das subpastas
  visao-geral-01.jpg, comparacao-modelo.jpg   ← fora (visão geral do carrossel é só para a equipe)
  YOUTUBE/
    01 - VÍDEO LONGO - <título>.mp4
    02 - THUMB - <texto>.png
    03 - TÍTULO E DESCRIÇÃO.txt
  INSTAGRAM/
    04 - SHORT N - <título>.mp4 (3) e os textos de cada short
    05 - CAPA SHORT N.png (3)
    06 - CARROSSEL - <título>/  (slide-NN.png + legenda.txt, pronto para postar)
    07 - STORY DE DIVULGAÇÃO.png
    08 - TEXTOS INSTAGRAM E CRONOGRAMA.txt
```

| Arquivo | De onde vem |
|---|---|
| `YOUTUBE/01 - VÍDEO LONGO - <título>.mp4` | card do longo da semana (Link do arquivo) ou pedido de longos ("Vídeo pronto"). Cópia (copy_file com parentId = YOUTUBE). |
| `YOUTUBE/02 - THUMB - <texto>.png` | thumb automática no Canva ("🎨 Thumb no Canva" do pedido de longo), exportada em PNG. Sem Canva: PNG/JPG de thumb na pasta do vídeo. |
| `YOUTUBE/03 - TÍTULO E DESCRIÇÃO.txt` | `título e descrição.txt` ao lado do vídeo (máquina de SEO). |
| `INSTAGRAM/04 - SHORT N - <título>.mp4` (3) | pedido de shorts com "Pasta de entrega" = a subpasta INSTAGRAM (a máquina já entrega lá). |
| `INSTAGRAM/05 - CAPA SHORT N.png` (3) | capas automáticas no Canva ("🎨 Capas no Canva" do pedido de shorts), exportadas em PNG. |
| `INSTAGRAM/06 - CARROSSEL - <título>/` | pedido de carrosséis com "Pasta de entrega" = a pasta do PACOTE (raiz) e nas Observações `Pasta Instagram: <link da INSTAGRAM>`: a máquina põe a subpasta do carrossel dentro da INSTAGRAM e a visão geral na raiz. Se a subpasta cair na raiz, mova para INSTAGRAM (update_file parentId) e renomeie para `06 - CARROSSEL - <título>`. |
| `INSTAGRAM/07 - STORY DE DIVULGAÇÃO.png` | este maestro (`pipeline/story.py`), subido direto na INSTAGRAM. |
| `INSTAGRAM/08 - TEXTOS INSTAGRAM E CRONOGRAMA.txt` | este maestro (`prompts/textos_instagram.md`). |
| `00 - CONFERÊNCIA.txt` | este maestro (`pipeline/pacote.py`), na raiz. |

Arquivo subido pela ponte (`ponte.subir`) **não pode ser movido nem apagado** depois pelo conector do Drive: suba
sempre direto na subpasta certa. Na INSTAGRAM não entra nada que o cliente não vá postar (nada de visão geral,
comparação, JSON, rascunho).

Quantidades vêm da ficha: "Longos por semana", "Shorts por semana" (padrão 3); carrossel = 1 por semana se
"📄 Contratado carrosséis" > 0. Cliente sem longo na semana (ex.: só shorts): passe `--sem-longo` na conferência.

## 1. Ver a fila (gasta pouco)
Cards do Entregas com "PACOTE SEMANAL" no título, Status diferente de "Feito" e "Cancelado", "Postar em" de hoje até
daqui a 9 dias. Sem nenhum: encerre. Ordem: "Prazo" mais perto primeiro (cliente com ⭐ Foco ou 🔴 na frente).
Até 4 pacotes por rodada.

## 2. Para cada pacote
1. Abra o card, a ficha do cliente (Drive, identidade, quantidades, "Direção criativa", "Padrões de edição", Instagram,
   YouTube) e o card do longo da semana (mesmo cliente, Tipo "Vídeo longo"/"Podcast", mesmo "Postar em", não Cancelado).
2. **Pasta:** procure `PACOTE SEMANAL - <DIA> <dd-mm>` na pasta do cliente; se não existir, crie, com as
   subpastas `YOUTUBE` e `INSTAGRAM` (crie as que faltarem). Grave o link no
   card (Link do arquivo) e uma linha no Obs `[Maestro dd/MM HH:mm] Pasta do pacote: <link>`.
3. **Longo:** só entra na pasta **aprovado na revisão** (card do longo em Aprovado/Agendado/Postado, ou pedido de
   longos aprovado). Aprovado? Copie para a pasta com o nome do padrão. Pronto mas ainda em revisão: copie e passe
   `--pendente "Longo aprovado na revisão"` na conferência até aprovar (o pacote não fecha antes disso). Não pronto: confira se há pedido de longo em andamento para esse vídeo; se não houver e houver bruto novo
   em ARQUIVOS BRUTOS, o "Vigia de brutos" já abre o pedido. Sem bruto até o Prazo: Obs "Falta do cliente: bruto do
   vídeo" (o vigia das 14h avisa). Não espere o longo para fazer o resto.
4. **Shorts:** ache o pedido de shorts deste vídeo (Observações com "Pacote: <link do card>" ou "Vídeo bruto"/"editado"
   do mesmo vídeo). Sem pedido e com o longo pronto (ou o bruto): crie em 🎬 Pedidos de Shorts IA: Pedido
   `<CLIENTE> | SHORTS · PACOTE <DIA dd/MM>`, Cliente, Quantidade "3 shorts", Estilo do último pedido do cliente
   (padrão "Institucional"), "Vídeo bruto" (sem bruto inteiro, deixe vazio e ponha o editado), "Vídeo editado",
   "Pasta de entrega (opcional)" = subpasta INSTAGRAM do pacote, Observações `Pacote: <link do card do pacote>` + "Padrões de
   edição" do cliente, Status "Editar". A máquina de shorts entrega na pasta e cria o card das capas sozinha.
5. **Carrossel:** igual, em 🖼️ Pedidos de Carrosséis IA: Pedido `<CLIENTE> | CARROSSEL · PACOTE <DIA dd/MM>`, Pacote
   "1 carrossel", Roteiros = o roteiro do vídeo da semana se houver no 🎬 Pautas e Roteiros (senão vazio e nas
   Observações: "tema = o vídeo da semana: <título>; use a transcrição/título e descrição da pasta"), Pasta de
   entrega = pasta do pacote (raiz), Observações `Pacote: <link do card>` + `Pasta Instagram: <link da
   subpasta INSTAGRAM>`, Status "Criar".
6. **Thumb e capas (PNG):** quando o pedido de longo tiver "🎨 Thumb no Canva" (e o de shorts "🎨 Capas no Canva"),
   exporte em PNG pelo conector do Canva (`export-design`, formato png) e salve na pasta com o fluxo Je0BxnMdTeM5P0al
   (`execute_workflow` modo manual) com os nomes do padrão. Ainda sem link do Canva: siga; a próxima rodada pega.
7. **Story** (assim que houver título e o vídeo OU a thumb):
   ```
   bash instalar.sh
   python3 -c "import sys; sys.path.insert(0,'pipeline'); import ponte; ponte.baixar('<id do vídeo>','pac/<id>/video.mp4')"
   # logo negativo (campo logo_escuro da identidade, id do Drive) e, se houver, a thumb PNG
   python3 pipeline/story.py pac/<id> --identidade '<"Identidade carrossel (IA)" da ficha>' \
       --titulo "<título recomendado do SEO>" (--thumb thumb.png | --video pac/<id>/video.mp4 --texto-thumb "<TEXTO DA THUMB do SEO>") \
       --logo logo-negativo.png [--arroba "@canal"]
   ```
   ABRA o `story.png` e confira: título inteiro, rosto inteiro e de olhos abertos na mini-thumb, nada cortado, cores do
   cliente. Ruim: troque o quadro (`--thumb` com outro quadro) e rode de novo. Suba como `07 - STORY DE DIVULGAÇÃO.png`
   (`ponte.subir`). Identidade vazia: use "Identidade shorts (IA)" (fundo/texto/destaque) montando o JSON
   `{"cores":{"escuro":fundo,"claro":texto,"destaque":destaque},"fontes":{"titulo":fonte,"texto":fonte}}`.
8. **Textos do Instagram e cronograma:** siga `prompts/textos_instagram.md`. Datas só da Grade e do "Postar em". Faça
   assim que houver o SEO do longo; reescreva quando os shorts e o carrossel chegarem (títulos e legenda deles). Suba
   como `08 - TEXTOS INSTAGRAM E CRONOGRAMA.txt` (substitua o anterior: apague o antigo só se foi o maestro que criou).
9. **Conferência:** liste a pasta (Google Drive `search_files` com `parentId`, e as subpastas do carrossel), salve em
   `pac/<id>/listagem.json` e rode
   `python3 pipeline/pacote.py conferir pac/<id>/listagem.json --shorts <n> --carrosseis <n> --cliente "<nome>" --titulo "<DIA dd/MM>" --saida "pac/<id>/00 - CONFERÊNCIA.txt" [--pendente "..."]`
   Suba o `00 - CONFERÊNCIA.txt`. Escreva no Obs do card a linha `[Maestro dd/MM HH:mm] <OK n/N> falta: ...`.

## 3. Completo
Quando a conferência der `"completo": true`:
- Card do pacote: Status "Em revisão", Revisor = Ismael (confere a pasta toda antes de ir ao cliente), "🏢 Escritório IA"
  = "Feito pela IA".
- Crie o card de envio: `<CLIENTE> | ENVIAR PACOTE DA SEMANA (<DIA dd/MM>)`, Tipo "Outro", Responsável Rômulo,
  Status "A fazer", Prazo = hoje, "Postar em" = dia do longo, Obs com o texto pronto (formato do grupo, parágrafos com
  linha em branco, assinatura da Érica, sem citar IA nem a diretoria):
  `Olá, <primeiro nome>! Tudo bem?` / `O material da semana já está na pasta: vídeo de <dia>, thumb, 3 reels com capa,
  carrossel, story de divulgação e as legendas com o cronograma.` / `<link da pasta>` / `Qualquer ajuste, é só falar
  por aqui.` / `Érica, time de suporte, Grupo Euforia`.
  O Rômulo manda pelo PAINEL (aba Responder), nunca fora dele. O maestro nunca manda nada ao cliente.
- Cliente com "✋ Aprova antes de postar": o card de envio vale como o envio para aprovar (Grade).

## 4. Atrasado
No dia do "Prazo" (D-2) a partir das 14h, pacote incompleto: aviso curto no #dia-a-dia marcando o guardião do cliente
(🛡️ Guardião; vazio = Rômulo) e o Ismael: "📦 Pacote de <cliente> (<DIA dd/MM>) incompleto: falta <itens>. Pasta:
<link>." Um aviso por pacote por dia. Item que depende do cliente (bruto, aprovação) vai como "falta do cliente".

## Regras
- Nunca mande nada para cliente. Nunca invente data, título, link, preço ou promessa.
- Não refaça peça que outra máquina faz: peça a ela. Não apague arquivo que não foi o maestro que criou.
- Não mexa em pedidos de outras máquinas além de criar o pedido do pacote.
- Erro: só "deu erro, a diretoria está resolvendo" para a equipe; detalhe no #ia-status.
- Notion arrumado: nada de página solta. Credenciais e URLs de webhook nunca aparecem em Notion, Discord ou log.
