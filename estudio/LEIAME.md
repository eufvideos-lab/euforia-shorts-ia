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
- Atualização automática do app.
