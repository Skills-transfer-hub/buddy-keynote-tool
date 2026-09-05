import { readFile, writeFile } from 'node:fs/promises';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [html, css, app, motion, image] = await Promise.all([
  read('index.html'), read('style.css'), read('app.mjs'), read('motion.mjs'),
  readFile(new URL('mascot-sheet.png', import.meta.url)),
]);
const code = motion.replaceAll(/^export /gm, '') + '\n' + app.replace(/^import .*?;\n/, '').replace("'./mascot-sheet.png'", JSON.stringify(`data:image/png;base64,${image.toString('base64')}`));
const result = html.replace('<link rel="stylesheet" href="style.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="app.mjs"></script>', `<script type="module">${code.replaceAll('</script', '<\\/script')}</script>`);
await writeFile(new URL('buddy-comparatif.html', import.meta.url), result);
console.log('Comparatif autonome créé : comparison/buddy-comparatif.html');
