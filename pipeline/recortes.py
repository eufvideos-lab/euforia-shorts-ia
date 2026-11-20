#!/usr/bin/env python3
"""Banco de fotos sem fundo do cliente (03 - FOTOS/RECORTES).

Uso:
  python3 pipeline/recortes.py <pasta com fotos> <pasta de saída> [--min-lado 1400] [--max 12]

Para cada foto:
  1. Só alta resolução: lado menor >= --min-lado (padrão 1400 px). Foto de WhatsApp/print fica de fora.
  2. Precisa ter UM rosto, de frente, visível; fotos com rosto pequeno demais (< 7% da largura) ficam de fora.
  3. Tira o fundo com BiRefNet-portrait (rembg, modelo "birefnet-portrait"), bom em cabelo.
  4. Sai um PNG transparente com o rosto CENTRALIZADO na horizontal (enquadramento busto, margem igual dos lados),
     nome "RECORTE - <foto original>.png".
  5. Monta "_CONFERIR RECORTES.jpg": folha com todos os recortes sobre fundo xadrez + fundo escuro, para a equipe
     conferir cabelo e bordas em 10 s. Recorte ruim: apagar o PNG (a máquina não refaz o que já existe).

Saída no terminal: uma linha por foto (OK / PULADA: motivo) e um JSON no final.
"""
import argparse, json, os, sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

EXT = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".heic"}


def rostos(img_bgr):
    g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    esc = 900 / max(g.shape)
    p = cv2.resize(g, None, fx=esc, fy=esc) if esc < 1 else g
    esc = min(esc, 1)
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    rs = cas.detectMultiScale(p, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40))
    return [tuple(int(v / esc) for v in r) for r in rs]


def enquadrar(rgba, rosto):
    """Busto com o rosto no centro horizontal; corta só o que sobra de transparente em cima."""
    a = np.array(rgba)[:, :, 3]
    H, W = a.shape
    x, y, w, h = rosto
    cx = x + w / 2
    ys, xs = np.where(a > 20)
    if len(xs) == 0:
        return None
    topo = max(0, ys.min() - int(0.06 * h))
    base = H
    # metade da largura: o maior afastamento do corpo até o centro do rosto (fica simétrico)
    meia = max(cx - xs.min(), xs.max() - cx) + 0.1 * w
    meia = max(meia, 1.6 * w)
    esq, dir_ = int(cx - meia), int(cx + meia)
    tela = Image.new("RGBA", (dir_ - esq, base - topo), (0, 0, 0, 0))
    tela.paste(rgba.crop((max(0, esq), topo, min(W, dir_), base)), (max(0, -esq), 0))
    return tela


def folha(itens, destino):
    if not itens:
        return
    lado = 360
    cols = min(4, len(itens))
    linhas = (len(itens) + cols - 1) // cols
    F = Image.new("RGB", (cols * lado * 2, linhas * (lado + 40)), (245, 245, 245))
    d = ImageDraw.Draw(F)
    try:
        fonte = ImageFont.truetype("DejaVuSans.ttf", 18)
    except Exception:
        fonte = ImageFont.load_default()
    for i, (nome, png) in enumerate(itens):
        im = Image.open(png)
        im.thumbnail((lado - 10, lado - 10))
        c, l = i % cols, i // cols
        x0, y0 = c * lado * 2, l * (lado + 40)
        # xadrez
        xad = Image.new("RGB", (lado, lado), (255, 255, 255))
        dx = ImageDraw.Draw(xad)
        for yy in range(0, lado, 20):
            for xx in range(0, lado, 20):
                if (xx // 20 + yy // 20) % 2:
                    dx.rectangle([xx, yy, xx + 19, yy + 19], fill=(205, 205, 205))
        esc = Image.new("RGB", (lado, lado), (25, 25, 25))
        for fundo, ox in ((xad, 0), (esc, lado)):
            fundo.paste(im, ((lado - im.width) // 2, lado - im.height), im)
            F.paste(fundo, (x0 + ox, y0))
        d.text((x0 + 6, y0 + lado + 8), nome[:60], fill=(0, 0, 0), font=fonte)
    F.save(destino, quality=85)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada")
    ap.add_argument("saida")
    ap.add_argument("--min-lado", type=int, default=1400)
    ap.add_argument("--max", type=int, default=12, help="máximo de recortes novos por rodada")
    a = ap.parse_args()

    from rembg import new_session, remove
    sess = new_session("birefnet-portrait")

    ent, sai = Path(a.entrada), Path(a.saida)
    sai.mkdir(parents=True, exist_ok=True)
    feitos, pulados, folha_itens = [], [], []
    for f in sorted(ent.iterdir()):
        if f.suffix.lower() not in EXT:
            continue
        alvo = sai / f"RECORTE - {f.stem}.png"
        if alvo.exists():
            folha_itens.append((alvo.name, alvo))
            continue
        if len(feitos) >= a.max:
            break
        try:
            im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
        except Exception as e:
            pulados.append((f.name, f"não abriu ({e})"))
            continue
        if min(im.size) < a.min_lado:
            pulados.append((f.name, f"resolução baixa ({im.width}x{im.height})"))
            continue
        if max(im.size) > 2400:  # memória: recorte em até 2400 px (sobra para thumb 1280x720 e capa 1080x1920)
            im.thumbnail((2400, 2400), Image.LANCZOS)
        bgr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
        rs = rostos(bgr)
        if len(rs) != 1:
            pulados.append((f.name, "sem rosto de frente" if not rs else f"{len(rs)} rostos"))
            continue
        if rs[0][2] < 0.07 * im.width:
            pulados.append((f.name, "rosto pequeno demais (foto de longe)"))
            continue
        rgba = remove(im, session=sess, post_process_mask=True)
        out = enquadrar(rgba, rs[0])
        if out is None:
            pulados.append((f.name, "recorte vazio"))
            continue
        out.save(alvo, optimize=True)
        feitos.append(alvo.name)
        folha_itens.append((alvo.name, alvo))
        print("OK", f.name, "->", alvo.name, out.size, flush=True)
    for n, m in pulados:
        print("PULADA", n, ":", m, flush=True)
    folha(folha_itens, sai / "_CONFERIR RECORTES.jpg")
    print(json.dumps({"feitos": feitos, "pulados": [{"foto": n, "motivo": m} for n, m in pulados],
                      "total_no_banco": len(folha_itens)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
