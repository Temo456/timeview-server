/* Hierarchical two-Kepler approximation, AU / solar masses / years.
 * Proxima orbit: Kervella et al. 2017, https://arxiv.org/abs/1611.03495
 * Ignores long-term perturbations; viewing planes and starting phases are illustrative.
 */
(function(root) {
  'use strict';
  const TAU = Math.PI * 2;
  const masses = [1.1, 0.9, 0.122], binaryMass = masses[0]+masses[1], totalMass = binaryMass+masses[2];
  const inner = {period:80, eccentricity:0.52, axis:Math.cbrt(binaryMass*80**2), phase:0.4, tilt:0.35, node:0.25};
  const outer = {period:550000, eccentricity:0.5, axis:Math.cbrt(totalMass*550000**2), phase:Math.PI, tilt:0.6, node:-0.65};
  function orbit(elements, years) {
    const M = ((elements.phase + TAU * years / elements.period) % TAU + TAU) % TAU;
    let E = M;
    for (let i=0;i<12;i++) {
      const delta=(E-elements.eccentricity*Math.sin(E)-M)/(1-elements.eccentricity*Math.cos(E));
      E-=delta; if(Math.abs(delta)<1e-13)break;
    }
    const x=elements.axis*(Math.cos(E)-elements.eccentricity);
    const y=elements.axis*Math.sqrt(1-elements.eccentricity**2)*Math.sin(E);
    const cy=y*Math.cos(elements.tilt), z=y*Math.sin(elements.tilt);
    return [x*Math.cos(elements.node)-cy*Math.sin(elements.node), x*Math.sin(elements.node)+cy*Math.cos(elements.node),z];
  }
  function state(years, visual=false, outerYears=years) {
    const r=orbit(inner,years), R=orbit(outer,outerYears);
    if(visual) { for(let k=0;k<3;k++){r[k]*=12/inner.axis;R[k]*=42/outer.axis;} }
    const center=R.map(v=>-v*masses[2]/totalMass);
    return {center, positions:[center.map((v,k)=>v-r[k]*masses[1]/binaryMass),
      center.map((v,k)=>v+r[k]*masses[0]/binaryMass), R.map(v=>v*binaryMass/totalMass)]};
  }
  const api={masses,inner,outer,orbit,state};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TimeviewThreeBody=api;
})(typeof globalThis==='object'?globalThis:this);
