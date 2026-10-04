"""Shanghai 15 s opening. Deterministic spherical terrain render + Beijing tail.
Requires: numpy, opencv-python-headless, Pillow, ffmpeg.
Source assets and their provenance: textures/shanghai-flight/SOURCES.md.
"""
from pathlib import Path
import os,sys,json,math,subprocess,argparse
import numpy as np
import cv2
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
MEDIA=ROOT/'textures/shanghai-flight'
D=math.pi/180;R=6371.;M=6378137.;START=(121.6556832,31.1455449)
cv2.setNumThreads(2)
def smooth(a,b,x):
 u=np.clip((x-a)/(b-a),0,1);return u*u*(3-2*u)
def point(lon,lat):
 lo,la=lon*D,lat*D;return np.array([math.cos(la)*math.sin(lo),math.sin(la),math.cos(la)*math.cos(lo)])
KEYS=np.array([[0,.52],[.75,.74],[1.65,1.9],[2.7,6.5],[3.65,16],[4.8,48],[6,140],[7.1,640],[8.4,2900],[9.7,9000],[11.25,21000],[12.65,24600],[15,24600]])
# The original monotone harmonic tangents, including zero start/end velocity.
sl=np.diff(np.log(KEYS[:,1]))/np.diff(KEYS[:,0]);tg=np.zeros(len(KEYS))
for i in range(1,len(KEYS)-1):tg[i]=0 if sl[i-1]*sl[i]<=0 else 2/(1/sl[i-1]+1/sl[i])
def altitude(t):
 i=min(len(KEYS)-2,max(0,np.searchsorted(KEYS[:,0],t,side='right')-1));a,va=KEYS[i];b,vb=KEYS[i+1];h=b-a;u=np.clip((t-a)/h,0,1)
 return math.exp((2*u**3-3*u*u+1)*math.log(va)+(u**3-2*u*u+u)*h*tg[i]+(-2*u**3+3*u*u)*math.log(vb)+(u**3-u*u)*h*tg[i+1])

class Flight:
 def __init__(self,w,h,font):
  self.w,self.h=w,h
  yy,xx=np.mgrid[0:h,0:w];f=math.tan(20*D)
  self.qx=((xx+.5)/w*2-1)*w/h*f;self.qy=(1-(yy+.5)/h*2)*f
  self.A=self.qx**2+self.qy**2+1
  self.spec=json.loads((MEDIA/'imagery.json').read_text())
  self.tex={s['file']:cv2.imread(str(MEDIA/s['file'])) for s in self.spec}
  self.park=cv2.imread(str(MEDIA/'disney-park-reconstruction.jpg'));self.close=cv2.imread(str(MEDIA/'disney-castle-close.jpg'))
  self.registration=json.loads((MEDIA/'registration.json').read_text());self.invH=np.linalg.inv(self.registration['closeToPark'])
  self.fonts={k:ImageFont.truetype(str(font),max(8,round(h*v))) for k,v in [('title',.038),('sub',.014),('label',.017),('credit',.009)]}
  for font in self.fonts.values():
   try:font.set_variation_by_axes([400])
   except (AttributeError,OSError):pass
  self.lut=np.where(np.arange(256)/255<=.04045,np.arange(256)/255/12.92,((np.arange(256)/255+.055)/1.055)**2.4).astype(np.float32)
 def camera(self,t):
  h=altitude(t);china=smooth(6.2,9.5,t);join=1-smooth(5.8,8.25,t)
  lon=116.3912648+(105-116.3912648)*china+(START[0]-116.3912648)*join
  lat=39.9073385+(35-39.9073385)*china+(START[1]-39.9073385)*join
  n=point(lon,lat);up=np.array([-math.sin(lat*D)*math.sin(lon*D),math.cos(lat*D),-math.sin(lat*D)*math.cos(lon*D)])
  bank=5*D*smooth(5.8,7.6,t);up=up*math.cos(bank)+np.cross(n,up)*math.sin(bank)
  C=n*(R+h);C+=up*(-h*.12*(1-smooth(0,3,t)))
  z=C-n*R;z/=np.linalg.norm(z);right=np.cross(up,z);right/=np.linalg.norm(right);up=np.cross(z,right)
  self.cam=(C,right,up,z)
  rays=[self.qx*right[j]+self.qy*up[j]-z[j] for j in range(3)]
  B=sum(C[j]*rays[j] for j in range(3));cc=np.dot(C,C)-R*R;disc=B*B-self.A*cc
  mask=disc>=0;dist=cc/(-B+np.sqrt(np.maximum(0,disc)))
  p=[C[j]+dist*rays[j] for j in range(3)]
  lo=np.arctan2(p[0],p[2])/D;la=np.arcsin(np.clip(p[1]/R,-1,1))/D
  return h,lo,la,mask
 def coords(self,s,lo,la):
  if s.get('world'):return (lo+180)/360,(90-la)/180
  if 'bounds4326' in s:
   a,b,c,d=s['bounds4326'];return (lo-a)/(c-a),(d-la)/(d-b)
  a,b,c,d=s['bbox'];return (M*lo*D-a)/(c-a),(d-M*np.log(np.tan(math.pi/4+la*D/2)))/(d-b)
 def sample(self,img,u,v):
  return self.lut[cv2.remap(img,(u*(img.shape[1]-1)).astype(np.float32),(v*(img.shape[0]-1)).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)]
 def layer(self,out,img,u,v,opacity,edge=.08):
  alpha=(smooth(0,edge,np.minimum.reduce([u,1-u,v,1-v]))*opacity).astype(np.float32)
  if alpha.max()<.001:return out
  sample=self.sample(img,u,v)
  return out*(1-alpha[:,:,None])+sample*alpha[:,:,None]
 def terrain(self,t):
  h,lo,la,mask=self.camera(t)
  layers=[]
  for s in self.spec:
   op=1 if s.get('world') else 1-smooth(s['widthKm']*.60,s['widthKm']*1.12,h)
   if op>.001:layers.append((s,op))
  # Start at the smallest fully opaque patch covering the frame.
  layers.reverse();begin=0
  for i,(s,op) in enumerate(layers):
   u,v=self.coords(s,lo,la)
   if op>.999 and min(u.min(),v.min())>.08 and max(u.max(),v.max())<.92:begin=i
  out=np.empty((self.h,self.w,3),np.float32);out[:]=self.lut[np.array([24,10,5])]
  for s,op in layers[begin:]:
   u,v=self.coords(s,lo,la);out=self.layer(out,self.tex[s['file']],u,v,op)
  # Registration pins the castle base in both textures to the launch point.
  x=M*lo*D;y=M*np.log(np.tan(math.pi/4+la*D/2));cx=M*START[0]*D;cy=M*math.log(math.tan(math.pi/4+START[1]*D/2))
  px=(x-cx)/2400+self.registration['castleParkUV'][0];py=(cy-y)/2400+self.registration['castleParkUV'][1]
  op=1-smooth(2.8,6.0,h)
  if op>.001:out=self.layer(out,self.park,px,py,op,.20)
  op=1-smooth(1.10,2.3,h)
  if op>.001:
   X=px*(self.park.shape[1]-1);Y=py*(self.park.shape[0]-1);m=self.invH;z=m[2,0]*X+m[2,1]*Y+m[2,2]
   u=(m[0,0]*X+m[0,1]*Y+m[0,2])/z/(self.close.shape[1]-1);v=(m[1,0]*X+m[1,1]*Y+m[1,2])/z/(self.close.shape[0]-1)
   out=self.layer(out,self.close,u,v,op,.12)
  # Restrained linear-space contrast and color grade match Beijing's compositor.
  out=(out-.5)*(1+.06*.8)+.5;out*=np.array([1+.035*.8*.55,1+.02*.8*.55,1-.01*.8*.55],np.float32)
  out*= (1-.8*.18*smooth(.20,.72,np.sqrt((self.qx/(2*math.tan(20*D)*self.w/self.h))**2+(self.qy/(2*math.tan(20*D)))**2)))[:,:,None]
  out=np.where(out<=.0031308,12.92*out,1.055*np.maximum(out,0)**(1/2.4)-.055)
  img=np.clip(out*255,0,255).astype(np.uint8);img[~mask]=[24,10,5]
  return img,h
 def project(self,lon,lat):
  C,right,up,z=self.cam;p=point(lon,lat)*R-C;depth=-np.dot(p,z)
  if depth<=0:return None
  return self.w/2+np.dot(p,right)/depth/math.tan(20*D)*self.h/2,self.h/2-np.dot(p,up)/depth/math.tan(20*D)*self.h/2
 def hud(self,img,t):
  im=Image.fromarray(cv2.cvtColor(img,cv2.COLOR_BGR2RGB)).convert('RGBA');layer=Image.new('RGBA',im.size);dr=ImageDraw.Draw(layer)
  def text(x,y,s,font,color,alpha=1,anchor=None):
   fill=(*color,int(255*alpha));dr.text((x,y),s,font=self.fonts[font],fill=fill,stroke_width=1,stroke_fill=(0,0,0,int(110*alpha)),anchor=anchor)
  stages=[('上海 · 迪士尼','SHANGHAI  /  从奇幻童话城堡出发',0,2.8),('上海','园区渐远，城市展开',2.8,6.4),('中国','CHINA  /  山河入画',6.4,9.6)]
  s=next((s for s in stages if s[2]<=t<s[3]),stages[-1]);a=min(smooth(s[2],s[2]+.45,t),1-smooth(s[3]-.3,s[3],t))
  left=self.w*.055;top=self.h*.10
  dr.rectangle([left,top-self.h*.025,left+2,top],fill=(179,234,255,int(255*a)))
  text(left+self.h*.017,top,s[0],'title',(246,234,211),a,anchor='ls');text(left+self.h*.017,top+self.h*.032,s[1],'sub',(212,229,237),a,anchor='ls')
  labels=[('奇幻童话城堡',*START,.3,2.4),('上海迪士尼',*START,2.4,5.5),('陆家嘴',121.501,31.238,3.8,6.0),('黄浦江',121.481,31.226,4.1,6.15),('长江口',121.9,31.5,5.1,6.4)]
  for name,lon,lat,a,b in labels:
   on=smooth(a,a+.4,t)*(1-smooth(b-.4,b,t));p=self.project(lon,lat)
   if on<.01 or p is None:continue
   x,y=p
   if not(20<x<self.w-100 and 30<y<self.h-30):continue
   # Two close city landmarks share a line at this scale: show Lujiazui only.
   if name=='黄浦江':continue
   rr=max(1,self.h/540);dr.ellipse([x-rr,y-rr,x+rr,y+rr],fill=(237,219,167,int(on*255)))
   text(x+8,y-9,name,'label',(255,240,208),on,anchor='ls')
  text(self.w*.02,self.h*.976,'NASA · EOX / Copernicus 2016 (CC BY 4.0)  ·  近景为动画重建','credit',(232,238,238),.64,anchor='ls')
  return cv2.cvtColor(np.asarray(Image.alpha_composite(im,layer).convert('RGB')),cv2.COLOR_RGB2BGR)
 def frame(self,t):
  img,h=self.terrain(t);return self.hud(img,t)

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',default=str(ROOT/'textures/intro-shanghai-v4213.mp4'));p.add_argument('--width',type=int,default=1280);p.add_argument('--fps',type=int,default=60);p.add_argument('--font',default=os.environ.get('OPENING_FONT',str(ROOT/'NotoSansSC.ttf')));p.add_argument('--stills',action='store_true');args=p.parse_args()
 f=Flight(args.width,args.width*9//16,args.font);out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
 if args.stills:
  for t in [0,.75,1.5,2.25,3,4,5,6,7,8,8.4]:cv2.imwrite(str(out.parent/f'shanghai-{t:.2f}.jpg'),f.frame(t));print('STILL',t,flush=True)
  return
 beijing=ROOT/'textures/intro-beijing-v421.mp4';cap=cv2.VideoCapture(str(beijing));assert cap.isOpened()
 ff=subprocess.Popen(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','bgr24','-s',f'{f.w}x{f.h}','-r',str(args.fps),'-i','pipe:0','-i',str(beijing),'-map','0:v','-map','1:a:0','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-profile:v','high','-level:v','3.2','-g',str(args.fps),'-c:a','copy','-t','15','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
 try:
  for i in range(15*args.fps):
   t=i/args.fps
   if i==0 or args.fps!=60:cap.set(cv2.CAP_PROP_POS_MSEC,t*1000)
   ok,tail=cap.read();assert ok,(i,t)
   if tail.shape[1]!=f.w:tail=cv2.resize(tail,(f.w,f.h),interpolation=cv2.INTER_AREA)
   if t<8.9:
    frame=f.frame(t)
    if t>=8.25:frame=cv2.addWeighted(frame,1-smooth(8.25,8.9,t),tail,smooth(8.25,8.9,t),0)
   else:frame=tail
   ff.stdin.write(frame.tobytes())
   if i%60==0:print('FRAME',i,'/',15*args.fps,flush=True)
 finally:
  ff.stdin.close();cap.release()
 if ff.wait():raise RuntimeError('ffmpeg failed')
 print('COMPLETE',out,out.stat().st_size,flush=True)
if __name__=='__main__':main()
