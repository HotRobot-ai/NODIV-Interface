import {createServer} from 'node:http';

// Loopback-only V2 Catch HTTP lab. The production gateway must provide TLS,
// CSRF/origin protections, rate limiting, and trusted NFC grant issuance.
export function createCatchHttpServer(api,{maxBodyBytes=8192}={}){
 if(!api||typeof api.preview!=='function'||typeof api.confirm!=='function')throw Error('CATCH_HTTP_API_REQUIRED');
 return createServer(async(req,res)=>{
  const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))};
  if(req.method!=='POST'||!['/v2/catch/preview','/v2/catch/confirm'].includes(req.url)){reply(404,{ok:false,error:'NOT_FOUND'});return}
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
  if(!bearer){reply(401,{ok:false,error:'AUTH_REQUIRED'});return}
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){reply(415,{ok:false,error:'JSON_REQUIRED'});return}
  let bytes=0,parts=[];
  try{
   for await(const chunk of req){bytes+=chunk.length;if(bytes>maxBodyBytes){reply(413,{ok:false,error:'BODY_TOO_LARGE'});req.destroy();return}parts.push(chunk)}
   const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
   if(!body||Array.isArray(body)||typeof body!=='object')throw Error('INVALID_JSON');
   const input={...body,token:bearer[1]};
   const result=req.url.endsWith('/preview')?api.preview(input):api.confirm(input);
   reply(200,{ok:true,result});
  }catch(e){
   const code=String(e?.code||e?.message||'REQUEST_FAILED');
   const auth=/AUTH|SESSION|ACTOR_REVOKED|ACCESS_DENIED/.test(code);
   reply(auth?403:400,{ok:false,error:code});
  }
 });
}
export async function listenCatchHttpLoopback(api,port=0){
 const server=createCatchHttpServer(api);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 return server;
}
