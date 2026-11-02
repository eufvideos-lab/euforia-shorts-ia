# Máquina de Resultados (V1, 02/11/2026)

Objetivo: o cliente (50+, 20+ anos de mercado) **sentir resultado no 1º mês**: views acima do normal nos primeiros
vídeos, contatos chegando pelo WhatsApp dele e tudo medido no painel. Sem custo extra para o cliente.

## As peças

| # | Peça | Quem faz | Onde está |
|---|---|---|---|
| 1 | Mensagens do lançamento pela **lista de transmissão** do cliente | Máquina de Pautas e roteiros escreve; o **cliente envia do celular dele** | `resultados/mensagens-lancamento.md` |
| 2 | **Tour interativo** do WhatsApp (criar a lista e enviar) | Pronto, mandar o link ao cliente | `paginas/lista-de-transmissao.html` → grupoeuforia.com.br/lista-de-transmissao |
| 3 | **Ativação de lançamento** (Google Ads, campanha de vídeo) | Diretoria, à mão, com checklist | `resultados/ativacao-google-ads.md` |
| 4 | Cortes das aulas com thumb forte | Máquina de Shorts (já existe) | `LEIAME.md` da raiz |
| 5 | **Palavra-chave de WhatsApp** no fim de todo vídeo | Máquina de Pautas e roteiros | `escritorio/TAREFA.md` (passo 0) e skill `pautas-e-roteiros-euforia` |
| 6 | **Métricas por vídeo** no painel (orgânico x ativação) | Painel, aba Resultados | `painel-equipe` (aba Resultados) + tabela n8n "Resultados · vídeos" |

## Proibido (vale para todas as peças)
- **Nada de views compradas**: sites de views, robôs, "pacote de 50 views", troca de views. Risco de o cliente perder a
  monetização ou o canal. A única ativação é a campanha oficial do Google Ads.
- **Sem prospecção** para o cliente. O resultado vem da base dele (quem já tem o número dele salvo).
- **A Euforia não conecta nada ao WhatsApp do cliente** (nem QR code, nem disparador). Quem envia é ele, do celular dele.
- Verba, teto e os 3 clientes do piloto são **decisão do Henrique** (projeto de Direção). Ninguém inventa número.
- Equipe não vê verba nem custo. No painel, só a diretoria vê dinheiro.

## Como aparece para o cliente
- Relatório pode mostrar **views totais**. A ativação é apresentada como parte do plano: **"ativação de lançamento
  incluída"**. Nunca chamar de orgânico. O YouTube Studio do cliente mostra a origem "Publicidade do YouTube".
- Internamente (painel) as views ficam separadas: **orgânico** = total − ativação.

## Fluxo por vídeo novo (piloto)
1. Roteiro sai do 🎬 com a palavra-chave e as 4 mensagens da lista já preenchidas (máquina de roteiros).
2. Vídeo editado e aprovado → Ismael posta e cadastra o vídeo na aba **Resultados** do painel (link, palavra-chave).
3. Página nova do vídeo (quando houver) entra no lugar de `[LINK DA PÁGINA]`.
4. Rômulo manda ao cliente, no grupo, as 4 mensagens prontas + o link do tour (com o OK de envio, como sempre).
5. Diretoria sobe a campanha seguindo `ativacao-google-ads.md` e lança verba e views da ativação no painel.
6. Toda semana o Rômulo pergunta no grupo quantas mensagens chegaram com a palavra-chave, respostas da lista,
   reuniões e contratos, e lança no painel.

## Depois do piloto (V2)
- Views totais automáticas pelo n8n (fluxo "YouTube | Dados do canal", falta credencial) em vez de digitar.
- Campanha criada pela API do Google Ads (precisa de token de desenvolvedor aprovado). Conta administradora (MCC)
  quando passar de alguns clientes.
