# Painel da Equipe (V1, rascunho)

Tela da equipe por cima do Notion. O Notion continua sendo o banco (Entregas, Clientes, Equipe); a equipe só aperta botões.

- `painel.html`: a página. Abre com `?u=<token>` e pede o PIN de 4 números. `?demo=1` mostra dados de exemplo e não envia nada.
- `fluxos/`: os 4 fluxos do n8n (código do Workflow SDK).
  - `fila.js` → "Painel | Fila da equipe (V1)": devolve os cards da pessoa conforme o papel (editor, revisor, calls, teste).
  - Pedir ao escritório: só revisor, calls, diretor e teste. Editor não vê a aba e o `pedido.js` recusa (decisão do Henrique em 26/10/2026).
  - Passar para: Ismael, Rômulo e diretoria trocam o Responsável do card para Victor, Lorena, Daniel ou Escritório (botão na gaveta do card, `acao: 'passar'` no `acao.js`). Aviso no #dia-a-dia marcando a pessoa.
  - Fila de demandas: `fila.js` manda também os cards abertos sem Responsável de vídeo longo, shorts, podcast, carrossel e thumb (`livre`); `acao.js` ação `pegar` (vira Responsável; limite de 8 em produção; aviso no #dia-a-dia).
  - Anexos no Pedir ao escritório: arquivos sobem pelo `arquivo.js` em modo `pedido` (pasta PEDIDOS DO PAINEL do cliente, até 5 GB cada, 10 por pedido) e os links entram na Obs do card pelo `pedido.js`.
  - Não é comigo / Já foi feito: quem é Responsável sai do card (`naoemeu`, aviso ao Ismael e Rômulo) ou marca Postado/Cancelado (`jafeito`), sempre com motivo obrigatório.
  - `responder.js` → "Painel | Responder cliente (V1)": Ismael e Rômulo respondem pela aba Responder. Sai pelo número de suporte da pessoa se conectado e no grupo; senão pelo "suporte" com "*Nome:*" na frente. Assunto de diretoria é recusado.
  - `acao.js` → "Painel | Botões da equipe (V1)": Comecei, Mandar para revisão, Aprovar, Pedir ajuste, Agendei, Postei. Cada botão só vale para quem pode e na etapa certa.
  - `arquivo.js` → "Painel | Envio de arquivo da equipe (V1)": abre o envio direto ao Drive (pasta do cliente › ENTREGAS DO PAINEL) e confere no fim.
  - `diretor.js` → "Painel | Diretor (V1)": só o papel diretor. Visão de todos os cards e da equipe, editar qualquer campo, criar card, ver as mensagens que a equipe mandou nos grupos de cliente, aba Clientes (`acao: 'clientes'`: ficha, contrato lido do "Resumo do contrato", feito x total desde o início do contrato, abertos, postados do último ano e última conversa no grupo) e mudar clima, risco, recuperação, atenção e próximo alinhamento da ficha (`acao: 'ficha'`).
  - `formularios.js` → "Painel | Formulários dos clientes (V1)": aba Formulários do Ismael, do Rômulo e da diretoria. Lê o banco 📝 Onboarding · Respostas e devolve as respostas legíveis, com links (YouTube, Instagram, fotos) e arquivos. Só leitura; respostas de teste só aparecem para o usuário de teste. No ar desde 29/10/2026 com OK da diretoria (`FORMULARIOS_NO_AR = true`).
  - `central.js` → "Painel | Central de Demandas (V1)" (webhook `euforia-painel-central`): aba Central de Demandas do Ismael, do Rômulo e da diretoria. `ver` devolve todas as demandas abertas do Entregas (A fazer, Fazendo, Ajustes) em ordem de prioridade (atraso, prazo, dia de ir ao ar, 🔴, SOS, clima, faixa, urgente, recuperação, fim de contrato; a equipe vê "Cliente sensível" e "Fim de contrato perto", só a diretoria vê clima e dias de contrato), onde cada uma está e a sugestão de destino; as previstas da semana (ritmo da ficha menos os cards que já existem); a fila e quanto cabe hoje em cada máquina (pelos horários das rotinas) e a carga de cada pessoa. `mandar` manda um card (ou cria o card de uma prevista, prazo D-3) para a máquina (longo e shorts pedem link; cria o pedido no quadro como o Pedir ao escritório), para Victor, Lorena, Daniel, Ismael ou Rômulo (aviso no #dia-a-dia) ou "eu faço" (diretoria = À mão (Flau)). Linha `[Central dd/MM HH:mm]` no topo da Obs. No ar desde 01/11/2026 com OK da diretoria (`CENTRAL_NO_AR = true`).
  - `grade.js` → "Painel | Grade de postagem (V1)": aba Grade. Todos marcam cada horário como Programado (cinza) ou Postado (laranja) naquela data (`acao: 'marcar'`, tabela n8n "Painel · grade marcações", uma linha por horário+data; clicar de novo desmarca). Navega de 2 semanas atrás até a próxima.
  - `pedido.js` → "Painel | Pedido ao escritório (V1)": cria card no Entregas para o Escritório (Flau + IA), automático ou à mão.

Acesso: tabela do n8n "Painel equipe · acesso" (token, PIN, nome, ficha, papel, ativo). Token e PIN nunca vão para o Notion, Discord ou este repositório.
Papel diretor (Henrique): no mesmo link do painel ganha Visão geral (com calls de hoje e amanhã e a apresentação de cada uma, apresentações pendentes e pedidos parados por falta de informação), Clientes (clima, mês do contrato, quanto já foi entregue do total, atrasados, última postagem e conversa no grupo; gaveta com detalhes e edição da ficha), Por pessoa, Todos os cards e Mensagens da equipe; a "Minha fila" vira a fila do Escritório e ele revisa, posta e mexe na grade como o Ismael.
O usuário de teste só enxerga e mexe em cards com "TESTE PAINEL" no título, e não avisa no Discord.

Nada aqui está publicado. Publicar os fluxos e subir a página (slug `equipe`) só com OK do Henrique.

## Falta informação (Máquina do Escritório devolve o pedido)
Quando um pedido ao escritório não dá para fazer, a máquina põe o Responsável = quem pediu, "🏢 Escritório IA" = "Falta informação" e uma linha "[Escritório dd/MM HH:mm] Falta informação: ..." no topo da Obs, e marca a pessoa no #dia-a-dia.
No painel o card aparece no topo da Minha fila (grupo "Falta informação para o escritório", faixa vermelha) com o que falta. O botão "Completar pedido" abre o campo de texto (obrigatório), arquivos (vão para PEDIDOS DO PAINEL na pasta do cliente) e links. O fluxo de botões (ação `completar`) grava tudo na Obs e devolve o card ao Escritório com "Na fila".

## Resultados (Máquina de Resultados, V1, NO AR 02/11/2026 com OK do Henrique)
- Aba "Resultados" (Ismael, Rômulo, diretoria; teste só vê cliente TESTE) atrás de `RESULTADOS_NO_AR = false`.
- Fluxo n8n "Painel | Resultados (V1)" (`fluxos/resultados.js`, webhook euforia-painel-resultados), NÃO publicado.
- Tabela n8n "Resultados · vídeos" (BezGvdw9Xrsv4ZNw): uma linha por vídeo. Orgânico = total − ativação.
  Orgânico x ativação, campanha, piloto, verba, gasto e custo por view só para a diretoria (o fluxo não devolve nem
  deixa a equipe mudar). Equipe vê views totais e o que o cliente contou.
- Para pôr no ar: publicar o fluxo, trocar a constante para `true` e subir a página (mesma rotina das outras abas).

## Estreias do canal (Vídeo 1) · NO AR 02/11/2026 (OK do Henrique)
- Fluxo "Painel | Estreias (V1)" (`fluxos/estreias.js`), tabela "Painel · estreias" (uma linha por cliente).
- Rômulo, Ismael e diretoria marcam dia e hora do Vídeo 1 na Reunião de Lançamento (grade › YouTube › "+ Marcar estreia").
  Mínimo 7 dias à frente; abaixo de 14 o painel avisa. A diretoria pode marcar qualquer data.
- O Vídeo 1 aparece destacado (🚀) na grade de todo mundo.
- Só a diretoria vê: bloco "Lançamentos" na Visão geral (21 dias antes até o dia seguinte) e o checklist do lançamento
  (mensagens, listas, público, verba, vídeo não listado, campanha pausada, anúncio 1–3 h antes, vídeo público).
  A equipe nunca recebe os checks.
- Para ligar: publicar o fluxo e trocar `ESTREIAS_NO_AR` para `true`.
- "Clientes novos sem estreia marcada" (início nos últimos 60 dias, pela data do "Resumo do contrato" ou "Entrada (onboarding)")
  aparece na Visão geral da diretoria e no topo da Minha fila do Rômulo e do Ismael. Se o Vídeo 1 já saiu, marcar a data passada.
- 04/11/2026 perfil novo `producao` (Victor e Daniel): fila igual à de calls (os seus + Aguardando cliente + o que vai ao ar até amanhã + fila de demandas), Postar/Agendei, Pedir ao escritório e Meus pedidos; sem Responder (WhatsApp), Próximas calls, Central, Clientes e Revisão. Rômulo vira `revisor` (aviso de revisão no #dia-a-dia marca o Rômulo); Lorena e Ismael ficam `calls`. "Passar para" agora inclui o Ismael.
- 04/11 (tarde): Victor não atende a Ana Mangia (BLOQUEIO em fila.js, acao.js, grade.js e central.js; erro 'bloqueio'). Victor é assistente de postagem do Daniel: o Agendei/Postei dele deixa o card em Agendado e marca o Daniel no #dia-a-dia; o Daniel confere e marca Postei (ASSISTENTE em acao.js).
