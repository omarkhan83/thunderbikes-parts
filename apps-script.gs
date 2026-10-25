/**
 * UBC Thunderbikes part numbering: Google Sheets backend.
 * Paste this whole file into Extensions > Apps Script of your parts Google Sheet,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */
const PARTS = 'Parts';
const SUBS = 'Subassemblies';
const ASSEMBLIES = 'Assemblies';

// Each tab: header names, the matching record keys, and the columns that stay plain numbers.
// Every other column is formatted as text so Sheets doesn't turn "03" into 3 or "001" into 1.
const TABS = {
  Parts: {
    cols: ['Part Number', 'System', 'Assembly', 'Scheme', 'Subassembly', 'Part', 'Prototype', 'Iteration',
      'Description', 'Qty', 'Unit Cost (CAD)', 'Created By', 'Created At', 'Updated At', 'Updated By'],
    keys: ['number', 'system', 'assembly', 'scheme', 'sub', 'suffix', 'proto', 'iteration',
      'description', 'qty', 'cost', 'createdBy', 'createdAt', 'updatedAt', 'updatedBy'],
    numeric: ['iteration', 'qty', 'cost']
  },
  Subassemblies: {
    cols: ['System', 'Assembly', 'Subassembly', 'Name', 'Created By', 'Created At'],
    keys: ['sys', 'code', 'sub', 'name', 'createdBy', 'createdAt'],
    numeric: []
  },
  Assemblies: {
    cols: ['System', 'Code', 'Name', 'Scheme', 'Created At'],
    keys: ['sys', 'code', 'name', 'scheme', 'createdAt'],
    numeric: []
  }
};

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    const t = TABS[name];
    sh = ss.insertSheet(name);
    t.keys.forEach((k, i) => {
      if (t.numeric.indexOf(k) === -1) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(name) {
  const keys = TABS[name].keys;
  const values = sheet_(name).getDataRange().getValues();
  values.shift();
  return values.filter(r => r[0] !== '').map(r => {
    const o = {};
    keys.forEach((k, i) => { o[k] = r[i] === '' ? null : r[i]; });
    return o;
  });
}

function append_(name, rec) {
  sheet_(name).appendRow(TABS[name].keys.map(k => {
    const v = rec[k];
    if (k === 'proto') return v ? 'Yes' : '';
    return v === null || v === undefined ? '' : v;
  }));
}

function findRow_(sh, number) {
  const col = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 1; i < col.length; i++) if (String(col[i][0]) === number) return i + 1;
  return -1;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ parts: rows_(PARTS), subassemblies: rows_(SUBS), assemblies: rows_(ASSEMBLIES) });
}

function create_(rec) {
  if (findRow_(sheet_(PARTS), rec.number) !== -1) return { ok: false, reason: 'exists' };
  append_(PARTS, rec);
  return { ok: true };
}

function addSub_(s) {
  const taken = rows_(SUBS).some(x => x.sys === s.sys && x.code === s.code && x.sub === s.sub);
  if (taken) return { ok: false, reason: 'exists' };
  append_(SUBS, s);
  return { ok: true };
}

function update_(number, patch) {
  const sh = sheet_(PARTS), keys = TABS[PARTS].keys;
  const row = findRow_(sh, number);
  if (row === -1) return { ok: false, reason: 'missing' };
  Object.keys(patch).forEach(k => {
    const i = keys.indexOf(k);
    if (i > 0) sh.getRange(row, i + 1).setValue(patch[k] === null ? '' : patch[k]);
  });
  return { ok: true };
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'create': return json_(create_(body.record));
      case 'update': return json_(update_(body.number, body.patch));
      case 'remove': {
        const sh = sheet_(PARTS), row = findRow_(sh, body.number);
        if (row !== -1) sh.deleteRow(row);
        return json_({ ok: true });
      }
      case 'addSub': return json_(addSub_(body.sub));
      case 'removeSub': {
        const s = body.sub, sh = sheet_(SUBS), values = sh.getDataRange().getValues();
        // bottom-up so deleting a row doesn't shift the ones still to check
        for (let i = values.length - 1; i >= 1; i--) {
          const r = values[i];
          if (String(r[0]) === s.sys && String(r[1]) === s.code && String(r[2]) === s.sub) sh.deleteRow(i + 1);
        }
        return json_({ ok: true });
      }
      case 'addAssembly': {
        const a = body.assembly;
        if (rows_(ASSEMBLIES).some(x => x.sys === a.sys && x.code === a.code)) return json_({ ok: false, reason: 'exists' });
        append_(ASSEMBLIES, a);
        return json_({ ok: true });
      }
      case 'import': {
        const results = body.ops.map(op =>
          op.type === 'update' ? update_(op.number, op.patch)
          : op.type === 'addSub' ? addSub_(op.sub)
          : create_(op.record));
        return json_({ ok: true, results: results });
      }
      default: return json_({ error: 'Unknown action ' + body.action });
    }
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
