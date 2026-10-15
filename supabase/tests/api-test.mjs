// End-to-end check of the backend through its network API, using the same vendored supabase-js build the app loads
// in the browser.
//
//   MODE=rest  (run-rest-tests.sh)  PostgREST + a throwaway Postgres, people are created in SQL and given signed
//                                   test tokens. Checks the data API and all the security rules. No Docker needed.
//   MODE=full  (run-api-tests.sh)   the complete local Supabase stack (`npx supabase start`, needs Docker): adds the
//                                   login service, photo storage and realtime.
//
// It creates throwaway people on a LOCAL server. Never point it at your real project.
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(readFileSync(path.join(here, '../../vendor/supabase.js'), 'utf8'));
const { createClient } = globalThis.supabase;

const FULL = process.env.MODE === 'full';
let URL_ = process.env.API_URL;
const KEY = process.env.ANON_KEY || 'local-test-key';
if (!URL_) { console.error('Set API_URL (the run-*.sh scripts do this)'); process.exit(2); }
// Supabase's gateway serves the data API under /rest/v1; bare PostgREST serves from the root. Do what the gateway does.
if (!FULL) {
  const upstream = new globalThis.URL(URL_);
  const proxy = http.createServer((req, res) => {
    const fwd = http.request({ host: upstream.hostname, port: upstream.port, method: req.method, path: req.url.replace(/^\/rest\/v1/, '') || '/', headers: req.headers },
      r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    fwd.on('error', e => { res.writeHead(502); res.end(String(e)); });
    req.pipe(fwd);
  });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  URL_ = `http://127.0.0.1:${proxy.address().port}`;
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) { console.error('Refusing to run against a non-local URL:', URL_); process.exit(2); }

let passed = 0, failed = 0, skipped = 0;
const skip = name => { skipped++; console.log('  skip', name, '(needs the full stack)'); };
const check = (name, ok, info = '') => { if (ok) passed++; else { failed++; console.log('  FAIL', name, info); } };
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const wait = ms => new Promise(r => setTimeout(r, ms));
const stamp = Date.now();
const tag = n => `${n}.${stamp}@example.test`;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const mint = sub => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`; return `${h}.${createHmac('sha256', process.env.JWT_SECRET).update(h).digest('base64url')}`; };
const psql = sql => execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;

async function signUp(name, extra = {}) {
  if (!FULL) {
    const id = randomUUID();
    psql(`insert into auth.users (id, email, raw_user_meta_data) values (${q(id)}, ${q(tag(name))}, ${q(JSON.stringify({ name, agreed: 'true', ...extra }))})`);
    const c = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${mint(id)}` } } });
    return { c, id, name };
  }
  const c = client();
  const { data, error } = await c.auth.signUp({ email: tag(name), password: 'correct-horse-1', options: { data: { name, agreed: 'true', ...extra } } });
  if (error) throw new Error(`sign-up ${name}: ${error.message}`);
  if (!data.session) throw new Error(`sign-up ${name}: no session (is email confirmation on locally?)`);
  return { c, id: data.user.id, name };
}

// events from realtime, kept per client
function listen(c, table, filter) {
  const got = [];
  const ch = c.channel(`t-${table}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, p => got.push(p))
    .subscribe();
  return { got, ch };
}

try {
  // ───────── sign-up and profiles
  const anon = client();
  if (FULL) {
    const bad = await anon.auth.signUp({ email: tag('noterms'), password: 'correct-horse-1', options: { data: { name: 'X' } } });
    check('sign-up without the terms confirmation is rejected', !!bad.error, JSON.stringify(bad.data?.user));
  } else {
    let rejected = false;
    try { psql(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'x@y.test', '{"name":"X"}')`); } catch { rejected = true; }
    check('sign-up without the terms confirmation is rejected', rejected);
  }
  const A = await signUp('Alice', { major: 'Computer Science' });
  const B = await signUp('Bob');
  const C = await signUp('Carol');
  const K = await signUp('Robotics Club', { kind: 'club', category: 'Tech' });

  const PUBLIC = 'id, kind, name, major, year, grad_year, bio, color, photo_path, show_taste, fav_spots, interests, category, tagline, summary, meets, is_creator, club_approved, butterfly, met_count, created_at';
  let r = await A.c.from('profiles').select(PUBLIC).eq('id', A.id).single();
  check('own profile exists with the sign-up data', r.data?.name === 'Alice' && r.data?.major === 'Computer Science', JSON.stringify(r.error));
  r = await A.c.rpc('my_settings');
  check('my_settings returns my private switches (ghost mode on by default)', r.data?.share_loc === false && r.data?.precise === true && r.data?.alerts === true, JSON.stringify(r));
  r = await B.c.from('profiles').select('share_loc').eq('id', A.id);
  check("other people cannot read someone's ghost-mode switch", !!r.error);
  r = await B.c.from('profiles').select('*').eq('id', A.id);
  check('select * on profiles is refused', !!r.error);
  check('club sign-up makes a club that is not approved', (await K.c.from('profiles').select('kind, club_approved').eq('id', K.id).single()).data?.kind === 'club');
  r = await A.c.from('profiles').update({ is_creator: true }).eq('id', A.id);
  check('cannot make yourself the Creator over the API', !!r.error, JSON.stringify(r.data));
  r = await A.c.from('profiles').update({ bio: 'hi there', fav_spots: ['library', 'park'] }).eq('id', A.id).select(PUBLIC).single();
  check('can edit own profile', r.data?.bio === 'hi there' && r.data.fav_spots.length === 2, JSON.stringify(r.error));
  r = await anon.from('profiles').select('*');
  check('signed-out visitors cannot read profiles', !!r.error || (r.data || []).length === 0, JSON.stringify(r.data?.length));
  r = await B.c.from('profiles').select('id, name').in('id', [A.id, C.id]);
  check('signed-in people can read other profiles', r.data?.length === 2);
  r = await B.c.from('profiles').select(PUBLIC).eq('id', A.id).single();
  check('profiles never expose an email', !('email' in (r.data || {})));

  // ───────── hangouts: the create-and-read-back case that broke in the first version
  r = await A.c.from('hangouts').insert({ host: A.id, act: 'walk', title: 'Sunset walk', place: 'park', lat: 33.5418, lng: -5.1074, starts_at: new Date(Date.now() + 3 * 3600e3).toISOString(), max_people: 5, description: 'Easy loop' }).select().single();
  check('create a hangout and read it back in one request', !!r.data?.id && r.data.club === false && r.data.by_user === A.id, JSON.stringify(r.error));
  const hid = r.data?.id;
  r = await A.c.from('hangout_members').select('user_id').eq('hangout_id', hid);
  check('the host is a member automatically', r.data?.length === 1 && r.data[0].user_id === A.id);
  r = await C.c.from('hangouts').select('id').eq('id', hid);
  check('other students see student hangouts', r.data?.length === 1);
  r = await C.c.from('messages').select('id').eq('hangout_id', hid);
  check('non-members cannot read the group chat', (r.data || []).length === 0);

  // realtime: bob joins and listens to the group chat; carol (a stranger) listens too
  r = await B.c.from('hangout_members').insert({ hangout_id: hid }).select().single();
  check('bob joins', r.data?.user_id === B.id, JSON.stringify(r.error));
  const bobMsgs = FULL ? listen(B.c, 'messages', `hangout_id=eq.${hid}`) : null;
  const carolMsgs = FULL ? listen(C.c, 'messages', `hangout_id=eq.${hid}`) : null;
  await wait(FULL ? 1500 : 0);
  r = await A.c.from('messages').insert({ hangout_id: hid, body: 'see you at 6', sticker: false }).select().single();
  check('alice sends a group message', !!r.data?.id, JSON.stringify(r.error));
  if (FULL) {
    await wait(1500);
    check('REALTIME: bob receives it live', bobMsgs.got.some(p => p.eventType === 'INSERT' && p.new.body === 'see you at 6'), `got ${bobMsgs.got.length}`);
    check('REALTIME: a stranger does NOT receive it', carolMsgs.got.length === 0, `got ${carolMsgs.got.length}`);
  } else { skip('realtime: bob receives the message live'); skip('realtime: a stranger does not'); }
  r = await B.c.from('messages').insert({ hangout_id: hid, body: 'fake', sys: true });
  check('cannot send a fake system line', !!r.error);

  // ───────── private chat
  r = await A.c.from('messages').insert({ to_user: C.id, body: 'hey carol' }).select().single();
  check('direct message', !!r.data?.id, JSON.stringify(r.error));
  r = await C.c.from('messages').select('body').eq('to_user', C.id);
  check('carol reads it', r.data?.length === 1 && r.data[0].body === 'hey carol');
  r = await B.c.from('messages').select('body').eq('body', 'hey carol');
  check('bob cannot read it', (r.data || []).length === 0);

  // ───────── besties and live location
  r = await A.c.from('profiles').update({ share_loc: true }).eq('id', A.id);
  const expires = new Date(Date.now() + 4 * 3600e3).toISOString();
  r = await A.c.from('locations').upsert({ user_id: A.id, lat: 33.5398, lng: -5.1072, acc: 9, place: 'library', expires_at: expires });
  check('alice publishes a location', !r.error, JSON.stringify(r.error));
  r = await B.c.from('locations').select('*').eq('user_id', A.id);
  check('a stranger cannot see it', (r.data || []).length === 0);
  await A.c.from('besties').insert({ friend_id: B.id });
  r = await B.c.from('locations').select('*').eq('user_id', A.id);
  check('a one-way bestie cannot see it', (r.data || []).length === 0);
  const bobLoc = FULL ? listen(B.c, 'locations') : null;
  const carolLoc = FULL ? listen(C.c, 'locations') : null;
  await wait(FULL ? 1200 : 0);
  r = await B.c.from('notifications').select('kind').eq('kind', 'bestie_req');
  check('bob got a bestie request notification', r.data?.length === 1);
  await B.c.from('besties').insert({ friend_id: A.id });
  r = await B.c.from('locations').select('*').eq('user_id', A.id);
  check('mutual besties see the location', r.data?.length === 1 && r.data[0].place === 'library');
  r = await A.c.from('locations').upsert({ user_id: A.id, lat: 33.5401, lng: -5.1065, acc: 8, place: 'cafeteria', expires_at: expires });
  if (FULL) {
    await wait(1500);
    check('REALTIME: bob sees alice move', bobLoc.got.some(p => p.new?.place === 'cafeteria'), `got ${bobLoc.got.length}`);
    check('REALTIME: a stranger sees nothing', carolLoc.got.length === 0, `got ${carolLoc.got.length}`);
  } else { skip('realtime: bob sees alice move'); skip('realtime: a stranger sees nothing'); }
  r = await A.c.from('locations').upsert({ user_id: A.id, lat: 40, lng: 2, expires_at: expires });
  check('a position far away from campus is refused', !!r.error);
  r = await A.c.from('profiles').update({ share_loc: false }).eq('id', A.id);
  r = await B.c.from('locations').select('*').eq('user_id', A.id);
  check('ghost mode removes it for everybody', (r.data || []).length === 0);

  // ───────── photos (storage service)
  if (FULL) {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    r = await A.c.storage.from('avatars').upload(`${A.id}/me.png`, png, { contentType: 'image/png' });
    check('upload own avatar', !r.error, JSON.stringify(r.error));
    const url = A.c.storage.from('avatars').getPublicUrl(`${A.id}/me.png`).data.publicUrl;
    const got = await fetch(url);
    check('the avatar has a working public link', got.ok && got.headers.get('content-type')?.includes('image/png'), String(got.status));
    r = await A.c.storage.from('avatars').upload(`${B.id}/me.png`, png, { contentType: 'image/png' });
    check("cannot upload into someone else's folder", !!r.error);
    r = await A.c.storage.from('avatars').upload(`${A.id}/evil.html`, new TextEncoder().encode('<script>1</script>'), { contentType: 'text/html' });
    check('only images are accepted', !!r.error);
    r = await A.c.storage.from('gallery').upload(`${K.id}/x.png`, png, { contentType: 'image/png' });
    check('a student cannot add to a club gallery', !!r.error);
    r = await K.c.storage.from('gallery').upload(`${K.id}/x.png`, png, { contentType: 'image/png' });
    check('the club can', !r.error, JSON.stringify(r.error));


  } else { skip('photo upload, folder rules, image-only, public links'); }

  // ───────── clubs
  r = await K.c.from('hangouts').insert({ host: K.id, act: 'workshop', title: 'Arduino night', starts_at: new Date(Date.now() + 2 * 864e5).toISOString() }).select().single();
  check('club creates an event', r.data?.club === true, JSON.stringify(r.error));
  const cid = r.data?.id;
  r = await C.c.from('hangouts').select('id').eq('id', cid);
  check('non-followers do not see it', (r.data || []).length === 0);
  await C.c.from('follows').insert({ club_id: K.id });
  r = await C.c.from('hangouts').select('id').eq('id', cid);
  check('followers do', r.data?.length === 1);
  r = await C.c.from('club_posts').select('hangout_id').eq('club_id', K.id);
  check('followers see the news post', r.data?.length === 1 && r.data[0].hangout_id === cid);

  // ───────── who viewed your profile, activity
  r = await A.c.rpc('record_view', { p_target: B.id });
  check('record a profile view', !r.error, JSON.stringify(r.error));
  r = await B.c.from('profile_views').select('viewer, n');
  check('bob sees alice in his visitors', r.data?.length === 1 && r.data[0].viewer === A.id);
  r = await A.c.rpc('touch_active');
  check('touch_active works', !r.error, JSON.stringify(r.error));

  // ───────── reports
  r = await A.c.from('reports').insert({ target_user: C.id, target_kind: 'person', target_id: C.id, reason: 'Spam or scam' });
  check('file a report', !r.error, JSON.stringify(r.error));
  r = await A.c.from('reports').select('*');
  check('reports cannot be read back', !!r.error);

  // ───────── the app's own queries: every select and rpc in cloud.js runs as a real person
  {
    const src = readFileSync(path.join(here, '../../cloud.js'), 'utf8');
    const consts = Object.fromEntries([...src.matchAll(/const (PUB|MSG) = '([^']+)'/g)].map(m => [m[1], m[2]]));
    const selects = [...src.matchAll(/sb\.from\('(\w+)'\)\.select\((?:'([^']+)'|(PUB|MSG))/g)].map(m => [m[1], m[2] || consts[m[3]]]);
    check('cloud.js: found the queries to check', selects.length >= 15 && Object.keys(consts).length === 2, `found ${selects.length}`);
    const seen = new Set();
    for (const [table, cols] of selects) {
      const key = `${table}|${cols}`; if (seen.has(key)) continue; seen.add(key);
      const r = await B.c.from(table).select(cols).limit(1);
      check(`cloud.js reads ${table} (${cols.split(',').length} columns)`, !r.error, r.error?.message);
    }
    for (const fn of [...new Set([...src.matchAll(/sb\.rpc\('(my_settings|hangout_counts|club_counts|events_stamp)'\)/g)].map(m => m[1]))]) {
      const r = await B.c.rpc(fn);
      check(`cloud.js calls ${fn}()`, !r.error, r.error?.message);
    }
    for (const fn of [...new Set([...src.matchAll(/sb\.rpc\('(\w+)'/g)].map(m => m[1]))]) {
      check(`cloud.js rpc ${fn} exists`, ['my_settings', 'hangout_counts', 'club_counts', 'events_stamp', 'touch_active', 'record_view', 'delete_my_account'].includes(fn), fn);
    }
  }

  // ───────── deleting an account
  const before = await B.c.from('notifications').select('id').eq('user_id', B.id);
  const del = await A.c.rpc('delete_my_account');
  check('delete my account', !del.error, JSON.stringify(del.error));
  if (FULL) {
    const login = await client().auth.signInWithPassword({ email: tag('Alice'), password: 'correct-horse-1' });
    check('the login no longer works', !!login.error);
  } else check('the login row is gone', psql(`select count(*) from auth.users where id = ${q(A.id)}`) === '0');
  r = await B.c.from('profiles').select('id').eq('id', A.id);
  check('her profile is gone for everyone', (r.data || []).length === 0);
  r = await B.c.from('notifications').select('id').eq('user_id', B.id);
  check('nothing new was sent to bob (silent); old ones that mention her are gone', r.data.length <= before.data.length);
  r = await B.c.from('hangouts').select('id').eq('id', hid);
  check('her hangout is gone', (r.data || []).length === 0);

  for (const x of [bobMsgs, carolMsgs, bobLoc, carolLoc]) if (x) await x.ch.unsubscribe();
} catch (e) {
  failed++; console.log('  ERROR', e.stack || e.message);
}
console.log(`\napi checks (${FULL ? 'full stack' : 'rest only'}): ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
