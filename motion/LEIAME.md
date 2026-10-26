# Máquina de Motion

Gera animações (motion design) nas cores do cliente, renderizadas por código com o Remotion
(o mesmo motor dos shorts). Uma peça é um JSON em `motion/pecas/` com:

- `marca`: cores e fontes do cliente (primaria, secundaria, escura, fundo, texto).
- `audio`: narração/trilha (opcional). As cenas são cronometradas em cima dela.
- `cenas`: lista de cenas de tipos prontos, cada uma com `inicio`/`fim` em segundos.

## Tipos de cena (remotion/src/motion/cenas.tsx)

| tipo | o que faz |
|---|---|
| `pergunta` | frase grande no centro, palavra por palavra; palavra `destaque` em serifa itálica sublinhada |
| `telas` | telas do produto flutuando em 3D + pílulas de palavras-chave |
| `ritmo` | barra longa que se quebra em episódios + player com progresso |
| `parede` | parede 3D de capas/cards; o logo entra num cartão branco |
| `apresentador` | vídeo da pessoa num quadro com moldura deslocada + frase ao lado |
| `preco` | o quadro vira círculo e o preço rola até o valor |
| `logo` | logo em cartão branco sobre a cor da marca, brilho passando e botão |
| `institucional` | logo, nome, frase em linhas e pilares com ícones que se desenham |

Entre cenas entra uma faixa diagonal nas cores da marca (`"transicao": "nenhuma"` desliga).
Para uma cena nova de outro cliente, basta escrever o JSON; tipo novo de cena = um componente novo em `cenas.tsx`.

## Como rodar

Os arquivos citados no JSON (telas, vídeos, logos, áudio) ficam em `remotion/public/` (fora do git).

```
cd remotion
CHROME=<chrome-headless-shell> node quadros.mjs ../motion/pecas/<peca>.json /tmp/previa MotionCena 2 5 9   # quadros soltos
CHROME=<chrome-headless-shell> node render.mjs ../motion/pecas/<peca>.json saida.mp4 MotionCena            # vídeo
```

34 s em 1920x1080 renderizam em ~80 s na nuvem.

## Peças

- `cta-nova-acropole.json`: CTA final da Acrópole Play (substitui o ACROPOLEPLAY.mov da pasta
  01 - ELEMENTOS ESSENCIAIS/05 - IDENTIDADE AUDIOVISUAL da NA). Usa o áudio original, as telas da plataforma e
  o trecho da apresentadora tirados do próprio .mov (pasta `remotion/public/cta-na/`).
