#!/usr/bin/env bash
# Prepara uma máquina nova (ex.: a da tarefa agendada) para produzir shorts.
# Precisa de SHORTS_IA_TOKEN no ambiente. Baixa o código mais recente do Drive pela ponte do n8n.
set -e
ZIP_ID="${SHORTS_IA_ZIP_ID:-}"
DIR="${SHORTS_IA_DIR:-$(cd "$(dirname "$0")" && pwd)}"
if [ ! -f "$DIR/pipeline/produzir.py" ]; then
  [ -z "$ZIP_ID" ] && { echo "defina SHORTS_IA_ZIP_ID"; exit 1; }
  mkdir -p "$DIR.tmp"
  curl -sS --fail-with-body -X POST -H "x-token: $SHORTS_IA_TOKEN" -H "Content-Type: application/json" \
    -d "{\"acao\":\"baixar\",\"file_id\":\"$ZIP_ID\"}" https://n8n.grupoeuforia.tech/webhook/shorts-ia-ponte -o "$DIR.tmp/m.zip"
  (cd "$DIR.tmp" && unzip -q m.zip)
  mv "$DIR.tmp/shorts-ia" "$DIR"; rm -rf "$DIR.tmp"
fi
cd "$DIR/remotion" && [ -d node_modules/remotion ] || npm ci --no-audit --no-fund --loglevel=error
python3 -c "import cv2, numpy, PIL" 2>/dev/null || pip install --break-system-packages -q "opencv-python-headless<5" numpy pillow
which ffmpeg >/dev/null || { echo "ffmpeg ausente"; exit 1; }
echo "máquina pronta em $DIR"
