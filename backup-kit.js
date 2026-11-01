/* =====================================================================
   backup-kit.js - Google Drive backup / restore page for the Finance and Members systems.
   - Uses the ONE Google connection that is made in the Offering System (window.parent.ChurchDriveShared).
     There is deliberately no "Connect to Google" button here.
   - Each system has its OWN folder (name locked after setup, identified by folder ID + a private marker),
     its OWN backup file, its OWN Auto Backup switch and its OWN local settings.
   - Restore is all-or-nothing and touches only this system's records.
   - Automatic backup runs while the app is open (the browser cannot run it after the page is closed);
     changes made offline are backed up as soon as the connection and Google authorisation are available again.
   ===================================================================== */
(function (global) {
  'use strict';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  function hash53(str) { var h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (var i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return 4294967296 * (2097151 & h2) + (h1 >>> 0); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function qEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function kerr(kind, msg) { var e = new Error(msg); e.kind = kind; return e; }
  function shared() { try { var p = global.parent; if (p && p !== global && p.ChurchDriveShared) return p.ChurchDriveShared; } catch (e) {} return null; }

  function mount(o) {
    var P = 'bk_' + o.system + '_', SKEY = 'churchBackup.' + o.system + '.settings.v1', LKEY = 'churchBackup.' + o.system + '.lock.v1';
    var DEFAULTS = { autoBackup: true, folderId: '', folderName: '', fileId: '', everBackedUp: false, lastBackupAt: 0, lastBackupBytes: 0, dirty: false };
    var st = { busy: null, msg: '', err: '', folderStatus: 'unknown', running: false, retries: 0, blocked: '', counter: 0 };
    var timers = { debounce: null, retry: null }, storageOk = true, lockMem = null;
    function loadSettings() { var s = {}, j = null; try { j = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { storageOk = false; } for (var k in DEFAULTS) s[k] = (j && typeof j[k] === typeof DEFAULTS[k]) ? j[k] : DEFAULTS[k]; return s; }
    var S = loadSettings();
    function getLock() { try { var l = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (l && l.name && l.id) return l; } catch (e) {} return lockMem; }
    function setLock(name, id, owner) { var p = getLock(); lockMem = { name: name, id: id, owner: owner !== undefined ? owner : ((p && p.owner) || ''), lockedAt: p ? p.lockedAt : Date.now() }; try { localStorage.setItem(LKEY, JSON.stringify(lockMem)); } catch (e) { storageOk = false; } }
    function save(patch, relink) {
      var l = getLock(), p = {}, k; for (k in patch) p[k] = patch[k];
      if (l) { if ('folderName' in p) p.folderName = l.name; if ('folderId' in p && !relink) p.folderId = l.id; }
      for (k in p) S[k] = p[k];
      try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { storageOk = false; }
    }
    (function enforce() { var l = getLock(); if (l && (S.folderName !== l.name || S.folderId !== l.id)) save({ folderName: l.name, folderId: l.id }, true); })();

    /* ---------- UI ---------- */
    if (!document.getElementById('bkKitCss')) {
      var css = document.createElement('style'); css.id = 'bkKitCss';
      css.textContent = '.bk-wrap{font-size:13px;line-height:1.5}.bk-wrap h3{margin:0 0 8px}.bk-st{padding:8px 10px;border-radius:8px;background:#f1f5f9;margin:6px 0;color:#334155}.bk-wrap input[type=text]{width:100%;padding:10px;margin:4px 0;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:14px}.bk-row{display:flex;gap:8px;align-items:center}.bk-row input{flex:1}.bk-btn{background:var(--primary,#059669);color:#fff;border:0;border-radius:8px;padding:11px 14px;font-weight:bold;cursor:pointer;font-size:14px}.bk-btn[disabled]{background:#94a3b8;cursor:default}.bk-btns{display:flex;gap:8px;margin:10px 0}.bk-btns .bk-btn{flex:1}.bk-ok{color:#047857;margin:6px 0}.bk-bad{color:#b91c1c;margin:6px 0}.bk-note{color:#64748b;font-size:12px;margin:4px 0}.bk-sw{position:relative;display:inline-block;width:52px;height:30px}.bk-sw input{opacity:0;width:0;height:0;margin:0}.bk-sw span{position:absolute;inset:0;background:#cbd5e1;border-radius:30px;transition:.2s;cursor:pointer}.bk-sw span:before{content:"";position:absolute;width:24px;height:24px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.bk-sw input:checked+span{background:var(--primary,#059669)}.bk-sw input:checked+span:before{transform:translateX(22px)}';
      document.head.appendChild(css);
    }
    var c = o.container;
    c.innerHTML = '<div class="bk-wrap"><h3>Backup - ' + esc(o.label) + '</h3><div class="bk-st" id="' + P + 'st"></div>' +
      '<div id="' + P + 'folderBox"><label style="font-weight:bold">Backup folder name</label><div class="bk-row"><input type="text" id="' + P + 'folderIn" maxlength="100" placeholder="' + esc(o.defaultFolderName) + '" autocomplete="off"><button type="button" class="bk-btn" id="' + P + 'saveFolder">Save Folder</button></div><div class="bk-note" id="' + P + 'folderNote"></div></div>' +
      '<div class="bk-row" style="margin:12px 0;justify-content:space-between"><b>Auto Backup is <span id="' + P + 'autoState"></span></b><label class="bk-sw"><input type="checkbox" id="' + P + 'auto" aria-label="Auto Backup"><span></span></label></div>' +
      '<div class="bk-btns"><button type="button" class="bk-btn" id="' + P + 'backup">Backup now</button><button type="button" class="bk-btn" id="' + P + 'restore" style="background:#475569">Restore</button></div>' +
      '<div class="bk-ok" id="' + P + 'msg" role="status"></div><div class="bk-bad" id="' + P + 'err" role="alert"></div><div class="bk-note" id="' + P + 'last"></div></div>';
    var $ = function (id) { return document.getElementById(P + id); };

    function setMsg(m) { st.msg = m || ''; st.err = ''; paint(); }
    function setErr(m) { st.err = m || ''; st.msg = ''; paint(); if (m && o.toast) o.toast(m, true); }
    function connected() { var s = shared(); return !!(s && s.isConnected()); }
    function paint() {
      var s = shared(), conn = connected(), l = getLock(), ready = conn && !!S.folderId && st.folderStatus !== 'missing';
      $('st').innerHTML = !s ? 'Google Drive is managed from the <b>Offering System</b>. Open this page from inside the Offering System to back up or restore. Your records stay on this device.'
        : conn ? '✅ Google Drive connected' + (s.email() ? ' as <b>' + esc(s.email()) + '</b>' : '') + ' (the same connection as the Offering System).'
        : '❌ Google Drive is not connected, or its authorisation expired. Connect from the <b>Offering System</b> (Backup page → Connect to Google). Your records are safe on this device and will be backed up after you connect.';
      var fi = $('folderIn');
      if (l) { fi.value = l.name; fi.readOnly = true; fi.style.background = '#f1f5f9'; } else { fi.readOnly = false; fi.style.background = ''; }
      var missing = !!l && st.folderStatus === 'missing';
      $('saveFolder').style.display = (!l || (missing && conn)) ? '' : 'none'; $('saveFolder').textContent = l ? 'Reconnect Folder' : 'Save Folder'; $('saveFolder').disabled = !!st.busy || !conn;
      $('folderNote').textContent = l ? ('🔒 Folder “' + l.name + '” is locked and used for this system only.' + (missing ? ' ⚠️ It is not accessible right now — tap Reconnect Folder to look for a folder with the same name.' : '')) : (conn ? 'Enter a folder name and tap Save Folder. It can be saved only once and is then locked.' : 'Connect Google Drive in the Offering System first.');
      $('auto').checked = !!S.autoBackup; $('autoState').textContent = S.autoBackup ? 'ON' : 'OFF';
      $('backup').disabled = !!st.busy || !ready; $('restore').disabled = !!st.busy || !ready;
      $('msg').textContent = st.msg; $('err').textContent = st.err;
      $('last').textContent = (S.lastBackupAt ? 'Last backup: ' + new Date(S.lastBackupAt).toLocaleString() + (S.lastBackupBytes ? ' (' + Math.round(S.lastBackupBytes / 1024) + ' KB)' : '') : 'No backup made from this device yet.') + (S.dirty ? ' · Changes waiting to be backed up.' : '') + (st.blocked ? ' · Automatic backup is paused: ' + st.blocked : '') + (storageOk ? '' : ' · ⚠️ Settings cannot be saved on this device.');
    }

    /* ---------- Drive helpers (all calls go through the shared Offering System connection) ---------- */
    function dj(path, options) { var s = shared(); if (!s) throw kerr('noshared', 'Google Drive is not available here.'); return s.json(s.apiUrl(s.apiBase, path), options); }
    function folderInfo(id) { return dj('/files/' + encodeURIComponent(id) + '?fields=id,name,mimeType,trashed,appProperties,capabilities(canAddChildren)'); }
    async function folderUsable(id) {
      try { var f = await folderInfo(id); return f.mimeType === FOLDER_MIME && !f.trashed && !(f.capabilities && f.capabilities.canAddChildren === false); }
      catch (e) { if (e && (e.status === 404 || e.status === 403)) return false; throw e; }
    }
    async function listPaged(q, fields) {
      var out = [], tok = '', g = 0;
      do { var j = await dj('/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('nextPageToken,files(' + fields + ')') + '&pageSize=100&spaces=drive' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '')); out = out.concat(j.files || []); tok = j.nextPageToken || ''; } while (tok && ++g < 20);
      return out;
    }
    function regProps() { var p = {}; p[o.regKey] = '1'; return p; }
    async function stamp(id) { try { var f = await folderInfo(id); if (f.appProperties && f.appProperties[o.regKey] === '1') return; await dj('/files/' + encodeURIComponent(id) + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appProperties: regProps() }) }); } catch (e) {} }
    async function createFolder(name) { return dj('/files?fields=id,name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, mimeType: FOLDER_MIME, appProperties: regProps() }) }); }
    /* finds a folder of THIS system only (private marker), never another system's folder */
    async function findOwnFolder(name) {
      var q = "mimeType='" + FOLDER_MIME + "' and trashed=false and appProperties has { key='" + o.regKey + "' and value='1' }" + (name ? " and name='" + qEsc(name) + "'" : '');
      var list = await listPaged(q, 'id,name,createdTime,capabilities(canAddChildren)');
      list = list.filter(function (f) { return !(f.capabilities && f.capabilities.canAddChildren === false); });
      list.sort(function (a, b) { return String(a.createdTime).localeCompare(String(b.createdTime)); });
      return list[0] || null;
    }
    async function nameTakenByOther(name) { var list = await listPaged("mimeType='" + FOLDER_MIME + "' and trashed=false and name='" + qEsc(name) + "'", 'id,appProperties'); return list.some(function (f) { return !(f.appProperties && f.appProperties[o.regKey] === '1'); }); }
    function adopt(f) { save({ folderId: f.id, folderName: f.name, fileId: '', everBackedUp: false }, true); setLock(f.name, f.id, (shared() && shared().email()) || ''); st.folderStatus = 'ok'; stamp(f.id); }

    async function onConnectedChange() {
      paint();
      if (!connected()) return;
      try {
        var l = getLock();
        if (!l) { var f = await findOwnFolder(''); if (f) { adopt(f); setMsg('Your saved backup folder “' + f.name + '” was found and is ready — nothing new was created.'); } else paint(); }
        else {
          var s = shared(), own = l.owner;
          if (!own && s && s.email()) { setLock(l.name, l.id, s.email()); own = s.email(); }
          st.folderStatus = (await folderUsable(l.id)) ? 'ok' : 'missing';
          if (st.folderStatus === 'ok') stamp(l.id); else if (own && s && s.email() && own !== s.email()) setErr('This device’s folder belongs to ' + own + '. Connect with that account in the Offering System.');
          paint();
        }
      } catch (e) { setErr('Could not check the backup folder: ' + (e && e.message ? e.message : e) + ' No folder was created.'); }
      scheduleAuto(0);
    }

    /* ---------- folder setup ---------- */
    async function saveFolder() {
      if (st.busy || !connected()) return;
      var l = getLock(), name = l ? l.name : $('folderIn').value.replace(/\s+/g, ' ').trim();
      if (!l && (!name || name.length > 100 || /[\u0000-\u001f]/.test(name))) { setErr('Enter a folder name of 1 to 100 characters.'); return; }
      st.busy = 'folder'; paint();
      try {
        if (l) {
          if (await folderUsable(S.folderId)) { st.folderStatus = 'ok'; setMsg('The locked folder is accessible. Nothing needs to change.'); return; }
          if (!(await o.ask('The locked backup folder “' + l.name + '” was deleted or cannot be accessed. Look for a folder with the same name, and create it only if none exists?', 'Reconnect folder'))) { setMsg('Nothing was created.'); return; }
        } else if (!(await o.ask('Lock the backup folder name “' + name + '”? After this it cannot be changed, renamed or replaced from the app.', 'Save and lock'))) { setMsg('Folder not saved.'); return; }
        var f = await findOwnFolder(name), created = false;
        if (!f) {
          if (await nameTakenByOther(name)) { setErr('A folder named “' + name + '” already belongs to another system’s backups. Choose a different name.'); return; }
          f = await createFolder(name); created = true;
        }
        var changed = f.id !== S.folderId;
        save({ folderId: f.id, folderName: name, fileId: changed ? '' : S.fileId, everBackedUp: changed ? false : S.everBackedUp }, true);
        setLock(name, f.id, (shared() && shared().email()) || ''); st.folderStatus = 'ok'; st.blocked = '';
        if (!created) stamp(f.id);
        setMsg((created ? 'Folder “' + name + '” created, saved and locked.' : 'Existing folder “' + name + '” found, saved and locked.'));
      } catch (e) { setErr('Saving the folder failed: ' + (e && e.message ? e.message : e)); }
      finally { st.busy = null; paint(); scheduleAuto(0); }
    }

    /* ---------- backup ---------- */
    async function guardFolder() {
      var l = getLock();
      if (!l || S.folderId !== l.id) throw kerr('folder', 'No locked backup folder is set for this system.');
      var s = shared(); if (l.owner && s && s.email() && l.owner !== s.email()) throw kerr('folder', 'This device’s folder belongs to ' + l.owner + ', but you are connected as ' + s.email() + '. Nothing was backed up.');
      if (!(await folderUsable(S.folderId))) { st.folderStatus = 'missing'; throw kerr('folder', 'The locked backup folder “' + l.name + '” is not accessible. No new folder was created. Tap Reconnect Folder.'); }
      st.folderStatus = 'ok';
    }
    async function remoteFile() {
      var list = await listPaged("'" + qEsc(S.folderId) + "' in parents and name='" + qEsc(o.backupFileName) + "' and trashed=false", 'id,size,modifiedTime');
      list.sort(function (a, b) { return String(b.modifiedTime).localeCompare(String(a.modifiedTime)); });
      return list[0] || null;
    }
    async function doBackup(manual) {
      if (st.running) return false;
      if (!connected()) throw kerr('auth', 'Google Drive is not connected.');
      st.running = true; var startCounter = st.counter;
      try {
        await guardFolder();
        var remote = await remoteFile();
        if (remote && !S.everBackedUp) {
          if (!manual) { st.blocked = 'a backup from another device already exists in this folder. Use Backup now to replace it, or Restore.'; paint(); return false; }
          if (!(await o.ask('This folder already contains a backup (maybe from another device). Replace it with the records on THIS device?', 'Replace backup'))) { setMsg('Backup cancelled. The existing Google Drive backup was not changed.'); return false; }
        }
        var snap = await o.readSnapshot(), dataJson = JSON.stringify(snap.data), now = Date.now();
        var head = JSON.stringify({ format: o.formatName, formatVersion: 1, system: o.system, createdAt: new Date(now).toISOString(), createdAtMs: now, counts: snap.counts, checksum: hash53(dataJson) });
        var text = head.slice(0, -1) + ',"data":' + dataJson + '}', blob = new Blob([text]), bytes = blob.size, b = 'bk' + now.toString(36);
        var meta = { name: o.backupFileName, mimeType: 'application/json', appProperties: { system: o.system, snapshotTime: String(now) } };
        if (!remote) meta.parents = [S.folderId];
        var body = new Blob(['--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n', blob, '\r\n--' + b + '--']);
        var s = shared(), url = s.apiUrl(s.uploadBase, '/files' + (remote ? '/' + encodeURIComponent(remote.id) : '') + '?uploadType=multipart&fields=id,size');
        var res = await s.fetch(url, { method: remote ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body, timeoutMs: Math.min(600000, Math.max(30000, Math.ceil(bytes / 40000) * 1000)) });
        var m = await res.json();
        if (!m || !m.id || (m.size !== undefined && Number(m.size) !== bytes)) throw kerr('verify', 'Google Drive did not confirm the upload, so the backup is NOT counted as done.');
        save({ fileId: m.id, everBackedUp: true, lastBackupAt: now, lastBackupBytes: bytes, dirty: st.counter !== startCounter }); st.blocked = ''; st.retries = 0;
        setMsg('Backup completed (' + Math.round(bytes / 1024) + ' KB) at ' + new Date(now).toLocaleTimeString() + '.');
        return true;
      } finally { st.running = false; paint(); }
    }
    async function manualBackup() {
      if (st.busy) return; st.busy = 'backup'; paint(); setMsg('Backing up…');
      try { await doBackup(true); } catch (e) { setErr('Backup failed: ' + (e && e.message ? e.message : e) + ' Your records on this device are unchanged.'); }
      finally { st.busy = null; paint(); }
    }

    /* ---------- restore (all-or-nothing, this system only) ---------- */
    async function doRestore() {
      if (st.busy) return; st.busy = 'restore'; paint(); setMsg('Reading the backup…');
      try {
        await guardFolder();
        var remote = await remoteFile(); if (!remote) { setErr('No backup file was found in this system’s folder.'); return; }
        var s = shared(), res = await s.fetch(s.apiUrl(s.apiBase, '/files/' + encodeURIComponent(remote.id) + '?alt=media')), text = await res.text(), b;
        try { b = JSON.parse(text); } catch (e) { throw kerr('invalid', 'The backup file is not readable (it may be damaged).'); }
        if (!b || b.format !== o.formatName || b.system !== o.system) throw kerr('invalid', 'This file is not a ' + o.label + ' backup, so nothing was restored.');
        if (b.formatVersion !== 1 || !b.data || typeof b.data !== 'object') throw kerr('invalid', 'The backup format is not supported. Nothing was restored.');
        if (hash53(JSON.stringify(b.data)) !== b.checksum) throw kerr('invalid', 'The backup failed its integrity check (damaged or edited). Nothing was restored.');
        o.validate(b.data);
        var counts = Object.keys(b.counts || {}).map(function (k) { return b.counts[k] + ' ' + k; }).join(', ');
        if (!(await o.ask('Replace ALL ' + o.label + ' records on this device with the backup from ' + new Date(b.createdAtMs).toLocaleString() + ' (' + counts + ')? This cannot be undone. Other systems are not affected.', 'Restore'))) { setMsg('Restore cancelled. Nothing was changed.'); return; }
        await o.applyRestore(b.data);                                        /* single transaction: all or nothing */
        var after = await o.readSnapshot(), ok = Object.keys(b.counts || {}).every(function (k) { return after.counts[k] === b.counts[k]; });
        save({ everBackedUp: true, fileId: remote.id, dirty: false }); if (o.afterRestore) await o.afterRestore();
        if (ok) setMsg('Restore complete and verified: ' + counts + '.'); else setErr('Restore finished but the record counts do not match the backup. Please check your data.');
      } catch (e) { setErr('Restore failed: ' + (e && e.message ? e.message : e) + ' Your existing records were not changed.'); }
      finally { st.busy = null; paint(); }
    }

    /* ---------- automatic backup (while the app is open) ---------- */
    function scheduleAuto(ms) { clearTimeout(timers.debounce); timers.debounce = setTimeout(runAuto, ms); }
    async function runAuto() {
      if (!S.autoBackup || !S.dirty || st.running || st.busy || st.blocked || !getLock() || !connected() || navigator.onLine === false || st.folderStatus === 'missing') return;
      try { await doBackup(false); }
      catch (e) {
        if (e && (e.kind === 'folder')) { st.blocked = e.message; setErr('Automatic backup paused: ' + e.message); return; }
        st.retries++; setErr('Automatic backup failed: ' + (e && e.message ? e.message : e) + (st.retries <= 3 ? ' Retrying…' : ' It will try again after your next change or when you reconnect.'));
        if (st.retries <= 3) { clearTimeout(timers.retry); timers.retry = setTimeout(function () { runAuto(); }, [15000, 60000, 300000][st.retries - 1]); }
      }
    }
    function notifyChange() { st.counter++; save({ dirty: true }); paint(); st.retries = 0; scheduleAuto(1500); }   /* short pause only to group a burst of saves into one backup */

    /* ---------- wiring ---------- */
    $('saveFolder').addEventListener('click', saveFolder);
    $('backup').addEventListener('click', manualBackup);
    $('restore').addEventListener('click', doRestore);
    $('auto').addEventListener('change', function () { save({ autoBackup: $('auto').checked }); st.blocked = ''; paint(); if (o.toast) o.toast('Auto Backup ' + (S.autoBackup ? 'ON' : 'OFF')); if (S.autoBackup) scheduleAuto(0); });
    try { if (global.parent && global.parent !== global) global.parent.addEventListener('church-drive-state', function () { onConnectedChange(); }); } catch (e) {}
    global.addEventListener('online', function () { st.retries = 0; scheduleAuto(0); });
    paint(); onConnectedChange();
    return { notifyChange: notifyChange, refresh: onConnectedChange, settings: function () { return S; }, state: function () { return st; } };
  }
  global.ChurchBackupKit = { mount: mount, hash53: hash53 };
})(window);
