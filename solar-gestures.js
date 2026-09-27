/* A single Pointer Events owner. Positions are consumed once per render frame. */
(function (root) {
  'use strict';
  root.createSolarGestures=function(canvas,actions,overlays=[]){
    const points=new Map();
    let previous=[],mode='rotate',moved=false,multi=false,announced=false;
    let origin=null,lastAt=0,lastMove=0,blockClickUntil=0,wheel=null;
    const snapshot=()=>Array.from(points.values(),p=>({...p}));
    const rebase=()=>{previous=snapshot();lastAt=performance.now();};
    const announce=()=>{if(!announced){announced=true;actions.interact();}};
    function update(now=performance.now()){
      if(wheel){const w=wheel;wheel=null;actions.zoom(w,w,Math.exp(Math.max(-1,Math.min(1,w.delta))));}
      const current=snapshot();if(!current.length||current.length!==previous.length)return;
      const a=current[0],p=previous[0];
      if(current.length>=2){
        const b=current[1],q=previous[1];
        if(a.x!==p.x||a.y!==p.y||b.x!==q.x||b.y!==q.y){
          announce();moved=true;lastMove=now;
          actions.zoom({x:(p.x+q.x)/2,y:(p.y+q.y)/2},{x:(a.x+b.x)/2,y:(a.y+b.y)/2},
            Math.max(16,Math.hypot(p.x-q.x,p.y-q.y))/Math.max(16,Math.hypot(a.x-b.x,a.y-b.y)));
        }
      }else if(a.x!==p.x||a.y!==p.y){
        if(!moved&&Math.hypot(a.x-origin.x,a.y-origin.y)<5)return;
        announce();moved=true;lastMove=now;
        const dt=Math.max(1/240,Math.min(.1,(now-lastAt)/1000));
        if(mode==='pan')actions.zoom(p,a,1);
        else if(mode==='orbit')actions.orbit(a,dt);
        else actions.rotate(a.x-p.x,a.y-p.y,dt);
      }
      previous=current;lastAt=now;
    }
    function start(e){
      if(e.pointerType==='mouse'&&![0,1,2].includes(e.button))return;
      e.preventDefault();update();
      const p={id:e.pointerId,x:e.clientX,y:e.clientY,type:e.pointerType,button:e.button,target:e.target};
      if(!points.size){
        moved=multi=announced=false;origin={...p};lastMove=0;wheel=null;mode=actions.begin(p)||'rotate';
      }
      points.set(p.id,p);
      if(points.size>1){multi=true;moved=true;announce();}
      actions.topology(points.size);rebase();
      try{canvas.setPointerCapture(p.id);}catch(_){}
    }
    for(const surface of [canvas,...overlays])surface.addEventListener('pointerdown',start);
    document.addEventListener('pointermove',e=>{
      const p=points.get(e.pointerId);if(!p)return;
      p.x=e.clientX;p.y=e.clientY;
    },true);
    function finish(e,cancelled){
      if(!points.has(e.pointerId))return;
      if(cancelled){cancel();return;}
      const p=points.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;update();
      points.delete(e.pointerId);
      if(moved||multi)blockClickUntil=performance.now()+400;
      if(points.size){
        // Never resume an old planet/date drag after a multi-pointer gesture.
        mode='rotate';origin={...points.values().next().value};actions.topology(points.size);rebase();
      }else{
        if(!moved&&!multi&&mode!=='pan')actions.tap(p);
        actions.end(!multi&&moved&&performance.now()-lastMove<80,mode);
        previous=[];
      }
      try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch(_){}
    }
    function cancel(){
      const ids=Array.from(points.keys());points.clear();previous=[];wheel=null;
      blockClickUntil=performance.now()+400;actions.end(false,mode);
      for(const id of ids)try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch(_){}
    }
    document.addEventListener('pointerup',e=>finish(e,false),true);
    document.addEventListener('pointercancel',e=>finish(e,true),true);
    canvas.addEventListener('lostpointercapture',e=>{if(points.has(e.pointerId))cancel();});
    for(const surface of [canvas,...overlays])surface.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<blockClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();if(points.size)return;
      if(!wheel){actions.begin({x:e.clientX,y:e.clientY,type:'wheel'});actions.interact();wheel={x:e.clientX,y:e.clientY,delta:0};}
      wheel.delta+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1)*.0015;
    },{passive:false});
    window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
    return {update,cancel,get active(){return points.size>0;}};
  };
})(globalThis);
