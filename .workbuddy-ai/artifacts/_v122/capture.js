const { chromium } = require('playwright');
const CHROME='C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const H='ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
(async()=>{
const b=await chromium.launch({headless:true,executablePath:CHROME});
const p=await b.newPage({viewport:{width:1100,height:900}});
await p.goto('http://127.0.0.1:8765/THEOLOGICUS.html?c='+Date.now(),{waitUntil:'domcontentloaded'});
await p.waitForTimeout(4000);
const t=await p.evaluate(async H=>{const x=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('remember:'+H));return Array.from(new Uint8Array(x)).map(v=>v.toString(16).padStart(2,'0')).join('');},H);
await p.evaluate(t=>localStorage.setItem('theologicus_remember',JSON.stringify({v:1,mode:'admin',exp:Date.now()+7*864e5,tok:t})),t);
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(4500);
await p.evaluate(()=>{const w=document.getElementById('setup-wizard-overlay'); if(w){w.classList.remove('active');w.style.display='none';}});
await p.evaluate(()=>{const m=document.getElementById('settings-modal');m.classList.add('active');const b2=document.getElementById('open-settings-modal');if(b2&&b2.onclick)b2.onclick();});
await p.waitForTimeout(1000);
await p.evaluate(()=>document.getElementById('settings-tab-model').click());
await p.waitForTimeout(600);
const box=await p.evaluate(()=>{const m=document.querySelector('#settings-modal .modal-box');const r=m.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};});
await p.screenshot({path:'settings_model.png',clip:{x:box.x,y:box.y,width:box.w,height:Math.min(box.h,900)}});
console.log('model panel',JSON.stringify(box));
for (const n of ['providers','tts','keys','cache']) {
  await p.evaluate(nn=>document.getElementById('settings-tab-'+nn).click(),n);
  await p.waitForTimeout(500);
  await p.screenshot({path:'settings_'+n+'.png',clip:{x:box.x,y:box.y,width:box.w,height:Math.min(box.h,900)}});
}
await b.close();
})();
