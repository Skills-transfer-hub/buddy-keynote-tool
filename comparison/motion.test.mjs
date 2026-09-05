import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION, TIMES, STROKES, STROKE_TIMES, frameAt, rigAt } from './motion.mjs';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`);

void test('the slide only moves after contact and stays against each actual pushing surface', () => {
  for (let time = 0; time < TIMES.push; time += 7) near(frameAt(time).slide.x, 260, 'stationary slide');
  let previous = 260;
  for (let time = TIMES.push; time <= TIMES.stop; time += 7) {
    const frame = frameAt(time);
    assert.ok(frame.slide.x >= previous); previous = frame.slide.x;
    for (const style of ['ascii', 'silhouette', 'drawn']) {
      const rig = rigAt(style, frame);
      const point = rig.limbs ? rig.hand : rig.bodyContact;
      near(point.x, frame.slide.x, `contact x ${style}`);
      assert.ok(point.y >= frame.slide.y && point.y <= frame.slide.y + frame.slide.height);
      if (!rig.limbs) {
        const r = rig.angle * Math.PI / 180;
        // Independent transformed box geometry, not the reported contact marker.
        const x = rig.center.x + 44 * rig.sx * Math.cos(r) + 31 * rig.sy * Math.sin(r);
        const bottom = rig.center.y + 44 * rig.sx * Math.sin(r) + 31 * rig.sy * Math.cos(r);
        near(x, frame.slide.x, 'body corner at slide'); near(bottom, 350, 'body on ground');
      }
    }
  }
  near(frameAt(DURATION).slide.x, 365, 'final slide');
});

void test('visible ink ends exactly at the nib; raised transfers add no ink', () => {
  for (let time = TIMES.ready; time <= TIMES.written; time += 3) {
    const frame = frameAt(time);
    if (frame.penDown) near(distance(frame.ink.at(-1).at(-1), frame.tip), 0, 'nib at newest ink');
    else assert.deepEqual(frame.ink, STROKES.slice(0, STROKE_TIMES.filter(t => t.end <= time).length), 'only completed strokes remain during a raised transfer');
  }
  assert.deepEqual(frameAt(TIMES.written).ink, STROKES);
  assert.equal(frameAt(TIMES.ready - 1).ink.length, 0);
  for (const timing of STROKE_TIMES) assert.ok(timing.end - timing.start >= 80, 'every contact lasts multiple frames');
  near(STROKE_TIMES.at(-1).end, TIMES.written, 'common writing duration');
});

void test('a rigid pencil stays attached to the unarticulated body while writing', () => {
  for (let time = TIMES.pickup; time <= DURATION; time += 9) {
    const frame = frameAt(time), rig = rigAt('silhouette', frame);
    near(distance(frame.root, frame.tip), 158, 'pencil length');
    near(rig.center.x + 42, frame.root.x, 'body attachment x');
    near(rig.center.y - 30, frame.root.y, 'body attachment y');
  }
});

void test('articulated feet hold world-space supports and take turns lifting', () => {
  let liftedWhileReturning = false, liftedWhileWriting = false;
  for (let time = 0; time < DURATION; time += 1) {
    const a = rigAt('ascii', frameAt(time)).feet, b = rigAt('ascii', frameAt(time + 1)).feet;
    assert.ok(a.some(foot => Math.abs(foot.y - 350) < 1e-7), 'at least one grounded support');
    for (let i = 0; i < 2; i++) {
      if (a[i].y === 350 && b[i].y === 350) near(a[i].x, b[i].x, 'grounded foot does not slide');
      if (a[i].y < 349 && time > TIMES.release && time < TIMES.pickup) liftedWhileReturning = true;
      if (a[i].y < 349 && time > TIMES.ready && time < TIMES.written) liftedWhileWriting = true;
    }
  }
  assert.ok(liftedWhileReturning && liftedWhileWriting);
});

void test('phase boundaries and pencil lifts are continuous, and seeks reconstruct the same frame', () => {
  const boundaries = [...Object.values(TIMES), 13650, ...STROKE_TIMES.flatMap(t => [t.start, t.end])];
  for (const time of boundaries) {
    const a = frameAt(time - .001), b = frameAt(time + .001);
    assert.ok(distance(a.tip, b.tip) < .05, `continuous nib at ${time}`);
    for (const style of ['ascii', 'silhouette', 'drawn']) {
      const ra = rigAt(style, a), rb = rigAt(style, b);
      assert.ok(distance(ra.center, rb.center) < .05, `continuous body ${style} at ${time}`);
      assert.ok(distance(ra.hand, rb.hand) < .05, `continuous hand ${style} at ${time}`);
    }
  }
  const expected = [1234, 6250, 9500, 14400].map(t => [frameAt(t), rigAt('ascii', frameAt(t))]);
  frameAt(0); frameAt(14000);
  assert.deepEqual([1234, 6250, 9500, 14400].map(t => [frameAt(t), rigAt('ascii', frameAt(t))]), expected);
});
