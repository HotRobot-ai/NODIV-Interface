// Host-authorized Founder card recovery. Not part of the gameplay HTTP API.
import http from 'node:http';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {labConfig} from './server/config.mjs';
import {installLabSchema} from './server/lab-db.mjs';
import {founderRecoveryKeyPath,installFounderRecoverySchema,recoverFounderAccess} from './server/founder-recovery.mjs';

const root=process.cwd(),envPath=resolve(root,'.env');
if(!existsSync(envPath))throw Error('NODIV .env fehlt.');
const config=labConfig();
if(config.mode!=='desktop')throw Error('Founder Recovery ist nur fuer den lokalen Desktop-Spielstand freigegeben.');
if(!existsSync(config.dbPath))throw Error('Kein vorhandener NODIV Desktop-Spielstand gefunden.');
const keyPath=founderRecoveryKeyPath(config.dbPath);
if(!existsSync(keyPath))throw Error('Founder Recovery-Schluessel fehlt. Keine unsichere Ersatzberechtigung wird erzeugt.');

const db=new DatabaseSync(config.dbPath);
installLabSchema(db);installFounderRecoverySchema(db);
const token=randomBytes(24).toString('hex');
let used=false;

const html=`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>NODIV Founder Recovery</title><style>body{font:18px system-ui;background:#07131d;color:#ecfaff;max-width:560px;margin:auto;padding:25px}button{padding:18px;font-size:19px;background:#08c6f5;border:0;border-radius:12px;width:100%;margin:16px 0}#log{white-space:pre-wrap;overflow-wrap:anywhere}.warn{border:1px solid #f4c84a;padding:12px;border-radius:10px}small{color:#abc}</style><h2>NODIV V2 · Founder Recovery</h2><p class="warn">Nur verwenden, wenn die bisherige Founder Access Card verloren oder defekt ist. Der Spielstand wird nicht zurückgesetzt.</p><p>Scanne jetzt die <b>neue</b> Founder Access Card. Die alte Karte und alle alten Founder-Sitzungen werden danach ungültig.</p><button id="scan">NEUE FOUNDER-KARTE SCANNEN</button><p id="log"></p><small>Recovery wurde lokal am NODIV-Server gestartet und benötigt den dort hinterlegten Recovery-Schlüssel.</small><script>
const key=${JSON.stringify(token)},btn=document.querySelector('#scan'),log=document.querySelector('#log');let controller=null,reading=false,timeout=null;
function finish(message){if(timeout)clearTimeout(timeout);timeout=null;if(controller)controller.abort();controller=null;reading=false;btn.disabled=false;btn.textContent='NEUE FOUNDER-KARTE SCANNEN';log.textContent=message;}
btn.onclick=async()=>{if(controller){finish('Scan abgebrochen.');return;}if(!('NDEFReader'in window)){finish('Web NFC ist hier nicht verfügbar. Android Chrome über HTTPS öffnen.');return;}controller=new AbortController();const current=controller;const reader=new NDEFReader();btn.textContent='SCAN ABBRECHEN';log.textContent='NFC wird aktiviert …';
reader.addEventListener('reading',async e=>{if(current!==controller||reading)return;reading=true;const uid=String(e.serialNumber||'').replace(/[^0-9A-Fa-f]/g,'').toUpperCase();if(timeout)clearTimeout(timeout);current.abort();controller=null;if(!/^[0-9A-F]{8,32}$/.test(uid)){finish('Keine gültige UID empfangen. Erneut scannen.');return;}btn.disabled=true;btn.textContent='RECOVERY LÄUFT …';log.textContent='Neue Karte gelesen. Berechtigung und Spielstand werden geprüft …';try{const r=await fetch('/recover?key='+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uid})});const v=await r.json();if(!r.ok)throw Error(v.error||'Recovery fehlgeschlagen');log.textContent='FOUNDER RECOVERY ERFOLGREICH ✓\\nNeue Karte aktiv: '+uid+'\\nSpielstand und Registrierungen blieben erhalten. NODIV jetzt neu starten.';btn.style.display='none';}catch(err){finish('Recovery abgebrochen: '+String(err.message||err));}},{once:true});
reader.addEventListener('readingerror',()=>{if(current===controller)finish('NFC-Lesefehler. Erneut scannen.');},{once:true});try{await reader.scan({signal:current.signal});if(current!==controller)return;log.textContent='SCAN BEREIT ✓\\nNeue Founder Access Card jetzt ans Smartphone halten.';timeout=setTimeout(()=>{if(current===controller)finish('Keine Karte innerhalb von 30 Sekunden gelesen.');},30000);}catch(err){if(current===controller)finish('NFC-Start fehlgeschlagen: '+String(err.message||err));}};
</script></html>`;

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://local');
  if(req.method==='GET'&&u.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(html);return}
  if(req.method==='POST'&&u.pathname==='/recover'&&u.searchParams.get('key')===token){
    try{
      if(used)throw Error('FOUNDER_RECOVERY_ALREADY_USED');
      let raw='';for await(const part of req){raw+=part;if(raw.length>1000)throw Error('BODY_TOO_LARGE')}
      const {uid}=JSON.parse(raw||'{}');
      const result=recoverFounderAccess(db,{eventId:config.eventId,newUid:String(uid||'').toUpperCase(),keyPath,envPath});
      used=true;console.log('FERTIG: Founder Access Card sicher ersetzt. Alter Founder-Zugang widerrufen. Spielstand erhalten.');
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
      setTimeout(()=>server.close(()=>db.close()),250);
    }catch(e){res.writeHead(400,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:e.message}))}
    return;
  }
  res.writeHead(404);res.end('Not found');
});
server.listen(8790,'127.0.0.1',()=>console.log('Founder Recovery bereit auf 127.0.0.1:8790. Nur nach bewusstem lokalen Start aktiv.'));
