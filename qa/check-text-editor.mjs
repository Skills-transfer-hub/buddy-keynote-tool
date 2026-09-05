import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/hugo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const deck=JSON.parse(await readFile(new URL('./text-effects.buddy.json',import.meta.url)));
deck.slides=deck.slides.slice(0,1);deck.title='QA portées et emphases';
await writeFile(new URL('./text-editor-fixture.buddy.json',import.meta.url),JSON.stringify(deck));
await page.goto('http://localhost:3001/');
await page.getByRole('button',{name:'Présenter',exact:true}).waitFor();
await page.getByLabel('Importer une présentation',{exact:true}).setInputFiles(new URL('./text-editor-fixture.buddy.json',import.meta.url).pathname);
await page.waitForFunction(()=>document.querySelector('.studio-status').textContent.includes('Présentation importée'));
const selected=page.locator('.studio-canvas-mat [data-element-id="text-0"]');
await selected.click();
await page.getByRole('tab',{name:'Animer',exact:true}).click();
async function choose(label,option){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
for(const mode of ['Apparition','Disparition','Mise en évidence']){
  await choose('Type d’effet',mode);
  for(const scope of ['Caractère','Mot','Texte entier','Bloc complet']){await choose('Appliquer à',scope);assert.ok((await page.getByRole('combobox',{name:'Appliquer à',exact:true}).textContent()).includes(scope));}
}
await page.getByRole('combobox',{name:'Animation',exact:true}).click();
await page.getByRole('option').first().waitFor();
assert.equal(await page.getByRole('option').count(),16,'15 emphasis effects plus none');
await page.getByRole('option',{name:'Surligneur',exact:true}).click();
await choose('Appliquer à','Mot');
await page.getByLabel('Durée (s)',{exact:true}).fill('3');
await page.getByLabel('Durée (s)',{exact:true}).blur();
await page.screenshot({path:new URL('./text-checks/editor-controls.png',import.meta.url).pathname,fullPage:true});
await page.getByRole('button',{name:'Présenter',exact:true}).click();
await page.locator('.player-incoming [data-element-id="text-0"]').waitFor();
await page.waitForFunction(()=>document.querySelector('.player-incoming [data-element-id="text-0"]')?.dataset.motionRunning==='true');
await page.waitForTimeout(1300);
assert.equal(await page.locator('.player-incoming [data-element-id="text-0"]').getAttribute('data-animation-mode'),'emphasis');
await page.locator('.player-stage').screenshot({path:new URL('./text-checks/editor-preview.png',import.meta.url).pathname});
await page.keyboard.press('ArrowRight');
await page.waitForFunction(()=>document.querySelector('.player-incoming [data-element-id="text-0"]')?.dataset.motionRunning==='false');
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Présenter',exact:true}).waitFor();
await page.waitForTimeout(250);
await page.reload();await page.getByRole('button',{name:'Présenter',exact:true}).waitFor();
await selected.click();await page.getByRole('tab',{name:'Animer',exact:true}).click();
assert.ok((await page.getByRole('combobox',{name:'Type d’effet',exact:true}).textContent()).includes('Mise en évidence'));
assert.ok((await page.getByRole('combobox',{name:'Appliquer à',exact:true}).textContent()).includes('Mot'));
assert.ok((await page.getByRole('combobox',{name:'Animation',exact:true}).textContent()).includes('Surligneur'));
async function download(option,file){
  await page.getByRole('button',{name:'Fichier',exact:true}).click();const event=page.waitForEvent('download');
  await page.getByRole('menuitem',{name:option,exact:true}).click();const result=await event;await result.saveAs(new URL(`./text-checks/${file}`,import.meta.url).pathname);
}
await download('Enregistrer un fichier Buddy','editor-saved.json');
const saved=JSON.parse(await readFile(new URL('./text-checks/editor-saved.json',import.meta.url)));
assert.equal(saved.slides[0].elements[1].animationScope,'word');assert.equal(saved.slides[0].elements[1].animationMode,'emphasis');assert.equal(saved.slides[0].elements[1].animation,'highlight');
await download('Exporter le diaporama HTML','editor-export.html');
await page.goto(new URL('./text-checks/editor-export.html',import.meta.url).href);
assert.equal(await page.locator('#counter').textContent(),'1 / 1');
assert.equal(await page.locator('[data-element-id="text-0"]').getAttribute('data-animation-mode'),'emphasis');
await page.locator('#next').click({force:true});
assert.equal(await page.locator('[data-element-id="text-0"]').getAttribute('data-motion-running'),'false');
assert.deepEqual(errors,[]);await browser.close();
console.log(JSON.stringify({modes:3,scopes:4,emphasisOptions:15,preview:true,skip:true,persistence:true,jsonExport:true,realHtmlExport:true,errors}));
