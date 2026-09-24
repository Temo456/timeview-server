/* Shared content-card column beside the narrator, on both teaching views. */
(function () {
  'use strict';
  const selector = '#planetCard, #threeBodyCard, #tv-course-visual, #cardMask, #fortMask';
  let frame = 0;
  const watched = new WeakSet();
  function schedule() { if (!frame) frame = requestAnimationFrame(layout); }
  const sizes = new ResizeObserver(schedule);
  const changes = new MutationObserver(schedule);
  function watch(el) {
    if (!el || watched.has(el)) return;
    watched.add(el); sizes.observe(el);
    changes.observe(el, {attributes:true, attributeFilter:['class','hidden','style']});
  }
  function layout() {
    frame = 0;
    const panel = document.querySelector('#tv-assist'); watch(panel);
    const toolbar=document.querySelector('.bottombar');watch(toolbar);
    if(panel&&toolbar) {
      const bottom=Math.max(76,innerHeight-toolbar.getBoundingClientRect().top+12)+'px';
      if(panel.style.bottom!==bottom)panel.style.bottom=bottom;
    }
    const rect = panel?.classList.contains('on') ? panel.getBoundingClientRect() : null;
    const margin = innerWidth <= 600 ? 10 : 18, gap = 14;
    let top = innerWidth <= 600 ? 58 : 68;
    let right = innerWidth - margin, width = Math.min(320, innerWidth - 2 * margin);
    let bottom = innerHeight - 88;
    const earth = window.TIMEVIEW === 'earth';
    if (rect) {
      if (rect.left - gap - margin >= 220) {
        right = rect.left - gap; top = rect.top;
        width = Math.min(width, right - margin);
      } else {
        bottom = Math.min(rect.top - gap, top + Math.min(180, Math.max(80, (rect.top-gap-top)*0.45)));
        // On phones the card occupies the free area above the narrator.
        width = Math.min(width, 280);
      }
    }
    if (earth) right = margin + width;
    for (const card of document.querySelectorAll(selector)) {
      watch(card);
      const values = {boxSizing:'border-box', left:(right-width)+'px', right:'auto', top:top+'px', bottom:'auto',
        transform:'none', width:width+'px', maxHeight:Math.max(0,bottom-top)+'px', overflowY:'auto',
        overscrollBehavior:'contain', pointerEvents:'auto'};
      for (const [key, value] of Object.entries(values)) if (card.style[key] !== value) card.style[key] = value;
      if (card.matches('#cardMask, #fortMask')) {
        if (card.style.background !== 'none') card.style.background = 'none';
        const content = card.firstElementChild;
        content.style.width = '100%'; content.style.maxWidth = 'none'; content.style.maxHeight = 'none';
      }
    }
  }
  function show(card) {
    for (const other of document.querySelectorAll(selector)) {
      if (other !== card) { other.hidden = true; other.style.display = 'none'; }
    }
    card.hidden = false; card.style.display = 'block'; layout();
  }
  function hide() {
    for (const card of document.querySelectorAll(selector)) { card.hidden=true; card.style.display='none'; }
  }
  new MutationObserver(schedule).observe(document.body, {childList:true});
  window.addEventListener('resize', schedule);
  window.TimeviewCards = {show, hide, layout};
  schedule();
})();
