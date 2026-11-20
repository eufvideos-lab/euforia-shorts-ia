"""Onde cortar a fala sem comer palavra (19/11/2026, usado por shorts e longos).

O erro que mais volta na revisão da Lorena é palavra cortada ("gundo", "ultrapassar|mos", "ta|tuagem").
Duas causas:
1. O tempo de palavra da transcrição erra em até 0,3 s (começo atrasado, fim adiantado).
2. Dentro de uma palavra há pequenos silêncios de 40 a 100 ms (o fechamento do "p", "t", "k" de "ultrapassarmos",
   "tatuagem"). O corte antigo aceitava qualquer silêncio de 40 ms e às vezes caía aí, no meio da palavra.

Aqui o corte vai para uma PAUSA DE VERDADE (pelo menos 120 ms abaixo do ruído de fundo + 6 dB). Só se não houver
nenhuma, usa o silêncio mais longo do intervalo. Todas as funções recebem o áudio mono (numpy) e a taxa.
"""
import subprocess

import numpy as np

PAUSA_REAL = 0.12   # s: menos que isso pode ser consoante dentro da palavra
PAUSA_MIN = 0.04


def carregar(video, sr=16000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vn', '-f', 's16le', '-ac', '1', '-ar', str(sr), '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32)


def energia(audio, a, b, sr=16000, win=0.03, hop=0.01):
    i0, i1 = max(0, int(a * sr)), min(len(audio), int(b * sr))
    w, h = int(win * sr), int(hop * sr)
    ts, es = [], []
    for i in range(i0, max(i0 + 1, i1 - w), h):
        ts.append((i + w / 2) / sr)
        es.append(20 * np.log10(np.sqrt((audio[i:i + w] ** 2).mean()) + 1e-9))
    return ts, es


def pausas(audio, a, b, sr=16000):
    """Silêncios entre a e b: lista de (início, fim) em s, abaixo do ruído de fundo da região + 6 dB."""
    _, ref = energia(audio, a - 2, b + 2, sr)
    limite = float(np.percentile(ref, 10)) + 6 if ref else -1e9
    ts, es = energia(audio, a, b, sr)
    out, ini = [], None
    for k, e in enumerate(es + [1e9]):
        if e < limite and ini is None:
            ini = k
        elif e >= limite and ini is not None:
            if ts[k - 1] - ts[ini] >= PAUSA_MIN:
                out.append((ts[ini], ts[k - 1]))
            ini = None
    return out, ts, es


def ponto(audio, a, b, sentido='fim', sr=16000):
    """Instante de corte entre a e b.
    sentido='fim': primeira pausa real depois do fim da fala (a = fim previsto da última palavra).
    sentido='inicio': última pausa real antes do começo da fala (b = começo previsto da primeira palavra).
    Sem pausa real, fica com o silêncio mais longo; sem nenhum silêncio, o ponto mais baixo."""
    if audio is None or b - a < 0.05:
        return (a + b) / 2
    corr, ts, es = pausas(audio, a, b, sr)
    if not ts:
        return (a + b) / 2
    if not corr:
        return ts[int(np.argmin(es))]
    reais = [c for c in corr if c[1] - c[0] >= PAUSA_REAL]
    if reais:
        c = reais[0] if sentido == 'fim' else reais[-1]
        # perto da fala, não no meio da pausa: sobra um respiro curto e a emenda fica natural
        return min(c[0] + 0.08, (c[0] + c[1]) / 2) if sentido == 'fim' else max(c[1] - 0.08, (c[0] + c[1]) / 2)
    c = max(corr, key=lambda x: x[1] - x[0])
    return (c[0] + c[1]) / 2


def fim_real(audio, t, limite, sr=16000):
    """Onde a fala que a transcrição diz acabar em t acaba de verdade (procura até `limite`)."""
    return ponto(audio, max(0.0, t - 0.05), max(t + 0.06, limite), 'fim', sr)


def inicio_real(audio, t, limite, sr=16000):
    """Onde a fala que a transcrição diz começar em t começa de verdade (procura desde `limite`)."""
    return ponto(audio, min(limite, t - 0.06), t + 0.05, 'inicio', sr)
