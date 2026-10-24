# Máquina de Shorts — Grupo Euforia

Do vídeo longo ao short pronto, nos 2 modelos oficiais (Viral e Institucional) e no modelo próprio da Nova Acrópole
(Institucional com legenda amarela, B-roll só real e citações com autor; `--modelo nova-acropole`).
Ficha dos modelos no Notion: Central do Flau › Projeto: Edição e Postagem com IA › Modelos de Shorts.

## Como funciona (passo a passo)
1. **Áudio** — tira o áudio do vídeo longo:
   `ffmpeg -i longo.mp4 -vn -ac 1 -ar 16000 -b:a 32k audio.mp3`
2. **Transcrição** — manda para o n8n (fluxo "Shorts IA | Transcrever áudio (palavra a palavra)"):
   POST `https://n8n.grupoeuforia.tech/webhook/shorts-ia-transcrever`
   corpo: `{"audio_base64": "...", "filename": "audio.mp3", "language": "pt"}` → devolve `{text, words}`
   (para vídeos acima de ~25 min, cortar o áudio em partes: o limite da OpenAI é 25 MB por arquivo)
3. **Escolha dos trechos** — o Claude recebe a transcrição com `prompts/escolher_trechos.md`
   e devolve `plano.json` (3 shorts, correções de legenda, destaques, B-rolls ou cartões).
3b. **Rosto centralizado** (fonte horizontal): `python3 pipeline/centralizar_rosto.py longo.mp4 remotion/public/vertical.mp4 [inicio] [fim]`
   detecta o rosto, separa por planos e recorta 9:16 com o rosto no centro.
   Dica: se existir o longo já editado pela equipe, use ele como fonte (melhor qualidade e já tem B-roll e trilha).
4. **Montagem** — `pipeline/montar_short.py` confere o plano (rejeita corte no meio de frase),
   faz os cortes secos nas pausas, monta legendas, enquadramentos, B-rolls e cartões:
   ```
   python3 pipeline/montar_short.py transcricao.json plano.json 0 remotion/props.json \
     --modelo viral --video longo.mp4 --logo logo_cliente.png --brolls brolls.json
   python3 pipeline/montar_short.py transcricao.json plano.json 0 remotion/props.json \
     --modelo institucional --video longo.mp4 --cor "#E8B931" --cor-fundo "#D0CABE" --cor-texto "#102838"
   ```
   Os arquivos (vídeo, logo, B-rolls) ficam em `remotion/public/`.
   Música: no props, `"musica": {"src": "trilha.mp3", "volume": 0.08}` (arquivo em remotion/public).
5. **Render** — `cd remotion && node render.mjs props.json ../saida/short.mp4 ShortViral`
   (ou `ShortInstitucional`). Variáveis: `CHROME=` caminho do Chrome (opcional), `CONCURRENCY=` núcleos.

## Instalar numa máquina nova
- Node 20+, Python 3.10+, ffmpeg
- `cd remotion && npm install`
- Remotion é grátis para empresa com até 3 pessoas; acima disso precisa de licença (confirmar em remotion.pro).

## Tempo medido (07/10/2026, servidor de 2 núcleos)
- Short de 24 s: ~4 min de render. Num PC com 8 núcleos deve cair para ~1 min.

---

# Máquina de Vídeos Longos (formato Padrão)

Do bruto gravado ao vídeo longo pronto para o YouTube, na identidade do cliente. Fica em `longos/`.
Passo a passo da rotina: `longos/TAREFA.md`. Regras de edição do Flau: `longos/prompts/plano_longo.md`.

1. `python3 longos/preparar.py pedidos/X <file_id>`: baixa o bruto pela ponte, transcreve e gera `palavras.txt`.
2. O Claude escreve `pedidos/X/plano.json` (trechos, textos-chave, cartões, mapa, B-rolls, lowers, paleta).
3. `python3 longos/cortar.py pedidos/X`: cortes nos silêncios, zoom alternado, HDR→SDR, 1080p 30 fps.
4. `python3 longos/brolls.py pedidos/X`: B-roll do Pixabay e fotos do Google (salvas no Drive pelo n8n).
5. `python3 longos/montar.py pedidos/X [--previa]`: grafismos na paleta do cliente, trilha baixa com ducking,
   -14 LUFS, tela final.

Tempo medido (17/10/2026, bruto de 14 min → vídeo de 8,7 min): cortes ~16 min, montagem ~15 min (máquina de 4 núcleos).

---

# Máquina de Carrosséis

Dos roteiros do cliente aos carrosséis de Instagram (1080x1350) na identidade visual dele. Fica em `carrossel/`.
Passo a passo da rotina: `carrossel/TAREFA.md`. Regras do conteúdo: `carrossel/prompts/roteiro_carrossel.md`.

1. Identidade: cores, fontes (Google Fonts, baixadas pelo npm/@fontsource), logo em `pedidos/X/identidade.json`.
   Fotos: padrão sem foto do cliente; fotos do Google pelo fluxo de fotos do n8n, juntadas com `carrossel/juntar_foto.py`.
   `carrossel/analisar.py` ajuda a ler a identidade (cores dominantes, folha de referências, logo de uma cor).
2. O Claude escreve `pedidos/X/carrosseis.json` a partir dos roteiros (pacotes de 1, 3, 6 ou 12).
3. `python3 carrossel/gerar.py pedidos/X`: monta cada slide em HTML, reduz o texto que não cabe, tira PNG e JPG
   no Chrome sem tela (playwright-core) e gera a visão geral, a legenda e um zip.
   Rosto das fotos enquadrado sozinho (OpenCV). `--so N` refaz só o carrossel N.

Instalar: `cd carrossel && npm ci` (Chrome: o do ambiente em /opt/pw-browsers, o do Remotion ou `CHROME=`).
Tempo medido (19/10/2026): 3 carrosséis de 7 slides em ~30 s.
