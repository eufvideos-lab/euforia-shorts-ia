"""Conversa com o n8n da Euforia (ponte segura para Drive, Pixabay e transcrição).
A senha vem da variável SHORTS_IA_TOKEN ou, nas rotinas na nuvem, é colocada
pelo proxy do ambiente (credencial de API no host do n8n) sem a sessão ver."""
import base64, json, os, subprocess

BASE = os.environ.get('SHORTS_IA_N8N', 'https://n8n.grupoeuforia.tech/webhook')
TOKEN = os.environ.get('SHORTS_IA_TOKEN', '')
DRIVE_EUFORIA = '0AGhEQwuC5NyjUk9PVA'  # drive compartilhado EUFORIA MEDIA


def _curl(args, saida=None, timeout=900):
    cmd = ['curl', '-sS', '--fail-with-body', '--max-time', str(timeout)] + (['-H', f'x-token: {TOKEN}'] if TOKEN else []) + args
    if saida:
        cmd += ['-o', saida]
    r = subprocess.run(cmd, capture_output=True, text=saida is None)
    if r.returncode != 0:
        raise RuntimeError(f'ponte falhou ({r.returncode}): {(r.stdout or "")[:300]} {r.stderr[:300] if isinstance(r.stderr, str) else r.stderr[:300].decode(errors="ignore")}')
    return r.stdout


def _json(acao, **campos):
    return ['-X', 'POST', '-H', 'Content-Type: application/json', '-d', json.dumps({'acao': acao, **campos}), f'{BASE}/shorts-ia-ponte']


PARTE = 80 * 1024 * 1024  # vídeos grandes vêm em pedaços de 80 MB


def info(file_id):
    """Nome, tamanho (bytes) e tipo do arquivo no Drive."""
    return json.loads(_curl(_json('info', file_id=file_id), timeout=120))


def baixar(file_id, destino):
    """Baixa um arquivo do Drive. Até 150 MB vem inteiro; acima disso, em pedaços (com nova tentativa)."""
    try:
        tam = int(info(file_id).get('tamanho') or 0)
    except Exception:
        tam = 0
    if 0 < tam <= 150 * 1024 * 1024 or tam == 0:
        try:
            _curl(_json('baixar', file_id=file_id), saida=destino, timeout=1800)
            if os.path.getsize(destino) > 0 and (tam == 0 or os.path.getsize(destino) == tam):
                return destino
        except Exception:
            if tam == 0:
                raise
    parte = destino + '.parte'
    with open(destino, 'wb') as f:
        ini = 0
        while ini < tam:
            fim = min(ini + PARTE, tam) - 1
            for tentativa in range(3):
                try:
                    _curl(_json('baixar_parte', file_id=file_id, inicio=ini, fim=fim), saida=parte, timeout=900)
                    if os.path.getsize(parte) == fim - ini + 1:
                        break
                except Exception:
                    if tentativa == 2:
                        raise
            else:
                raise RuntimeError(f'parte {ini}-{fim} veio incompleta')
            with open(parte, 'rb') as p:
                f.write(p.read())
            ini = fim + 1
    os.remove(parte)
    if os.path.getsize(destino) != tam:
        raise RuntimeError(f'download incompleto: {os.path.getsize(destino)} de {tam} bytes')
    return destino


def broll_buscar(q, n=8):
    return json.loads(_curl(_json('broll_buscar', q=q, n=n), timeout=60)).get('hits', [])


def broll_baixar(url, destino):
    _curl(_json('broll_baixar', url=url), saida=destino, timeout=300)
    return destino


def subir(caminho, folder_id, nome, drive_id=DRIVE_EUFORIA):
    # o curl trata vírgula, ponto e vírgula e aspas no caminho do -F como separadores: sobe uma cópia com nome simples
    # e manda o título de verdade como texto puro (--form-string), aceitando qualquer caractere
    import shutil, tempfile
    tmpdir = tempfile.mkdtemp()
    seguro = os.path.join(tmpdir, 'short' + os.path.splitext(caminho)[1])
    shutil.copyfile(caminho, seguro)
    try:
        out = _curl(['-X', 'POST', '-F', f'arquivo=@{seguro}', '--form-string', f'folder_id={folder_id}',
                     '--form-string', f'drive_id={drive_id}', '--form-string', f'nome={nome}',
                     f'{BASE}/shorts-ia-subir'], timeout=1800)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    return json.loads(out)


def _transcrever_um(audio_mp3, idioma):
    corpo = json.dumps({'audio_base64': base64.b64encode(open(audio_mp3, 'rb').read()).decode(),
                        'filename': os.path.basename(audio_mp3), 'language': idioma})
    tmp = audio_mp3 + '.req.json'
    open(tmp, 'w').write(corpo)
    try:
        ultimo = None
        for tentativa in range(3):
            try:
                return json.loads(_curl(['-X', 'POST', '-H', 'Content-Type: application/json', '--data', f'@{tmp}',
                                         f'{BASE}/shorts-ia-transcrever'], timeout=900))
            except Exception as e:
                ultimo = e
                import time; time.sleep(15)
        raise ultimo
    finally:
        os.remove(tmp)


def _duracao(arq):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def _cortes(audio_mp3, total, alvo=270.0):
    """Pontos de corte a cada ~4,5 min, sempre num silêncio (para não cortar palavra no meio)."""
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', audio_mp3, '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-'],
                       capture_output=True, text=True)
    import re
    ini = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r.stderr)]
    fim = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
    meios = [(a + b) / 2 for a, b in zip(ini, fim)]
    cortes, t = [], alvo
    while t < total - 60:
        perto = [m for m in meios if abs(m - t) <= 40]
        c = min(perto, key=lambda m: abs(m - t)) if perto else t
        cortes.append(c)
        t = c + alvo
    return cortes


def transcrever(audio_mp3, idioma='pt'):
    """Transcrição palavra a palavra. Áudio longo vai em pedaços de ~4,5 min (a resposta de uma vez só cai no caminho)."""
    total = _duracao(audio_mp3)
    if total <= 360:
        return _transcrever_um(audio_mp3, idioma)
    pontos = [0.0] + _cortes(audio_mp3, total) + [total]
    textos, palavras = [], []
    for i in range(len(pontos) - 1):
        a, b = pontos[i], pontos[i + 1]
        parte = f'{audio_mp3}.p{i}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-i', audio_mp3, '-t', f'{b - a:.3f}',
                        '-c:a', 'libmp3lame', '-b:a', '32k', parte], check=True)
        r = _transcrever_um(parte, idioma)
        os.remove(parte)
        textos.append((r.get('text') or '').strip())
        for w in r.get('words') or []:
            palavras.append({**w, 'start': round(w['start'] + a, 3), 'end': round(w['end'] + a, 3)})
    return {'text': ' '.join(t for t in textos if t), 'duration': total, 'words': palavras}
