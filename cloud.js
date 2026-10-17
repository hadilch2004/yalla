'use strict';
/* Yalla cloud layer. Connects the app to Supabase (real accounts, shared data, live updates).

   It is switched on by putting a project URL and key in config.js. Without them this file does nothing and the app
   keeps running on its demo data in the browser.

   How it works: app.js keeps its data in one in-memory object (`db`) and draws screens from it. This file fills that
   object from the server (everything the database rules allow the signed-in person to see), keeps it fresh (polling,
   plus realtime when available) and sends each action to the right table. The database rules, not this file, decide
   who may read or write what (see supabase/migrations/001_schema.sql). */
(() => {
  const CFG = (() => {
    const base = window.YALLA_CONFIG || {};
    let dev = null; // trying a local test backend: only honoured on this computer
    try { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) dev = JSON.parse(localStorage.getItem('yalla.dev.config') || 'null'); } catch { /* ignore */ }
    return { ...base, ...(dev || {}) };
  })();
  // a link ending in ?demo opens the full demo (sample students, no sign-up, everything stays in the visitor's browser)
  const demoLink = /[?&]demo(=|&|$)/.test(location.search);
  if (demoLink || !CFG.supabaseUrl || !CFG.supabaseKey || !window.supabase) { window.Cloud = { enabled: false }; return; }

  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'yalla.auth' },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  const MIN = 60e3, HR = 36e5, DAY = 864e5;
  const storageBase = `${CFG.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/`;
  const isPhotoUrl = p => typeof p === 'string' && p.length < 300 && p.startsWith(storageBase) && /^[\w:/.%~-]+$/.test(p);
  const pubUrl = (bucket, path) => (path ? `${storageBase}${bucket}/${String(path).split('/').map(encodeURIComponent).join('/')}` : null);
  const iso = ms => new Date(ms).toISOString();
  const PUB = 'id, kind, name, major, year, grad_year, bio, color, photo_path, show_taste, fav_spots, interests, category, summary, meets, is_creator, club_approved, butterfly, met_count, created_at';
  const MSG = 'id, hangout_id, club_id, to_user, sender, body, sticker, sys, created_at';

  let A = null;            // the app's view of itself, handed over by bind()
  let authId = null;       // who is signed in (a student, or a club's own login)
  let authEmail = '';
  let started = false, pollTimer = null, channel = null, tick = 0, pulling = null, again = false;
  const knownMsg = new Set(), knownNotif = new Set(), seenHangouts = new Set();
  let msgCursor = null, firstPull = true, saveTimer = null, lastSaved = '', locTimer = null, lastPub = 0, pendingLoc = null;

  const must = r => { if (r.error) throw r.error; return r.data; };
  const friendly = e => {
    const m = String(e?.message || e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection. Check your internet and try again.';
    if (/row-level security|permission denied/i.test(m)) return "That isn't allowed.";
    if (/full/i.test(m)) return 'This hangout is full.';
    if (/Besties are limited/i.test(m)) return m;
    if (/Ghost mode/i.test(m)) return 'Turn off ghost mode first.';
    if (/Outside campus/i.test(m)) return 'You look off campus, so nobody sees a location.';
    if (/duplicate key/i.test(m)) return 'Already done.';
    return m || 'Something went wrong.';
  };
  const fail = (e, what) => { console.warn('[cloud]', what, e); A?.toast(`<span style="font-size:22px">⚠️</span><span>Couldn't ${what}<small>${A.esc(friendly(e))}</small></span>`, 5200); return false; };
  const me0 = () => A.db.users.find(u => u.id === authId) || null; // the real signed-in account (even while acting as a club)

  // ───────────────────────── mapping: server rows -> the app's own shapes
  function mapUser(r) {
    const club = r.kind === 'club';
    const u = {
      id: r.id, name: r.name, type: club ? 'club' : undefined, major: r.major || '', year: r.year || '', gradYear: r.grad_year || null,
      bio: r.bio || '', color: r.color || '#ff7eb3', photoPath: r.photo_path || null, photo: pubUrl('avatars', r.photo_path),
      showTaste: r.show_taste !== false, favSpots: r.fav_spots || [], interests: r.interests || [],
      category: r.category || '', summary: r.summary || '', meets: r.meets || '', verified: !!r.club_approved,
      isCreator: !!r.is_creator, butterfly: !!r.butterfly, metCount: r.met_count || 0,
      besties: [], following: [], blocked: [], hidden: [], visits: [], days: [], prefs: null, views: [],
      shareLoc: false, loc: null, nearAlerts: true, alerts: true, bot: false, createdAt: Date.parse(r.created_at) || 0,
    };
    if (club) Object.assign(u, { admins: [], roles: {}, members: [], requests: [], posts: [], sugs: [], gallery: [], nFollowers: 0, nMembers: 0 });
    return u;
  }
  const mapMsg = r => ({
    id: r.id, from: r.sender, ts: Date.parse(r.created_at) || Date.now(),
    ...(r.sys ? { sys: true, text: r.body } : r.sticker ? { sticker: r.body } : { text: r.body }),
  });
  const chatKey = r => (r.hangout_id ? 'h:' + r.hangout_id : r.club_id ? 'c:' + r.club_id : A.dmKey(r.sender, r.to_user));
  const NOTIF_KINDS = new Set(['going', 'bestie_req', 'bestie_ok', 'req', 'accepted', 'collab', 'collabok', 'follow', 'sug']);

  // ───────────────────────── reading what the signed-in person may see
  // The data comes in four parts, each refreshed at its own pace so a free plan's data allowance lasts:
  //   people  profiles, besties, follows, blocks, club members and counts   every 5 minutes, and after your own changes
  //   events  hangouts, who is going, co-hosts                              when a tiny server fingerprint changes
  //   club    news, ideas, votes, gallery                                   every minute, and after your own changes
  //   me      private settings, visitors, active days                       every minute
  // Messages, positions and notifications are small, so only what is new is read every few seconds.
  const raw = {};
  const PARTS = ['people', 'events', 'club', 'me'];
  let stamp = '', lastPeople = 0, notifCursor = null;
  const FETCH = {
    people: async () => {
      lastPeople = Date.now();
      const [profiles, besties, follows, blocks, cmembers, ccounts] = (await Promise.all([
        sb.from('profiles').select(PUB).limit(3000),
        sb.from('besties').select('user_id, friend_id'),
        sb.from('follows').select('user_id, club_id'),
        sb.from('blocks').select('blocked'),
        sb.from('club_members').select('club_id, user_id, status, is_head, role'),
        sb.rpc('club_counts'),
      ])).map(must);
      return { profiles, besties, follows, blocks, cmembers, ccounts };
    },
    events: async () => {
      const since = iso(Date.now() - 3 * DAY);
      const [hangouts, cohosts, members, counts, st] = (await Promise.all([
        sb.from('hangouts').select('id, host, by_user, club, act, title, place, lat, lng, where_text, starts_at, max_people, description, created_at').gte('starts_at', since).order('starts_at').limit(500),
        sb.from('cohosts').select('hangout_id, club_id, status'),
        sb.from('hangout_members').select('hangout_id, user_id').limit(5000),
        sb.rpc('hangout_counts'),
        sb.rpc('events_stamp'),
      ])).map(must);
      stamp = st;
      return { hangouts, cohosts, members, counts };
    },
    club: async () => {
      const [posts, sugs, votes, gallery] = (await Promise.all([
        sb.from('club_posts').select('id, club_id, by_user, body, hangout_id, created_at').order('created_at', { ascending: false }).limit(300),
        sb.from('club_suggestions').select('id, club_id, from_user, body, status, created_at').order('created_at', { ascending: false }).limit(300),
        sb.from('suggestion_votes').select('suggestion_id, user_id').limit(3000),
        sb.from('club_gallery').select('id, club_id, path, caption, created_at').order('created_at', { ascending: false }).limit(300),
      ])).map(must);
      return { posts, sugs, votes, gallery };
    },
    me: async () => {
      const [settings, priv, views, activity] = (await Promise.all([
        sb.rpc('my_settings'),
        sb.from('private_data').select('prefs, visits, trail, misc').maybeSingle(),
        sb.from('profile_views').select('viewer, n, last_at').order('last_at', { ascending: false }).limit(100),
        sb.from('daily_activity').select('day').gte('day', new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10)),
      ])).map(must);
      return { settings, priv, views, activity };
    },
  };

  // builds the app's own objects (users, hangouts) from the latest rows
  function assemble() {
    const { profiles, besties, follows, blocks, cmembers, ccounts, hangouts, cohosts, members, counts, posts, sugs, votes, gallery, settings, priv, views, activity } = raw;
    const prev = new Map(A.db.users.map(u => [u.id, u]));
    const byId = new Map(profiles.map(r => [r.id, mapUser(r)]));
    const me = byId.get(authId);
    if (!me) throw new Error('Your profile was not found. Try logging in again.');
    const old = prev.get(authId); // runtime state that only lives on this device
    me.email = authEmail;
    Object.assign(me, {
      shareLoc: !!settings?.share_loc, precise: settings?.precise !== false, privateBrowsing: !!settings?.private_browsing,
      nearAlerts: settings?.near_alerts !== false, alerts: settings?.alerts !== false,
    });
    me.prefs = priv?.prefs || null; me.visits = priv?.visits || []; me.trail = priv?.trail || [];
    Object.assign(me, priv?.misc || {});
    me.days = activity.map(x => x.day);
    me.views = views.map(v => ({ by: v.viewer, ts: Date.parse(v.last_at), n: v.n }));
    if (old) { me.live = old.live; me.loc = old.loc; me.status = old.status ?? me.status; me.seenAt = old.seenAt ?? me.seenAt; me.viewsSeenAt = old.viewsSeenAt ?? me.viewsSeenAt; me.hidden = old.hidden?.length >= (me.hidden || []).length ? old.hidden : me.hidden; me.prefs = old.prefs || me.prefs; me.visits = old.visits?.length ? old.visits : me.visits; me.trail = old.trail?.length ? old.trail : me.trail; me.remix = old.remix ?? me.remix; me.badgeSeen = old.badgeSeen ?? me.badgeSeen; me.alumniSeen = old.alumniSeen ?? me.alumniSeen; }

    besties.forEach(e => {
      if (e.user_id === authId) me.besties.push(e.friend_id);
      else if (e.friend_id === authId) byId.get(e.user_id)?.besties.push(authId); // they added me
    });
    follows.forEach(e => byId.get(e.user_id)?.following.push(e.club_id)); // mine, and (for a club) its followers
    blocks.forEach(b => me.blocked.push(b.blocked));
    cmembers.forEach(m => {
      const c = byId.get(m.club_id);
      if (!c?.admins) return;
      if (m.status === 'pending') c.requests.push(m.user_id);
      else if (m.is_head) { c.admins.push(m.user_id); c.roles[m.user_id] = m.role || 'Head'; }
      else c.members.push(m.user_id);
    });
    ccounts.forEach(c => { const u = byId.get(c.club_id); if (u) { u.nFollowers = c.followers; u.nMembers = c.members; } });
    posts.forEach(p => byId.get(p.club_id)?.posts?.push({ id: p.id, ts: Date.parse(p.created_at), by: p.by_user, text: p.body, hangoutId: p.hangout_id }));
    const sugById = new Map();
    sugs.forEach(s => { const o = { id: s.id, ts: Date.parse(s.created_at), from: s.from_user, text: s.body, status: s.status, votes: [] }; sugById.set(s.id, o); byId.get(s.club_id)?.sugs?.push(o); });
    votes.forEach(v => sugById.get(v.suggestion_id)?.votes.push(v.user_id));
    gallery.forEach(g => byId.get(g.club_id)?.gallery?.push({ id: g.id, img: pubUrl('gallery', g.path), cap: g.caption, ts: Date.parse(g.created_at), path: g.path }));

    const memBy = new Map();
    members.forEach(m => { (memBy.get(m.hangout_id) || memBy.set(m.hangout_id, []).get(m.hangout_id)).push(m.user_id); });
    const nBy = new Map(counts.map(c => [c.hangout_id, c.n]));
    const coBy = new Map();
    cohosts.forEach(c => { (coBy.get(c.hangout_id) || coBy.set(c.hangout_id, []).get(c.hangout_id)).push({ club: c.club_id, status: c.status }); });
    const unknown = new Set();
    const hs = hangouts.map(h => {
      const list = memBy.get(h.id) || [];
      [h.host, h.by_user, ...list].forEach(id => { if (id && !byId.has(id)) unknown.add(id); });
      return {
        id: h.id, host: h.host, by: h.by_user, club: h.club, act: h.act, title: h.title, place: h.place, where: h.where_text || '',
        lat: h.lat, lng: h.lng, when: Date.parse(h.starts_at), max: h.max_people, desc: h.description || '', createdAt: Date.parse(h.created_at),
        // the host is always listed first (a club too, as in the demo); clubs that accepted to co-host come after it
        members: [...new Set([h.host, ...(coBy.get(h.id) || []).filter(c => c.status === 'accepted').map(c => c.club), ...list])].filter(id => byId.has(id)),
        n: nBy.get(h.id) ?? list.length, cohosts: coBy.get(h.id) || [],
      };
    });

    const actingId = A.me && A.me.id !== authId ? A.me.id : null;
    A.db.users = [...byId.values()];
    A.db.hangouts = hs;
    A.me = (actingId && byId.get(actingId)) || me;
    applyLocations();
    // somebody new showed up (they just signed up): fetch the people list now instead of waiting for the slow timer
    if (unknown.size && Date.now() - lastPeople > 20e3) setTimeout(() => pull('fast', ['people']), 50);
  }

  async function pullLocations() { raw.locations = must(await sb.from('locations').select('user_id, lat, lng, acc, place, note, expires_at, updated_at')); }
  function applyLocations() {
    const rows = raw.locations || [];
    const live = new Map(rows.filter(r => r.user_id !== authId && Date.parse(r.expires_at) > Date.now()).map(r => [r.user_id, r]));
    A.db.users.forEach(u => {
      if (u.id === authId) return;
      const r = live.get(u.id);
      if (!r) { u.loc = null; u.shareLoc = false; return; }
      u.shareLoc = true; u.status = r.note || ''; u.loc = { place: r.place, lat: r.lat, lng: r.lng, trail: [], ts: Date.parse(r.updated_at), acc: r.acc };
    });
    // my own row only matters when this device has no live position of its own yet (after a reload)
    const mine = rows.find(r => r.user_id === authId), self = me0();
    if (self && mine && !self.loc && self.shareLoc && Date.parse(mine.expires_at) > Date.now()) {
      self.loc = { place: mine.place, lat: mine.lat, lng: mine.lng, trail: [], ts: Date.parse(mine.updated_at), acc: mine.acc };
    }
  }

  // notifications: everything on the first read, then only what is new
  async function pullNotifications() {
    let q = sb.from('notifications').select('id, kind, data, created_at').order('created_at', { ascending: false }).limit(80);
    if (notifCursor && !firstPull) q = q.gt('created_at', notifCursor);
    const rows = must(await q);
    raw.notifs = [...rows, ...(firstPull ? [] : raw.notifs || [])].slice(0, 150);
    if (rows[0] && (!notifCursor || rows[0].created_at > notifCursor)) notifCursor = rows[0].created_at;
  }
  function applyNotifications() {
    const fresh = [];
    // ignore anything from people I cannot see any more (blocked, or their account is gone)
    const events = (raw.notifs || []).filter(n => NOTIF_KINDS.has(n.kind) && (!n.data?.from || A.user(n.data.from))).map(n => ({
      id: n.id, ts: Date.parse(n.created_at), kind: n.kind, to: authId, userId: n.data?.from, hangoutId: n.data?.hangout || undefined, host: !!n.data?.host, server: true,
    }));
    events.forEach(e => { if (!knownNotif.has(e.id)) { knownNotif.add(e.id); if (!firstPull) fresh.push(e); } });
    const keep = A.db.events.filter(e => !e.server);
    A.db.events = [...events, ...keep].sort((a, b) => b.ts - a.ts).slice(0, 150);
    fresh.reverse().forEach(e => {
      A.toast(A.evToast(e), 6500, e.hangoutId ? { a: 'openHangout', id: e.hangoutId } : e.userId ? { a: 'person', id: e.userId } : null);
    });
  }

  async function pullMessages() {
    let q = sb.from('messages').select(MSG).order('created_at', { ascending: false }).limit(firstPull ? 800 : 200);
    if (msgCursor && !firstPull) q = q.gte('created_at', msgCursor);
    const rows = must(await q).reverse();
    const touched = new Set();
    rows.forEach(r => {
      if (knownMsg.has(r.id)) return;
      knownMsg.add(r.id);
      const key = chatKey(r);
      (A.db.chats[key] ||= []).push(mapMsg(r));
      touched.add(key);
      if (!msgCursor || r.created_at > msgCursor) msgCursor = r.created_at;
    });
    touched.forEach(k => A.db.chats[k].sort((a, b) => a.ts - b.ts));
    return touched;
  }

  // has anything changed in the events I can see? One tiny request instead of four big ones.
  async function eventsChanged() {
    const st = must(await sb.rpc('events_stamp'));
    return st !== stamp;
  }

  // pull('fast') reads what is new; pull('all') reads everything; pull('fast', ['events']) also refreshes named parts
  const wanted = new Set();
  async function pull(kind = 'fast', parts = []) {
    if (!authId || !A) return;
    parts.forEach(p => wanted.add(p));
    if (kind === 'all') PARTS.forEach(p => wanted.add(p));
    if (pulling) { again = true; return pulling; }
    pulling = (async () => {
      try {
        do {
          again = false;
          const names = new Set(wanted); wanted.clear();
          if (firstPull) PARTS.forEach(p => names.add(p));
          const [touched] = await Promise.all([
            pullMessages(), pullLocations(), pullNotifications(),
            (async () => { if (!firstPull && !names.has('events') && (await eventsChanged())) names.add('events'); })(),
          ]);
          if (names.size) await Promise.all([...names].map(async n => Object.assign(raw, await FETCH[n]())));
          assemble();
          applyNotifications();
          afterPull(touched, names.size);
          firstPull = false;
        } while (again);
      } catch (e) { console.warn('[cloud] refresh failed', e); }
      finally { pulling = null; }
    })();
    return pulling;
  }
  const sync = (...parts) => pull('fast', parts); // after my own change: refresh the parts it touches

  function afterPull(touched, refetched) {
    if (!A.me) return;
    watchNewHangouts();
    A.checkNearby?.();
    const chat = A.ui.chat;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    // draw again only when something I can see has changed (new data, new positions, new notifications)
    const sig = [refetched, touched.size, (raw.locations || []).map(l => l.user_id + l.updated_at).join(','), raw.notifs?.[0]?.id || ''].join('|');
    const changed = sig !== lastSig;
    lastSig = sig;
    if (chat) {
      let again = false;
      if (chat.startsWith('h:')) { // the "N going" line in the chat header
        const h = A.hangout(chat.slice(2)), n = h ? (h.n ?? h.members.length) : -1;
        if (n !== shownGoing[chat]) { shownGoing[chat] = n; again = true; }
      } else if (chat.startsWith('c:') && A.ui.ctab !== 'chat' && (refetched || touched.has(chat))) again = true; // news, ideas, members
      if (again && !typing) A.render();
      else if (touched.has(chat)) A.refreshMessages();
    } else if (!typing && changed) {
      // a sheet is redrawn only when it shows live data; a form being filled in (or its error message) is left alone
      if (A.ui.sheet && LIVE_SHEETS.has(A.ui.sheet.type)) A.renderSheet();
      A.render();
    }
    // new messages in a chat you are not looking at
    touched.forEach(k => {
      if (k === chat || firstPullDone === false) return;
      const last = A.db.chats[k].at(-1);
      if (!last || last.sys || last.from === authId || A.me.id !== authId) return;
      if (Date.now() - last.ts > 20e3) return;
      const who = A.user(last.from)?.name || 'Someone';
      const where = k.startsWith('h:') ? A.hangout(k.slice(2))?.title : k.startsWith('c:') ? A.user(k.slice(2))?.name : '';
      A.toast(`<span style="font-size:22px">💬</span><span>${A.esc(who)}${where ? ' · ' + A.esc(where) : ''}<small>${last.sticker ? 'sent a sticker' : A.esc((last.text || '').slice(0, 50))}</small></span>`, 4200, { a: 'openChat', key: k });
    });
    badgeCheck();
  }
  const LIVE_SHEETS = new Set(['hangout', 'person', 'location', 'spot', 'events', 'blocked']);
  const shownGoing = {};
  let lastSig = '', firstPullDone = false;
  setTimeout(() => { firstPullDone = true; }, 4000);

  // "New for you": a strong match for your taste that somebody else just posted
  function watchNewHangouts() {
    const me = me0();
    if (!me || A.isClub(me)) return;
    A.db.hangouts.forEach(h => {
      if (seenHangouts.has(h.id)) return;
      seenHangouts.add(h.id);
      if (firstPull || h.host === authId || h.members.includes(authId) || Date.now() - h.createdAt > 10 * MIN || h.when < Date.now() || me.alerts === false) return;
      if (!A.canSeeEvent(me, h)) return;
      const r = A.scoreFor(me, h);
      if (r.s < A.MATCH_MIN) return;
      A.pushEvent({ kind: 'match', to: authId, userId: h.host, hangoutId: h.id, why: r.why[0] || '' });
      A.toast(`<span style="font-size:22px">✨</span><span>New for you: <b>${A.esc(h.title)}</b><small>${A.esc(r.why[0] || 'Looks like your kind of plan')}</small></span>`, 6500, { a: 'openHangout', id: h.id });
    });
  }
  function badgeCheck() { const me = me0(); if (me && !A.isClub(me)) A.checkBadges(me); }

  // ───────────────────────── polling, realtime, private data
  function startLoops() {
    if (started) return;
    started = true; tick = 0;
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      tick++;
      const joined = channel?.state === 'joined';
      if (joined && tick % 4 !== 0) return; // realtime reports changes; this is only a safety net every 20 s
      const parts = [];
      if (tick % 12 === 0) parts.push('club', 'me');
      if (tick % 60 === 0) parts.push('people');
      pull('fast', parts);
    }, 5000);
    document.addEventListener('visibilitychange', onVisible);
    if (CFG.realtime !== false) {
      // realtime only says "something changed in this table"; the matching part is then read again
      const timers = {};
      const kick = (key, parts) => { clearTimeout(timers[key]); timers[key] = setTimeout(() => pull('fast', parts), 250); };
      const WATCH = { messages: [], locations: [], notifications: [], hangouts: ['events'], hangout_members: ['events'], club_posts: ['club'] };
      try {
        channel = sb.channel('yalla-' + authId.slice(0, 8));
        Object.entries(WATCH).forEach(([table, parts]) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => kick(table, parts)));
        channel.subscribe();
      } catch (e) { console.warn('[cloud] realtime unavailable, polling instead', e); }
    }
  }
  function stopLoops() {
    started = false; clearInterval(pollTimer); pollTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
    if (channel) { try { sb.removeChannel(channel); } catch { /* ignore */ } channel = null; }
  }
  const onVisible = () => { if (!document.hidden && authId) pull('all'); };

  // taste model, spot history and small app state: private to this account, saved a moment after each change
  function scheduleSave() {
    if (!authId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePrivate, 1500);
  }
  async function savePrivate() {
    const me = me0();
    if (!me || A.isClub(me)) return;
    const misc = { seenAt: me.seenAt || 0, viewsSeenAt: me.viewsSeenAt || 0, hidden: (me.hidden || []).slice(-60), remix: me.remix || 0, badgeSeen: !!me.badgeSeen, alumniSeen: !!me.alumniSeen };
    const row = { prefs: me.prefs || null, visits: (me.visits || []).slice(-250), trail: (me.trail || []).slice(-100), misc };
    const sig = JSON.stringify(row);
    if (sig === lastSaved) return;
    const r = await sb.from('private_data').upsert({ user_id: authId, ...row, updated_at: iso(Date.now()) }, { onConflict: 'user_id' });
    if (r.error) console.warn('[cloud] could not save private data', r.error); else lastSaved = sig;
  }

  // ───────────────────────── accounts
  async function enter(session) {
    authId = session.user.id; authEmail = session.user.email || '';
    firstPull = true; knownMsg.clear(); knownNotif.clear(); seenHangouts.clear(); msgCursor = null;
    A.db = { users: [], hangouts: [], chats: {}, events: [], reports: [] };
    await pull('all');
    const me = me0();
    if (!me) throw new Error('Your profile was not found');
    A.me = me;
    sb.rpc('touch_active').then(() => {}, () => {});
    startLoops();
    return me;
  }

  // a "forgot password" email link brings the person back with a one-time token in the address
  async function startRecovery() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
    const r = await sb.auth.setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') || '' });
    history.replaceState(null, '', location.pathname + location.search);
    return !r.error;
  }
  async function sendReset(email) {
    const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    return r.error ? friendly(r.error) : null;
  }
  // change the password while logged in: prove the current one first, then set the new one
  async function changePassword(current, next) {
    const re = await sb.auth.signInWithPassword({ email: authEmail, password: current });
    if (re.error) return /invalid/i.test(re.error.message) ? 'That password is not right' : friendly(re.error);
    const r = await sb.auth.updateUser({ password: next });
    if (r.error) {
      if (/same|different/i.test(r.error.message)) return 'Choose a password different from the current one';
      if (/weak|at least|short|characters|pwned|breach/i.test(r.error.message)) return 'Choose a longer or less common password';
      return friendly(r.error);
    }
    return null;
  }
  async function setNewPassword(password) {
    const r = await sb.auth.updateUser({ password });
    if (r.error) return /weak|at least/i.test(r.error.message) ? 'Choose a longer password' : friendly(r.error);
    return null;
  }

  async function restore() {
    if (await startRecovery()) return 'recovery';
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    try { return await enter(data.session); }
    catch (e) { console.warn('[cloud] could not restore the session', e); await sb.auth.signOut().catch(() => {}); authId = null; return null; }
  }

  // validates the form, then signs up or logs in. Returns an error message, or null when the person is in.
  async function submitAuth(ui) {
    const a = ui.auth, email = a.email.trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if (ui.authMode === 'signup') {
      if (!a.type) return 'Choose student or club first';
      if (!a.agree) return 'Please confirm you are 16 or older and accept the Terms and Privacy policy';
      const club = a.type === 'club', name = a.name.trim();
      if (!name) return club ? 'Add your club name' : 'Add your first name';
      if (club && !a.category) return 'Pick a category for your club';
      if (!emailOk) return 'Enter a valid email address';
      if (a.password.length < 8) return 'Password needs at least 8 characters';
      const creator = A.db.users.find(u => u.isCreator);
      if (creator && name.toLowerCase() === creator.name.toLowerCase()) return 'That name is reserved for the creator of Yalla';
      const { data, error } = await sb.auth.signUp({
        email, password: a.password,
        options: { data: {
          name, agreed: 'true', kind: club ? 'club' : 'student', color: a.color,
          ...(club ? { category: a.category, bio: a.bio.trim(), summary: a.summary.trim(), meets: a.meets.trim() } : { major: a.major.trim(), interests: a.interests }),
        } },
      });
      if (error) return /already registered|already exists/i.test(error.message) ? 'That email already has an account. Log in instead.' : /duplicate key|Database error/i.test(error.message) ? (club ? 'A club with that name already exists, or something is missing. Check the form.' : 'We could not create the account. Check the form and try again.') : friendly(error);
      if (!data.session) return 'CONFIRM'; // email confirmation is on: the person must click the link we sent
      const photo = A.okPhoto(a.photo) && a.photo.startsWith('data:') ? a.photo : null;
      await enter(data.session);
      if (photo) await uploadAvatar(photo, authId).catch(e => console.warn('[cloud] photo', e));
      if (!club) { const me = me0(); me.prefs = A.newPrefs(a.interests); scheduleSave(); }
      await pull('all');
      return null;
    }
    if (!email || !a.password) return 'Enter your email and password';
    const { data, error } = await sb.auth.signInWithPassword({ email, password: a.password });
    if (error) return /confirm/i.test(error.message) ? 'Please confirm your email first: we sent you a link.' : /invalid/i.test(error.message) ? 'Wrong email or password' : friendly(error);
    await enter(data.session);
    return null;
  }

  async function signOut() {
    clearTimeout(saveTimer); clearTimeout(locTimer);
    await savePrivate().catch(() => {});
    stopLoops();
    await sb.auth.signOut().catch(() => {});
    authId = null; authEmail = ''; lastSaved = ''; pendingLoc = null;
    A.db = { users: [], hangouts: [], chats: {}, events: [], reports: [] }; A.me = null;
  }

  // permanent and silent: nobody is told. Re-checks the password first, removes the stored photos, then the database does the rest.
  async function deleteAccount(password) {
    const re = await sb.auth.signInWithPassword({ email: authEmail, password });
    if (re.error) return 'That password is not right';
    try {
      for (const bucket of ['avatars', 'gallery']) {
        const l = await sb.storage.from(bucket).list(authId);
        if (l.data?.length) await sb.storage.from(bucket).remove(l.data.map(f => `${authId}/${f.name}`));
      }
    } catch (e) { console.warn('[cloud] could not remove photos', e); }
    const r = await sb.rpc('delete_my_account');
    if (r.error) return friendly(r.error);
    stopLoops(); clearTimeout(saveTimer); clearTimeout(locTimer);
    await sb.auth.signOut().catch(() => {});
    authId = null; authEmail = ''; lastSaved = ''; pendingLoc = null;
    A.db = { users: [], hangouts: [], chats: {}, events: [], reports: [] }; A.me = null;
    return null;
  }

  // ───────────────────────── photos
  async function toBlob(dataUrl) { return (await fetch(dataUrl)).blob(); }
  async function uploadAvatar(dataUrl, ownerId) {
    const blob = await toBlob(dataUrl);
    const path = `${ownerId}/${Date.now()}.jpg`;
    must(await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' }));
    const u = A.db.users.find(x => x.id === ownerId), oldPath = u?.photoPath;
    must(await sb.from('profiles').update({ photo_path: path }).eq('id', ownerId));
    if (oldPath && oldPath !== path) sb.storage.from('avatars').remove([oldPath]).catch(() => {});
    return path;
  }
  async function removeAvatar(ownerId) {
    const u = A.db.users.find(x => x.id === ownerId);
    must(await sb.from('profiles').update({ photo_path: null }).eq('id', ownerId));
    if (u?.photoPath) sb.storage.from('avatars').remove([u.photoPath]).catch(() => {});
  }

  // ───────────────────────── actions
  async function saveProfile(f) {
    const me = A.me, club = A.isClub(me);
    try {
      const patch = { color: f.color };
      if (club) Object.assign(patch, { name: f.name.trim(), category: f.category, bio: (f.bio || '').trim(), summary: (f.summary || '').trim(), meets: (f.meets || '').trim() });
      else Object.assign(patch, { major: f.major.trim(), year: f.year || '', grad_year: f.gradYear ? +f.gradYear : null, show_taste: !!f.showTaste, fav_spots: f.favSpots, interests: f.interests, alerts: !!f.alerts, private_browsing: !!f.privateBrowsing });
      must(await sb.from('profiles').update(patch).eq('id', me.id));
      if (f.photo && f.photo.startsWith('data:')) await uploadAvatar(f.photo, me.id);
      else if (!f.photo && me.photoPath) await removeAvatar(me.id);
      if (!club) scheduleSave();
      await sync('people', 'me');
      return true;
    } catch (e) { return fail(e, 'save your profile'); }
  }

  async function createHangout(h, collab = []) {
    try {
      const row = must(await sb.from('hangouts').insert({ host: h.host, act: h.act, title: h.title, place: h.place, lat: h.lat ?? null, lng: h.lng ?? null, where_text: h.where || '', starts_at: iso(h.when), max_people: h.max, description: h.desc || '' }).select('id').single());
      if (collab.length) await sb.from('cohosts').insert(collab.map(c => ({ hangout_id: row.id, club_id: c })));
      await sync('events');
      return row.id;
    } catch (e) { fail(e, 'post this'); return null; }
  }
  async function join(hid) {
    const r = await sb.from('hangout_members').insert({ hangout_id: hid });
    if (r.error) return fail(r.error, 'join');
    await sync('events', 'people');
    return true;
  }
  async function leave(hid) {
    const r = await sb.from('hangout_members').delete().eq('hangout_id', hid).eq('user_id', authId);
    if (r.error) return fail(r.error, 'leave');
    await sync('events', 'people');
    return true;
  }
  async function cancel(hid) {
    const r = await sb.from('hangouts').delete().eq('id', hid);
    if (r.error) return fail(r.error, 'cancel');
    await sync('events', 'people');
    return true;
  }

  async function sendMessage(key, { text, sticker }) {
    const target = key.startsWith('h:') ? { hangout_id: key.slice(2) } : key.startsWith('c:') ? { club_id: key.slice(2) } : { to_user: key.slice(3).split('|').find(x => x !== authId) };
    const r = await sb.from('messages').insert({ ...target, body: sticker || String(text).slice(0, 500), sticker: !!sticker }).select(MSG).single();
    if (r.error) return fail(r.error, 'send that');
    if (!knownMsg.has(r.data.id)) {
      knownMsg.add(r.data.id);
      (A.db.chats[key] ||= []).push(mapMsg(r.data));
      if (!msgCursor || r.data.created_at > msgCursor) msgCursor = r.data.created_at;
    }
    if (A.ui.chat === key) A.refreshMessages();
    return true;
  }

  // `on` says what is wanted. The app has already updated its own copy, so these never guess from local data.
  async function setBestie(id, on) {
    const r = on ? await sb.from('besties').insert({ friend_id: id }) : await sb.from('besties').delete().eq('user_id', authId).eq('friend_id', id);
    if (r.error && !(on && /duplicate/.test(r.error.message))) { await sync('people', 'events'); return fail(r.error, on ? 'add this bestie' : 'remove this bestie'); }
    await sync('people', 'events');
    return true;
  }
  async function setFollow(id, on) {
    const r = on ? await sb.from('follows').insert({ club_id: id }) : await sb.from('follows').delete().eq('user_id', authId).eq('club_id', id);
    if (r.error && !(on && /duplicate/.test(r.error.message))) { await sync('people', 'events'); return fail(r.error, on ? 'follow' : 'unfollow'); }
    await sync('people', 'events');
    return true;
  }

  // ───────── privacy and location
  async function setProfileFlags(patch) {
    const r = await sb.from('profiles').update(patch).eq('id', authId);
    if (r.error) return fail(r.error, 'save that setting');
    return true;
  }
  async function setSharing(on) {
    clearTimeout(locTimer); pendingLoc = null;
    return setProfileFlags({ share_loc: !!on });
  }
  // send the position, but not more than once every few seconds
  function publishLoc(loc, expiresAt) {
    if (!authId || !loc || loc.lat == null) return;
    pendingLoc = { loc, expiresAt };
    const wait = Math.max(0, 3000 - (Date.now() - lastPub));
    if (locTimer) return;
    locTimer = setTimeout(async () => {
      locTimer = null;
      const p = pendingLoc; pendingLoc = null;
      if (!p) return;
      lastPub = Date.now();
      const me = me0();
      const r = await sb.from('locations').upsert({ user_id: authId, lat: p.loc.lat, lng: p.loc.lng, acc: p.loc.acc ?? null, place: p.loc.place || '', note: (me?.status || '').slice(0, 80), expires_at: iso(Math.min(p.expiresAt, Date.now() + 8 * HR - MIN)) }, { onConflict: 'user_id' });
      if (r.error && !/Ghost mode/.test(r.error.message)) console.warn('[cloud] position not sent', r.error.message);
    }, wait);
  }
  async function clearLoc() { clearTimeout(locTimer); locTimer = null; pendingLoc = null; await sb.from('locations').delete().eq('user_id', authId); }

  const recordView = target => { if (authId && target && target !== authId) sb.rpc('record_view', { p_target: target }).then(() => {}, () => {}); };
  async function block(id) {
    const r = await sb.from('blocks').insert({ blocked: id });
    if (r.error && !/duplicate/.test(r.error.message)) return fail(r.error, 'block this person');
    await sync('people', 'events'); return true;
  }
  async function unblock(id) {
    const r = await sb.from('blocks').delete().eq('blocker', authId).eq('blocked', id);
    if (r.error) return fail(r.error, 'unblock');
    await sync('people', 'events'); return true;
  }
  async function report(f) {
    const kind = { user: 'person', message: 'message', event: 'event', club: 'club' }[f.kind] || 'person';
    const isUuid = x => /^[0-9a-f-]{36}$/i.test(x || '');
    const r = await sb.from('reports').insert({ target_user: isUuid(f.userId) ? f.userId : null, target_kind: kind, target_id: String(f.id || '').slice(0, 80), reason: f.reason, details: (f.details || '').trim().slice(0, 500), snippet: (f.snippet || '').slice(0, 300) });
    if (r.error) return fail(r.error, 'send the report');
    return true;
  }

  // ───────── clubs and communities
  async function requestJoin(clubId) {
    const r = await sb.from('club_members').insert({ club_id: clubId });
    if (r.error && !/duplicate/.test(r.error.message)) return fail(r.error, 'send the request');
    await sb.from('follows').insert({ club_id: clubId }); // asking to join also follows the club, like before
    await sync('people'); return true;
  }
  async function cancelRequest(clubId) {
    const r = await sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', authId);
    if (r.error) return fail(r.error, 'cancel the request');
    await sync('people'); return true;
  }
  async function setMember(clubId, userId, accept) {
    const r = accept
      ? await sb.from('club_members').update({ status: 'member' }).eq('club_id', clubId).eq('user_id', userId)
      : await sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId);
    if (r.error) return fail(r.error, accept ? 'accept this person' : 'remove this person');
    await sync('people'); return true;
  }
  // update the person's row if they already have one (a request, a membership), otherwise create it
  async function upsertMember(clubId, userId, patch) {
    let r = await sb.from('club_members').update(patch).eq('club_id', clubId).eq('user_id', userId).select('user_id');
    if (!r.error && !r.data.length) r = await sb.from('club_members').insert({ club_id: clubId, user_id: userId, ...patch });
    return r;
  }
  async function addMember(clubId, userId) {
    const r = await upsertMember(clubId, userId, { status: 'member' });
    if (r.error) return fail(r.error, 'add this person');
    await sync('people'); return true;
  }
  async function addHead(clubId, userId, role) {
    const r = await upsertMember(clubId, userId, { status: 'member', is_head: true, role: role || 'Head' });
    if (r.error) return fail(r.error, 'add this head');
    await sync('people'); return true;
  }
  async function removeHead(clubId, userId) {
    const r = await sb.from('club_members').update({ is_head: false, role: '' }).eq('club_id', clubId).eq('user_id', userId);
    if (r.error) return fail(r.error, 'remove this head');
    await sync('people'); return true;
  }
  async function postNews(clubId, text) {
    const r = await sb.from('club_posts').insert({ club_id: clubId, body: text });
    if (r.error) return fail(r.error, 'post that');
    await sync('club'); return true;
  }
  async function suggest(clubId, text) {
    const r = await sb.from('club_suggestions').insert({ club_id: clubId, body: text }).select('id').single();
    if (r.error) return fail(r.error, 'send your idea');
    await sb.from('suggestion_votes').insert({ suggestion_id: r.data.id });
    await sync('club'); return true;
  }
  async function vote(sugId, on) {
    const r = on ? await sb.from('suggestion_votes').insert({ suggestion_id: sugId }) : await sb.from('suggestion_votes').delete().eq('suggestion_id', sugId).eq('user_id', authId);
    if (r.error && !/duplicate/.test(r.error.message)) return fail(r.error, 'vote');
    await sync('club'); return true;
  }
  async function setSugStatus(sugId, status) {
    const r = await sb.from('club_suggestions').update({ status }).eq('id', sugId);
    if (r.error) return fail(r.error, 'update the idea');
    await sync('club'); return true;
  }
  async function addPhoto(clubId, dataUrl, caption) {
    try {
      const path = `${clubId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      must(await sb.storage.from('gallery').upload(path, await toBlob(dataUrl), { contentType: 'image/jpeg' }));
      must(await sb.from('club_gallery').insert({ club_id: clubId, path, caption: (caption || '').slice(0, 140) }));
      await sync('club'); return true;
    } catch (e) { return fail(e, 'add the photo'); }
  }
  async function deletePhoto(clubId, photoId) {
    const g = A.user(clubId)?.gallery?.find(x => x.id === photoId);
    const r = await sb.from('club_gallery').delete().eq('id', photoId);
    if (r.error) return fail(r.error, 'delete the photo');
    if (g?.path) sb.storage.from('gallery').remove([g.path]).catch(() => {});
    await sync('club'); return true;
  }
  async function answerCollab(hid, clubId, accept) {
    const r = accept ? await sb.from('cohosts').update({ status: 'accepted' }).eq('hangout_id', hid).eq('club_id', clubId) : await sb.from('cohosts').delete().eq('hangout_id', hid).eq('club_id', clubId);
    if (r.error) return fail(r.error, accept ? 'accept' : 'decline');
    await sync('events', 'people'); return true;
  }
  // find students by name (emails are never exposed), for adding heads and members
  async function findStudents(text) {
    const t = String(text || '').trim().replace(/[%_,()]/g, ' ').slice(0, 40);
    if (t.length < 2) return [];
    const r = await sb.from('profiles').select('id, name, major, photo_path').eq('kind', 'student').ilike('name', `%${t}%`).limit(8);
    return r.error ? [] : r.data;
  }

  window.Cloud = {
    enabled: true, isPhotoUrl, photoUrl: pubUrl,
    bind(api) { A = api; },
    get authId() { return authId; },
    restore, sendReset, setNewPassword, changePassword, submitAuth, signOut, deleteAccount, pull, scheduleSave, savePrivate,
    saveProfile, createHangout, join, leave, cancel, sendMessage, setBestie, setFollow,
    setSharing, setProfileFlags, publishLoc, clearLoc, recordView, block, unblock, report,
    requestJoin, cancelRequest, setMember, addMember, addHead, removeHead, postNews, suggest, vote, setSugStatus,
    addPhoto, deletePhoto, answerCollab, findStudents,
    sb: CFG.dev ? sb : undefined,
  };
})();
