"""Conversa com o n8n da Euforia (ponte segura para Drive, Pixabay e transcrição).
A senha vem da variável de ambiente SHORTS_IA_TOKEN."""
import base64, json, os, subprocess

BASE = os.environ.get('SHORTS_IA_N8N', 'https://n8n.grupoeuforia.tech/webhook')
TOKEN = os.environ.get('SHORTS_IA_TOKEN', '')
DRIVE_EUFORIA = '0AGhEQwuC5NyjUk9PVA'  # drive compartilhado EUFORIA MEDIA


def _curl(args, saida=None, timeout=900):
    cmd = ['curl', '-sS', '--fail-with-body', '--max-time', str(timeout), '-H', f'x-token: {TOKEN}'] + args
    if saida:
        cmd += ['-o', saida]
    r = subprocess.run(cmd, capture_output=True, text=saida is None)
    if r.returncode != 0:
        raise RuntimeError(f'ponte falhou ({r.returncode}): {(r.stdout or "")[:300]} {r.stderr[:300] if isinstance(r.stderr, str) else r.stderr[:300].decode(errors="ignore")}')
    return r.stdout


def _json(acao, **campos):
    return ['-X', 'POST', '-H', 'Content-Type: application/json', '-d', json.dumps({'acao': acao, **campos}), f'{BASE}/shorts-ia-ponte']


def baixar(file_id, destino):
    """Baixa um arquivo do Drive (qualquer tamanho que o n8n aguente)."""
    _curl(_json('baixar', file_id=file_id), saida=destino, timeout=1800)
    return destino


def broll_buscar(q, n=8):
    return json.loads(_curl(_json('broll_buscar', q=q, n=n), timeout=60)).get('hits', [])


def broll_baixar(url, destino):
    _curl(_json('broll_baixar', url=url), saida=destino, timeout=300)
    return destino


def subir(caminho, folder_id, nome, drive_id=DRIVE_EUFORIA):
    out = _curl(['-X', 'POST', '-F', f'arquivo=@{caminho}', '-F', f'folder_id={folder_id}',
                 '-F', f'drive_id={drive_id}', '-F', f'nome={nome}', f'{BASE}/shorts-ia-subir'], timeout=1800)
    return json.loads(out)


def transcrever(audio_mp3, idioma='pt'):
    corpo = json.dumps({'audio_base64': base64.b64encode(open(audio_mp3, 'rb').read()).decode(),
                        'filename': os.path.basename(audio_mp3), 'language': idioma})
    tmp = audio_mp3 + '.req.json'
    open(tmp, 'w').write(corpo)
    out = _curl(['-X', 'POST', '-H', 'Content-Type: application/json', '--data', f'@{tmp}',
                 f'{BASE}/shorts-ia-transcrever'], timeout=900)
    os.remove(tmp)
    return json.loads(out)
