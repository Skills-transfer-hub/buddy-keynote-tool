import { build, stop } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initialDeck, makeSlide, makeElement, animationOptions, animationLabels, animationModeLabels, animationScopeLabels } from '../lib/studio.ts';

const slides=[];
for(const mode of ['entrance','exit','emphasis'])for(const scope of ['character','word','text','block'])for(const animation of Object.keys(animationOptions(mode)).filter(k=>k!=='none')){
  const i=slides.length,slide=makeSlide(),caption=makeElement('text'),text=makeElement('text');
  Object.assign(slide,{id:`effect-${i}`,name:`${animationModeLabels[mode]} · ${animationLabels[animation]} · ${animationScopeLabels[scope]}`,transitionDuration:0,autoAdvance:null,tone:'paper'});
  Object.assign(caption,{id:`label-${i}`,text:slide.name,x:7,y:7,w:87,h:10,animation:'none'});caption.style.fontSize=18;
  Object.assign(text,{id:`text-${i}`,text:'Bonjour.\nÉj !',x:25,y:32,w:54,h:36,animation,animationMode:mode,animationScope:scope,animationDuration:6000,animationTrigger:'after'});
  text.style.fontSize=66;text.style.color='#17201c';text.style.fontStyle='italic';
  slide.elements=[caption,text];slides.push(slide);
}
const deck={...initialDeck,id:'buddy-text-scopes',title:'Buddy — Portées et mises en évidence',slides};
await writeFile('qa/text-effects.buddy.json',JSON.stringify(deck,null,2));
const result=await build({entryPoints:['lib/html-export.ts'],bundle:true,platform:'browser',format:'esm',write:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:args.path.startsWith('@/')?resolve(process.cwd(),args.path.slice(2).replace(/\?raw$/,'')):resolve(args.resolveDir,args.path.replace(/\?raw$/,'')),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}],alias:{'@':process.cwd()},logLevel:'silent'});
const {exportHtml}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
await writeFile('qa/text-effects.html',await(await exportHtml(deck)).text());
console.log(JSON.stringify({slides:slides.length,entrances:40,exits:40,emphasis:60}));
await stop();process.exit(0);
