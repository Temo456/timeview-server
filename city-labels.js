/* Compact, complete mobile city labels. Pure geometry; no DOM or per-frame
 * text measurement. The scene caches a layout until geometry/time changes. */
(function(scope){
  'use strict';
  const overlap=(a,b,gap=1.5)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
  function box(x,y,width,height){return {left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};}
  function touches(box,x,y,r){
    const dx=Math.max(box.left-x,0,x-box.right),dy=Math.max(box.top-y,0,y-box.bottom);
    return dx*dx+dy*dy<r*r;
  }
  function layout({cities,cx,cy,r,clockRadius=r*.2,bounds,measure}){
    const safe={left:bounds.left+3,right:bounds.right-3,top:bounds.top+2,bottom:bounds.bottom-2};
    const points=[];
    const step=Math.max(6,Math.min(r/12,14));
    if(r>=62){
      for(let y=Math.max(safe.top,cy-r*.94);y<=Math.min(safe.bottom,cy+r*.94);y+=step){
        for(let x=Math.max(safe.left,cx-r*.94);x<=Math.min(safe.right,cx+r*.94);x+=step)points.push({x,y});
      }
      for(const font of [10.5,10,9.5]){
        const items=cities.map(c=>({...c,width:measure(c.name,font,c.star)+5,height:font+3,font}));
        items.sort((a,b)=>b.width-a.width||Number(b.star)-Number(a.star)||a.name.localeCompare(b.name));
        const placed=[];
        for(const item of items){
          let best=null,score=Infinity;
          for(const p of points){
            const b=box(p.x,p.y,item.width,item.height);
            if(b.left<safe.left||b.right>safe.right||b.top<safe.top||b.bottom>safe.bottom)continue;
            if(Math.hypot(Math.abs(p.x-cx)+item.width/2,Math.abs(p.y-cy)+item.height/2)>r*.97)continue;
            if(touches(b,cx,cy,clockRadius+4)||placed.some(q=>overlap(b,q.box)))continue;
            if(cities.some(c=>touches(b,c.px,c.py,c.star?5:3.5)))continue;
            const distance=(p.x-item.px)**2+(p.y-item.py)**2;
            // Prefer short leaders and the same side of the city dot.
            const cost=distance+((p.x-cx)*(item.px-cx)<0?r*r*.12:0);
            if(cost<score){score=cost;best={...item,x:p.x,y:p.y,box:b};}
          }
          if(!best)break;
          placed.push(best);
        }
        if(placed.length===cities.length)return {mode:'map',labels:placed};
      }
    }
    // A small teaching viewport cannot fit eleven names on its tiny globe.
    // Two ordered columns keep every complete name readable, including long
    // southern-hemisphere names, with leaders back to the original city dots.
    const count=Math.ceil(cities.length/2),height=safe.bottom-safe.top;
    const font=Math.min(10.5,Math.max(9.5,height/count-3));
    const row=Math.min(font+5,height/count);
    const ordered=cities.slice().sort((a,b)=>a.px-b.px||a.py-b.py);
    const columns=[ordered.slice(0,count),ordered.slice(count)],labels=[];
    columns.forEach((items,side)=>{
      items.sort((a,b)=>a.py-b.py||a.px-b.px);
      const first=Math.max(safe.top+row/2,Math.min(safe.bottom-row*(items.length-.5),cy-row*(items.length-1)/2));
      items.forEach((item,i)=>{
        const width=measure(item.name,font,item.star)+5;
        const x=side?safe.right-width/2:safe.left+width/2,y=first+i*row;
        labels.push({...item,x,y,font,width,height:font+2,box:box(x,y,width,font+2)});
      });
    });
    return {mode:'columns',labels};
  }
  scope.TimeviewCityLabels={layout};
  if(typeof module!=='undefined')module.exports=scope.TimeviewCityLabels;
})(typeof window==='undefined'?globalThis:window);
