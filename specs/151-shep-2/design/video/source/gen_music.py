# Soft ambient pad: a slow four-chord loop, darker at night, a high shimmer joins in the morning.
import numpy as np, wave, json, sys, os
d = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(d, 'timeline.json')))['total'] + 1.0
SR = 44100; n = int(T * SR); t = np.arange(n) / SR
def hz(m): return 440 * 2 ** ((m - 69) / 12)
chords = [[45, 57, 60, 64, 71], [41, 53, 57, 60, 64], [48, 55, 59, 64, 67], [43, 55, 59, 62, 69]]  # Am9, Fmaj7, Cmaj7, G6
L = 8.0
out = np.zeros(n)
for k in range(int(T / L) + 2):
    ch = chords[k % 4]; st = k * L - 2.0
    i0 = max(0, int(st * SR)); i1 = min(n, int((st + L + 4.0) * SR))
    if i0 >= i1: continue
    tt = t[i0:i1] - st
    env = np.clip(np.minimum(tt / 3.0, (L + 4.0 - tt) / 3.0), 0, 1); env = 0.5 - 0.5 * np.cos(np.pi * env)
    seg = np.zeros(i1 - i0)
    for j, m in enumerate(ch):
        f = hz(m); a = 0.9 if j == 0 else 0.5
        for det in (-0.0018, 0.0018):
            ph = 2 * np.pi * f * (1 + det) * t[i0:i1]
            seg += a * (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph))
    out[i0:i1] += seg * env
# morning shimmer from the first morning scene
tl = json.load(open(os.path.join(d, 'timeline.json')))
m0 = next(s['start'] for s in tl['scenes'] if s['id'] == 'morning')
sh = np.zeros(n)
for k, m in enumerate([76, 79, 83, 84, 88]):
    sh += np.sin(2 * np.pi * hz(m) * t + k) * (0.5 + 0.5 * np.sin(2 * np.pi * (0.07 + 0.02 * k) * t))
ramp = np.clip((t - m0) / 6.0, 0, 1)
out += 0.35 * sh * ramp
# gentle lowpass and slow breathing
y = np.zeros(n); a = 0.06
for i in range(1, n): y[i] = y[i - 1] + a * (out[i] - y[i - 1])
y *= 0.85 + 0.15 * np.sin(2 * np.pi * t / 11.0)
fade = np.clip(np.minimum(t / 3.0, (T - t) / 4.0), 0, 1)
y *= fade; y /= np.abs(y).max(); y *= 10 ** (-3 / 20)
st = np.stack([y, np.roll(y, int(0.012 * SR))], 1)
with wave.open(os.path.join(d, 'music.wav'), 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes((st * 32767).astype(np.int16).tobytes())
print('music', round(T, 1), 's, morning shimmer from', m0)
