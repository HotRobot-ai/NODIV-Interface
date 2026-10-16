import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { SqliteGameCore } from '../../server/sqlite-core.mjs';
import { createLabStore, normalizeUid } from './lab-db.mjs';
import { seedTestDatabase } from './seed.mjs';
import { labConfig } from './config.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const CLIENT=join(ROOT,'client');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body),'x-content-type-options':'nosniff'});res.end(body);}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>64*1024)throw Error('BODY_TOO_LARGE');}return raw?JSON.parse(raw):{};}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):'';}
function errCode(e){return e?.code||e?.message||'INTERNAL_ERROR';}
function statusFor(code){if(code==='NO_SESSION')return 401;if(/DENIED|UNKNOWN|REQUIRED|INVALID|INCOMPLETE|EXPIRED|NOT_|REQUIRES/.test(code))return 400;if(/OWNERSHIP_CHANGED|IDEMPOTENCY|CONFLICT/.test(code))return 409;return 500;}
function serveStatic(req,res){
  const url=new URL(req.url,'http://local'); let path=url.pathname==='/'?'/index.html':url.pathname;
  path=normalize(path).replace(/^(\.\.[/\\])+/, ''); const full=join(CLIENT,path);
  if(!full.startsWith(CLIENT)||!existsSync(full)){json(res,404,{ok:false,error:'NOT_FOUND'});return;}
  res.writeHead(200,{'content-type':MIME[extname(full)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});createReadStream(full).pipe(res);
}

export function createLabApp(config=labConfig()){
  seedTestDatabase(config.dbPath,config.eventId);
  const core=new SqliteGameCore(config.dbPath);
  const store=createLabStore(core,{sessionTtl:config.sessionTtl,grantTtl:config.grantTtl,exchangeTtl:config.exchangeTtl});
  const handler=async(req,res)=>{
    const started=performance.now();
    try{
      const u=new URL(req.url,'http://local');
      if(req.method==='GET'&&u.pathname==='/health') return json(res,200,{ok:true,service:'NODIV-V2-MINIPC-LAB',eventId:config.eventId,db:'sqlite',uptimeSec:Math.round(process.uptime()),secure:req.socket.encrypted===true});
      if(req.method==='GET'&&u.pathname==='/api/state'){const s=store.session(bearer(req));return json(res,200,{ok:true,...store.state(s)});}
      if(req.method==='POST'&&u.pathname==='/api/session/start'){const b=await body(req);const s=store.startSession(config.eventId,b.uid);return json(res,200,{ok:true,...s});}
      if(req.method==='POST'&&u.pathname==='/api/scan'){
        const s=store.session(bearer(req)),b=await body(req);
        if(b.exchangeId){const result=store.scanExchangeCore(s,{exchangeId:b.exchangeId,uid:b.uid});return json(res,200,{ok:true,...result});}
        const result=store.issueNodeGrant(s,b.uid);return json(res,200,{ok:true,purpose:'EXCHANGE_NODE',...result});
      }
      if(req.method==='POST'&&u.pathname==='/api/exchange/prepare'){const s=store.session(bearer(req)),b=await body(req);return json(res,200,{ok:true,...store.prepareExchange(s,b)});}
      if(req.method==='POST'&&u.pathname==='/api/exchange/confirm'){const s=store.session(bearer(req)),b=await body(req);return json(res,200,store.confirmExchange(s,b));}
      if(req.method==='POST'&&u.pathname==='/api/lab/normalize-uid'){const b=await body(req);return json(res,200,{ok:true,uid:normalizeUid(b.uid)});}
      if(req.method==='GET'&&u.pathname.startsWith('/api/'))return json(res,404,{ok:false,error:'API_NOT_FOUND'});
      if(req.method==='GET')return serveStatic(req,res);
      return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
    }catch(e){const code=errCode(e);json(res,statusFor(code),{ok:false,error:code});}
    finally{const ms=performance.now()-started;if(req.url.startsWith('/api/')||req.url==='/health')console.log(JSON.stringify({ts:new Date().toISOString(),method:req.method,path:req.url,status:res.statusCode,ms:Number(ms.toFixed(2))}));}
  };
  const tls=config.tlsKey&&config.tlsCert;
  const server=tls?https.createServer({key:readFileSync(config.tlsKey),cert:readFileSync(config.tlsCert)},handler):http.createServer(handler);
  server.keepAliveTimeout=5000;
  return {server,core,store,config,close:()=>new Promise(resolve=>server.close(()=>{core.close();resolve();}))};
}

export async function startLab(config=labConfig()){
  const app=createLabApp(config);
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(config.port,config.host,resolve));
  const proto=config.tlsKey&&config.tlsCert?'https':'http';
  console.log(`NODIV V2 LAB ready: ${proto}://${config.host}:${config.port}`);
  if(proto==='http') console.log('TEST ONLY: Web NFC requires HTTPS. Use Tailscale Serve or a trusted local certificate before real phone NFC.');
  return app;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) startLab().catch(e=>{console.error(e);process.exitCode=1;});
