"""Original 15-second electronic ascent score. Run from the workspace root."""
from pathlib import Path
import numpy as np
import wave

sr = 48000
duration = 15
N = sr * duration
t = np.arange(N) / sr
audio = np.zeros((N, 2), dtype=np.float64)
rng = np.random.default_rng(416)


def add(start, signal, pan=.5):
    begin = int(start * sr)
    end = min(N, begin + len(signal))
    if begin >= N:
        return
    audio[begin:end, 0] += signal[:end-begin] * np.sqrt(1-pan)
    audio[begin:end, 1] += signal[:end-begin] * np.sqrt(pan)


def tone(start, length, midi, level=.045, attack=.6, pan=.5):
    u = np.arange(int(length * sr)) / sr
    f = 440 * 2 ** ((midi - 69) / 12)
    env = (1-np.exp(-u/attack)) * np.exp(-u/(length*.70)) * np.clip((length-u)/.75, 0, 1)
    phase = 2*np.pi*f*u + .025*np.sin(2*np.pi*.25*u)
    sig = (np.sin(phase) + .17*np.sin(phase*2) + .055*np.sin(phase*3)) * env * level
    add(start, sig, pan)
    if attack < .05:
        add(start+.23, sig*.23, 1-pan)
        add(start+.46, sig*.09, pan)


for start, notes in [(0,[38,50,57,62,69]), (3.4,[34,46,53,58,65]),
                     (6.6,[36,48,55,62,67]), (9.7,[38,50,57,61,69]),
                     (12.5,[38,57,62,66,73])]:
    for i, note in enumerate(notes):
        tone(start, min(5.1, duration-start), note, .037 if i else .065, .4, .2+i*.15)

notes = [62,69,74,76,65,70,74,77,67,72,74,79,69,73,78,81]
for i in range(32):
    start = .85 + i*.335
    tone(start, 1.35, notes[i//2] + (12 if i%2 else 0), .026, .008, .25+(i%4)/6)

# Soft pulse: a pitched sub drop, not a clipped or sampled kick.
for start in np.arange(1.1, 11.3, .67):
    u = np.arange(int(.38*sr))/sr
    phase = 2*np.pi*(46*u + 2.3*(1-np.exp(-u/.035)))
    add(float(start), np.sin(phase)*(1-np.exp(-u/.004))*np.exp(-u/.105)*.08)

# Air builds into the Earth reveal and falls away for arrival.
noise = rng.normal(0, 1, N)
wind = np.convolve(noise, np.ones(35)/35, mode='same')
for center, width, level in [(1.8,1.4,.013), (7.3,2.2,.042), (10.2,1.6,.032)]:
    env = np.exp(-((t-center)/width)**2)
    audio[:,0] += wind*env*level
    audio[:,1] += np.roll(wind,53)*env*level
tone(12.65, 2.35, 86, .035, .006, .38)
tone(12.9, 2.1, 81, .027, .008, .65)

fade = np.minimum(np.clip(t/.20,0,1), np.clip((duration-t)/.9,0,1))
audio *= fade[:,None]
audio *= .72 / max(np.max(np.abs(audio)),1e-8)
path = Path('.deploy-check/beijing-flight/ascent-score-v416.wav')
path.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(path),'wb') as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(sr)
    f.writeframes((audio*32767).astype('<i2').tobytes())
print(path, duration, 'seconds', flush=True)
