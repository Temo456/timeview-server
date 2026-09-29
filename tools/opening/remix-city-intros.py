"""Reproduce the v4.0.20 intro audio and preview stills from existing project media."""
from pathlib import Path
import subprocess

server = Path(__file__).resolve().parents[2]
textures = server / 'textures'
work = server.parent / '.deploy-check' / 'v420-media'
work.mkdir(parents=True, exist_ok=True)
score = work / 'ascent-score.wav'

def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-y', '-loglevel', 'error', *map(str, args)], check=True)

# Preserve the original Shanghai score's 6.6 LU loudness range, with a measured
# linear gain to approximately -16 LUFS and a smooth end at the Earth arrival.
ffmpeg('-i', textures / 'disney-up-to-timeview.mp4', '-vn', '-t', '15', '-af',
       'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-25.69:measured_TP=-15.52:'
       'measured_LRA=6.60:measured_thresh=-36.37:offset=0:linear=true,'
       'afade=t=in:d=0.12,afade=t=out:st=14.5:d=0.5',
       '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', score)

sources = [
    ('intro-beijing-v417.mp4', 'intro-beijing-v420.mp4', '160k'),
    ('intro-beijing-v417-mobile.mp4', 'intro-beijing-v420-mobile.mp4', '128k'),
    ('disney-up-to-timeview-web.mp4', 'intro-shanghai-v420.mp4', '160k'),
    ('intro-v406.mp4', 'intro-shanghai-v420-mobile.mp4', '128k'),
]
for source, destination, bitrate in sources:
    ffmpeg('-i', textures / source, '-i', score, '-map', '0:v:0', '-map', '1:a:0',
           '-c:v', 'copy', '-c:a', 'aac', '-b:a', bitrate, '-t', '15',
           '-movflags', '+faststart', textures / destination)
for city, stamp in [('beijing', '0.9'), ('shanghai', '1')]:
    ffmpeg('-ss', stamp, '-i', textures / f'intro-{city}-v420.mp4', '-frames:v', '1',
           '-vf', 'scale=480:-2', '-q:v', '4', textures / f'intro-{city}-v420-poster.jpg')
for file in sorted(textures.glob('*v420*')):
    print(file.name, file.stat().st_size)
