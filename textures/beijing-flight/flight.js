import * as THREE from './three.module.js';
const R=6371,DEG=Math.PI/180,DURATION=15;
const offline=new URLSearchParams(location.search).has('render');
document.body.classList.toggle('render',offline);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#scene'),antialias:true,alpha:false,preserveDrawingBuffer:offline});
renderer.setPixelRatio(offline?1:Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#050a18');
const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.01,200000);
const hud=document.querySelector('#hud'),ctx=hud.getContext('2d');
// A restrained radial shutter blur keeps fast changes of scale readable.
// It is removed before the final match into the live Earth interface.
const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{samples:4});
const post=new THREE.Scene(),postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const postMaterial=new THREE.ShaderMaterial({
 uniforms:{frame:{value:target.texture},blur:{value:0},grade:{value:0}},
 vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`uniform sampler2D frame;uniform float blur;uniform float grade;varying vec2 uv0;
 void main(){vec2 d=uv0-.5;vec3 c=vec3(0.);
 for(int i=0;i<7;i++){float k=float(i)/6.-.5;c+=texture2D(frame,uv0+d*k*blur).rgb/7.;}
 vec3 glow=(texture2D(frame,uv0+vec2(.0015,0.)).rgb+texture2D(frame,uv0-vec2(.0015,0.)).rgb)*.5;
 c+=max(glow-.65,0.)*.12*grade;
 c=mix(c,(c-.5)*1.06+.5,grade);c*=mix(vec3(1.),vec3(.99,1.02,1.035),grade*.55);
 c*=1.-grade*.18*smoothstep(.20,.72,length(d));
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`
});
post.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial));
let W=innerWidth,H=innerHeight;function resize(){W=innerWidth;H=innerHeight;renderer.setSize(W,H);target.setSize(W*renderer.getPixelRatio(),H*renderer.getPixelRatio());camera.aspect=W/H;camera.updateProjectionMatrix();hud.width=W;hud.height=H}resize();addEventListener('resize',resize);
const smooth=(a,b,t)=>{const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return x*x*(3-2*x)};
const mix=THREE.MathUtils.lerp;
const point=(lon,lat,r=R)=>new THREE.Vector3(r*Math.cos(lat*DEG)*Math.sin(lon*DEG),r*Math.sin(lat*DEG),r*Math.cos(lat*DEG)*Math.cos(lon*DEG));
// Keep near-ground vertices close to the origin to avoid float jitter during takeoff.
const origin=point(116.3912648,39.9073385);
const mercator=(x,y)=>[x/6378137/DEG,(2*Math.atan(Math.exp(y/6378137))-Math.PI/2)/DEG];
const loader=new THREE.TextureLoader();const load=async f=>{const t=await loader.loadAsync(f);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t};
const [spec,rings]=await Promise.all([fetch('imagery.json').then(r=>r.json()),fetch('rings.json').then(r=>r.json())]);
const textures=await Promise.all(spec.map(s=>load(s.file)));
const [nearTexture,closeTexture,poleTexture,cloudTexture]=await Promise.all([load('tiananmen-wide.png'),load('tiananmen-close.png'),load('../earth-north-pole.png'),load('../earth_clouds.png')]);

function surface(bounds,isWorld=false,geographic=false){
 const N=isWorld?128:48,M=isWorld?64:48,pos=[],uv=[],index=[];
 for(let iy=0;iy<=M;iy++)for(let ix=0;ix<=N;ix++){
  const u=ix/N,v=iy/M;
  const lonlat=isWorld?[mix(-180,180,u),mix(90,-90,v)]:geographic?[mix(bounds[0],bounds[2],u),mix(bounds[3],bounds[1],v)]:mercator(mix(bounds[0],bounds[2],u),mix(bounds[3],bounds[1],v));
  const p=point(...lonlat).sub(origin);pos.push(p.x,p.y,p.z);uv.push(u,1-v);
 }
 for(let y=0;y<M;y++)for(let x=0;x<N;x++){const a=y*(N+1)+x,b=a+1,c=a+N+1,d=c+1;index.push(a,c,b,b,c,d)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
const world=new THREE.Mesh(surface(null,true),new THREE.MeshBasicMaterial({map:textures.at(-1)}));scene.add(world);
const sunlight=point(118,42,1);
world.material.onBeforeCompile=shader=>{
 shader.uniforms.sunlight={value:sunlight};
 shader.vertexShader='varying vec3 geographicNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngeographicNormal=normalize(mat3(modelMatrix)*normal);');
 shader.fragmentShader='varying vec3 geographicNormal;uniform vec3 sunlight;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight*=.28+.72*sqrt(max(0.,dot(normalize(geographicNormal),sunlight)));\n#include <opaque_fragment>');
};
const patches=[];
for(let i=spec.length-2;i>=0;i--){
 const item=spec[i],mat=new THREE.MeshBasicMaterial({map:textures[i],transparent:true,depthWrite:false,depthTest:false});
 mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat edge=min(min(vMapUv.x,1.-vMapUv.x),min(vMapUv.y,1.-vMapUv.y));diffuseColor.a*=smoothstep(0.,.08,edge);')};
 const mesh=new THREE.Mesh(surface(item.bounds4326||item.bbox,false,!!item.bounds4326),mat);mesh.renderOrder=spec.length-i;scene.add(mesh);patches.push({mesh,width:item.widthKm});
}
const nearMat=new THREE.MeshBasicMaterial({map:nearTexture,transparent:true,depthWrite:false,depthTest:false});
nearMat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat edge=min(min(vMapUv.x,1.-vMapUv.x),min(vMapUv.y,1.-vMapUv.y));diffuseColor.a*=smoothstep(0.,.12,edge);')};
const near=new THREE.Mesh(surface([spec[0].bbox[0]-2400,...spec[0].bbox.slice(1)]),nearMat);near.renderOrder=20;scene.add(near);
const tx=6378137*116.3912648*DEG,ty=6378137*Math.log(Math.tan(Math.PI/4+39.9073385*DEG/2)),cs=780,ccy=ty-.12*cs;
const closeMat=nearMat.clone();closeMat.map=closeTexture;closeMat.onBeforeCompile=nearMat.onBeforeCompile;
const close=new THREE.Mesh(surface([tx-cs/2,ccy-cs/2,tx+cs/2,ccy+cs/2]),closeMat);close.renderOrder=21;scene.add(close);
const clouds=new THREE.Mesh(surface(null,true),new THREE.MeshBasicMaterial({color:'#edf7ff',map:cloudTexture,transparent:true,depthWrite:false,opacity:0}));clouds.scale.setScalar(1.002);clouds.position.copy(origin).multiplyScalar(.002);clouds.renderOrder=30;scene.add(clouds);
const starPoints=[];for(let i=0;i<700;i++){const lon=(i*137.508)%360,lat=Math.asin(-1+2*(i+.5)/700)/DEG;starPoints.push(...point(lon,lat,90000).sub(origin).toArray())}
const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(starPoints,3)),new THREE.PointsMaterial({color:'#dae9fc',size:1.2,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false}));scene.add(stars);

const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(R*1.014,96,64),new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,uniforms:{strength:{value:0}},vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n;varying vec3 v;uniform float strength;void main(){float rim=pow(1.-abs(dot(n,v)),3.5);gl_FragColor=vec4(.22,.54,.88,rim*strength);}' }));atmosphere.position.copy(origin).negate();scene.add(atmosphere);
const roadLayers=[];
const roadColors=['#ffeab4','#ffda8f','#dceaaa','#8de5d9','#70dfff'];
for(const [i,name] of Object.keys(rings).entries()){
 const vertices=[];
 for(const way of rings[name])for(let j=1;j<way.length;j++)for(const pt of [way[j-1],way[j]])vertices.push(...point(pt[0],pt[1],R+.007).sub(origin).toArray());
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:roadColors[i],transparent:true,depthTest:false,opacity:0}));line.renderOrder=50;scene.add(line);roadLayers.push(line);
}
const axialPoints=[[116.3931127,39.8710619],[116.3916177,39.8991843],[116.3912648,39.9073385],[116.3904844,39.9235271],[116.3897445,39.9393499],[116.3896403,39.9410217]];
// Use the city's axis as screen-up throughout Beijing, rather than banking
// around geographic north. Register the north-up reconstructions to it too.
const beijingNormal=origin.clone().normalize();
const beijingNorth=new THREE.Vector3(-Math.sin(39.9073385*DEG)*Math.sin(116.3912648*DEG),Math.cos(39.9073385*DEG),-Math.sin(39.9073385*DEG)*Math.cos(116.3912648*DEG));
const beijingAxis=point(...axialPoints.at(-1),1).sub(point(...axialPoints[0],1)).projectOnPlane(beijingNormal).normalize();
const axisBank=Math.atan2(beijingNormal.dot(beijingNorth.clone().cross(beijingAxis)),beijingNorth.dot(beijingAxis));
const axisRegistration=new THREE.Quaternion().setFromAxisAngle(beijingNormal,axisBank);
near.geometry.applyQuaternion(axisRegistration);close.geometry.applyQuaternion(axisRegistration);
const axis=new THREE.Line(new THREE.BufferGeometry().setFromPoints(axialPoints.map(p=>point(...p,R+.01).sub(origin))),new THREE.LineBasicMaterial({color:'#ffe6a5',transparent:true,depthTest:false}));axis.renderOrder=51;scene.add(axis);
const screen=ll=>{const p=point(...ll,R+.012).sub(origin).project(camera);return[(p.x*.5+.5)*W,(-p.y*.5+.5)*H,p.z]};
const ringAnchors=Object.values(rings).map(ways=>ways.flat().filter(p=>p[0]>116.4&&p[1]>39.91).sort((a,b)=>Math.abs(Math.atan2(a[1]-39.9073,(a[0]-116.3913)*.767)-.58)-Math.abs(Math.atan2(b[1]-39.9073,(b[0]-116.3913)*.767)-.58))[0]);
function label(text,ll,opacity,color='#f3e2ba',dx=0,dy=0){
 if(opacity<.01)return;const[x,y,z]=screen(ll);if(z>1||x<-100||x>W+100||y<-100||y>H+100)return;
 ctx.save();ctx.globalAlpha=opacity;ctx.font=`${Math.max(12,H/58)}px 'Microsoft YaHei',sans-serif`;ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=7;ctx.fillStyle=color;ctx.fillText(text,x+dx,y+dy);ctx.restore();
}
// Monotone cubic interpolation in log altitude keeps velocity continuous and
// never reverses the ascent at a chapter boundary.
const keys=[[0,.30],[.75,.43],[1.65,1.4],[2.7,5.5],[3.65,16],[4.8,48],[6,140],[7.1,640],[8.4,2900],[9.7,9000],[11.25,21000],[12.65,24600],[15,24600]];
const slopes=keys.slice(0,-1).map((p,i)=>(Math.log(keys[i+1][1])-Math.log(p[1]))/(keys[i+1][0]-p[0]));
const tangents=keys.map((_,i)=>i===0?0:i===keys.length-1?0:slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
function altitude(t){let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;const[a,va]=keys[i],[b,vb]=keys[i+1],h=b-a,u=THREE.MathUtils.clamp((t-a)/h,0,1);return Math.exp((2*u**3-3*u*u+1)*Math.log(va)+(u**3-2*u*u+u)*h*tangents[i]+(-2*u**3+3*u*u)*Math.log(vb)+(u**3-u*u)*h*tangents[i+1])}
const stages=[['北京','BEIJING  /  从天安门出发',0,3],['北京 · 二环至六环','沿着中轴，向外展开',3,6.4],['中国','CHINA  /  山河入画',6.4,9.6],['地球','EARTH  /  同一颗星球',9.6,12.4],['时间景观','从此刻，读懂我们的世界',12.4,15]];
const starSeed=Array.from({length:170},(_,i)=>({x:((Math.sin(i*47.27+5)*9871)%1+1)%1,y:((Math.sin(i*13.19+8)*9819)%1+1)%1,r:i%7===0?1.1:.6,a:.2+(i%8)/18}));
function drawEnd(t){
 const alpha=smooth(13.55,14.55,t);if(alpha<=0)return;
 ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#050a18';ctx.fillRect(0,0,W,H);
 for(const s of starSeed){ctx.fillStyle=`rgba(230,241,255,${s.a})`;ctx.beginPath();ctx.arc(s.x*W,s.y*H,s.r,0,7);ctx.fill()}
 const radius=Math.min(W,H)*.29,cx=W/2,cy=H/2;
 const glow=ctx.createRadialGradient(cx,cy,radius*.96,cx,cy,radius*1.12);glow.addColorStop(0,'#6ccfff00');glow.addColorStop(.4,'#62cfff50');glow.addColorStop(1,'#62cfff00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,radius*1.12,0,7);ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,7);ctx.clip();ctx.translate(cx,cy);ctx.rotate(165*DEG);ctx.drawImage(poleTexture.image,-radius*1.08,-radius*1.08,radius*2.16,radius*2.16);ctx.restore();
 ctx.globalAlpha=alpha*smooth(13.9,14.8,t);ctx.strokeStyle='#bda66eaa';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(cx,cy,radius*1.2,0,7);ctx.stroke();
 ctx.font=`${H/67}px 'Microsoft YaHei',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
 for(let h=0;h<24;h++){const a=Math.PI/2+h/24*Math.PI*2,r=radius*1.2;ctx.strokeStyle=h%6?'#b4cfdf55':'#e9d4a0';ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*(r+6),cy+Math.sin(a)*(r+6));ctx.stroke();if(h%3===0){ctx.fillStyle='#cfdde8';ctx.fillText(String(h),cx+Math.cos(a)*(r+18),cy+Math.sin(a)*(r+18))}}
 ctx.restore();
}
const roadPaths=Object.values(rings).map(ways=>ways.map(way=>way.map(ll=>point(...ll,R+.012).sub(origin))));
const scratch=new THREE.Vector3();
function drawRoads(t,h){
 const out=1-smooth(5.9,6.65,t),lineScale=H/1080;
 if(t<1.6||out<=0)return;
 roadPaths.forEach((paths,i)=>{
  const on=smooth(1.7+i*.55,2.3+i*.55,t)*out;if(on<.01)return;
  ctx.save();ctx.globalAlpha=on*.85;ctx.strokeStyle=roadColors[i];ctx.lineWidth=(i===0?1.65:1.4)*lineScale;
  ctx.shadowColor=roadColors[i];ctx.shadowBlur=8*lineScale;ctx.beginPath();
  for(const path of paths)path.forEach((v,j)=>{scratch.copy(v).project(camera);const x=(scratch.x*.5+.5)*W,y=(-scratch.y*.5+.5)*H;j?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.stroke();ctx.restore();
 });
 const axisOn=smooth(1.1,1.9,t)*(1-smooth(5.5,6.2,t));
 ctx.save();ctx.globalAlpha=axisOn;ctx.strokeStyle='#fff0b3';ctx.shadowColor='#ffd777';ctx.shadowBlur=11*lineScale;ctx.lineWidth=2.2*lineScale;ctx.beginPath();
 axialPoints.forEach((ll,i)=>{const[x,y]=screen(ll);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.restore();
}
function drawSpeed(t){
 const amount=smooth(6.6,8.8,t)*(1-smooth(11.2,12.7,t));if(amount<=0)return;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.lineWidth=.8*H/1080;
 for(let i=0;i<26;i++){
  const a=i*2.39996,phase=((t*.18+i*.618034)%1),r=H*(.70+phase*.43),len=H*.06*(.3+phase)*amount;
  const x=W/2+Math.cos(a)*r,y=H/2+Math.sin(a)*r;
  const g=ctx.createLinearGradient(x,y,x+Math.cos(a)*len,y+Math.sin(a)*len);g.addColorStop(0,'#8ddfff00');g.addColorStop(1,`rgba(159,219,255,${.23*amount*Math.sin(phase*Math.PI)})`);ctx.strokeStyle=g;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);ctx.stroke();
 }
 const glow=ctx.createRadialGradient(W*.87,H*.15,0,W*.87,H*.15,H*.45);glow.addColorStop(0,`rgba(101,186,255,${amount*.16})`);glow.addColorStop(.25,`rgba(66,123,215,${amount*.06})`);glow.addColorStop(1,'#5fb4ff00');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.restore();
}
function render(t){
 t=Math.min(DURATION,Math.max(0,t));
 const h=altitude(t),china=smooth(6.2,9.5,t),polar=smooth(10.8,13.5,t);
 const lon=mix(116.3912648,105,china),lat=mix(mix(39.9073385,35,china),89.999,polar);
 const n=point(lon,lat,1),up=new THREE.Vector3(-Math.sin(lat*DEG)*Math.sin(lon*DEG),Math.cos(lat*DEG),-Math.sin(lat*DEG)*Math.cos(lon*DEG));
 // Hold Tiananmen level and the Central Axis upright until Beijing has receded.
 // Only then blend into the original China/Earth heading and polar arrival.
 const bank=mix(axisBank,5*DEG,smooth(6.2,7.6,t))-40*DEG*polar;
 const screenUp=up.clone().applyAxisAngle(n,bank);
 camera.position.copy(n).multiplyScalar(R+h);camera.position.addScaledVector(screenUp,-h*.12*(1-smooth(0,3,t)));camera.position.sub(origin);camera.up.copy(screenUp);camera.lookAt(n.clone().multiplyScalar(R).sub(origin));camera.near=Math.max(.003,h*.0001);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 for(const p of patches){p.mesh.material.opacity=1-smooth(p.width*.60,p.width*1.12,h);p.mesh.visible=p.mesh.material.opacity>.001;}
 // Keep the registered detail until it occupies a small part of the frame.
 // Previously it vanished while still filling the screen, exposing blurry LODs.
 nearMat.opacity=1-smooth(2.3,5.0,h);near.visible=nearMat.opacity>.001;
 closeMat.opacity=1-smooth(.88,1.85,h);close.visible=closeMat.opacity>.001;
 clouds.material.opacity=.36*smooth(3500,12000,h)*(1-smooth(12.6,13.55,t));stars.material.opacity=.7*smooth(8.5,11,t);
 atmosphere.material.uniforms.strength.value=.95*smooth(250,8000,h);
 roadLayers.forEach(line=>line.visible=false);axis.visible=false;
 const endFade=1-smooth(12.8,13.5,t);
 postMaterial.uniforms.blur.value=.004*smooth(.6,2.5,t)*(1-smooth(10.8,12.5,t));postMaterial.uniforms.grade.value=.8*endFade;
 renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(post,postCamera);ctx.clearRect(0,0,W,H);
 drawRoads(t,h);drawSpeed(t);
 label('天安门',[116.3912648,39.9073385],smooth(.2,.65,t)*(1-smooth(1.4,2,t)),'#fff5da',18,-20);
 label('中轴线',[116.3897445,39.9393499],smooth(1.5,2.1,t)*(1-smooth(5.1,5.8,t)),'#ffe2a0',12,-8);
 Object.keys(rings).forEach((name,i)=>label(name,ringAnchors[i],smooth(2+i*.5,2.5+i*.5,t)*(1-smooth(5.9,6.5,t)),roadColors[i],8,-6));
 drawEnd(t);
 const stage=stages.find(s=>t>=s[2]&&t<s[3])||stages.at(-1),alpha=Math.min(smooth(stage[2],stage[2]+.45,t),1-smooth(stage[3]-.3,stage[3],t));
 const left=W*.055,top=H*.10;
 ctx.save();ctx.globalAlpha=t>=12.4?0:alpha;ctx.shadowColor='#000a';ctx.shadowBlur=18;
 ctx.fillStyle='#b3eaff';ctx.fillRect(left,top-H*.025,2,H*.025);
 ctx.fillStyle='#f6ead3';ctx.font=`${Math.max(23,H*.038)}px 'Microsoft YaHei',sans-serif`;ctx.fillText(stage[0],left+H*.017,top);
 ctx.font=`${Math.max(11,H*.014)}px 'Microsoft YaHei',sans-serif`;ctx.fillStyle='#d4e5ed';ctx.fillText(stage[1],left+H*.017,top+H*.032);ctx.restore();
 if(t<12.4){ctx.save();ctx.globalAlpha=.7*smooth(.25,.7,t)*(1-smooth(11.8,12.4,t));ctx.textAlign='right';ctx.font=`${Math.max(10,H*.012)}px 'Microsoft YaHei',sans-serif`;ctx.fillStyle='#d9f4ff';ctx.fillText(`${h<1?(h*1000).toFixed(0)+' m':h.toFixed(h<10?1:0)+' km'}  /  持续升空`,W*.946,H*.098);ctx.restore()}
 ctx.save();ctx.globalAlpha=.64;ctx.fillStyle='#e8eeee';ctx.font=`${Math.max(8,H*.009)}px 'Microsoft YaHei',sans-serif`;ctx.fillText('NASA · EOxCloudless / EOX / Copernicus 2016 (CC BY 4.0)  ·  © OpenStreetMap contributors  ·  近景为动画重建',W*.02,H*.976);ctx.restore();
 window.flightState={t,altitude:h,longitude:lon,latitude:lat,bank:bank/DEG,stage:stage[0],continuous:true,axisScreen:offline?axialPoints.map(screen):undefined};
}
window.renderFlight=render;window.flightDuration=DURATION;
document.querySelector('#loading').style.display='none';window.flightReady=true;
let start=performance.now();function animate(now){if(!offline){render((now-start)/1000);requestAnimationFrame(animate)}}
document.querySelector('#replay').onclick=()=>{start=performance.now()};document.querySelector('#enter').onclick=()=>{sessionStorage.setItem('introPlayed','1');location.href='../../app'};
render(0);if(!offline)requestAnimationFrame(animate);
