/* Confere que as fotos embutidas realmente carregam num navegador comum,
   sem o bloqueio de rede que existe no ambiente de pre-visualizacao. */
import { chromium } from 'playwright';
import { FOTOS_PAIS } from '../src/dados/fotosPais.ts';

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await nav.newPage();
const amostra = Object.entries(FOTOS_PAIS).slice(0, 6);
await p.setContent('<body style="margin:0;background:#fff;display:flex;flex-wrap:wrap">'+
  amostra.map(([k,u])=>`<figure style="margin:0;width:33%"><img src="${u}" style="width:100%;height:150px;object-fit:contain"><figcaption style="font:11px sans-serif;text-align:center">${k}</figcaption></figure>`).join('')+
  '</body>');
await p.waitForTimeout(6000);
const res = await p.evaluate(()=>[...document.images].map(i=>({ok:i.complete&&i.naturalWidth>0})));
const ok = res.filter(r=>r.ok).length;
console.log(`fotos carregadas: ${ok} de ${res.length}`);
await p.screenshot({ path: process.argv[2] });
await nav.close();
process.exit(ok>0?0:1);
