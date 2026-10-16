import {parentPort,workerData} from 'node:worker_threads';
import {SqliteGameCore} from './sqlite-core.mjs';
const core=new SqliteGameCore(workerData.path,()=>1000);
parentPort.postMessage({ready:true});
Atomics.wait(new Int32Array(workerData.gate),0,0);
try{
 const result=core.run(workerData.operation);
 parentPort.postMessage({ok:true,result});
}catch(error){
 parentPort.postMessage({ok:false,error:error?.code||error?.message||String(error)});
}finally{core.close()}
