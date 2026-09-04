import type { Slide, SlideElement } from './studio';

export type AnimationCue = {
  element: SlideElement;
  start: number;
  end: number;
};
export type AnimationGroup = AnimationCue[];

/** A click begins a group; with/after compose against the previous cue. */
export function animationGroups(slide: Slide): AnimationGroup[] {
  const groups: AnimationGroup[] = [[]];
  const animated = slide.elements
    .filter((e) => !e.hidden && e.animation !== 'none')
    .sort((a, b) => a.animationOrder - b.animationOrder || a.z - b.z);
  for (const element of animated) {
    if (element.animationTrigger === 'click') groups.push([]);
    const group = groups[groups.length - 1];
    const previous = group[group.length - 1];
    const start =
      element.animationTrigger === 'with'
        ? (previous?.start ?? 0)
        : (previous?.end ?? 0);
    group.push({
      element,
      start,
      end: start + Math.max(200, element.animationDuration),
    });
  }
  return groups;
}

export function groupDuration(slide: Slide, step: number) {
  return Math.max(
    0,
    ...(animationGroups(slide)[step] ?? []).map((cue) => cue.end),
  );
}

export function animationFrame(slide: Slide, step: number, elapsed: number) {
  const progress: Record<string, number> = {};
  const groups = animationGroups(slide);
  let active: AnimationCue | undefined;
  const activeCues: AnimationCue[] = [];
  groups.forEach((group, i) =>
    group.forEach((cue) => {
      const p =
        i < step
          ? 1
          : i > step
            ? 0
            : Math.max(
                0,
                Math.min(1, (elapsed - cue.start) / (cue.end - cue.start)),
              );
      progress[cue.element.id] = p;
      if (i === step && elapsed >= cue.start && elapsed < cue.end) {
        active = cue;
        activeCues.push(cue);
      }
    }),
  );
  return { progress, active, activeCues };
}

export function nextVisibleIndex(
  slides: Slide[],
  current: number,
  direction: 1 | -1,
): number | null {
  for (let i = current + direction; i >= 0 && i < slides.length; i += direction)
    if (!slides[i].hidden) return i;
  return null;
}

export function easeProgress(value: number) {
  const p = Math.max(0, Math.min(1, value));
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
