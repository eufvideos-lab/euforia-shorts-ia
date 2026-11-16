# Euforia Studio (app de Windows)

O editor da Euforia como programa de computador. Abre os projetos que a máquina deixou na pasta do Drive,
mostra a prévia, deixa ajustar e **renderiza com a força do próprio PC**.

## Como funciona
- Pasta dos projetos: `G:\Drives compartilhados\EUFORIA MEDIA\00 - SHORTS IA (MÁQUINA)\EDITOR` (Drive para computador).
  Se não existir, usa `Documentos\Euforia Studio`. Dá para trocar no app ("Trocar pasta").
- Cada projeto é uma pasta com `projeto-N.json` + `midia/` (gerados por `pipeline/projeto_editor.py`).
- Render: `@remotion/renderer` no próprio app, usando ~75% dos núcleos. Na primeira vez baixa o navegador de render (~100 MB)
  para a pasta do app. O vídeo sai em `<projeto>/renders/` e os ajustes vão para `<projeto>/ajustes.jsonl`
  (é o que a máquina vai ler para aprender). Como é a pasta do Drive, sobe sozinho.

## Vídeos longos (0.2.0)
- A máquina de longos grava o projeto com `python3 longos/montar.py PEDIDO --sem-gfx --studio "<EDITOR>/<pasta>" --cliente X --titulo Y`
  (fala cortada em `base.mp4` + prévia leve, grafismos com transparência em .webm, B-rolls e trilha).
- No Studio: tirar pedaços da fala (S divide na agulha), mover/tirar/trocar elementos, volume da trilha.
- Render: `longo.js`, com o ffmpeg completo que vai no instalador (`resources/ffmpeg`), igual ao `montar.py`.

## Título e descrição (16/11/2026)
- A máquina escreve o pacote de publicação de cada vídeo (`prompts/publicacao.md` → `pipeline/publicacao.py`) e põe em
  `projeto-N.json` → `publicacao`. O Studio mostra a seção "Título e descrição" na coluna da esquerda: 3 títulos para
  escolher, descrição (com capítulos no longo), tags, botões de copiar. O que a pessoa muda fica salvo no PC.
- O mesmo texto vai num "título e descrição.txt" ao lado do vídeo no Drive (para quem não abre o Studio).

## Atualização automática
- Pasta do Drive `00 - SHORTS IA (MÁQUINA)/STUDIO`: instalador + `versao.json` (`{"versao","arquivo","novidades"}`).
- O app confere ao abrir e a cada 30 min; mostra "Atualizar agora". Para lançar: subir o .exe novo e trocar o versao.json.
- `novidades.json` aparece uma vez, na primeira abertura de cada versão.

## Gerar o instalador
```
cd estudio
npm install
npm install --no-save --force @remotion/compositor-win32-x64-msvc@4.0.534   # só em Linux/Mac
npm run windows        # precisa do wine em Linux; sai em dist/Euforia-Studio-Setup-X.exe
```
`npm run dev` abre o app no próprio computador para testar (variáveis: `ESTUDIO_PASTA`, `ESTUDIO_CHROME`).

## Falta
- A máquina de shorts gravar o projeto direto na pasta EDITOR (hoje: `projeto_editor.py` à mão).
- Assinar o instalador (o Windows avisa "editor desconhecido" na primeira vez).
- A máquina de longos rodar o `--studio` sozinha (hoje: à mão) e o modelo Nova Acrópole no Studio.
- Trocar texto de cartão/texto-chave no Studio (hoje: só mover/tirar).
