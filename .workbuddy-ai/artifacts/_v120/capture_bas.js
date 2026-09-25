const { chromium } = require('playwright');
const CHROME='C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const AUTH='ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
(async()=>{
  const b=await chromium.launch({headless:true,executablePath:CHROME});
  const p=await b.newPage({viewport:{width:1200,height:1500}});
  await p.goto('http://127.0.0.1:8765/THEOLOGICUS.html?x='+Date.now(),{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(4000);
  const t=await p.evaluate(async H=>{const x=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('remember:'+H));return Array.from(new Uint8Array(x)).map(v=>v.toString(16).padStart(2,'0')).join('');},AUTH);
  await p.evaluate(t=>localStorage.setItem('theologicus_remember',JSON.stringify({v:1,mode:'admin',exp:Date.now()+7*864e5,tok:t})),t);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForTimeout(4500);
  await p.evaluate(()=>{const w=document.getElementById('setup-wizard-overlay');if(w){w.classList.remove('active');w.style.display='none';}});
  await p.click('#open-studio-modal');
  await p.waitForTimeout(2500);
  await p.evaluate(()=>{
    const body=document.querySelector('#studio-modal .modal-body');
    if(body){body.style.maxHeight='none';body.style.overflow='visible';}
    document.getElementById('studio-vomode').value='auto';
    // on selectionne une voix francaise pour montrer la liste remontee du service
    const v=document.getElementById('studio-voice');
    v.value='fr-FR-DeniseNeural-Female';
    ['studio-bgmvol','studio-volume','studio-rate','studio-fontsize','studio-strokewidth'].forEach(id=>document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true})));
    // on descend en bas du modal
    const m=document.querySelector('#studio-modal .modal-box');
    m.scrollTop = m.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await p.waitForTimeout(700);
  const bb=await p.evaluate(()=>{
    const m=document.querySelector('#studio-modal .modal-box');
    const r=m.getBoundingClientRect();
    return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
  });
  // on veut le bas : on decale la fenetre vers le bas du modal
  const y = Math.max(0, bb.y + bb.h - 1480);
  await p.screenshot({path:'studio_v121_bas.png', clip:{x:bb.x,y:y,width:bb.w,height:Math.min(1480, 1500-y)}});
  console.log('clip', {x:bb.x,y:y,w:bb.w});
  await b.close();
})();
