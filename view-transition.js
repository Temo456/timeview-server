/* A short camera flight made from bounded scene snapshots. No second WebGL
 * renderer, texture decode, per-frame readback, or full-resolution screenshots. */
(function(){
  'use strict';
  const DURATION=1300,PIXELS=1500000;
  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=(a,b,t)=>{const p=clamp((t-a)/(b-a));return p*p*(3-2*p);};
  function surface(width,height,ratio=1){
    const canvas=document.createElement('canvas');
    const scale=Math.min(ratio,Math.sqrt(PIXELS/(width*height)));
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    return canvas;
  }
  function capture(source,earth,{feather=false,globe=null}={}){
    const width=innerWidth,height=innerHeight,background=surface(width,height);
    const ctx=background.getContext('2d');ctx.drawImage(source,0,0,background.width,background.height);
    const visible=earth&&[earth.x,earth.y,earth.r].every(Number.isFinite)&&earth.r>0&&earth.x>0&&earth.x<width&&earth.y>0&&earth.y<height;
    let disc=null,soft=null;
    if(visible){
      const side=Math.min(768,Math.max(32,Math.ceil(earth.r*2*(devicePixelRatio||1))));
      disc=surface(side,side);const d=disc.getContext('2d');
      d.beginPath();d.arc(side/2,side/2,side/2,0,Math.PI*2);d.clip();
      const sx=source.width/width,sy=source.height/height;
      d.drawImage(source,(earth.x-earth.r)*sx,(earth.y-earth.r)*sy,earth.r*2*sx,earth.r*2*sy,0,0,side,side);
      ctx.save();ctx.scale(background.width/width,background.height/height);
      ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(earth.x,earth.y,earth.r,0,Math.PI*2);ctx.fill();ctx.restore();
      if(feather){
        soft=surface(width,height);const s=soft.getContext('2d');s.drawImage(background,0,0);
        s.scale(soft.width/width,soft.height/height);s.globalCompositeOperation='destination-in';
        const edge=Math.min(earth.x,width-earth.x,earth.y,height-earth.y);
        const mask=s.createRadialGradient(earth.x,earth.y,Math.min(edge*.65,earth.r*1.2),earth.x,earth.y,edge);
        mask.addColorStop(0,'#fff');mask.addColorStop(1,'#fff0');s.fillStyle=mask;s.fillRect(0,0,width,height);
      }
    }
    return {background,disc,soft,globe,earth:visible?{...earth}:null,width,height,
      dispose(){background.width=background.height=1;if(disc)disc.width=disc.height=1;if(soft)soft.width=soft.height=1;if(globe)globe.width=globe.height=1;}};
  }
  function fly(from,to,{toward,onFinish,duration=DURATION}){
    const canvas=surface(innerWidth,innerHeight,Math.min(devicePixelRatio||1,1.5));
    canvas.id='viewFlight';canvas.setAttribute('aria-hidden','true');
    const ctx=canvas.getContext('2d'),width=innerWidth,height=innerHeight;
    const a=from.earth,b=to.earth,travel=!!(a&&b);
    const earthFrame=toward==='solar'?from:to,solarFrame=toward==='solar'?to:from;
    const stars=Array.from({length:width<650?26:46},(_,i)=>({angle:i*2.399963,r:.2+((i*17)%37)/46,length:8+(i*11)%25}));
    let raf=0,done=false,start=null,last=null,progressTime=0,resolve;
    const state={from:toward==='solar'?'earth':'solar',to:toward,progress:0,earth:null,start:a,end:b};
    const promise=new Promise(r=>{resolve=r});
    document.body.dataset.viewTransition=toward;document.body.append(canvas);
    function finish(completed=false){
      if(done)return;done=true;cancelAnimationFrame(raf);
      const elapsed=Math.max(0,performance.now()-(start??performance.now()));
      try{onFinish(elapsed);}finally{
        canvas.remove();canvas.width=canvas.height=1;from.dispose();to.dispose();
        delete document.body.dataset.viewTransition;resolve(true);
      }
    }
    function background(frame,alpha,scale=1,x=width/2,y=height/2,tx=x,ty=y,soft=false){
      if(alpha<=0)return;
      ctx.save();ctx.globalAlpha=alpha;ctx.translate(tx,ty);ctx.scale(scale,scale);
      ctx.drawImage(soft&&frame.soft?frame.soft:frame.background,-x,-y,width,height);ctx.restore();
    }
    function draw(t){
      ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
      ctx.globalAlpha=1;ctx.fillStyle='#080f20';ctx.fillRect(0,0,width,height);
      if(!travel){
        for(const [f,alpha] of [[from,1-t],[to,t]]){
          background(f,alpha);
          if(f.disc&&f.earth){ctx.globalAlpha=alpha;ctx.drawImage(f.disc,f.earth.x-f.earth.r,f.earth.y-f.earth.r,2*f.earth.r,2*f.earth.r);}
        }
        ctx.globalAlpha=1;return;
      }
      const e=t*t*t*(t*(t*6-15)+10),s=Math.sin(Math.PI*e);
      const bend=Math.min(48,Math.hypot(b.x-a.x,b.y-a.y)*.16);
      const x=a.x+(b.x-a.x)*e,y=a.y+(b.y-a.y)*e-bend*s;
      const r=Math.exp(Math.log(a.r)+(Math.log(b.r)-Math.log(a.r))*e);
      state.earth={x,y,r};
      const out=toward==='solar',earthWeight=out?1-smooth(.08,.72,t):smooth(.3,.94,t);
      const solar=solarFrame.earth,earth=earthFrame.earth;
      // The surrounding planets follow the same camera origin as the globe.
      // On return this makes the actual solar Earth the unmistakable zoom origin.
      background(solarFrame,1-earthWeight,Math.min(12,r/solar.r),solar.x,solar.y,x,y);
      const lift=out?smooth(0,.2,t):1-smooth(.8,1,t);
      background(earthFrame,earthWeight*(1-lift));
      background(earthFrame,earthWeight*lift,r/earth.r,earth.x,earth.y,x,y,true);
      // Restrained radial trails add depth without shader passes or blur filters.
      ctx.save();ctx.strokeStyle='#a4dce8';ctx.lineWidth=.7;
      for(const star of stars){
        const distance=Math.hypot(width,height)*star.r;
        const length=star.length*Math.sin(Math.PI*t),dx=Math.cos(star.angle),dy=Math.sin(star.angle);
        ctx.globalAlpha=.28*Math.sin(Math.PI*t)**2;
        ctx.beginPath();ctx.moveTo(x+dx*distance,y+dy*distance);ctx.lineTo(x+dx*(distance+length),y+dy*(distance+length));ctx.stroke();
      }
      ctx.restore();
      const glow=ctx.createRadialGradient(x,y,r*.94,x,y,r+Math.max(7,r*.16));
      glow.addColorStop(0,'rgba(99,210,246,0)');glow.addColorStop(.35,'rgba(99,210,246,'+(.26*Math.sin(Math.PI*t))+')');glow.addColorStop(1,'rgba(99,210,246,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r+Math.max(7,r*.16),0,Math.PI*2);ctx.fill();
      // Match the two real renderings at small scale; never enlarge a tiny
      // solar screenshot into the detailed Earth map on the return flight.
      if(out&&earthFrame.globe)ctx.drawImage(earthFrame.globe,x-r,y-r,r*2,r*2);
      ctx.drawImage(from.disc,x-r,y-r,r*2,r*2);
      if(earthFrame.globe){
        ctx.globalAlpha=out?smooth(.03,.26,t):smooth(.04,.34,t);
        ctx.drawImage(earthFrame.globe,x-r,y-r,r*2,r*2);
      }
      const blend=out?smooth(.66,.96,t):smooth(.76,1,t);
      ctx.globalAlpha=blend;ctx.drawImage(to.disc,x-r,y-r,r*2,r*2);ctx.globalAlpha=1;
    }
    function frame(now){
      if(done)return;if(start===null)start=now;
      if(last!==null)progressTime+=Math.min(64,Math.max(0,now-last));last=now;
      const t=clamp(progressTime/duration);state.progress=t;
      try{draw(t);}catch(error){finish();console.warn('View flight interrupted',error);return;}
      if(t===1)finish(true);else raf=requestAnimationFrame(frame);
    }
    try{draw(0);raf=requestAnimationFrame(frame);}catch(error){finish();throw error;}
    return {promise,finish,get state(){return {...state};}};
  }
  function cover(frame){
    const canvas=surface(frame.width,frame.height);canvas.id='viewFlightCover';canvas.setAttribute('aria-hidden','true');
    const ctx=canvas.getContext('2d');ctx.drawImage(frame.background,0,0,canvas.width,canvas.height);
    if(frame.disc){
      const {x,y,r}=frame.earth;ctx.scale(canvas.width/frame.width,canvas.height/frame.height);ctx.drawImage(frame.disc,x-r,y-r,r*2,r*2);
    }
    document.body.append(canvas);
    return {dispose(){canvas.remove();canvas.width=canvas.height=1;}};
  }
  window.TimeviewTransition={capture,cover,fly,duration:DURATION,returnDuration:450};
})();
