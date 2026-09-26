const SHEET_NAME = 'N-Core Register';

const NODE_SHEET_NAME = 'Node Register';

const ACCESS_CARD_SHEET_NAME = 'Access Card Register';

const TRANSACTION_LOG_SHEET_NAME = 'Transaction Log';



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

  UNBOUND: { prefix: 'U', eventLimit: 3,  systemMax: 3,  provisionable: false }

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

 \* ============================================================

 \* ACCESS CARD REGISTRATION

 \* ============================================================

 \* V1 provisioning: ACTIVE FOUNDER/FOP authorizes a new card.

 \* Role permissions are assigned server-side.

 \* NFC UID is an identifier, not a cryptographic credential;

 \* secure Founder PC login/session remains a later security layer.

 */



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



function appendTransactionLog(data) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(TRANSACTION_LOG_SHEET_NAME);

  if (!sheet) throw new Error('Tabellenblatt "' + TRANSACTION_LOG_SHEET_NAME + '" wurde nicht gefunden.');



  const transactionId =

    'TX-' +

    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +

    '-' + Utilities.getUuid().substring(0, 8).toUpperCase();



  sheet.appendRow([

    transactionId, new Date(), data.eventType || '', data.actorId || '',

    data.actorRole || '', data.coreId || '', data.fromType || '',

    data.fromId || '', data.toType || '', data.toId || '',

    data.visibleEnergy ?? '', data.hiddenEnergy ?? '', data.actualEnergy ?? '',

    data.nodeId || '', data.result || '', data.details || ''

  ]);

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

  STATUS: 4,

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

  });



  writeCoreOwnership(state.row, toType, toId, transactionId);

  if (data.newStatus) {

    getRegisterSheet().getRange(state.row, CORE_COL.STATUS).setValue(String(data.newStatus).trim().toUpperCase());

  }

  SpreadsheetApp.flush();



  return {

    transactionId: transactionId,

    core: readCoreState(coreId),

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



function writeCoreOwnership(row, ownerType, ownerId, transactionId) {

  const sheet = getRegisterSheet();

  sheet.getRange(row, CORE_COL.OWNER_TYPE, 1, 4).setValues([[

    normalizeOwnerType(ownerType),

    String(ownerId || '').trim().toUpperCase(),

    String(transactionId || '').trim(),

    new Date()

  ]]);

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

    identity: hit.identity || ''

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
    return { label: 'PLAYER ID', verified: player.status === 'ACTIVE', status: publicStatus };
  }
  if (hit.type === 'NODE') {
    const sheet = getNodeRegisterSheet(), rows = sheet.getRange(2, 1, 15, 3).getValues();
    for (let i=0;i<rows.length;i++) if (String(rows[i][0]||'').trim().toUpperCase()===hit.id) return { label:'NODIV NODE', status:String(rows[i][2]||'').trim().toUpperCase()||'UNDEFINED' };
    return { label:'NODIV NODE', status:'UNDEFINED' };
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