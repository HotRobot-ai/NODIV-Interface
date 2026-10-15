// Isolated transactional ownership prototype; not a port of NODIV game rules.
export class OwnershipCore {
  constructor(entries = []) {
    this.cores = new Map(entries.map(({id,owner}) => [id,owner]));
    if (this.cores.size !== entries.length) throw Error('DUPLICATE_CORE');
    this.requests = new Map();
    this.audit = [];
  }
  transfer({requestId, coreId, from, to}) {
    if (!requestId || !coreId || !from || !to || from === to) throw Error('INVALID_REQUEST');
    const fingerprint = JSON.stringify([coreId,from,to]);
    const old = this.requests.get(requestId);
    if (old) {
      if (old.fingerprint !== fingerprint) throw Error('IDEMPOTENCY_CONFLICT');
      return {...old.result, replay:true};
    }
    if (!this.cores.has(coreId)) throw Error('UNKNOWN_CORE');
    if (this.cores.get(coreId) !== from) throw Error('OWNERSHIP_CONFLICT');
    this.cores.set(coreId,to);
    const result = {requestId,coreId,from,to,replay:false};
    this.requests.set(requestId,{fingerprint,result});
    this.audit.push(result);
    return result;
  }
}
