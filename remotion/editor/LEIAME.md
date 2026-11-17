# Editor Euforia (protótipo)

Ver e ajustar o short que a máquina montou **antes** de renderizar. Dois caminhos:
- **Aprovar como está** (automático): renderiza exatamente o que a máquina fez.
- **Exportar com ajustes** (manual): renderiza a versão ajustada e guarda a lista do que mudou, para a máquina aprender.

A prévia roda no navegador de quem edita (Remotion Player, os mesmos componentes do render), então não precisa renderizar para ver.

## O que dá para fazer
- Legenda: corrigir palavra, ligar/desligar destaque (★), apagar.
- B-roll: arrastar, esticar/encurtar, trocar o arquivo, tela dividida ou cheia, tirar, pôr um da biblioteca no ponto atual.
- Cartão: mudar texto e autor, mover, tirar.
- Cortes: tirar um trecho (o resto é puxado para trás, com legendas e grafismos).
- Estilo: cor do destaque e volume da trilha.
- Desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z), espaço toca/pausa, setas andam quadro a quadro.
- Painel "Ajustes": a diferença entre o que a máquina fez e o que a pessoa mudou, em português.

## Como usar (hoje, protótipo)
1. A máquina gera o short normalmente (`pipeline/produzir.py`, que deixa `props_N.json` na pasta do pedido).
2. `python3 pipeline/projeto_editor.py PASTA_DO_PEDIDO SAIDA --cliente "Nome"` gera `SAIDA/projeto-N.json` + `SAIDA/midia/`.
3. `cd remotion && npm run editor:build`, copiar `editor/dist/*` para `SAIDA/` e servir a pasta
   (ex.: `npx http-server SAIDA`). Abrir `index.html?projeto=projeto-1.json`.
4. O botão de exportar baixa um `.json`. `python3 pipeline/renderizar_editado.py ARQUIVO.json PASTA_DO_PEDIDO saida.mp4`
   renderiza e grava os ajustes em `PASTA/ajustes.jsonl`.

Se o projeto tiver o campo `"salvar"` (endereço que recebe o resultado), o editor manda para lá em vez de baixar.

## Falta para virar ferramenta da equipe
- Hospedar no painel da equipe (login que já existe) e a máquina publicar o projeto lá em vez de renderizar direto.
- Fluxo no n8n recebendo o "Exportar" → fila de render → Drive → aviso.
- Ajustes numa tabela do n8n e lidos pela máquina (prompts de escolha de trechos) para errar menos.
- Licença do Remotion para empresa (acima de 3 pessoas).
