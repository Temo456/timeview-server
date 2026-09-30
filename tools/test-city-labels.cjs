const assert=require('node:assert/strict');
const {layout}=require('../city-labels');
const lists=[['北京','东京','纽约','莫斯科','柏林','巴黎','伦敦','旧金山','渥太华','多伦多','温哥华'],['悉尼','堪培拉','开普敦','布宜诺斯艾利斯','圣保罗','惠灵顿','乌斯怀亚']];
const zones=[[8,9,-4,3,2,2,1,-7,-4,-4,-7],[10,10,2,-3,-3,12,-3]];
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
let cases=0;const modes={};
for(const [width,height,zoom] of [[320,430,1],[390,480,1],[430,500,1],[390,100,1],[320,80,1],[640,140,1],[320,430,.5],[320,430,4]]){
 for(let hemisphere=0;hemisphere<2;hemisphere++)for(let hour=0;hour<24;hour+=.5){
  const bounds={left:12,right:width-12,top:80,bottom:80+height};
  const cx=width/2,cy=80+height/2,r=Math.min(width-24,height)*.29*zoom,same=new Map();
  const cities=lists[hemisphere].map((name,i)=>{
   const zone=zones[hemisphere][i],rank=same.get(zone)||0;same.set(zone,rank+1);
   const a=-(hour+zone-12)/24*2*Math.PI,d=r*(.9-rank*.16);
   return {name,star:name==='北京',px:cx+Math.sin(a)*d,py:cy-Math.cos(a)*d};
  });
  const result=layout({cities,cx,cy,r,bounds,measure:(name,font)=>name.length*font});
  assert.deepEqual(result.labels.map(l=>l.name).sort(),lists[hemisphere].slice().sort());
  for(const l of result.labels){
   assert(l.font>=9.5&&l.font<=10.5);assert(l.width>=l.name.length*l.font);
   assert(l.box.left>=bounds.left&&l.box.right<=bounds.right&&l.box.top>=bounds.top&&l.box.bottom<=bounds.bottom,JSON.stringify({width,height,l}));
   for(const other of result.labels)if(l!==other)assert(!overlap(l.box,other.box),JSON.stringify({l,other}));
  }
  cases++;modes[result.mode]=(modes[result.mode]||0)+1;
 }
}
console.log('PASS complete city names / no overlap / viewport bounds / 24h / both hemispheres',JSON.stringify({cases,modes}));
