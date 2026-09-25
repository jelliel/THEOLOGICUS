const { chromium } = require('playwright');
const CHROME='C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const AUTH='ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
(async()=>{
  const b=await chromium.launch({headless:true,executablePath:CHROME});
  const p=await b.newPage({viewport:{width:1200,height:1400},deviceScaleFactor:1});
  await p.goto('http://127.0.0.1:8765/THEOLOGICUS.html?x='+Date.now(),{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(4000);
  const t=await p.evaluate(async H=>{const x=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('remember:'+H));return Array.from(new Uint8Array(x)).map(v=>v.toString(16).padStart(2,'0')).join('');},AUTH);
  await p.evaluate(t=>localStorage.setItem('theologicus_remember',JSON.stringify({v:1,mode:'admin',exp:Date.now()+7*864e5,tok:t})),t);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForTimeout(4500);
  await p.evaluate(()=>{const w=document.getElementById('setup-wizard-overlay');if(w){w.classList.remove('active');w.style.display='none';}});
  await p.click('#open-studio-modal');
  await p.waitForTimeout(2500);
  // sujet de demonstration + valeurs parlantes
  await p.evaluate(()=>{
    document.getElementById('studio-subject').value = "La Transfiguration du Christ";
    document.getElementById('studio-script').value = "Sur la haute montagne, Jésus fut transfiguré devant eux : son visage devint brillant comme le soleil.";
    document.getElementById('studio-terms').value = "transfiguration, mountain, light, cloud";
    ['studio-speed','studio-bgmvol','studio-volume','studio-rate','studio-fontsize','studio-strokewidth'].forEach(id=>{
      document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}));
    });
    document.querySelector('details.studio-adv').open = true;
  });
  await p.waitForTimeout(600);
  const bb = await p.evaluate(()=>{
    const m = document.querySelector('#studio-modal .modal-box');
    const r = m.getBoundingClientRect();
    return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
  });
  // le corps defilant : on capture le modal entier en agrandissant le viewport
  await p.evaluate(()=>{
    const body = document.querySelector('#studio-modal .modal-body');
    if (body) { body.style.maxHeight='none'; body.style.overflow='visible'; }
  });
  await p.waitForTimeout(500);
  const bb2 = await p.evaluate(()=>{
    const m = document.querySelector('#studio-modal .modal-box');
    m.scrollIntoView({block:'start'});
    const r = m.getBoundingClientRect();
    return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
  });
  const h = Math.min(bb2.height, 1390);
  await p.screenshot({path:'studio_v121_panneaux.png', clip:{x:bb2.x,y:Math.max(0,bb2.y),width:bb2.width,height:bb2.height}});
  console.log('capture', bb2);
  await b.close();
})();
