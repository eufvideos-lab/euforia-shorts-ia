# Identidade visual do canal + apresentação da call audiovisual (parte da Máquina do Escritório)

Este arquivo é lido pela rotina da Máquina do Escritório (`escritorio/TAREFA.md`) quando o card da fila é um destes,
criados pelo setup de cada cliente novo:

| Card no Entregas | Tipo | O que entregar |
|---|---|---|
| `ID DO CANAL (BANNER E CAPA)` / `ID DO CANAL (BANNER, CAPA E FOTO)` | ID visual | Kit de identidade (item A) |
| `ANTES E DEPOIS DO CANAL (IMAGEM PARA APROVAR)` | ID visual | Simulação do canal hoje x depois (item B) |
| `MODELO DE CARROSSEL` | Outro | Capa + 1 slide interno na identidade nova (item A, peças 4 e 5) |
| `CALL DE CONSULTORIA AUDIOVISUAL` / `CALL DE APROVAÇÃO (...)` | Outro | Apresentação da call (item C) |

Esses cards chegam ao Escritório depois que o cliente responde o formulário de onboarding. Se o formulário ainda não
foi respondido (ficha sem relação "Onboarding" ou página de respostas vazia), marque **Falta do cliente** com
"Aguardando o formulário de onboarding".

## Antes de desenhar (contexto obrigatório)
1. Ficha do cliente: nome do canal, nicho, "Direção criativa (gosta / não gosta)", "Identidade shorts (IA)",
   "Identidade carrossel (IA)", "Resumo do contrato", "Drive".
2. Respostas do formulário de onboarding (relação "Onboarding" da ficha): público, tom, referências, cores e fontes
   que o cliente pediu, fotos enviadas.
3. Dossiê da Call 1 (subpágina da ficha "Dossiê e roteiro da Call 1 · Nome") e, se a Call 1 já aconteceu, as
   "Anotações do Gemini" dela no Drive.
4. Manual de marca, se existir, na pasta do cliente no Drive (MATERIAIS VISUAIS › MARCA). Se existir, **ele manda**:
   use as cores e fontes dele, não invente outras.
5. Fotos do cliente: pasta do cliente no Drive (FOTOS, MATERIAIS VISUAIS ou ARQUIVOS BRUTOS). Sem foto boa: faça a
   versão sem foto (monograma/tipografia) e escreva no Obs "Trocar pela foto do cliente quando chegar".

Paleta: 1 cor de fundo, 1 de destaque, 1 de apoio, texto claro/escuro com contraste bom. Nunca o laranja Euforia.
Fontes só do Google Fonts (1 de título + 1 de texto). Grave a paleta escolhida no campo "Identidade carrossel (IA)"
e "Identidade shorts (IA)" da ficha **só se estiverem vazios** (formato: `fundo #xxxxxx, destaque #xxxxxx, apoio
#xxxxxx, texto #xxxxxx; títulos <Fonte>, texto <Fonte>`), para as outras máquinas usarem as mesmas cores.

## A. Kit de identidade (HTML → PNG)
Monte uma pasta de trabalho com um `base.css` (variáveis da paleta + fontes) e um HTML por peça, no padrão de
`exemplo-ana-bastos/` (é só referência de estrutura e acabamento; a identidade de cada cliente é nova).

| # | Peça | Arquivo | Tamanho | Regras |
|---|---|---|---|---|
| 1 | Banner do YouTube | `banner-youtube-2560x1440.png` | 2560×1440 | Tudo que importa dentro da área segura central 1546×423 (left 507, top 508). Nome, promessa curta, foto/busto. |
| 2 | Foto de perfil | `foto-perfil-800x800.png` | 800×800 | Legível em círculo pequeno: rosto do cliente ou monograma. |
| 3 | Thumbs modelo (3 estilos) | `thumb-modelo-a/b/c.png` | 1280×720 | A autoridade, B contraste, C passo a passo. Texto grande (até 5 palavras), rosto quando houver. |
| 4 | Capa de carrossel | `carrossel-capa-1080x1350.png` | 1080×1350 | Mesma linguagem do banner. |
| 5 | Slide interno de carrossel | `carrossel-slide-interno-1080x1350.png` | 1080×1350 | Texto corrido legível, numeração. |
| 6 | Prancha da identidade | `Identidade visual - <Nome>.pdf` + `.png` | 1600 × altura livre | Conceito em 2–3 linhas, paleta com hex, tipografia, aplicações (miniaturas das peças 1–5). |

Render: `(cd carrossel && npm ci)` uma vez, depois escreva um `jobs.json`
(`[{"html": ".../banner.html", "w": 2560, "h": 1440, "out": ".../banner-youtube-2560x1440.png"}, ...]`; prancha
com `"h": 0, "pdf": true` e outro job igual sem `pdf` para o PNG) e rode
`node escritorio/identidade/render.mjs jobs.json`. Abra cada PNG e confira: texto cortado, foto deformada, contraste,
erro de português, área segura do banner.

## B. Antes e depois do canal
Uma imagem 1600×900 (`antes-e-depois-canal.png`) com duas metades: **Hoje** (print ou reconstrução do canal atual:
banner, foto, nome, 3 vídeos com as thumbs atuais, a partir do link "YouTube" da ficha) e **Com a nova identidade**
(mesmo layout usando as peças do kit, no modelo de `exemplo-ana-bastos/yt.html`). Sem números do canal (inscritos,
views): use "—". Se o kit ainda não existe, faça o kit primeiro (mesma rodada).

## C. Apresentação da call de consultoria audiovisual (ou call de aprovação, no plano com clone)
Slides HTML 1920×1080 com notas do apresentador (o Rômulo usa na call; pode ficar como artifact, não precisa PDF).
Ordem:
1. Capa (nome do cliente, "Consultoria audiovisual").
2. Recapitulando a Call 1 (3–4 pontos do dossiê / anotações).
3. Identidade visual nova: conceito, paleta, banner, perfil, thumbs (peças do kit).
4. Antes e depois do canal.
5. Modelo de carrossel.
6. Pautas para aprovar (as do card "PAUTAS DO SETUP", se já existirem no 🎬; senão slide "[a confirmar: pautas]").
7. Consultoria audiovisual: luz, áudio, enquadramento, cenário, como gravar (roteiro em tópicos, teleprompter, olhar
   para a câmera), kit de equipamentos sugerido (sem preços). No plano com clone: troque por "vídeo teste do clone".
8. Próximos passos com as datas dos cards do cliente no Entregas (nunca invente data).
9. Slide de feedback "O que vocês estão achando do Grupo Euforia até agora?".
10. Obrigado.

## Onde guardar e como fechar o card
- Pasta do cliente no Drive › `MATERIAIS VISUAIS › IDENTIDADE VISUAL` (crie a subpasta se não existir) com todos os
  PNG/PDF, via `ponte.subir`. A apresentação vai no mesmo lugar (HTML) e, se você tiver a ferramenta, como artifact.
- Um card por entrega: Link = pasta/arquivo, Obs com o que conferir, Status **Em revisão**, "🏢 Escritório IA" =
  Feito pela IA. Kit, antes e depois e modelo de carrossel podem sair na mesma rodada (contam como 1 dos 3 cards).
- O aviso no #dia-a-dia segue o passo 4 do `TAREFA.md`. A equipe revisa e apresenta ao cliente na call; nada vai
  direto para o cliente.
