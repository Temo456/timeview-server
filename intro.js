/* Stream the opening immediately; never wait for the complete video download. */
(function () {
  'use strict';
  const overlay=document.getElementById('introOverlay'),video=document.getElementById('introVid');
  const loading=document.getElementById('introLoading');
  let generation=0,hideTimer;
  window.introActive=false;
  function hide(){
    ++generation;clearTimeout(hideTimer);video.pause();overlay.style.opacity='0';
    hideTimer=setTimeout(()=>{
      overlay.style.display='none';overlay.style.opacity='1';video.style.visibility='hidden';
      window.introActive=false;window.dispatchEvent(new Event('timeview:intro-finished'));
    },800);
  }
  function start(muted){
    const run=++generation;clearTimeout(hideTimer);video.pause();video.style.visibility='hidden';
    window.introActive=true;overlay.style.display='block';overlay.style.opacity='1';
    loading.style.display='grid';video.muted=muted;
    // The MP4 metadata is at the front. Native Range requests can decode the first
    // frames while the rest downloads; HTTP caching also accelerates replays.
    if(!video.getAttribute('src')){video.preload='auto';video.src=video.dataset.src;}
    video.currentTime=0;
    video.play().catch(error=>{
      if(run!==generation)return;
      if(!muted&&error.name==='NotAllowedError'){
        video.muted=true;video.play().catch(()=>{if(run===generation)hide();});
      }else hide();
    });
  }
  video.addEventListener('playing',()=>{
    if(window.introActive&&!video.seeking&&!video.paused){video.style.visibility='visible';loading.style.display='none';}
  });
  video.addEventListener('ended',hide);video.addEventListener('error',hide);
  document.getElementById('introSkip').addEventListener('click',hide);
  window.replayIntro=()=>start(false);
  let played=false;
  try{played=sessionStorage.getItem('introPlayed');sessionStorage.setItem('introPlayed','1');}catch(_){}
  if(new URLSearchParams(location.search).get('restart')==='1')played=false;
  if(!played)start(true);
})();
