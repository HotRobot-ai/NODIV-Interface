import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadDotEnv(path=resolve(process.cwd(),'.env')) {
  if(!existsSync(path)) return;
  for(const raw of readFileSync(path,'utf8').split(/\r?\n/)){
    const line=raw.trim(); if(!line||line.startsWith('#')) continue;
    const i=line.indexOf('='); if(i<1) continue;
    const k=line.slice(0,i).trim(), v=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
    if(process.env[k]===undefined) process.env[k]=v;
  }
}

export function labConfig(){
  loadDotEnv();
  const mode=process.env.NODIV_LAB_MODE||'legacy';
  return {
    mode,
    host:process.env.NODIV_HOST||'127.0.0.1',
    port:Number(process.env.NODIV_PORT||8787),
    dbPath:resolve(process.env.NODIV_DB_PATH||(mode==='registration'?'./data/nodiv-v2-registration.sqlite':mode==='evac'?'./data/nodiv-v2-evac-realtest.sqlite':'./data/nodiv-v2-test.sqlite')),
    eventId:process.env.NODIV_TEST_EVENT||(mode==='registration'?'BLOCK06-REALTEST':mode==='evac'?'EVAC-REALTEST':'TEST-V2'),
    sourceDbPath:resolve(process.env.NODIV_SOURCE_DB_PATH||'./data/nodiv-v2-registration.sqlite'),
    sourceEventId:process.env.NODIV_SOURCE_EVENT||'BLOCK06-REALTEST',
    tlsKey:process.env.NODIV_TLS_KEY||'',
    tlsCert:process.env.NODIV_TLS_CERT||'',
    sessionTtl:Number(process.env.NODIV_SESSION_TTL||3600),
    grantTtl:Number(process.env.NODIV_GRANT_TTL||90),
    exchangeTtl:Number(process.env.NODIV_EXCHANGE_TTL||300),
  };
}
