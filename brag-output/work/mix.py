"""Mix the music bed and the SFX cue list (work/sfx.json) into work/mix.wav."""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR, DUR = 48000, 150.0
here = Path(__file__).parent
skill = Path.home() / '.claude/skills/brag/assets'


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


n = int(SR * DUR)
out = np.zeros((n, 2), dtype=np.float32)

music = load(skill / 'music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3')[:n]
env = np.ones(len(music), dtype=np.float32)
fo = int(SR * 4.0)
env[-fo:] = np.linspace(1, 0, fo) ** 1.5
out[:len(music)] += music * env[:, None] * 0.62

cache = {}
for c in json.loads((here / 'sfx.json').read_text()):
    f = c['f']
    if f not in cache:
        cache[f] = load(skill / 'sfx' / f)
    s = cache[f] * c['g'] * 0.85
    i = int(c['t'] * SR)
    if i >= n:
        continue
    j = min(n, i + len(s))
    out[i:j] += s[: j - i]

peak = float(np.abs(out).max())
print(f'peak before limiting: {peak:.3f}', file=sys.stderr)
# gentle soft clip above -1 dBFS
lim = 0.89
over = np.abs(out) > lim
out[over] = np.sign(out[over]) * (lim + (1 - lim) * np.tanh((np.abs(out[over]) - lim) / (1 - lim)))

pcm = (np.clip(out, -1, 1) * 32767).astype(np.int16)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ac', '2', '-ar', str(SR), '-i', '-', str(here / 'mix.wav')],
               input=pcm.tobytes(), check=True)
print('wrote mix.wav')
