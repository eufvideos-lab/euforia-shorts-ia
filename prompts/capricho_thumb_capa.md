# Capricho em thumb, capa de reels/short e story (regra do Henrique, 25/11/2026)

> "Quero mais capricho nas thumbs, capas de reels. Sempre ver se a foto tá boa, se a foto tá centralizada, sempre capricho."

Vale para TODA thumb, capa de short/reels e story que uma máquina ou o Escritório fizer. Nada sai sem passar nesta lista.

## 1. Foto
- Use foto de ENSAIO em alta: `01 - ELEMENTOS ESSENCIAIS/03 - FOTOS` (PROFISSIONAIS, RECORTES, zip do fotógrafo). Lado menor ≥ 1400 px.
- NUNCA quadro do vídeo de WhatsApp/celular, print, foto pequena ou a mesma foto já recortada dentro do modelo.
- Uma foto DIFERENTE por peça quando houver ensaio (3 capas = 3 fotos), e a pose combina com o tema
  (ex.: celular na mão para "fugir das ligações", mão no queixo para "cansaço", braço cruzado sério para "irritação").
- Rosto de frente ou 3/4, olhos abertos e nítidos, boa luz, sem careta.

## 2. Recorte e enquadramento
- Cliente RECORTADO (sem fundo), com brilho/glow da cor da marca atrás: `pipeline/recortes.py` (rembg birefnet-portrait).
- Rosto GRANDE: largura do rosto ≈ 30–37% da largura da capa (1080) ou ≈ 20% da thumb (1280).
- Capa 1080x1920: rosto CENTRALIZADO na horizontal, centro do rosto em y ≈ 650–750; título, selo e logo na faixa central
  (y 420–1650), porque o YouTube e o grid do Instagram cortam topo e base.
- Thumb 1280x720: texto de um lado, rosto do outro, cabeça inteira (sem cortar cabelo no topo), olhos no terço de cima.
- A base da foto some num degradê para a cor de fundo: nunca linha dura onde a foto acaba.

## 3. Texto
- Título em CAIXA ALTA, 2 linhas (3 no máximo), palavra-chave na cor de destaque. Sem texto encostado no rosto nem no logo.
- Fonte e cores da identidade do cliente (pasta identidade / ficha).

## 4. Conferência antes de subir (obrigatória)
- Monte uma folha lado a lado (todas as capas + thumb) e OLHE: rosto centralizado? foto nítida? algo cortado ou sobrando
  do modelo? texto batendo em algo?
- Dê zoom 100% no rosto e no cabelo: recorte limpo, sem halo, sem pedaço de fundo.
- Story de divulgação usa a thumb NOVA (`pipeline/story.py --thumb`) e o logo horizontal com o nome.
- Achou defeito: refaz. Só sobe quando a folha passar.
