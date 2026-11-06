# Máquina de Postagem no Instagram (V1)

Publica carrossel, reels e imagem no Instagram **do cliente**, no horário marcado, pela API oficial
(“API do Instagram com login do Instagram”). Sem mLabs, sem senha do cliente.

## Peças no n8n
| Peça | ID | O que faz |
|---|---|---|
| Fluxo "Instagram \| Conectar conta do cliente (V1)" | YnRkA7yG7uNKlOxv | Link "Entrar com Instagram" → guarda o token de 60 dias; renova todo dia 5h; avisa no #ia-status |
| Fluxo "Instagram \| Postar carrossel e reels dos clientes (V1)" | lLelO9lFvCO81riS | A cada 5 min publica o que chegou a hora na fila; entrega os arquivos do Drive ao Instagram (PNG vira JPG) |
| Tabela "Instagram \| Contas dos clientes" | OOJsLQJwkBAvvLLk | cliente, ig_user_id, username, token, status (ativa / reconectar) |
| Tabela "Instagram \| Fila de postagem" | hRvQxKQYly3fGEug | um post por linha |

Página do cliente: `paginas/conectar-instagram.html` → grupoeuforia.com.br/conectar-instagram?c=<cliente>
(`<cliente>` = apelido em minúsculas com hífen, ex.: `regina-gyraser`; é a chave na tabela de contas).

## Linha da fila
| coluna | exemplo |
|---|---|
| cliente | `regina-gyraser` (o mesmo do link) |
| tipo | `REELS`, `CARROSSEL` ou `IMAGEM` |
| midias | `["<id Drive 1>","<id Drive 2>"]` na ordem (carrossel 2 a 10; reels 1 vídeo .mp4) |
| legenda | texto do post (até 2.200 caracteres) |
| publicar_em | data e hora (ISO, com fuso) |
| status | `pendente` → `publicando` → `postado` ou `erro` |
| link / erro / postado_em | preenchidos pelo fluxo |
| entrega_id / pedido_por | card do Entregas e quem pediu |

## Regras
- O arquivo só é entregue ao Instagram enquanto o post está `publicando` e se o ID estiver na linha.
- Carrossel: imagens; PNG é convertido para JPG na hora. Reels: vídeo vertical, até ~15 min, .mp4.
- Falha → linha fica `erro` e sai aviso no #ia-status. Não tenta de novo sozinho (mudar para `pendente` para tentar).
- Token: o fluxo de conectar renova os de mais de 20 dias. Se falhar, conta vira `reconectar` e avisa.

## Falta (lado Meta)
1. ID e segredo do app do Instagram → credencial Custom Auth "Instagram App (Euforia)" no n8n
   (`{"body":{"client_id":"…","client_secret":"…"},"qs":{"client_secret":"…"}}`; o nó de troca manda JSON com cabeçalho form-urlencoded, porque a Custom Auth troca o corpo de formulário por JSON e a Instagram só aceita formulário) e o ID no nó "Montar link do Instagram".
2. Endereço de retorno cadastrado no app (o mesmo do campo redirect_uri do nó "Trocar código por token").
3. Enquanto a Meta não aprova: cada cliente entra como "Testador do Instagram" no app e aceita o convite.
4. Para todos os clientes sem convite: verificação da empresa + App Review de
   `instagram_business_basic` e `instagram_business_content_publish`.
