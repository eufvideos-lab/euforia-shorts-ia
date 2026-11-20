# Rotina: Título, descrição e SEO de toda a grade (Grupo Euforia, 20/11/2026)

Pedido do Henrique (20/11/2026): todo vídeo que vai ao ar sai com título, descrição e SEO, não só os que passaram
pelas máquinas. Esta rotina olha a grade dos próximos dias e faz o pacote dos vídeos que ainda não têm, inclusive os
editados à mão (Além do CNPJ, BM Cast, Dr. Gustavo...). Tudo em português do Brasil.
Sem commit nem push: a rotina só lê e escreve no Drive, no Notion e no Painel.

## Endereços fixos
- Entregas (Notion, data source): collection://932e6b5a-0cef-49f2-a7f5-57052239f8d0
- Clientes (Notion, data source): collection://44f009f6-e49b-4b88-b155-3e73ee1ab79b
- Regras do pacote: `prompts/publicacao.md` (leia antes de escrever)
- Discord #ia-status (1559987978774777998): só diretoria, detalhe técnico de erro.

## 1. Ver o que falta (gasta pouco)
Consulte o Entregas: cards com Tipo "Vídeo longo", "Shorts" ou "Podcast", "Postar em" de hoje até daqui a 3 dias
(Recife), Status diferente de "Postado" e "Cancelado", com "Link do arquivo" preenchido. Pule o card se o Obs já tem
uma linha `[SEO]` (o pacote já foi feito) ou se veio de máquina que já fez o pacote (Obs com "Feito pela IA" e link de
pedido de Shorts IA ou Vídeos Longos IA). Sem nenhum: encerre. No máximo 8 vídeos por rodada, do "Postar em" mais
perto para o mais longe.

## 2. Preparar
```
bash instalar.sh
```

## 3. Para cada card
1. Pegue o ID do vídeo no "Link do arquivo" (depois de /d/ ou id=). Se for pasta, liste e pegue os vídeos (.mp4/.mov):
   card de Shorts com 3 peças = 3 vídeos, na ordem do nome. Sem vídeo na pasta: pule e anote no relatório final.
2. Para cada vídeo: `python3 pipeline/seo_video.py seo/<id-curto-do-card>/<n> <file_id>` (baixa, transcreve e grava
   `palavras.txt` com o minuto de cada frase; o vídeo é apagado depois).
3. Leia `palavras.txt`, a ficha do cliente (nicho, direção criativa, links, "📝 Rodapé da descrição (YouTube)") e, se
   o card citar um roteiro, o roteiro. Escreva `seo/<id-curto>/<n>/publicacao.json` seguindo `prompts/publicacao.md`:
   - vídeo de até 3 min = `shorts` com 1 item; maior = `longo` com `capitulos` (índices de palavra do palavras.txt;
     como a transcrição é do vídeo pronto, os minutos saem certos).
   - Podcast: título com o nome do convidado quando ele for conhecido no nicho; capítulos por tema da conversa.
4. `python3 pipeline/publicacao.py seo/<id-curto>/<n> --cliente "<nome>" --pasta-drive <pasta do vídeo> --cliente-id <id da ficha> --pedido <link do card>`
   Isso grava o .txt ao lado do vídeo no Drive e põe o pacote no Painel da Equipe (gaveta do horário na Grade).
   Se parar com ERRO, corrija o publicacao.json e rode de novo.
5. No Obs do card, uma linha no topo: `[SEO dd/MM] Título e descrição prontos no painel e na pasta: <título 1>`.

## 4. Fim
Se algo falhou, conte no #ia-status (cliente, card, erro). Não avise a equipe quando der certo: o pacote aparece
sozinho na gaveta do horário.

## Regras
- Nunca mande nada para cliente. Nunca invente link, preço, data ou promessa.
- Dados de canal só em percentual. Nunca cite a Euforia na descrição.
- Credenciais e endereços de webhook nunca aparecem em log, Notion ou Discord.
