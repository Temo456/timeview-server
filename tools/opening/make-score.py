from pathlib import Path
import numpy as np,wave
sr=48000;duration=35;N=sr*duration;t=np.arange(N)/sr
audio=np.zeros((N,2),dtype=np.float64)
def tone(start,length,midi,level=.04,attack=1.8,pan=.5):
 end=min(N,int((start+length)*sr));begin=int(start*sr);u=np.arange(end-begin)/sr
 f=440*2**((midi-69)/12)
 env=(1-np.exp(-u/attack))*np.exp(-u/(length*.57))*np.clip((length-u)/1.8,0,1)
 sig=(np.sin(2*np.pi*f*u+.03*np.sin(2*np.pi*.15*u))+.19*np.sin(2*np.pi*f*2*u)+.055*np.sin(2*np.pi*f*3*u))*env*level
 audio[begin:end,0]+=sig*np.sqrt(1-pan);audio[begin:end,1]+=sig*np.sqrt(pan)
for start,notes in [(0,[38,50,57,61,64]),(7,[35,47,54,57,61]),(14,[31,43,50,54,57]),(21,[33,45,52,57,59]),(28,[38,50,57,61,64])]:
 for i,note in enumerate(notes):tone(start,11 if start<28 else 7,note,.028 if i else .038,1.6,.27+i*.11)
for start,note in [(2,74),(4.4,76),(7.2,69),(9.4,73),(12.1,78),(15.2,74),(18.2,71),(21.1,73),(24.2,76),(27.1,78),(29.5,74)]:
 tone(start,4.8,note,.025,.012,.35+(int(start)%4)*.1)
rng=np.random.default_rng(42);noise=rng.normal(0,1,N)
wind=np.convolve(noise,np.ones(61)/61,mode='same')*.009*np.sin(np.pi*np.clip(t/35,0,1))
audio+=wind[:,None]
fade=np.minimum(np.clip(t/1.4,0,1),np.clip((duration-t)/2.4,0,1))
audio*=fade[:,None];audio*=.36/max(np.max(np.abs(audio)),1e-8)
path=Path('.deploy-check/beijing-flight/ascent-score.wav')
with wave.open(str(path),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((audio*32767).astype('<i2').tobytes())
print(path,N/sr,flush=True)
