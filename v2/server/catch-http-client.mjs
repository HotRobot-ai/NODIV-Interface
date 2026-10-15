import {createCatchUiFlow} from './catch-ui-flow.mjs';

// Browser-side V2 adapter; never obtains NFC grants from untrusted UID values.
// The caller supplies an authenticated, trusted NFC proof acquisition flow.
export function createCatchHttpClient({baseUrl,eventId,getSessionToken,acquireFreshNfcProof,onStatus}){
 if(typeof baseUrl!=='string'||!baseUrl||typeof eventId!=='string'||!eventId||
    typeof getSessionToken!=='function'||typeof acquireFreshNfcProof!=='function')throw Error('CATCH_CLIENT_CONFIG_REQUIRED');
 const request=async(path,payload)=>{
  const token=await getSessionToken();
  if(typeof token!=='string'||!token)throw Error('CATCH_SESSION_REQUIRED');
  const response=await fetch(new URL(path,baseUrl),{
   method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},
   body:JSON.stringify({eventId,...payload}),cache:'no-store'
  });
  const body=await response.json();
  if(!response.ok||body?.ok!==true){
   const error=new Error(body?.error||'CATCH_REQUEST_FAILED');
   error.status=response.status;throw error;
  }
  return body.result;
 };
 return createCatchUiFlow({
  preview:targetId=>request('/v2/catch/preview',{targetId}),
  confirm:({previewId,proof})=>request('/v2/catch/confirm',{previewId,proof}),
  acquireFreshNfcProof,onStatus
 });
}
