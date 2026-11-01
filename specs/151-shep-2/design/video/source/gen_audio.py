import json, wave, sys, os
import numpy as np
from piper import PiperVoice, SynthesisConfig
film = os.path.dirname(os.path.abspath(__file__))
voice = PiperVoice.load(sys.argv[1])
cfg = SynthesisConfig(length_scale=1.06)
script = json.load(open(os.path.join(film, 'script.json')))
os.makedirs(os.path.join(film, 'lines'), exist_ok=True)
SR = voice.config.sample_rate
t = 0.0
LEAD = {'open': 1.6}
clips = []
for si, sc in enumerate(script['scenes']):
    sc['start'] = round(t, 3)
    t += LEAD.get(sc['id'], 0.7)
    for li, ln in enumerate(sc['lines']):
        p = os.path.join(film, 'lines', f'{si:02d}-{li}.wav')
        with wave.open(p, 'wb') as wf:
            voice.synthesize_wav(ln.get('say', ln['text']), wf, syn_config=cfg)
        with wave.open(p) as wf:
            n = wf.getnframes(); data = np.frombuffer(wf.readframes(n), dtype=np.int16)
        d = n / SR
        ln['start'] = round(t, 3); ln['dur'] = round(d, 3)
        clips.append((t, data))
        t += d + 0.38
    t += 0.5
    tail = 3.5 if sc['id'] == 'close' else 0.6
    sc['end'] = round(t + tail, 3)
    t = sc['end'] - 0.6 if sc['id'] != 'close' else sc['end']
total = t
out = np.zeros(int((total + 0.5) * SR), dtype=np.float32)
for st, data in clips:
    i = int(st * SR); out[i:i + len(data)] += data.astype(np.float32) / 32768
script['total'] = round(total, 3)
with wave.open(os.path.join(film, 'narration.wav'), 'wb') as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
json.dump(script, open(os.path.join(film, 'timeline.json'), 'w'), indent=1)
print('total', round(total, 1), 's', 'scenes', len(script['scenes']))
for sc in script['scenes']: print(f"{sc['id']:10s} {sc['start']:7.2f} {sc['end']:7.2f}")
