// DEVELOPMENT ONLY. A stand-in for the parts of Supabase's gateway that Docker could not give us:
//   /rest/v1/*     -> forwarded to PostgREST (the real data API, the real security rules)
//   /auth/v1/*     -> a small fake of the login service (sign-up, password login, refresh, user, logout)
//   /storage/v1/*  -> a small fake of photo storage (upload, public links, delete) that keeps files on disk
// It lets the real app and the real supabase-js run in a browser against the real database rules.
// It does NOT check emails, rate limits or the storage security rules; those are tested on the real project.
// Never expose it beyond this computer.
import http from 'node:http';
import { createHmac, randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { PORT = '54397', REST_PORT = '54398', PG_PORT = '54399', JWT_SECRET, FILES_DIR } = process.env;
if (!JWT_SECRET || !FILES_DIR) { console.error('JWT_SECRET and FILES_DIR are required'); process.exit(2); }
const FILES = path.resolve(FILES_DIR);
fs.mkdirSync(FILES, { recursive: true });

const psql = sql => execFileSync('psql', ['-h', '127.0.0.1', '-p', PG_PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
psql('create table if not exists auth.dev_credentials (user_id uuid primary key, email text unique not null, salt text not null, hash text not null)');

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = payload => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`; return `${h}.${createHmac('sha256', JWT_SECRET).update(h).digest('base64url')}`; };
const verify = tok => {
  const [h, p, sig] = String(tok || '').split('.');
  if (!sig) return null;
  const want = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
};
const refreshTokens = new Map(); // refresh token -> user id (lost on restart, like a dev server should)

const userRow = id => {
  const r = psql(`select row_to_json(u) from (select id, email, raw_user_meta_data from auth.users where id = ${q(id)}) u`);
  return r ? JSON.parse(r) : null;
};
const userObj = row => ({
  id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email, email_confirmed_at: new Date().toISOString(),
  phone: '', confirmed_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: row.raw_user_meta_data || {}, identities: [],
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_anonymous: false,
});
const session = row => {
  const now = Math.floor(Date.now() / 1000), user = userObj(row);
  const refresh = randomBytes(12).toString('hex');
  refreshTokens.set(refresh, row.id);
  return {
    access_token: sign({ aud: 'authenticated', exp: now + 3600, iat: now, sub: row.id, email: row.email, role: 'authenticated', session_id: randomUUID(), app_metadata: user.app_metadata, user_metadata: user.user_metadata }),
    token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user,
  };
};
const hashPw = (pw, salt) => scryptSync(pw, salt, 32).toString('hex');

const cors = (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('access-control-expose-headers', 'content-range, content-profile, x-total-count');
};
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const json = async req => { try { return JSON.parse((await readBody(req)).toString() || '{}'); } catch { return {}; } };
const bearer = req => verify((req.headers.authorization || '').replace(/^Bearer /i, ''));

// ───────── fake login service
async function auth(req, res, url) {
  const route = url.pathname.replace('/auth/v1', '');
  if (route === '/signup' && req.method === 'POST') {
    const b = await json(req), email = String(b.email || '').trim().toLowerCase();
    if (!email || String(b.password || '').length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
    if (psql(`select count(*) from auth.users where lower(email) = ${q(email)}`) !== '0') return authErr(res, 422, 'user_already_exists', 'User already registered');
    const id = randomUUID(), salt = randomBytes(8).toString('hex');
    try { psql(`insert into auth.users (id, email, raw_user_meta_data) values (${q(id)}, ${q(email)}, ${q(JSON.stringify(b.data || {}))})`); }
    catch { return authErr(res, 500, 'unexpected_failure', 'Database error saving new user'); }
    psql(`insert into auth.dev_credentials values (${q(id)}, ${q(email)}, ${q(salt)}, ${q(hashPw(b.password, salt))})`);
    return send(res, 200, session(userRow(id)));
  }
  if (route === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type'), b = await json(req);
    if (grant === 'password') {
      const email = String(b.email || '').trim().toLowerCase();
      const row = psql(`select row_to_json(c) from auth.dev_credentials c where email = ${q(email)}`);
      const c = row ? JSON.parse(row) : null;
      if (!c || hashPw(String(b.password || ''), c.salt) !== c.hash) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, session(userRow(c.user_id)));
    }
    if (grant === 'refresh_token') {
      const id = refreshTokens.get(b.refresh_token), row = id && userRow(id);
      if (!row) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(b.refresh_token);
      return send(res, 200, session(row));
    }
    return authErr(res, 400, 'validation_failed', 'Unsupported grant_type');
  }
  if (route === '/recover' && req.method === 'POST') {
    const b = await json(req), email = String(b.email || '').trim().toLowerCase();
    const row = psql(`select user_id from auth.dev_credentials where email = ${q(email)}`);
    if (row) { // a real project emails this link; the dev gateway just prints it
      const sess = session(userRow(row));
      console.log(`RECOVERY LINK for ${email}: ${b.redirect_to || url.searchParams.get('redirect_to') || 'http://localhost:5173/'}#access_token=${sess.access_token}&refresh_token=${sess.refresh_token}&type=recovery`);
    }
    return send(res, 200, {});
  }
  if (route === '/user' && req.method === 'PUT') {
    const claims = bearer(req);
    if (!claims) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    const b = await json(req);
    if (b.password) {
      if (String(b.password).length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
      const salt = randomBytes(8).toString('hex');
      psql(`update auth.dev_credentials set salt = ${q(salt)}, hash = ${q(hashPw(b.password, salt))} where user_id = ${q(claims.sub)}`);
    }
    return send(res, 200, userObj(userRow(claims.sub)));
  }
  if (route === '/user') {
    const claims = bearer(req);
    if (!claims) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    const row = userRow(claims.sub);
    if (!row) return authErr(res, 403, 'user_not_found', 'User from sub claim in JWT does not exist');
    return send(res, 200, userObj(row));
  }
  if (route === '/logout') return send(res, 204, '');
  return authErr(res, 404, 'not_found', `Fake login service has no ${route}`);
}

// ───────── fake photo storage
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function parseUpload(buf, contentType) {
  const m = /boundary=(.+)$/.exec(contentType || '');
  if (!m) return { body: buf, type: contentType };
  const sep = Buffer.from(`--${m[1]}`);
  let start = buf.indexOf(sep);
  while (start >= 0) {
    const hdrEnd = buf.indexOf('\r\n\r\n', start);
    if (hdrEnd < 0) break;
    const head = buf.slice(start, hdrEnd).toString();
    const end = buf.indexOf(sep, hdrEnd + 4);
    const isFile = /filename=|name=""/.test(head);
    if (isFile && end > 0) return { body: buf.slice(hdrEnd + 4, end - 2), type: (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] };
    start = end;
  }
  return { body: Buffer.alloc(0), type: '' };
}
async function storage(req, res, url) {
  const parts = decodeURIComponent(url.pathname.replace('/storage/v1/object', '')).split('/').filter(Boolean);
  if (req.method === 'GET' && parts[0] === 'public') {
    const file = path.join(FILES, ...parts.slice(1));
    if (!file.startsWith(FILES + path.sep) || !fs.existsSync(file)) return send(res, 404, { error: 'not_found' });
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file).slice(1)] || 'application/octet-stream');
  }
  const claims = bearer(req);
  if (!claims) return send(res, 401, { error: 'Unauthorized', message: 'invalid JWT' });
  if ((req.method === 'POST' || req.method === 'PUT') && parts.length >= 3) {
    const [bucket, ...rest] = parts, rel = rest.join('/');
    if (!['avatars', 'gallery'].includes(bucket)) return send(res, 404, { error: 'Bucket not found' });
    if (bucket === 'avatars' && rest[0] !== claims.sub) return send(res, 403, { error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const { body, type } = parseUpload(await readBody(req), req.headers['content-type']);
    if (!/^image\/(jpeg|png|webp)$/.test(type || '')) return send(res, 415, { error: 'invalid_mime_type', message: 'mime type not supported' });
    if (body.length > 3 * 1024 * 1024) return send(res, 413, { error: 'Payload too large' });
    const file = path.join(FILES, bucket, rel);
    if (!file.startsWith(FILES + path.sep)) return send(res, 400, { error: 'bad path' });
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
    return send(res, 200, { Id: randomUUID(), Key: `${bucket}/${rel}` });
  }
  if (req.method === 'POST' && parts[0] === 'list' && parts.length === 2) {
    const b = await json(req), dir = path.join(FILES, parts[1], String(b.prefix || ''));
    if (!dir.startsWith(FILES + path.sep) || !fs.existsSync(dir)) return send(res, 200, []);
    return send(res, 200, fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => ({ name: e.name, id: randomUUID(), metadata: { size: fs.statSync(path.join(dir, e.name)).size } })));
  }
  if (req.method === 'DELETE' && parts.length === 1) {
    const b = await json(req);
    for (const p of b.prefixes || []) { const f = path.join(FILES, parts[0], p); if (f.startsWith(FILES + path.sep) && fs.existsSync(f)) fs.rmSync(f); }
    return send(res, 200, []);
  }
  return send(res, 404, { error: 'not_found' });
}

// ───────── data API: straight through to PostgREST
function rest(req, res, url) {
  const fwd = http.request({ host: '127.0.0.1', port: REST_PORT, method: req.method, path: url.pathname.replace('/rest/v1', '') + url.search, headers: { ...req.headers, host: `127.0.0.1:${REST_PORT}` } },
    r => { cors(req, res); res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  fwd.on('error', e => send(res, 502, { message: String(e) }));
  req.pipe(fwd);
}

http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/rest/v1')) return rest(req, res, url);
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url);
    if (url.pathname.startsWith('/storage/v1/object')) return await storage(req, res, url);
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    send(res, 404, { message: 'not found' });
  } catch (e) { console.error(e); send(res, 500, { message: String(e.message || e) }); }
}).listen(+PORT, '127.0.0.1', () => console.log(`dev gateway on http://127.0.0.1:${PORT}`));
