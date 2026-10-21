// When each page syncs on its own (3BLD and Fridrich use the same plan, each with its own name). The server
// says how often it may happen («every», from api/ping): every minute with Redis, every 10 minutes with
// Vercel Blob's free tier, which counts each save. A change is not saved at once: it waits for the next turn
// (at least 20 s, to bundle a few), or for when you leave the page. Opening the page or coming back to it
// only reads, and saves only what is still unsaved. «Sincronizar ahora» always does both.
(function () {
  const MIN_WAIT = 20000;
  const LEAVE_GAP = 120000;
  const BACK_GAP = 60000;

  function create({ name, enabled, sync, gap }) {
    const kDirty = `${name}:sync-dirty:v1`;
    const kPushed = `${name}:sync-pushed:v1`;
    const get = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch (e) { return 0; } };
    const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } };
    let every = 600000;
    let edits = 0;
    let lastTry = 0;
    let timer = 0;
    let known = null;
    const learn = () => known || (known = Promise.resolve().then(gap).then((s) => { if (Number.isFinite(s) && s > 0) every = s * 1000; }, () => {}));

    const dirty = () => get(kDirty) > 0;
    async function schedule() {
      if (timer || !enabled() || !dirty()) return;
      await learn();
      if (timer) return;
      const wait = Math.max(MIN_WAIT, Math.max(get(kPushed), lastTry) + every - Date.now());
      timer = setTimeout(() => { timer = 0; if (dirty()) run('timer'); }, wait);
    }
    function run(why) {
      if (!enabled()) return null;
      lastTry = Date.now();
      learn();
      return sync(why);
    }
    document.addEventListener('visibilitychange', () => {
      if (!enabled()) return;
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        if (dirty() && now - get(kPushed) > LEAVE_GAP && now - lastTry > 30000) { clearTimeout(timer); timer = 0; run('leave'); }
      } else if (now - lastTry > BACK_GAP) run('back');
    });

    return {
      // Something that travels changed here.
      changed() {
        if (!enabled()) return;
        if (!dirty()) set(kDirty, Date.now());
        edits++;
        schedule();
      },
      // Inside a sync: whether to save after reading. Always when asked by hand or when the server has
      // nothing; otherwise only what is unsaved, and not more often than the server allows.
      shouldPush(why, manual, remoteEmpty) {
        if (manual || remoteEmpty) return true;
        if (!dirty()) return false;
        return why === 'timer' || why === 'leave' || Date.now() - get(kPushed) >= every - 1000;
      },
      mark: () => edits,
      pushed(mark) {
        set(kPushed, Date.now());
        // Everything is up: a turn planned for a change that this save already carried is not needed.
        if (mark === edits) { set(kDirty, 0); clearTimeout(timer); timer = 0; }
      },
      // After a sync, good or bad: if something is still unsaved, the next turn.
      done() { schedule(); },
      start(ms) { if (enabled()) setTimeout(() => run('open'), ms); },
      // Turning sync on or joining: everything here goes up in the first sync.
      reset() { set(kDirty, Date.now()); set(kPushed, 0); clearTimeout(timer); timer = 0; },
      info: () => ({ every, dirty: dirty(), pushed: get(kPushed), timer: !!timer, edits }),
    };
  }

  window.SyncPlan = { create };
})();
