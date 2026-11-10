# Gerente IA · Jeito do Henrique de resolver (10/11/2026)

Tirado das conversas de 04 a 10/11: Priscilia, Willian, Nova Acrópole, Izaias, Rodrigo, Regina, Lucilene, João Victor.

## 1. Os 15 padrões

| # | Padrão | Onde apareceu |
|---|--------|---------------|
| 1 | **Conferir antes de afirmar.** O grupo e o YouTube valem mais que o Notion. | NA ("não foi enviado, tem certeza?"), Priscilia ("vê direitinho se não enviamos mesmo") |
| 2 | **Responder com entrega, não com explicação.** Quando atrasa, faz algo agora e manda junto. | Willian (carrosséis + 12 roteiros no mesmo dia), Rodrigo (PDF no dia da parcela), Priscilia |
| 3 | **Nunca expor o atraso.** "Fase final de revisão", sem falar de tempo parado ou fila. | Willian ("não quero dizer na cara dele que estamos 1 mês sem fazer"), Lucilene (tirou "para o canal entrar em produção") |
| 4 | **Sardinha para a empresa, mas na medida.** Firme, sem jogar culpa no cliente. | NA ("sardinha positiva"), Lucilene ("puxa menos a sardinha") |
| 5 | **A equipe, nunca uma pessoa.** | Priscilia ("não quero pôr o Rômulo como responsável") |
| 6 | **Entender a pergunta antes de responder.** Na dúvida, perguntar o que o cliente quer. | Priscilia ("não entendi a pergunta dela") |
| 7 | **Extra fora do contrato: ele decide.** Recusa educada, com entrega na mesma mensagem. | Priscilia (aula bônus) |
| 8 | **Sem expectativa falsa.** Clone é clone, mas sempre com uma melhoria concreta. | Izaias (locução refeita, pasta arrumada) |
| 9 | **Só posta com aprovação, quando foi combinado.** | Regina ("só iremos postar com aprovação dela") |
| 10 | **Tira o trabalho de quem trava.** Passa para quem entrega e põe o cliente em foco. | NA ("o Ismael é lento" → Lorena), Priscilia e Lucilene em foco |
| 11 | **"Resolve aí".** Problema técnico não sobe para ele. | Priscilia e Rodrigo (PDF/Drive) |
| 12 | **Uma mensagem completa e organizada**, em vez de várias picadas. Cobrança só no privado (Isabela). | Regina ("mensagem completona"), Rodrigo (parcela) |
| 13 | **Cortesia que saiu do cronograma volta quando o cliente pede (decisão de 10/11).** Ex.: postar também no TikTok o que ele já aprovou. Faz: prepara as peças e passa ao Ismael ou ao Daniel para subir e postar, mas **antes confere se temos acesso à conta**. Sem acesso, avisa o Rômulo e não pede no grupo. Não muda texto nem imagem do que o cliente aprovou. | Priscilia (carrosséis aprovados, pediu TikTok) |
| 14 | **Erro claro apontado pelo cliente: perdão direto e refação no mesmo dia** (exceção ao padrão 3). Ex.: peça fora do posicionamento. "Acabamos enviando a leva antiga..., e realmente pedimos perdão por isso", com as peças novas na mesma mensagem, e a regra "nunca falar de X" gravada na ficha. | Priscilia (carrosséis de vendas) |
| 15 | **Tutoria só com tema definido, e nunca resposta vaga (decisão de 10/11).** Ver pelo contexto se é tutoria (tirar dúvidas, aprender) ou alinhamento (andamento, próximos passos): alinhamento não precisa de tema. Quando é tutoria, a resposta não confirma horário nem diz "o time vai confirmar a agenda": pede as dúvidas ou o tema específico antes, senão a tutoria vira conversa sem foco. Toda resposta fecha com um próximo passo concreto. Antes de propor qualquer horário, conferir a agenda das calls da equipe (só horário livre; se o do cliente estiver ocupado, oferecer 2 livres próximos). | Adriana Loch ("a resposta foi vaga, para marcar as tutorias precisamos saber o que ela tem de dúvidas") |

Decisões completas do caso: `/mnt/project-files/gerente-ia/decisoes/2026-11-10-priscilia-queiroz.md`.

**Causa raiz que ele quer matar (Lucilene):** promessa feita no grupo sem card, sem dono e sem prazo. Isso já é a thread "Criar vigia de clientes e promessas".

## 2. Como colocar na Gerente IA

**A. Prompt v5 (pronto, não ligado).** Arquivo `gerente-ia/prompt-rascunho-v5.txt`, no ramo claude/project-thread-dgjzoc. Tem as regras 2 a 9 e 12 e 5 casos reais com ERRADO/CERTO. Também ganha dois campos novos:
- `entregar_junto`: peça pronta e parada do cliente, que deve ir junto com a resposta;
- `decisao_diretoria`: extra fora do contrato ou cliente em risco, para ele decidir.

Para ligar, basta uma linha nova (versão 5) na tabela "Gerente IA · textos". Nenhum fluxo muda, e os campos novos ficam guardados para a etapa B.

**B. Dar olhos à Gerente (muda os fluxos, pede OK):**
1. Ler as últimas ~30 mensagens do grupo, além dos cards, para saber o que já foi prometido e quantas vezes o cliente já cobrou (padrões 1 e 6).
2. Procurar a peça pronta e parada do cliente (Pronto para revisão, Aprovado, Feito sem envio) e pôr na aba Aprovar um botão "mandar junto" (padrão 2).
3. Quando a equipe responder "vou averiguar" ou "estou conferindo", isso conta como "sem resposta" e dispara o rascunho da Gerente.
4. `decisao_diretoria` aparece em "🚨 Fica com você".

**C. Aprender sozinha com as correções dele.** O painel já guarda o rascunho original e o texto que ele corrigiu. A Revisora (relatório das 18h30) compara os dois e propõe uma regra nova por dia ("aplica N"). Assim a Gerente vai ficando parecida com ele sem ninguém reescrever prompt na mão.

## 3. O que continua com ele

- Tudo que sai para o cliente, até bater o critério da Fase 1b (30 enviadas, 95% sem correção).
- Assunto sério: dinheiro, contrato, cancelamento, jurídico, notificação extrajudicial.
- Cliente 🔴 ou em foco: sempre passa por ele, mesmo depois da 1b.
- Aceitar ou recusar extra fora do contrato, prorrogação, compensação de entrega, mudança de grade.
- Prometer data ao cliente e marcar call de exceção.
- Trocar o dono de um cliente na equipe.
- Abrir arquivo do Drive para "qualquer pessoa com o link".
