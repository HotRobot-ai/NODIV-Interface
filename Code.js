const SHEET_NAME = 'N-Core Register';

const NODE_SHEET_NAME = 'Node Register';

const ACCESS_CARD_SHEET_NAME = 'Access Card Register';

const TRANSACTION_LOG_SHEET_NAME = 'Transaction Log';
const DEPLOYMENT_SHEET_NAME = 'Deployment Register';
const UPLOAD_TERMINAL_SHEET_NAME = 'Upload Terminal Register';
const PLAYER_ENERGY_SHEET_NAME = 'Player Energy Ledger';
const EVENT_SHEET_NAME = 'Event Register';
const EVENT_NODE_CODE_SHEET_NAME = 'Event Node Codes';
const EVENT_PREFLIGHT_SHEET_NAME = 'Event Preflight';



/*

 \* ============================================================

 \* IDENTITY / EVENT LIMITS

 \* ============================================================

 \* Event limits can later be moved into an event configuration.

 \* systemMax is the hard architectural ceiling.

 */

const ROLE_CONFIG = {

  PIONEER: { prefix: 'P', eventLimit: 10, systemMax: 30, provisionable: true },

  FOP:     { prefix: 'F', eventLimit: 7,  systemMax: 7,  provisionable: true },

  LOCAL:   { prefix: 'L', eventLimit: 3,  systemMax: 3,  provisionable: true },

  UNBOUND: { prefix: 'U', eventLimit: 3,  systemMax: 3,  provisionable: true }

};





function doGet(e) {



  /*

   \* ============================================================

   \* WEB INTERFACES

   \* ============================================================

   */



  const page =

    String(e.parameter.page || '')

      .trim()

      .toLowerCase();





  if (page === 'identity') {



    return HtmlService

      .createHtmlOutputFromFile('Identity')

      .setTitle('NODIV // IDENTITY')

      .setXFrameOptionsMode(

        HtmlService.XFrameOptionsMode.ALLOWALL

      );



  }





  /*

   \* ============================================================

   \* API

   \* ============================================================

   */



  let result;





  try {



    const action =

      String(e.parameter.action || '')

        .toLowerCase();





    if (action === 'register') {



      result = registerCore(e);





    } else if (action === 'nextfree') {



      result = getNextFreeCore(e);





    } else if (action === 'registernode') {



      result = registerNode(e);





    } else if (action === 'nextfreenode') {



      result = getNextFreeNode(e);





    } else if (action === 'registeruploadterminal') {

      result = registerUploadTerminal(e);

    } else if (action === 'founderstatus') {

      result = getFounderProvisioningStatus(e);

    } else if (action === 'identify') {



      result = identifyAccessCard(e);





    } else if (action === 'registeraccesscard') {



      result = registerAccessCard(e);





    } else if (action === 'nextidentity') {



      result = getNextIdentity(e);





    } else if (action === 'initializecore') {



      result = initializeCoreOwnership(e);





    } else if (action === 'startcore') {



      result = startCoreTransfer(e);





    } else if (action === 'catch') {

      result = catchCoreTransfer(e);

    } else if (action === 'extract') {

      result = extractCoreTransfer(e);

    } else if (action === 'corestate') {



      result = getCoreState(e);





    } else if (action === 'uidlookup') {



      result = getUidLookup(e);





    } else if (action === 'sessionstart') {

      result = startPlayerSession(e);

    } else if (action === 'sessioncheck') {

      result = checkPlayerSession(e);

    } else if (action === 'sessionend') {

      result = endPlayerSession(e);

    } else if (action === 'gameplayroute') {

      result = getGameplayRoute(e);

    } else if (action === 'coredeposit') {

      result = depositOwnedCoreToReserve(e);

    } else if (action === 'playerstate') {

      result = getPlayerState(e);

    } else if (action === 'energybalance') {

      result = getPlayerEnergyBalance(e);

    } else if (action === 'uploadpreview') {

      result = getHqUploadPreview(e);

    } else if (action === 'deploymentassign') {

      result = assignCoreDeployment(e);

    } else if (action === 'deploymentaccept') {

      result = acceptCoreDeployment(e);

    } else if (action === 'deploymentpending') {

      result = getPendingPlayerDeployments(e);

    } else if (action === 'provisionaccesscard') {

      result = provisionAccessCardFromSession(e);

    } else if (action === 'provisionnode') {

      result = provisionNodeFromSession(e);

    } else if (action === 'deploymentdeliver') {

      result = deliverCoreDeployment(e);

    } else if (action === 'hqstatus') {

      result = getHqLiveOperations(e);

    } else if (action === 'eventstatus') {

      result = getEventStatus(e);

    } else if (action === 'eventreadiness') {

      result = getEventReadiness(e);

    } else if (action === 'eventreadinessrepair') {

      result = repairMissingCoreOwnership(e);

    } else if (action === 'eventpreflightconfirm') {

      result = confirmEventPreflight(e);

    } else if (action === 'eventinitialize') {

      result = initializeEvent(e);

    } else if (action === 'eventactivate') {

      result = activateEvent(e);

    } else if (action === 'eventabort') {

      result = abortEvent(e);

    } else if (action === 'nodeinstallorder') {

      result = getNodeInstallOrder(e);

    } else if (action === 'nodeinstallscan') {

      result = scanNodeInstallationCore(e);

    } else if (action === 'nodeinstallcancel') {

      result = cancelNodeInstallation(e);

    } else if (action === 'nodeinstallconfirm') {

      result = confirmNodeInstallation(e);

    } else {



      result = {

        ok: true,

        system: 'NODIV API',

        status: 'ONLINE'

      };



    }





  } catch (error) {



    result = {

      ok: false,

      error: error.message

    };



  }





  return createResponse(e, result);



}







/*

 \* ============================================================

 \* N-CORE REGISTRATION

 \* ============================================================

 */



function registerCore(e) {



  const lock =

    LockService.getScriptLock();





  try {



    lock.waitLock(10000);





    const coreId =

      String(e.parameter.core || '')

        .trim()

        .toUpperCase();





    const uid =

      normalizeUid(

        e.parameter.uid || ''

      );





    const energyRaw =

      String(e.parameter.energy || '')

        .trim();





    if (!/^NC-\d{3}$/.test(coreId)) {



      throw new Error(

        'Ungültiges N-Core ID Format.'

      );



    }





    const coreNumber =

      parseInt(

        coreId.substring(3),

        10

      );





    if (

      coreNumber < 1 ||

      coreNumber > 200

    ) {



      throw new Error(

        'N-Core ID außerhalb des Bereichs NC-001 bis NC-200.'

      );



    }





    if (!uid) {



      throw new Error(

        'NFC UID fehlt.'

      );



    }





    const energy =

      Number(energyRaw);





    if (!Number.isFinite(energy)) {



      throw new Error(

        'Energie ist ungültig.'

      );



    }





    const sheet =

      getRegisterSheet();



    /*

     \* UID muss NODIV-weit eindeutig sein.

     \* Derselbe Core darf bei erneutem Aufruf seine eigene UID behalten.

     */

    assertUidAvailable(uid, 'N_CORE', coreId);





    const lastRow =

      Math.max(

        sheet.getLastRow(),

        201

      );





    const coreIds =

      sheet

        .getRange(

          2,

          1,

          lastRow - 1,

          1

        )

        .getDisplayValues()

        .flat()

        .map(value =>

          String(value)

            .trim()

            .toUpperCase()

        );





    const index =

      coreIds.indexOf(coreId);





    if (index === -1) {



      throw new Error(

        coreId +

        ' wurde im N-Core Register nicht gefunden.'

      );



    }





    const row =

      index + 2;





    /*

     \* Alle vorhandenen UIDs lesen.

     */



    const uidValues =

      sheet

        .getRange(

          2,

          3,

          lastRow - 1,

          1

        )

        .getDisplayValues()

        .flat()

        .map(normalizeUid);





    /*

     \* Dieselbe UID darf nicht bei

     \* einem anderen Core vorhanden sein.

     */



    const duplicateIndex =

      uidValues.indexOf(uid);





    if (

      duplicateIndex !== -1 &&

      duplicateIndex + 2 !== row

    ) {



      throw new Error(

        'UID ist bereits ' +

        sheet

          .getRange(

            duplicateIndex + 2,

            1

          )

          .getDisplayValue() +

        ' zugeordnet.'

      );



    }





    /*

     \* Ziel-Core prüfen.

     */



    const existingUid =

      normalizeUid(

        sheet

          .getRange(

            row,

            3

          )

          .getDisplayValue()

      );





    /*

     \* Falls dieser Core bereits eine andere UID besitzt:

     \* NICHT überschreiben.

     */



    if (

      existingUid &&

      existingUid !== uid

    ) {



      throw new Error(

        coreId +

        ' besitzt bereits eine andere UID: ' +

        existingUid

      );



    }





    /*

     \* Registrierung schreiben.

     */



    sheet

      .getRange(

        row,

        2

      )

      .setValue(energy);





    sheet

      .getRange(

        row,

        3

      )

      .setValue(uid);





    sheet

      .getRange(

        row,

        4

      )

      .setValue('ERFASST');





    SpreadsheetApp.flush();





    /*

     \* Danach nächsten freien Core suchen.

     */



    /* Fresh physical N-Cores enter NODIV_RESERVE // HQ immediately. */
    const registeredState = readCoreState(coreId);
    if (!registeredState.ownerType && !registeredState.ownerId) {
      const initTransactionId = appendTransactionLog({
        eventType: 'CORE_INITIALIZED', actorId: 'HQ', actorRole: 'SYSTEM', coreId: coreId,
        fromType: 'NONE', fromId: '', toType: 'NODIV_RESERVE', toId: 'HQ',
        visibleEnergy: registeredState.visibleEnergy, hiddenEnergy: registeredState.hiddenEnergy,
        actualEnergy: registeredState.actualEnergy, result: 'SUCCESS',
        details: 'Automatic reserve initialization during physical N-Core registration'
      });
      writeCoreOwnership(registeredState.row, 'NODIV_RESERVE', 'HQ', initTransactionId);
      sheet.getRange(registeredState.row, CORE_COL.STATUS).setValue('RESERVE');
      SpreadsheetApp.flush();
    } else if (registeredState.ownerType !== 'NODIV_RESERVE' || registeredState.ownerId !== 'HQ') {
      throw new Error(coreId + ' besitzt bereits Ownership // ' + (registeredState.ownerType || '—') + ' // ' + (registeredState.ownerId || '—'));
    }

    const nextFreeCore =

      findNextFreeCore(

        sheet,

        coreNumber

      );





    return {



      ok: true,



      core: coreId,



      uid: uid,



      energy: energy,



      chipStatus: 'ERFASST',



      nextFreeCore: nextFreeCore



    };





  } finally {



    try {



      lock.releaseLock();



    } catch (error) {



      // nichts zu tun



    }



  }



}







/*

 \* ============================================================

 \* NEXT FREE N-CORE

 \* ============================================================

 */



function getNextFreeCore(e) {



  const sheet =

    getRegisterSheet();





  let afterNumber = 0;





  const after =

    String(e.parameter.after || '')

      .trim()

      .toUpperCase();





  if (/^NC-\d{3}$/.test(after)) {



    afterNumber =

      parseInt(

        after.substring(3),

        10

      );



  }





  const nextFreeCore =

    findNextFreeCore(

      sheet,

      afterNumber

    );





  return {



    ok: true,



    nextFreeCore: nextFreeCore



  };



}







/*

 \* ============================================================

 \* FIND NEXT FREE N-CORE

 \* ============================================================

 */



function findNextFreeCore(

  sheet,

  afterNumber

) {



  /*

   \* NC-001 bis NC-200.

   \* Spalte C = UID.

   */



  const uidValues =

    sheet

      .getRange(

        2,

        3,

        200,

        1

      )

      .getDisplayValues()

      .flat()

      .map(normalizeUid);





  /*

   \* Erst hinter dem aktuellen Core suchen.

   */



  for (

    let number = afterNumber + 1;

    number <= 200;

    number++

  ) {



    const index =

      number - 1;





    if (!uidValues[index]) {



      return formatCoreId(number);



    }



  }





  /*

   \* Falls hinten nichts frei:

   \* vorne noch einmal suchen.

   */



  for (

    let number = 1;

    number <= afterNumber;

    number++

  ) {



    const index =

      number - 1;





    if (!uidValues[index]) {



      return formatCoreId(number);



    }



  }





  /*

   \* Alle 200 belegt.

   */



  return null;



}







/*

 \* ============================================================

 \* FORMAT CORE ID

 \* ============================================================

 */



function formatCoreId(number) {



  return (

    'NC-' +

    String(number).padStart(

      3,

      '0'

    )

  );



}







/*

 \* ============================================================

 \* NODE REGISTRATION

 \* ============================================================

 */



function getFounderProvisioningStatus(e) {
  const session=resolvePlayerSession(e.parameter.token||'');
  if(!session.ok)return session.response;
  const actor=session.player;
  if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Founder Status erfordert ROOT Zugriff.');

  const nodeSheet=getNodeRegisterSheet();
  const nodeUids=nodeSheet.getRange(2,2,15,1).getDisplayValues().flat().map(normalizeUid);
  const nodeCount=nodeUids.filter(Boolean).length;

  const coreSheet=getRegisterSheet();
  const coreUids=coreSheet.getRange(2,3,200,1).getDisplayValues().flat().map(normalizeUid);
  const coreCount=coreUids.filter(Boolean).length;

  const uploadSheet=findUploadTerminalSheet();
  const uploads={UPLOAD_HQ:false,UPLOAD_FOP:false};
  if(uploadSheet){
    const last=Math.max(uploadSheet.getLastRow(),1);
    if(last>1){
      uploadSheet.getRange(2,1,last-1,6).getDisplayValues().forEach(r=>{
        const type=String(r[1]||'').trim().toUpperCase(),uid=normalizeUid(r[2]),status=String(r[3]||'').trim().toUpperCase();
        if(uid&&status==='ACTIVE'&&Object.prototype.hasOwnProperty.call(uploads,type))uploads[type]=true;
      });
    }
  }
  return {ok:true,authenticated:true,session:true,status:'FOUNDER_PROVISIONING_STATUS',nodes:{registered:nodeCount,total:15},cores:{registered:coreCount,total:200},uploads:uploads};
}

function findUploadTerminalSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UPLOAD_TERMINAL_SHEET_NAME);
}

function getUploadTerminalSheet() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=findUploadTerminalSheet();
  if(!sheet){sheet=ss.insertSheet(UPLOAD_TERMINAL_SHEET_NAME);sheet.getRange(1,1,1,6).setValues([['TERMINAL ID','TYPE','NFC UID','STATUS','REGISTERED BY','REGISTERED AT']]);}
  return sheet;
}
function registerUploadTerminal(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||''); if(!session.ok)return session.response;
    const actor=session.player; if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann Upload-Terminals provisionieren.');
    const type=String(e.parameter.type||'').trim().toUpperCase(); if(!['UPLOAD_HQ','UPLOAD_FOP'].includes(type))throw new Error('Ungültiger Upload-Terminal-Typ.');
    const uid=normalizeUid(e.parameter.uid||''); if(!uid)throw new Error('NFC UID fehlt.');
    const sheet=getUploadTerminalSheet(),last=Math.max(sheet.getLastRow(),1);
    const existingRows=last>1?sheet.getRange(2,1,last-1,6).getDisplayValues():[];
    const bayNumbers=existingRows.map(r=>/^UPLOAD-HQ-BAY-(\d{2})$/.exec(String(r[0]||'').trim().toUpperCase())).filter(Boolean).map(m=>Number(m[1]));
    const nextBay=bayNumbers.length?Math.max(...bayNumbers)+1:1;
    const terminalId=type==='UPLOAD_HQ'?'UPLOAD-HQ-BAY-'+String(nextBay).padStart(2,'0'):'UPLOAD-FOP-001';
    const rows=existingRows,existing=rows.find(r=>normalizeUid(r[2])===uid);
    if(existing){
      const oldUid=normalizeUid(existing[2]);
      if(oldUid===uid)return {ok:true,authenticated:true,session:true,action:true,status:'UPLOAD_TERMINAL_ALREADY_REGISTERED',terminal:{id:String(existing[0]||terminalId).trim().toUpperCase(),type:type,uid:uid,status:String(existing[3]||'ACTIVE').trim().toUpperCase()}};
      throw new Error(terminalId+' besitzt bereits eine andere UID.');
    }
    assertUidAvailable(uid,'UPLOAD_TERMINAL',terminalId);
    sheet.appendRow([terminalId,type,uid,'ACTIVE',actor.identity,new Date()]);
    appendTransactionLog({eventType:'UPLOAD_TERMINAL_PROVISIONED',actorId:actor.identity,actorRole:actor.role,result:'SUCCESS',details:terminalId+' // '+type+' // NFC UID registered'});
    SpreadsheetApp.flush();
    return {ok:true,authenticated:true,session:true,action:true,status:'UPLOAD_TERMINAL_PROVISIONED',terminal:{id:terminalId,type:type,uid:uid,status:'ACTIVE'}};
  }finally{try{lock.releaseLock()}catch(error){}}
}

function registerNode(e) {



  const lock = LockService.getScriptLock();



  try {



    lock.waitLock(10000);



    const nodeId =

      String(e.parameter.node || '')

        .trim()

        .toUpperCase();



    const uid =

      normalizeUid(

        e.parameter.uid || ''

      );



    if (!/^NODE-\d{3}$/.test(nodeId)) {

      throw new Error(

        'Ungültiges Node ID Format.'

      );

    }



    const nodeNumber =

      parseInt(

        nodeId.substring(5),

        10

      );



    if (nodeNumber < 1 || nodeNumber > 15) {

      throw new Error(

        'Node ID außerhalb des Bereichs NODE-001 bis NODE-015.'

      );

    }



    if (!uid) {

      throw new Error(

        'NFC UID fehlt.'

      );

    }



    const sheet =

      getNodeRegisterSheet();



    /*

     \* UID muss NODIV-weit eindeutig sein.

     \* Derselbe Node darf bei erneutem Aufruf seine eigene UID behalten.

     */

    assertUidAvailable(uid, 'NODE', nodeId);



    const lastRow =

      Math.max(

        sheet.getLastRow(),

        16

      );



    const nodeIds =

      sheet

        .getRange(

          2,

          1,

          lastRow - 1,

          1

        )

        .getDisplayValues()

        .flat()

        .map(value =>

          String(value)

            .trim()

            .toUpperCase()

        );



    const index =

      nodeIds.indexOf(nodeId);



    if (index === -1) {

      throw new Error(

        nodeId +

        ' wurde im Node Register nicht gefunden.'

      );

    }



    const row =

      index + 2;



    const uidValues =

      sheet

        .getRange(

          2,

          2,

          lastRow - 1,

          1

        )

        .getDisplayValues()

        .flat()

        .map(normalizeUid);



    const duplicateIndex =

      uidValues.indexOf(uid);



    if (

      duplicateIndex !== -1 &&

      duplicateIndex + 2 !== row

    ) {

      throw new Error(

        'UID ist bereits ' +

        sheet

          .getRange(

            duplicateIndex + 2,

            1

          )

          .getDisplayValue() +

        ' zugeordnet.'

      );

    }



    const existingUid =

      normalizeUid(

        sheet

          .getRange(

            row,

            2

          )

          .getDisplayValue()

      );



    if (

      existingUid &&

      existingUid !== uid

    ) {

      throw new Error(

        nodeId +

        ' besitzt bereits eine andere UID: ' +

        existingUid

      );

    }



    sheet

      .getRange(

        row,

        2

      )

      .setValue(uid);



    sheet

      .getRange(

        row,

        3

      )

      .setValue('AVAILABLE');



    /*

     \* LOCATION, INSTALLED BY und LAST UPDATE

     \* bleiben bei der Erstregistrierung leer.

     */



    SpreadsheetApp.flush();



    const nextFreeNode =

      findNextFreeNode(

        sheet,

        nodeNumber

      );



    return {

      ok: true,

      node: nodeId,

      uid: uid,

      status: 'AVAILABLE',

      nextFreeNode: nextFreeNode

    };



  } finally {



    try {

      lock.releaseLock();

    } catch (error) {

      // nichts zu tun

    }



  }



}





/*

 \* ============================================================

 \* NEXT FREE NODE

 \* ============================================================

 */



/*
 * SESSION-AUTHORIZED NODE PROVISIONING
 * Unknown physical NFC tag -> next free NODE-001..NODE-015.
 * The client never chooses the Node ID; the backend resolves it under lock.
 */
function provisionNodeFromSession(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const session = resolvePlayerSession(e.parameter.token || '');
    if (!session.ok) return session.response;

    const actor = session.player;
    if (!['FOUNDER','FOP'].includes(actor.role)) {
      return gameplayActionDenied(actor, 'ROLE_DENIED', 'Keine Berechtigung zur Node-Provisionierung.');
    }

    const uid = normalizeUid(e.parameter.uid || '');
    if (!uid) throw new Error('NFC UID fehlt.');

    const existing = lookupUidGlobally(uid);
    if (existing.found) {
      return gameplayActionDenied(actor, 'UID_ALREADY_REGISTERED', 'Dieser NFC-Tag ist bereits im NODIV-System registriert.');
    }

    const sheet = getNodeRegisterSheet();
    const nodeId = findNextFreeNode(sheet, 0);
    if (!nodeId) {
      return gameplayActionDenied(actor, 'NODE_SERIES_COMPLETE', 'Alle NODE-001 bis NODE-015 sind bereits provisioniert.');
    }

    assertUidAvailable(uid, 'NODE', nodeId);

    const nodeNumber = parseInt(nodeId.substring(5), 10);
    const row = nodeNumber + 1;
    const existingUid = normalizeUid(sheet.getRange(row, 2).getDisplayValue());
    if (existingUid) {
      throw new Error(nodeId + ' wurde während der Provisionierung bereits belegt.');
    }

    const existingId = String(sheet.getRange(row, 1).getDisplayValue() || '').trim().toUpperCase();
    if (existingId && existingId !== nodeId) {
      throw new Error('Node-Slot ' + nodeId + ' enthält eine widersprüchliche ID // ' + existingId);
    }
    sheet.getRange(row, 1).setValue(nodeId);
    sheet.getRange(row, 2).setValue(uid);
    sheet.getRange(row, 3).setValue('AVAILABLE');
    sheet.getRange(row, 5).setValue(actor.identity);
    sheet.getRange(row, 6).setValue(new Date());

    appendTransactionLog({
      eventType: 'NODE_PROVISIONED',
      actorId: actor.identity,
      actorRole: actor.role,
      nodeId: nodeId,
      result: 'SUCCESS',
      details: 'Physical Node provisioned // ' + nodeId + ' // NFC UID registered'
    });

    SpreadsheetApp.flush();

    return {
      ok: true,
      authenticated: true,
      session: true,
      action: true,
      status: 'NODE_PROVISIONED',
      message: nodeId + ' wurde erfolgreich provisioniert.',
      node: { id: nodeId, uid: uid, status: 'AVAILABLE' },
      nextFreeNode: findNextFreeNode(sheet, nodeNumber)
    };
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}


function getNextFreeNode(e) {



  const sheet =

    getNodeRegisterSheet();



  let afterNumber = 0;



  const after =

    String(e.parameter.after || '')

      .trim()

      .toUpperCase();



  if (/^NODE-\d{3}$/.test(after)) {

    afterNumber =

      parseInt(

        after.substring(5),

        10

      );

  }



  const nextFreeNode =

    findNextFreeNode(

      sheet,

      afterNumber

    );



  return {

    ok: true,

    nextFreeNode: nextFreeNode

  };



}





/*

 \* ============================================================

 \* FIND NEXT FREE NODE

 \* ============================================================

 */



function findNextFreeNode(

  sheet,

  afterNumber

) {



  const uidValues =

    sheet

      .getRange(

        2,

        2,

        15,

        1

      )

      .getDisplayValues()

      .flat()

      .map(normalizeUid);



  for (

    let number = afterNumber + 1;

    number <= 15;

    number++

  ) {



    const index =

      number - 1;



    if (!uidValues[index]) {

      return formatNodeId(number);

    }



  }



  for (

    let number = 1;

    number <= afterNumber;

    number++

  ) {



    const index =

      number - 1;



    if (!uidValues[index]) {

      return formatNodeId(number);

    }



  }



  return null;

}





/*

 \* ============================================================

 \* FORMAT NODE ID

 \* ============================================================

 */



function formatNodeId(number) {



  return (

    'NODE-' +

    String(number).padStart(

      3,

      '0'

    )

  );



}





/*

 \* ============================================================

 \* NODE REGISTER SHEET

 \* ============================================================

 */



function getNodeRegisterSheet() {



  const ss =

    SpreadsheetApp

      .getActiveSpreadsheet();



  const sheet =

    ss.getSheetByName(

      NODE_SHEET_NAME

    );



  if (!sheet) {

    throw new Error(

      'Tabellenblatt "' +

      NODE_SHEET_NAME +

      '" wurde nicht gefunden.'

    );

  }



  return sheet;

}





/*

 \* ============================================================

 \* ACCESS CARD IDENTIFICATION

 \* ============================================================

 */



function identifyAccessCard(e) {



  const uid =

    normalizeUid(

      e.parameter.uid || ''

    );



  if (!uid) {

    throw new Error(

      'Access Card UID fehlt.'

    );

  }



  const sheet =

    getAccessCardRegisterSheet();



  const lastRow =

    Math.max(

      sheet.getLastRow(),

      2

    );



  const rows =

    sheet

      .getRange(

        2,

        1,

        lastRow - 1,

        12

      )

      .getValues();



  let match = null;



  for (let i = 0; i < rows.length; i++) {

    const rowUid = normalizeUid(rows[i][3]);

    if (rowUid && rowUid === uid) {

      match = rows[i];

      break;

    }

  }



  if (!match) {

    return {

      ok: true,

      authenticated: false,

      identity: null,

      role: null,

      clearance: null,

      status: 'UNKNOWN_CARD',

      uid: uid

    };

  }



  const cardId = String(match[0] || '').trim().toUpperCase();

  const identity = String(match[1] || '').trim().toUpperCase();

  const role = String(match[2] || '').trim().toUpperCase();

  const status = String(match[4] || '').trim().toUpperCase();

  const displayName = String(match[5] || '').trim();

  const coreCapacity = Number(match[6] || 0);

  const nodeAccess = match[7] === true;

  const catchAccess = match[8] === true;

  const ghostUntil = match[9] || null;



  if (!cardId || !identity || !role) {

    throw new Error(

      'Access Card Register enthält einen unvollständigen Datensatz.'

    );

  }



  const authenticated = status === 'ACTIVE';



  return {

    ok: true,

    authenticated: authenticated,

    identity: identity,

    role: role,

    clearance: getClearanceForRole(role),

    cardId: cardId,

    status: status || 'UNDEFINED',

    displayName: displayName || identity,

    coreCapacity: coreCapacity,

    nodeAccess: nodeAccess,

    catchAccess: catchAccess,

    ghostUntil: ghostUntil,

    uid: uid

  };



}





function getAccessCardRegisterSheet() {



  const ss =

    SpreadsheetApp

      .getActiveSpreadsheet();



  const sheet =

    ss.getSheetByName(

      ACCESS_CARD_SHEET_NAME

    );



  if (!sheet) {

    throw new Error(

      'Tabellenblatt "' +

      ACCESS_CARD_SHEET_NAME +

      '" wurde nicht gefunden.'

    );

  }



  return sheet;

}





function getClearanceForRole(role) {



  switch (String(role || '').toUpperCase()) {

    case 'FOUNDER':

      return 'ROOT';

    case 'FOP':

      return 'OPERATIONS';

    case 'PIONEER':

      return 'FIELD';

    case 'LOCAL':

      return 'LOCAL';

    case 'UNBOUND':

      return 'UNBOUND';

    default:

      return 'NONE';

  }

}







/*
 * ============================================================
 * PLAYER SESSION V0.1
 * ============================================================
 * Access Card UID starts a session. Gameplay requests use an
 * opaque server-issued token. The current Access Card record is
 * revalidated whenever the session is checked.
 */

const PLAYER_SESSION_TTL_SECONDS = 4 * 60 * 60;
const PLAYER_SESSION_PREFIX = 'NODIV_SESSION_';

function startPlayerSession(e) {
  const uid = normalizeUid(e.parameter.uid || '');
  if (!uid) throw new Error('Access Card UID fehlt.');

  const player = findAccessCardByUid(uid);

  if (!player) {
    return { ok: true, authenticated: false, session: false, status: 'UNKNOWN_CARD' };
  }

  if (player.status !== 'ACTIVE') {
    return {
      ok: true, authenticated: false, session: false,
      identity: player.identity, role: player.role,
      status: player.status || 'NOT_ACTIVE'
    };
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PLAYER_SESSION_TTL_SECONDS * 1000);

  const sessionData = {
    identity: player.identity,
    role: player.role,
    cardId: player.cardId,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  CacheService.getScriptCache().put(
    PLAYER_SESSION_PREFIX + token,
    JSON.stringify(sessionData),
    PLAYER_SESSION_TTL_SECONDS
  );

  appendTransactionLog({
    eventType: 'SESSION_START',
    actorId: player.identity,
    actorRole: player.role,
    result: 'SUCCESS',
    details: 'Player session started // ' + player.cardId
  });

  return {
    ok: true,
    authenticated: true,
    session: true,
    token: token,
    expiresAt: expiresAt.toISOString(),
    player: getSessionPlayerDisplay(player)
  };
}

function checkPlayerSession(e) {
  const token = normalizeSessionToken(e.parameter.token || '');

  if (!token) {
    return { ok: true, authenticated: false, session: false, status: 'NO_SESSION' };
  }

  const cache = CacheService.getScriptCache();
  const raw = cache.get(PLAYER_SESSION_PREFIX + token);

  if (!raw) {
    return { ok: true, authenticated: false, session: false, status: 'SESSION_EXPIRED' };
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch (error) {
    cache.remove(PLAYER_SESSION_PREFIX + token);
    throw new Error('Session-Datensatz ist ungültig.');
  }

  const player = findIdentityById(session.identity || '');

  if (!player || player.status !== 'ACTIVE' ||
      player.cardId !== session.cardId || player.role !== session.role) {
    cache.remove(PLAYER_SESSION_PREFIX + token);
    return { ok: true, authenticated: false, session: false, status: 'SESSION_REVOKED' };
  }

  return {
    ok: true,
    authenticated: true,
    session: true,
    expiresAt: session.expiresAt || null,
    player: getSessionPlayerDisplay(player)
  };
}

function endPlayerSession(e) {
  const token = normalizeSessionToken(e.parameter.token || '');

  if (!token) return { ok: true, ended: false, status: 'NO_SESSION' };

  const cache = CacheService.getScriptCache();
  const key = PLAYER_SESSION_PREFIX + token;
  const raw = cache.get(key);
  let session = null;

  if (raw) {
    try { session = JSON.parse(raw); } catch (error) {}
  }

  cache.remove(key);

  if (session && session.identity) {
    appendTransactionLog({
      eventType: 'SESSION_END',
      actorId: session.identity,
      actorRole: session.role || '',
      result: 'SUCCESS',
      details: 'Player session ended'
    });
  }

  return {
    ok: true,
    ended: Boolean(raw),
    status: raw ? 'SESSION_ENDED' : 'SESSION_NOT_FOUND'
  };
}

function normalizeSessionToken(value) {
  const token = String(value || '').trim();
  return /^[0-9a-fA-F-]{72}$/.test(token) ? token : '';
}

function getSessionPlayerDisplay(player) {
  let gameplayStatus = player.status === 'ACTIVE' ? 'ACTIVE' : 'NOT ACTIVE';

  if (player.ghostUntil) {
    const until = new Date(player.ghostUntil);
    if (!isNaN(until.getTime()) && until.getTime() > Date.now()) gameplayStatus = 'GHOST';
  }

  return {
    identity: player.identity,
    role: player.role,
    displayName: player.displayName || player.identity,
    clearance: getClearanceForRole(player.role),
    status: gameplayStatus,
    coreCapacity: player.coreCapacity,
    nodeAccess: player.nodeAccess,
    catchAccess: player.catchAccess,
    ghostUntil: player.ghostUntil || null
  };
}



/*

 \* ============================================================

 \* ACCESS CARD REGISTRATION

 \* ============================================================

 \* V1 provisioning: ACTIVE FOUNDER/FOP authorizes a new card.

 \* Role permissions are assigned server-side.

 \* NFC UID is an identifier, not a cryptographic credential;

 \* secure Founder PC login/session remains a later security layer.

 */




/*
 * GAMEPLAY ROUTER V0.1 // READ-ONLY DECISION LAYER
 * No ownership mutation. No transaction booking.
 */
function getGameplayRoute(e) {
  const session = resolvePlayerSession(e.parameter.token || '');
  if (!session.ok) return session.response;
  const uid = normalizeUid(e.parameter.uid || '');
  if (!uid) throw new Error('Scan UID fehlt.');
  const player = session.player, hit = lookupUidGlobally(uid);

  if (!hit.found) {
    const canProvisionNode = ['FOUNDER','FOP'].includes(player.role);
    return gameplayDecision(
      player,
      {found:false,type:'UNKNOWN',id:'',uid:uid},
      canProvisionNode ? 'PROVISION_NODE' : 'NO_ACTION',
      canProvisionNode,
      canProvisionNode ? 'UNREGISTERED_OBJECT_PROVISIONABLE' : 'UNREGISTERED_OBJECT',
      canProvisionNode ? 'Unregistrierter NFC-Tag erkannt. Als nächsten freien Node provisionieren?' : 'Objekt ist nicht im NODIV-System registriert.'
    );
  }

  if (hit.type === 'ACCESS_CARD') {
    const target=findIdentityById(hit.identity||'');
    return gameplayDecision(player,{found:true,type:'ACCESS_CARD',id:hit.id||'',identity:hit.identity||'',status:target?getSessionPlayerDisplay(target).status:'UNVERIFIED'},'IDENTITY_INFO',true,'PLAYER_IDENTIFIED','NODIV Identität erkannt.');
  }

  if (hit.type === 'NODE') {
    const status=getNodeGameplayStatus(hit.id);
    const cargo=findActiveDeploymentForCarrier(player.identity,player.role);
    if(cargo){
      const isTarget=cargo.targetNode===String(hit.id||'').trim().toUpperCase();
      return gameplayDecision(
        player,
        {found:true,type:'NODE',id:hit.id||'',status:status,deploymentId:cargo.deploymentId,cargoEnergy:getDeploymentCoreEnergy(cargo.coreId)},
        isTarget?'DEPLOY_MISSION_CARGO':'NO_ACTION',
        isTarget,
        isTarget?'MISSION_CARGO_TARGET':'MISSION_CARGO_WRONG_NODE',
        isTarget?'Ziel-Node erkannt. Mission Cargo kann eingesetzt werden.':'Mission Cargo ist an einen anderen Ziel-Node gebunden.'
      );
    }
    const authorization=getNodeAccessAuthorization(player,hit.id,status);
    return gameplayDecision(
      player,
      {found:true,type:'NODE',id:hit.id||'',status:status},
      authorization.allowed?'NODE_INTERACTION':'NO_ACTION',
      authorization.allowed,
      authorization.reason,
      authorization.message,
      authorization.allowed&&authorization.accessCode?{accessCode:authorization.accessCode}:null
    );
  }

  if (hit.type === 'UPLOAD_TERMINAL') {
    const active=hit.status==='ACTIVE';
    return gameplayDecision(player,{found:true,type:'UPLOAD_TERMINAL',id:hit.id||'',terminalType:hit.terminalType||'',status:hit.status||''},active?'UPLOAD_TERMINAL':'NO_ACTION',active,active?'UPLOAD_TERMINAL_RECOGNIZED':'UPLOAD_TERMINAL_INACTIVE',active?'Upload-Terminal erkannt. Folgeaktion wird rollenabhängig angebunden.':'Upload-Terminal ist nicht aktiv.');
  }

  if (hit.type === 'N_CORE') return routeCoreGameplay(player,readCoreState(hit.id));

  return gameplayDecision(player,{found:true,type:hit.type||'UNKNOWN',id:hit.id||''},'NO_ACTION',false,'UNSUPPORTED_OBJECT','Für diesen Objekttyp ist noch keine Gameplay-Regel definiert.');
}

function resolvePlayerSession(tokenValue) {
  const token=normalizeSessionToken(tokenValue);
  if(!token) return {ok:false,response:{ok:true,authenticated:false,session:false,route:false,status:'NO_SESSION'}};
  const cache=CacheService.getScriptCache(), raw=cache.get(PLAYER_SESSION_PREFIX+token);
  if(!raw) return {ok:false,response:{ok:true,authenticated:false,session:false,route:false,status:'SESSION_EXPIRED'}};
  let stored;
  try{stored=JSON.parse(raw)}catch(error){cache.remove(PLAYER_SESSION_PREFIX+token);return {ok:false,response:{ok:true,authenticated:false,session:false,route:false,status:'SESSION_REVOKED'}}}
  const player=findIdentityById(stored.identity||'');
  if(!player||player.status!=='ACTIVE'||player.cardId!==stored.cardId||player.role!==stored.role){
    cache.remove(PLAYER_SESSION_PREFIX+token);
    return {ok:false,response:{ok:true,authenticated:false,session:false,route:false,status:'SESSION_REVOKED'}};
  }
  return {ok:true,player:player,session:stored};
}

function routeCoreGameplay(player,core) {
  const object={found:true,type:'N_CORE',id:core.coreId,status:core.status||'UNDEFINED',energy:core.actualEnergy===''?core.visibleEnergy:core.actualEnergy,ownerType:core.ownerType||'',ownerId:core.ownerId||''};

  if(!core.ownerType||!core.ownerId) return gameplayDecision(player,object,'NO_ACTION',false,'OWNERSHIP_UNDEFINED','N-Core erkannt. Ownership ist nicht vollständig definiert.');

  if(core.ownerId===player.identity) {
    if(player.role==='FOP' && core.ownerType==='FOP') {
      return gameplayDecision(player,object,'DEPOSIT_CORE',true,'FOP_OWN_CORE','N-Core gesichert. Rückführung in die NODIV Reserve ist zulässig.');
    }
    return gameplayDecision(player,object,'CORE_OWNED',true,'OWN_CORE','N-Core gehört der aktiven Identität. Für diesen Zustand ist noch keine Folgeaktion angebunden.');
  }

  if(core.ownerType==='NODE') {
    if(player.nodeAccess) return gameplayDecision(player,object,'CORE_AT_NODE',true,'NODE_CORE_ACCESS','N-Core ist einem Node zugeordnet. Node-bezogene Folgeaktion ist grundsätzlich zulässig.');
    return gameplayDecision(player,object,'NO_ACTION',false,'NODE_ACCESS_DENIED','N-Core gehört zu einem Node. Diese Rolle besitzt keinen Node-Zugriff.');
  }

  if(core.ownerType==='UNBOUND'&&player.catchAccess) return gameplayDecision(player,object,'CATCH_AVAILABLE',true,'CATCH_ELIGIBLE','UNBOUND N-Core erkannt. Catch ist für diese Rolle grundsätzlich zulässig.');

  if(core.ownerType==='NODIV_RESERVE') {
    const privileged=player.role==='FOUNDER'||player.role==='FOP';
    return gameplayDecision(player,object,privileged?'RESERVE_CORE':'NO_ACTION',privileged,privileged?'RESERVE_ACCESS':'RESERVE_PROTECTED',privileged?'NODIV Reserve erkannt.':'NODIV Reserve erkannt. Keine Feldaktion zulässig.');
  }

  return gameplayDecision(player,object,'NO_ACTION',false,'OWNERSHIP_MISMATCH','N-Core gehört einer anderen Identität oder Rolle. Keine automatische Umbuchung.');
}

/*
 * HQ UPLOAD V1.0 // READ-ONLY PREVIEW
 * The player phone scans a registered HQ upload bay. The server
 * derives selectable cores from authoritative ownership; the
 * browser cannot invent core IDs or energy values.
 */
/*
 * ============================================================
 * PLAYER ENERGY LEDGER V1.0
 * ============================================================
 * Server-side source of truth for permanently SECURED energy.
 * One BALANCE row per identity. All future credits/debits must
 * pass through bookPlayerEnergy() while holding ScriptLock.
 */
function getPlayerEnergyLedgerSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PLAYER_ENERGY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PLAYER_ENERGY_SHEET_NAME);
    sheet.appendRow(['Entry ID','Timestamp','Identity','Role','Type','Amount','Balance After','Reference','Details']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readPlayerEnergyBalance(identity) {
  const wanted = String(identity || '').trim().toUpperCase();
  if (!wanted) throw new Error('Identity fehlt.');
  const sheet = getPlayerEnergyLedgerSheet();
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const rows = sheet.getRange(2,1,last-1,9).getValues();
  for (let i=rows.length-1;i>=0;i--) {
    if (String(rows[i][2]||'').trim().toUpperCase() === wanted) {
      const balance = Number(rows[i][6] || 0);
      if (!Number.isFinite(balance) || balance < 0) throw new Error('Energy Ledger enthält einen ungültigen Kontostand.');
      return balance;
    }
  }
  return 0;
}

function bookPlayerEnergy(data) {
  const identity = String(data.identity || '').trim().toUpperCase();
  const role = String(data.role || '').trim().toUpperCase();
  const type = String(data.type || '').trim().toUpperCase();
  const amount = Number(data.amount);
  if (!identity || !role || !type) throw new Error('Energy Ledger Buchung ist unvollständig.');
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Energy Ledger Betrag ist ungültig.');
  const before = readPlayerEnergyBalance(identity);
  const after = before + amount;
  if (after < 0) throw new Error('SECURED ENERGY reicht für diese Aktion nicht aus.');
  const entryId = 'EN-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().substring(0,8).toUpperCase();
  getPlayerEnergyLedgerSheet().appendRow([entryId,new Date(),identity,role,type,amount,after,String(data.reference||''),String(data.details||'')]);
  return {entryId:entryId,before:before,amount:amount,balance:after};
}

function getPlayerState(e) {
  const session = resolvePlayerSession(e.parameter.token || '');
  if (!session.ok) return session.response;
  const player = session.player;
  const ownerType = player.role;
  const ownerId = player.identity;
  const sheet = getRegisterSheet();
  const rows = sheet.getRange(2, 1, 200, Math.max(CORE_COL.UPDATED_AT, CORE_COL.OWNER_ID)).getValues();
  const cores = [];
  rows.forEach((row, index) => {
    const type = String(row[CORE_COL.OWNER_TYPE - 1] || '').trim().toUpperCase();
    const id = String(row[CORE_COL.OWNER_ID - 1] || '').trim().toUpperCase();
    if (type !== ownerType || id !== ownerId) return;
    const visible = row[CORE_COL.VISIBLE_ENERGY - 1] === '' ? '' : Number(row[CORE_COL.VISIBLE_ENERGY - 1]);
    const actual = row[CORE_COL.ACTUAL_ENERGY - 1] === '' ? '' : Number(row[CORE_COL.ACTUAL_ENERGY - 1]);
    cores.push({
      coreId: String(row[CORE_COL.ID - 1] || '').trim().toUpperCase(),
      energy: actual === '' ? visible : actual,
      status: String(row[CORE_COL.STATUS - 1] || '').trim().toUpperCase()
    });
  });
  const carriedEnergy = cores.reduce((sum, core) => sum + (Number.isFinite(Number(core.energy)) ? Number(core.energy) : 0), 0);
  return {
    ok:true, authenticated:true, session:true, status:'PLAYER_STATE',
    player:getSessionPlayerDisplay(player),
    securedEnergy:readPlayerEnergyBalance(player.identity),
    carriedEnergy:carriedEnergy,
    cores:cores.slice(0, Math.max(0, Number(player.coreCapacity || 0)))
  };
}

function getPlayerEnergyBalance(e) {
  const session = resolvePlayerSession(e.parameter.token || '');
  if (!session.ok) return session.response;
  const player = session.player;
  return {ok:true,authenticated:true,session:true,identity:player.identity,securedEnergy:readPlayerEnergyBalance(player.identity)};
}

function getHqUploadPreview(e) {
  const session = resolvePlayerSession(e.parameter.token || '');
  if (!session.ok) return session.response;

  const player = session.player;
  if (player.role !== 'PIONEER') {
    return gameplayActionDenied(player, 'ROLE_DENIED', 'HQ Upload ist nur für PIONEER verfügbar.');
  }

  const bayUid = normalizeUid(e.parameter.uid || '');
  if (!bayUid) throw new Error('Upload Bay NFC UID fehlt.');

  const hit = lookupUidGlobally(bayUid);
  if (!hit.found || hit.type !== 'UPLOAD_TERMINAL' ||
      hit.terminalType !== 'UPLOAD_HQ' || hit.status !== 'ACTIVE') {
    return gameplayActionDenied(player, 'UPLOAD_BAY_INVALID', 'Keine aktive HQ Upload Bay erkannt.');
  }

  const sheet = getRegisterSheet();
  const rows = sheet.getRange(2, 1, 200, CORE_COL.UPDATED_AT).getValues();
  const cores = [];

  rows.forEach((row, index) => {
    const ownerType = String(row[CORE_COL.OWNER_TYPE - 1] || '').trim().toUpperCase();
    const ownerId = String(row[CORE_COL.OWNER_ID - 1] || '').trim().toUpperCase();
    if (ownerType !== 'PIONEER' || ownerId !== player.identity) return;

    const coreId = String(row[CORE_COL.ID - 1] || '').trim().toUpperCase();
    const status = String(row[CORE_COL.STATUS - 1] || '').trim().toUpperCase();
    const visible = row[CORE_COL.VISIBLE_ENERGY - 1] === '' ? '' : Number(row[CORE_COL.VISIBLE_ENERGY - 1]);
    const actual = row[CORE_COL.ACTUAL_ENERGY - 1] === '' ? visible : Number(row[CORE_COL.ACTUAL_ENERGY - 1]);

    if (!coreId || status === 'IN_TRANSIT') return;
    cores.push({ coreId: coreId, energy: actual, status: status });
  });

  return {
    ok: true, authenticated: true, session: true, action: true,
    status: cores.length ? 'HQ_UPLOAD_READY' : 'HQ_UPLOAD_EMPTY',
    bay: { id: hit.id, type: 'UPLOAD_HQ', status: hit.status },
    pioneer: { identity: player.identity, coreCapacity: player.coreCapacity },
    cores: cores.slice(0, 3),
    selectable: cores.length > 0,
    message: cores.length ? 'HQ Upload Bay verbunden. N-Cores können ausgewählt werden.' : 'Keine persönlichen N-Cores für Upload verfügbar.'
  };
}

/*
 * GAMEPLAY ACTION V0.1 // FOP CORE DEPOSIT
 * First complete session-authorized gameplay mutation.
 * The browser supplies only the active session token + physically scanned Core UID.
 * Identity, ownership and allowed transition are revalidated under ScriptLock.
 */
function depositOwnedCoreToReserve(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const session = resolvePlayerSession(e.parameter.token || '');
    if (!session.ok) return session.response;

    const uid = normalizeUid(e.parameter.uid || '');
    if (!uid) throw new Error('N-Core NFC UID fehlt.');

    const player = session.player;
    if (player.role !== 'FOP') {
      return gameplayActionDenied(player, 'ROLE_DENIED', 'Nur FIELD OPERATOR kann einen gesicherten N-Core in die NODIV Reserve zurückführen.');
    }

    const hit = lookupUidGlobally(uid);
    if (!hit.found || hit.type !== 'N_CORE' || !hit.id) {
      return gameplayActionDenied(player, 'CORE_NOT_FOUND', 'Gescannter NFC Tag ist kein registrierter N-Core.');
    }

    const coreId = String(hit.id).trim().toUpperCase();
    const state = readCoreState(coreId);

    if (state.uid !== uid) throw new Error('N-Core UID stimmt nicht mit dem Register überein.');

    if (state.ownerType !== 'FOP' || state.ownerId !== player.identity) {
      return gameplayActionDenied(player, 'OWNERSHIP_MISMATCH', coreId + ' gehört nicht dem aktiven FIELD OPERATOR. Keine Umbuchung.');
    }

    const result = transferCoreOwnership({
      coreId: coreId,
      expectedFromType: 'FOP',
      expectedFromId: player.identity,
      toType: 'NODIV_RESERVE',
      toId: 'HQ',
      eventType: 'CORE_DEPOSIT',
      actorId: player.identity,
      actorRole: 'FOP',
      newStatus: 'RESERVE',
      details: 'FOP deposit // ' + player.identity + ' -> NODIV_RESERVE // HQ // session authorized'
    });

    return {
      ok: true,
      authenticated: true,
      session: true,
      action: true,
      status: 'CORE_DEPOSITED',
      message: coreId + ' wurde in die NODIV Reserve zurückgeführt.',
      transactionId: result.transactionId,
      core: result.core,
      ownership: result.to
    };
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

/*
 * ============================================================
 * CORE DEPLOYMENT / MISSION CARGO V0.1
 * ============================================================
 * Deployment is deliberately separate from Core ownership.
 * A transport Core stays NODIV_RESERVE // HQ while a player is
 * its purpose-bound Carrier/Custodian.
 */
function getDeploymentRegisterSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEPLOYMENT_SHEET_NAME);
  if (!sheet) throw new Error('Tabellenblatt "' + DEPLOYMENT_SHEET_NAME + '" wurde nicht gefunden.');
  return sheet;
}

function normalizeNodeId(value) {
  const nodeId = String(value || '').trim().toUpperCase();
  if (!/^NODE-\d{3}$/.test(nodeId)) throw new Error('Ungültiges Node ID Format.');
  return nodeId;
}

function findDeploymentById(deploymentId) {
  const wanted = String(deploymentId || '').trim().toUpperCase();
  if (!wanted) return null;
  const sheet = getDeploymentRegisterSheet();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() === wanted) {
      return {
        row: i + 2, deploymentId: wanted,
        coreId: String(rows[i][1] || '').trim().toUpperCase(),
        carrierId: String(rows[i][2] || '').trim().toUpperCase(),
        carrierRole: String(rows[i][3] || '').trim().toUpperCase(),
        targetNode: String(rows[i][4] || '').trim().toUpperCase(),
        purpose: String(rows[i][5] || '').trim().toUpperCase(),
        status: String(rows[i][6] || '').trim().toUpperCase(),
        createdAt: rows[i][7] || null, acceptedAt: rows[i][8] || null,
        deliveredAt: rows[i][9] || null, transactionId: String(rows[i][10] || '').trim()
      };
    }
  }
  return null;
}

function hasOpenDeploymentForCore(coreId, installationId) {
  const sheet=getDeploymentRegisterSheet(),wanted=normalizeCoreId(coreId);
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,11).getValues():[];
  const orders=readInstallationOrders().filter(installationOrderIsLive);
  return rows.some(row=>String(row[1]||'').trim().toUpperCase()===wanted&&
    ['ASSIGNED','IN_TRANSIT'].includes(String(row[6]||'').trim().toUpperCase())&&
    (String(row[5]||'').toUpperCase()!=='NODE_INSTALLATION'||
      (installationReservationIsLive(row,orders)&&String(row[0])!==installationDeploymentId(installationId,wanted))));
}

function createDeploymentId() {
  return 'DEP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
    '-' + Utilities.getUuid().substring(0, 6).toUpperCase();
}

function assignCoreDeployment(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const session = resolvePlayerSession(e.parameter.token || '');
    if (!session.ok) return session.response;
    const actor = session.player;
    if (!['FOUNDER','FOP'].includes(actor.role)) {
      return gameplayActionDenied(actor, 'ROLE_DENIED', 'Keine Berechtigung zur Ausgabe von Mission Cargo.');
    }

    const uid = normalizeUid(e.parameter.uid || '');
    const carrierId = String(e.parameter.carrier || '').trim().toUpperCase();
    const targetNode = normalizeNodeId(e.parameter.targetNode || '');
    if (!uid) throw new Error('N-Core NFC UID fehlt.');
    if (!carrierId) throw new Error('Carrier ID fehlt.');

    const carrier = findIdentityById(carrierId);
    if (!carrier || carrier.status !== 'ACTIVE' || !['PIONEER','FOP'].includes(carrier.role)) {
      return gameplayActionDenied(actor, 'INVALID_CARRIER', 'Carrier ist keine aktive PIONEER/FIELD OPERATOR Identität.');
    }

    const hit = lookupUidGlobally(uid);
    if (!hit.found || hit.type !== 'N_CORE' || !hit.id) {
      return gameplayActionDenied(actor, 'CORE_NOT_FOUND', 'Gescannter NFC Tag ist kein registrierter N-Core.');
    }
    const core = readCoreState(hit.id);
    if (core.uid !== uid || core.ownerType !== 'NODIV_RESERVE' || core.ownerId !== 'HQ' || core.status !== 'RESERVE') {
      return gameplayActionDenied(actor, 'CORE_NOT_RESERVE', 'N-Core ist nicht frei in der NODIV Reserve verfügbar.');
    }
    if (hasOpenDeploymentForCore(core.coreId)) {
      return gameplayActionDenied(actor, 'CORE_ALREADY_ASSIGNED', 'Für diesen N-Core existiert bereits ein offener Deployment-Auftrag.');
    }
    if (getNodeGameplayStatus(targetNode) === 'UNDEFINED') {
      return gameplayActionDenied(actor, 'TARGET_NODE_UNKNOWN', 'Ziel-Node ist nicht registriert.');
    }

    const deploymentId = createDeploymentId();
    getDeploymentRegisterSheet().appendRow([
      deploymentId, core.coreId, carrier.identity, carrier.role, targetNode,
      'DEPLOYMENT', 'ASSIGNED', new Date(), '', '', ''
    ]);
    SpreadsheetApp.flush();

    return {
      ok:true, authenticated:true, session:true, action:true, status:'DEPLOYMENT_ASSIGNED',
      deployment:{deploymentId:deploymentId,carrierId:carrier.identity,carrierRole:carrier.role,targetNode:targetNode,purpose:'DEPLOYMENT',status:'ASSIGNED'},
      core:{energy:core.actualEnergy === '' ? core.visibleEnergy : core.actualEnergy, status:core.status}
    };
  } finally { try { lock.releaseLock(); } catch (error) {} }
}

function getPendingPlayerDeployments(e) {
  const session = resolvePlayerSession(e.parameter.token || '');
  if (!session.ok) return session.response;
  const player = session.player;
  const sheet = getDeploymentRegisterSheet();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const deployments = [];

  rows.forEach(row => {
    const carrierId = String(row[2] || '').trim().toUpperCase();
    const carrierRole = String(row[3] || '').trim().toUpperCase();
    const status = String(row[6] || '').trim().toUpperCase();
    if (String(row[5]||'').toUpperCase()==='NODE_INSTALLATION') return;
    if (carrierId !== player.identity || carrierRole !== player.role || !['ASSIGNED','IN_TRANSIT'].includes(status)) return;
    const core = readCoreState(String(row[1] || '').trim().toUpperCase());
    deployments.push({
      deploymentId:String(row[0] || '').trim().toUpperCase(),
      targetNode:String(row[4] || '').trim().toUpperCase(),
      purpose:String(row[5] || '').trim().toUpperCase(),
      status:status,
      energy:core.actualEnergy === '' ? core.visibleEnergy : core.actualEnergy
    });
  });

  return {
    ok:true, authenticated:true, session:true,
    status:deployments.length ? 'DEPLOYMENTS_AVAILABLE' : 'NO_DEPLOYMENTS',
    deployments:deployments
  };
}

function acceptCoreDeployment(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const session = resolvePlayerSession(e.parameter.token || '');
    if (!session.ok) return session.response;
    const player = session.player;
    const deployment = findDeploymentById(e.parameter.deployment || '');
    if (!deployment) return gameplayActionDenied(player, 'DEPLOYMENT_NOT_FOUND', 'Deployment-Auftrag wurde nicht gefunden.');
    if (deployment.purpose === 'NODE_INSTALLATION') return gameplayActionDenied(player,'INSTALL_WORKFLOW_REQUIRED','Installations-Cores müssen über FIELD INSTALLATION bestätigt werden.');
    if (deployment.status !== 'ASSIGNED') return gameplayActionDenied(player, 'DEPLOYMENT_NOT_ASSIGNABLE', 'Deployment-Auftrag kann nicht übernommen werden.');
    if (deployment.carrierId !== player.identity || deployment.carrierRole !== player.role) {
      return gameplayActionDenied(player, 'CARRIER_MISMATCH', 'Dieser Deployment-Auftrag ist einer anderen Identität zugewiesen.');
    }

    const core = readCoreState(deployment.coreId);
    if (core.ownerType !== 'NODIV_RESERVE' || core.ownerId !== 'HQ' || core.status !== 'RESERVE') {
      return gameplayActionDenied(player, 'CORE_NOT_RESERVE', 'Mission Cargo ist nicht mehr in der NODIV Reserve verfügbar.');
    }

    const transactionId = appendTransactionLog({
      eventType:'DEPLOYMENT_ACCEPTED', actorId:player.identity, actorRole:player.role,
      coreId:core.coreId, fromType:'NODIV_RESERVE', fromId:'HQ',
      toType:'NODIV_RESERVE', toId:'HQ', visibleEnergy:core.visibleEnergy,
      hiddenEnergy:core.hiddenEnergy, actualEnergy:core.actualEnergy,
      nodeId:deployment.targetNode, result:'SUCCESS',
      details:'MISSION CARGO // carrier ' + player.identity + ' // target ' + deployment.targetNode
    });

    getDeploymentRegisterSheet().getRange(deployment.row, 7, 1, 5).setValues([[
      'IN_TRANSIT', deployment.createdAt || new Date(), new Date(), '', transactionId
    ]]);
    getRegisterSheet().getRange(core.row, CORE_COL.STATUS).setValue('IN_TRANSIT');
    SpreadsheetApp.flush();

    return {
      ok:true, authenticated:true, session:true, action:true, status:'MISSION_CARGO_IN_TRANSIT',
      transactionId:transactionId,
      deployment:{deploymentId:deployment.deploymentId,targetNode:deployment.targetNode,purpose:'DEPLOYMENT',status:'IN_TRANSIT'},
      cargo:{energy:core.actualEnergy === '' ? core.visibleEnergy : core.actualEnergy},
      ownership:{type:'NODIV_RESERVE',id:'HQ'},
      carrier:{identity:player.identity,role:player.role}
    };
  } finally { try { lock.releaseLock(); } catch (error) {} }
}

function findActiveDeploymentForCarrier(identity, role) {
  const wantedId=String(identity||'').trim().toUpperCase();
  const wantedRole=String(role||'').trim().toUpperCase();
  const sheet=getDeploymentRegisterSheet(), lastRow=Math.max(sheet.getLastRow(),2);
  const rows=sheet.getRange(2,1,lastRow-1,11).getValues();
  for(let i=0;i<rows.length;i++){
    if(String(rows[i][2]||'').trim().toUpperCase()===wantedId &&
       String(rows[i][3]||'').trim().toUpperCase()===wantedRole &&
       String(rows[i][6]||'').trim().toUpperCase()==='IN_TRANSIT'){
      return {
        row:i+2,deploymentId:String(rows[i][0]||'').trim().toUpperCase(),
        coreId:String(rows[i][1]||'').trim().toUpperCase(),
        carrierId:wantedId,carrierRole:wantedRole,
        targetNode:String(rows[i][4]||'').trim().toUpperCase(),
        purpose:String(rows[i][5]||'').trim().toUpperCase(),
        status:'IN_TRANSIT',createdAt:rows[i][7]||null,acceptedAt:rows[i][8]||null
      };
    }
  }
  return null;
}

function getDeploymentCoreEnergy(coreId) {
  const core=readCoreState(coreId);
  return core.actualEnergy===''?core.visibleEnergy:core.actualEnergy;
}

function deliverCoreDeployment(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const player=session.player;
    const uid=normalizeUid(e.parameter.uid||'');
    if(!uid)throw new Error('Node NFC UID fehlt.');

    const hit=lookupUidGlobally(uid);
    if(!hit.found||hit.type!=='NODE'||!hit.id)
      return gameplayActionDenied(player,'NODE_NOT_FOUND','Gescannter NFC Tag ist kein registrierter Node.');

    const nodeId=String(hit.id).trim().toUpperCase();
    const deployment=findActiveDeploymentForCarrier(player.identity,player.role);
    if(!deployment)
      return gameplayActionDenied(player,'NO_MISSION_CARGO','Kein aktives Mission Cargo für diese Identität.');

    if(deployment.targetNode!==nodeId)
      return gameplayActionDenied(player,'MISSION_CARGO_WRONG_NODE','Mission Cargo ist an '+deployment.targetNode+' gebunden.');

    const core=readCoreState(deployment.coreId);
    if(core.ownerType!=='NODIV_RESERVE'||core.ownerId!=='HQ'||core.status!=='IN_TRANSIT')
      return gameplayActionDenied(player,'CARGO_STATE_MISMATCH','Mission Cargo befindet sich nicht mehr im erwarteten Transportzustand.');

    const result=transferCoreOwnership({
      coreId:core.coreId,
      expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',
      toType:'NODE',toId:nodeId,
      eventType:'DEPLOYMENT_DELIVERED',
      actorId:player.identity,actorRole:player.role,
      nodeId:nodeId,newStatus:'DEPLOYED',
      details:'MISSION CARGO delivered // carrier '+player.identity+' // target '+nodeId
    });

    const depSheet=getDeploymentRegisterSheet();
    depSheet.getRange(deployment.row,7).setValue('DELIVERED');
    depSheet.getRange(deployment.row,10).setValue(new Date());
    depSheet.getRange(deployment.row,11).setValue(result.transactionId);
    SpreadsheetApp.flush();

    return {
      ok:true,authenticated:true,session:true,action:true,status:'MISSION_CARGO_DELIVERED',
      message:'Mission Cargo wurde am Ziel-Node eingesetzt.',
      transactionId:result.transactionId,
      deployment:{deploymentId:deployment.deploymentId,targetNode:nodeId,status:'DELIVERED'},
      cargo:{energy:result.core.actualEnergy===''?result.core.visibleEnergy:result.core.actualEnergy,status:result.core.status},
      ownership:result.to
    };
  }finally{try{lock.releaseLock()}catch(error){}}
}

function getHqLiveOperations(e) {
  /*
   * HQ V0.4 // LIVE OPERATIONS
   * Read-only operational snapshot for the VR command room.
   * No player/session data is exposed here beyond operational carrier IDs
   * already required to display active Mission Cargo.
   */
  const nodeSheet = getNodeRegisterSheet();
  const nodeRows = nodeSheet.getRange(2, 1, 15, 3).getValues();
  const nodes = nodeRows
    .map(row => ({
      id: String(row[0] || '').trim().toUpperCase(),
      registered: Boolean(normalizeUid(row[1] || '')),
      status: String(row[2] || '').trim().toUpperCase() || 'UNDEFINED'
    }))
    .filter(node => node.id);

  const deploymentSheet = getDeploymentRegisterSheet();
  const lastRow = Math.max(deploymentSheet.getLastRow(), 2);
  const deploymentRows = deploymentSheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const deployments = [];

  deploymentRows.forEach(row => {
    const status = String(row[6] || '').trim().toUpperCase();
    if (String(row[5]||'').toUpperCase()==='NODE_INSTALLATION') return;
    if (!['ASSIGNED', 'IN_TRANSIT'].includes(status)) return;

    const coreId = String(row[1] || '').trim().toUpperCase();
    let energy = '';
    try { energy = getDeploymentCoreEnergy(coreId); } catch (error) {}

    deployments.push({
      deploymentId: String(row[0] || '').trim().toUpperCase(),
      carrierId: String(row[2] || '').trim().toUpperCase(),
      carrierRole: String(row[3] || '').trim().toUpperCase(),
      targetNode: String(row[4] || '').trim().toUpperCase(),
      purpose: String(row[5] || '').trim().toUpperCase(),
      status: status,
      energy: energy
    });
  });

  return {
    ok: true,
    system: 'NODIV HQ',
    mode: 'LIVE_OPERATIONS',
    generatedAt: new Date().toISOString(),
    network: {
      totalNodes: nodes.length,
      registeredNodes: nodes.filter(node => node.registered).length,
      status: nodes.some(node => node.status === 'CRITICAL') ? 'CRITICAL' : 'NOMINAL'
    },
    nodes: nodes,
    deployments: deployments,
    readOnly: true
  };
}


function gameplayActionDenied(player, status, message) {
  return {
    ok: true,
    authenticated: true,
    session: true,
    action: false,
    status: status,
    message: message,
    player: { identity: player.identity, role: player.role }
  };
}

function gameplayDecision(player,object,action,allowed,reason,message,extra) {
  const response={ok:true,authenticated:true,session:true,route:true,player:{identity:player.identity,role:player.role,status:getSessionPlayerDisplay(player).status},object:object,decision:{action:action,allowed:Boolean(allowed),reason:reason,message:message},readOnly:true};
  if(extra&&typeof extra==='object')Object.keys(extra).forEach(key=>{response[key]=extra[key];});
  return response;
}

function getNodeGameplayStatus(nodeId) {
  const wanted=String(nodeId||'').trim().toUpperCase(), sheet=getNodeRegisterSheet(), rows=sheet.getRange(2,1,15,3).getValues();
  for(let i=0;i<rows.length;i++){
    const registeredId=String(rows[i][0]||'').trim().toUpperCase();
    const canonicalId=/^NODE-\d{3}$/.test(registeredId)?registeredId:formatNodeId(i+1);
    if(canonicalId===wanted)return String(rows[i][2]||'').trim().toUpperCase()||'UNDEFINED';
  }
  return 'UNDEFINED';
}


/*
 * ============================================================
 * EVENT CONTROL / MECHANICAL NODE CODES V0.1
 * ============================================================
 * Lifecycle: STANDBY -> INITIALIZED -> FIELD_ACTIVE.
 * Codes are generated once at initialization and never logged.
 * Five globally unique four-digit codes are reserved per event Node.
 */
function getEventRegisterSheet() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName(EVENT_SHEET_NAME);
  if(!sheet){
    sheet=ss.insertSheet(EVENT_SHEET_NAME);
    sheet.getRange(1,1,1,10).setValues([['EVENT ID','STATE','CREATED AT','INITIALIZED AT','ACTIVATED AT','FOUNDER','PLANNED NODES','ACTIVE NODES','READINESS','UPDATED AT']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getEventNodeCodeSheet() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName(EVENT_NODE_CODE_SHEET_NAME);
  if(!sheet){
    sheet=ss.insertSheet(EVENT_NODE_CODE_SHEET_NAME);
    sheet.getRange(1,1,1,13).setValues([['EVENT ID','NODE ID','PRIMARY','RESERVE 1','RESERVE 2','RESERVE 3','RESERVE 4','ACTIVE SLOT','PENDING SLOT','CHANGE STATUS','ASSIGNED FOP','INSTALLED AT','UPDATED AT']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readCurrentEvent() {
  const sheet=getEventRegisterSheet();
  if(sheet.getLastRow()<2)return null;
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues();
  for(let i=rows.length-1;i>=0;i--){
    const state=String(rows[i][1]||'').trim().toUpperCase();
    if(['STANDBY','INITIALIZED','FIELD_ACTIVE'].includes(state)){
      return {row:i+2,eventId:String(rows[i][0]||''),state:state,createdAt:rows[i][2],initializedAt:rows[i][3],activatedAt:rows[i][4],founder:String(rows[i][5]||''),plannedNodes:Number(rows[i][6]||0),activeNodes:Number(rows[i][7]||0),readiness:String(rows[i][8]||'')};
    }
  }
  return null;
}

function listProvisionedNodeIds() {
  const sheet=getNodeRegisterSheet();
  const rows=sheet.getRange(2,1,15,3).getValues(), ids=[];
  rows.forEach((r,index)=>{
    const uid=normalizeUid(r[1]||'');
    if(!uid)return;
    let id=String(r[0]||'').trim().toUpperCase();
    /*
     * provisionNodeFromSession() assigns the physical slot by row.
     * Older Node Register sheets may not have NODE-001..015 prefilled
     * in column A, so derive the canonical ID from the fixed row slot.
     */
    if(!/^NODE-\d{3}$/.test(id))id=formatNodeId(index+1);
    ids.push(id);
  });
  return ids;
}

function generateMechanicalCode(used) {
  for(let tries=0;tries<200;tries++){
    const hex=Utilities.getUuid().replace(/-/g,'').slice(0,8);
    const value=parseInt(hex,16)%10000;
    const code=String(value).padStart(4,'0');
    if(!used[code]){used[code]=true;return code;}
  }
  throw new Error('Eindeutiger Node-Code konnte nicht erzeugt werden.');
}

function getEventStatus(e) {
  const session=resolvePlayerSession(e.parameter.token||'');
  if(!session.ok)return session.response;
  if(session.player.role!=='FOUNDER')return gameplayActionDenied(session.player,'ROLE_DENIED','Nur FOUNDER kann den Eventstatus abrufen.');
  const event=readCurrentEvent();
  return {ok:true,authenticated:true,event:event||{state:'STANDBY',eventId:'',plannedNodes:0,activeNodes:0},provisionedNodes:listProvisionedNodeIds()};
}


function getEventPreflightSheet() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName(EVENT_PREFLIGHT_SHEET_NAME);
  if(!sheet){
    sheet=ss.insertSheet(EVENT_PREFLIGHT_SHEET_NAME);
    sheet.appendRow(['CHECK ID','CONFIRMED','CONFIRMED BY','CONFIRMED AT','UPDATED AT','CONFIG FINGERPRINT']);
  }
  if(!sheet.getRange(1,6).getDisplayValue())sheet.getRange(1,6).setValue('CONFIG FINGERPRINT');
  return sheet;
}

function getEventConfigurationFingerprint() {
  const nodes=listProvisionedNodeIds().slice().sort();

  const coreSheet=getRegisterSheet();
  const coreRows=coreSheet.getRange(2,1,200,Math.max(CORE_COL.UPDATED_AT,CORE_COL.OWNER_ID)).getValues();
  const cores=coreRows.map(row=>({
    uid:normalizeUid(row[CORE_COL.UID-1]),
    id:String(row[CORE_COL.ID-1]||'').trim().toUpperCase(),
    energy:Number(row[CORE_COL.VISIBLE_ENERGY-1]||0),
    status:String(row[CORE_COL.STATUS-1]||'').trim().toUpperCase(),
    ownerType:String(row[CORE_COL.OWNER_TYPE-1]||'').trim().toUpperCase(),
    ownerId:String(row[CORE_COL.OWNER_ID-1]||'').trim().toUpperCase()
  })).filter(x=>x.uid).sort((a,b)=>a.id.localeCompare(b.id)||a.uid.localeCompare(b.uid));

  const accessSheet=getAccessCardRegisterSheet();
  const accessLast=Math.max(accessSheet.getLastRow(),1);
  const identities=(accessLast>1?accessSheet.getRange(2,1,accessLast-1,12).getValues():[]).map(row=>({
    identity:String(row[1]||'').trim().toUpperCase(),
    role:String(row[2]||'').trim().toUpperCase(),
    uid:normalizeUid(row[3]),
    status:String(row[4]||'').trim().toUpperCase()
  })).filter(x=>x.uid&&x.status==='ACTIVE').sort((a,b)=>a.identity.localeCompare(b.identity)||a.uid.localeCompare(b.uid));

  const uploadSheet=findUploadTerminalSheet();
  const uploads=[];
  if(uploadSheet&&uploadSheet.getLastRow()>1){
    uploadSheet.getRange(2,1,uploadSheet.getLastRow()-1,6).getValues().forEach(row=>{
      const uid=normalizeUid(row[2]);
      const status=String(row[3]||'').trim().toUpperCase();
      if(uid&&status==='ACTIVE')uploads.push({type:String(row[1]||'').trim().toUpperCase(),uid:uid,status:status});
    });
  }
  uploads.sort((a,b)=>a.type.localeCompare(b.type)||a.uid.localeCompare(b.uid));

  const payload=JSON.stringify({nodes:nodes,cores:cores,identities:identities,uploads:uploads});
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,payload,Utilities.Charset.UTF_8);
  return digest.map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join('');
}

function readEventPreflight() {
  const ids=['PHYSICAL_EQUIPMENT','EVENT_CONFIGURATION','FINAL_FOUNDER_CONFIRMATION'];
  const state={};
  ids.forEach(id=>state[id]={id:id,confirmed:false,confirmedBy:'',confirmedAt:'',configFingerprint:''});
  const sheet=getEventPreflightSheet();
  if(sheet.getLastRow()>1){
    sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues().forEach(row=>{
      const id=String(row[0]||'').trim().toUpperCase();
      if(!state[id])return;
      state[id]={id:id,confirmed:String(row[1]||'').toUpperCase()==='TRUE'||row[1]===true,confirmedBy:String(row[2]||''),confirmedAt:row[3]||'',configFingerprint:String(row[5]||'')};
    });
  }
  return ids.map(id=>state[id]);
}

function confirmEventPreflight(e) {
  const session=resolvePlayerSession(e.parameter.token||'');
  if(!session.ok)return session.response;
  const actor=session.player;
  if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann Pre-Flight Prüfungen bestätigen.');

  const checkId=String(e.parameter.check||'').trim().toUpperCase();
  const allowed=['PHYSICAL_EQUIPMENT','EVENT_CONFIGURATION','FINAL_FOUNDER_CONFIRMATION'];
  if(!allowed.includes(checkId))return gameplayActionDenied(actor,'INVALID_PREFLIGHT_CHECK','Unbekannte Pre-Flight Prüfung.');

  const readiness=getEventReadiness(e);
  if(!readiness.systemReady)return gameplayActionDenied(actor,'BASELINE_NOT_READY','System-Baseline muss zuerst vollständig bereit sein.');

  const current=readiness.preflight||[];
  const physical=current.find(x=>x.id==='PHYSICAL_EQUIPMENT');
  const config=current.find(x=>x.id==='EVENT_CONFIGURATION');
  if(checkId==='EVENT_CONFIGURATION'&&(!physical||!physical.confirmed))
    return gameplayActionDenied(actor,'PREFLIGHT_ORDER','PHYSICAL EQUIPMENT muss zuerst bestätigt werden.');
  if(checkId==='FINAL_FOUNDER_CONFIRMATION'&&(!physical||!physical.confirmed||!config||!config.confirmed))
    return gameplayActionDenied(actor,'PREFLIGHT_ORDER','Physical Equipment und Event Configuration müssen zuerst bestätigt werden.');

  const sheet=getEventPreflightSheet(),now=new Date();
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().flat():[];
  const idx=rows.findIndex(v=>String(v).trim().toUpperCase()===checkId);
  const fingerprint=checkId==='EVENT_CONFIGURATION'?getEventConfigurationFingerprint():'';
  if(idx>=0)sheet.getRange(idx+2,1,1,6).setValues([[checkId,true,actor.identity,now,now,fingerprint]]);
  else sheet.appendRow([checkId,true,actor.identity,now,now,fingerprint]);

  if(checkId==='EVENT_CONFIGURATION'){
    const finalIdx=rows.findIndex(v=>String(v).trim().toUpperCase()==='FINAL_FOUNDER_CONFIRMATION');
    if(finalIdx>=0)sheet.getRange(finalIdx+2,2,1,5).setValues([[false,'','',now,'']]);
  }

  appendTransactionLog({eventType:'EVENT_PREFLIGHT_CONFIRMED',actorId:actor.identity,actorRole:actor.role,result:'SUCCESS',details:checkId});
  SpreadsheetApp.flush();
  return {ok:true,authenticated:true,action:true,status:'PREFLIGHT_CONFIRMED',check:checkId,preflight:readEventPreflight()};
}

function getEventReadiness(e) {
  const session=resolvePlayerSession(e.parameter.token||'');
  if(!session.ok)return session.response;
  const actor=session.player;
  if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann Event Readiness prüfen.');

  const nodes=listProvisionedNodeIds();

  const coreSheet=getRegisterSheet();
  const coreRows=coreSheet.getRange(2,1,200,Math.max(CORE_COL.UPDATED_AT,CORE_COL.OWNER_ID)).getValues();
  let registeredCores=0, reserveCores=0, invalidOwnership=0, assignedCores=0;
  const coreDiagnostics=[];

  coreRows.forEach(row=>{
    const uid=normalizeUid(row[CORE_COL.UID-1]);
    if(!uid)return;
    registeredCores++;
    const coreId=String(row[CORE_COL.ID-1]||'').trim().toUpperCase();
    const visibleEnergy=Number(row[CORE_COL.VISIBLE_ENERGY-1]||0);
    const status=String(row[CORE_COL.STATUS-1]||'').trim().toUpperCase();
    const ownerType=String(row[CORE_COL.OWNER_TYPE-1]||'').trim().toUpperCase();
    const ownerId=String(row[CORE_COL.OWNER_ID-1]||'').trim().toUpperCase();
    const ownershipValid=Boolean(ownerType&&ownerId);

    if(ownerType==='NODIV_RESERVE'&&ownerId==='HQ')reserveCores++;
    else if(ownershipValid)assignedCores++;
    else invalidOwnership++;

    coreDiagnostics.push({
      id:coreId,
      energy:visibleEnergy,
      status:status||'UNDEFINED',
      ownerType:ownerType||'',
      ownerId:ownerId||'',
      ok:ownershipValid,
      detail:ownershipValid
        ? (ownerType==='NODIV_RESERVE'&&ownerId==='HQ'?'HQ RESERVE':ownerType+' // '+ownerId)
        : 'OWNERSHIP FEHLT'
    });
  });

  const accessSheet=getAccessCardRegisterSheet();
  const accessLast=Math.max(accessSheet.getLastRow(),1);
  const accessRows=accessLast>1?accessSheet.getRange(2,1,accessLast-1,12).getValues():[];
  const activeRoles={FOUNDER:0,FOP:0,PIONEER:0,LOCAL:0,UNBOUND:0};
  accessRows.forEach(row=>{
    const role=String(row[2]||'').trim().toUpperCase();
    const status=String(row[4]||'').trim().toUpperCase();
    const uid=normalizeUid(row[3]);
    if(uid&&status==='ACTIVE'&&Object.prototype.hasOwnProperty.call(activeRoles,role))activeRoles[role]++;
  });
  const activePlayers=activeRoles.PIONEER+activeRoles.LOCAL+activeRoles.UNBOUND;

  const uploadSheet=findUploadTerminalSheet();
  let activeHqUploads=0,activeFopUploads=0;
  if(uploadSheet&&uploadSheet.getLastRow()>1){
    uploadSheet.getRange(2,1,uploadSheet.getLastRow()-1,6).getValues().forEach(row=>{
      const type=String(row[1]||'').trim().toUpperCase();
      const uid=normalizeUid(row[2]);
      const status=String(row[3]||'').trim().toUpperCase();
      if(!uid||status!=='ACTIVE')return;
      if(type==='UPLOAD_HQ')activeHqUploads++;
      if(type==='UPLOAD_FOP')activeFopUploads++;
    });
  }

  const codeCapacityRequired=nodes.length*5;
  const accessSecurityOk=nodes.length>0&&codeCapacityRequired<=10000;

  const checks=[
    {id:'NODES',ok:nodes.length>0,value:nodes.length,detail:nodes.length+' provisioniert'},
    {id:'N_CORES',ok:registeredCores>0&&invalidOwnership===0,value:registeredCores,detail:registeredCores+' registriert // '+reserveCores+' HQ Reserve // '+assignedCores+' zugewiesen'},
    {id:'OWNERSHIP',ok:invalidOwnership===0,value:invalidOwnership,detail:invalidOwnership?(invalidOwnership+' Core(s) ohne Ownership'):'sauber'},
    {id:'PLAYERS',ok:activePlayers>0,value:activePlayers,detail:activePlayers+' aktive Feld-Identität(en) // '+activeRoles.PIONEER+' Pioneer // '+activeRoles.LOCAL+' Local // '+activeRoles.UNBOUND+' Unbound'},
    {id:'FOP',ok:activeRoles.FOP>0,value:activeRoles.FOP,detail:activeRoles.FOP?activeRoles.FOP+' Field Operator aktiv':'keine aktive FOP Access Card'},
    {id:'UPLOAD_SYSTEM',ok:activeHqUploads>0,value:activeHqUploads,detail:activeHqUploads?activeHqUploads+' HQ Upload Bay(s) aktiv':'keine aktive HQ Upload Bay'},
    {id:'ACCESS_SECURITY',ok:accessSecurityOk,value:codeCapacityRequired,detail:accessSecurityOk?(codeCapacityRequired+' frische mechanische Codes für '+nodes.length+' Node(s) reservierbar'):'Code-Set kann nicht sicher vorbereitet werden'}
  ];
  const blocking=checks.filter(x=>!x.ok);
  const systemReady=blocking.length===0;
  const preflight=readEventPreflight();
  const currentFingerprint=getEventConfigurationFingerprint();
  const configCheck=preflight.find(x=>x.id==='EVENT_CONFIGURATION');
  const finalCheck=preflight.find(x=>x.id==='FINAL_FOUNDER_CONFIRMATION');
  const configurationChanged=Boolean(configCheck&&configCheck.confirmed&&configCheck.configFingerprint!==currentFingerprint);
  if(configurationChanged){
    configCheck.confirmed=false;
    configCheck.invalidated=true;
    if(finalCheck){finalCheck.confirmed=false;finalCheck.invalidated=true;}
  }
  const preflightReady=preflight.every(x=>x.confirmed);
  const eventReady=systemReady&&preflightReady;
  return {
    ok:true,
    authenticated:true,
    status:!systemReady?'NOT_READY':(eventReady?'EVENT_READY':'SYSTEM_BASELINE_READY'),
    ready:eventReady,
    systemReady:systemReady,
    preflightReady:preflightReady,
    preflight:preflight,
    checks:checks,
    provisionedNodes:nodes,
    coreSummary:{registered:registeredCores,hqReserve:reserveCores,assigned:assignedCores,invalidOwnership:invalidOwnership},
    identitySummary:activeRoles,
    uploadSummary:{hq:activeHqUploads,fop:activeFopUploads},
    coreDiagnostics:coreDiagnostics,
    manualChecksPending:preflight.filter(x=>!x.confirmed).map(x=>x.id)
  };
}

function repairMissingCoreOwnership(e) {
  const lock=LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const actor=session.player;
    if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann fehlende Core-Ownership reparieren.');

    const sheet=getRegisterSheet();
    const rows=sheet.getRange(2,1,200,Math.max(CORE_COL.UPDATED_AT,CORE_COL.OWNER_ID)).getValues();
    const repaired=[];

    rows.forEach((row,index)=>{
      const uid=normalizeUid(row[CORE_COL.UID-1]);
      if(!uid)return;
      const ownerType=String(row[CORE_COL.OWNER_TYPE-1]||'').trim().toUpperCase();
      const ownerId=String(row[CORE_COL.OWNER_ID-1]||'').trim().toUpperCase();
      if(ownerType||ownerId)return;

      const coreId=String(row[CORE_COL.ID-1]||'').trim().toUpperCase();
      if(!/^NC-\d{3}$/.test(coreId))return;
      const state=readCoreState(coreId);
      const transactionId=appendTransactionLog({
        eventType:'CORE_OWNERSHIP_REPAIRED',
        actorId:actor.identity,
        actorRole:actor.role,
        coreId:coreId,
        fromType:'NONE',
        fromId:'',
        toType:'NODIV_RESERVE',
        toId:'HQ',
        visibleEnergy:state.visibleEnergy,
        hiddenEnergy:state.hiddenEnergy,
        actualEnergy:state.actualEnergy,
        result:'SUCCESS',
        details:'Founder readiness repair // missing legacy ownership initialized to HQ reserve'
      });
      writeCoreOwnership(index+2,'NODIV_RESERVE','HQ',transactionId);
      sheet.getRange(index+2,CORE_COL.STATUS).setValue('RESERVE');
      repaired.push({id:coreId,energy:state.visibleEnergy});
    });

    SpreadsheetApp.flush();
    return {
      ok:true,authenticated:true,action:true,
      status:repaired.length?'OWNERSHIP_REPAIRED':'NO_REPAIR_REQUIRED',
      repaired:repaired
    };
  } finally {
    try{lock.releaseLock();}catch(error){}
  }
}

function initializeEvent(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const actor=session.player;
    if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann ein Event initialisieren.');

    const readiness=getEventReadiness(e);
    if(!readiness.ok||readiness.authenticated!==true)return readiness;
    if(!readiness.ready)return gameplayActionDenied(actor,'EVENT_NOT_READY','Readiness Check blockiert die Event-Initialisierung.');

    const existing=readCurrentEvent();
    if(existing&&['INITIALIZED','FIELD_ACTIVE'].includes(existing.state))return gameplayActionDenied(actor,'EVENT_ALREADY_INITIALIZED','Es existiert bereits ein initialisiertes oder aktives Event.');

    const nodes=listProvisionedNodeIds();
    if(!nodes.length)return gameplayActionDenied(actor,'NO_PROVISIONED_NODES','Kein provisionierter Node vorhanden.');

    const requested=String(e.parameter.nodes||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    const selected=requested.length?requested:nodes.slice();
    const invalid=selected.filter(id=>!nodes.includes(id));
    if(invalid.length)throw new Error('Nicht provisionierte Nodes: '+invalid.join(', '));
    if(selected.length>15)throw new Error('Maximal 15 Nodes pro Event.');

    const eventId='EVT-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,4).toUpperCase();
    const used={}, codeSheet=getEventNodeCodeSheet(), now=new Date();
    selected.forEach(nodeId=>{
      const codes=[];for(let i=0;i<5;i++)codes.push(generateMechanicalCode(used));
      codeSheet.appendRow([eventId,nodeId,codes[0],codes[1],codes[2],codes[3],codes[4],'','PRIMARY','ASSIGNED_FOR_INSTALL','', '',now]);
    });

    const eventSheet=getEventRegisterSheet();
    eventSheet.appendRow([eventId,'INITIALIZED',now,now,'',actor.identity,selected.length,0,'INITIALIZED_BASELINE',now]);
    appendTransactionLog({eventType:'EVENT_INITIALIZED',actorId:actor.identity,actorRole:actor.role,result:'SUCCESS',details:eventId+' // '+selected.length+' Nodes // mechanical code sets generated'});
    SpreadsheetApp.flush();
    return {ok:true,authenticated:true,action:true,status:'EVENT_INITIALIZED',event:{eventId:eventId,state:'INITIALIZED',plannedNodes:selected.length,nodes:selected}};
  }finally{try{lock.releaseLock();}catch(error){}}
}

function activateEvent(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const actor=session.player;
    if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann Field Operations aktivieren.');
    const event=readCurrentEvent();
    if(!event||event.state!=='INITIALIZED')return gameplayActionDenied(actor,'EVENT_NOT_INITIALIZED','Event muss zuerst initialisiert werden.');

    const codes=getEventNodeCodeSheet(), rows=codes.getLastRow()>1?codes.getRange(2,1,codes.getLastRow()-1,13).getValues():[];
    const pending=rows.filter(r=>String(r[0])===event.eventId&&(String(r[9]||'').toUpperCase()!=='ACTIVE'||countCoresOwnedBy('NODE',String(r[1]||'').trim().toUpperCase())!==3));
    if(pending.length)return gameplayActionDenied(actor,'NODES_NOT_INSTALLED',pending.length+' Node(s) sind noch nicht physisch installiert/bestätigt.');

    const sheet=getEventRegisterSheet(), now=new Date();
    sheet.getRange(event.row,2).setValue('FIELD_ACTIVE');
    sheet.getRange(event.row,5).setValue(now);
    sheet.getRange(event.row,8).setValue(event.plannedNodes);
    sheet.getRange(event.row,10).setValue(now);
    appendTransactionLog({eventType:'EVENT_FIELD_ACTIVE',actorId:actor.identity,actorRole:actor.role,result:'SUCCESS',details:event.eventId+' // Field Operations activated'});
    SpreadsheetApp.flush();
    return {ok:true,authenticated:true,action:true,status:'FIELD_ACTIVE',eventId:event.eventId};
  }finally{try{lock.releaseLock();}catch(error){}}
}

function abortEvent(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const actor=session.player;
    if(actor.role!=='FOUNDER')return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann ein Event abbrechen.');

    const event=readCurrentEvent();
    if(!event)return {ok:true,authenticated:true,action:false,status:'NO_ACTIVE_EVENT'};
    if(event.state==='FIELD_ACTIVE')return gameplayActionDenied(actor,'FIELD_ACTIVE_ABORT_DENIED','Ein laufendes Field Event kann nicht über den sicheren Initialisierungs-Abbruch zurückgesetzt werden.');

    const eventSheet=getEventRegisterSheet(), now=new Date();
    eventSheet.getRange(event.row,2).setValue('ABORTED');
    eventSheet.getRange(event.row,10).setValue(now);

    const codeSheet=getEventNodeCodeSheet();
    if(codeSheet.getLastRow()>1){
      const rows=codeSheet.getRange(2,1,codeSheet.getLastRow()-1,13).getValues();
      rows.forEach((row,index)=>{
        if(String(row[0]||'')===event.eventId){
          codeSheet.getRange(index+2,8).setValue('');
          codeSheet.getRange(index+2,9).setValue('');
          codeSheet.getRange(index+2,10).setValue('ABORTED');
          codeSheet.getRange(index+2,13).setValue(now);
        }
      });
    }
    appendTransactionLog({eventType:'EVENT_ABORTED',actorId:actor.identity,actorRole:actor.role,result:'SUCCESS',details:event.eventId+' // initialization safely aborted'});
    SpreadsheetApp.flush();
    return {ok:true,authenticated:true,action:true,status:'EVENT_ABORTED',eventId:event.eventId};
  }finally{try{lock.releaseLock();}catch(error){}}
}

/*
 * FOP installation uses the existing event/code order and ownership engine.
 * Scans stage IDs only; ownership changes exclusively in one Sheets batch.
 * Legacy ACTIVE + empty Nodes require an explicit order, never auto-migration.
 */
const NODE_INSTALL_TTL_SECONDS = 30 * 60;
const NODE_INSTALL_PREFIX = 'NODIV_INSTALL_';

function validateNodeInstallation(actor, nodeId) {
  if(!['FOUNDER','FOP'].includes(actor.role))throw new Error('ROLE_DENIED');
  if(!/^NODE-\d{3}$/.test(nodeId)||!listProvisionedNodeIds().includes(nodeId))throw new Error('NODE_NOT_REGISTERED');
  const event=readCurrentEvent();
  if(!event||!['INITIALIZED','FIELD_ACTIVE'].includes(event.state))throw new Error('EVENT_NOT_INITIALIZED');
  const eventNode=findEventNodeCode(event.eventId,nodeId);
  if(!eventNode)throw new Error('NODE_NOT_IN_EVENT');
  const assigned=String(getEventNodeCodeSheet().getRange(eventNode.row,11).getDisplayValue()||'').trim().toUpperCase();
  if(actor.role==='FOP'&&assigned&&assigned!==actor.identity)throw new Error('NODE_ASSIGNED_TO_OTHER_FOP');
  const count=countCoresOwnedBy('NODE',nodeId);
  if(count!==0)throw new Error(count===3?'NODE_ALREADY_INSTALLED':'NODE_CORE_COUNT_INVALID // '+count+'/3 // manuelle Prüfung erforderlich');
  const legacy=eventNode.changeStatus==='ACTIVE'&&eventNode.activeSlot==='PRIMARY'&&!eventNode.pendingSlot;
  if(!legacy&&(event.state!=='INITIALIZED'||eventNode.changeStatus!=='ASSIGNED_FOR_INSTALL'||eventNode.pendingSlot!=='PRIMARY'))throw new Error('INSTALL_ORDER_REQUIRED');
  return {event,eventNode,assigned,legacy};
}

// Durable, expiring metadata extends the existing Deployment Register. No new sheet.
const NODE_INSTALL_ORDER_PREFIX = 'NODIV_INSTALL_ORDER_';
function installationDeploymentId(orderId,coreId) {return 'INS-'+String(orderId||'')+'-'+coreId;}
function readInstallationOrders() {
  const values=PropertiesService.getScriptProperties().getProperties(),orders=[];
  Object.keys(values).filter(key=>key.startsWith(NODE_INSTALL_ORDER_PREFIX)).forEach(key=>{
    try{orders.push(JSON.parse(values[key]));}catch(error){/* Invalid metadata cannot reserve a Core. */}
  });
  return orders;
}
function installationOrderIsLive(order) {
  if(!order||!Number.isFinite(order.expiresAt)||Date.now()>=order.expiresAt)return false;
  const session=resolvePlayerSession(order.sessionToken||'');
  if(!session.ok||session.player.identity!==order.identity)return false;
  const event=readCurrentEvent();
  return Boolean(event&&event.eventId===order.eventId&&event.state===order.eventState);
}
function installationReservationIsLive(row,orders) {
  if(String(row[5]||'').toUpperCase()!=='NODE_INSTALLATION'||String(row[6]||'').toUpperCase()!=='ASSIGNED')return false;
  return (orders||readInstallationOrders().filter(installationOrderIsLive)).some(order=>
    String(row[0])===installationDeploymentId(order.id,String(row[1]).trim().toUpperCase())&&
    order.nodeId===String(row[4]));
}
function releaseInstallationOrder(order,status) {
  const sheet=getDeploymentRegisterSheet(),requests=[],now=new Date();
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,11).getValues():[];
  rows.forEach((row,index)=>{
    if(String(row[5])==='NODE_INSTALLATION'&&String(row[6])==='ASSIGNED'&&
       String(row[0])===installationDeploymentId(order.id,String(row[1])))
      requests.push(sheetCellsRequest(sheet,index+2,7,[[status,row[7],row[8]||'',now,row[10]||'']]));
  });
  if(requests.length){SpreadsheetApp.flush();Sheets.Spreadsheets.batchUpdate({requests},SpreadsheetApp.getActiveSpreadsheet().getId());}
  PropertiesService.getScriptProperties().deleteProperty(NODE_INSTALL_ORDER_PREFIX+order.id);
  CacheService.getScriptCache().remove(NODE_INSTALL_PREFIX+order.sessionToken);
}
function cleanupInstallationOrders() {
  // Called under ScriptLock. Expired records are also ignored by every reader,
  // so no scheduled cleanup or successfully completed cleanup is required for reuse.
  readInstallationOrders().forEach(order=>{if(!installationOrderIsLive(order))releaseInstallationOrder(order,'EXPIRED');});
}
function nodeEnergyState(energy) {return energy>=600?'STABLE':energy>=450?'DEGRADED':'CRITICAL';}

function selectNodeInstallationLoadout(available,remainingNodes) {
  if(available.length<3)throw new Error('INSTALL_REQUIRES_3_AVAILABLE_RESERVE_CORES');
  const cores=available.slice().sort((a,b)=>a.visibleEnergy-b.visibleEnergy||a.coreId.localeCompare(b.coreId));
  const nodes=Math.max(1,Number(remainingNodes)||1);
  const poolEnergy=cores.reduce((sum,core)=>sum+core.visibleEnergy,0);
  // Keep surplus HQ stock for later use instead of concentrating it into this Node.
  const target=Math.max(600,Math.min(poolEnergy/nodes,3*poolEnergy/cores.length));
  let best=null,bestStable=false,bestDistance=Infinity,bestSpread=Infinity;
  // At most C(200,3)=1,313,400 triples; deterministic, no external optimizer.
  for(let i=0;i<cores.length-2;i++)for(let j=i+1;j<cores.length-1;j++)for(let k=j+1;k<cores.length;k++){
    const energy=cores[i].visibleEnergy+cores[j].visibleEnergy+cores[k].visibleEnergy;
    const stable=energy>=600,distance=stable?Math.abs(energy-target):-energy,spread=cores[k].visibleEnergy-cores[i].visibleEnergy;
    if(!best||(stable&&!bestStable)||(stable===bestStable&&(distance<bestDistance||(distance===bestDistance&&spread<bestSpread)))){
      best=[cores[i],cores[j],cores[k]];bestStable=stable;bestDistance=distance;bestSpread=spread;
    }
  }
  return best.map(core=>({id:core.coreId,uid:core.uid,energy:core.visibleEnergy}));
}

function buildNodeInstallationLoadout(context,nodeId) {
  const orders=readInstallationOrders().filter(installationOrderIsLive),depSheet=getDeploymentRegisterSheet();
  const deployments=depSheet.getLastRow()>1?depSheet.getRange(2,1,depSheet.getLastRow()-1,11).getValues():[];
  const unavailable=new Set(deployments.filter(row=>['ASSIGNED','IN_TRANSIT'].includes(String(row[6]).toUpperCase())&&
    (String(row[5]).toUpperCase()!=='NODE_INSTALLATION'||installationReservationIsLive(row,orders))).map(row=>String(row[1]).trim().toUpperCase()));
  const rows=getRegisterSheet().getRange(2,1,200,CORE_COL.UPDATED_AT).getValues();
  const available=rows.map(row=>({coreId:String(row[0]).trim().toUpperCase(),uid:normalizeUid(row[2]),visibleEnergy:row[1]===''?NaN:Number(row[1]),
    status:String(row[CORE_COL.STATUS-1]).toUpperCase(),ownerType:String(row[CORE_COL.OWNER_TYPE-1]).toUpperCase(),ownerId:String(row[CORE_COL.OWNER_ID-1]).toUpperCase()}))
    .filter(core=>/^NC-\d{3}$/.test(core.coreId)&&core.uid&&Number.isFinite(core.visibleEnergy)&&core.visibleEnergy>0&&core.status==='RESERVE'&&core.ownerType==='NODIV_RESERVE'&&core.ownerId==='HQ'&&!unavailable.has(core.coreId));
  const reservedNodes=new Set(orders.map(order=>order.nodeId));
  const codeSheet=getEventNodeCodeSheet(),codes=codeSheet.getLastRow()>1?codeSheet.getRange(2,1,codeSheet.getLastRow()-1,13).getValues():[];
  const remaining=codes.filter(row=>String(row[0])===context.event.eventId&&!reservedNodes.has(String(row[1]))&&
    countCoresOwnedBy('NODE',String(row[1]).trim().toUpperCase())===0).length;
  return selectNodeInstallationLoadout(available,remaining);
}

function getNodeInstallOrder(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const actor=session.player,nodeId=String(e.parameter.node||'').trim().toUpperCase();
    const context=validateNodeInstallation(actor,nodeId);
    cleanupInstallationOrders();
    const token=normalizeSessionToken(e.parameter.token),orders=readInstallationOrders();
    if(orders.some(order=>order.nodeId===nodeId&&order.sessionToken!==token&&installationOrderIsLive(order)))throw new Error('NODE_INSTALLATION_RESERVED');
    orders.filter(order=>order.sessionToken===token).forEach(order=>releaseInstallationOrder(order,'CANCELLED'));
    const loadout=buildNodeInstallationLoadout(context,nodeId);
    const order={id:Utilities.getUuid(),nodeId,eventId:context.event.eventId,eventState:context.event.state,
      identity:actor.identity,sessionToken:token,legacy:context.legacy,loadout,cores:[],expiresAt:Date.now()+NODE_INSTALL_TTL_SECONDS*1000};
    const props=PropertiesService.getScriptProperties(),sheet=getDeploymentRegisterSheet(),now=new Date();
    const requests=[{appendCells:{sheetId:sheet.getSheetId(),rows:sheetCellsRequest(sheet,1,1,loadout.map(core=>[
      installationDeploymentId(order.id,core.id),core.id,actor.identity,actor.role,nodeId,'NODE_INSTALLATION','ASSIGNED',now,'','',''
    ])).updateCells.rows,fields:'userEnteredValue'}}];
    if(!context.legacy){
      if(!context.assigned)requests.push(sheetCellsRequest(getEventNodeCodeSheet(),context.eventNode.row,11,[[actor.identity]]));
      requests.push(sheetCellsRequest(getEventNodeCodeSheet(),context.eventNode.row,13,[[now]]));
    }
    // Publish metadata before the atomic reservation rows, under the common lock.
    // Failed/crashed publication never holds Cores beyond the fixed TTL.
    props.setProperty(NODE_INSTALL_ORDER_PREFIX+order.id,JSON.stringify(order));
    try{SpreadsheetApp.flush();Sheets.Spreadsheets.batchUpdate({requests},SpreadsheetApp.getActiveSpreadsheet().getId());}
    catch(error){props.deleteProperty(NODE_INSTALL_ORDER_PREFIX+order.id);throw error;}
    CacheService.getScriptCache().put(NODE_INSTALL_PREFIX+token,JSON.stringify(order),NODE_INSTALL_TTL_SECONDS);
    return nodeInstallationResponse(order,context,'NODE_INSTALL_ORDER');
  }finally{try{lock.releaseLock();}catch(error){}}
}

function readNodeInstallation(e,actor) {
  const key=NODE_INSTALL_PREFIX+normalizeSessionToken(e.parameter.token||'');
  const raw=PropertiesService.getScriptProperties().getProperty(NODE_INSTALL_ORDER_PREFIX+String(e.parameter.installation||''));
  if(!raw)throw new Error('INSTALL_SESSION_EXPIRED // Auftrag erneut abrufen');
  const order=JSON.parse(raw);
  if(order.identity!==actor.identity||order.sessionToken!==normalizeSessionToken(e.parameter.token)||order.nodeId!==String(e.parameter.node||'').trim().toUpperCase())throw new Error('INSTALL_SESSION_MISMATCH');
  if(!Number.isFinite(order.expiresAt)||Date.now()>=order.expiresAt)throw new Error('INSTALL_SESSION_EXPIRED');
  const context=validateNodeInstallation(actor,order.nodeId);
  if(order.eventId!==context.event.eventId||order.eventState!==context.event.state||order.legacy!==context.legacy)throw new Error('INSTALL_EVENT_STATE_CHANGED');
  if(!Array.isArray(order.loadout)||order.loadout.length!==3||new Set(order.loadout.map(core=>core.id)).size!==3)throw new Error('INSTALL_LOADOUT_INVALID');
  return {key,order,context};
}

function validateInstallationCore(core,uid,order) {
  if(!uid||core.uid!==uid||core.ownerType!=='NODIV_RESERVE'||core.ownerId!=='HQ'||core.status!=='RESERVE')throw new Error('CORE_NOT_RESERVE // '+core.coreId);
  if(hasOpenDeploymentForCore(core.coreId,order.id))throw new Error('CORE_ALREADY_ASSIGNED // '+core.coreId);
  const assigned=order.loadout.find(item=>item.id===core.coreId&&item.uid===uid&&item.energy===core.visibleEnergy);
  if(!assigned)throw new Error('CORE NOT ASSIGNED TO '+order.nodeId);
  const deployment=findDeploymentById(installationDeploymentId(order.id,core.coreId));
  if(!deployment||deployment.purpose!=='NODE_INSTALLATION'||deployment.status!=='ASSIGNED'||deployment.targetNode!==order.nodeId||deployment.carrierId!==order.identity)throw new Error('INSTALL_RESERVATION_INVALID');
}

function nodeInstallationResponse(order,context,status) {
  const loadout=order.loadout.map(core=>({id:core.id,energy:core.energy,scanned:order.cores.some(item=>item.id===core.id)}));
  const totalEnergy=loadout.reduce((sum,core)=>sum+core.energy,0);
  return {ok:true,authenticated:true,session:true,action:true,status,eventId:order.eventId,
    installation:order.id,expiresAt:new Date(order.expiresAt).toISOString(),legacy:order.legacy,
    node:{id:order.nodeId,code:context.eventNode.codes[0],slot:'PRIMARY'},loadout,totalEnergy,nodeState:nodeEnergyState(totalEnergy),
    cores:loadout.filter(core=>core.scanned),count:order.cores.length,canConfirm:order.cores.length===3,
    instruction:(order.legacy?'LEGACY: mechanisch bestätigt, aber leer. ':'')+'PRIMARY am Schloss einstellen, danach nur die drei zugewiesenen Cores scannen.'};
}

function scanNodeInstallationCore(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const {key,order,context}=readNodeInstallation(e,session.player);
    const uid=normalizeUid(e.parameter.uid||''),hit=lookupUidGlobally(uid);
    if(!hit.found||hit.type!=='N_CORE'||!hit.id)throw new Error('CORE_NOT_FOUND');
    if(order.cores.some(core=>core.id===hit.id||core.uid===uid))throw new Error('DUPLICATE_CORE_SCAN');
    if(!order.loadout.some(core=>core.id===hit.id&&core.uid===uid))throw new Error('CORE NOT ASSIGNED TO '+order.nodeId);
    if(order.cores.length>=3)throw new Error('INSTALL_CORE_LIMIT');
    const core=readCoreState(hit.id);
    validateInstallationCore(core,uid,order);
    order.cores.push({id:core.coreId,uid});
    PropertiesService.getScriptProperties().setProperty(NODE_INSTALL_ORDER_PREFIX+order.id,JSON.stringify(order));
    CacheService.getScriptCache().put(key,JSON.stringify(order),Math.max(1,Math.floor((order.expiresAt-Date.now())/1000)));
    return nodeInstallationResponse(order,context,'INSTALL_CORE_SCANNED');
  }finally{try{lock.releaseLock();}catch(error){}}
}

function cancelNodeInstallation(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const raw=PropertiesService.getScriptProperties().getProperty(NODE_INSTALL_ORDER_PREFIX+String(e.parameter.installation||''));
    if(!raw)return {ok:true,authenticated:true,session:true,action:true,status:'INSTALLATION_CANCELLED'};
    const order=JSON.parse(raw);
    if(order.sessionToken!==normalizeSessionToken(e.parameter.token)||order.identity!==session.player.identity||order.nodeId!==String(e.parameter.node||'').trim().toUpperCase())throw new Error('INSTALL_SESSION_MISMATCH');
    releaseInstallationOrder(order,'CANCELLED');
    return {ok:true,authenticated:true,session:true,action:true,status:'INSTALLATION_CANCELLED',nodeId:order.nodeId};
  }finally{try{lock.releaseLock();}catch(error){}}
}

function confirmNodeInstallation(e) {
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(10000);
    const session=resolvePlayerSession(e.parameter.token||'');
    if(!session.ok)return session.response;
    const actor=session.player,{key,order,context}=readNodeInstallation(e,actor);
    if(order.cores.length!==3||new Set(order.cores.map(core=>core.id)).size!==3||new Set(order.cores.map(core=>core.uid)).size!==3)throw new Error('INSTALL_REQUIRES_EXACTLY_3_CORES');
    order.cores.forEach(item=>validateInstallationCore(readCoreState(item.id),item.uid,order));
    const requests=[],now=new Date(),nodeId=order.nodeId;
    order.cores.forEach(item=>{
      const result=transferCoreOwnership({coreId:item.id,expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',
        toType:'NODE',toId:nodeId,eventType:'NODE_INSTALL_CORE',actorId:actor.identity,actorRole:actor.role,
        nodeId,newStatus:'DEPLOYED',details:order.eventId+' // '+order.id+' // initial installation',batchRequests:requests,installationId:order.id});
      const dep=findDeploymentById(installationDeploymentId(order.id,item.id));
      requests.push(sheetCellsRequest(getDeploymentRegisterSheet(),dep.row,7,[['DELIVERED',dep.createdAt,dep.acceptedAt||'',now,result.transactionId]]));
    });
    const codeSheet=getEventNodeCodeSheet(),nodeSheet=getNodeRegisterSheet(),nodeRow=parseInt(nodeId.substring(5),10)+1;
    requests.push(sheetCellsRequest(codeSheet,context.eventNode.row,8,[['PRIMARY','','ACTIVE',context.assigned||actor.identity,now,now]]));
    requests.push(sheetCellsRequest(nodeSheet,nodeRow,3,[['INSTALLED']]));
    requests.push(sheetCellsRequest(nodeSheet,nodeRow,5,[[actor.identity,now]]));
    appendTransactionLog({eventType:'NODE_INSTALLED',actorId:actor.identity,actorRole:actor.role,nodeId,result:'SUCCESS',
      details:order.eventId+' // '+order.id+' // 3/3 // '+order.cores.map(core=>core.id).join(',')+(order.legacy?' // explicit legacy completion':'')},requests);
    SpreadsheetApp.flush();
    Sheets.Spreadsheets.batchUpdate({requests},SpreadsheetApp.getActiveSpreadsheet().getId());
    CacheService.getScriptCache().remove(key);
    PropertiesService.getScriptProperties().deleteProperty(NODE_INSTALL_ORDER_PREFIX+order.id);
    const totalEnergy=order.loadout.reduce((sum,core)=>sum+core.energy,0);
    return {ok:true,authenticated:true,session:true,action:true,status:'NODE_INSTALLED',eventId:order.eventId,count:3,totalEnergy,nodeState:nodeEnergyState(totalEnergy),
      node:{id:nodeId,status:'INSTALLED',activeSlot:'PRIMARY'}};
  }finally{try{lock.releaseLock();}catch(error){}}
}

// Used by the existing transaction/ownership helpers when staging an atomic batch.
function sheetCellsRequest(sheet,row,column,values) {
  return {updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:column-1},
    rows:values.map(cells=>({values:cells.map(value=>({userEnteredValue:
      value instanceof Date?{stringValue:value.toISOString()}:
      typeof value==='number'?{numberValue:value}:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value??'')}}))})),fields:'userEnteredValue'}};
}

function findEventNodeCode(eventId,nodeId) {
  const sheet=getEventNodeCodeSheet();
  if(sheet.getLastRow()<2)return null;
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,13).getValues();
  for(let i=rows.length-1;i>=0;i--){
    if(String(rows[i][0])===String(eventId)&&String(rows[i][1]).trim().toUpperCase()===String(nodeId).trim().toUpperCase()){
      return {row:i+2,eventId:String(rows[i][0]),nodeId:String(rows[i][1]),codes:[String(rows[i][2]),String(rows[i][3]),String(rows[i][4]),String(rows[i][5]),String(rows[i][6])],activeSlot:String(rows[i][7]||''),pendingSlot:String(rows[i][8]||''),changeStatus:String(rows[i][9]||'').toUpperCase()};
    }
  }
  return null;
}

/*
 * NODE ACCESS AUTHORIZATION V0.1
 * A mechanical Node code is never an authorization credential.
 * Gameplay must be authorized server-side for the concrete identity + Node.
 *
 * AVAILABLE means physically provisioned but not commissioned for field use.
 * Access-code release will be attached here once the event/code register exists.
 */
function getNodeAccessAuthorization(player,nodeId,nodeStatus) {
  const id=String(nodeId||'').trim().toUpperCase();
  const status=String(nodeStatus||'UNDEFINED').trim().toUpperCase();
  if(!id)return {allowed:false,reason:'NODE_ID_INVALID',message:'Node konnte nicht eindeutig identifiziert werden.'};
  if(!Boolean(player.nodeAccess))return {allowed:false,reason:'NODE_ROLE_ACCESS_DENIED',message:'Node erkannt. Diese Rolle besitzt keinen Node-Zugriff.'};

  const event=readCurrentEvent();
  if(!event||event.state!=='FIELD_ACTIVE')return {allowed:false,reason:'EVENT_NOT_FIELD_ACTIVE',message:'Node erkannt. Field Operations sind noch nicht aktiv.'};

  const eventNode=findEventNodeCode(event.eventId,id);
  if(!eventNode)return {allowed:false,reason:'NODE_NOT_IN_ACTIVE_EVENT',message:'Node erkannt. Dieser Node gehört nicht zum aktiven Event.'};
  if(eventNode.changeStatus!=='ACTIVE'||!eventNode.activeSlot)return {allowed:false,reason:'NODE_INSTALLATION_NOT_CONFIRMED',message:'Node erkannt. Die physische Installation ist noch nicht bestätigt.'};

  if(countCoresOwnedBy('NODE',id)!==3)return {allowed:false,reason:'NODE_CORE_COUNT_INVALID',message:'Node benötigt exakt 3 N-Cores. Legacy-Installation gegebenenfalls explizit vervollständigen.'};

  if(['UNDEFINED','AVAILABLE','OFFLINE','INACTIVE','RESERVE'].includes(status))return {allowed:false,reason:'NODE_NOT_FIELD_ACTIVE',message:'Node erkannt. Der Node ist aktuell nicht für den Feldbetrieb freigegeben.'};

  const slotMap={PRIMARY:0,'RESERVE 1':1,'RESERVE 2':2,'RESERVE 3':3,'RESERVE 4':4};
  const codeIndex=slotMap[eventNode.activeSlot];
  if(codeIndex===undefined)return {allowed:false,reason:'NODE_CODE_STATE_INVALID',message:'Node erkannt. Zugangscode-Status ist ungültig.'};

  return {allowed:true,reason:'NODE_ACCESS_GRANTED',message:'Node erkannt. Server-seitige Freigabe erteilt.',accessCode:eventNode.codes[codeIndex]};
}

function provisionAccessCardFromSession(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const session = resolvePlayerSession(e.parameter.token || '');
    if (!session.ok) return session.response;
    const actor = session.player;
    if (actor.role !== 'FOUNDER') return gameplayActionDenied(actor,'ROLE_DENIED','Nur FOUNDER kann Access Cards über das Command Office provisionieren.');

    const newUid = normalizeUid(e.parameter.uid || '');
    const role = String(e.parameter.role || '').trim().toUpperCase();
    const displayName = String(e.parameter.displayName || '').trim();
    if (!newUid) throw new Error('Neue Access Card UID fehlt.');

    const rules = getRoleRules(role);
    const config = ROLE_CONFIG[role];
    if (!rules || !config || !config.provisionable) throw new Error('Diese Rolle kann nicht als neue Identität ausgegeben werden.');

    assertUidAvailable(newUid);
    const identityInfo = calculateNextIdentity(role);
    if (!identityInfo.available) throw new Error(role + ' LIMIT ERREICHT // ' + identityInfo.count + ' VON ' + identityInfo.limit);

    const identity = identityInfo.nextIdentity;
    const sheet = getAccessCardRegisterSheet();
    const lastRow = Math.max(sheet.getLastRow(), 2);
    const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    const cardId = findNextAccessCardId(rows);
    const now = new Date();

    sheet.appendRow([cardId,identity,role,newUid,'ACTIVE',displayName,rules.coreCapacity,rules.nodeAccess,rules.catchAccess,'',now,'Issued via Founder Command Office']);
    appendTransactionLog({eventType:'REGISTER',actorId:actor.identity,actorRole:actor.role,result:'SUCCESS',details:'ACCESS_CARD '+cardId+' // '+identity+' // '+role+' // UID '+newUid});
    SpreadsheetApp.flush();

    return {ok:true,authenticated:true,session:true,action:true,status:'ACCESS_CARD_PROVISIONED',card:{cardId:cardId,identity:identity,role:role,displayName:displayName||identity,uid:newUid,coreCapacity:rules.coreCapacity,nodeAccess:rules.nodeAccess,catchAccess:rules.catchAccess},roleCount:identityInfo.count+1,roleLimit:identityInfo.limit};
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

function registerAccessCard(e) {

  const lock = LockService.getScriptLock();



  try {

    lock.waitLock(10000);



    const authorizerUid = normalizeUid(e.parameter.authorizerUid || '');

    const newUid = normalizeUid(e.parameter.uid || '');

    const role = String(e.parameter.role || '').trim().toUpperCase();

    const displayName = String(e.parameter.displayName || '').trim();



    if (!authorizerUid) throw new Error('Autorisierungs-Karte fehlt.');

    if (!newUid) throw new Error('Neue Access Card UID fehlt.');

    if (authorizerUid === newUid) {

      throw new Error('Autorisierungs-Karte und neue Karte dürfen nicht identisch sein.');

    }



    const rules = getRoleRules(role);

    if (!rules) throw new Error('Unbekannte Rolle.');



    const config = ROLE_CONFIG[role];

    if (!config || !config.provisionable) {

      throw new Error('Diese Rolle kann nicht als neue Identität ausgegeben werden.');

    }



    const authorizer = findAccessCardByUid(authorizerUid);

    if (

      !authorizer ||

      authorizer.status !== 'ACTIVE' ||

      !['FOUNDER', 'FOP'].includes(authorizer.role)

    ) {

      throw new Error('Keine Berechtigung zur Kartenausgabe.');

    }



    /*

     \* Zentrale NODIV-weite UID-Prüfung:

     \* Access Card, N-Core und Node teilen sich denselben UID-Namensraum.

     */

    assertUidAvailable(newUid);



    /*

     \* Identity wird NICHT vom Browser bestimmt.

     \* Unter demselben ScriptLock wird unmittelbar vor dem Schreiben

     \* die nächste freie ID neu berechnet. Dadurch können zwei Geräte

     \* nicht dieselbe Identity erfolgreich anlegen.

     */

    const identityInfo = calculateNextIdentity(role);

    if (!identityInfo.available) {

      throw new Error(

        role + ' LIMIT ERREICHT // ' +

        identityInfo.count + ' VON ' + identityInfo.limit

      );

    }



    const identity = identityInfo.nextIdentity;



    const sheet = getAccessCardRegisterSheet();

    const lastRow = Math.max(sheet.getLastRow(), 2);

    const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();



    const cardId = findNextAccessCardId(rows);

    const now = new Date();



    sheet.appendRow([

      cardId, identity, role, newUid, 'ACTIVE', displayName,

      rules.coreCapacity, rules.nodeAccess, rules.catchAccess,

      '', now, 'Issued via NODIV Access Card Registration'

    ]);



    appendTransactionLog({

      eventType: 'REGISTER',

      actorId: authorizer.identity,

      actorRole: authorizer.role,

      result: 'SUCCESS',

      details:

        'ACCESS_CARD ' + cardId +

        ' // ' + identity +

        ' // ' + role +

        ' // UID ' + newUid

    });



    SpreadsheetApp.flush();



    return {

      ok: true,

      registered: true,

      cardId: cardId,

      identity: identity,

      role: role,

      clearance: getClearanceForRole(role),

      status: 'ACTIVE',

      displayName: displayName || identity,

      coreCapacity: rules.coreCapacity,

      nodeAccess: rules.nodeAccess,

      catchAccess: rules.catchAccess,

      uid: newUid,

      issuedBy: authorizer.identity,

      roleCount: identityInfo.count + 1,

      roleLimit: identityInfo.limit

    };



  } finally {

    try { lock.releaseLock(); } catch (error) {}

  }

}





function getNextIdentity(e) {

  const role = String(e.parameter.role || '').trim().toUpperCase();

  const info = calculateNextIdentity(role);



  return {

    ok: true,

    role: role,

    nextIdentity: info.nextIdentity,

    available: info.available,

    count: info.count,

    limit: info.limit,

    systemMax: info.systemMax

  };

}





function calculateNextIdentity(role) {

  role = String(role || '').trim().toUpperCase();



  const config = ROLE_CONFIG[role];

  if (!config) throw new Error('Unbekannte Rolle.');



  if (!config.provisionable) {

    return {

      available: false,

      nextIdentity: null,

      count: countRoleIdentities(role),

      limit: config.eventLimit,

      systemMax: config.systemMax

    };

  }



  const sheet = getAccessCardRegisterSheet();

  const lastRow = Math.max(sheet.getLastRow(), 2);

  const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();



  /*

   \* Rollenlimit zählt tatsächlich angelegte Identitäten dieser Rolle.

   \* P001 / FOUNDER zählt daher NICHT als PIONEER.

   */

  const roleCount = rows.filter(row =>

    String(row[2] || '').trim().toUpperCase() === role

  ).length;



  if (roleCount >= config.eventLimit) {

    return {

      available: false,

      nextIdentity: null,

      count: roleCount,

      limit: config.eventLimit,

      systemMax: config.systemMax

    };

  }



  /*

   \* Alle Identity IDs belegen ihren Nummernraum unabhängig von Rolle.

   \* Dadurch bleibt P001 reserviert, obwohl P001 die Rolle FOUNDER hat.

   */

  const used = new Set(

    rows

      .map(row => String(row[1] || '').trim().toUpperCase())

      .filter(Boolean)

  );



  let nextIdentity = null;



  for (let number = 1; number <= config.systemMax; number++) {

    const candidate =

      config.prefix + String(number).padStart(3, '0');



    if (!used.has(candidate)) {

      nextIdentity = candidate;

      break;

    }

  }



  if (!nextIdentity) {

    return {

      available: false,

      nextIdentity: null,

      count: roleCount,

      limit: config.eventLimit,

      systemMax: config.systemMax

    };

  }



  return {

    available: true,

    nextIdentity: nextIdentity,

    count: roleCount,

    limit: config.eventLimit,

    systemMax: config.systemMax

  };

}





function countRoleIdentities(role) {

  const sheet = getAccessCardRegisterSheet();

  const lastRow = Math.max(sheet.getLastRow(), 2);

  const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();



  return rows.filter(row =>

    String(row[2] || '').trim().toUpperCase() === role

  ).length;

}





function findAccessCardByUid(uid) {

  const normalizedUid = normalizeUid(uid);

  if (!normalizedUid) return null;



  const sheet = getAccessCardRegisterSheet();

  const lastRow = Math.max(sheet.getLastRow(), 2);

  const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();



  for (let i = 0; i < rows.length; i++) {

    if (normalizeUid(rows[i][3]) === normalizedUid) {

      return {

        cardId: String(rows[i][0] || '').trim().toUpperCase(),

        identity: String(rows[i][1] || '').trim().toUpperCase(),

        role: String(rows[i][2] || '').trim().toUpperCase(),

        uid: normalizedUid,

        status: String(rows[i][4] || '').trim().toUpperCase(),

        displayName: String(rows[i][5] || '').trim(),

        coreCapacity: Number(rows[i][6] || 0),

        nodeAccess: rows[i][7] === true,

        catchAccess: rows[i][8] === true,

        ghostUntil: rows[i][9] || null

      };

    }

  }



  return null;

}





function getRoleRules(role) {

  switch (String(role || '').toUpperCase()) {

    case 'FOUNDER': return { coreCapacity: 0, nodeAccess: true,  catchAccess: false };

    case 'FOP':     return { coreCapacity: 0, nodeAccess: true,  catchAccess: false };

    case 'PIONEER': return { coreCapacity: 1, nodeAccess: true,  catchAccess: false };

    case 'LOCAL':   return { coreCapacity: 1, nodeAccess: false, catchAccess: true  };

    case 'UNBOUND': return { coreCapacity: 2, nodeAccess: false, catchAccess: true  };

    default: return null;

  }

}





function findNextAccessCardId(rows) {

  let maxNumber = 0;

  rows.forEach(row => {

    const match = /^CARD-(\d{3})$/.exec(String(row[0] || '').trim().toUpperCase());

    if (match) maxNumber = Math.max(maxNumber, Number(match[1]));

  });

  const nextNumber = maxNumber + 1;

  if (nextNumber > 999) throw new Error('Access Card ID Bereich ist erschöpft.');

  return 'CARD-' + String(nextNumber).padStart(3, '0');

}



function appendTransactionLog(data, batchRequests) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(TRANSACTION_LOG_SHEET_NAME);

  if (!sheet) throw new Error('Tabellenblatt "' + TRANSACTION_LOG_SHEET_NAME + '" wurde nicht gefunden.');



  const transactionId =

    'TX-' +

    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +

    '-' + Utilities.getUuid().substring(0, 8).toUpperCase();



  const transactionRow = [

    transactionId, new Date(), data.eventType || '', data.actorId || '',

    data.actorRole || '', data.coreId || '', data.fromType || '',

    data.fromId || '', data.toType || '', data.toId || '',

    data.visibleEnergy ?? '', data.hiddenEnergy ?? '', data.actualEnergy ?? '',

    data.nodeId || '', data.result || '', data.details || ''

  ];

  if(batchRequests)batchRequests.push({appendCells:{sheetId:sheet.getSheetId(),rows:sheetCellsRequest(sheet,1,1,[transactionRow]).updateCells.rows,fields:'userEnteredValue'}});
  else sheet.appendRow(transactionRow);

  return transactionId;

}





/*

 \* ============================================================

 \* N-CORE OWNERSHIP / TRANSFER ENGINE V1.0

 \* ============================================================

 \* Source of truth: N-Core Register, columns M:R

 \* M Hidden Energy | N Actual Energy | O Owner Type | P Owner ID

 \* Q Last Transaction | R Updated At

 \*

 \* IMPORTANT:

 \* - Core status (column D) and ownership are separate concepts.

 \* - Blank legacy ownership is NEVER treated as valid ownership.

 \* - All regular ownership changes pass through transferCoreOwnership().

 */



const CORE_COL = {

  ID: 1,

  VISIBLE_ENERGY: 2,

  UID: 3,

  STATUS: 5,

  HIDDEN_ENERGY: 13,

  ACTUAL_ENERGY: 14,

  OWNER_TYPE: 15,

  OWNER_ID: 16,

  LAST_TRANSACTION: 17,

  UPDATED_AT: 18

};



const CORE_OWNER_TYPES = [

  'NODIV_RESERVE', 'NODE', 'PIONEER', 'LOCAL', 'UNBOUND', 'FOP', 'NONE'

];



function getCoreState(e) {

  const coreId = normalizeCoreId(e.parameter.core || '');

  const state = readCoreState(coreId);

  return { ok: true, core: state };

}



function initializeCoreOwnership(e) {

  const lock = LockService.getScriptLock();

  try {

    lock.waitLock(10000);



    const coreId = normalizeCoreId(e.parameter.core || '');

    const requestedOwnerType = String(e.parameter.ownerType || 'NODIV_RESERVE').trim().toUpperCase();

    const requestedOwnerId = String(e.parameter.ownerId || 'HQ').trim().toUpperCase();



    if (requestedOwnerType !== 'NODIV_RESERVE' || requestedOwnerId !== 'HQ') {

      throw new Error('Initialisierung ist nur als NODIV_RESERVE // HQ zulässig.');

    }



    const state = readCoreState(coreId);



    if (!state.uid) throw new Error(coreId + ' ist noch nicht physisch registriert.');

    if (state.status !== 'ERFASST' && state.status !== 'RESERVE') {

      throw new Error(coreId + ' besitzt keinen zulässigen Registrierungsstatus.');

    }



    if (state.ownerType || state.ownerId) {

      if (state.ownerType === 'NODIV_RESERVE' && state.ownerId === 'HQ') {

        return { ok: true, initialized: false, alreadyInitialized: true, core: state };

      }

      throw new Error(

        coreId + ' besitzt bereits Ownership // ' +

        (state.ownerType || '—') + ' // ' + (state.ownerId || '—')

      );

    }



    const transactionId = appendTransactionLog({

      eventType: 'CORE_INITIALIZED',

      actorId: 'HQ',

      actorRole: 'SYSTEM',

      coreId: coreId,

      fromType: 'NONE',

      fromId: '',

      toType: 'NODIV_RESERVE',

      toId: 'HQ',

      visibleEnergy: state.visibleEnergy,

      hiddenEnergy: state.hiddenEnergy,

      actualEnergy: state.actualEnergy,

      result: 'SUCCESS',

      details: 'Initial ownership established'

    });



    writeCoreOwnership(state.row, 'NODIV_RESERVE', 'HQ', transactionId);

    getRegisterSheet().getRange(state.row, CORE_COL.STATUS).setValue('RESERVE');

    SpreadsheetApp.flush();



    return {

      ok: true,

      initialized: true,

      transactionId: transactionId,

      core: readCoreState(coreId)

    };

  } finally {

    try { lock.releaseLock(); } catch (error) {}

  }

}



function startCoreTransfer(e) {

  const lock = LockService.getScriptLock();

  try {

    lock.waitLock(10000);

    const coreId = normalizeCoreId(e.parameter.core || '');
    const pioneerUid = normalizeUid(e.parameter.pioneerUid || '');
    const scannedUid = normalizeUid(e.parameter.uid || '');

    /*
     * START-CORE authorization is bound to the physically scanned
     * Pioneer Access Card. The browser does NOT choose an identity.
     */
    if (!pioneerUid) {
      throw new Error('Pioneer Access Card UID fehlt.');
    }

    if (!scannedUid) {
      throw new Error('N-Core NFC UID fehlt.');
    }

    if (pioneerUid === scannedUid) {
      throw new Error('Pioneer Access Card und N-Core dürfen nicht identisch sein.');
    }

    const identity = findAccessCardByUid(pioneerUid);

    if (!identity) {
      throw new Error('Pioneer Access Card ist nicht registriert.');
    }

    if (identity.status !== 'ACTIVE') {
      throw new Error(identity.identity + ' ist nicht ACTIVE.');
    }

    if (identity.role !== 'PIONEER') {
      throw new Error(identity.identity + ' ist kein PIONEER.');
    }

    /*
     * The identity is resolved server-side from the physically scanned
     * Access Card UID. ACTIVE and PIONEER have already been verified.
     * Use that registered identity directly; the browser cannot choose it.
     */
    const identityId = String(identity.identity || '').trim().toUpperCase();

    if (!identityId) {
      throw new Error('Pioneer Identity fehlt im Access Card Register.');
    }


    const state = readCoreState(coreId);

    if (!state.uid) {
      throw new Error(coreId + ' ist nicht registriert.');
    }

    if (state.uid !== scannedUid) {
      throw new Error('UID stimmt nicht mit ' + coreId + ' überein.');
    }

    if (state.ownerType !== 'NODIV_RESERVE' || state.ownerId !== 'HQ') {
      throw new Error(coreId + ' befindet sich nicht in NODIV_RESERVE // HQ.');
    }

    const ownedCount = countCoresOwnedBy('PIONEER', identityId);

    if (ownedCount >= identity.coreCapacity) {
      throw new Error(identityId + ' hat keine freie N-Core Kapazität.');
    }

    const result = transferCoreOwnership({
      coreId: coreId,
      expectedFromType: 'NODIV_RESERVE',
      expectedFromId: 'HQ',
      toType: 'PIONEER',
      toId: identityId,
      eventType: 'START_CORE',
      actorId: identityId,
      actorRole: 'PIONEER',
      newStatus: 'FIELD',
      details: 'Start-Core issued from NODIV reserve // Access Card verified by UID'
    });

    return {
      ok: true,
      transfer: result,
      identity: identityId,
      cardId: identity.cardId
    };

  } finally {

    try { lock.releaseLock(); } catch (error) {}

  }

}



function catchCoreTransfer(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const card1Uid = normalizeUid(e.parameter.card1Uid || '');
    const card2Uid = normalizeUid(e.parameter.card2Uid || '');
    const coreUid = normalizeUid(e.parameter.uid || '');

    if (!card1Uid || !card2Uid) throw new Error('Zwei Access Cards müssen gescannt werden.');
    if (card1Uid === card2Uid) throw new Error('Dieselbe Access Card wurde zweimal gescannt.');
    if (!coreUid) throw new Error('N-Core NFC UID fehlt.');

    const a = findAccessCardByUid(card1Uid);
    const b = findAccessCardByUid(card2Uid);
    if (!a || !b) throw new Error('Eine der Access Cards ist nicht registriert.');
    if (a.status !== 'ACTIVE' || b.status !== 'ACTIVE') throw new Error('Beide Access Cards müssen ACTIVE sein.');

    let pioneer, local;
    if (a.role === 'PIONEER' && b.role === 'LOCAL') { pioneer=a; local=b; }
    else if (a.role === 'LOCAL' && b.role === 'PIONEER') { pioneer=b; local=a; }
    else throw new Error('CATCH benötigt genau einen PIONEER und einen LOCAL.');

    if (!local.catchAccess) throw new Error(local.identity + ' besitzt keine CATCH Berechtigung.');

    const pioneerId=String(pioneer.identity||'').trim().toUpperCase();
    const localId=String(local.identity||'').trim().toUpperCase();
    if (!pioneerId || !localId) throw new Error('Identity fehlt im Access Card Register.');

    const now=new Date();
    if (pioneer.ghostUntil) {
      const activeGhost=new Date(pioneer.ghostUntil);
      if (!isNaN(activeGhost.getTime()) && activeGhost>now) {
        throw new Error(pioneerId + ' befindet sich bereits im GHOST Status.');
      }
    }

    if (countCoresOwnedBy('LOCAL',localId) >= local.coreCapacity) {
      throw new Error(localId + ' hat keine freie N-Core Kapazität.');
    }

    const hit=lookupUidGlobally(coreUid);
    if (!hit.found || hit.type !== 'N_CORE' || !hit.id) {
      throw new Error('Gescannter NFC Tag ist kein registrierter N-Core.');
    }

    const coreId=String(hit.id).trim().toUpperCase();
    const state=readCoreState(coreId);
    if (state.uid !== coreUid) throw new Error('N-Core UID stimmt nicht mit dem Register überein.');
    if (state.ownerType !== 'PIONEER' || state.ownerId !== pioneerId) {
      throw new Error(coreId + ' gehört nicht zu ' + pioneerId + ' // tatsächlich ' +
        (state.ownerType||'—') + ' // ' + (state.ownerId||'—'));
    }

    const result=transferCoreOwnership({
      coreId:coreId,
      expectedFromType:'PIONEER',
      expectedFromId:pioneerId,
      toType:'LOCAL',
      toId:localId,
      eventType:'CATCH',
      actorId:localId,
      actorRole:'LOCAL',
      newStatus:'CAUGHT',
      details:'CATCH // '+pioneerId+' -> '+localId
    });

    const ghostUntil=new Date(now.getTime()+15*60*1000);
    setAccessCardGhostUntilByUid(pioneer.uid,ghostUntil);

    SpreadsheetApp.flush();

    return {
      ok:true,
      catch:result,
      pioneer:pioneerId,
      local:localId,
      core:coreId,
      ghostUntil:ghostUntil.toISOString()
    };
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

function setAccessCardGhostUntilByUid(uid,ghostUntil) {
  const normalizedUid=normalizeUid(uid);
  const sheet=getAccessCardRegisterSheet();
  const lastRow=Math.max(sheet.getLastRow(),2);
  const rows=sheet.getRange(2,1,lastRow-1,12).getValues();
  for (let i=0;i<rows.length;i++) {
    if (normalizeUid(rows[i][3])===normalizedUid) {
      sheet.getRange(i+2,10).setValue(ghostUntil);
      return true;
    }
  }
  throw new Error('Pioneer Access Card für GHOST Update nicht gefunden.');
}



function extractCoreTransfer(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const participantUid = normalizeUid(e.parameter.participantUid || '');
    const fopUid = normalizeUid(e.parameter.fopUid || '');
    const coreUid = normalizeUid(e.parameter.uid || '');

    if (!participantUid) throw new Error('Teilnehmer Access Card UID fehlt.');
    if (!fopUid) throw new Error('FOP Access Card UID fehlt.');
    if (!coreUid) throw new Error('N-Core NFC UID fehlt.');
    if (participantUid === fopUid) throw new Error('Teilnehmer und FOP müssen unterschiedliche Access Cards sein.');

    const participant = findAccessCardByUid(participantUid);
    const fop = findAccessCardByUid(fopUid);

    if (!participant) throw new Error('Teilnehmer Access Card ist nicht registriert.');
    if (!fop) throw new Error('FOP Access Card ist nicht registriert.');
    if (participant.status !== 'ACTIVE') throw new Error(participant.identity + ' ist nicht ACTIVE.');
    if (fop.status !== 'ACTIVE') throw new Error(fop.identity + ' ist nicht ACTIVE.');
    if (fop.role !== 'FOP') throw new Error(fop.identity + ' ist kein FOP.');
    if (participant.role !== 'LOCAL' && participant.role !== 'UNBOUND') {
      throw new Error('Extraction ist nur für LOCAL oder UNBOUND zulässig.');
    }

    const participantId = String(participant.identity || '').trim().toUpperCase();
    const fopId = String(fop.identity || '').trim().toUpperCase();
    if (!participantId || !fopId) throw new Error('Identity fehlt im Access Card Register.');

    const hit = lookupUidGlobally(coreUid);
    if (!hit.found || hit.type !== 'N_CORE' || !hit.id) {
      throw new Error('Gescannter NFC Tag ist kein registrierter N-Core.');
    }

    const coreId = String(hit.id).trim().toUpperCase();
    let state = readCoreState(coreId);

    if (state.uid !== coreUid) throw new Error('N-Core UID stimmt nicht mit dem Register überein.');
    if (state.ownerType !== participant.role || state.ownerId !== participantId) {
      throw new Error(coreId + ' gehört nicht zu ' + participantId + ' // tatsächlich ' +
        (state.ownerType || '—') + ' // ' + (state.ownerId || '—'));
    }
    if (state.status !== 'CAUGHT') {
      throw new Error(coreId + ' besitzt keinen zulässigen CATCH Status // ' + (state.status || '—'));
    }

    let scoreableEnergy = Number(state.actualEnergy);
    if (state.actualEnergy === '' || !isFinite(scoreableEnergy)) {
      scoreableEnergy = Number(state.visibleEnergy || 0) + Number(state.hiddenEnergy || 0);
      getRegisterSheet().getRange(state.row, CORE_COL.ACTUAL_ENERGY).setValue(scoreableEnergy);
      SpreadsheetApp.flush();
      state = readCoreState(coreId);
    }

    const result = transferCoreOwnership({
      coreId: coreId,
      expectedFromType: participant.role,
      expectedFromId: participantId,
      toType: 'FOP',
      toId: fopId,
      eventType: 'EXTRACTION',
      actorId: participantId,
      actorRole: participant.role,
      newStatus: 'EXTRACTED',
      details: 'EXTRACTION // ' + participantId + ' -> ' + fopId + ' // scoreable ' + scoreableEnergy + ' E'
    });

    return {
      ok: true,
      extracted: true,
      participant: participantId,
      participantRole: participant.role,
      fop: fopId,
      core: coreId,
      scoreableEnergy: scoreableEnergy,
      transactionId: result.transactionId,
      ownership: result.to,
      state: result.core
    };
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}


function transferCoreOwnership(data) {

  const coreId = normalizeCoreId(data.coreId || '');

  const fromType = normalizeOwnerType(data.expectedFromType);

  const fromId = String(data.expectedFromId || '').trim().toUpperCase();

  const toType = normalizeOwnerType(data.toType);

  const toId = String(data.toId || '').trim().toUpperCase();



  if (!toId && toType !== 'NONE') throw new Error('Ziel Owner ID fehlt.');



  const depSheet=getDeploymentRegisterSheet(),depRows=depSheet.getLastRow()>1?depSheet.getRange(2,1,depSheet.getLastRow()-1,11).getValues():[];
  const installOrders=readInstallationOrders().filter(installationOrderIsLive);
  if(depRows.some(row=>String(row[1]).trim().toUpperCase()===coreId&&installationReservationIsLive(row,installOrders)&&String(row[0])!==installationDeploymentId(data.installationId,coreId)))throw new Error('CORE_RESERVED_FOR_NODE_INSTALLATION');

  const state = readCoreState(coreId);

  if (!state.uid) throw new Error(coreId + ' ist nicht registriert.');

  if (!state.ownerType || !state.ownerId) {

    throw new Error(coreId + ' besitzt keine initialisierte Ownership.');

  }

  if (state.ownerType !== fromType || state.ownerId !== fromId) {

    throw new Error(

      'Ownership mismatch // erwartet ' + fromType + ' // ' + fromId +

      ' // tatsächlich ' + state.ownerType + ' // ' + state.ownerId

    );

  }



  const transactionId = appendTransactionLog({

    eventType: data.eventType || 'CORE_TRANSFER',

    actorId: data.actorId || '',

    actorRole: data.actorRole || '',

    coreId: coreId,

    fromType: fromType,

    fromId: fromId,

    toType: toType,

    toId: toId,

    visibleEnergy: state.visibleEnergy,

    hiddenEnergy: state.hiddenEnergy,

    actualEnergy: state.actualEnergy,

    nodeId: data.nodeId || '',

    result: 'SUCCESS',

    details: data.details || ''

  }, data.batchRequests);



  writeCoreOwnership(state.row, toType, toId, transactionId, data.batchRequests);

  if (data.newStatus) {

    if(data.batchRequests)data.batchRequests.push(sheetCellsRequest(getRegisterSheet(),state.row,CORE_COL.STATUS,[[String(data.newStatus).trim().toUpperCase()]]));
    else getRegisterSheet().getRange(state.row, CORE_COL.STATUS).setValue(String(data.newStatus).trim().toUpperCase());

  }

  if(!data.batchRequests)SpreadsheetApp.flush();



  return {

    transactionId: transactionId,

    core: data.batchRequests ? state : readCoreState(coreId),

    from: { type: fromType, id: fromId },

    to: { type: toType, id: toId }

  };

}



function readCoreState(coreId) {

  const normalized = normalizeCoreId(coreId);

  const sheet = getRegisterSheet();

  const ids = sheet.getRange(2, CORE_COL.ID, 200, 1).getDisplayValues().flat()

    .map(v => String(v || '').trim().toUpperCase());

  const index = ids.indexOf(normalized);

  if (index === -1) throw new Error(normalized + ' wurde im N-Core Register nicht gefunden.');



  const row = index + 2;

  const values = sheet.getRange(row, 1, 1, CORE_COL.UPDATED_AT).getValues()[0];

  return {

    row: row,

    coreId: normalized,

    visibleEnergy: values[CORE_COL.VISIBLE_ENERGY - 1] === '' ? '' : Number(values[CORE_COL.VISIBLE_ENERGY - 1]),

    uid: normalizeUid(values[CORE_COL.UID - 1]),

    status: String(values[CORE_COL.STATUS - 1] || '').trim().toUpperCase(),

    hiddenEnergy: values[CORE_COL.HIDDEN_ENERGY - 1] === '' ? '' : Number(values[CORE_COL.HIDDEN_ENERGY - 1]),

    actualEnergy: values[CORE_COL.ACTUAL_ENERGY - 1] === '' ? '' : Number(values[CORE_COL.ACTUAL_ENERGY - 1]),

    ownerType: String(values[CORE_COL.OWNER_TYPE - 1] || '').trim().toUpperCase(),

    ownerId: String(values[CORE_COL.OWNER_ID - 1] || '').trim().toUpperCase(),

    lastTransaction: String(values[CORE_COL.LAST_TRANSACTION - 1] || '').trim(),

    updatedAt: values[CORE_COL.UPDATED_AT - 1] || null

  };

}



function writeCoreOwnership(row, ownerType, ownerId, transactionId, batchRequests) {
  const sheet=getRegisterSheet(),values=[[normalizeOwnerType(ownerType),String(ownerId||'').trim().toUpperCase(),String(transactionId||'').trim(),new Date()]];
  if(batchRequests)batchRequests.push(sheetCellsRequest(sheet,row,CORE_COL.OWNER_TYPE,values));
  else sheet.getRange(row,CORE_COL.OWNER_TYPE,1,4).setValues(values);
}

function countCoresOwnedBy(ownerType, ownerId) {

  const sheet = getRegisterSheet();

  const rows = sheet.getRange(2, CORE_COL.OWNER_TYPE, 200, 2).getDisplayValues();

  const type = normalizeOwnerType(ownerType);

  const id = String(ownerId || '').trim().toUpperCase();

  return rows.filter(r =>

    String(r[0] || '').trim().toUpperCase() === type &&

    String(r[1] || '').trim().toUpperCase() === id

  ).length;

}



function findIdentityById(identityId) {

  const wanted = String(identityId || '').trim().toUpperCase();

  const sheet = getAccessCardRegisterSheet();

  const lastRow = Math.max(sheet.getLastRow(), 2);

  const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();



  for (let i = 0; i < rows.length; i++) {

    const identity = String(rows[i][1] || '').trim().toUpperCase();

    if (identity === wanted) {

      return {

        cardId: String(rows[i][0] || '').trim().toUpperCase(),

        identity: identity,

        role: String(rows[i][2] || '').trim().toUpperCase(),

        uid: normalizeUid(rows[i][3]),

        status: String(rows[i][4] || '').trim().toUpperCase(),

        displayName: String(rows[i][5] || '').trim(),

        coreCapacity: Number(rows[i][6] || 0),

        nodeAccess: rows[i][7] === true,

        catchAccess: rows[i][8] === true,

        ghostUntil: rows[i][9] || null

      };

    }

  }

  return null;

}



function normalizeCoreId(value) {

  const coreId = String(value || '').trim().toUpperCase();

  if (!/^NC-\d{3}$/.test(coreId)) throw new Error('Ungültiges N-Core ID Format.');

  const n = Number(coreId.substring(3));

  if (n < 1 || n > 200) throw new Error('N-Core ID außerhalb NC-001 bis NC-200.');

  return coreId;

}



function normalizeOwnerType(value) {

  const type = String(value || '').trim().toUpperCase();

  if (CORE_OWNER_TYPES.indexOf(type) === -1) {

    throw new Error('Ungültiger Owner Type: ' + type);

  }

  return type;

}





/*

 \* ============================================================

 \* GLOBAL UID REGISTRY / INTEGRITY

 \* ============================================================

 \* Eine NFC UID darf NODIV-weit genau einem physischen Objekt

 \* zugeordnet sein: ACCESS_CARD, N_CORE oder NODE.

 */



function getUidLookup(e) {

  const uid = normalizeUid(e.parameter.uid || '');



  if (!uid) {

    throw new Error('UID fehlt.');

  }



  const hit = lookupUidGlobally(uid);



  if (!hit.found) {

    return {

      ok: true,

      uid: uid,

      available: true,

      found: false

    };

  }



  return {

    ok: true,

    uid: uid,

    available: false,

    found: true,

    type: hit.type || '',

    id: hit.id || '',

    identity: hit.identity || '',

    display: getPublicScanDisplay(hit)

  };

}





function getPublicScanDisplay(hit) {
  if (!hit || !hit.found) return { label: 'UNKNOWN', status: 'UNVERIFIED' };
  if (hit.type === 'N_CORE') {
    const core = readCoreState(hit.id);
    return { label: 'N-CORE', energy: core.actualEnergy === '' ? core.visibleEnergy : core.actualEnergy, status: core.status || 'UNDEFINED' };
  }
  if (hit.type === 'ACCESS_CARD') {
    const player = findIdentityById(hit.identity || '');
    if (!player) return { label: 'PLAYER ID', verified: false, status: 'UNVERIFIED' };
    let publicStatus = player.status === 'ACTIVE' ? 'ACTIVE' : 'NOT ACTIVE';
    if (player.ghostUntil) {
      const until = new Date(player.ghostUntil);
      if (!isNaN(until.getTime()) && until.getTime() > Date.now()) publicStatus = 'GHOST';
    }
    return { label: 'PLAYER ID', verified: player.status === 'ACTIVE', role: player.role || 'UNDEFINED', status: publicStatus };
  }
  if (hit.type === 'NODE') {
    const sheet = getNodeRegisterSheet(), rows = sheet.getRange(2, 1, 15, 3).getValues();
    for (let i=0;i<rows.length;i++) if (String(rows[i][0]||'').trim().toUpperCase()===hit.id) return { label:'NODIV NODE', status:String(rows[i][2]||'').trim().toUpperCase()||'UNDEFINED' };
    return { label:'NODIV NODE', status:'UNDEFINED' };
  }
  const uploadSheet=getUploadTerminalSheet();
  const uploadLast=Math.max(uploadSheet.getLastRow(),1);
  if(uploadLast>1){
    const uploadRows=uploadSheet.getRange(2,1,uploadLast-1,6).getValues();
    for(let i=0;i<uploadRows.length;i++){
      if(normalizeUid(uploadRows[i][2])===normalizedUid){
        return {found:true,uid:normalizedUid,type:'UPLOAD_TERMINAL',id:String(uploadRows[i][0]||'').trim().toUpperCase(),terminalType:String(uploadRows[i][1]||'').trim().toUpperCase(),status:String(uploadRows[i][3]||'').trim().toUpperCase()};
      }
    }
  }

  return { label:'NODIV OBJECT', status:'VERIFIED' };
}

function lookupUidGlobally(uid) {

  const normalizedUid = normalizeUid(uid);



  if (!normalizedUid) {

    return { found: false, uid: '' };

  }



  const accessSheet = getAccessCardRegisterSheet();

  const accessLastRow = Math.max(accessSheet.getLastRow(), 2);

  const accessRows =

    accessSheet.getRange(2, 1, accessLastRow - 1, 12).getValues();



  for (let i = 0; i < accessRows.length; i++) {

    if (normalizeUid(accessRows[i][3]) === normalizedUid) {

      return {

        found: true,

        uid: normalizedUid,

        type: 'ACCESS_CARD',

        id: String(accessRows[i][0] || '').trim().toUpperCase(),

        identity: String(accessRows[i][1] || '').trim().toUpperCase()

      };

    }

  }



  const coreSheet = getRegisterSheet();

  const coreRows =

    coreSheet.getRange(2, 1, 200, 4).getValues();



  for (let i = 0; i < coreRows.length; i++) {

    if (normalizeUid(coreRows[i][2]) === normalizedUid) {

      return {

        found: true,

        uid: normalizedUid,

        type: 'N_CORE',

        id: String(coreRows[i][0] || '').trim().toUpperCase()

      };

    }

  }



  const nodeSheet = getNodeRegisterSheet();

  const nodeRows =

    nodeSheet.getRange(2, 1, 15, 3).getValues();



  for (let i = 0; i < nodeRows.length; i++) {

    if (normalizeUid(nodeRows[i][1]) === normalizedUid) {

      return {

        found: true,

        uid: normalizedUid,

        type: 'NODE',

        id: String(nodeRows[i][0] || '').trim().toUpperCase()

      };

    }

  }



  const uploadSheet = getUploadTerminalSheet();
  const uploadLast = Math.max(uploadSheet.getLastRow(), 1);
  if (uploadLast > 1) {
    const uploadRows = uploadSheet.getRange(2, 1, uploadLast - 1, 6).getValues();
    for (let i = 0; i < uploadRows.length; i++) {
      if (normalizeUid(uploadRows[i][2]) === normalizedUid) {
        return { found:true, uid:normalizedUid, type:'UPLOAD_TERMINAL', id:String(uploadRows[i][0]||'').trim().toUpperCase(), terminalType:String(uploadRows[i][1]||'').trim().toUpperCase(), status:String(uploadRows[i][3]||'').trim().toUpperCase() };
      }
    }
  }

  return {

    found: false,

    uid: normalizedUid

  };

}





function assertUidAvailable(uid, allowedType, allowedId) {

  const hit = lookupUidGlobally(uid);



  if (!hit.found) return true;



  const sameAssignment =

    allowedType &&

    allowedId &&

    hit.type === String(allowedType).toUpperCase() &&

    hit.id === String(allowedId).trim().toUpperCase();



  if (sameAssignment) return true;



  const extra =

    hit.type === 'ACCESS_CARD' && hit.identity

      ? ' // ' + hit.identity

      : '';



  throw new Error(

    'UID bereits vergeben // ' +

    hit.type +

    ' // ' +

    hit.id +

    extra

  );

}





/*

 \* ============================================================

 \* REGISTER SHEET

 \* ============================================================

 */



function getRegisterSheet() {



  const ss =

    SpreadsheetApp

      .getActiveSpreadsheet();





  const sheet =

    ss.getSheetByName(

      SHEET_NAME

    );





  if (!sheet) {



    throw new Error(

      'Tabellenblatt "' +

      SHEET_NAME +

      '" wurde nicht gefunden.'

    );



  }





  return sheet;



}







/*

 \* ============================================================

 \* UID NORMALIZATION

 \* ============================================================

 */



function normalizeUid(value) {



  let uid =

    String(value || '')

      .trim()

      .toUpperCase()

      .replace(

        /[^0-9A-F]/g,

        ''

      );





  if (!uid) {



    return '';



  }





  return uid

    .match(/.{1,2}/g)

    .join(':');



}







/*

 \* ============================================================

 \* API RESPONSE

 \* ============================================================

 */



function createResponse(e, data) {



  const callback =

    String(

      e.parameter.callback || ''

    ).trim();





  /*

   \* JSONP

   */



  if (callback) {



    if (

      !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(

        callback

      )

    ) {



      return ContentService

        .createTextOutput(

          JSON.stringify({

            ok: false,

            error: 'Ungültiger Callback.'

          })

        )

        .setMimeType(

          ContentService.MimeType.JSON

        );



    }





    return ContentService

      .createTextOutput(

        callback +

        '(' +

        JSON.stringify(data) +

        ');'

      )

      .setMimeType(

        ContentService.MimeType.JAVASCRIPT

      );



  }





  /*

   \* Normale JSON-Antwort

   */



  return ContentService

    .createTextOutput(

      JSON.stringify(

        data,

        null,

        2

      )

    )

    .setMimeType(

      ContentService.MimeType.JSON

    );



  const uploadSheet = getUploadTerminalSheet();
  const uploadLast = Math.max(uploadSheet.getLastRow(), 1);
  if (uploadLast > 1) {
    const uploadRows = uploadSheet.getRange(2, 1, uploadLast - 1, 6).getValues();
    for (let i = 0; i < uploadRows.length; i++) {
      if (normalizeUid(uploadRows[i][2]) === normalizedUid) {
        return { found:true, uid:normalizedUid, type:'UPLOAD_TERMINAL', id:String(uploadRows[i][0]||'').trim().toUpperCase(), terminalType:String(uploadRows[i][1]||'').trim().toUpperCase(), status:String(uploadRows[i][3]||'').trim().toUpperCase() };
      }
    }
  }

  return {

    found: false,

    uid: normalizedUid

  };

}





function assertUidAvailable(uid, allowedType, allowedId) {

  const hit = lookupUidGlobally(uid);



  if (!hit.found) return true;



  const sameAssignment =

    allowedType &&

    allowedId &&

    hit.type === String(allowedType).toUpperCase() &&

    hit.id === String(allowedId).trim().toUpperCase();



  if (sameAssignment) return true;



  const extra =

    hit.type === 'ACCESS_CARD' && hit.identity

      ? ' // ' + hit.identity

      : '';



  throw new Error(

    'UID bereits vergeben // ' +

    hit.type +

    ' // ' +

    hit.id +

    extra

  );

}





/*

 \* ============================================================

 \* REGISTER SHEET

 \* ============================================================

 */



function getRegisterSheet() {



  const ss =

    SpreadsheetApp

      .getActiveSpreadsheet();





  const sheet =

    ss.getSheetByName(

      SHEET_NAME

    );





  if (!sheet) {



    throw new Error(

      'Tabellenblatt "' +

      SHEET_NAME +

      '" wurde nicht gefunden.'

    );



  }





  return sheet;



}







/*

 \* ============================================================

 \* UID NORMALIZATION

 \* ============================================================

 */



function normalizeUid(value) {



  let uid =

    String(value || '')

      .trim()

      .toUpperCase()

      .replace(

        /[^0-9A-F]/g,

        ''

      );





  if (!uid) {



    return '';



  }





  return uid

    .match(/.{1,2}/g)

    .join(':');



}







/*

 \* ============================================================

 \* API RESPONSE

 \* ============================================================

 */



function createResponse(e, data) {



  const callback =

    String(

      e.parameter.callback || ''

    ).trim();





  /*

   \* JSONP

   */



  if (callback) {



    if (

      !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(

        callback

      )

    ) {



      return ContentService

        .createTextOutput(

          JSON.stringify({

            ok: false,

            error: 'Ungültiger Callback.'

          })

        )

        .setMimeType(

          ContentService.MimeType.JSON

        );



    }





    return ContentService

      .createTextOutput(

        callback +

        '(' +

        JSON.stringify(data) +

        ');'

      )

      .setMimeType(

        ContentService.MimeType.JAVASCRIPT

      );



  }





  /*

   \* Normale JSON-Antwort

   */



  return ContentService

    .createTextOutput(

      JSON.stringify(

        data,

        null,

        2

      )

    )

    .setMimeType(

      ContentService.MimeType.JSON

    );



}