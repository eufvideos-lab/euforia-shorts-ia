#!/usr/bin/env python3
"""Trilha em laço sem buraco (18/11/2026).
A trilha padrão tem introdução calma, fade-out e ~10 s de silêncio no fim. Repetir o arquivo inteiro
(-stream_loop) deixava 20 a 35 s sem música em todo longo com mais de ~3 min. Aqui o laço usa só o
"corpo" da música (do fim da introdução até antes do fade-out), emendado com crossfade.
Uso: python3 longos/trilha.py musica.aac SEGUNDOS saida.m4a  (ou trilha.preparar(...) dentro do montar.py)
No plano, "trilha_laco": [ini, fim] em segundos força o trecho do laço (senão é achado pelo volume)."""
import subprocess, sys
import numpy as np

XF = 4.0  # crossfade entre as voltas (s)


def _dur(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout)


def corpo(mus):
    """(ini, fim) do trecho que pode repetir: começa quando a música chega no volume cheio e termina antes do fade-out."""
    sr = 8000
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mus, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'],
                         capture_output=True).stdout
    a = np.frombuffer(raw, np.int16).astype(np.float32)
    n = len(a) // sr
    if n < 20:
        return 0.0, len(a) / sr
    db = np.array([20 * np.log10(np.sqrt(np.mean(a[i * sr:(i + 1) * sr] ** 2)) / 32768 + 1e-9) for i in range(n)])
    ref = float(np.median(db[db > -50])) if (db > -50).any() else -20.0
    cheio = np.nonzero(db >= ref - 4)[0]  # trecho em volume normal (fora do fade-out)
    fim = float(cheio[-1] + 1) if len(cheio) else float(n)
    sobe = np.nonzero(db >= ref - 8)[0]
    ini = float(sobe[0]) if len(sobe) else 0.0
    if fim - ini < 30:  # música curta ou sem dinâmica: usa ela toda, só sem o silêncio do fim
        ini, fim = 0.0, float((np.nonzero(db > -50)[0][-1] + 1) if (db > -50).any() else n)
    return ini, fim


def preparar(mus, total, saida, laco=None):
    """Grava em `saida` uma trilha com pelo menos `total` s (introdução + voltas do corpo com crossfade)."""
    ini, fim = laco or corpo(mus)
    if fim >= total:  # cabe sem repetir: só corta
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mus, '-t', f'{fim:.3f}', '-c:a', 'aac', '-b:a', '192k', saida],
                       check=True)
        return saida
    passo = fim - ini - XF
    voltas = 1 + int(np.ceil((total - fim) / passo))
    cmd = ['ffmpeg', '-v', 'error', '-y']
    for _ in range(voltas + 1):
        cmd += ['-i', mus]
    fc = [f'[0:a]atrim=0:{fim:.3f},asetpts=PTS-STARTPTS[p0]']
    for k in range(1, voltas + 1):
        fc.append(f'[{k}:a]atrim={ini:.3f}:{fim:.3f},asetpts=PTS-STARTPTS[p{k}]')
    ult = '[p0]'
    for k in range(1, voltas + 1):
        fc.append(f'{ult}[p{k}]acrossfade=d={XF}:c1=tri:c2=tri[x{k}]')
        ult = f'[x{k}]'
    cmd += ['-filter_complex', ';'.join(fc), '-map', ult, '-c:a', 'aac', '-b:a', '192k', saida]
    subprocess.run(cmd, check=True)
    print(f'trilha: corpo {ini:.0f}-{fim:.0f}s, {voltas} voltas com crossfade, {_dur(saida) / 60:.1f} min', flush=True)
    return saida


if __name__ == '__main__':
    preparar(sys.argv[1], float(sys.argv[2]), sys.argv[3])
