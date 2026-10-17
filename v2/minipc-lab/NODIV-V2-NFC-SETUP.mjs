// NODIV V2 BLOCK 07 Founder bootstrap. TESTMODE ONLY.
import http from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';

const root=process.cwd(),env=resolve(root,'.env');
if(!existsSync(resolve(root,'package.json'))||!existsSync(env))throw Error('Start im NODIV-V2-Release-Ordner mit vorhandener .env');
const token=randomBytes(18).toString('hex');
let saved=false;

const html=`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>NODIV V2 Founder Bootstrap</title><style>body{font:18px system-ui;background:#07131d;color:#ecfaff;max-width:550px;margin:auto;padding:25px}button{padding:18px;font-size:19px;background:#08c6f5;border:0;border-radius:12px;width:100%;margin:16px 0}#log{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#abc}</style><h2>NODIV V2 · Founder Bootstrap</h2><p>Scanne genau die reale Founder Access Card. Alle weiteren Access Cards, Nodes, N-Cores und der HQ-Tag werden danach im Founder-Interface registriert.</p><button id="scan">FOUNDER ACCESS CARD SCANNEN</button><p id="log"></p><small>Die UID bleibt nur in der lokalen Testkonfiguration. Keine Spiel- oder Produktivdaten werden veraendert.</small><script>
const key=${JSON.stringify(token)},btn=document.querySelector('#scan'),log=document.querySelector('#log');
let controller=null,timeout=null,reading=false;
function finish(message){if(timeout)clearTimeout(timeout);timeout=null;if(controller)controller.abort();controller=null;reading=false;btn.disabled=false;btn.textContent='FOUNDER ACCESS CARD SCANNEN';log.textContent=message;}
btn.onclick=async()=>{
 if(controller){finish('Scan abgebrochen. Zum erneuten Scannen die Schaltfläche drücken.');return;}
 if(!('NDEFReader'in window)){finish('Web NFC ist hier nicht verfügbar. Android Chrome über die HTTPS-Adresse öffnen.');return;}
 controller=new AbortController();reading=false;
 btn.textContent='SCAN ABBRECHEN';
 log.textContent='NFC wird aktiviert. Browserberechtigung gegebenenfalls bestätigen …';
 const current=controller;
 const reader=new NDEFReader();
 reader.addEventListener('reading',async e=>{
   if(current!==controller||reading)return;
   reading=true;
   const uid=String(e.serialNumber||'').replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
   if(timeout)clearTimeout(timeout);timeout=null;current.abort();controller=null;
   if(!/^[0-9A-F]{8,32}$/.test(uid)){finish('Karte erkannt, aber keine gültige UID empfangen. Erneut scannen.');return;}
   btn.disabled=true;btn.textContent='REGISTRIERUNG LÄUFT …';log.textContent='UID gelesen. Founder-Karte wird gespeichert …';
   try{
     const r=await fetch('/record?key='+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uid})});
     const v=await r.json();if(!r.ok)throw Error(v.error||'Registrierung fehlgeschlagen');
     log.textContent='Founder Access Card gespeichert: '+uid+' ✓\\nJetzt NODIV-V2-SPIELEN.cmd erneut starten und TESTMODUS STARTEN wählen.';
     btn.style.display='none';
   }catch(err){finish('UID gelesen, aber Speichern fehlgeschlagen: '+String(err.message||err));}
 },{once:true});
 reader.addEventListener('readingerror',()=>{if(current===controller)finish('NFC-Lesefehler. Karte entfernen, Scan erneut starten und Karte erst bei SCAN BEREIT anhalten.');},{once:true});
 try{
   await reader.scan({signal:current.signal});
   if(current!==controller)return;
   log.textContent='SCAN BEREIT ✓\\nFounder Access Card jetzt ans Smartphone halten. Die Android-Meldung „Leerer Tag“ außerhalb eines aktiven Scans ist keine NODIV-Registrierung.';
   timeout=setTimeout(()=>{if(current===controller)finish('Keine Karte innerhalb von 30 Sekunden gelesen. Erneut scannen.');},30000);
 }catch(err){if(current===controller)finish('NFC-Start fehlgeschlagen: '+String(err.message||err)+'. HTTPS, NFC und Chrome-Berechtigung prüfen.');}
};
</script></html>`;

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://local');
  if(u.pathname==='/'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return}
  if(u.pathname==='/record'&&u.searchParams.get('key')===token&&req.method==='POST'){
    try{
      if(saved)throw Error('Founder Bootstrap bereits gespeichert');
      let raw='';for await(const part of req){raw+=part;if(raw.length>1000)throw Error('Too large')}
      const {uid}=JSON.parse(raw);
      if(typeof uid!=='string'||!/^[0-9A-F]{8,32}$/.test(uid))throw Error('Ungueltige NFC UID');
      let data=readFileSync(env,'utf8');
      if(!/^NODIV_UID_FOUNDER_CARD=.*$/m.test(data))throw Error('Konfigurationsfeld NODIV_UID_FOUNDER_CARD fehlt');
      writeFileSync(env+'.before-founder-setup',readFileSync(env));
      data=data.replace(/^NODIV_UID_FOUNDER_CARD=.*$/m,'NODIV_UID_FOUNDER_CARD='+uid);
      writeFileSync(env,data);saved=true;
      console.log('FERTIG: Founder Access Card lokal gespeichert; Backup .env.before-founder-setup.');
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));
    }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}))}
    return;
  }
  res.writeHead(404);res.end('Not found');
});
server.listen(8790,'127.0.0.1',()=>console.log('Founder Bootstrap bereit auf 127.0.0.1:8790 (nur lokal/Tailscale Serve).'));
