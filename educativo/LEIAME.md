# Modelo EDUCATIVO (Grupo Euforia)

Vídeos explicativos com a cara da marca (fundo off-white, preto e laranja, Archivo + Inter), só com locução:
guias para clientes (ex.: boas práticas de gravação) e treinamentos internos da equipe.
Diferente do quadro DOSSIÊ (escuro, infotenimento): aqui é aula curta, em passos.

O que tem: abertura, cartão de capítulo ("PASSO 1 DE 6"), cena de pontos (ilustração + frases que entram com a fala),
quiz "QUAL ESTÁ CERTA?" com contagem 3-2-1 e revelação, check que aparece ao fim de cada passo, checklist final
("tire um print") e encerramento com o logo. Barra de capítulos e legenda palavra por palavra o tempo todo.

## Como fazer uma peça nova

1. Escreva a peça em `educativo/pecas/<nome>.json` (copie `boas-praticas-gravacao.json`).
   - `audio`: ordem das falas (`sN`) e pausas (`["pausa", seg, "rotulo"]`; rótulo vira âncora).
   - `cenas` / `capitulos` / `checks`: tempos por âncora: `cap1`, `cap1:fim`, `s2:palavra` (início da palavra na fala s2),
     `s2:fim`, `inicio`, `final`.
2. Gere a voz de cada fala (voz Will, ElevenLabs) pelo fluxo n8n "Motion | Voz da narração (ElevenLabs)"
   (test_workflow + get_execution) e salve `sN.mp3` + `sN.json` (palavras com tempo) em `remotion/public/<pasta>/`.
   Escreva "Grupo Euforía" na fala (o Will fala certo, eu-fo-RÍ-a; "Eufória" sai errado); a legenda troca para "Euforia" (`trocas`).
3. `python3 educativo/montar.py educativo/pecas/<nome>.json` → `narracao.mp3` e `props.json` na pasta.
4. `cd remotion && CHROME=<chrome-headless-shell> node render.mjs public/<pasta>/props.json saida.mp4 Educativo`
   (prévia de quadros: `node quadros.mjs ... Educativo 3 20 45`).

Ilustrações prontas (`remotion/src/educativo/ilustracoes.tsx`): olhar-baixo, olhar-lente, prompter, enquadra-errado,
enquadra-certo, luz-frente, luz-costas, audio, arquivo. Ilustração nova = um componente SVG novo lá.
Arquivos fixos em `remotion/public/educativo/` (fora do git): logo.svg, logo-claro.svg (do painel), trilha.mp3
(trilha padrão dos longos, no Drive 15UN5dqdxX_VcaJAdcJ1vOyuGgtmBSoiQ, volume bem baixo).
