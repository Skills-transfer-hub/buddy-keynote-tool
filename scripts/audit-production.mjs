import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Two parser advisories are currently unreachable: pptxgenjs 4.0.1 disables
// image-size in its browser map and does not invoke it in its distributed code.
// Keep this exception narrow; new advisories and dependency changes fail closed.
const allowed = new Set(['GHSA-w3rx-r6r6-pgpr', 'GHSA-5p2g-fcmc-qvqq']);
const pptx = JSON.parse(readFileSync('node_modules/pptxgenjs/package.json', 'utf8'));
const pinnedException = pptx.version === '4.0.1' && pptx.browser?.['image-size'] === false;
const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
let report;
try { report = JSON.parse(result.stdout); }
catch { console.error('Dependency audit unavailable.'); process.exit(1); }
if (report.error || !report.vulnerabilities) {
  console.error('Dependency audit failed.'); process.exit(1);
}
const vulnerabilities = report.vulnerabilities;
const accepted = (name) => {
  const item = vulnerabilities[name];
  if (!pinnedException || !item) return false;
  if (name === 'image-size') return item.nodes.every((n) => n === 'node_modules/pptxgenjs/node_modules/image-size') &&
    item.via.every((v) => typeof v === 'object' && allowed.has(v.url?.split('/').pop()));
  return name === 'pptxgenjs' && item.via.every((v) => v === 'image-size') && accepted('image-size');
};
const blocked = Object.entries(vulnerabilities).filter(([name, item]) =>
  ['high', 'critical'].includes(item.severity) && !accepted(name));
for (const [name, item] of Object.entries(vulnerabilities)) {
  console.log(`${name}: ${item.severity}${accepted(name) ? ' (reviewed unreachable parser; see SECURITY.md)' : ''}`);
}
if (blocked.length) process.exit(1);
console.log('No unreviewed high/critical production advisories.');
