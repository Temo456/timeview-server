/* Lightweight 2D accents above the solar scene. The scene owns the only RAF. */
(function(global){
  'use strict';
  global.createGodHandEffects=function(root){
    const canvas=document.createElement('canvas');canvas.className='god-hand-fx';canvas.setAttribute('aria-hidden','true');
    const badge=document.createElement('div');badge.className='god-hand-status';badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');badge.hidden=true;
    root.append(canvas,badge);
    const ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    let enabled=false,width=0,height=0,dpr=1,last=null,lastSeen=0,samples=[],dirty=false;
    const status=text=>{if(badge.textContent!==text)badge.textContent=text;};
    const idle=()=>status('☝ 上帝之手已开启 · 拖动星球拨动时间');
    function clear(){
      if(ctx&&dirty)ctx.clearRect(0,0,width,height);
      dirty=false;last=null;samples=[];lastSeen=0;
      if(enabled)idle();
    }
    function resize(){
      const nextDpr=Math.min(global.devicePixelRatio||1,1.5),w=global.innerWidth,h=global.innerHeight;
      if(w===width&&h===height&&dpr===nextDpr)return;
      clear();width=w;height=h;dpr=nextDpr;canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);
      if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function ring(x,y,r,start,end,color,lineWidth=1.5){
      ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
    }
    function glow(x,y,r,alpha){
      const g=ctx.createRadialGradient(x,y,r*.8,x,y,r*1.35);
      g.addColorStop(0,'rgba(72,215,246,0)');g.addColorStop(.4,'rgba(92,223,250,'+(alpha*.045)+')');
      g.addColorStop(.65,'rgba(244,198,103,'+(alpha*.035)+')');g.addColorStop(1,'rgba(80,210,244,0)');
      ctx.fillStyle=g;ctx.fillRect(x-r*1.4,y-r*1.4,r*2.8,r*2.8);
    }
    function render(input,now=performance.now()){
      if(!enabled||!ctx)return;
      resize();
      if(input&&Number.isFinite(input.x)&&Number.isFinite(input.y)){
        if(last&&last.key!==input.key)clear();
        last={...input};lastSeen=now;
        const tail=samples[samples.length-1];
        if(!reduced.matches&&input.phase!=='hold'&&(!tail||Math.hypot(input.x-tail.x,input.y-tail.y)>2)){
          // A large projection jump should never draw a beam across the screen.
          if(tail&&Math.hypot(input.x-tail.x,input.y-tail.y)>Math.min(width,height)*.4)samples=[];
          samples.push({x:input.x,y:input.y,t:now});if(samples.length>48)samples.shift();
        }
        status(input.phase==='inertia'?'✦ '+input.name+' · 惯性流转':'☝ '+input.name+(input.phase==='hold'?' · 已抓取':' · 正在拨动时间'));
      }
      if(!last)return;
      const fade=input?1:clamp(1-(now-lastSeen)/650,0,1);
      if(fade<=0){clear();return;}
      samples=samples.filter(p=>now-p.t<950);
      ctx.clearRect(0,0,width,height);dirty=true;ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
      const strength=clamp(last.strength??1,.25,1),alpha=fade*(last.phase==='hold'?.65:.65+.35*strength);
      const {x,y}=last,r=clamp(last.radius+2,4,Math.max(12,Math.min(width,height)*.42));
      const t=reduced.matches?0:now/1000;
      glow(x,y,r,alpha);
      if(!reduced.matches){
        for(let i=1;i<samples.length;i++){
          const a=samples[i-1],b=samples[i],life=clamp(1-(now-b.t)/950,0,1)*alpha;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineWidth=3+4*i/samples.length;
          ctx.strokeStyle='rgba(66,206,247,'+life*.3+')';ctx.shadowColor='#55dfff';ctx.shadowBlur=12;ctx.stroke();
          ctx.lineWidth=1.4;ctx.strokeStyle='rgba(215,250,255,'+life*.75+')';ctx.shadowBlur=0;ctx.stroke();
        }
      }
      // Two faint, close-fitting highlights instead of a large reticle.
      ctx.globalAlpha=alpha;ctx.shadowColor='#f2cb7d';ctx.shadowBlur=3;
      for(let i=0;i<2;i++)ring(x,y,r,t*.4+i*Math.PI,t*.4+i*Math.PI+.6,'rgba(242,203,125,.42)',.8);
      ctx.shadowBlur=0;
      if(!reduced.matches&&last.phase!=='hold'){
        for(let i=0;i<9;i++){
          const a=t*(.45+i*.013)+i*2.39996,rr=r+6+Math.sin(t*1.6+i)*3;
          const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr,size=1+(i%3)*.35;
          ctx.fillStyle=i%2?'rgba(112,236,255,.75)':'rgba(255,222,149,.85)';ctx.beginPath();ctx.arc(px,py,size,0,TAU);ctx.fill();
        }
      }
      if(input?.pointer&&input.phase!=='inertia'){
        const p=input.pointer,dx=x-p.x,dy=y-p.y,distance=Math.hypot(dx,dy);
        if(distance>8){
          const bend=Math.min(40,distance*.18),cx=(x+p.x)/2-dy/distance*bend,cy=(y+p.y)/2+dx/distance*bend;
          ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(cx,cy,x,y);ctx.strokeStyle='rgba(70,208,252,.35)';ctx.lineWidth=7;ctx.shadowColor='#5ddcff';ctx.shadowBlur=15;ctx.stroke();
          ctx.lineWidth=1.4;ctx.strokeStyle='rgba(230,249,255,.88)';ctx.shadowBlur=0;ctx.stroke();
          if(!reduced.matches)for(let i=0;i<3;i++){
            const u=(t*.8+i/3)%1,v=1-u;ctx.beginPath();ctx.arc(v*v*p.x+2*v*u*cx+u*u*x,v*v*p.y+2*v*u*cy+u*u*y,2.2,0,TAU);ctx.fillStyle='#ffe4a7';ctx.fill();
          }
        }
        ring(p.x,p.y,8,0,TAU,'rgba(228,249,255,.85)',1.3);
        ring(p.x,p.y,13,0,TAU,'rgba(100,224,255,.45)',1);
      }
      ctx.restore();
    }
    return {setEnabled(on){enabled=!!on;badge.hidden=!enabled;canvas.hidden=!enabled;clear();if(enabled){resize();idle();}},clear,render,dispose(){clear();canvas.remove();badge.remove();}};
  };
})(globalThis);
