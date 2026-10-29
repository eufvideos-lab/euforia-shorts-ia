# Situação completa e Cronograma do cliente (Máquina do Escritório)

Dois pedidos que o Ismael, o Rômulo e a diretoria fazem pelo painel ("Pedir ao escritório"):

| Card no Entregas | Entrega |
|---|---|
| `<CLIENTE> \| SITUAÇÃO COMPLETA (painel)` | PDF "Situação completa do cliente": contrato x entregue, combinados das calls e do grupo, o que falta do cliente, diferenças venda/contrato, Notion/Drive desatualizados, **demandas com dono, como fazer e prazo**, próximos 7 dias e riscos. |
| `<CLIENTE> \| CRONOGRAMA (painel)` | PDF "Cronograma do cliente": a conta do contrato (fecha ou não), marcos, rotina da semana e **semana a semana até o fim do contrato**. |

A Obs pode trazer `Foco: <texto>`: é a dúvida de quem pediu. Responda a ela primeiro (na "Leitura do escritório" ou nos
alertas) e deixe o resto completo do mesmo jeito.

O visual é fixo: você só monta o JSON e roda o gerador.
```
python3 escritorio/diagnostico/gerar.py /tmp/<cliente>-situacao.json /tmp/<cliente>-situacao.pdf
```
(precisa de node com playwright; na máquina da rotina rode antes `cd carrossel && npm ci` se `carrossel/node_modules` não existir).
Exemplos completos e reais: `exemplo/situacao-polyana.json` e `exemplo/cronograma-polyana.json`. **Copie a estrutura
deles**; o nível de detalhe deles é o mínimo aceitável.

## 1. Juntar tudo (as duas entregas usam a mesma coleta)
Leia **inteiro**, não amostra:
1. **Ficha do cliente** (banco Clientes): Resumo do contrato, checklist, campos de identidade, postagem, Drive, grupo,
   Obs importante, data de entrada. Se o resumo do contrato estiver vazio, procure o PDF no Drive do cliente ou em
   Central do Flau › 📄 Contratos.
2. **Entregas** ligadas ao cliente (campo "Entregas" da ficha, abra cada card): status, prazo, Obs.
3. **🎬 Pautas e Roteiros** do cliente: quantos existem, status (escrito, enviado, aprovado, gravado).
4. **Calls**: no Drive, `title contains '<nome>' and title contains 'Gemini'`. Leia só a parte **antes de
   "Transcrição"** (resumo, decisões, próximas etapas, detalhes), com `read_file_content`; se o resultado for grande,
   corte o texto em "Transcrição". Inclua a call de venda ("Framework de Crescimento"): é onde está o que foi
   **prometido na venda**. Call sem anotação: diga isso nas fontes.
5. **Grupo do WhatsApp** (`buscar_conversas` → `ler_mensagens`, desde a entrada do cliente; mínimo 60 dias). Se o
   resultado for grande e cair em arquivo, leia o arquivo inteiro em Python, tirando mensagens duplicadas.
   Separe: o que o cliente pediu, o que a equipe prometeu (com data), o que o cliente mandou, o que ficou sem resposta.
6. **Drive do cliente**: pastas da raiz e as principais (ARQUIVOS BRUTOS, ELEMENTOS ESSENCIAIS, VÍDEOS EDITADOS).
   Aponte pastas vazias, duplicadas ou arquivos soltos.
7. **Calendário**: hoje, feriados nacionais no período (Finados 02/11, Consciência Negra 20/11, Natal, Ano Novo,
   Carnaval, Tiradentes, 1º de maio, Corpus Christi, 7/9, 12/10, 15/11), dias em que o cliente disse que pode gravar.
Se uma call aconteceu nas últimas 3 horas e ainda não tem anotação, avise isso em `fontes_sub` (o pedido pode ser
refeito depois).

## 2. Situação completa: como pensar
- **Leitura do escritório** (3 a 4 parágrafos curtos): onde o cliente está no contrato (dia X de Y), o que andou, o
  que travou, **qual é o gargalo de verdade** (cliente, equipe, máquina, decisão da direção), se a conta do contrato
  fecha e o clima do cliente no grupo. É a parte mais importante: escreva como um gerente de projeto que leu tudo.
- **Alertas**: no máximo 5, os que mudam o resultado nesta semana. Vermelho (`atr`) = trava entrega ou contrato;
  amarelo (`ate`) = precisa de ação logo.
- **Contrato x entregue**: uma linha por item do contrato, com o número feito (contado no Entregas, no Drive e no
  grupo). Status: `ok`, `andamento`, `atencao`, `atrasado`, `cliente` (aguardando cliente), `nao_iniciado`,
  `decidir` (direção decide).
- **Combinados** (`promessas`): toda promessa com data, de calls e do grupo, dos dois lados, com situação atual.
  Inclua o que foi dito na **venda**.
- **O que falta do cliente**: item, quando foi pedido, e como destravar.
- **Diferenças**: venda x contrato x calls (ex.: bônus dito na venda, prazo de implementação, quem posta onde).
  Sempre com "como seguir". O contrato manda; o que não estiver nele vai para `decidir`.
- **Notion e Drive desatualizados**: campo da ficha errado ou vazio que as máquinas usam, card com status velho,
  pasta duplicada. Diga a correção.
- **Demandas** (o coração do documento): numeradas, agrupadas por quem faz:
  - `Rômulo` (grupo, calls, mensagens ao cliente), `Ismael` (Drive, Notion, revisão, postagem),
    `Ismael · pedir à máquina` ou `Rômulo · pedir à máquina` (escreva **exatamente** o caminho no painel:
    "Painel › Pedir ao escritório › Thumb, Quantos = 6, Tema: ..."), `Escritório` (o que a máquina do escritório
    faz sozinha), `Direção` (decisões).
  - Cada demanda: o quê, como fazer (1–2 frases práticas), prazo com dia da semana ("Qui 29/10") e prioridade
    (`alta`, `media`, `baixa`). Prazo interno, nunca domingo; nada vira promessa ao cliente.
  - Vídeo longo, shorts e carrossel **sempre** vão como pedido à máquina pelo painel, nunca "editar à mão".
- **Próximos 7 dias**: dia a dia, a partir de hoje.
- **Riscos**: risco, sinal que já aparece, como evitar.
- **Números da capa** (4): dia do contrato, principal entrega feita/contratada, pendências do cliente, demandas.
- **Semáforo**: `verde` (no trilho), `amarelo` (precisa de ação), `vermelho` (contrato em risco). Frase de 1–2 linhas.

## 3. Cronograma: como pensar
- **Premissas**: de onde vêm as quantidades, o ritmo combinado (call de consultoria/oferta), dias em que o cliente
  grava, regra D-3 (peça pronta 3 dias antes de postar), nada em domingo, dia de postagem (se não definido, diga).
- **A conta fecha?**: para cada item, contratado, feito, quanto este cronograma planeja, folga em semanas. Conte as
  semanas reais que restam até o fim do contrato. Se não fecha, proponha como fechar (estreia dupla, lote extra,
  semana com 2) como recomendação para a Direção (`decidir`), nunca como fato.
- **Marcos**: gravações (em lotes, com estoque antes de feriados), estreia, página/funil no ar, início do TikTok,
  relatórios e calls de alinhamento (1 por mês se o contrato não disser), pautas e roteiros do próximo lote (pedir
  4 semanas antes da gravação), conversa de renovação (30–45 dias antes do fim), fim do contrato.
- **Rotina da semana**: quem faz o quê em cada dia.
- **Semana a semana**: da semana atual até a última do contrato. Colunas: gravar (lote do cliente), vídeo longo
  (número e título do roteiro), shorts, carrossel, observação (feriado, marco, call). Use `mes` para separar meses.
- **Cuidados**: o que derruba o cronograma.

## 4. Regras
- Documento **interno**: pode ter nomes da equipe e números absolutos; **nunca** valores, preços, parcelas,
  financeiro ou jurídico (nem o que foi dito de preço na venda). Nunca o nome do Henrique.
- Nada inventado: toda data, quantidade e promessa precisa ter fonte (ficha, card, call ou mensagem com data).
  O que não achou vira "Sem registro" + quem confirma.
- Datas sempre com dia/mês (e dia da semana nos prazos). Ano só quando muda.
- Se o cliente não tem contrato no Notion nem no Drive: **Precisa da Direção** ("sem contrato para comparar").

## 5. Entregar
1. Gere o PDF (nome: `Situação completa - <Cliente> - dd-mm.pdf` ou `Cronograma - <Cliente> - dd-mm.pdf`).
2. Suba no Drive do cliente com a ponte (`ponte.subir(pdf, <id da pasta>, <nome>)`, ver Endereços fixos da TAREFA):
   na pasta `00 - DIAGNÓSTICOS E CRONOGRAMAS` se ela existir, senão na raiz da pasta do cliente (campo "Drive" da
   ficha; sem ele, a pasta "NN - NOME" em CLIENTES).
3. Card: "Link do arquivo" = `https://drive.google.com/file/d/<id>/view` (o painel mostra "Baixar PDF"), Status **Em revisão**,
   "🏢 Escritório IA" = **Feito pela IA**. No topo da Obs: `[Escritório dd/MM HH:mm] Situação completa pronta:
   <a frase do semáforo>. <n> demandas.` (ou "Cronograma pronto: ...").
4. No corpo do card, seção "## 🏢 Entrega do escritório (Máquina do Escritório, dd/mm)" com a Leitura do escritório
   e a lista de demandas em texto (para quem não abrir o PDF).
5. **Não** crie os cards das demandas sozinho: quem pediu decide. Exceção: nenhuma.
6. Aviso no #dia-a-dia na mensagem da rodada, marcando quem pediu.
