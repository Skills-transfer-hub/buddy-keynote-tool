/** Embedded unchanged in the portable HTML; runtime is the shared motion engine.
 * @param {any} runtime @param {any} environment
 */
export function startOfflinePresentation(runtime, environment = globalThis) {
  const doc = environment.document;
  const data = JSON.parse(doc.getElementById('deck-data').textContent);
  const stage = doc.getElementById('stage');
  const canvas = doc.getElementById('buddy-motion');
  const counter = doc.getElementById('counter');
  const scenes = Array.from(doc.querySelectorAll('.offline-scene'));
  let index = 0, step = 0, raf = 0, busy = false, finish = null, autoTimer = 0;
  let repaint = () => {};
  const glyphCache = new Map();
  function select(id) {
    return scenes[index].querySelector(`[data-element-id="${environment.CSS.escape(id)}"]`);
  }
  function run(previous, direction = 1) {
    glyphCache.clear();
    environment.cancelAnimationFrame(raf); environment.clearTimeout(autoTimer);
    const slide = data.slides[index], groups = data.groups[index];
    const cues = groups[step] || [];
    const transitionTime = step === 0 ? slide.transitionDuration : 0;
    const total = transitionTime + Math.max(0, ...cues.map(c => c.end));
    const incoming = scenes[index], outgoing = previous == null ? null : scenes[previous];
    scenes.forEach((scene, i) => {
      scene.style.display = i === index || i === previous ? 'block' : 'none';
      scene.style.transform = ''; scene.style.opacity = '1'; scene.style.clipPath = ''; scene.style.maskImage = ''; scene.style.transformOrigin = '';
      scene.style.zIndex = i === index ? '2' : '1';
    });
    counter.textContent = `${index + 1} / ${scenes.length}`;
    let currentTime = 0;
    const start = environment.performance.now();
    busy = true;
    function paint(time) {
      currentTime = time;
      const local = time - transitionTime;
      const transitioning = time < transitionTime;
      const frames = [];
      const transition = runtime.transitionFrame(slide.transition, transitionTime ? time / transitionTime : 1, data.aspectRatio, direction, !!outgoing);
      incoming.style.transform = ''; incoming.style.opacity = '1'; incoming.style.clipPath = ''; incoming.style.maskImage = ''; incoming.style.zIndex = '2'; incoming.style.transformOrigin = '';
      if (transitioning) {
        Object.assign(incoming.style, transition.incoming);
        if (outgoing) Object.assign(outgoing.style, transition.outgoing);
        frames.push(transition);
      } else if (outgoing) outgoing.style.display = 'none';
      groups.forEach((group, gi) => group.forEach(cue => {
        const raw = gi < step ? 1 : gi > step ? 0 : runtime.clamp((local - cue.start) / (cue.end - cue.start));
        const node=select(cue.element.id);
        if(runtime.needsGlyphLayout(cue.element)&&!glyphCache.has(cue.element.id))
          glyphCache.set(cue.element.id,runtime.readGlyphs(node,stage,cue.element,data.aspectRatio));
        const frame=runtime.elementFrame(cue.element,raw,data.aspectRatio,glyphCache.get(cue.element.id)||[]);
        runtime.applyElementFrame(node,frame);
        if (!transitioning && ((gi === step && local >= cue.start && local < cue.end) || (runtime.keepsEmphasis(cue.element) && raw > 0))) {
          frames.push(frame);
        }
      }));
      canvas.dataset.motionPhase = transitioning ? transition.phase : frames.find(frame => frame.actor.alpha > 0)?.phase || 'idle';
      runtime.drawMotion(canvas, frames, data.aspectRatio, environment.getComputedStyle(stage).getPropertyValue('--font-mono').trim() || 'monospace');
    }
    repaint = () => paint(currentTime);
    function complete() {
      busy = false; finish = null;
      if (slide.autoAdvance) autoTimer = environment.setTimeout(next, step < groups.length - 1 ? 0 : slide.autoAdvance);
    }
    function tick(now) {
      const time = Math.min(total, now - start);
      paint(time);
      if (time < total) raf = environment.requestAnimationFrame(tick);
      else complete();
    }
    finish = () => { environment.cancelAnimationFrame(raf); paint(total); complete(); };
    if (environment.matchMedia('(prefers-reduced-motion: reduce)').matches || total === 0) finish();
    else { paint(0); raf = environment.requestAnimationFrame(tick); }
  }
  function next() {
    environment.clearTimeout(autoTimer);
    if (busy) { finish?.(); return; }
    if (step < data.groups[index].length - 1) { step++; run(null); }
    else if (index < scenes.length - 1) { const old = index; index++; step = 0; run(old); }
  }
  function previous() {
    environment.clearTimeout(autoTimer);
    if (step > 0) { step--; run(null, -1); finish?.(); }
    else if (index > 0) { index--; step = data.groups[index].length - 1; run(null, -1); finish?.(); }
  }
  doc.getElementById('next').onclick = next;
  doc.getElementById('prev').onclick = previous;
  doc.getElementById('full').onclick = () => doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen();
  environment.addEventListener('keydown', e => {
    if (['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)) { e.preventDefault(); next(); }
    if (['ArrowLeft','ArrowUp','PageUp'].includes(e.key)) { e.preventDefault(); previous(); }
    if (e.key.toLowerCase() === 'b') doc.getElementById('blackout').hidden = !doc.getElementById('blackout').hidden;
    if (e.key.toLowerCase() === 'f') doc.getElementById('full').click();
  });
  const refresh = () => { glyphCache.clear(); repaint(); };
  const observer = new environment.ResizeObserver(refresh);
  observer.observe(stage);
  void doc.fonts?.ready.then(refresh);
  if (scenes.length) run(null);
  else { doc.getElementById('next').disabled = true; doc.getElementById('prev').disabled = true; counter.textContent = '0 / 0'; }
}
