const DB = 'payround_outbox';
const STORE = 'jobs';
const CH = 'payround-outbox';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allJobs() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const q = tx.objectStore(STORE).getAll();
    q.onsuccess = () => resolve(q.result || []);
    q.onerror = () => reject(q.error);
  });
}

async function putJob(job) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(job);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function delJob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function ping() {
  try { window.dispatchEvent(new CustomEvent(CH)); } catch {}
}

export function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = String(err?.message || err || '');
  return /failed to fetch|networkerror|network request failed|load failed|offline|err_internet|fetch/i.test(m);
}

export async function enqueueWrite({ table, op, row, match }) {
  const job = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    table,
    op: op || 'insert',
    row,
    match: match || null,
    createdAt: Date.now(),
  };
  await putJob(job);
  ping();
  return job;
}

export async function pendingCount() {
  try { return (await allJobs()).length; } catch { return 0; }
}

export async function flushOutbox() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { sent: 0, left: await pendingCount() };
  let jobs = [];
  try { jobs = await allJobs(); } catch { return { sent: 0, left: 0 }; }
  if (!jobs.length) return { sent: 0, left: 0 };
  const { supabase } = await import('@/lib/supabase');
  let sent = 0;
  for (const job of jobs.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      let res;
      if (job.op === 'update' && job.match?.col) {
        res = await supabase.from(job.table).update(job.row).eq(job.match.col, job.match.val);
      } else {
        res = await supabase.from(job.table).insert(job.row);
      }
      if (res.error) {
        if (isOfflineError(res.error)) break;
        // permanent-ish failure: drop so we don't loop forever
        await delJob(job.id);
        continue;
      }
      await delJob(job.id);
      sent += 1;
    } catch (e) {
      if (isOfflineError(e)) break;
      await delJob(job.id);
    }
  }
  ping();
  return { sent, left: await pendingCount() };
}

/** Try a write now. If the device is offline (or the network dies), save it and send later. */
export async function writeWhenOnline({ table, op = 'insert', row, match }) {
  const tryNow = async () => {
    const { supabase } = await import('@/lib/supabase');
    if (op === 'update' && match?.col) {
      return supabase.from(table).update(row).eq(match.col, match.val);
    }
    return supabase.from(table).insert(row);
  };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueWrite({ table, op, row, match });
    return { queued: true, error: null };
  }
  try {
    const { error } = await tryNow();
    if (!error) return { queued: false, error: null };
    if (isOfflineError(error)) {
      await enqueueWrite({ table, op, row, match });
      return { queued: true, error: null };
    }
    return { queued: false, error };
  } catch (e) {
    if (isOfflineError(e)) {
      await enqueueWrite({ table, op, row, match });
      return { queued: true, error: null };
    }
    return { queued: false, error: e };
  }
}

let started = false;
export function startOutboxWatcher() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = () => { flushOutbox().catch(() => {}); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  setInterval(run, 20000);
  run();
}
