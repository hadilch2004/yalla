'use strict';
/* Yalla — hangout app prototype for campus communities.
   Front-end only: data lives in localStorage so the whole thing can be clicked through
   without a server. See docs/DEVELOPMENT.md for how it works and what is mocked in demo mode. */

// ───────────────────────── config ─────────────────────────
const BRAND = { name: 'Yalla', tagline: "Let's hang.", support: 'hadilappsupport@gmail.com' }; // shown in the app (Safety & support) and the policy pages
const SEED_MAIL = 'example.com'; // demo accounts use this reserved test domain
const CLOUD = !!window.Cloud?.enabled; // true when config.js holds Supabase keys: real accounts and shared data (see cloud.js)
const DEMO = { enabled: !CLOUD, email: 'demo@example.com', password: 'yalla-demo-1' }; // prototype-only quick login
const MAX_BESTIES = 5;
const CREATOR_ID = 'u_hadil'; // the one account that carries the ✔ Creator badge
const MATCH_MIN = 2.5; // a new hangout must score this high before we ping you about it
const PICK_MIN = 1.6; // ...and this high to be listed under "Picked for you"
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad', 'Alumni'];
const GRAD_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031];
const CLUB_CATS = ['Tech', 'Sports', 'Arts & Culture', 'Academic', 'Community service', 'Business', 'Outdoors', 'Other'];
// suggestions only, students can type any major
const MAJORS = ['Computer Science', 'General Engineering', 'Engineering & Management Science', 'Business Administration', 'Finance', 'Marketing', 'Economics', 'International Studies', 'Communication', 'Psychology', 'Biotechnology', 'Political Science', 'Human Resource Development', 'Renewable Energy'];
const MIN = 60e3, HR = 36e5, DAY = 864e5;

const ACTS = [
  { k: 'coffee', e: '☕', n: 'Coffee', c: '#ff9f43', def: 'Coffee break' },
  { k: 'food', e: '🍕', n: 'Food', c: '#ff4f9a', def: 'Food run' },
  { k: 'sports', e: '⚽', n: 'Sports', c: '#3b82f6', def: 'Pickup game' },
  { k: 'study', e: '📚', n: 'Study', c: '#2ed3a0', def: 'Study session' },
  { k: 'walk', e: '🌅', n: 'Walk', c: '#f97316', def: 'Walk & talk' },
  { k: 'hike', e: '🥾', n: 'Hike', c: '#16a34a', def: 'Hike' },
  { k: 'games', e: '🎲', n: 'Games', c: '#a855f7', def: 'Game night' },
  { k: 'movie', e: '🎬', n: 'Movie', c: '#ef4444', def: 'Movie night' },
  { k: 'music', e: '🎵', n: 'Music', c: '#ec4899', def: 'Jam session' },
  { k: 'trip', e: '🚌', n: 'Trip', c: '#14b8a6', def: 'Day trip' },
  { k: 'talk', e: '🎤', n: 'Talk', c: '#6366f1', def: 'Guest talk' },
  { k: 'workshop', e: '🛠️', n: 'Workshop', c: '#0ea5e9', def: 'Workshop' },
  { k: 'volunteer', e: '🤝', n: 'Volunteer', c: '#e11d48', def: 'Volunteering' },
];

// where each kind of hangout usually happens, and what simulated students tend to start
const ACT_PLACE = { coffee: 'cafeteria', food: 'restaurants', sports: 'sports', study: 'library', walk: 'park', hike: 'cedars', games: 'dorm', movie: 'auditorium', music: 'auditorium', trip: 'downtown', talk: 'auditorium', workshop: 'library', volunteer: 'cafeteria' };
const BOT_HANGOUTS = {
  coffee: ['Coffee and a chat', 'Cafeteria coffee run'], food: ['Late-night snack run', 'Pizza night'],
  sports: ['Pickup basketball', 'Volleyball at the sports complex'], study: ['Group study for finals', 'Quiet study hour'],
  walk: ['Evening walk in the park'], hike: ['Sunrise hike', 'Cedar forest wander'], games: ['FIFA tournament', 'Card games night'],
  movie: ['Movie night, bring snacks'], music: ['Open mic jam'], trip: ['Day trip to Azrou'],
  talk: ['Student-led talk'], workshop: ['Skills swap workshop'], volunteer: ['Clothing swap and donation table'],
};

// Real coordinates: library, cafeteria, restaurants and auditorium come from OpenStreetMap,
// the dorm cluster is the middle of the numbered residential buildings, the sports field is the centre of the running track
// (read off the satellite view). Ifrane downtown and the cedar forest are approximate.
// `kind` drives the pin colours, like the categories on a campus map.
const KINDS = {
  food: { c: '#f59e0b', e: '🍴', n: 'Food' },
  housing: { c: '#4a9ff5', e: '🛏️', n: 'Housing' },
  sports: { c: '#22c55e', e: '⚽', n: 'Sports' },
  study: { c: '#14b8a6', e: '📚', n: 'Study' },
  hall: { c: '#a855f7', e: '🎭', n: 'Events' },
  nature: { c: '#16a34a', e: '🌲', n: 'Outdoors' },
  town: { c: '#94a3b8', e: '🏘️', n: 'Town' },
};
const PLACES = {
  cafeteria: { n: 'Cafeteria', kind: 'food', lat: 33.53927, lng: -5.10607 },
  restaurants: { n: 'Campus restaurants', kind: 'food', lat: 33.53931, lng: -5.10577 },
  library: { n: 'Mohammed VI Library', kind: 'study', lat: 33.53978, lng: -5.10724 },
  auditorium: { n: 'Main Auditorium', kind: 'hall', lat: 33.53762, lng: -5.10659 },
  sports: { n: 'Sports field', kind: 'sports', lat: 33.54089, lng: -5.10862 }, // centre of the running track, read off the satellite view
  dorm: { n: 'Dorm buildings', kind: 'housing', lat: 33.5405, lng: -5.1055 },
  park: { n: "Parc d'Ifrane", kind: 'nature', lat: 33.54183, lng: -5.1074 },
  downtown: { n: 'Ifrane downtown', kind: 'town', lat: 33.5276, lng: -5.1074, off: true },
  cedars: { n: 'Cedar forest (Azrou)', kind: 'nature', lat: 33.4081, lng: -5.2331, off: true },
};
const CAMPUS = Object.keys(PLACES).filter(k => !PLACES[k].off);
const NEAR_M = 100; // "friend nearby" radius in metres
const dist = (a, b) => { // metres between two {lat,lng}
  const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};
const placeDist = (p, q) => dist(PLACES[p], PLACES[q]);
// Exact positions: a marker sits where the person really is. `place` is only the nearest named spot, used for labels.
const posOf = u => ({ lat: u.loc?.lat ?? PLACES[u.loc?.place]?.lat, lng: u.loc?.lng ?? PLACES[u.loc?.place]?.lng });
const hPos = h => ({ lat: h.lat ?? PLACES[h.place]?.lat, lng: h.lng ?? PLACES[h.place]?.lng });
const nearestPlace = (lat, lng) => Object.keys(PLACES).sort((a, b) => dist({ lat, lng }, PLACES[a]) - dist({ lat, lng }, PLACES[b]))[0];
const placeLabel = u => { const p = PLACES[u.loc?.place]; return p ? `${dist(posOf(u), p) <= 70 ? 'at' : 'near'} ${p.n}` : 'on campus'; };

const STICKERS = [
  { id: 'yalla', e: '🏃', t: 'YALLA!', bg: '#ff7eb3' },
  { id: 'omw', e: '🛵', t: 'OMW', bg: '#3b82f6' },
  { id: 'down', e: '🙋', t: "I'M DOWN", bg: '#2ed3a0' },
  { id: 'lol', e: '😂', t: 'LOL', bg: '#ff9f43' },
  { id: 'love', e: '💖', t: 'BESTIE', bg: '#ff4f9a' },
  { id: 'fire', e: '🔥', t: "LET'S GO", bg: '#ef4444' },
  { id: 'coffee', e: '☕', t: 'COFFEE?', bg: '#a16207' },
  { id: 'pizza', e: '🍕', t: 'FOOD?', bg: '#f97316' },
  { id: 'seat', e: '💺', t: 'SAVE A SEAT', bg: '#8b5cf6' },
  { id: 'cold', e: '🥶', t: 'FREEZING', bg: '#0ea5e9' },
  { id: 'party', e: '🥳', t: 'PARTY', bg: '#ec4899' },
  { id: 'sleepy', e: '😴', t: 'SO TIRED', bg: '#64748b' },
  { id: 'study', e: '📚', t: 'STUDY?', bg: '#14b8a6' },
  { id: 'wave', e: '👋', t: 'HEY!', bg: '#eab308' },
  { id: 'gg', e: '🏆', t: 'GG', bg: '#d97706' },
  { id: 'snow', e: '❄️', t: 'SNOW DAY', bg: '#38bdf8' },
];

const TIERS = [
  { min: 10, e: '👑', n: 'Campus Legend' },
  { min: 6, e: '🦋', n: 'Social Butterfly' },
  { min: 3, e: '😎', n: 'Regular' },
  { min: 0, e: '🌱', n: 'Newbie' },
];

const AVATAR_COLORS = ['#ff7eb3', '#ff9f43', '#2ed3a0', '#3b82f6', '#a855f7', '#f43f5e'];

const BOT_LINES = [
  "yalla I'm in! 🙌", 'omw 🏃', 'what time exactly?', 'save me a seat 😂', 'I can bring snacks',
  'count me in!', 'who else is coming?', 'haha love this', 'see you there 🔥', "can't wait",
  'is it still on?', 'bringing a friend, ok?',
];

// Sample clubs for the demo. These are generic placeholders, not real clubs.
const SEED_CLUBS = [
  { id: 'c_tech', name: 'Tech & Robotics Club', category: 'Tech', color: '#3b82f6', verified: true, bio: 'We build things together.', meets: 'Thursdays 7 PM, Library',
    summary: 'Workshops, hack nights and build sessions for everyone who likes making things work. All majors and all levels are welcome, no experience needed.',
    admins: ['u_youssef', 'u_demo'], roles: { u_youssef: 'President', u_demo: 'Vice president' }, members: ['u_amine'], requests: ['u_imane'] },
  { id: 'c_drama', name: 'Drama Club', category: 'Arts & Culture', color: '#a855f7', verified: true, bio: 'Rehearsals, open mics and the big spring show.', meets: 'Tuesdays 6 PM, Main Auditorium',
    summary: 'We stage a show every spring and run open mic nights through the year. Actors, writers, lighting and sound people are all part of the family.',
    admins: ['u_nora'], roles: { u_nora: 'President' }, members: ['u_salma'], requests: ['u_lina'] },
  { id: 'c_hike', name: 'Hiking & Outdoors Club', category: 'Outdoors', color: '#16a34a', verified: true, bio: 'Weekend hikes around Ifrane.', meets: 'Fridays 5 PM, main gate',
    summary: 'We explore the cedar forests and trails around Ifrane every weekend. We share rides, gear and snacks, and nobody gets left behind.',
    admins: ['u_mohammed'], roles: { u_mohammed: 'President' }, members: ['u_sara'], requests: [] },
  { id: 'c_help', name: 'Helping Hands', category: 'Community service', color: '#e11d48', verified: true, bio: 'Donation drives and volunteering.', meets: 'Mondays 5:30 PM, cafeteria',
    summary: 'Donation drives, clothing swaps and volunteering on and around campus. We partner with local associations and with other clubs.',
    admins: ['u_kofi', 'u_sara'], roles: { u_kofi: 'President', u_sara: 'Treasurer' }, members: ['u_demo', 'u_nora', 'u_amine'], requests: [] },
];
const CLUB_POSTS = {
  Tech: [['workshop', 'Build night: bring a laptop'], ['talk', 'Demo day: show what you built']],
  'Arts & Culture': [['music', 'Open rehearsal, everyone welcome'], ['movie', 'Film night + discussion']],
  Outdoors: [['hike', 'Sunrise hike sign-up'], ['trip', 'Day trip planning meeting']],
};

const SEED_USERS = [
  { id: 'u_mohammed', name: 'Mohammed', major: 'Business Administration', year: 'Senior', gradYear: 2027, emoji: '😎', color: '#ff9f43' },
  { id: 'u_salma', name: 'Salma', major: 'Communication', year: 'Junior', emoji: '🌸', color: '#ff4f9a' },
  { id: 'u_youssef', name: 'Youssef', major: 'Computer Science', year: 'Sophomore', emoji: '🧢', color: '#8b5cf6' },
  { id: 'u_imane', name: 'Imane', major: 'Engineering & Management Science', year: 'Senior', gradYear: 2027, emoji: '📚', color: '#2ed3a0' },
  { id: 'u_omar', name: 'Omar', major: 'Finance', year: 'Junior', emoji: '⚽', color: '#3b82f6' },
  { id: 'u_lina', name: 'Lina', major: 'Psychology', year: 'Freshman', emoji: '🎧', color: '#a855f7' },
  { id: 'u_amine', name: 'Amine', major: 'General Engineering', year: 'Sophomore', emoji: '🔧', color: '#f97316' },
  { id: 'u_sara', name: 'Sara', major: 'International Studies', year: 'Junior', emoji: '🦋', color: '#ec4899' },
  { id: 'u_kofi', name: 'Kofi', major: 'Economics', year: 'Senior', gradYear: 2026, emoji: '🥁', color: '#14b8a6' },
  { id: 'u_nora', name: 'Nora', major: 'Biotechnology', year: 'Freshman', emoji: '🎨', color: '#eab308' },
];

// ───────────────────────── tiny helpers ─────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Math.random().toString(36).slice(2, 9);
const pick = a => a[Math.floor(Math.random() * a.length)];
const act = k => ACTS.find(a => a.k === k) || ACTS[0];
const stk = id => STICKERS.find(s => s.id === id) || STICKERS[0];
const tierOf = n => TIERS.find(t => n >= t.min);
const hhmm = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function fmtWhen(ts) {
  const diff = ts - Date.now();
  if (diff < 0) return diff > -3 * HR ? 'Happening now' : 'Ended';
  if (diff < HR) return `in ${Math.max(1, Math.round(diff / MIN))} min`;
  const d = new Date(ts), today = new Date();
  const tmr = new Date(today.getTime() + DAY);
  const t = hhmm(ts);
  if (d.toDateString() === today.toDateString()) return `Today · ${t}`;
  if (d.toDateString() === tmr.toDateString()) return `Tomorrow · ${t}`;
  return `${d.toLocaleDateString([], { weekday: 'short' })} · ${t}`;
}
function ago(ts) {
  const m = Math.round((Date.now() - ts) / MIN);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

const since = ts => { const a = ago(ts); return a === 'now' ? 'just now' : `${a} ago`; };

const I = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.7 0 4.5 1.8 4.5 4.8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M3 11.5L21 3l-8.5 18-2.2-7.3z"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4"/>',
  hex: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.4 2.4 2 4 2s3-.6 4-2M9 9.5h.01M15 9.5h.01"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

// ───────────────────────── store ─────────────────────────
const KEY = 'yalla.db.v6', SKEY = 'yalla.session.v6';
let db = null, me = null;

async function sha(text, salt) {
  const s = `${salt}:${text}`;
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; // FNV-1a fallback for non-secure contexts
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// What each simulated student tends to do, so their favourite spots and summary make sense.
// p = spot weights, t = [morning, afternoon, evening, night]
const HABITS = {
  u_mohammed: { p: { cafeteria: 4, sports: 3, downtown: 3, restaurants: 2 }, t: [1, 3, 4, 2] },
  u_salma: { p: { library: 3, park: 3, downtown: 3, cafeteria: 2 }, t: [2, 4, 3, 1] },
  u_youssef: { p: { library: 5, dorm: 4, cafeteria: 2 }, t: [1, 3, 4, 5] },
  u_imane: { p: { library: 6, cafeteria: 2, dorm: 2 }, t: [4, 4, 2, 1] },
  u_omar: { p: { sports: 6, cafeteria: 3, dorm: 2 }, t: [2, 3, 5, 1] },
  u_lina: { p: { dorm: 6, library: 2, cafeteria: 2 }, t: [1, 7, 3, 1] },
  u_amine: { p: { sports: 3, dorm: 4, cafeteria: 2 }, t: [1, 3, 4, 3] },
  u_sara: { p: { restaurants: 5, downtown: 4, park: 3 }, t: [1, 3, 5, 2] },
  u_kofi: { p: { restaurants: 5, cafeteria: 3, sports: 2 }, t: [1, 4, 4, 2] },
  u_nora: { p: { library: 4, park: 3, auditorium: 2, dorm: 2 }, t: [3, 4, 3, 1] },
  u_demo: { p: { library: 4, dorm: 4, cafeteria: 3, restaurants: 1 }, t: [1, 3, 4, 4] },
};
// days each simulated student opened the app recently (drives the 🦋 Butterfly badge)
const SEED_DAYS = { u_mohammed: 12, u_salma: 10, u_lina: 8, u_sara: 6, u_kofi: 5, u_youssef: 4, u_amine: 3, u_nora: 3, u_omar: 2, u_imane: 2 };
const seedDays = n => Array.from({ length: n }, (_, i) => new Date(Date.now() - i * DAY).toISOString().slice(0, 10));
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
// little illustrated portraits so the demo accounts have faces, not emoji
function faceAvatar(seed, bg) {
  const r = rng('face:' + seed), S = 192, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d'), any = a => a[Math.floor(r() * a.length)];
  const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, shade(bg, 1.12)); g.addColorStop(1, shade(bg, 0.78)); x.fillStyle = g; x.fillRect(0, 0, S, S);
  const skin = any(['#f6d5bd', '#efc1a0', '#dba37c', '#bc7f58', '#8f5c3d', '#6d432a']);
  const hair = any(['#2a1c14', '#4b3020', '#7b4b2a', '#c08a4b', '#171717', '#8b3a2a']);
  const shirt = any(['#ffffff', '#1f2937', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']);
  const scarf = any(['#ff7eb3', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#1f2937']);
  const style = any(['short', 'long', 'curly', 'scarf', 'cap']);
  const el = (cx, cy, rx, ry, fill) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
  el(96, 198, 76, 54, shirt);
  if (style === 'long') el(96, 104, 50, 66, hair);
  if (style === 'curly') { for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; el(96 + Math.cos(a) * 44, 86 + Math.sin(a) * 42, 17, 17, hair); } el(96, 86, 44, 36, hair); }
  if (style === 'scarf') { el(96, 96, 52, 64, scarf); el(96, 136, 44, 28, scarf); }
  else el(96, 142, 15, 22, shade(skin, 0.92));
  el(96, 92, style === 'scarf' ? 33 : 38, style === 'scarf' ? 41 : 46, skin);
  if (style === 'short') { x.fillStyle = hair; x.beginPath(); x.ellipse(96, 68, 40, 26, 0, Math.PI, 0); x.fill(); }
  if (style === 'long' || style === 'curly') { x.fillStyle = hair; x.beginPath(); x.ellipse(96, 66, 40, 22, 0, Math.PI, 0); x.fill(); }
  if (style === 'cap') { x.fillStyle = shirt === '#ffffff' ? '#ef4444' : shirt; x.beginPath(); x.ellipse(96, 66, 41, 28, 0, Math.PI, 0); x.fill(); x.fillRect(58, 64, 76, 8); x.fillRect(96, 64, 50, 6); }
  if (style === 'scarf') { x.fillStyle = scarf; x.beginPath(); x.ellipse(96, 60, 40, 18, 0, Math.PI, 0); x.fill(); }
  el(82, 94, 4.5, 5.5, '#2b2b2b'); el(110, 94, 4.5, 5.5, '#2b2b2b');
  x.strokeStyle = hair; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(75, 83); x.lineTo(89, 82); x.moveTo(103, 82); x.lineTo(117, 83); x.stroke();
  x.strokeStyle = '#9a3d3d'; x.lineWidth = 3.4; x.beginPath(); x.arc(96, 106, 13, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
  el(74, 108, 7, 4, 'rgba(255,110,110,.28)'); el(118, 108, 7, 4, 'rgba(255,110,110,.28)');
  return cv.toDataURL('image/jpeg', 0.82);
}
// an illustrated "stand at the university fair" so clubs have pictures in the demo (real clubs upload their own)
function fairPhoto(name, color, seed) {
  const r = rng('fair:' + seed), W = 480, H = 320, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#bfe3ff'); sky.addColorStop(0.62, '#fff1d6'); x.fillStyle = sky; x.fillRect(0, 0, W, H);
  x.fillStyle = '#7cc08a'; x.beginPath(); x.ellipse(110, 250, 230, 70, 0, 0, 7); x.fill();
  x.fillStyle = '#5aa874'; x.beginPath(); x.ellipse(400, 262, 200, 60, 0, 0, 7); x.fill();
  x.fillStyle = '#e0cfae'; x.fillRect(0, 244, W, 76);
  const tx = 70 + Math.floor(r() * 150), tw = 210;
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : color; x.fillRect(tx + (i * tw) / 8, 112, tw / 8 + 1, 44); }
  x.fillStyle = shade(color, 0.7); x.fillRect(tx - 6, 106, tw + 12, 8);
  x.fillStyle = '#ffffff'; x.fillRect(tx + 18, 164, tw - 36, 40);
  x.fillStyle = shade(color, 0.7); x.font = '900 17px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(name.slice(0, 24), tx + tw / 2, 190);
  x.fillStyle = shade(color, 0.85); x.fillRect(tx + 10, 212, tw - 20, 16);
  const shirts = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#111827'];
  for (let i = 0; i < 6; i++) {
    const px = 24 + r() * 430, py = 258 + r() * 40, c = shirts[Math.floor(r() * shirts.length)];
    x.fillStyle = c; x.beginPath(); x.ellipse(px, py + 20, 13, 20, 0, 0, 7); x.fill();
    x.fillStyle = ['#f6d5bd', '#dba37c', '#8f5c3d'][Math.floor(r() * 3)]; x.beginPath(); x.arc(px, py - 6, 9, 0, 7); x.fill();
  }
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 0, W, 34); x.fillStyle = '#fff'; x.font = '800 15px system-ui, sans-serif'; x.textAlign = 'left'; x.fillText('UNIVERSITY FAIR 2026', 14, 22);
  return cv.toDataURL('image/jpeg', 0.7);
}
function logoAvatar(name, color) {
  const S = 192, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, shade(color, 1.2)); g.addColorStop(1, shade(color, 0.78)); x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 8; x.beginPath(); x.arc(96, 96, 76, 0, Math.PI * 2); x.stroke();
  const ini = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  x.fillStyle = '#fff'; x.font = '900 62px Nunito, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ini, 96, 102);
  return cv.toDataURL('image/jpeg', 0.85);
}
function seedLoc(spots, now) {
  const place = pick(spots), prev = pick(spots), P = PLACES[place], Q = PLACES[prev];
  const lat = P.lat + (Math.random() - 0.5) * 0.0006, lng = P.lng + (Math.random() - 0.5) * 0.0008;
  return { place, prev: prev === place ? null : prev, lat, lng, trail: prev === place ? [] : [[Q.lat, Q.lng], [lat, lng]], ts: now - Math.random() * 12 * MIN };
}
function makeVisits(habit, now) {
  const wpick = w => { let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k; return Object.keys(w)[0]; };
  const hours = [[8, 11], [12, 16], [17, 21], [22, 26]];
  return Array.from({ length: 48 }, () => {
    const [lo, hi] = hours[+wpick(Object.fromEntries(habit.t.map((v, i) => [i, v])))];
    const d = new Date(now - Math.floor(Math.random() * 14) * DAY);
    d.setHours((lo + Math.floor(Math.random() * (hi - lo))) % 24, Math.floor(Math.random() * 60));
    return { p: wpick(habit.p), ts: d.getTime() };
  }).sort((a, b) => a.ts - b.ts);
}

async function seed() {
  const now = Date.now();
  const soon = hrs => Math.ceil((now + hrs * HR) / (15 * MIN)) * 15 * MIN;
  const salt = uid('s');
  const spots = CAMPUS;
  const botBesties = { u_salma: ['u_demo', 'u_sara'], u_lina: ['u_demo', 'u_salma'], u_mohammed: ['u_demo', 'u_kofi'] };
  const users = SEED_USERS.map(u => ({
    ...u, email: `${u.id.slice(2)}@${SEED_MAIL}`, bot: true, besties: botBesties[u.id] || [], seenAt: 0,
    shareLoc: u.id !== 'u_youssef', loc: seedLoc(spots, now), // Youssef is in ghost mode so ghost behaviour shows up in the demo
    prefs: null, interests: [], alerts: true, hidden: [],
    photo: null, favSpots: [], visits: makeVisits(HABITS[u.id], now), showTaste: true, nearAlerts: true, remix: 0, days: seedDays(SEED_DAYS[u.id] ?? 2),
  }));
  users.find(u => u.id === 'u_lina').loc.ts = now - 70 * MIN; // idle: shows the 🌙 on the map
  const demoPrefs = newPrefs(['study', 'games', 'coffee']);
  demoPrefs.place = { library: 2, dorm: 1.5 }; demoPrefs.tod = { evening: 2 };
  users.push({
    id: 'u_demo', name: 'Ayoub', email: DEMO.email, salt, passHash: await sha(DEMO.password, salt),
    major: 'Computer Science', year: 'Junior', emoji: '🦊', color: '#ff7eb3', besties: ['u_salma', 'u_lina'], seenAt: 0,
    shareLoc: true, loc: { place: 'library', lat: PLACES.library.lat + 0.0001, lng: PLACES.library.lng - 0.0001, trail: [], ts: now - 4 * MIN }, prefs: demoPrefs, interests: ['study', 'games', 'coffee'], alerts: true, hidden: [],
    photo: null, favSpots: ['library'], visits: makeVisits(HABITS.u_demo, now), showTaste: true, nearAlerts: true, remix: 0, days: seedDays(3),
    views: [{ by: 'u_sara', ts: now - 25 * MIN, n: 2 }, { by: 'u_omar', ts: now - 3 * HR, n: 1 }, { by: 'u_kofi', ts: now - DAY, n: 1 }],
  });
  const following = { u_salma: ['c_drama', 'c_hike'], u_youssef: ['c_tech'], u_amine: ['c_tech'], u_nora: ['c_drama'], u_mohammed: ['c_hike'], u_sara: ['c_hike', 'c_help'], u_kofi: ['c_help'], u_imane: ['c_tech'], u_demo: ['c_tech', 'c_drama', 'c_help'] };
  users.forEach(u => { u.following = following[u.id] || []; });
  // the creator: one known account that every user can message
  users.push({
    id: CREATOR_ID, name: 'Hadil', email: `creator@${SEED_MAIL}`, bot: true, major: '', year: '', emoji: '💖', color: '#ff7eb3',
    besties: [], following: [], seenAt: 0, shareLoc: false, loc: null, prefs: null, interests: [], alerts: true, hidden: [], photo: null,
    favSpots: [], visits: [], showTaste: false, nearAlerts: false, remix: 0, days: [],
    bio: 'I built Yalla for campus communities. Message me with ideas, bugs and hellos.',
  });
  SEED_CLUBS.forEach(c => users.push({
    ...c, type: 'club', email: `${c.id.slice(2)}@${SEED_MAIL}`, bot: true, besties: [], following: [], seenAt: 0, shareLoc: false, loc: null,
    prefs: null, interests: [], alerts: true, hidden: [], photo: null, favSpots: [], visits: [], showTaste: false, nearAlerts: false, remix: 0, major: '', year: '', posts: [], sugs: [],
  }));
  // each club has a community: announcements, a chat for members, and a suggestion box
  const COMM = {
    c_help: { posts: [['u_kofi', 'Donation drive TODAY next to Building 1 🤝 Bring clothes, books and non-perishable food. We are there until 6 PM.', 20]], sugs: [['u_nora', 'Could we also collect school supplies for the village schools?', 300, ['u_sara', 'u_kofi'], 'planned']] },
    c_tech: { posts: [['u_youssef', 'Arduino kits arrive this week. RSVP to the workshop so we order enough.', 600]], sugs: [['u_amine', 'A beginner track for people who have never coded?', 900, ['u_youssef', 'u_imane'], 'seen'], ['u_imane', 'Can we run hack night on a weekend?', 200, [], 'new']] },
    c_drama: { posts: [['u_nora', 'Auditions for the spring show open next month. Start thinking about a monologue 🎭', 1400]], sugs: [] },
    c_hike: { posts: [['u_mohammed', 'Saturday hike: meet at the main gate at 8:30. Bring water.', 500]], sugs: [['u_sara', 'Can we add a sunset hike once a month?', 700, ['u_mohammed'], 'new']] },
  };
  Object.entries(COMM).forEach(([id, c]) => {
    const club = users.find(u => u.id === id);
    club.posts = c.posts.map(([by, text, agoMin]) => ({ id: uid('p_'), ts: now - agoMin * MIN, by, text, hangoutId: null }));
    club.sugs = c.sugs.map(([from, text, agoMin, votes, status]) => ({ id: uid('s_'), ts: now - agoMin * MIN, from, text, votes, status }));
  });
  users.forEach(u => { if (isClub(u)) u.photo = logoAvatar(u.name, u.color); else if (u.id !== CREATOR_ID) u.photo = faceAvatar(u.id, u.color); });
  users.filter(isClub).forEach((c, i) => {
    c.gallery = [['Our stand at the University Fair', 'a'], ['Sign-up table and banner', 'b']].map(([cap, k], j) => ({ id: uid('g_'), img: fairPhoto(c.name, c.color, c.id + k), cap, ts: now - (i * 2 + j + 3) * DAY }));
    (c.members || []).forEach(id => { const m = users.find(u => u.id === id); if (m && !m.following.includes(c.id)) m.following.push(c.id); });
  });
  const H = (id, host, a, title, place, when, max, desc, members) => ({ id, host, act: a, title, place, when, max, desc, members });
  const hangouts = [
    H('h1', 'u_salma', 'walk', 'Sunset walk in Parc d\'Ifrane', 'park', soon(3), 10, 'Easy loop through the park. Bring a jacket, it gets cold fast.', ['u_salma', 'u_mohammed', 'u_lina', 'u_kofi', 'u_sara']),
    H('h2', 'u_omar', 'sports', '5-a-side football', 'sports', soon(5), 10, 'Need two more per team. All levels welcome, we just want to play.', ['u_omar', 'u_mohammed', 'u_amine', 'u_youssef', 'u_kofi']),
    H('h5', 'u_lina', 'games', 'Board games night', 'dorm', soon(4.5), 8, 'Catan, Uno, Codenames… bring your own favourites. Snacks provided.', ['u_lina', 'u_youssef', 'u_imane', 'u_mohammed']),
    H('h3', 'u_imane', 'study', 'Finals prep + coffee', 'library', soon(22), 6, 'Quiet study first, coffee break after. Bring your notes.', ['u_imane', 'u_nora', 'u_lina', 'u_demo']),
    H('h6', 'u_kofi', 'food', 'Tacos in downtown Ifrane', 'downtown', soon(27), 8, 'Food run after class. Split the bill, everyone pays their own.', ['u_kofi', 'u_sara']),
    H('h4', 'u_mohammed', 'hike', 'Cedar forest hike', 'cedars', soon(46), 12, 'Half-day hike. We leave from the main gate, carpool split between drivers.', ['u_mohammed', 'u_salma', 'u_sara', 'u_amine', 'u_nora', 'u_youssef']),
  ];
  const clubEvent = (...a) => Object.assign(H(...a), { club: true });
  hangouts.push(
    clubEvent('hc1', 'c_drama', 'music', 'Open mic night', 'auditorium', soon(30), 100, 'Sign up to perform or just come cheer. Snacks provided.', ['c_drama', 'u_salma', 'u_nora']),
    clubEvent('hc2', 'c_tech', 'workshop', 'Intro to Arduino workshop', 'library', soon(52), 30, 'Bring a laptop. Kits are provided, no experience needed.', ['c_tech', 'u_youssef', 'u_amine']),
    clubEvent('hc3', 'c_hike', 'hike', 'Weekend cedar forest hike', 'cedars', soon(76), 40, 'Meet at the main gate. Bring water and good shoes.', ['c_hike', 'u_mohammed', 'u_sara']),
  );
  hangouts.push(Object.assign(clubEvent('hc4', 'c_help', 'volunteer', 'Donation drive', 'cafeteria', soon(1.5), 200, 'Bring clothes, books and non-perishable food. Every bit helps.', ['c_help', 'u_kofi', 'u_sara']), { where: 'Next to Building 1', by: 'u_kofi' }));
  ['hc1', 'hc2', 'hc3', 'hc4'].forEach((id, i) => {
    const h = hangouts.find(x => x.id === id), c = users.find(u => u.id === h.host);
    (c.posts ||= []).push({ id: uid('p_'), ts: now - [900, 800, 700, 80][i] * MIN, by: h.by || null, text: '', hangoutId: id });
  });
  // two collaborations: one invitation waiting for Tech & Robotics to answer, one already accepted
  hangouts.push(Object.assign(clubEvent('hc5', 'c_drama', 'workshop', 'Backstage tech night', 'auditorium', soon(60), 40, 'Lighting, sound and stage. Come learn how a show really runs.', ['c_drama']), { cohosts: [{ club: 'c_tech', status: 'pending' }], by: 'u_nora' }));
  hangouts.push(Object.assign(clubEvent('hc6', 'c_hike', 'hike', 'Cleanup hike', 'cedars', soon(100), 40, 'We hike and clean the trail together. Gloves and bags provided.', ['c_hike', 'c_help', 'u_mohammed']), { cohosts: [{ club: 'c_help', status: 'accepted' }], by: 'u_mohammed' }));
  [['c_drama', 'hc5', 500, 'u_nora'], ['c_hike', 'hc6', 400, 'u_mohammed'], ['c_help', 'hc6', 380, 'u_mohammed']].forEach(([cid, hid, ago, by]) => users.find(u => u.id === cid).posts.push({ id: uid('p_'), ts: now - ago * MIN, by, text: '', hangoutId: hid }));
  const m = (from, text, agoMin) => ({ id: uid('m_'), from, text, ts: now - agoMin * MIN });
  const sys = (text, agoMin) => ({ id: uid('m_'), sys: true, text, ts: now - agoMin * MIN });
  const chats = {
    'h:h1': [sys('Salma started this hangout', 300), m('u_salma', 'Meet at the park entrance 🌅', 90), m('u_kofi', "I'll bring tea!", 60), m('u_lina', "yalla, I'm in 🙌", 35)],
    'h:h2': [sys('Omar started this hangout', 400), m('u_omar', 'We have 5, need 5 more!', 120), m('u_amine', 'bringing the ball', 70)],
    'h:h5': [sys('Lina started this hangout', 200), m('u_lina', 'Who knows how to play Catan?', 50), m('u_youssef', 'me, and I will win', 44)],
    'h:h3': [sys('Imane started this hangout', 700), m('u_imane', 'Third floor, quiet section', 300), m('u_nora', 'saving seats ✌️', 180)],
    'h:h6': [sys('Kofi started this hangout', 500), m('u_kofi', 'Anyone tried the new taco place?', 240)],
    'h:h4': [sys('Mohammed started this hangout', 800), m('u_mohammed', 'Weather looks perfect', 600), m('u_sara', 'I need new hiking shoes 😅', 400), m('u_amine', 'Bringing a speaker', 200)],
    [dmKey('u_demo', 'u_salma')]: [m('u_salma', 'heyy are you coming to the lake walk?', 180), m('u_demo', 'thinking about it!', 170), m('u_salma', 'you should, it will be fun 🌅', 165), m('u_demo', 'ok convinced', 160)],
    [dmKey('u_demo', 'u_lina')]: [m('u_lina', 'did you finish the psych reading', 900), m('u_demo', 'half of it 😭', 880)],
  };
  chats['h:hc1'] = [sys('Drama Club posted this event', 900), m('c_drama', 'Sign-up sheet is open, 5 minutes per act!', 600), m('u_salma', 'I am doing a monologue 🎭', 300)];
  chats['h:hc2'] = [sys('Tech & Robotics Club posted this event', 800), m('c_tech', 'Kits are limited, RSVP early.', 500), m('u_youssef', 'Count me in', 200)];
  chats['h:hc3'] = [sys('Hiking & Outdoors Club posted this event', 700), m('c_hike', 'Forecast looks great for Saturday.', 400)];
  chats['h:hc4'] = [sys('Helping Hands posted this event', 90), m('c_help', 'We start setting up in 30 minutes. Come by after class!', 40)];
  chats['c:c_help'] = [m('u_kofi', 'Who can help carry the boxes?', 60), m('u_sara', 'I can, see you there', 55), m('u_nora', 'Bringing a bag of books 📚', 30)];
  chats['c:c_tech'] = [m('u_youssef', 'Hack night idea: build a campus bus tracker', 800), m('u_amine', 'I am in', 790)];
  chats['c:c_drama'] = [m('u_nora', 'Anyone want to run lines tonight?', 500)];
  chats['c:c_hike'] = [m('u_mohammed', 'Who has a car for Saturday?', 300), m('u_sara', 'I can take 3 people', 280)];
  chats['h:hc5'] = [sys('Drama Club posted this event', 500)];
  chats['h:hc6'] = [sys('Hiking & Outdoors Club posted this event with Helping Hands', 400), m('c_hike', 'Bring gloves if you have them.', 300)];
  const events = [
    { id: uid('e_'), ts: now - 25 * MIN, kind: 'tier', userId: 'u_mohammed', tier: 'Social Butterfly', met: 9 },
    { id: uid('e_'), ts: now - 70 * MIN, kind: 'join', userId: 'u_sara', hangoutId: 'h4' },
    { id: uid('e_'), ts: now - 150 * MIN, kind: 'new', userId: 'u_lina', hangoutId: 'h5' },
  ];
  return { users, hangouts, chats, events, reports: [] };
}

// what cloud.js is allowed to use from this file
function cloudApi() {
  return {
    get db() { return db; }, set db(v) { db = v; },
    get me() { return me; }, set me(v) { me = v; },
    ui, MATCH_MIN, MIN, HR,
    render, refresh, renderSheet, refreshMessages, toast, esc, dmKey, user, hangout, isClub, evToast, pushEvent, scoreFor, canSeeEvent,
    checkBadges, checkNearby, okPhoto, newPrefs,
  };
}
async function load() {
  if (CLOUD) { db = { users: [], hangouts: [], chats: {}, events: [], reports: [] }; me = null; Cloud.bind(cloudApi()); if ((await Cloud.restore()) === 'recovery') ui.recovery = true; return; }
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || !db.users) { db = await seed(); save(); }
  db.reports ||= [];
  let sid = null;
  try { sid = localStorage.getItem(SKEY); } catch { /* storage blocked */ }
  me = sid ? user(sid) || null : null;
}
let storageWarned = false;
function save() {
  if (CLOUD) { Cloud.scheduleSave(); return; } // shared data lives on the server; only this account's private state is saved
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { if (!storageWarned) { storageWarned = true; toast('Storage is full or blocked, so new changes may not be kept. Remove some photos.', 6000); } }
}

// ───────────────────────── selectors ─────────────────────────
const GHOST = { id: '?', name: 'Someone', emoji: '👤', color: '#9ca3af', besties: [] };
const user = id => db.users.find(u => u.id === id) || null;
const U = id => user(id) || GHOST;
const hangout = id => db.hangouts.find(h => h.id === id);
function dmKey(a, b) { return 'dm:' + [a, b].sort().join('|'); }
const msgsOf = key => db.chats[key] || [];
const dmOther = key => key.slice(3).split('|').find(x => x !== me.id);
const metSet = id => {
  const s = new Set();
  db.hangouts.forEach(h => { if (h.members.includes(id)) h.members.forEach(m => m !== id && !isClub(user(m)) && s.add(m)); });
  return s;
};
// people met: in the cloud the server keeps the count (you cannot see everyone's events), so take the larger of the two
const metN = id => (CLOUD ? Math.max(metSet(id).size, user(id)?.metCount || 0) : metSet(id).size);
const sharedCount = (a, b) => db.hangouts.filter(h => h.members.includes(a) && h.members.includes(b)).length;
const dmCount = (a, b) => msgsOf(dmKey(a, b)).filter(m => !m.sys).length;
const score = (a, b) => sharedCount(a, b) * 10 + dmCount(a, b) * 2;
function leaderboard() {
  return peers()
    .map(u => ({ u, met: metN(u.id) }))
    .sort((a, b) => b.met - a.met || a.u.name.localeCompare(b.u.name));
}
function mostHungOut() {
  return peers()
    .filter(u => u.id !== me.id && !isBlocked(me, u))
    .map(u => ({ u, s: score(me.id, u.id), shared: sharedCount(me.id, u.id), dms: dmCount(me.id, u.id) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
}

// ───────────────────────── taste model, picks, location ─────────────────────────
const todOf = ts => { const h = new Date(ts).getHours(); return h >= 22 || h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };
function newPrefs(interests = []) {
  const p = { act: {}, place: {}, tod: {}, t: Date.now() };
  interests.forEach(k => { p.act[k] = 2.5; });
  return p;
}
// Every join, create, view and "show me less" nudges these weights. Older signals fade,
// so the model follows what you do lately.
function bump(u, kind, key, w) {
  const p = (u.prefs ||= newPrefs());
  const days = (Date.now() - (p.t || Date.now())) / DAY;
  if (days > 0.01) {
    const f = Math.pow(0.97, days);
    for (const k of ['act', 'place', 'tod']) for (const x in p[k]) p[k][x] *= f;
    p.t = Date.now();
  }
  p[kind][key] = Math.max(-6, Math.min(12, (p[kind][key] || 0) + w));
}
function learn(u, h, w) {
  bump(u, 'act', h.act, w);
  bump(u, 'place', h.place, w * 0.6);
  bump(u, 'tod', todOf(h.when), w * 0.5);
}
const affinity = (u, kind, key) => Math.tanh(((u.prefs?.[kind] || {})[key] || 0) / 4); // −1..1
const mutual = (a, b) => !!a && !!b && a.besties.includes(b.id) && b.besties.includes(a.id);
const sameMajor = (a, b) => !!a.major && !!b.major && a.major.trim().toLowerCase() === b.major.trim().toLowerCase();

// Every score comes with reasons. They are shown to the user, so picks never feel random.
function scoreFor(u, h) {
  const a = act(h.act), others = h.members.filter(id => id !== u.id).map(id => user(id)).filter(o => o && !isClub(o) && !isGhost(o));
  let s = 0; const why = [];
  const clubHost = h.club ? user(h.host) : null;
  if (clubHost) { s += 1.6; why.push(`You follow ${clubHost.name}`); }
  const fa = affinity(u, 'act', h.act);
  s += fa * 3;
  if (fa > 0.3) why.push(`You like ${a.e} ${a.n}`);
  s += affinity(u, 'place', h.place) * 0.8 + affinity(u, 'tod', todOf(h.when)) * 0.6;
  const best = others.filter(o => u.besties.includes(o.id));
  if (best.length) { s += Math.min(best.length, 3) * 1.4; why.push(best.length === 1 ? `${best[0].name} (bestie) is going` : `${best.length} besties are going`); }
  const known = others.filter(o => !u.besties.includes(o.id) && score(u.id, o.id) > 0);
  if (known.length) { s += Math.min(known.length, 3) * 0.5; if (!best.length) why.push(`${known[0].name} is going`); }
  const maj = others.filter(o => sameMajor(u, o));
  if (maj.length) { s += Math.min(maj.length, 2) * 0.6; why.push(`${maj.length} from your major`); }
  const hrs = (h.when - Date.now()) / HR;
  if (hrs >= 0 && hrs < 4) { s += 0.8; why.push('Starting soon'); }
  const left = h.max - taken(h);
  if (left > 0 && left <= 2) { s += 0.4; why.push('Almost full'); }
  return { s, why };
}
function picksFor(u, limit = 3) {
  const now = Date.now(), hidden = u.hidden || [];
  return visible(u)
    .filter(h => h.when > now && !h.members.includes(u.id) && taken(h) < h.max && !hidden.includes(h.id))
    .map(h => ({ h, ...scoreFor(u, h) }))
    .filter(x => x.s >= PICK_MIN)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
}
// A new hangout was created: ping everyone it is a strong match for.
function notifyMatches(h) {
  if (CLOUD) return; // cloud.js raises these when it sees a new event
  db.users.filter(u => u.passHash && !isClub(u) && u.id !== h.host && u.alerts !== false && canSeeEvent(u, h)).forEach(u => {
    const r = scoreFor(u, h);
    if (r.s < MATCH_MIN) return;
    pushEvent({ kind: 'match', to: u.id, userId: h.host, hangoutId: h.id, why: r.why[0] || '' });
    if (me && u.id === me.id) toast(`<span style="font-size:22px">✨</span><span>New for you: <b>${esc(h.title)}</b><small>${esc(r.why[0] || 'Looks like your kind of plan')}</small></span>`, 6500, { a: 'openHangout', id: h.id });
  });
}
function myVibe(u) {
  const e = Object.entries(u.prefs?.act || {}).filter(([, v]) => v > 0.4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = e[0]?.[1] || 1;
  return e.map(([k, v]) => ({ a: act(k), pct: Math.max(12, Math.round(v / max * 100)) }));
}

// ───── clubs and alumni ─────
const isClub = u => u?.type === 'club';
const students = () => db.users.filter(u => !isClub(u));
const followersOf = id => students().filter(u => (u.following || []).includes(id));
const nFol = c => (CLOUD ? Math.max(c.nFollowers || 0, followersOf(c.id).length) : followersOf(c.id).length);
const nMem = c => (CLOUD ? Math.max(c.nMembers || 0, communityMembers(c).length - 1) : communityMembers(c).length - 1);
// a club's events are only visible to the club itself and the people who follow it
const coClubs = h => (h.cohosts || []).filter(c => c.status === 'accepted').map(c => c.club); // clubs that accepted to co-host
const clubTitle = h => [h.host, ...coClubs(h)].map(id => U(id).name).join(' × ');
// a club event is visible to its host club, the co-hosts that accepted, and the followers of any of them
const canSeeEvent = (u, h) => !h.club || h.host === u.id || coClubs(h).includes(u.id) || [h.host, ...coClubs(h)].some(id => (u.following || []).includes(id));
const invitesFor = c => db.hangouts.filter(h => (h.cohosts || []).some(x => x.club === c.id && x.status === 'pending'));
// everything this account may see; a club account only sees its own events
const visible = u => db.hangouts.filter(h => (isClub(u) ? h.host === u.id || coClubs(h).includes(u.id) : canSeeEvent(u, h)));
const going = h => (CLOUD && h.n != null ? h.n : h.members.filter(id => !isClub(user(id))).length); // clubs host events, they do not attend
const taken = h => (CLOUD && h.n != null ? h.n : h.members.length); // spots taken (the server counts people in ghost mode too)
const isAlumni = u => !isClub(u) && (u.year === 'Alumni' || (!!u.gradYear && Date.now() >= new Date(u.gradYear, 5, 1).getTime()));
const yearLabel = u => (isAlumni(u) ? `Alumni${u.gradYear ? ' · Class of ' + u.gradYear : ''}` : u.year || '');
const subline = u => (isClub(u) ? `📣 ${esc(u.category || 'Club')}` : [u.major ? '🎓 ' + esc(u.major) : 'Student', esc(yearLabel(u))].filter(Boolean).join(' · '));
const peers = () => db.users.filter(u => !isClub(u) && !isCreator(u)); // ordinary students (no creator, no clubs)
const isCreator = u => (CLOUD ? !!u?.isCreator : u?.id === CREATOR_ID);
const creatorUser = () => (CLOUD ? db.users.find(u => u.isCreator) || null : user(CREATOR_ID));
const todayKey = () => new Date().toISOString().slice(0, 10);
function markActive(u) {
  if (CLOUD || !u || isClub(u)) return; // the server records active days
  const d = (u.days ||= []), t = todayKey();
  if (!d.includes(t)) { d.push(t); if (d.length > 60) d.shift(); save(); }
}
const activeDays = (u, span = 14) => new Set((u.days || []).filter(d => Date.now() - new Date(d).getTime() < span * DAY)).size;
// 🦋 Butterfly = you meet lots of people AND you really use the app. ✔ Creator belongs to one account. Everyone else has no badge.
const BUTTERFLY = { met: 6, days: 5, span: 14 };
const earnsButterfly = u => !!u && !isClub(u) && !isCreator(u) && (CLOUD ? !!u.butterfly : metSet(u.id).size >= BUTTERFLY.met && activeDays(u, BUTTERFLY.span) >= BUTTERFLY.days);
const badgeOf = u => (isCreator(u) ? 'creator' : earnsButterfly(u) ? 'butterfly' : null);
const badgeHtml = u => {
  const b = badgeOf(u);
  return b === 'creator' ? ' <span class="bdg creator" title="Creator of Yalla" aria-label="Creator">✔</span>'
    : b === 'butterfly' ? ' <span class="bdg bfly" title="Butterfly: meets lots of people and uses Yalla regularly" aria-label="Butterfly">🦋</span>' : '';
};
const nm = u => esc(u.name) + badgeHtml(u);
function checkBadges(u) {
  if (!u || isClub(u) || u.badgeSeen || !earnsButterfly(u)) return;
  u.badgeSeen = true;
  pushEvent({ kind: 'badge', to: u.id, userId: u.id });
  save();
  if (me && u.id === me.id) toast('<span style="font-size:22px">🦋</span><span>You earned the Butterfly badge<small>You meet lots of people and use Yalla regularly</small></span>', 7000);
}
// Ghost mode hides where you are AND which events you join: no bestie notifications, no name in attendee lists, no public "joined" posts.
const isGhost = u => !!u && !isClub(u) && !isCreator(u) && (CLOUD && u.id !== Cloud.authId ? false : !u.shareLoc); // in the cloud only you know your own ghost mode; the server hides the rest
const GHOSTV = { id: '?', name: 'Ghost', emoji: '👻', color: '#94a3b8', besties: [] };
const viewMember = id => { const u = user(id); return u && id !== me?.id && isGhost(u) ? GHOSTV : U(id); };
// "Salma is going to Board games night": mutual besties are told, unless the person is in ghost mode
function notifyBestiesGoing(h, uid2, hosting = false) {
  if (CLOUD) return; // the server tells besties
  const u = user(uid2);
  if (!u || isGhost(u) || isClub(u)) return;
  db.users.filter(r => r.passHash && !isClub(r) && r.id !== uid2 && mutual(r, u) && canSeeEvent(r, h)).forEach(r => {
    pushEvent({ kind: 'going', to: r.id, userId: uid2, hangoutId: h.id, host: hosting });
    if (me && r.id === me.id) toast(`<span style="font-size:22px">🙌</span><span>${esc(u.name)} is ${hosting ? 'hosting' : 'going to'} ${esc(h.title)}<small>${esc(PLACES[h.place]?.n || '')} · ${fmtWhen(h.when)}</small></span>`, 6500, { a: 'openHangout', id: h.id });
  });
}

// ───── community: announcements, member chat and a suggestion box for every club ─────
const isBlocked = (a, b) => !!a && !!b && ((a.blocked || []).includes(b.id) || (b.blocked || []).includes(a.id));
const isHead = (u, c) => !!u && !!c && (c.admins || []).includes(u.id); // heads own the club and are starred
const isMember = (u, c) => !!u && !!c && (u.id === c.id || isHead(u, c) || (c.members || []).includes(u.id)); // accepted into the community
const follows = (u, c) => !!u && !!c && (u.following || []).includes(c.id);
const inCommunity = (u, c) => isMember(u, c) || follows(u, c); // followers can read the news, only members can chat
const communityMembers = c => [...new Set([c.id, ...(c.admins || []), ...(c.members || [])])];
const audience = c => [...new Set([...communityMembers(c), ...followersOf(c.id).map(u => u.id)])];
const canManage = c => !!me && !!c && me.id === c.id; // admins manage by switching into the club
function postUpdate(c, by, text, hangoutId = null) {
  (c.posts ||= []).unshift({ id: uid('p_'), ts: Date.now(), by, text, hangoutId });
  if (c.posts.length > 80) c.posts.length = 80;
}
function notifyCommunity(c, ev, skip = []) {
  if (CLOUD) return;
  audience(c).filter(id => id !== c.id && !skip.includes(id) && !isClub(user(id))).forEach(id => pushEvent({ to: id, userId: c.id, ...ev }));
}

function announceClubEvent(h) {
  if (CLOUD) return; // the server posts it to the club's news
  const club = user(h.host);
  postUpdate(club, h.by || null, '', h.id);
  followersOf(h.host).forEach(f => {
    pushEvent({ kind: 'club', to: f.id, userId: h.host, hangoutId: h.id });
    if (me && f.id === me.id) toast(`<span style="font-size:22px">📣</span><span>${esc(club.name)} posted<small>${esc(h.title)}</small></span>`, 6500, { a: 'openHangout', id: h.id });
  });
  save();
}

// ───── spot history, favourite spots, and the "take" on your profile ─────
function recordVisit(u, p, ts = Date.now()) {
  (u.visits ||= []).push({ p, ts });
  if (u.visits.length > 300) u.visits.splice(0, u.visits.length - 300);
}
function tasteStats(u) {
  const v = (u.visits || []).filter(x => x.ts > Date.now() - 30 * DAY && PLACES[x.p]);
  const s = { n: v.length, place: {}, kind: {}, tod: { morning: 0, afternoon: 0, evening: 0, night: 0 }, v };
  v.forEach(x => { s.place[x.p] = (s.place[x.p] || 0) + 1; const k = PLACES[x.p].kind; s.kind[k] = (s.kind[k] || 0) + 1; s.tod[todOf(x.ts)]++; });
  return s;
}
// starred spots first, then whatever you actually hang out at
function favoriteSpots(u, limit = 4) {
  const st = tasteStats(u), manual = (u.favSpots || []).filter(k => PLACES[k]);
  const auto = Object.entries(st.place).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter(k => !manual.includes(k));
  return [...manual.map(k => ({ k, star: true })), ...auto.map(k => ({ k, star: false }))].slice(0, Math.max(limit, manual.length));
}
function rng(seed) { // tiny seeded PRNG: a person's take stays the same until they remix it
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
// Affectionate roast built only from what the app can see: where, when and with whom. No grades, health or looks.
const LINES = {
  sleeper: ['{n} sleeps all day and still shows up when it counts.', '{n} treats the afternoon as optional. The group chat disagrees.', '{n} and the dorm lounge are in a committed relationship.'],
  night: ['{n} is nocturnal. When campus goes quiet, {n} gets loud.', 'Night shift legend: {n} peaks when everyone else logs off.'],
  early: ['{n} is up before the cafeteria opens. Suspiciously productive.', 'Morning person {n} finishes the day before the rest of us start it.'],
  library: ['{n} basically lives at the library. Rent is due.', 'The library has one seat that is just {n}\'s now.'],
  foodie: ['{n} knows every plate on campus and half the menus in town.', 'If there is a food plan, {n} is already outside the door.'],
  restaurant: ['The campus restaurants should send {n} a thank-you card.'],
  sports: ['{n} is at the sports field so often it should list {n} as staff.', 'Cardio is {n}\'s love language.'],
  outdoors: ['{n} picks fresh air over fluorescent lights every time.', '{n} would rather be under the trees than in a lecture hall. Allegedly.'],
  social: ['{n} knows half the campus. The other half is on the way.', 'A walk across campus takes {n} an hour because of all the hellos.'],
  host: ['{n} organizes plans nobody asked for and everybody attends.'],
  hermit: ['{n} is a mystery. Rarely seen, always rumored.', '{n} is in stealth mode. Hangouts are an urban legend.'],
  wanderer: ['{n} visits so many spots there should be a stamp card.'],
  coffee: ['{n} runs on cafeteria coffee and optimism.'],
  fresh: ['{n} just arrived. Campus lore is still loading.'],
};
function summaryFor(u) {
  const st = tasteStats(u), n = u.name;
  const met = metN(u.id), joined = db.hangouts.filter(h => h.members.includes(u.id)).length, hosted = db.hangouts.filter(h => h.host === u.id).length;
  const kind = k => st.n ? (st.kind[k] || 0) / st.n : 0, place = k => st.n ? (st.place[k] || 0) / st.n : 0, tod = k => st.n ? st.tod[k] / st.n : 0;
  const dormDay = st.n ? st.v.filter(x => x.p === 'dorm' && ['morning', 'afternoon'].includes(todOf(x.ts))).length / st.n : 0;
  let traits = st.n < 4 ? [['fresh', 1]] : [
    ['sleeper', dormDay > .22 ? dormDay * 3 : 0],
    ['night', tod('night') > .28 ? tod('night') * 2.2 : 0],
    ['early', tod('morning') > .3 ? tod('morning') * 2.2 : 0],
    ['library', place('library') > .25 ? place('library') * 2.4 : 0],
    ['foodie', kind('food') > .35 ? kind('food') * 2.2 : 0],
    ['restaurant', place('restaurants') > .2 ? place('restaurants') * 2 : 0],
    ['sports', kind('sports') > .2 ? kind('sports') * 2.4 : 0],
    ['outdoors', kind('nature') > .2 ? kind('nature') * 2.2 : 0],
    ['social', met >= 6 ? .6 + met / 50 : 0],
    ['host', hosted >= 2 ? 1.1 : 0],
    ['hermit', joined <= 1 && met <= 2 ? 1.2 : 0],
    ['wanderer', Object.keys(st.place).length >= 6 ? .9 : 0],
    ['coffee', (u.interests || []).includes('coffee') || place('cafeteria') > .25 ? .8 : 0],
  ].filter(t => t[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!traits.length) traits = [['fresh', 1]];
  const r = rng(`${u.id}:${u.remix || 0}`), pickLine = k => LINES[k][Math.floor(r() * LINES[k].length)];
  const lines = traits.slice(0, 2).map(t => pickLine(t[0]));
  const top = Object.entries(st.place).sort((a, b) => b[1] - a[1])[0];
  const closers = [];
  if (top) closers.push(`Most spotted at ${PLACES[top[0]].n}.`);
  if (u.major) closers.push(`${u.major} major, allegedly.`, `Studies ${u.major}. Evidence is circumstantial.`);
  if (closers.length) lines.push(closers[Math.floor(r() * closers.length)]);
  return { text: lines.join(' ').replaceAll('{n}', n), n: st.n };
}
const okPhoto = p => typeof p === 'string' && ((p.length < 400000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)) || (CLOUD && Cloud.isPhotoUrl(p)));
// crop to a square and re-encode: also strips camera metadata such as GPS tags
function processPhoto(file, { max = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('That file is not an image'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'), ctx = c.getContext('2d');
      if (max) { // keep the picture's shape, shrink it to fit
        const k = Math.min(1, max / Math.max(img.width, img.height));
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      } else { // square crop for profile pictures
        const S = 256, side = Math.min(img.width, img.height);
        c.width = c.height = S;
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      }
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', max ? 0.76 : 0.82)); // re-encoding also strips camera metadata such as GPS tags
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

// Location: you see someone's campus spot only if you are mutual besties and they are not in ghost mode.
const canSee = (viewer, u) => u.id !== viewer.id && !!u.shareLoc && !!u.loc && mutual(viewer, u) && !isBlocked(viewer, u);
const nearby = viewer => db.users.filter(u => canSee(viewer, u));

const KIND_STATUS = { food: '🍴 eating', study: '📚 studying', sports: '⚽ playing', housing: '🛏️ chilling', hall: '🎭 at an event', nature: '🌲 outside', town: '🏘️ in town' };
const statusOf = u => (u.status || '').trim() || KIND_STATUS[PLACES[u.loc?.place]?.kind] || '';

// "Friend nearby": fires when a mutual bestie who shares their spot comes within NEAR_M metres of you.
function checkNearby(announce = true) {
  if (!me || !me.shareLoc || !me.loc || me.nearAlerts === false) { ui.near = new Set(); return; }
  const now = new Set(nearby(me).filter(u => dist(posOf(me), posOf(u)) <= NEAR_M && Date.now() - u.loc.ts < 45 * MIN).map(u => u.id));
  now.forEach(id => {
    if (ui.near.has(id) || !announce) return;
    if (db.events.some(e => e.kind === 'near' && e.userId === id && e.to === me.id && Date.now() - e.ts < 45 * MIN)) return;
    pushEvent({ kind: 'near', userId: id, to: me.id, place: U(id).loc.place });
    save();
    toast(`<span style="font-size:22px">📍</span><span>Friend nearby<small>${esc(U(id).name)} is ${esc(placeLabel(U(id)))}</small></span>`, 6500, { a: 'focusUser', id });
  });
  ui.near = now;
}
// ───── live location: the browser's GPS "watch", so your position follows you while the app is open ─────
// Limits on purpose: foreground only (a web app cannot track in the background), only on and around campus (so a home
// address is never shared by accident), exact or spot-only, and it stops by itself after the time you chose.
const CAMPUS_CENTER = (() => { const k = CAMPUS.map(x => PLACES[x]); return { lat: k.reduce((s, p) => s + p.lat, 0) / k.length, lng: k.reduce((s, p) => s + p.lng, 0) / k.length }; })();
const LIVE_RADIUS_M = 3000;
let watchId = null, lastFix = null, lastSave = 0, lastRender = 0;
const liveOn = () => !!(me && me.live && me.live.until > Date.now());

function startLive(hours) {
  if (!me || isClub(me)) return;
  if (!navigator.geolocation) return toast("This browser can't share GPS");
  if (!window.isSecureContext) return toast('Live location needs the secure (https) version of Yalla. Use Drop a pin for now.', 6500);
  me.live = { since: Date.now(), until: Date.now() + (hours || 4) * HR, acc: null, state: 'searching' };
  me.shareLoc = true; lastFix = null; save();
  if (CLOUD) Cloud.setSharing(true);
  watchLive(); refresh();
}
function watchLive() {
  if (watchId != null || !liveOn() || !navigator.geolocation) return;
  if (me.live.state !== 'on') me.live.state = 'searching';
  watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function unwatchLive() { if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ } watchId = null; } }
// stopping live location puts you back in ghost mode, so a frozen old position is never left visible
function stopLive(why) {
  unwatchLive();
  if (!me || !me.live) return;
  me.live = null; lastFix = null; me.shareLoc = false; me.loc = null;
  if (CLOUD) Cloud.setSharing(false);
  save(); checkNearby(false);
  if (why === 'expired') toast('<span style="font-size:22px">📡</span><span>Live location ended<small>You are in ghost mode again</small></span>', 6500);
}
function onFix(pos) {
  if (!liveOn()) return stopLive('expired');
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords, now = Date.now();
  me.live.acc = Math.max(1, Math.round(acc || 0)); me.live.state = 'on';
  if (dist({ lat, lng }, CAMPUS_CENTER) > LIVE_RADIUS_M) { // away from campus: nobody sees a location
    me.live.state = 'away';
    if (me.loc) { me.loc = null; save(); checkNearby(false); refresh(); }
    return;
  }
  if (lastFix && acc > 150) return; // ignore very rough fixes once we have a good one
  if (lastFix && dist(lastFix, { lat, lng }) < 5 && now - lastFix.ts < 30e3) return; // standing still: skip, saves battery
  lastFix = { lat, lng, ts: now };
  applyFix(lat, lng, now);
}
function applyFix(lat, lng, now) {
  let place = nearestPlace(lat, lng);
  const old = me.loc, changedPlace = !old || old.place !== place;
  const before = changedPlace && window.L ? exploredIds(me).size : 0;
  if (me.precise === false) { lat = PLACES[place].lat; lng = PLACES[place].lng; } // spot-only sharing
  me.shareLoc = true;
  me.loc = { place, prev: changedPlace && old ? old.place : old?.prev || null, lat, lng, trail: [], acc: me.live.acc, live: true, ts: now };
  const t = (me.trail ||= []), last = t.at(-1);
  if (!last || dist({ lat, lng }, { lat: last[0], lng: last[1] }) > 8) t.push([lat, lng]);
  if (t.length > 120) t.shift();
  if (dist({ lat, lng }, PLACES[place]) <= 150 && now - ((me.visits || []).filter(v => v.p === place).at(-1)?.ts || 0) > 20 * MIN) recordVisit(me, place);
  if (now - lastSave > 10e3) { save(); lastSave = now; }
  checkNearby();
  if (window.L && changedPlace && exploredIds(me).size > before) toast(`<span style="font-size:22px">🗺️</span><span>New area unlocked<small>${exploredPct(me)}% of campus explored</small></span>`);
  const calm = !ui.chat && !ui.sheet && ui.tab === 'home' && !document.activeElement?.matches?.('input, textarea');
  if (ui.tab === 'home' && !ui.chat && map) drawMarkers();
  if (calm && (changedPlace || now - lastRender > 20e3)) { lastRender = now; render(); }
  else if (ui.sheet?.type === 'location') renderSheet();
  publishLocation(me.loc);
}
function onFixError(err) {
  if (!liveOn()) return;
  me.live.state = err.code === 1 ? 'denied' : 'searching';
  if (err.code === 1) { unwatchLive(); toast("Location permission was denied. Allow it in your phone's settings, or drop a pin instead.", 7000); }
  if (ui.sheet?.type === 'location') renderSheet();
}
// where a backend would receive the position, for example an upsert into a "locations" table that mutual besties subscribe to
function publishLocation(loc) { if (CLOUD && loc) Cloud.publishLoc(loc, me.live ? me.live.until : Date.now() + 4 * HR); }
// the phone stops GPS when the app goes to the background, so pause the watch and pick it up again on return
document.addEventListener('visibilitychange', () => {
  if (!me) return;
  if (document.hidden) unwatchLive();
  else if (liveOn()) watchLive();
  else if (me.live) { stopLive('expired'); refresh(); }
});
setInterval(() => { if (me?.live && me.live.until <= Date.now()) { stopLive('expired'); refresh(); } else if (ui.sheet?.type === 'location' && liveOn()) renderSheet(); }, 30e3);
function liveCard() {
  if (!me || isClub(me)) return '';
  const lv = me.live, on = liveOn(), left = on ? Math.max(0, Math.round((lv.until - Date.now()) / MIN)) : 0;
  const state = !on ? '' : lv.state === 'denied' ? 'Permission denied' : lv.state === 'away' ? 'Away from campus, nobody sees a location' : lv.state === 'searching' ? 'Finding you…' : `Live, accurate to about ${lv.acc} m`;
  return `<div class="livecard ${on ? 'on' : ''}">
    <div class="toggle" style="margin-top:0"><span><b>📡 Live location</b><small>${on ? `${esc(state)} · ends in ${left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left} min`}` : 'Update my position automatically while the app is open'}</small></span><button type="button" class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-a="toggleLive" aria-label="Live location"></button></div>
    ${on ? '' : `<div class="when" style="margin-top:10px">${[1, 4, 8].map(h => `<button type="button" class="chip ${(ui.liveHours || 4) === h ? 'on' : ''}" data-a="liveHours" data-k="${h}">${h} hour${h > 1 ? 's' : ''}</button>`).join('')}</div>
    <p class="hint" style="text-align:left;margin-top:8px">Mutual besties see you move on the map. It only works while Yalla is open, only on and near campus, and stops by itself after the time you pick. ${window.isSecureContext ? '' : '<b>This link is not secure (https), so GPS is not available here.</b>'}</p>`}
  </div>`;
}

// set where you are: exact coordinates (tap on the map, GPS) or the centre of a named spot
function setMyLocAt(lat, lng) {
  const before = window.L ? exploredIds(me).size : 0, place = nearestPlace(lat, lng);
  if (me.precise === false) { lat = PLACES[place].lat; lng = PLACES[place].lng; } // spot-only sharing: besties only ever see the spot
  const wasOn = me.shareLoc;
  me.shareLoc = true;
  const old = me.loc;
  me.loc = { place, prev: old && old.place !== place ? old.place : null, lat, lng, trail: [], ts: Date.now() };
  if (CLOUD) (wasOn ? Promise.resolve(true) : Cloud.setSharing(true)).then(ok => ok && Cloud.publishLoc(me.loc, Date.now() + 4 * HR));
  (me.trail ||= []).push([lat, lng]);
  if (me.trail.length > 120) me.trail.shift();
  if (dist({ lat, lng }, PLACES[place]) <= 150) recordVisit(me, place);
  save(); checkNearby(); refresh();
  if (window.L && exploredIds(me).size > before) toast(`<span style="font-size:22px">🗺️</span><span>New area unlocked<small>${exploredPct(me)}% of campus explored</small></span>`);
}
function setMyLoc(k) { setMyLocAt(PLACES[k].lat, PLACES[k].lng); }

// Profile visitors: opening someone's profile adds you to the list they can see (Me tab). One entry per person,
// with a visit count. Private browsing means you are not listed, and you cannot see your own list either.
function recordView(viewerId, targetId) {
  if (CLOUD) { if (viewerId === me.id && !isClub(me)) Cloud.recordView(targetId); return; } // the server applies private browsing and blocks
  const v = user(viewerId), t = user(targetId);
  if (!v || !t || viewerId === targetId || isClub(v) || isClub(t) || isCreator(t) || v.privateBrowsing || t.privateBrowsing || isBlocked(v, t)) return;
  const now = Date.now(), list = (t.views ||= []), hit = list.find(x => x.by === viewerId);
  if (hit) { if (now - hit.ts > 30 * MIN) hit.n = (hit.n || 1) + 1; hit.ts = now; }
  else list.push({ by: viewerId, ts: now, n: 1 });
  list.sort((a, b) => b.ts - a.ts);
  if (list.length > 100) list.length = 100;
  save();
}
const newVisitors = u => (u.privateBrowsing ? [] : (u.views || []).filter(v => v.ts > (u.viewsSeenAt || 0) && user(v.by))).length;

// ───────────────────────── mutations ─────────────────────────
function pushEvent(e) {
  db.events.unshift({ id: uid('e_'), ts: Date.now(), ...e });
  db.events = db.events.slice(0, 120);
}
function addMsg(key, msg) {
  if (CLOUD) { // the server writes the system lines itself; what people say goes through cloud.js
    if (!msg.sys) Cloud.sendMessage(key, { text: msg.text, sticker: msg.sticker });
    return;
  }
  (db.chats[key] ||= []).push({ id: uid('m_'), ts: Date.now(), ...msg });
  save();
}
function joinHangout(hid, userId) {
  const h = hangout(hid);
  if (!h || h.members.includes(userId) || h.members.length >= h.max || isClub(user(userId))) return []; // clubs create events, they never join them
  const before = new Map([userId, ...h.members].map(id => [id, metSet(id).size]));
  h.members.push(userId);
  if (user(userId)) { learn(user(userId), h, 3); recordVisit(user(userId), h.place); }
  if (!isGhost(user(userId))) addMsg('h:' + hid, { sys: true, text: `${U(userId).name} joined` }); // ghosts join silently
  notifyBestiesGoing(h, userId);
  const out = [];
  for (const [id, b] of before) {
    if (isClub(user(id))) continue;
    const a = metSet(id).size;
    if (tierOf(a).min > tierOf(b).min && tierOf(a).min >= 6) {
      const ev = { kind: 'tier', userId: id, tier: tierOf(a).n, met: a };
      if (!isGhost(user(id))) pushEvent(ev); // ghost mode keeps tier-ups private too
      out.push(ev);
    }
  }
  if (!h.club && !isGhost(user(userId))) pushEvent({ kind: 'join', userId, hangoutId: hid }); // club events and ghosts stay private
  checkBadges(user(userId));
  save();
  return out;
}
function leaveHangout(hid) {
  const h = hangout(hid);
  learn(me, h, -2.5);
  h.members = h.members.filter(m => m !== me.id);
  if (!h.members.length) { db.hangouts = db.hangouts.filter(x => x.id !== hid); delete db.chats['h:' + hid]; }
  else {
    if (h.host === me.id) h.host = h.members[0];
    addMsg('h:' + hid, { sys: true, text: `${me.name} left` });
  }
  save();
}
function cancelHangout(hid) {
  db.hangouts = db.hangouts.filter(h => h.id !== hid);
  delete db.chats['h:' + hid];
  save();
}

// Seeded students answer back so the prototype feels alive. Real users would do this for real.
function botReply(key) {
  if (CLOUD) return;
  const members = key.startsWith('h:') ? (hangout(key.slice(2))?.members || []) : key.startsWith('c:') ? communityMembers(user(key.slice(2)) || { id: '' }) : [dmOther(key)];
  const bots = members.filter(id => user(id)?.bot && !isClub(user(id)) && id !== me.id);
  if (!bots.length) return;
  if (key.startsWith('dm:') && bots.includes(CREATOR_ID)) { // honest auto-reply: the real creator reads messages in the live app
    if (msgsOf(key).some(m => m.from === CREATOR_ID)) return;
    setTimeout(() => { addMsg(key, { from: CREATOR_ID, text: 'Thanks for writing! 💖 Hadil reads every message. This is an automatic reply in the prototype.' }); if (ui.chat === key) refreshMessages(); }, 1200);
    return;
  }
  const chatty = bots.filter(id => id !== CREATOR_ID);
  if (!chatty.length || Math.random() < 0.2) return;
  setTimeout(() => {
    if (!db.chats[key]) return;
    const from = pick(chatty);
    addMsg(key, Math.random() < 0.2 ? { from, sticker: pick(STICKERS).id } : { from, text: pick(BOT_LINES) });
    if (ui.chat === key) refreshMessages();
    else { toast(`${esc(U(from).name)} sent a message`); if (!ui.chat && !ui.sheet) render(); }
  }, 1300 + Math.random() * 2200);
}

// ───────────────────────── ui state ─────────────────────────
const ui = {
  tab: 'home', filter: 'all', chat: null, sheet: null, sheetFresh: false,
  authMode: 'login', auth: { name: '', email: '', password: '', major: '', interests: [], photo: null, type: null, category: '', bio: '', summary: '', meets: '', heads: '', agree: false, color: AVATAR_COLORS[0] },
  draft: '', stickers: false, chatsTab: 'groups', q: '',
  seen: new Set(), mapSeen: false, sameMajorOnly: false, alumniOnly: false, actor: null, ctab: 'ann', annDraft: '', sugDraft: '', mapFit: false, scratch: true, route: null, panel: 'peek', mq: '', near: new Set(),
};

const app = $('#app');

function toast(html, ms = 3600, tap = null) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  if (tap) { el.classList.add('tap'); el.dataset.a = tap.a; el.dataset.id = tap.id; }
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

// ───────────────────────── views: bits ─────────────────────────
const initialOf = u => ((u.name || '?').trim()[0] || '?').toUpperCase();
const av = (u, s = 44) => okPhoto(u.photo)
  ? `<span class="av has-photo" style="--s:${s}px;background-image:url('${u.photo}')"></span>`
  : u.id === '?' ? `<span class="av" style="--c:${u.color};--s:${s}px">${u.emoji}</span>` // the ghost placeholder
  : `<span class="av ini" style="--c:${u.color || '#ff7eb3'};--s:${s}px">${esc(initialOf(u))}</span>`;
function avStack(ids, max = 4, s = 26) {
  const shown = ids.slice(0, max).map(id => av(viewMember(id), s)).join('');
  const more = ids.length > max ? `<span class="more" style="--s:${s}px">+${ids.length - max}</span>` : '';
  return `<span class="stack">${shown}${more}</span>`;
}
const tile = (a, cls = '') => `<span class="tile ${cls}" style="--c:${a.c}">${a.e}</span>`;
const stickerHtml = (id, cls = '') => { const s = stk(id); return `<span class="sticker ${cls}" style="--bg:${s.bg}"><span class="e">${s.e}</span><b>${s.t}</b></span>`; };

function evText(e) {
  const who = e.userId === me?.id ? 'You' : `<b>${esc(U(e.userId).name)}</b>`;
  const h = e.hangoutId ? hangout(e.hangoutId) : null;
  const ht = h ? `<b>${esc(h.title)}</b>` : 'a hangout';
  if (e.kind === 'tier') {
    const be = e.userId === me?.id ? 'are' : 'is';
    return e.tier === 'Campus Legend'
      ? `${who} just became a <b>Campus Legend</b> 👑`
      : `${who} ${be} being a <b>social butterfly</b> 🦋`;
  }
  if (e.kind === 'bestie_req') return `${who} added you as a bestie 💖`;
  if (e.kind === 'bestie_ok') return `${who} added you back 💖`;
  if (e.kind === 'req') return `${who} asked to join your community 🙋`;
  if (e.kind === 'accepted') return `${who} accepted you into the community ✅`;
  if (e.kind === 'collab') return `${who} invited your club to co-host ${ht} 🤝`;
  if (e.kind === 'collabok') return `${who} accepted to co-host ${ht} 🤝`;
  if (e.kind === 'going') return `${who} is ${e.host ? 'hosting' : 'going to'} ${ht}`;
  if (e.kind === 'ann') return `${who} posted in the community: <b>${esc((e.text || '').slice(0, 70))}</b>`;
  if (e.kind === 'sug') return `${who} sent a suggestion to your community 💡`;
  if (e.kind === 'badge') return 'You earned the <b>Butterfly</b> badge 🦋';
  if (e.kind === 'club') return `${who} posted ${ht}`;
  if (e.kind === 'follow') return `${who} started following you 🎉`;
  if (e.kind === 'near') return `Friend nearby: ${who} is at <b>${esc(PLACES[e.place]?.n || 'campus')}</b>`;
  if (e.kind === 'match') return `New hangout you might like: ${ht}`;
  if (e.kind === 'join') return `${who} joined ${ht}`;
  return `${who} started ${ht}`;
}
const evToast = e => `<span style="font-size:22px">${evIcon(e)}</span><span>${evText(e).replace(/<\/?b>/g, '').replace(/ [🦋👑👀🎉💡]$/u, '')}</span>`;
const evIcon = e => ({ tier: e.tier === 'Campus Legend' ? '👑' : '🦋', join: '🙌', bestie_req: '💖', bestie_ok: '💖', going: '🎟️', near: '📍', club: '📣', follow: '🎉', ann: '📢', sug: '💡', badge: '🦋', req: '🙋', accepted: '✅', collab: '🤝', collabok: '🤝' }[e.kind] || '✨');
const myEvents = () => db.events.filter(e => !e.to || e.to === me.id);
const unseen = () => myEvents().filter(e => e.ts > (me.seenAt || 0) && e.userId !== me.id).length;

// ───────────────────────── views: auth ─────────────────────────
function photoRow(pv, scope, big = false) {
  const has = okPhoto(pv.photo);
  return `<div class="photo-row ${big ? 'big' : ''}">
    <label class="photo-pick" title="Choose a photo">${av(pv, big ? 104 : 72)}<span class="cam">📷</span><input type="file" accept="image/*" hidden data-file="${scope}"></label>
    <div class="photo-btns">
      <label class="btn soft">🖼️ ${has ? 'Change photo' : 'Choose a photo'}<input type="file" accept="image/*" hidden data-file="${scope}"></label>
      <label class="btn soft">🤳 Take a selfie<input type="file" accept="image/*" capture="user" hidden data-file="${scope}"></label>
      ${has ? `<button type="button" class="btn danger" data-a="${scope}PhotoClear">Remove</button>` : ''}
    </div></div>`;
}
const colorRow = (cur, a) => `<div class="picker colors" style="margin-top:10px">${AVATAR_COLORS.map(c => `<button type="button" data-a="${a}" data-v="${c}" style="--c:${c}" class="${cur === c ? 'on' : ''}" aria-label="colour ${c}"></button>`).join('')}</div>`;

// ───── installing on a phone ─────
// Yalla is a web app: open the link once in the phone's browser and install it. It then has its own icon, opens full screen with
// no address bar and works offline. No store and no fee. (A native store app needs an Apple developer account for iPhones.)
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (!ui.chat && !ui.sheet) render(); });
addEventListener('appinstalled', () => { installEvent = null; if (!ui.chat && !ui.sheet) render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isAndroid = () => /android/i.test(navigator.userAgent);
const isIOS = () => !isAndroid() && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); // iPads can pose as Macs
const isPhone = () => isIOS() || isAndroid();
const installHidden = () => { try { return localStorage.getItem('yalla.hideInstall') === '1'; } catch { return false; } };
function installHint(inRow = false) {
  if (isStandalone() || !isPhone() || installHidden()) return '';
  const how = installEvent ? 'Install Yalla on your phone. No store needed.'
    : isIOS() ? 'Tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.'
    : 'Open the browser menu <b>⋮</b>, then tap <b>Install app</b> or <b>Add to Home screen</b>.';
  return `<div class="install ${inRow ? 'inrow' : ''}"><span class="ic">📲</span><div class="mid"><b>Get the Yalla app</b><small>${how}</small></div>${installEvent ? '<button type="button" class="btn primary" data-a="installApp">Install</button>' : ''}<button type="button" class="x" data-a="hideInstall" aria-label="Hide this">✕</button></div>`;
}
// shown after someone follows the link in a "forgot password" email
function recoveryView() {
  return `<div class="auth"><div class="auth-hero"><img src="logo.svg" alt="${BRAND.name} logo"><h1>${BRAND.name}</h1><p>Choose a new password.</p></div>
    <form class="auth-card" data-form="newpass" autocomplete="on">
      <label class="field"><span>New password</span><input data-f="auth.password" type="password" value="${esc(ui.auth.password)}" placeholder="At least 8 characters" autocomplete="new-password"></label>
      <p class="err" id="err" role="alert"></p>
      <button class="btn primary big block">Save my password</button>
    </form></div>`;
}
function authView() {
  if (ui.recovery) return recoveryView();
  const s = ui.authMode === 'signup', a = ui.auth, type = s ? a.type : null, club = type === 'club';
  const pv = { name: a.name, color: a.color, photo: a.photo };
  const hero = club ? 'Run your club on Yalla: events, a community and a followers list.' : 'Make a plan. Find your crew. Meet people on campus.';
  const chooser = `
      <p class="choose-h">Who is signing up?</p>
      <button type="button" class="typecard student" data-a="authType" data-t="student"><span class="ti">🎒</span><span><b>I'm a student</b><small>Join hangouts, meet people, add besties, follow clubs</small></span></button>
      <button type="button" class="typecard club" data-a="authType" data-t="club"><span class="ti">📣</span><span><b>We're a club</b><small>Create events, run a community, share photos, team up with other clubs</small></span></button>
      <p class="hint">Clubs can create events but not join them. Students can join and follow.</p>`;
  const form = !type ? '' : `
      <div class="ribbon ${club ? 'club' : 'student'}">${club ? '📣 Club account' : '🎒 Student account'}<button type="button" class="linkbtn" data-a="authType" data-t="">Change</button></div>
      <div class="field"><span>${club ? 'Club logo' : 'Your photo'}</span>
        ${photoRow(pv, 'auth', true)}
        ${okPhoto(a.photo) ? '' : `<p class="hint" style="text-align:left;margin:8px 0 0">No photo yet? You'll get your initial on a colour.</p>${colorRow(a.color, 'pickColor')}`}
      </div>
      ${club ? `
      <label class="field"><span>Club name</span><input data-f="auth.name" value="${esc(a.name)}" placeholder="e.g. Chess Club" maxlength="40"></label>
      <div class="field"><span>Category</span><div class="when">${CLUB_CATS.map(c => `<button type="button" class="chip ${a.category === c ? 'on' : ''}" data-a="authCat" data-k="${c}">${c}</button>`).join('')}</div></div>
      <label class="field"><span>One-line tagline</span><input data-f="auth.bio" value="${esc(a.bio)}" placeholder="What you do, in one line" maxlength="100"></label>
      <label class="field"><span>Summary about the club</span><textarea data-f="auth.summary" maxlength="400" placeholder="Who you are, what you do, who should join">${esc(a.summary)}</textarea></label>
      <label class="field"><span>When and where you meet (optional)</span><input data-f="auth.meets" value="${esc(a.meets)}" placeholder="e.g. Thursdays 7 PM, Library" maxlength="80"></label>
      ${CLOUD ? '' : `<label class="field"><span>Head members' emails (optional)</span><input data-f="auth.heads" value="${esc(a.heads)}" placeholder="president@gmail.com, vp@gmail.com" autocomplete="off"></label>`}
      ` : `
      <label class="field"><span>First name</span><input data-f="auth.name" value="${esc(a.name)}" placeholder="Mohammed" autocomplete="given-name" maxlength="24"></label>
      <label class="field"><span>Major</span><input data-f="auth.major" list="majors" value="${esc(a.major)}" placeholder="e.g. Computer Science" maxlength="40"><datalist id="majors">${MAJORS.map(m => `<option value="${m}">`).join('')}</datalist></label>
      `}
      <label class="field"><span>${club ? 'Club email' : 'Email'}</span><input data-f="auth.email" type="email" value="${esc(a.email)}" placeholder="${club ? 'yourclub' : 'you'}@gmail.com" autocomplete="email" inputmode="email"></label>
      <label class="field"><span>Password</span><input data-f="auth.password" type="password" value="${esc(a.password)}" placeholder="At least 8 characters" autocomplete="new-password"></label>
      ${club ? '' : `<div class="field"><span>What are you into? <em style="text-transform:none;font-style:normal;opacity:.7">(pick a few)</em></span>
        <div class="acts">${ACTS.map(x => `<button type="button" class="act ${a.interests.includes(x.k) ? 'on' : ''}" style="--c:${x.c}" data-a="authInterest" data-k="${x.k}"><span>${x.e}</span>${x.n}</button>`).join('')}</div>
      </div>`}`;
  return `
  <div class="auth">
    <div class="auth-hero">
      <span class="float" style="left:6%;top:48px">☕</span>
      <span class="float" style="right:8%;top:30px;animation-delay:-1s">⚽</span>
      <span class="float" style="left:16%;top:150px;animation-delay:-2s">🎲</span>
      <span class="float" style="right:14%;top:140px;animation-delay:-.5s">🌅</span>
      <img src="logo.svg" alt="${BRAND.name} logo">
      <h1>${BRAND.name}</h1>
      <p>${hero}</p>
    </div>
    ${installHint()}
    <form class="auth-card" data-form="auth" autocomplete="on">
      <div class="seg">
        <button type="button" data-a="authMode" data-m="login" class="${s ? '' : 'on'}">Log in</button>
        <button type="button" data-a="authMode" data-m="signup" class="${s ? 'on' : ''}">Sign up</button>
      </div>
      ${s ? (type ? form : chooser) : `
      <label class="field"><span>Email</span><input data-f="auth.email" type="email" value="${esc(a.email)}" placeholder="you@gmail.com" autocomplete="email" inputmode="email"></label>
      <label class="field"><span>Password</span><input data-f="auth.password" type="password" value="${esc(a.password)}" placeholder="Your password" autocomplete="current-password"></label>
      ${CLOUD ? '<p class="hint" style="margin:-4px 0 0;text-align:right"><button type="button" class="linkbtn" data-a="forgot">Forgot your password?</button></p>' : ''}`}
      ${s && !type ? '' : `${s ? `<label class="agree"><input type="checkbox" data-f="auth.agree" ${a.agree ? 'checked' : ''}><span>I am 16 or older and I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of use</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.</span></label>` : ''}<p class="err" id="err" role="alert"></p>
      <button class="btn primary big block">${s ? (club ? 'Create club account' : 'Create my account') : 'Log in'}</button>`}
      <p class="hint">Sign up with any email address.${club ? ' New clubs show as "pending verification" until the Yalla team approves them.' : ''}</p>
      ${DEMO.enabled ? `<p class="hint">Just looking around? <button type="button" class="linkbtn" data-a="demo">Try the demo account</button></p>` : ''}
    </form>
    <p class="legal"><a href="get.html" target="_blank" rel="noopener">About Yalla and how to install it</a></p>
  </div>`;
}

// ───────────────────────── views: tabs ─────────────────────────
function friendsStrip() {
  const meSpot = me.shareLoc && me.loc ? PLACES[me.loc.place] : null;
  return `<div class="friends">
    <button class="fr ${meSpot ? 'live' : ''}" data-a="${meSpot ? 'focusMe' : 'locSheet'}">${av(me, 52)}<b>You</b><small>${meSpot ? '📍 ' + esc(placeLabel(me)) : '👻 Ghost'}</small></button>
    ${me.besties.filter(id => user(id)).map(id => { const u = U(id), vis = canSee(me, u); return `<button class="fr ${vis ? 'live' : ''}" data-a="focusUser" data-id="${id}">${av(u, 52)}<b>${esc(u.name)}</b><small>${vis ? '📍 ' + esc(placeLabel(u)) : mutual(me, u) ? '👻 hidden' : 'pending'}</small></button>`; }).join('')}
    <button class="fr" data-a="tab" data-t="friends"><span class="av addb" style="--s:52px">+</span><b>Add</b></button>
  </div>`;
}

function mapHud(club) {
  const here = !club && me.shareLoc && me.loc ? PLACES[me.loc.place] : null;
  const near = here ? nearby(me).filter(u => dist(posOf(me), posOf(u)) <= NEAR_M).length : 0;
  const pct = club ? 0 : exploredPct(me);
  const title = club ? 'Campus' : here ? here.n : me.shareLoc ? 'Campus' : 'Ghost mode';
  const sub = club ? `${nFol(me)} followers` : `${liveOn() ? '📡 live · ' : ''}${near ? `${near} bestie${near === 1 ? '' : 's'} here · ` : ''}${pct}% explored`;
  return `
  ${ui.pick ? `<div class="pickbar ui"><b>${ui.pick.kind === 'me' ? 'Tap the map where you are' : 'Tap the map where the event is'}</b><button data-a="cancelPick">Cancel</button></div>` : ''}
  <div class="headline"><b>${esc(title)}</b>${me.shareLoc && !club ? '<i class="livetag">LIVE</i>' : ''}<small>${sub}</small></div>
  <div class="mfab ui">
    <button class="rb" data-a="locate" aria-label="Locate me">${icon('locate')}</button>
    <button class="rb zm" data-a="zoomIn" aria-label="Zoom in">+</button>
    <button class="rb zm" data-a="zoomOut" aria-label="Zoom out">−</button>
    ${club ? '' : `<button class="rb ${ui.scratch ? 'on' : ''}" data-a="toggleScratch" aria-label="Scratch map" title="Scratch map">${icon('hex')}</button>
    <button class="rb ${me.shareLoc ? 'on' : ''}" data-a="locSheet" aria-label="Location sharing">${me.shareLoc ? '📍' : '👻'}</button>`}
  </div>`;
}
// "Arrive in 4 min" card for the bestie you tapped on the map
function etaCard() {
  const u = ui.route && user(ui.route);
  if (!u || isClub(me) || !me.shareLoc || !me.loc || !canSee(me, u)) return '';
  const d = dist(posOf(me), posOf(u)), together = d < 40;
  const mins = Math.max(1, Math.round(d * 1.25 / 1.3 / 60)); // ~1.3 m/s walking, 25% for paths that are not straight
  return `<div class="eta"><div><b>${together ? "You're together" : `Arrive in ${mins} min`}</b><small>${esc(u.name)} · ${esc(placeLabel(u))}${together ? '' : ` · about ${Math.max(10, Math.round(d / 10) * 10)} m`}</small></div>
    <button class="go" data-a="omw" data-id="${u.id}">${together ? 'Say hi' : "I'm coming"}</button><button class="x" data-a="routeClear" aria-label="Close">✕</button></div>`;
}

function invitesHtml() {
  const l = invitesFor(me);
  return l.length ? `<div class="sec"><h3>Collaboration invites 🤝</h3><small>${l.length}</small></div>${l.map(h => `<div class="card inv"><span class="tile" style="--c:${act(h.act).c}">${act(h.act).e}</span><div class="info"><h4>${esc(h.title)}</h4><p>${esc(U(h.host).name)} invited you to co-host · ${esc(PLACES[h.place]?.n || '')} · ${fmtWhen(h.when)}</p><div class="btns two"><button class="pill primary" data-a="collabAccept" data-id="${h.id}">Accept</button><button class="pill ghost" data-a="collabDecline" data-id="${h.id}">Decline</button></div></div></div>`).join('')}` : '';
}
function homeView() {
  const club = isClub(me), now = Date.now();
  const list = visible(me).filter(h => h.when > now - 3 * HR).sort((a, b) => a.when - b.when);
  const f = ui.filter;
  const shown = list.filter(h => f === 'all' || (f === 'now' ? h.when < now + HR : h.act === f));
  const picks = !club && f === 'all' ? picksFor(me) : [];
  const pickIds = new Set(picks.map(p => p.h.id));
  const rest = shown.filter(h => !pickIds.has(h.id));
  const ev = !club ? db.events.find(e => e.kind === 'tier') : null;
  const chips = [{ k: 'all', l: 'All' }, { k: 'now', l: '⚡ Now' }, ...ACTS.map(a => ({ k: a.k, l: `${a.e} ${a.n}` }))];
  const noTaste = !club && !(me.interests || []).length && !Object.keys(me.prefs?.act || {}).length;
  const forYou = picks.length
    ? `<div class="sec"><h3>Picked for you ✨</h3><small>learns what you like</small></div>${picks.map(p => hangoutCard(p.h, { why: p.why, pick: true })).join('')}`
    : f === 'all' && noTaste
      ? `<button class="banner" data-a="editProfile"><span class="bf">✨</span><div>Tell us what you're into<small>We'll pick hangouts for you</small></div></button>` : '';
  const head = club
    ? `<div class="btns two" style="margin:2px 0 10px"><button class="btn soft" data-a="openCommunity" data-id="${me.id}">👥 Community</button>${ui.actor ? `<button class="btn soft" data-a="leaveClub">↩ Back to ${esc(U(ui.actor).name)}</button>` : '<span></span>'}</div><div class="stats" style="margin:4px 0 12px"><div class="stat"><b>${nFol(me)}</b><small>followers</small></div><div class="stat"><b>${list.length}</b><small>upcoming events</small></div><div class="stat"><b>${list.reduce((n, h) => n + going(h), 0)}</b><small>going</small></div></div>${invitesHtml()}<div class="sec" style="margin-top:6px"><h3>Your events</h3></div>`
    : friendsStrip();
  const empty = club
    ? `<div class="empty"><span class="big">📣</span>No events yet.<br>Post one and your followers get notified.<br><button class="btn primary" data-a="newHangout">Post an event</button></div>`
    : `<div class="empty"><span class="big">🫥</span>Nothing here yet.<br>Be the one who starts it.<br><button class="btn primary" data-a="newHangout">Start a hangout</button></div>`;

  return `
  <div class="mtop ui">
    <div class="mbar">
      <img class="mlogo" src="logo.svg" alt="">
      <input class="msearch" data-f="mq" value="${esc(ui.mq)}" placeholder="Library, football, ${club ? 'a spot' : 'Salma'}…" autocomplete="off" aria-label="Search the map">
      <button class="mbtn" data-a="bell" aria-label="Notifications">${icon('bell')}${unseen() ? `<i class="dot">${unseen()}</i>` : ''}</button>
      <button class="mbtn mee" data-a="tab" data-t="me" aria-label="My profile">${av(me, 38)}${newVisitors(me) ? `<i class="dot">${newVisitors(me)}</i>` : ''}</button>
    </div>
    <div id="mres" class="mres"></div>
    <div class="mchips">${chips.map(c => `<button class="chip ${f === c.k ? 'on' : ''}" data-a="filter" data-k="${c.k}">${c.l}</button>`).join('')}</div>
  ${creatorPill()}
  </div>
  ${mapHud(club)}
  <section class="panel ui ${ui.panel}" id="panel">
    ${etaCard()}
    <div class="credit">© OpenStreetMap contributors · OpenFreeMap © OpenMapTiles</div>
    <div class="grab-zone" id="grab" aria-label="Drag to resize"><i></i></div>
    <div class="pbody">
      ${head}
      ${ev ? `<button class="banner" data-a="bell"><span class="bf">🦋</span><div>${evText(ev).replace(/ [🦋👑]$/u, '')}<small>met ${ev.met} people · ${since(ev.ts)}</small></div></button>` : ''}
      ${forYou}
      ${picks.length && rest.length ? `<div class="sec"><h3>Coming up</h3><small>${rest.length}</small></div>` : ''}
      ${rest.length ? rest.map(h => hangoutCard(h)).join('') : picks.length ? '' : empty}
    </div>
  </section>`;
}

function hangoutCard(h, o = {}) {
  const a = act(h.act), joined = h.members.includes(me.id), full = taken(h) >= h.max;
  const btn = joined ? `<button class="pill ghost" data-a="openChat" data-key="h:${h.id}">Chat</button>`
    : full ? `<span class="pill off">Full</span>`
    : isClub(me) ? '' : `<button class="pill primary" data-a="join" data-id="${h.id}">${h.club ? 'RSVP' : 'Join'}</button>`; // clubs create events, they do not join them
  const why = o.why?.length ? `<div class="why">✨ ${o.why.slice(0, 2).map(esc).join(' · ')}</div>` : '';
  return `
  <article class="card ${o.pick ? 'pick' : ''}" data-a="openHangout" data-id="${h.id}">
    ${tile(a)}
    <div class="info">
      <h4>${esc(h.title)}</h4>
      <p>${h.club ? `<span class="clubtag">📣 ${esc(clubTitle(h))}</span> ` : ''}${esc(PLACES[h.place]?.n || '')}${h.where ? ' · ' + esc(h.where) : ''} · ${fmtWhen(h.when)}</p>
      ${why}
      <div class="row">${avStack(h.members.filter(id => !isClub(user(id))))}<span>${going(h)}/${h.max} going</span></div>
    </div>
    ${btn}
    ${o.pick ? `<button class="dismiss" data-a="dismissPick" data-id="${h.id}" aria-label="Show me fewer like this" title="Show me fewer like this">✕</button>` : ''}
  </article>`;
}

function lastTs(key) { const m = msgsOf(key).at(-1); return m ? m.ts : 0; }
function preview(key) {
  const m = msgsOf(key).at(-1);
  if (!m) return 'Say hi 👋';
  if (m.sys) return m.text;
  const who = m.from === me.id ? 'You: ' : key.startsWith('h:') ? `${U(m.from).name}: ` : '';
  return who + (m.sticker ? `sticker ${stk(m.sticker).e}` : m.text);
}

function lastComm(c) { return Math.max(c.posts?.[0]?.ts || 0, lastTs('c:' + c.id)); }
function commPreview(c) {
  const p = c.posts?.[0], m = msgsOf('c:' + c.id).at(-1);
  if (m && (!p || m.ts > p.ts)) return `${U(m.from).name}: ${m.sticker ? 'sticker ' + stk(m.sticker).e : m.text}`;
  return p ? (p.hangoutId ? `📣 ${hangout(p.hangoutId)?.title || 'New event'}` : `📢 ${p.text}`) : 'No posts yet';
}
function chatsView() {
  const club = isClub(me);
  const groups = db.hangouts.filter(h => h.members.includes(me.id)).sort((a, b) => lastTs('h:' + b.id) - lastTs('h:' + a.id));
  const dms = Object.keys(db.chats).filter(k => k.startsWith('dm:') && k.slice(3).split('|').includes(me.id)).sort((a, b) => lastTs(b) - lastTs(a));
  const comms = db.users.filter(c => isClub(c) && inCommunity(me, c)).sort((a, b) => lastComm(b) - lastComm(a));
  const tab = ui.chatsTab;
  const quick = club ? [] : [...new Set([...me.besties, ...mostHungOut().map(x => x.u.id)])].filter(id => user(id)).slice(0, 8);
  const seg = [['groups', club ? 'Event chats' : 'Hangout groups'], ['private', 'Private'], ['comm', 'Communities']];
  return `
  ${creatorBar()}
  <h1 class="page-title">Chats</h1>
  <div class="seg" style="margin:8px 0 14px">${seg.map(([k, l]) => `<button data-a="chatsTab" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${tab === 'groups' ? (groups.length ? groups.map(h => `
    <button class="row-item" data-a="openChat" data-key="h:${h.id}">
      ${tile(act(h.act), 'sm')}
      <span class="mid"><b>${esc(h.title)}</b><small>${esc(preview('h:' + h.id))}</small></span>
      <span class="end">${ago(lastTs('h:' + h.id))}<br>${going(h)} 👥</span>
    </button>`).join('') : `<div class="empty"><span class="big">💬</span>Join a hangout and its group chat shows up here.<br><button class="btn primary" data-a="tab" data-t="home">Find a hangout</button></div>`)
  : tab === 'comm' ? (comms.length ? comms.map(c => `
    <button class="row-item" data-a="openCommunity" data-id="${c.id}">
      ${av(c, 46)}<span class="mid"><b>${esc(c.name)} ${c.verified ? '✅' : ''}</b><small>${isMember(me, c) ? '' : 'Following · '}${esc(commPreview(c))}</small></span>
      <span class="end">${ago(lastComm(c))}<br>${nMem(c)} 👥</span>
    </button>`).join('') : `<div class="empty"><span class="big">👥</span>Follow a club and its community shows up here: announcements, a chat and a suggestion box.<br><button class="btn primary" data-a="tab" data-t="friends">Find clubs</button></div>`)
  : `
    ${quick.length ? `<div class="besties" style="margin-bottom:6px">${quick.map(id => `<button class="bestie" data-a="dm" data-id="${id}"><div class="ring ${me.besties.includes(id) ? '' : 'plain'}">${av(U(id), 60)}</div>${esc(U(id).name)}</button>`).join('')}</div>` : ''}
    ${dms.length ? dms.map(k => { const o = U(dmOther(k)); return `
    <button class="row-item" data-a="openChat" data-key="${k}">
      ${av(o, 46)}<span class="mid"><b>${nm(o)} ${me.besties.includes(o.id) ? '💖' : ''}</b><small>${esc(preview(k))}</small></span>
      <span class="end">${ago(lastTs(k))}</span>
    </button>`; }).join('') : `<div class="empty"><span class="big">🤫</span>No private chats yet.<br>Tap anyone in Friends to say hi.<br><button class="btn primary" data-a="tab" data-t="friends">Find people</button></div>`}`}`;
}

// the creator is always one tap away: pinned on every main screen
function creatorBar() {
  const c = creatorUser();
  if (!c || me.id === c.id) return '';
  return `<button class="cbar" data-a="dm" data-id="${c.id}">${av(c, 40)}<span class="mid"><b>${nm(c)} <em>Creator</em></b><small>Ideas, bugs or hellos? Chat with the creator</small></span><span class="go">💬</span></button>`;
}
function creatorPill() {
  const c = creatorUser();
  if (!c || me.id === c.id) return '';
  return `<button class="cpill" data-a="dm" data-id="${c.id}">${av(c, 22)}<b>${esc(c.name)}</b>${badgeHtml(c)}<span>Chat with the creator</span></button>`;
}

function peopleHtml() {
  const q = ui.q.trim().toLowerCase();
  const people = students().filter(u => u.id !== me.id && !isBlocked(me, u) && (!q || `${u.name} ${u.major}`.toLowerCase().includes(q)) && (!ui.sameMajorOnly || sameMajor(me, u)) && (!ui.alumniOnly || isAlumni(u)));
  if (!people.length) return `<div class="empty">${ui.sameMajorOnly && !me.major ? 'Add your major to your profile to find people in it.' : ui.alumniOnly ? 'No alumni match.' : ui.sameMajorOnly ? 'No one else from your major yet.' : `No one matches “${esc(ui.q)}”.`}</div>`;
  return people.sort((a, b) => isCreator(b) - isCreator(a)).map(u => { const n = metN(u.id), t = tierOf(n); return `
    <button class="row-item" data-a="person" data-id="${u.id}">
      ${av(u, 44)}<span class="mid"><b>${nm(u)} ${me.besties.includes(u.id) ? '💖' : ''}${isAlumni(u) ? ' <span class="tag alum">Alumni</span>' : ''}</b><small>${isCreator(u) ? 'Creator of Yalla' : subline(u)}</small></span>
      <span class="tag">${t.e} ${n}</span>
    </button>`; }).join('');
}

function clubRow(c) {
  const fol = (me.following || []).includes(c.id);
  return `<div class="row-item" role="button" tabindex="0" data-a="person" data-id="${c.id}">
    ${av(c, 44)}<span class="mid"><b>${esc(c.name)} ${c.verified ? '✅' : ''}</b><small>📣 ${esc(c.category)} · ${nFol(c)} follower${nFol(c) === 1 ? '' : 's'}</small></span>
    <button class="pill ${fol ? 'ghost' : 'primary'}" data-a="follow" data-id="${c.id}">${fol ? 'Following' : 'Follow'}</button>
  </div>`;
}

function friendsView() {
  if (isClub(me)) {
    const fl = followersOf(me.id);
    return `
    ${creatorBar()}
    <h1 class="page-title">Followers</h1>
    <p class="page-sub">Only these people see the events you post.</p>
    <div class="stats"><div class="stat"><b>${fl.length}</b><small>followers</small></div><div class="stat"><b>${db.hangouts.filter(h => h.host === me.id).length}</b><small>events posted</small></div><div class="stat"><b>${me.verified ? '✅' : '⏳'}</b><small>${me.verified ? 'verified' : 'pending'}</small></div></div>
    ${fl.length ? fl.map(u => `<button class="row-item" data-a="person" data-id="${u.id}">${av(u, 44)}<span class="mid"><b>${esc(u.name)}</b><small>${subline(u)}</small></span></button>`).join('') : `<div class="empty"><span class="big">📣</span>No followers yet.<br>Share your club with students. They find you under <b>Friends → Clubs</b>.</div>`}`;
  }
  const slots = [...me.besties.filter(id => user(id))];
  const top = mostHungOut(), max = top[0]?.s || 1, cl = db.users.filter(isClub);
  return `
  ${creatorBar()}
  <h1 class="page-title">Friends</h1>
  <p class="page-sub">Your besties and the people you hang with most.</p>
  <div class="sec" style="margin-top:6px"><h3>Besties 💖</h3><small>${slots.length}/${MAX_BESTIES}</small></div>
  <div class="besties">
    ${slots.map(id => { const u = U(id), vis = canSee(me, u), mut = mutual(me, u); return `<button class="bestie" data-a="person" data-id="${id}"><div class="ring">${av(u, 60)}</div>${esc(u.name)}<small>${vis ? '📍 ' + esc(placeLabel(u)) : mut ? '' : 'pending…'}</small></button>`; }).join('')}
    ${slots.length < MAX_BESTIES ? `<button class="bestie empty-slot" data-a="toast" data-m="Tap anyone below, then hit “Add bestie” 💖"><div class="ring">+</div>Add</button>` : ''}
  </div>
  ${CLOUD ? incomingHtml() : ''}
  <div class="sec"><h3>Hang out most</h3><small>by hangouts + messages</small></div>
  ${top.length ? top.map((x, i) => `
    <button class="row-item" data-a="person" data-id="${x.u.id}">
      <span class="rank-n">${i + 1}</span>${av(x.u, 44)}
      <span class="mid"><b>${nm(x.u)}</b><small>${x.shared} hangout${x.shared === 1 ? '' : 's'} together · ${x.dms} message${x.dms === 1 ? '' : 's'}</small><div class="bar"><i style="width:${Math.max(8, x.s / max * 100)}%"></i></div></span>
    </button>`).join('') : `<div class="empty"><span class="big">🫶</span>Join a hangout or send a message and your most-hung-out-with list starts filling up.</div>`}
  <div class="sec"><h3>Clubs 📣</h3><small>follow to see their events</small></div>
  ${cl.map(clubRow).join('')}
  <div class="sec"><h3>People on campus</h3><small>${students().length - 1}</small></div>
  <input class="search" data-f="q" placeholder="Search by name or major" value="${esc(ui.q)}">
  <div class="chips" style="margin-top:6px"><button class="chip ${ui.sameMajorOnly ? 'on' : ''}" data-a="sameMajor">🎓 My major${me.major ? ' · ' + esc(me.major) : ''}</button><button class="chip ${ui.alumniOnly ? 'on' : ''}" data-a="alumniOnly">🎓 Alumni</button></div>
  <div id="people">${peopleHtml()}</div>`;
}

// people who added you as a bestie and wait for you to add them back
function incomingHtml() {
  const l = db.users.filter(u => u.besties.includes(me.id) && !me.besties.includes(u.id) && !isClub(u) && !isBlocked(me, u));
  return l.length ? `<div class="sec"><h3>Added you 💖</h3><small>${l.length}</small></div>${l.map(u => `<div class="row-item static">${av(u, 42)}<span class="mid"><b>${nm(u)}</b><small>${subline(u)}</small></span><button class="pill primary" data-a="bestie" data-id="${u.id}">Add back</button></div>`).join('')}` : '';
}
function ranksView() {
  const lb = leaderboard(), myMet = lb.find(x => x.u.id === me.id).met;
  const t = tierOf(myMet), next = [...TIERS].reverse().find(x => x.min > myMet);
  const [p1, p2, p3] = lb;
  const pod = (x, n, cls) => x ? `<div class="pod ${cls}" data-a="person" data-id="${x.u.id}">${n === 1 ? '<span class="crown">👑</span>' : '<span class="crown"></span>'}${av(x.u, n === 1 ? 62 : 52)}<b>${nm(x.u)}</b><small>${x.met} met</small><div class="step">${n}</div></div>` : '<div></div>';
  return `
  ${creatorBar()}
  <h1 class="page-title">Ranks 🦋</h1>
  <p class="page-sub">Who has met the most new people through hangouts.</p>
  <div class="progress">
    <b>You're a ${t.e} ${t.n}</b>
    <p>${next ? `Meet ${next.min - myMet} more ${next.min - myMet === 1 ? 'person' : 'people'} to become a ${next.e} ${next.n}.` : 'Top tier reached. The campus knows your name.'}</p>
    <div class="bar"><i style="width:${next ? Math.min(100, myMet / next.min * 100) : 100}%"></i></div>
  </div>
  <div class="podium">${pod(p2, 2, 'p2')}${pod(p1, 1, 'p1')}${pod(p3, 3, 'p3')}</div>
  ${lb.slice(3).map((x, i) => `
    <button class="row-item ${x.u.id === me.id ? 'me' : ''}" data-a="person" data-id="${x.u.id}">
      <span class="rank-n">${i + 4}</span>${av(x.u, 42)}
      <span class="mid"><b>${nm(x.u)}${x.u.id === me.id ? ' (you)' : ''}</b><small>${tierOf(x.met).e} ${tierOf(x.met).n}</small></span>
      <span class="end"><b style="font-size:17px;color:var(--ink)">${x.met}</b>met</span>
    </button>`).join('')}
  <div class="sec"><h3>How tiers work</h3></div>
  <div class="tiers">${TIERS.map(x => `<div class="tier"><span>${x.e}</span>${x.n}<small>${x.min}+ people</small></div>`).join('')}</div>
  <p class="hint" style="margin-top:14px">Everyone who shares a hangout with you counts once. Reaching a new tier pings the whole campus.</p>`;
}

function takeCard(u, own = false) {
  const t = summaryFor(u);
  return `<div class="take"><b>📝 The Yalla take</b><p>${esc(t.text)}</p><small>Written by the app from campus activity (${t.n} spot check-in${t.n === 1 ? '' : 's'} this month). Just for fun.</small>${own ? `<div class="btns two" style="margin-top:10px"><button class="btn soft" data-a="remix">🔁 Remix</button><button class="btn soft" data-a="toggleTaste">${u.showTaste === false ? 'Show it' : 'Hide it'}</button></div>` : ''}</div>`;
}
function favChips(u) {
  const favs = favoriteSpots(u);
  return favs.length ? `<div class="favs"><b>📍 Go-to spots</b><div class="when">${favs.map(f => `<button class="chip s" data-a="focusSpot" data-k="${f.k}">${f.star ? '★ ' : ''}${KINDS[PLACES[f.k].kind].e} ${esc(PLACES[f.k].n)}</button>`).join('')}</div></div>` : '';
}

function visitorsHtml() {
  if (isClub(me) || isCreator(me)) return '';
  const l = (me.views || []).filter(v => Date.now() - v.ts < 30 * DAY && user(v.by));
  return `<div class="sec"><h3>Who viewed your profile 👀</h3><small>last 30 days</small></div>
  ${me.privateBrowsing ? '<p class="hint" style="text-align:left">Private browsing is on: you do not appear in anyone\'s list, and you cannot see yours. Turn it off in Edit profile.</p>'
    : l.length ? l.slice(0, 15).map(v => { const u = U(v.by), fresh = v.ts > (me.viewsSeenAt || 0); return `<button class="row-item" data-a="person" data-id="${u.id}">${av(u, 42)}<span class="mid"><b>${nm(u)}${fresh ? ' <span class="newdot">new</span>' : ''}</b><small>${since(v.ts)}${v.n > 1 ? ` · ${v.n} visits` : ''}</small></span></button>`; }).join('')
    : '<p class="hint" style="text-align:left">Nobody yet. When someone opens your profile, they show up here.</p>'}`;
}
function badgeCard() {
  if (isClub(me) || isCreator(me)) return '';
  const met = metN(me.id), days = activeDays(me, BUTTERFLY.span), ok = earnsButterfly(me);
  const bar = (label, v, goal) => `<div class="vb2"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / goal * 100)}%"></i></div><em>${Math.min(v, goal)}/${goal}</em></div>`;
  return `<div class="badgecard ${ok ? 'on' : ''}"><b>🦋 ${ok ? 'You have the Butterfly badge' : 'Butterfly badge'}</b>
    <p>${ok ? 'You meet lots of people and use Yalla regularly, so it shows next to your name.' : 'Meet lots of people and use Yalla regularly to earn it. Most people have no badge, so it means something.'}</p>
    ${bar('People met', met, BUTTERFLY.met)}${bar(`Days active (last ${BUTTERFLY.span})`, days, BUTTERFLY.days)}</div>`;
}
const managedClubs = u => db.users.filter(c => isClub(c) && (c.admins || []).includes(u.id));
function managedHtml() {
  const l = managedClubs(me);
  return l.length ? `<div class="sec"><h3>Clubs you manage</h3><small>post as the club</small></div>${l.map(c => `<button class="row-item" data-a="switchClub" data-id="${c.id}">${av(c, 42)}<span class="mid"><b>${esc(c.name)}</b><small>${nFol(c)} followers · open as admin</small></span><span class="end">Open</span></button>`).join('')}` : '';
}
// search students by name (cloud mode: emails are private, so heads and members are found by name)
function findBox(kind) {
  return `<div class="findbox"><input data-f="find" data-kind="${kind}" placeholder="Search a student by name" value="${esc(ui.find?.kind === kind ? ui.find.q : '')}" autocomplete="off"><div id="findres">${findResHtml(kind)}</div></div><p class="err" id="err" role="alert"></p>`;
}
function findResHtml(kind) {
  const r = ui.find?.kind === kind ? ui.find.res || [] : [];
  if (ui.find?.kind === kind && ui.find.q.trim().length >= 2 && ui.find.done && !r.length) return '<p class="hint" style="text-align:left">No student with that name.</p>';
  return r.map(p => `<div class="row-item static">${av({ id: p.id, name: p.name, color: '#ff7eb3', photo: Cloud.photoUrl('avatars', p.photo_path) }, 40)}<span class="mid"><b>${esc(p.name)}</b><small>${esc(p.major || 'Student')}</small></span><button type="button" class="pill primary" data-a="${kind === 'head' ? 'addHeadId' : 'addMemberId'}" data-id="${p.id}">Add</button></div>`).join('');
}
let findTimer = null;
function adminsHtml() {
  const ad = (me.admins || []).map(id => user(id)).filter(Boolean);
  return `<div class="sec"><h3>Heads ⭐</h3><small>${ad.length} own this club</small></div>
  <p class="hint" style="text-align:left;margin:0 0 8px">Heads are the people who own and run the club. They are starred everywhere. Add a student by email and they can open the club from their own account.</p>
  ${ad.map(u => `<div class="row-item static">${av(u, 40)}<span class="mid"><b>${nm(u)} <span class="star">⭐</span>${ui.actor === u.id ? ' (you)' : ''}</b><small>${esc((me.roles || {})[u.id] || 'Head')}</small></span>${ad.length > 1 ? `<button class="pill ghost" data-a="removeAdmin" data-id="${u.id}">Remove</button>` : ''}</div>`).join('') || '<p class="hint" style="text-align:left">No heads added yet.</p>'}
  ${CLOUD ? `<input class="search" data-f="adminRole" placeholder="Role for the new head, e.g. Treasurer" value="${esc(ui.adminRole || '')}" maxlength="24" style="margin-bottom:8px">${findBox('head')}` : `<form data-form="addAdmin" class="addrow"><input data-f="adminEmail" type="email" placeholder="student@gmail.com" value="${esc(ui.adminEmail || '')}" autocomplete="off"><input data-f="adminRole" placeholder="Role" value="${esc(ui.adminRole || '')}" maxlength="24" style="max-width:104px"><button class="btn primary">Add</button></form>
  <p class="err" id="err" role="alert"></p>`}
  <div class="sec"><h3>Community</h3><small>${(me.members || []).length} members</small></div>
  <button class="row-item" data-a="openCommunity" data-id="${me.id}" data-t="mem"><span class="tile sm" style="--c:#f59e0b">👥</span><span class="mid"><b>Manage members</b><small>${(me.requests || []).length ? `${me.requests.length} request${me.requests.length === 1 ? '' : 's'} waiting` : 'Accept requests, add members by email'}</small></span><span class="end">Open</span></button>`;
}
function meView() {
  const club = isClub(me);
  const mine = db.hangouts.filter(h => (club ? h.host === me.id : h.members.includes(me.id)) && h.when > Date.now() - 3 * HR).sort((a, b) => a.when - b.when);
  if (club) return `
  <div class="me-head" style="padding-top:34px">${av(me, 92)}<h2>${esc(me.name)}</h2>
    <p style="margin-top:4px;font-weight:800;color:var(--ink)">📣 ${esc(me.category || 'Club')}</p>
    <p>${esc(me.email)}</p>
    <p style="margin-top:8px"><span class="tag">${me.verified ? '✅ Verified club' : '⏳ Pending verification'}</span></p>
    ${me.bio ? `<div class="desc" style="margin:12px 0 0;text-align:left">${esc(me.bio)}</div>` : ''}
    <div class="btns two" style="margin-top:12px"><button class="btn soft" data-a="editProfile">✏️ Edit club</button><button class="btn soft" data-a="openCommunity" data-id="${me.id}">👥 Community</button></div>${ui.actor ? `<button class="btn soft" style="margin-top:10px" data-a="leaveClub">↩ Back to ${esc(U(ui.actor).name)}</button>` : ''}</div>
  <div class="stats">
    <div class="stat"><b>${nFol(me)}</b><small>followers</small></div>
    <div class="stat"><b>${db.hangouts.filter(h => h.host === me.id).length}</b><small>events</small></div>
    <div class="stat"><b>${mine.reduce((n, h) => n + going(h), 0)}</b><small>going</small></div>
  </div>
  ${aboutBlock(me)}
  ${galleryHtml(me, true)}
  ${adminsHtml()}
  <div class="sec"><h3>Upcoming events</h3></div>
  ${mine.length ? mine.map(h => hangoutCard(h)).join('') : `<div class="empty"><span class="big">📣</span>No events yet. Tap + to post one.</div>`}
  ${safetyHtml()}
  <div class="btns" style="margin-top:18px"><button class="btn soft" data-a="logout">Log out</button>${CLOUD ? '' : '<button class="btn danger" data-a="reset">Reset demo data</button>'}</div>
  ${deleteLink()}`;

  const n = metN(me.id), t = tierOf(n), vibe = myVibe(me), fol = (me.following || []).map(id => user(id)).filter(Boolean);
  return `
  <div class="top"><button class="ib" data-a="tab" data-t="home" aria-label="Back">${icon('back')}</button><div class="brand"></div></div>
  <div class="me-head">${av(me, 92)}<h2>${nm(me)}</h2>
    <p style="margin-top:4px;font-weight:800;color:var(--ink)">${isCreator(me) ? 'Creator of Yalla' : me.major || isAlumni(me) || me.year ? subline(me) : `<button class="linkbtn" data-a="editProfile">Add your major</button>`}</p>
    <p>${esc(me.email)}</p>
    <p style="margin-top:8px">${isCreator(me) ? '<span class="tag creator-tag">✔ Creator</span>' : `<span class="tag">${t.e} ${t.n}</span>`}${badgeOf(me) === 'butterfly' ? ' <span class="tag bfly-tag">🦋 Butterfly</span>' : ''}${isAlumni(me) ? ' <span class="tag alum">🎓 Alumni</span>' : ''}</p>
    <button class="btn soft" style="margin-top:12px;padding:9px 16px" data-a="editProfile">✏️ Edit profile</button></div>
  <div class="stats">
    <div class="stat"><b>${db.hangouts.filter(h => h.members.includes(me.id)).length}</b><small>hangouts</small></div>
    <div class="stat"><b>${n}</b><small>people met</small></div>
    <div class="stat"><b>${me.besties.length}</b><small>besties</small></div>
  </div>
  ${badgeCard()}
  ${managedHtml()}
  <button class="row-item" data-a="locSheet">
    <span class="tile sm" style="--c:#3b82f6">${me.shareLoc ? '📍' : '👻'}</span>
    <span class="mid"><b>${me.shareLoc && me.loc ? 'Sharing ' + esc(placeLabel(me)) : 'Ghost mode'}</b><small>${me.shareLoc ? 'Mutual besties can see your spot' : 'Nobody can see where you are'}</small></span>
    <span class="end">Change</span>
  </button>
  <div class="sec"><h3>How others see you</h3><small>${me.showTaste === false ? 'hidden' : 'on your profile'}</small></div>
  ${takeCard(me, true)}
  ${favChips(me)}
  <div class="sec"><h3>Your vibe ✨</h3><small>what we've learned</small></div>
  <div class="vibe">
    ${vibe.length ? vibe.map(v => `<div class="vb"><span>${v.a.e} ${v.a.n}</span><div class="bar"><i style="width:${v.pct}%"></i></div></div>`).join('') : `<p class="hint" style="margin:0">Nothing yet. Pick your interests or join a hangout and this fills up.</p>`}
    <button class="btn soft block" style="margin-top:12px" data-a="editProfile">Tune my interests</button>
  </div>
  ${fol.length ? `<div class="sec"><h3>Clubs you follow</h3></div>${fol.map(c => `<button class="row-item" data-a="person" data-id="${c.id}">${av(c, 42)}<span class="mid"><b>${esc(c.name)}</b><small>📣 ${esc(c.category)}</small></span></button>`).join('')}` : ''}
  ${visitorsHtml()}
  <div class="sec"><h3>My plans</h3></div>
  ${mine.length ? mine.map(h => hangoutCard(h)).join('') : `<div class="empty"><span class="big">🗓️</span>No plans yet.</div>`}
  ${safetyHtml()}
  <div class="btns" style="margin-top:18px">
    <button class="btn soft" data-a="logout">Log out</button>
    ${CLOUD ? '' : '<button class="btn danger" data-a="reset">Reset demo data</button>'}
  </div>
  ${deleteLink()}`;
}

function tabbar() {
  const club = isClub(me);
  const t = (k, ic, l) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-a="tab" data-t="${k}">${icon(ic)}${l}</button>`;
  return `<nav class="tabbar">${t('home', 'home', club ? 'Events' : 'Hangouts')}${t('chats', 'chat', 'Chats')}<button class="fab" data-a="newHangout" aria-label="${club ? 'Post an event' : 'Start a hangout'}">${icon('plus')}</button>${t('friends', 'users', club ? 'Followers' : 'Friends')}${club ? t('me', 'star', 'Profile') : t('ranks', 'star', 'Ranks')}</nav>`;
}

// ───────────────────────── views: chat ─────────────────────────
function msgsHtml(key) {
  const group = key.startsWith('h:') || key.startsWith('c:');
  const list = msgsOf(key).filter(m => m.sys || !isBlocked(me, user(m.from))); // messages from people you blocked are hidden
  if (!list.length) return `<div class="sys">No messages yet. Say hi 👋</div>`;
  return list.map((m, i) => {
    if (m.sys) return `<div class="sys">${esc(m.text)}</div>`;
    const mine = m.from === me.id, prev = list[i - 1];
    const first = !prev || prev.sys || prev.from !== m.from;
    const u = U(m.from);
    const side = !mine && group ? (first ? av(u, 30) : '<span class="gap"></span>') : '';
    const body = m.sticker
      ? stickerHtml(m.sticker)
      : `<div class="bubble">${!mine && group && first ? `<span class="who">${nm(u)}${key.startsWith('c:') && isHead(u, user(key.slice(2))) ? ' <span class="star" title="Club head">⭐</span>' : ''}</span>` : ''}${esc(m.text)}<time>${hhmm(m.ts)}</time>${!mine ? `<button class="flag" data-a="msgMenu" data-key="${esc(key)}" data-id="${m.id}" aria-label="Report this message">⚑</button>` : ''}</div>`;
    return `<div class="m ${mine ? 'mine' : ''} ${first ? 'first' : ''}">${side}${body}</div>`;
  }).join('');
}
function refreshMessages() {
  const el = $('#msgs');
  if (!el || !ui.chat) return;
  el.innerHTML = msgsHtml(ui.chat);
  el.scrollTop = el.scrollHeight;
}
const trayHtml = () => `<div class="tray ${ui.stickers ? 'open' : ''}" id="tray">${STICKERS.map(s => `<button type="button" data-a="sticker" data-id="${s.id}" aria-label="${s.t}">${stickerHtml(s.id, 'sm')}</button>`).join('')}</div>`;
const composerHtml = () => `
    <form class="composer" data-form="send">
      <button type="button" class="ib ${ui.stickers ? 'on' : ''}" id="stk-btn" data-a="stickers" aria-label="Stickers">${icon('smile')}</button>
      <input id="msg" data-f="msg" value="${esc(ui.draft)}" placeholder="Message…" autocomplete="off" enterkeyhint="send">
      <button class="send" aria-label="Send">${icon('send')}</button>
    </form>`;

function annHtml(c, admin) {
  const composer = admin ? `<form class="annform" data-form="post"><textarea data-f="ann" maxlength="280" placeholder="Share an update with your followers and members, like “Donation drive today next to Building 1”">${esc(ui.annDraft)}</textarea><div class="btns two"><button class="btn primary">📢 Post update</button><button type="button" class="btn soft" data-a="newHangout">📣 Post an event</button></div></form>` : '';
  const cards = [...(c.posts || [])].sort((a, b) => b.ts - a.ts).map(p => {
    if (p.hangoutId) { const h = hangout(p.hangoutId); return h ? `<div class="post"><small>📣 New event · ${ago(p.ts)}${p.by ? ' · posted by ' + esc(U(p.by).name) : ''}</small>${hangoutCard(h)}</div>` : ''; }
    return `<div class="post"><small>📢 ${p.by ? esc(U(p.by).name) : 'The club'} · ${isHead(user(p.by), c) ? '⭐ head' : 'admin'} · ${ago(p.ts)}</small><p>${esc(p.text)}</p></div>`;
  }).join('');
  return `${composer}${cards || '<div class="empty"><span class="big">📢</span>No announcements yet.</div>'}`;
}
const SUG_STATUS = { new: ['🆕', 'New'], seen: ['👀', 'Seen'], planned: ['🗓️', 'Planned'], done: ['✅', 'Done'] };
function sugHtml(c, admin) {
  const list = [...(c.sugs || [])].sort((a, b) => b.votes.length - a.votes.length || b.ts - a.ts);
  const form = admin
    ? '<p class="hint" style="text-align:left">Members send ideas here. They vote with 👍 and you move each one along as you decide.</p>'
    : `<form class="annform" data-form="suggest"><textarea data-f="sug" maxlength="240" placeholder="Share an idea or feedback with the heads">${esc(ui.sugDraft)}</textarea><button class="btn primary block">💡 Send suggestion</button></form>`;
  const rows = list.map(s => `<div class="sug"><p>${esc(s.text)}</p><div class="sugrow"><small>${esc(U(s.from).name)} · ${ago(s.ts)}</small><span class="chipst st-${s.status}">${SUG_STATUS[s.status][0]} ${SUG_STATUS[s.status][1]}</span>${admin ? `<button class="pill ghost" data-a="sugStatus" data-id="${s.id}">Next</button>` : ''}<button class="pill ${s.votes.includes(me.id) ? 'primary' : 'ghost'}" data-a="sugVote" data-id="${s.id}">👍 ${s.votes.length}</button></div></div>`).join('');
  return `${form}${rows || '<div class="empty"><span class="big">💡</span>No suggestions yet.</div>'}`;
}
function lockedHtml(c) {
  const pending = (c.requests || []).includes(me.id);
  return `<div class="locked"><span class="big">🔒</span><p>Only accepted members can chat, send ideas and see the member list.</p>${isClub(me) ? '' : pending
    ? `<button class="btn soft" data-a="cancelRequest" data-id="${c.id}">⏳ Request sent. Cancel</button>`
    : `<button class="btn primary" data-a="requestJoin" data-id="${c.id}">🙋 Request to join</button>`}</div>`;
}
function membersHtml(c, admin) {
  const heads = (c.admins || []).map(id => user(id)).filter(Boolean), mem = (c.members || []).map(id => user(id)).filter(Boolean), reqs = (c.requests || []).map(id => user(id)).filter(Boolean);
  const row = (u, star) => `<div class="row-item static">${av(u, 42)}<span class="mid"><b>${nm(u)}${star ? ' <span class="star">⭐</span>' : ''}</b><small>${star ? esc((c.roles || {})[u.id] || 'Head') : subline(u)}</small></span>${admin && !star ? `<button class="pill ghost" data-a="removeMember" data-id="${u.id}">Remove</button>` : ''}</div>`;
  return `${admin && reqs.length ? `<div class="sec"><h3>Requests</h3><small>${reqs.length}</small></div>${reqs.map(u => `<div class="row-item static">${av(u, 42)}<span class="mid"><b>${nm(u)}</b><small>${subline(u)}</small></span><button class="pill primary" data-a="acceptMember" data-id="${u.id}">Accept</button><button class="pill ghost" data-a="declineMember" data-id="${u.id}" aria-label="Decline">✕</button></div>`).join('')}` : ''}
  <div class="sec"><h3>Heads ⭐</h3><small>${heads.length}</small></div>${heads.map(u => row(u, true)).join('') || '<p class="hint" style="text-align:left">No heads yet.</p>'}
  <div class="sec"><h3>Members</h3><small>${mem.length}</small></div>${mem.map(u => row(u, false)).join('') || '<p class="hint" style="text-align:left">No accepted members yet.</p>'}
  ${admin ? (CLOUD ? findBox('member') : `<form data-form="addMember" class="addrow"><input data-f="memberEmail" type="email" placeholder="Add a member by email" value="${esc(ui.memberEmail || '')}" autocomplete="off"><button class="btn primary">Add</button></form><p class="err" id="err" role="alert"></p>`)
    : heads.some(h => h.id === me.id) ? '<p class="hint" style="text-align:left">You are a head. Open the club from Me → Clubs you manage to accept requests and add members.</p>' : ''}`;
}
function communityView() {
  const c = user(ui.chat.slice(2)), tab = ui.ctab || 'ann';
  if (!c || !inCommunity(me, c)) return `<div class="chat"><header class="chat-h"><button class="ib" data-a="back" aria-label="Back">${icon('back')}</button><b style="font-weight:900">Community</b></header><div class="empty"><span class="big">🔒</span>Follow the club to read its news.</div></div>`;
  const admin = canManage(c), member = isMember(me, c), n = nMem(c);
  const head = `<header class="chat-h"><button class="ib" data-a="back" aria-label="Back">${icon('back')}</button><button class="chat-t" data-a="person" data-id="${c.id}">${av(c, 42)}<span><b>${esc(c.name)}</b><small>Community · ${n} member${n === 1 ? '' : 's'}${member ? '' : ' · you follow'}</small></span></button></header>`;
  const seg = `<div class="seg ctabs">${[['ann', '📢 News'], ['chat', '💬 Chat'], ['sug', '💡 Ideas'], ['mem', '👥 Members']].map(([k, l]) => `<button data-a="ctab" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (tab === 'chat' && member) return `<div class="chat">${head}${seg}<div class="msgs" id="msgs">${msgsHtml('c:' + c.id)}</div>${trayHtml()}${composerHtml()}</div>`;
  const body = tab === 'ann' ? annHtml(c, admin) : !member ? lockedHtml(c) : tab === 'sug' ? sugHtml(c, admin) : tab === 'mem' ? membersHtml(c, admin) : '';
  return `<div class="chat">${head}${seg}<div class="cbody">${body}</div></div>`;
}
function chatView() {
  const key = ui.chat;
  if (key.startsWith('c:')) return communityView();
  const group = key.startsWith('h:');
  let head;
  if (group) {
    const h = hangout(key.slice(2));
    head = `<button class="chat-t" data-a="openHangout" data-id="${h.id}">${tile(act(h.act), 'sm')}<span><b>${esc(h.title)}</b><small>${going(h)} going · ${fmtWhen(h.when)}</small></span></button>`;
  } else {
    const o = U(dmOther(key));
    head = `<button class="chat-t" data-a="person" data-id="${o.id}">${av(o, 42)}<span><b>${nm(o)} ${me.besties.includes(o.id) ? '💖' : ''}</b><small>${isCreator(o) ? 'Creator of Yalla' : 'Private chat'}</small></span></button>`;
  }
  return `
  <div class="chat">
    <header class="chat-h"><button class="ib" data-a="back" aria-label="Back">${icon('back')}</button>${head}</header>
    <div class="msgs" id="msgs">${msgsHtml(key)}</div>
    ${trayHtml()}${composerHtml()}
  </div>`;
}

// ───────────────────────── views: sheets ─────────────────────────
function whenFromKey(f) {
  const now = new Date();
  const at = (d, h, m = 0) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.getTime(); };
  if (f.when === 'now') return Math.ceil((Date.now() + 15 * MIN) / (5 * MIN)) * 5 * MIN;
  if (f.when === 'tonight') return Math.max(at(0, 19), Date.now() + 2 * HR);
  if (f.when === 'tomorrow') return at(1, 17);
  if (f.when === 'weekend') { const d = (6 - now.getDay() + 7) % 7 || 7; return at(d, 15); }
  return f.custom ? new Date(f.custom).getTime() : NaN;
}

const REPORT_REASONS = ['Harassment or bullying', 'Hate or abusive language', 'Spam or scam', 'Inappropriate or sexual content', 'Fake account or impersonation', 'Shares private info or location', 'Dangerous or illegal', 'Something else'];
function safetyHtml() {
  const nb = (me.blocked || []).length;
  return `<div class="sec"><h3>Safety & support</h3></div>
  <button class="row-item" data-a="openGuidelines"><span class="tile sm" style="--c:#14b8a6">🛡️</span><span class="mid"><b>Community guidelines</b><small>How we keep Yalla friendly</small></span></button>
  ${isClub(me) ? '' : `<button class="row-item" data-a="openBlocked"><span class="tile sm" style="--c:#64748b">🚫</span><span class="mid"><b>Blocked people</b><small>${nb} blocked</small></span></button>`}
  ${installHint(true)}
  ${CLOUD && !ui.actor ? `<button class="row-item" data-a="changePassword"><span class="tile sm" style="--c:#8b5cf6">🔑</span><span class="mid"><b>Change password</b><small>Choose a new one for ${esc(me.email || 'your login')}</small></span></button>` : ''}
  <a class="row-item linkrow" href="mailto:${esc(BRAND.support)}"><span class="tile sm" style="--c:#3b82f6">✉️</span><span class="mid"><b>Contact support</b><small>${esc(BRAND.support)}</small></span></a>
  <p class="legal"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms of use</a></p>`;
}
function headTags(u) {
  return db.users.filter(c => isClub(c) && isHead(u, c)).map(c => ` <span class="tag star-tag">⭐ ${esc((c.roles || {})[u.id] || 'Head')} · ${esc(c.name)}</span>`).join('');
}
function aboutBlock(c) {
  return `${c.bio ? `<p class="tagline">${esc(c.bio)}</p>` : ''}
  ${c.summary ? `<div class="desc" style="text-align:left"><b>About us</b><br>${esc(c.summary)}</div>` : ''}
  ${c.meets ? `<div class="fact" style="margin-bottom:10px"><span>🗓️</span>${esc(c.meets)}</div>` : ''}`;
}
function headsHtml(c) {
  const ad = (c.admins || []).map(id => user(id)).filter(Boolean);
  return ad.length ? `<div class="sec"><h3>Heads ⭐</h3><small>${ad.length}</small></div><div class="heads">${ad.map(u => `<button class="head" data-a="person" data-id="${u.id}"><span class="hav">${av(u, 54)}<span class="stbadge">⭐</span></span><b>${esc(u.name)}</b><small>${esc((c.roles || {})[u.id] || 'Head')}</small></button>`).join('')}</div>` : '';
}
function galleryHtml(c, manage = false) {
  const g = (c.gallery || []).filter(p => okPhoto(p.img));
  if (!g.length && !manage) return '';
  const add = manage && g.length < 8 ? `<div class="galadd"><input data-f="galcap" value="${esc(ui.galCap || '')}" placeholder="Caption, e.g. our stand at the University Fair" maxlength="60"><label class="btn soft">📷 Add photos<input type="file" accept="image/*" multiple hidden data-file="gallery"></label></div>` : '';
  return `<div class="sec"><h3>Photos 📷</h3><small>${g.length}/8</small></div>${add}${g.length
    ? `<div class="gallery">${g.map(p => `<button class="gal" data-a="openPhoto" data-club="${c.id}" data-id="${p.id}" style="background-image:url('${p.img}')" aria-label="${esc(p.cap || 'Photo')}"><span>${esc(p.cap || '')}</span></button>`).join('')}</div>`
    : '<p class="hint" style="text-align:left">Add pictures from the university fair and your events. Students see them on your profile.</p>'}`;
}
function clubSheet(u) {
  const isMe = u.id === me.id, meClub = isClub(me), fol = follows(me, u), member = isMember(me, u), pending = (u.requests || []).includes(me.id);
  const evs = db.hangouts.filter(h => (h.host === u.id || coClubs(h).includes(u.id)) && h.when > Date.now() - 3 * HR).sort((a, b) => a.when - b.when);
  const see = fol || isMe || member;
  return `
  <div class="me-head" style="padding-top:6px">${av(u, 84)}<h2>${esc(u.name)}</h2><p>📣 ${esc(u.category || 'Club')} club</p>
    <p style="margin-top:8px"><span class="tag">${u.verified ? '✅ Verified club' : '⏳ Pending verification'}</span></p></div>
  ${aboutBlock(u)}
  ${headsHtml(u)}
  <div class="stats"><div class="stat"><b>${nFol(u)}</b><small>followers</small></div><div class="stat"><b>${nMem(u)}</b><small>members</small></div><div class="stat"><b>${evs.length}</b><small>upcoming</small></div></div>
  ${!isMe && !meClub ? `<div class="btns">
    <button class="btn ${fol ? 'soft' : 'primary'}" data-a="follow" data-id="${u.id}">${fol ? 'Following ✓' : 'Follow'}</button>
    ${member ? `<button class="btn primary" data-a="openCommunity" data-id="${u.id}">👥 Open the community</button>`
      : pending ? `<button class="btn soft" data-a="cancelRequest" data-id="${u.id}">⏳ Request sent. Cancel</button>`
      : `<button class="btn pink" data-a="requestJoin" data-id="${u.id}">🙋 Request to join the community</button>`}
    ${fol && !member ? `<button class="btn soft" data-a="openCommunity" data-id="${u.id}">📢 Read the news</button>` : ''}
  </div>` : ''}
  ${see ? (evs.length ? `<div class="sec"><h3>Upcoming events</h3></div>${evs.map(h => `<button class="row-item" data-a="openHangout" data-id="${h.id}">${tile(act(h.act), 'sm')}<span class="mid"><b>${esc(h.title)}</b><small>${esc(PLACES[h.place]?.n || '')} · ${fmtWhen(h.when)}</small></span></button>`).join('')}` : '<p class="hint">No upcoming events right now.</p>')
    : `<p class="hint">🔒 Follow ${esc(u.name)} to see ${evs.length ? `their ${evs.length} upcoming event${evs.length === 1 ? '' : 's'}` : 'their events'}. Club events are only shown to followers.</p>`}
  ${galleryHtml(u, isMe)}
  ${!isMe ? `<div class="reportrow"><button class="linkbtn" data-a="reportClub" data-id="${u.id}">⚑ Report this club</button></div>` : ''}`;
}
function sheetBody(s) {
  if (s.type === 'create') {
    const f = s.form, a = act(f.act), club = isClub(me);
    return `
    <h2>${club ? 'Post an event' : 'Start a hangout'}</h2><p class="sub">${club ? `Only people who follow ${esc(me.name)} will see this.` : 'Others can join and you get a group chat instantly.'}</p>
    <div class="field"><span>What kind?</span>
      <div class="acts">${ACTS.map(x => `<button type="button" class="act ${f.act === x.k ? 'on' : ''}" style="--c:${x.c}" data-a="formAct" data-k="${x.k}"><span>${x.e}</span>${x.n}</button>`).join('')}</div>
    </div>
    <form data-form="create">
      <label class="field"><span>Title</span><input data-f="form.title" value="${esc(f.title)}" placeholder="${esc(a.def)}" maxlength="48"></label>
      <label class="field"><span>Where</span><select data-f="form.place">${Object.entries(PLACES).map(([k, p]) => `<option value="${k}" ${f.place === k ? 'selected' : ''}>${p.n}</option>`).join('')}</select></label>
      <label class="field"><span>Exact spot (optional)</span><input data-f="form.where" value="${esc(f.where || '')}" placeholder="e.g. next to Building 1" maxlength="60"></label>
      <div class="field"><span>Pin it on the map (optional)</span><button type="button" class="btn soft block" data-a="pickOnMap" data-k="event">${f.lat != null ? `📍 Pinned at ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}. Change` : '📍 Tap the map to pin it exactly'}</button>${f.lat != null ? '<button type="button" class="linkbtn" data-a="unpin" style="margin-top:6px">Remove the pin</button>' : ''}</div>
      <div class="field"><span>When</span><div class="when">${[['now', 'Now-ish'], ['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend'], ['custom', 'Pick time']].map(([k, l]) => `<button type="button" class="chip ${f.when === k ? 'on' : ''}" data-a="formWhen" data-k="${k}">${l}</button>`).join('')}</div>
        ${f.when === 'custom' ? `<input type="datetime-local" class="dt" data-f="form.custom" value="${esc(f.custom)}">` : ''}
      </div>
      <div class="two-col">
        <label class="field"><span>Spots</span><select data-f="form.max">${(club ? [20, 50, 100, 200] : [4, 6, 8, 10, 15, 20]).map(n => `<option ${+f.max === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <div></div>
      </div>
      ${club ? `<div class="field"><span>Collaborate with other clubs (optional)</span><div class="when">${db.users.filter(c => isClub(c) && c.id !== me.id).map(c => `<button type="button" class="chip ${(f.collab || []).includes(c.id) ? 'on' : ''}" data-a="formCollab" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div><p class="hint" style="text-align:left;margin-top:6px">They get an invitation. Once they accept, the event also shows to their followers.</p></div>` : ''}
      <label class="field"><span>Details (optional)</span><textarea data-f="form.desc" placeholder="Where exactly do we meet? What should people bring?" maxlength="200">${esc(f.desc)}</textarea></label>
      <p class="err" id="err" role="alert"></p>
      <button class="btn primary big block">${club ? 'Post to followers 📣' : `Post it ${a.e}`}</button>
    </form>`;
  }

  if (s.type === 'hangout') {
    const h = hangout(s.id);
    if (!h) return '<h2>Hangout gone</h2>';
    const a = act(h.act), joined = h.members.includes(me.id), full = taken(h) >= h.max, host = h.host === me.id;
    const why = joined ? [] : scoreFor(me, h).why;
    return `
    <div class="sheet-head">${tile(a, 'lg')}<div><h2>${esc(h.title)}</h2><p class="sub">hosted by ${host ? 'you' : esc(h.club ? clubTitle(h) : U(h.host).name)}${h.by ? ` · posted by ${esc(U(h.by).name)}` : ''}${(h.cohosts || []).some(x => x.status === 'pending') ? ' · waiting for a club to accept' : ''}</p></div></div>
    <div class="facts">
      <div class="fact"><span>⏰</span>${fmtWhen(h.when)}${h.when > Date.now() ? ` <span style="color:var(--mute);font-weight:700">· ${new Date(h.when).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>` : ''}</div>
      <div class="fact"><span>📍</span>${esc(PLACES[h.place]?.n || '')}${h.where ? ` · <b>${esc(h.where)}</b>` : ''} <button class="linkbtn" data-a="showEvent" data-id="${h.id}">Show on map</button></div>
      <div class="fact"><span>👥</span>${going(h)} of ${h.max} spots taken</div>
      ${h.club ? '<div class="fact"><span>📣</span>Club event. Only followers can see it.</div>' : ''}
    </div>
    ${why.length ? `<div class="desc why-box">✨ <b>Why you:</b> ${why.map(esc).join(' · ')}</div>` : ''}
    ${h.desc ? `<div class="desc">${esc(h.desc)}</div>` : ''}
    <div class="sec" style="margin-top:4px"><h3>Who's going</h3></div>
    <div class="members">${h.members.map(id => { const v = id === h.host ? U(id) : viewMember(id); return v.id === '?' ? `<span class="member">${av(v, 50)}Ghost</span>` : `<button class="member" data-a="person" data-id="${id}">${av(v, 50)}${esc(v.name)}${id === h.host ? '<em>host</em>' : ''}</button>`; }).join('')}</div>
    <div class="btns">
      ${joined ? `<button class="btn primary" data-a="openChat" data-key="h:${h.id}">Open group chat</button>
        ${host ? `<button class="btn danger" data-a="cancelHangout" data-id="${h.id}">Cancel hangout</button>` : `<button class="btn soft" data-a="leave" data-id="${h.id}">Leave hangout</button>`}`
      : full ? `<button class="btn primary" disabled>Full</button>`
      : isClub(me) ? '' : `<button class="btn primary" data-a="join" data-id="${h.id}" data-chat="1">${h.club ? 'RSVP' : 'Join'} and open chat</button>`}
    </div>
    ${h.host !== me.id ? `<div class="reportrow"><button class="linkbtn" data-a="reportEvent" data-id="${h.id}">⚑ Report this event</button></div>` : ''}`;
  }

  if (s.type === 'person') {
    const u = U(s.id);
    const isMe = u.id === me.id, meClub = isClub(me);
    if (isClub(u)) return clubSheet(u);
    const n = metN(u.id), t = tierOf(n), bf = me.besties.includes(u.id);
    const shared = isGhost(u) && !isMe ? [] : db.hangouts.filter(h => h.members.includes(u.id) && h.members.includes(me.id) && !h.club); // ghosts keep their events private
    const mut = mutual(me, u), loc = canSee(me, u), sm = !isMe && !meClub && sameMajor(me, u);
    const showTake = u.showTaste !== false;
    return `
    <div class="me-head" style="padding-top:6px">${av(u, 84)}<h2>${nm(u)} ${bf ? '💖' : ''}</h2>
      ${isCreator(u) ? '<p style="font-weight:800;color:var(--ink)">Creator of Yalla</p>' : `<p>${subline(u)}</p>`}
      <p style="margin-top:8px">${isCreator(u) ? '<span class="tag creator-tag">✔ Creator</span>' : `<span class="tag">${t.e} ${t.n}</span>`}${badgeOf(u) === 'butterfly' ? ' <span class="tag bfly-tag">🦋 Butterfly</span>' : ''}${isAlumni(u) ? ' <span class="tag alum">🎓 Alumni</span>' : ''}${headTags(u)}${sm ? ' <span class="tag" style="background:#d8f8ec;color:#0f9d74">🎓 Same major</span>' : ''}</p>
      ${u.bio ? `<div class="desc" style="margin:12px 0 0;text-align:left">${esc(u.bio)}</div>` : ''}</div>
    ${showTake ? takeCard(u) : ''}
    ${showTake ? favChips(u) : ''}
    ${loc ? `<div class="fact" style="margin:10px 0"><span>📍</span>${esc(placeLabel(u))} · ${since(u.loc.ts)}${me.shareLoc && me.loc ? ` · ${Math.round(dist(posOf(me), posOf(u)))} m from you` : ''} <button class="linkbtn" data-a="focusUser" data-id="${u.id}">Show on map</button></div>` : ''}
    ${isCreator(u) ? '' : `<div class="stats">
      <div class="stat"><b>${n}</b><small>people met</small></div>
      <div class="stat"><b>${isMe ? '–' : shared.length}</b><small>shared hangouts</small></div>
      <div class="stat"><b>${isMe ? '–' : dmCount(me.id, u.id)}</b><small>messages</small></div>
    </div>`}
    ${!isMe && isCreator(u) ? `<div class="btns"><button class="btn primary" data-a="dm" data-id="${u.id}">💬 Chat with the creator</button></div>` : !isMe && !meClub && (me.blocked || []).includes(u.id) ? `<div class="btns"><button class="btn soft" data-a="unblock" data-id="${u.id}">🚫 Blocked. Unblock</button></div>` : !isMe && !meClub ? `<div class="btns two">
      <button class="btn primary" data-a="dm" data-id="${u.id}">💬 Message</button>
      <button class="btn ${bf ? 'soft' : 'pink'}" data-a="bestie" data-id="${u.id}">${bf ? 'Remove bestie' : '💖 Add bestie'}</button>
    </div>` : ''}
    ${bf && !mut && !isMe ? `<p class="hint">Waiting for ${esc(u.name)} to add you back. You'll see each other's spot once you both have.</p>` : ''}
    ${!isMe && !isCreator(u) ? `<div class="reportrow"><button class="linkbtn" data-a="reportUser" data-id="${u.id}">⚑ Report or block</button></div>` : ''}
    ${!isMe && !meClub && !isCreator(u) ? `<p class="hint">${me.privateBrowsing ? `🕶️ Private browsing is on, so ${esc(u.name)} will not see this visit.` : `👀 ${esc(u.name)} can see that you viewed their profile in their visitors list.`}</p>` : ''}
    ${shared.length ? `<div class="sec"><h3>Hung out at</h3></div>${shared.map(h => `<button class="row-item" data-a="openHangout" data-id="${h.id}">${tile(act(h.act), 'sm')}<span class="mid"><b>${esc(h.title)}</b><small>${fmtWhen(h.when)}</small></span></button>`).join('')}` : ''}`;
  }

  if (s.type === 'profile') {
    const f = s.form, club = isClub(me), pv = { name: f.name || me.name, color: f.color, photo: f.photo };
    return `
    <h2>${club ? 'Club profile' : 'Your profile'}</h2><p class="sub">${club ? 'This is what students see when they find your club.' : 'Your photo and major help people find you, and help us pick hangouts.'}</p>
    <form data-form="profile">
      <div class="field"><span>${club ? 'Logo' : 'Photo'}</span>${photoRow(pv, 'form')}
        ${okPhoto(f.photo) ? '' : colorRow(f.color, 'formColor')}
      </div>
      ${club ? `
      <label class="field"><span>Club name</span><input data-f="form.name" value="${esc(f.name)}" maxlength="40"></label>
      <div class="field"><span>Category</span><div class="when">${CLUB_CATS.map(c => `<button type="button" class="chip ${f.category === c ? 'on' : ''}" data-a="formCat" data-k="${c}">${c}</button>`).join('')}</div></div>
      <label class="field"><span>One-line tagline</span><input data-f="form.bio" value="${esc(f.bio)}" maxlength="100"></label>
      <label class="field"><span>Summary about the club</span><textarea data-f="form.summary" maxlength="400">${esc(f.summary || '')}</textarea></label>
      <label class="field"><span>When and where you meet</span><input data-f="form.meets" value="${esc(f.meets || '')}" maxlength="80"></label>
      ` : `
      <label class="field"><span>Major</span><input data-f="form.major" list="majors" value="${esc(f.major)}" placeholder="e.g. Computer Science" maxlength="40"><datalist id="majors">${MAJORS.map(m => `<option value="${m}">`).join('')}</datalist></label>
      <div class="field"><span>Year</span><div class="when">${YEARS.map(y => `<button type="button" class="chip ${f.year === y ? 'on' : ''}" data-a="formYear" data-k="${y}">${y}</button>`).join('')}</div></div>
      <label class="field"><span>Graduation year</span><select data-f="form.gradYear"><option value="">Not set</option>${GRAD_YEARS.map(y => `<option value="${y}" ${+f.gradYear === y ? 'selected' : ''}>Class of ${y}</option>`).join('')}</select>
        <p class="hint" style="text-align:left;margin-top:6px">After 1 June of that year you automatically get the 🎓 Alumni title.</p></label>
      <div class="field"><span>What are you into?</span>
        <div class="acts">${ACTS.map(x => `<button type="button" class="act ${f.interests.includes(x.k) ? 'on' : ''}" style="--c:${x.c}" data-a="formInterest" data-k="${x.k}"><span>${x.e}</span>${x.n}</button>`).join('')}</div>
        <p class="hint" style="text-align:left;margin-top:8px">We also learn from the hangouts you join. Tap ✕ on a pick to see fewer like it.</p>
      </div>
      <div class="field"><span>Favorite spots <em style="text-transform:none;font-style:normal;opacity:.7">(up to 5, we also add the ones you visit most)</em></span>
        <div class="when">${Object.entries(PLACES).map(([k, p]) => `<button type="button" class="chip ${f.favSpots.includes(k) ? 'on' : ''}" data-a="formFav" data-k="${k}">${KINDS[p.kind].e} ${p.n}</button>`).join('')}</div>
      </div>
      <div class="toggle"><span><b>Show my favorite spots and "take"</b><small>The funny summary on your profile. Remix or hide it any time.</small></span><button type="button" class="switch ${f.showTaste ? 'on' : ''}" role="switch" aria-checked="${f.showTaste}" data-a="formShow"></button></div>
      <div class="toggle"><span><b>Tell me about new hangouts I might like</b><small>Only strong matches, never spam</small></span><button type="button" class="switch ${f.alerts ? 'on' : ''}" role="switch" aria-checked="${f.alerts}" data-a="formAlerts"></button></div>
      <div class="toggle"><span><b>Private browsing</b><small>View profiles without showing up in their visitors list. You also can't see your own list.</small></span><button type="button" class="switch ${f.privateBrowsing ? 'on' : ''}" role="switch" aria-checked="${!!f.privateBrowsing}" data-a="formPrivate"></button></div>
      `}
      <p class="err" id="err" role="alert"></p>
      <button class="btn primary big block">Save</button>
    </form>`;
  }

  if (s.type === 'location') {
    const on = !!me.shareLoc, near = nearby(me), mutuals = students().filter(u => mutual(me, u));
    return `
    <h2>Your spot 📍</h2><p class="sub">Mutual besties see exactly where you are on the map. Turn it off whenever you want, or share only the campus spot.</p>
    <div class="toggle" style="margin-top:14px"><span><b>${on ? 'Sharing with besties' : 'Ghost mode 👻'}</b><small>${on ? 'Only mutual besties can see you' : 'Nobody can see where you are or which events you join, and no history is recorded'}</small></span><button type="button" class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-a="toggleLoc" aria-label="Share my spot"></button></div>
    ${liveCard()}
    ${on ? `<label class="field"><span>What are you up to? (optional)</span><input data-f="status" value="${esc(me.status || '')}" maxlength="24" placeholder="e.g. cramming for finals"></label>
    <div class="field ${liveOn() ? 'dim' : ''}"><span>I'm at</span><div class="when">${Object.entries(PLACES).map(([k, p]) => `<button type="button" class="chip ${me.loc?.place === k ? 'on' : ''}" data-a="setLoc" data-k="${k}">${KINDS[p.kind].e} ${p.n}</button>`).join('')}</div>
      <div class="btns two" style="margin-top:10px"><button type="button" class="btn soft" data-a="useGps">📡 Use my GPS</button><button type="button" class="btn soft" data-a="pickOnMap" data-k="me">📍 Drop a pin</button></div></div>
    <div class="toggle"><span><b>Share my exact location</b><small>${me.precise !== false ? 'Besties see exactly where you are' : 'Besties only see the campus spot'}</small></span><button type="button" class="switch ${me.precise !== false ? 'on' : ''}" role="switch" aria-checked="${me.precise !== false}" data-a="togglePrecise" aria-label="Share my exact location"></button></div>
    <div class="toggle"><span><b>Friend nearby alerts</b><small>Ping me when a bestie is within ${NEAR_M} m</small></span><button type="button" class="switch ${me.nearAlerts !== false ? 'on' : ''}" role="switch" aria-checked="${me.nearAlerts !== false}" data-a="toggleNear" aria-label="Friend nearby alerts"></button></div>
    <div class="sec" style="margin-top:14px"><h3>Who can see you</h3></div>
    ${mutuals.length ? `<div class="members">${mutuals.map(u => `<button class="member" data-a="person" data-id="${u.id}">${av(u, 46)}${esc(u.name)}</button>`).join('')}</div>` : `<p class="hint" style="text-align:left">No mutual besties yet. Add besties from the Friends tab. They show up here once they add you back.</p>`}` : ''}
    <div class="sec" style="margin-top:14px"><h3>Besties nearby</h3></div>
    ${near.length ? near.map(u => `<button class="row-item" data-a="focusUser" data-id="${u.id}">${av(u, 42)}<span class="mid"><b>${esc(u.name)}</b><small>📍 ${esc(placeLabel(u))} · ${since(u.loc.ts)}</small></span></button>`).join('') : `<p class="hint" style="text-align:left">Nobody is sharing their spot with you right now.</p>`}
    <p class="hint" style="text-align:left;margin-top:14px">Your favorite spots and profile "take" are built from the spots you check in at.</p>
    <button class="linkbtn" data-a="clearVisits">Clear my spot history</button>`;
  }

  if (s.type === 'spot') {
    const p = PLACES[s.k];
    if (!p) return '';
    const kd = KINDS[p.kind], club = isClub(me);
    const here = students().filter(u => u.id !== me.id && canSee(me, u) && u.loc.place === s.k);
    const youHere = !club && me.shareLoc && me.loc?.place === s.k, fav = (me.favSpots || []).includes(s.k);
    const hs = visible(me).filter(h => h.place === s.k && h.when > Date.now() - 3 * HR).sort((a, b) => a.when - b.when);
    return `
    <div class="sheet-head"><span class="tile lg" style="--c:${kd.c}">${kd.e}</span><div><h2>${esc(p.n)}</h2><p class="sub">${kd.n}${p.off ? ' · off campus' : ''}</p></div></div>
    ${club ? '' : `<div class="btns two">
      <button class="btn primary" data-a="checkin" data-k="${s.k}">${youHere ? "📍 You're here" : me.shareLoc ? "📍 I'm here" : '📍 Share I\'m here'}</button>
      <button class="btn ${fav ? 'soft' : 'pink'}" data-a="favSpot" data-k="${s.k}">${fav ? '★ Favorite' : '☆ Add favorite'}</button></div>`}
    ${here.length ? `<div class="sec"><h3>Besties here</h3></div><div class="members">${here.map(u => `<button class="member" data-a="person" data-id="${u.id}">${av(u, 46)}${esc(u.name)}</button>`).join('')}</div>` : ''}
    <div class="sec"><h3>Happening here</h3></div>
    ${hs.length ? hs.map(h => `<button class="row-item" data-a="openHangout" data-id="${h.id}">${tile(act(h.act), 'sm')}<span class="mid"><b>${esc(h.title)}</b><small>${fmtWhen(h.when)}</small></span></button>`).join('') : `<p class="hint" style="text-align:left">Nothing planned here yet.</p>`}`;
  }

  if (s.type === 'report') {
    const f = s.form, label = { user: 'this person', message: 'this message', event: 'this event', club: 'this club' }[f.kind];
    return `
    <h2>Report ${label}</h2><p class="sub">Tell us what is wrong. Reports are private, and the person is not told who reported them.</p>
    <form data-form="report">
      <div class="field"><span>What is the problem?</span><div class="when">${REPORT_REASONS.map(r => `<button type="button" class="chip ${f.reason === r ? 'on' : ''}" data-a="formReason" data-k="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>
      <label class="field"><span>More details (optional)</span><textarea data-f="form.details" maxlength="300" placeholder="What happened?">${esc(f.details || '')}</textarea></label>
      ${f.kind === 'user' || f.kind === 'message' ? `<div class="toggle"><span><b>Also block ${esc(U(f.userId).name)}</b><small>They can't message you, see you on the map, or view your profile</small></span><button type="button" class="switch ${f.alsoBlock ? 'on' : ''}" role="switch" aria-checked="${!!f.alsoBlock}" data-a="formBlock"></button></div>` : ''}
      <p class="err" id="err" role="alert"></p>
      <div class="btns two"><button type="button" class="btn soft" data-a="closeSheet">Cancel</button><button class="btn primary">Send report</button></div>
    </form>`;
  }

  if (s.type === 'password') {
    const f = s.form;
    return `
    <h2>Change password</h2><p class="sub">You stay logged in on this phone. Other phones may need to log in again.</p>
    <form data-form="changePw">
      <label class="field"><span>Current password</span><input type="password" data-f="form.cur" value="${esc(f.cur || '')}" autocomplete="current-password"></label>
      <label class="field"><span>New password</span><input type="password" data-f="form.pw" value="${esc(f.pw || '')}" placeholder="At least 8 characters" autocomplete="new-password"></label>
      <label class="field"><span>New password again</span><input type="password" data-f="form.pw2" value="${esc(f.pw2 || '')}" autocomplete="new-password"></label>
      <p class="hint" style="text-align:left">Forgot the current one? Log out and use "Forgot your password?" on the login screen.</p>
      <p class="err" id="err" role="alert"></p>
      <div class="btns two"><button type="button" class="btn soft" data-a="closeSheet">Cancel</button><button class="btn primary">Save password</button></div>
    </form>`;
  }

  if (s.type === 'guidelines') {
    return `
    <h2>Community guidelines</h2><p class="sub">Yalla works when everyone feels safe. Breaking these rules can get content removed and accounts banned.</p>
    <div class="rules">
      <p><b>🤝 Be kind.</b> No harassment, bullying, threats or hate.</p>
      <p><b>🔒 Respect privacy.</b> Never share someone else's location, photos, chats or personal details without their permission.</p>
      <p><b>🛡️ Keep it safe.</b> No dangerous or illegal activity. Meet in public places, tell a friend where you are going, and leave if you feel uncomfortable.</p>
      <p><b>🚫 No spam or fakes.</b> No scams, impersonation or fake accounts. Clubs: only post events you are really organizing.</p>
      <p><b>🔞 Keep it appropriate.</b> No sexual or violent content. Yalla is for people aged 16 and over.</p>
      <p><b>⚑ Report problems.</b> Use <i>Report</i> on a profile, an event, a club, or next to a message. You can also block anyone. Blocked people can't message you, see you on the map or view your profile.</p>
      <p><b>✉️ Need help?</b> Write to <a href="mailto:${esc(BRAND.support)}">${esc(BRAND.support)}</a>.</p>
    </div>
    <div class="btns"><button class="btn primary" data-a="closeSheet">Got it</button></div>`;
  }

  if (s.type === 'blocked') {
    const l = (me.blocked || []).map(id => user(id)).filter(Boolean);
    return `<h2>Blocked people</h2><p class="sub">They can't message you, see you on the map, or view your profile.</p>
    ${l.length ? l.map(u => `<div class="row-item static">${av(u, 42)}<span class="mid"><b>${nm(u)}</b><small>${subline(u)}</small></span><button class="pill ghost" data-a="unblock" data-id="${u.id}">Unblock</button></div>`).join('') : '<p class="hint" style="text-align:left">You have not blocked anyone.</p>'}`;
  }

  if (s.type === 'delete') {
    const club = isClub(me), f = s.form, hosted = db.hangouts.filter(h => h.host === me.id).length;
    const leads = club ? [] : db.users.filter(c => isClub(c) && isHead(me, c)).map(c => c.name);
    const needsPw = CLOUD || (!!me.passHash && me.id !== 'u_demo');
    const ev = `${hosted} event${hosted === 1 ? '' : 's'}`;
    return `
    <h2>Delete ${club ? 'this club' : 'your account'}</h2><p class="sub">This is permanent and cannot be undone.</p>
    <div class="delist"><b>What gets deleted</b><ul>${club
      ? `<li>The club profile, logo and photo gallery</li><li>Its community: news, chat and suggestions</li>${hosted ? `<li>Its ${ev} and their chats</li>` : ''}<li>The follower and member lists</li>`
      : `<li>Your profile, photo and badges</li><li>Your spot history and location</li><li>Your private chats, and the messages you wrote in groups and communities</li><li>Your besties, follows and community memberships</li>${hosted ? `<li>${ev} you host (they are cancelled)</li>` : ''}${leads.length ? `<li>Your head role in ${leads.map(esc).join(', ')}</li>` : ''}`}</ul></div>
    ${me.id === 'u_demo' ? '<p class="hint" style="text-align:left">This is the demo account. Deleting it resets the demo data.</p>' : ''}
    <form data-form="deleteAcct">
      ${needsPw ? `<label class="field"><span>Your password</span><input type="password" data-f="form.password" value="${esc(f.password || '')}" autocomplete="current-password"></label>` : ''}
      <label class="field"><span>Type DELETE to confirm</span><input data-f="form.confirm" value="${esc(f.confirm || '')}" autocomplete="off" autocapitalize="characters"></label>
      <p class="err" id="err" role="alert"></p>
      <div class="btns two"><button type="button" class="btn soft" data-a="closeSheet">Keep my account</button><button class="btn delete">Delete forever</button></div>
    </form>`;
  }

  if (s.type === 'photo') {
    const c = user(s.club), p = (c?.gallery || []).find(x => x.id === s.id);
    if (!p || !okPhoto(p.img)) return '<h2>Photo gone</h2>';
    return `<img class="lightbox" src="${p.img}" alt="${esc(p.cap || 'Photo')}"><p class="sub" style="margin-top:10px">${esc(p.cap || '')}</p>
    <div class="btns two"><button class="btn soft" data-a="closeSheet">Close</button>${c.id === me.id ? `<button class="btn danger" data-a="delPhoto" data-id="${p.id}">Delete</button>` : '<span></span>'}</div>`;
  }

  if (s.type === 'events') {
    return `<h2>Activity</h2><p class="sub" style="margin-bottom:14px">What's happening around campus.</p>
    ${myEvents().slice(0, 20).map(e => `
      <button class="event ${e.kind === 'tier' || e.kind === 'match' ? 'hot' : ''}" ${e.hangoutId && hangout(e.hangoutId) ? `data-a="openHangout" data-id="${e.hangoutId}"` : e.kind === 'near' ? `data-a="focusUser" data-id="${e.userId}"` : e.kind === 'ann' ? `data-a="openCommunity" data-id="${e.userId}"` : e.kind === 'sug' ? `data-a="openCommunity" data-id="${me.id}" data-t="sug"` : e.kind === 'req' ? `data-a="openCommunity" data-id="${me.id}" data-t="mem"` : e.kind === 'accepted' ? `data-a="openCommunity" data-id="${e.userId}" data-t="chat"` : e.kind === 'collab' || e.kind === 'collabok' ? `data-a="tab" data-t="home"` : e.kind === 'badge' ? `data-a="tab" data-t="me"` : `data-a="person" data-id="${e.userId}"`}>
        <span class="ico">${evIcon(e)}</span>${av(U(e.userId), 36)}
        <span class="tx">${evText(e)}<small>${e.kind === 'tier' ? `met ${e.met} people · ` : ''}${e.kind === 'match' && e.why ? `${esc(e.why)} · ` : ''}${since(e.ts)}</small></span>
      </button>`).join('')}`;
  }
  return '';
}

// ───────────────────────── render ─────────────────────────
function renderInner() {
  if (!me) { app.innerHTML = authView(); return; }
  if (ui.chat) { app.innerHTML = chatView(); refreshMessages(); return; }
  const views = { home: homeView, chats: chatsView, friends: friendsView, ranks: ranksView, me: meView };
  const home = ui.tab === 'home';
  const keep = $('.screen')?.scrollTop || 0, keepP = $('.pbody')?.scrollTop || 0;
  const typing = document.activeElement?.classList?.contains('msearch');
  app.innerHTML = `<div class="screen ${home ? 'home' : ''}">${(views[ui.tab] || homeView)()}</div>${ui.tab === 'me' && !isClub(me) ? '' : tabbar()}`;
  const sc = $('.screen'); if (sc && keep && !ui.tabChanged) sc.scrollTop = keep;
  const pb = $('.pbody'); if (pb && keepP && !ui.tabChanged) pb.scrollTop = keepP;
  ui.tabChanged = false;
  if (home) {
    ui.mapSeen = true;
    const r = $('#mres'); if (r) r.innerHTML = mresHtml();
    if (typing) { const n = $('.msearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  }
}
function appMode() { return me ? (isClub(me) ? 'club' : 'student') : (ui.authMode === 'signup' && ui.auth.type === 'club' ? 'club' : 'student'); }
function render() { document.documentElement.dataset.mode = appMode(); renderInner(); syncMap(); }

function renderSheet() {
  const el = $('#sheet'), s = ui.sheet;
  if (!s || !me) { el.className = ''; el.innerHTML = ''; return; }
  const keep = $('.sheet')?.scrollTop || 0;
  el.className = 'on';
  el.innerHTML = `<div class="scrim ${ui.sheetFresh ? 'enter' : ''}" data-a="closeSheet"></div><div class="sheet ${ui.sheetFresh ? 'enter' : ''}" role="dialog" aria-modal="true"><div class="grab"></div>${sheetBody(s)}</div>`;
  if (keep && !ui.sheetFresh) $('.sheet').scrollTop = keep;
  ui.sheetFresh = false;
}
function refresh() { render(); renderSheet(); }
function openSheet(s) { ui.sheet = s; ui.sheetFresh = true; renderSheet(); }
function closeSheet() { ui.sheet = null; renderSheet(); }
// Deleting an account removes the person (or club) and every trace of them: profile, photos, location history,
// private chats, their messages elsewhere, event attendance, friendships, follows, memberships and notifications.
// blocking is mutual in effect: neither side can see or message the other, and they stop being besties
function blockUser(id) {
  if (!id || id === me.id) return;
  if (CLOUD) { if (!(me.blocked ||= []).includes(id)) me.blocked.push(id); me.besties = me.besties.filter(x => x !== id); Cloud.block(id).then(() => refresh()); return; }
  const list = (me.blocked ||= []);
  if (!list.includes(id)) list.push(id);
  me.besties = (me.besties || []).filter(x => x !== id);
  const o = user(id); if (o) o.besties = (o.besties || []).filter(x => x !== me.id);
  if (ui.route === id) ui.route = null;
  save();
}
// DELETION IS SILENT ON PURPOSE: nothing is sent to besties, followers, attendees or anyone else, and no "left" or
// "deleted" message is written. People simply stop seeing the account. Do not add pushEvent/addMsg/toast calls here.
function deleteAccountData(u) {
  const id = u.id, club = isClub(u);
  const gone = new Set(db.hangouts.filter(h => h.host === id).map(h => h.id)); // events they hosted are cancelled
  db.hangouts = db.hangouts.filter(h => !gone.has(h.id));
  gone.forEach(hid => delete db.chats['h:' + hid]);
  db.hangouts.forEach(h => {
    h.members = h.members.filter(m => m !== id);
    if (h.by === id) h.by = null;
    if (h.cohosts) h.cohosts = h.cohosts.filter(c => c.club !== id);
  });
  Object.keys(db.chats).forEach(k => {
    if (k.startsWith('dm:') && k.slice(3).split('|').includes(id)) { delete db.chats[k]; return; }
    db.chats[k] = db.chats[k].filter(m => m.from !== id && !(m.sys && (m.text || '').startsWith(u.name + ' ')));
  });
  if (club) delete db.chats['c:' + id];
  db.users.forEach(o => {
    if (o.id === id) return;
    o.besties = (o.besties || []).filter(x => x !== id);
    o.following = (o.following || []).filter(x => x !== id);
    o.hidden = (o.hidden || []).filter(x => !gone.has(x));
    o.views = (o.views || []).filter(v => v.by !== id);
    o.blocked = (o.blocked || []).filter(x => x !== id);
    if (isClub(o)) {
      o.members = (o.members || []).filter(x => x !== id);
      o.requests = (o.requests || []).filter(x => x !== id);
      o.admins = (o.admins || []).filter(x => x !== id);
      if (o.roles) delete o.roles[id];
      o.sugs = (o.sugs || []).filter(s => s.from !== id).map(s => ({ ...s, votes: s.votes.filter(v => v !== id) }));
      o.posts = (o.posts || []).filter(p => !gone.has(p.hangoutId)).map(p => (p.by === id ? { ...p, by: null } : p));
    }
  });
  db.events = db.events.filter(e => e.userId !== id && e.to !== id && !gone.has(e.hangoutId));
  db.reports = (db.reports || []).filter(r => r.by !== id).map(r => (r.target === id ? { ...r, snippet: '', details: '' } : r)); // reports about them stay for safety, without the content
  db.users = db.users.filter(o => o.id !== id);
  if (ui.route === id) ui.route = null;
  ui.near = new Set();
}
function deleteLink() {
  if (isCreator(me)) return '';
  if (isClub(me) && ui.actor) return '<p class="hint">Only the club\'s own login can delete the club.</p>';
  return `<button class="linkbtn dangerlink" data-a="deleteAccount">Delete my ${isClub(me) ? 'club account' : 'account'}</button>`;
}
function acceptMemberFor(c, id) {
  c.requests = (c.requests || []).filter(x => x !== id);
  if (!isMember(user(id), c)) (c.members ||= []).push(id);
  const u = user(id);
  if (u && !(u.following ||= []).includes(c.id)) u.following.push(c.id);
  pushEvent({ kind: 'accepted', to: id, userId: c.id });
  save();
  if (me && id === me.id) toast(`<span style="font-size:22px">✅</span><span>${esc(c.name)} accepted you<small>You can chat and send ideas now</small></span>`, 6500, { a: 'openCommunity', id: c.id, t: 'chat' });
}
function openCommunity(id, tab = 'ann') { ui.chat = 'c:' + id; ui.ctab = tab; ui.stickers = false; ui.draft = ''; ui.sheet = null; refresh(); }
function openChat(key) { ui.chat = key; ui.stickers = false; ui.draft = ''; ui.sheet = null; refresh(); }

// ───────────────────────── actions ─────────────────────────
function setSession(u) {
  $('#toasts').innerHTML = ''; // on-screen messages belong to the previous person, never show them to the next one
  me = u;
  ui.actor = null;
  markActive(u); checkBadges(u);
  try { localStorage.setItem(SKEY, u.id); } catch { /* ignore */ }
  ui.tab = 'home'; ui.chat = null; ui.sheet = null;
  refresh();
  welcomeToast();
  startSim();
}
function welcomeToast() {
  const ev = isClub(me) ? null : db.events.find(e => e.kind === 'tier');
  if (ev) setTimeout(() => toast(evToast(ev), 4800), 700);
  if (isAlumni(me) && !me.alumniSeen) {
    me.alumniSeen = true; save();
    setTimeout(() => toast('<span style="font-size:22px">🎓</span><span>Congrats, you\'re Alumni now<small>Your profile shows the Alumni title</small></span>', 6500), 1600);
  }
}
function afterJoin(hid, evs, openIt) {
  // at most two toasts: your own tier-up first, then one about somebody else
  const mine = evs.find(e => e.userId === me.id), other = evs.find(e => e.userId !== me.id);
  if (mine) toast(`${evToast(mine)}<small style="opacity:.7;font-weight:700">${mine.met} met</small>`, 5200);
  if (other) toast(evToast(other), 4200);
  if (!mine && !other) toast(`<span style="font-size:22px">🙌</span><span>You're in! Say hi in the group chat.</span>`);
  if (openIt) openChat('h:' + hid); else refresh();
}

const actions = {
  tab: d => { if (ui.tab === 'me' && d.t !== 'me') { me.viewsSeenAt = Date.now(); save(); } ui.tab = d.t; ui.tabChanged = true; ui.sheet = null; refresh(); const sc = $('.screen'); if (sc) sc.scrollTop = 0; },
  filter: d => { ui.filter = d.k; if (!['all', 'now'].includes(d.k)) { bump(me, 'act', d.k, 0.5); save(); } render(); },
  authMode: d => { ui.authMode = d.m; render(); },
  pickColor: d => { ui.auth.color = d.v; render(); },
  demo: async () => { const u = user('u_demo'); if (u) setSession(u); },
  logout: () => { if (CLOUD) Cloud.signOut(); try { localStorage.removeItem(SKEY); } catch { /* ignore */ } stopSim(); unwatchLive(); $('#toasts').innerHTML = ''; ui.actor = null; me = null; ui.chat = null; ui.sheet = null; ui.authMode = 'login'; refresh(); },
  openGuidelines: () => openSheet({ type: 'guidelines' }),
  changePassword: () => openSheet({ type: 'password', form: { cur: '', pw: '', pw2: '' } }),
  installApp: async () => { if (!installEvent) return; installEvent.prompt(); try { await installEvent.userChoice; } catch { /* ignore */ } installEvent = null; render(); },
  hideInstall: () => { try { localStorage.setItem('yalla.hideInstall', '1'); } catch { /* ignore */ } render(); },
  openBlocked: () => openSheet({ type: 'blocked' }),
  reportUser: d => openSheet({ type: 'report', form: { kind: 'user', id: d.id, userId: d.id, reason: '', details: '', alsoBlock: false } }),
  reportClub: d => openSheet({ type: 'report', form: { kind: 'club', id: d.id, userId: d.id, reason: '', details: '' } }),
  reportEvent: d => openSheet({ type: 'report', form: { kind: 'event', id: d.id, userId: hangout(d.id)?.host, reason: '', details: '' } }),
  msgMenu: d => {
    const m = msgsOf(d.key).find(x => x.id === d.id);
    if (m) openSheet({ type: 'report', form: { kind: 'message', id: m.id, key: d.key, userId: m.from, snippet: (m.text || '').slice(0, 160), reason: '', details: '', alsoBlock: false } });
  },
  formReason: d => { ui.sheet.form.reason = d.k; renderSheet(); },
  formBlock: () => { ui.sheet.form.alsoBlock = !ui.sheet.form.alsoBlock; renderSheet(); },
  unblock: d => { if (CLOUD) Cloud.unblock(d.id); me.blocked = (me.blocked || []).filter(id => id !== d.id); save(); refresh(); toast('Unblocked'); },
  deleteAccount: () => openSheet({ type: 'delete', form: { confirm: '', password: '' } }),
  reset: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); } catch { /* ignore */ } location.reload(); },
  toast: d => toast(esc(d.m)),

  openCommunity: d => openCommunity(d.id, d.t || 'ann'),
  openPhoto: d => openSheet({ type: 'photo', club: d.club, id: d.id }),
  delPhoto: d => { if (CLOUD) { Cloud.deletePhoto(me.id, d.id).then(() => { closeSheet(); render(); }); return; } me.gallery = (me.gallery || []).filter(p => p.id !== d.id); save(); closeSheet(); render(); },
  // community membership: followers can read the news, heads accept who may chat
  requestJoin: d => {
    const c = user(d.id);
    if (!c || !isClub(c) || isClub(me) || isMember(me, c)) return;
    if (CLOUD) { Cloud.requestJoin(c.id).then(ok => { if (ok) toast(`<span style="font-size:22px">🙋</span><span>Request sent to ${esc(c.name)}<small>A head will answer</small></span>`); refresh(); }); return; }
    if (!(me.following ||= []).includes(c.id)) me.following.push(c.id);
    if (!(c.requests ||= []).includes(me.id)) { c.requests.push(me.id); pushEvent({ kind: 'req', to: c.id, userId: me.id }); }
    save(); refresh();
    toast(`<span style="font-size:22px">🙋</span><span>Request sent to ${esc(c.name)}<small>A head will answer</small></span>`);
    if (c.bot && !(c.admins || []).includes(me.id)) later(() => { if (me && (c.requests || []).includes(me.id) && Math.random() < 0.8) { acceptMemberFor(c, me.id); refresh(); } }, 5000 + Math.random() * 4000);
  },
  cancelRequest: d => { if (CLOUD) { Cloud.cancelRequest(d.id).then(() => refresh()); return; } const c = user(d.id); if (c) c.requests = (c.requests || []).filter(id => id !== me.id); save(); refresh(); },
  acceptMember: d => { if (CLOUD) { Cloud.setMember(me.id, d.id, true).then(() => render()); return; } acceptMemberFor(me, d.id); render(); },
  declineMember: d => { if (CLOUD) { Cloud.setMember(me.id, d.id, false).then(() => render()); return; } me.requests = (me.requests || []).filter(id => id !== d.id); save(); render(); },
  removeMember: d => { if (CLOUD) { Cloud.setMember(me.id, d.id, false).then(() => render()); return; } me.members = (me.members || []).filter(id => id !== d.id); save(); render(); },
  // clubs team up: the host invites, the other club accepts, and then the event shows to both followings
  formCollab: d => { const l = (ui.sheet.form.collab ||= []), i = l.indexOf(d.id); if (i >= 0) l.splice(i, 1); else l.push(d.id); renderSheet(); },
  collabAccept: d => {
    const h = hangout(d.id), x = h?.cohosts?.find(c => c.club === me.id);
    if (!x) return;
    if (CLOUD) { Cloud.answerCollab(d.id, me.id, true).then(ok => { render(); if (ok) toast(`<span style="font-size:22px">🤝</span><span>You are co-hosting<small>${esc(h.title)} now shows to your followers too</small></span>`); }); return; }
    x.status = 'accepted';
    if (!h.members.includes(me.id)) h.members.push(me.id);
    postUpdate(me, ui.actor || null, '', h.id);
    followersOf(me.id).forEach(f => pushEvent({ kind: 'club', to: f.id, userId: me.id, hangoutId: h.id }));
    pushEvent({ kind: 'collabok', to: h.host, userId: me.id, hangoutId: h.id });
    save(); render();
    toast(`<span style="font-size:22px">🤝</span><span>You are co-hosting<small>${esc(h.title)} now shows to your followers too</small></span>`);
  },
  collabDecline: d => { if (CLOUD) { Cloud.answerCollab(d.id, me.id, false).then(() => render()); return; } const x = hangout(d.id)?.cohosts?.find(c => c.club === me.id); if (x) x.status = 'declined'; save(); render(); },

  ctab: d => { ui.ctab = d.t; ui.stickers = false; render(); },
  // several people can run one club: admins open it from their own account and post as the club
  switchClub: d => {
    const c = user(d.id);
    if (!c || !(c.admins || []).includes(me.id)) return toast('You are not an admin of that club');
    stopSim(); unwatchLive(); ui.actor = me.id; me = c;
    Object.assign(ui, { tab: 'home', chat: null, sheet: null, filter: 'all', route: null });
    refresh(); startSim();
    toast(`<span style="font-size:22px">📣</span><span>You are acting as ${esc(c.name)}<small>Posts and events go out as the club</small></span>`);
  },
  leaveClub: () => {
    if (!ui.actor) return;
    stopSim(); me = user(ui.actor); ui.actor = null;
    Object.assign(ui, { tab: 'me', chat: null, sheet: null, route: null });
    refresh(); startSim();
  },
  removeAdmin: d => {
    if ((me.admins || []).length < 2) return toast('A club needs at least one admin');
    if (CLOUD) { Cloud.removeHead(me.id, d.id).then(() => render()); return; }
    me.admins = me.admins.filter(id => id !== d.id); delete (me.roles || {})[d.id]; save(); render();
  },
  sugVote: d => {
    if (!isMember(me, user(ui.chat.slice(2)))) return;
    const s = user(ui.chat.slice(2))?.sugs?.find(x => x.id === d.id); if (!s) return;
    if (CLOUD) { Cloud.vote(s.id, !s.votes.includes(Cloud.authId)).then(() => render()); return; }
    const i = s.votes.indexOf(me.id); if (i >= 0) s.votes.splice(i, 1); else s.votes.push(me.id);
    save(); render();
  },
  sugStatus: d => {
    const s = me.sugs?.find(x => x.id === d.id); if (!s) return;
    const order = ['new', 'seen', 'planned', 'done'];
    const next = order[(order.indexOf(s.status) + 1) % order.length];
    if (CLOUD) { Cloud.setSugStatus(s.id, next).then(() => render()); return; }
    s.status = next; save(); render();
  },

  addHeadId: d => { Cloud.addHead(me.id, d.id, (ui.adminRole || '').trim()).then(ok => { if (ok) { ui.find = null; ui.adminRole = ''; render(); toast(`<span style="font-size:22px">⭐</span><span>${esc(U(d.id).name)} is now a head of ${esc(me.name)}</span>`); } }); },
  addMemberId: d => { Cloud.addMember(me.id, d.id).then(ok => { if (ok) { ui.find = null; render(); toast(`<span style="font-size:22px">✅</span><span>${esc(U(d.id).name)} was added to the community</span>`); } }); },
  forgot: async () => {
    const email = (ui.auth.email || '').trim().toLowerCase(), err = m => { const e = $('#err'); if (e) e.textContent = m; };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err('Type your email above first');
    const e2 = await Cloud.sendReset(email);
    if (e2) return err(e2);
    toast('<span style="font-size:22px">✉️</span><span>Check your email<small>If that address has an account, we sent a link to choose a new password</small></span>', 9000);
  },
  authType: d => { ui.auth.type = d.t || null; render(); },
  authCat: d => { ui.auth.category = d.k; render(); },
  authPhotoClear: () => { ui.auth.photo = null; render(); },
  formPhotoClear: () => { ui.sheet.form.photo = null; renderSheet(); },
  formColor: d => { ui.sheet.form.color = d.v; renderSheet(); },
  formCat: d => { ui.sheet.form.category = d.k; renderSheet(); },
  formShow: () => { ui.sheet.form.showTaste = !ui.sheet.form.showTaste; renderSheet(); },
  formFav: d => {
    const l = ui.sheet.form.favSpots, i = l.indexOf(d.k);
    if (i >= 0) l.splice(i, 1); else if (l.length < 5) l.push(d.k); else toast('Pick up to 5 favorite spots');
    renderSheet();
  },
  alumniOnly: () => { ui.alumniOnly = !ui.alumniOnly; render(); },
  remix: () => { me.remix = (me.remix || 0) + 1; save(); render(); toast('<span style="font-size:22px">🔁</span><span>Fresh take</span>'); },
  toggleTaste: () => { me.showTaste = me.showTaste === false; if (CLOUD) Cloud.setProfileFlags({ show_taste: me.showTaste !== false }); save(); render(); toast(me.showTaste === false ? 'Your take and favorite spots are hidden' : 'Your take is visible on your profile'); },
  clearVisits: () => { me.visits = []; save(); refresh(); toast('Spot history cleared'); },
  toggleNear: () => { me.nearAlerts = me.nearAlerts === false; if (CLOUD) Cloud.setProfileFlags({ near_alerts: me.nearAlerts !== false }); save(); checkNearby(false); renderSheet(); },

  follow: d => {
    const c = user(d.id);
    if (!c || !isClub(c) || isClub(me)) return;
    if (CLOUD) {
      const had = (me.following || []).includes(d.id);
      Cloud.setFollow(d.id, !had).then(ok => { if (ok) toast(had ? `Unfollowed ${esc(c.name)}` : `<span style="font-size:22px">📣</span><span>Following ${esc(c.name)}<small>You'll see their events</small></span>`); refresh(); });
      return;
    }
    const l = (me.following ||= []), i = l.indexOf(d.id);
    if (i >= 0) { l.splice(i, 1); toast(`Unfollowed ${esc(c.name)}`); }
    else { l.push(d.id); pushEvent({ kind: 'follow', userId: me.id, to: c.id }); toast(`<span style="font-size:22px">📣</span><span>Following ${esc(c.name)}<small>You'll see their events</small></span>`); }
    save(); refresh();
  },
  checkin: d => { setMyLoc(d.k); toast(`📍 You're at ${esc(PLACES[d.k].n)}`); },
  favSpot: d => {
    const l = (me.favSpots ||= []), i = l.indexOf(d.k);
    if (i >= 0) l.splice(i, 1); else if (l.length < 5) l.push(d.k); else return toast('Pick up to 5 favorite spots');
    save(); renderSheet();
  },
  useGps: () => {
    if (!navigator.geolocation) return toast("This browser can't share GPS");
    navigator.geolocation.getCurrentPosition(pos => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (dist(here, PLACES.library) > 900) return toast("You look off campus, so there's nothing to pin. Try dropping a pin instead.");
      setMyLocAt(here.lat, here.lng);
      toast('📍 Location updated');
    }, () => toast('Location permission was denied. Drop a pin on the map instead.'), { enableHighAccuracy: true, timeout: 8000 });
  },
  togglePrecise: () => {
    me.precise = me.precise === false;
    if (me.precise === false && me.loc) { const p = PLACES[me.loc.place]; me.loc.lat = p.lat; me.loc.lng = p.lng; me.loc.trail = []; }
    if (CLOUD) { Cloud.setProfileFlags({ precise: me.precise !== false }); if (me.loc?.lat != null) Cloud.publishLoc(me.loc, me.live ? me.live.until : Date.now() + 4 * HR); }
    save(); refresh();
  },
  pickOnMap: d => {
    ui.pick = { kind: d.k, form: ui.sheet?.form || null };
    Object.assign(ui, { sheet: null, chat: null, tab: 'home', tabChanged: true, panel: 'map' });
    refresh();
    toast(d.k === 'me' ? 'Tap the map where you are' : 'Tap the map where the event is');
  },
  cancelPick: () => { const p = ui.pick; ui.pick = null; refresh(); if (p?.kind === 'event' && p.form) openSheet({ type: 'create', form: p.form }); },
  unpin: () => { delete ui.sheet.form.lat; delete ui.sheet.form.lng; renderSheet(); },
  showEvent: d => {
    const h = hangout(d.id);
    if (!h) return;
    ui.sheet = null; ui.focusH = h.id; ui.panel = 'peek';
    if (ui.tab !== 'home') { ui.tab = 'home'; ui.tabChanged = true; }
    ui.chat = null; refresh(); flyToPos(hPos(h), 18);
    setTimeout(() => { ui.focusH = null; if (map) drawMarkers(); }, 7000);
  },
  zoomIn: () => map?.zoomIn(0.5),
  zoomOut: () => map?.zoomOut(0.5),
  locate: () => {
    if (isClub(me)) { ensureMap()?.fitBounds(campusBounds(), { paddingTopLeft: [10, 120], paddingBottomRight: [10, 260] }); return; }
    if (me.shareLoc && me.loc) return flyToPos(posOf(me), 18);
    toast('Turn on sharing to see yourself on the map');
    openSheet({ type: 'location' });
  },
  focusMe: () => flyToPos(posOf(me), 18),
  toggleScratch: () => { ui.scratch = !ui.scratch; render(); toast(ui.scratch ? '🗺️ Scratch map on: explore to clear the tiles' : 'Scratch map off'); },
  routeClear: () => { ui.route = null; render(); },
  // first tap on a bestie shows your route and the walk, tapping again opens their profile
  mapPerson: d => {
    if (d.id === me.id || ui.route === d.id) return actions.person(d);
    ui.route = d.id; render();
    if (me.shareLoc && me.loc) fitPoints([posOf(me), posOf(U(d.id))]); else flyToPos(posOf(U(d.id)), 17.5);
  },
  omw: d => {
    const t = dist(posOf(me), posOf(U(d.id))) < 40 ? 'wave' : 'omw', key = dmKey(me.id, d.id);
    addMsg(key, { from: me.id, sticker: t });
    toast(`<span style="font-size:22px">${stk(t).e}</span><span>Sent to ${esc(U(d.id).name)}</span>`);
    botReply(key);
  },
  focusUser: d => {
    const u = user(d.id);
    ui.sheet = null; ui.chat = null; ui.mq = '';
    if (ui.tab !== 'home') { ui.tab = 'home'; ui.tabChanged = true; }
    refresh();
    if (u && !isClub(me) && canSee(me, u)) { ui.route = u.id; render(); if (me.shareLoc && me.loc) fitPoints([posOf(me), posOf(u)]); else flyToPos(posOf(u), 18); }
    else { recordView(me.id, d.id); openSheet({ type: 'person', id: d.id }); }
  },
  focusSpot: d => {
    ui.sheet = null; ui.chat = null; ui.mq = '';
    if (ui.tab !== 'home') { ui.tab = 'home'; ui.tabChanged = true; }
    refresh(); flyToPlace(d.k, 17.5); openSheet({ type: 'spot', k: d.k });
  },
  focusHangout: d => {
    const h = hangout(d.id);
    ui.sheet = null; ui.chat = null; ui.mq = '';
    if (ui.tab !== 'home') { ui.tab = 'home'; ui.tabChanged = true; }
    refresh(); if (h) flyToPos(hPos(h), 17.5); actions.openHangout({ id: d.id });
  },

  authInterest: d => { const l = ui.auth.interests, i = l.indexOf(d.k); i >= 0 ? l.splice(i, 1) : l.push(d.k); render(); },
  editProfile: () => openSheet({ type: 'profile', form: {
    color: me.color, photo: me.photo || null, summary: me.summary || '', meets: me.meets || '',
    name: me.name, category: me.category || '', bio: me.bio || '',
    major: me.major || '', year: me.year || '', gradYear: me.gradYear || '', interests: [...(me.interests || [])],
    favSpots: [...(me.favSpots || [])], showTaste: me.showTaste !== false, alerts: me.alerts !== false, privateBrowsing: !!me.privateBrowsing,
  } }),
  formYear: d => { const f = ui.sheet.form; f.year = f.year === d.k ? '' : d.k; renderSheet(); },
  formInterest: d => { const l = ui.sheet.form.interests, i = l.indexOf(d.k); i >= 0 ? l.splice(i, 1) : l.push(d.k); renderSheet(); },
  formPrivate: () => { ui.sheet.form.privateBrowsing = !ui.sheet.form.privateBrowsing; renderSheet(); },
  formAlerts: () => { ui.sheet.form.alerts = !ui.sheet.form.alerts; renderSheet(); },
  sameMajor: () => { ui.sameMajorOnly = !ui.sameMajorOnly; render(); },
  dismissPick: d => { const h = hangout(d.id); if (h) learn(me, h, -2); (me.hidden ||= []).push(d.id); save(); render(); toast('Got it, fewer like that'); },

  locSheet: () => openSheet({ type: 'location' }),
  toggleLive: () => { if (liveOn()) { stopLive('manual'); refresh(); toast('📡 Live location stopped. Ghost mode is on.'); } else startLive(ui.liveHours || 4); },
  liveHours: d => { ui.liveHours = +d.k; renderSheet(); },
  toggleLoc: () => {
    if (me.shareLoc && me.live) { stopLive('manual'); refresh(); return toast('👻 Ghost mode is on. Nobody can see you.'); }
    me.shareLoc = !me.shareLoc;
    if (me.shareLoc) me.loc = { place: me.loc?.place || 'cafeteria', ts: Date.now() };
    if (CLOUD) {
      if (me.shareLoc) { const pl = PLACES[me.loc.place]; me.loc.lat = pl.lat; me.loc.lng = pl.lng; Cloud.setSharing(true).then(ok => ok && Cloud.publishLoc(me.loc, Date.now() + 4 * HR)); }
      else Cloud.setSharing(false);
    }
    save(); checkNearby(false); refresh();
    toast(me.shareLoc ? '📍 Mutual besties can see your spot' : '👻 Ghost mode is on. Nobody can see you.');
  },
  setLoc: d => setMyLoc(d.k),

  bell: () => { openSheet({ type: 'events' }); me.seenAt = Date.now(); save(); render(); },
  closeSheet,
  newHangout: () => {
    const club = isClub(me);
    openSheet({ type: 'create', form: { act: club ? 'talk' : 'coffee', title: '', place: club ? 'auditorium' : 'cafeteria', when: 'tonight', custom: '', max: club ? 50 : 8, desc: '' } });
  },
  formAct: d => { ui.sheet.form.act = d.k; renderSheet(); },
  formWhen: d => { ui.sheet.form.when = d.k; renderSheet(); },

  openHangout: d => {
    const h = hangout(d.id);
    if (h && !ui.seen.has(h.id)) { ui.seen.add(h.id); learn(me, h, 0.6); save(); }
    openSheet({ type: 'hangout', id: d.id });
  },
  person: d => { recordView(me.id, d.id); openSheet({ type: 'person', id: d.id }); },
  join: (d, ev) => {
    ev.stopPropagation();
    if (isClub(me)) return toast('Clubs create events, they do not join them');
    if (CLOUD) {
      const h = hangout(d.id);
      Cloud.join(d.id).then(ok => { if (!ok) return; if (h) { learn(me, h, 3); recordVisit(me, h.place); save(); } afterJoin(d.id, [], true); });
      return;
    }
    afterJoin(d.id, joinHangout(d.id, me.id), true);
  },
  leave: d => { if (CLOUD) { const h = hangout(d.id); if (h) { learn(me, h, -2.5); save(); } Cloud.leave(d.id).then(() => { ui.sheet = null; if (ui.chat === 'h:' + d.id) ui.chat = null; refresh(); toast('You left the hangout'); }); return; } leaveHangout(d.id); ui.sheet = null; if (ui.chat === 'h:' + d.id) ui.chat = null; refresh(); toast('You left the hangout'); },
  cancelHangout: d => { if (CLOUD) { Cloud.cancel(d.id).then(() => { ui.sheet = null; if (ui.chat === 'h:' + d.id) ui.chat = null; refresh(); toast('Hangout cancelled'); }); return; } cancelHangout(d.id); ui.sheet = null; if (ui.chat === 'h:' + d.id) ui.chat = null; refresh(); toast('Hangout cancelled'); },
  bestie: d => {
    if (CLOUD) {
      const had = me.besties.includes(d.id);
      if (!had && me.besties.length >= MAX_BESTIES) return toast(`Besties are limited to ${MAX_BESTIES}. Remove one first.`);
      if (had) me.besties = me.besties.filter(x => x !== d.id); else me.besties.push(d.id);
      refresh();
      Cloud.setBestie(d.id, !had).then(ok => { if (ok && !had) toast(`💖 ${esc(U(d.id).name)} will see your spot once they add you back`); refresh(); });
      return;
    }
    const i = me.besties.indexOf(d.id);
    if (i >= 0) me.besties.splice(i, 1);
    else if (me.besties.length >= MAX_BESTIES) return toast(`Besties are limited to ${MAX_BESTIES}. Remove one first.`);
    else { me.besties.push(d.id); toast(`💖 ${esc(U(d.id).name)} is now your bestie`); botAddBack(d.id); }
    save(); refresh();
  },

  openChat: d => openChat(d.key),
  dm: d => openChat(dmKey(me.id, d.id)),
  chatsTab: d => { ui.chatsTab = d.t; render(); },
  back: () => { ui.chat = null; ui.stickers = false; ui.sheet = null; refresh(); },
  stickers: () => {
    ui.stickers = !ui.stickers;
    $('#tray')?.classList.toggle('open', ui.stickers);
    $('#stk-btn')?.classList.toggle('on', ui.stickers);
    const el = $('#msgs'); if (el) el.scrollTop = el.scrollHeight;
  },
  sticker: d => { addMsg(ui.chat, { from: me.id, sticker: d.id }); refreshMessages(); botReply(ui.chat); },
};

const forms = {
  async auth() {
    const a = ui.auth, email = a.email.trim().toLowerCase(), err = m => { const e = $('#err'); if (e) e.textContent = m; };
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if (CLOUD) {
      const signup = ui.authMode === 'signup', club = signup && a.type === 'club';
      const r = await Cloud.submitAuth(ui);
      if (r === 'CONFIRM') {
        Object.assign(a, { password: '', agree: false });
        ui.authMode = 'login'; render();
        return toast('<span style="font-size:22px">✉️</span><span>Check your email<small>Click the link we sent, then log in</small></span>', 9000);
      }
      if (r) return err(r);
      Object.assign(a, { password: '', photo: null, name: '', email: '', major: '', bio: '', summary: '', meets: '', heads: '', category: '', interests: [], type: null, agree: false });
      setSession(me);
      if (signup) toast(club ? '<span style="font-size:22px">📣</span><span>Your club is live<small>Post an event, followers get notified</small></span>' : '<span style="font-size:22px">🎉</span><span>Welcome to Yalla! Join a hangout to meet people.</span>');
      return;
    }
    if (ui.authMode === 'signup') {
      if (!a.type) return err('Choose student or club first');
      if (!a.agree) return err('Please confirm you are 16 or older and accept the Terms and Privacy policy');
      const club = a.type === 'club', name = a.name.trim();
      if (!name) return err(club ? 'Add your club name' : 'Add your first name');
      if (club && !a.category) return err('Pick a category for your club');
      if (name.toLowerCase() === (user(CREATOR_ID)?.name || '').toLowerCase()) return err('That name is reserved for the creator of Yalla');
      if (!emailOk) return err('Enter a valid email address');
      if (a.password.length < 8) return err('Password needs at least 8 characters');
      if (db.users.some(u => u.email === email)) return err('That email already has an account. Log in instead.');
      if (club && db.users.some(u => isClub(u) && u.name.toLowerCase() === name.toLowerCase())) return err('A club with that name already exists');
      const salt = uid('s');
      const base = {
        id: uid(club ? 'c_' : 'u_'), name, email, salt, passHash: await sha(a.password, salt), color: a.color,
        photo: okPhoto(a.photo) ? a.photo : null, besties: [], following: [], seenAt: Date.now(), shareLoc: false, loc: null,
        prefs: null, interests: [], alerts: true, hidden: [], visits: [], favSpots: [], showTaste: true, nearAlerts: true, remix: 0, major: '', year: '', days: [todayKey()],
      };
      let u, missing = 0;
      if (club) {
        const mails = [...new Set(a.heads.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
        const heads = mails.map(m => peers().find(p => p.email === m)).filter(Boolean).map(p => p.id);
        missing = mails.length - heads.length;
        u = { ...base, type: 'club', category: a.category, bio: a.bio.trim(), summary: a.summary.trim(), meets: a.meets.trim(), verified: false, showTaste: false, nearAlerts: false,
          admins: heads, roles: Object.fromEntries(heads.map(id => [id, 'Head'])), members: [], requests: [], gallery: [], posts: [], sugs: [] };
      } else u = { ...base, major: a.major.trim(), prefs: newPrefs(a.interests), interests: [...a.interests] };
      db.users.push(u); save();
      Object.assign(a, { password: '', photo: null, name: '', email: '', major: '', bio: '', summary: '', meets: '', heads: '', category: '', interests: [], type: null, agree: false });
      setSession(u);
      toast(club ? `<span style="font-size:22px">📣</span><span>Your club is live<small>${missing ? `${missing} head email${missing === 1 ? '' : 's'} had no student account yet` : 'Post an event, followers get notified'}</small></span>` : '<span style="font-size:22px">🎉</span><span>Welcome to Yalla! Join a hangout to meet people.</span>');
    } else {
      if (!email || !a.password) return err('Enter your email and password');
      const u = db.users.find(x => x.email === email && x.passHash);
      if (!u || (await sha(a.password, u.salt)) !== u.passHash) return err('Wrong email or password');
      a.password = '';
      setSession(u);
    }
  },
  async changePw() {
    const f = ui.sheet.form, err = m => { const e = $('#err'); if (e) e.textContent = m; };
    if (!f.cur) return err('Type your current password');
    if ((f.pw || '').length < 8) return err('The new password needs at least 8 characters');
    if (f.pw !== f.pw2) return err('The two new passwords are not the same');
    if (f.pw === f.cur) return err('Choose a password different from the current one');
    const e2 = await Cloud.changePassword(f.cur, f.pw);
    if (e2) return err(e2);
    closeSheet();
    toast('<span style="font-size:22px">🔑</span><span>Password changed</span>');
  },
  async newpass() {
    const err = m => { const e = $('#err'); if (e) e.textContent = m; };
    const pw = ui.auth.password;
    if (pw.length < 8) return err('Password needs at least 8 characters');
    const e2 = await Cloud.setNewPassword(pw);
    if (e2) return err(e2);
    ui.auth.password = ''; ui.recovery = false;
    await Cloud.restore();
    if (me) { setSession(me); toast('<span style="font-size:22px">🔑</span><span>Password changed</span>'); } else render();
  },
  report() {
    const f = ui.sheet.form, err = m => { const e = $('#err'); if (e) e.textContent = m; };
    if (!f.reason) return err('Pick what the problem is');
    if (CLOUD) Cloud.report(f); else db.reports.push({ id: uid('r_'), by: me.id, kind: f.kind, target: f.userId || f.id, ref: f.id, key: f.key || null, snippet: f.snippet || '', reason: f.reason, details: (f.details || '').trim(), ts: Date.now(), status: 'open' });
    if (f.alsoBlock && f.userId && f.userId !== me.id) blockUser(f.userId);
    save(); closeSheet(); render();
    toast(`<span style="font-size:22px">⚑</span><span>Report sent<small>Thank you. We review every report.</small></span>`, 5200);
  },
  async deleteAcct() {
    const err = m => { const e = $('#err'); if (e) e.textContent = m; };
    const f = ui.sheet.form, u = me;
    if (isCreator(u) || (isClub(u) && ui.actor)) return err('This account cannot be deleted from here');
    if ((f.confirm || '').trim() !== 'DELETE') return err('Type DELETE to confirm');
    if (CLOUD) {
      const club = isClub(u), name = u.name, e2 = await Cloud.deleteAccount(f.password || '');
      if (e2) return err(e2);
      stopSim(); unwatchLive();
      me = null; ui.actor = null; ui.chat = null; ui.sheet = null; ui.authMode = 'login'; ui.tab = 'home'; ui.filter = 'all';
      render(); renderSheet();
      toast(`<span style="font-size:22px">🗑️</span><span>${club ? 'Club' : 'Account'} deleted<small>${esc(name)} and everything linked to it is gone</small></span>`, 6500);
      return;
    }
    if (u.passHash && u.id !== 'u_demo' && (await sha(f.password || '', u.salt)) !== u.passHash) return err('That password is not right');
    const club = isClub(u), demo = u.id === 'u_demo', name = u.name;
    stopSim(); unwatchLive();
    deleteAccountData(u);
    try { localStorage.removeItem(SKEY); } catch { /* ignore */ }
    me = null; ui.actor = null; ui.chat = null; ui.sheet = null; ui.authMode = 'login'; ui.tab = 'home'; ui.filter = 'all';
    if (demo) db = await seed(); // keep the demo usable
    save(); render(); renderSheet();
    toast(`<span style="font-size:22px">🗑️</span><span>${club ? 'Club' : 'Account'} deleted<small>${demo ? 'Demo data was reset' : `${esc(name)} and everything linked to it is gone`}</small></span>`, 6500);
  },
  post() {
    const t = ui.annDraft.trim();
    if (!t || !isClub(me)) return;
    if (CLOUD) { Cloud.postNews(me.id, t.slice(0, 280)).then(ok => { if (!ok) return; ui.annDraft = ''; render(); toast('<span style="font-size:22px">📢</span><span>Posted</span>'); }); return; }
    postUpdate(me, ui.actor || null, t.slice(0, 280));
    notifyCommunity(me, { kind: 'ann', text: t.slice(0, 120) }, ui.actor ? [ui.actor] : []);
    ui.annDraft = ''; save(); render();
    toast(`<span style="font-size:22px">📢</span><span>Posted<small>${communityMembers(me).length - 1} members notified</small></span>`);
  },
  suggest() {
    const c = user(ui.chat.slice(2)), t = ui.sugDraft.trim();
    if (!c || !t || !isMember(me, c)) return;
    if (CLOUD) { Cloud.suggest(c.id, t.slice(0, 240)).then(ok => { if (!ok) return; ui.sugDraft = ''; render(); toast('<span style="font-size:22px">💡</span><span>Sent to the heads</span>'); }); return; }
    (c.sugs ||= []).unshift({ id: uid('s_'), ts: Date.now(), from: me.id, text: t.slice(0, 240), votes: [me.id], status: 'new' });
    pushEvent({ kind: 'sug', to: c.id, userId: me.id });
    ui.sugDraft = ''; save(); render();
    toast('<span style="font-size:22px">💡</span><span>Sent to the admins</span>');
  },
  addAdmin() {
    const err = m => { const e = $('#err'); if (e) e.textContent = m; };
    const email = (ui.adminEmail || '').trim().toLowerCase(), u = peers().find(x => x.email === email);
    if (!u) return err('No student account with that email yet');
    if ((me.admins ||= []).includes(u.id)) return err('That student is already a head');
    me.admins.push(u.id); (me.roles ||= {})[u.id] = (ui.adminRole || '').trim() || 'Head';
    ui.adminEmail = ''; ui.adminRole = ''; save(); render();
    toast(`<span style="font-size:22px">⭐</span><span>${esc(u.name)} is now a head of ${esc(me.name)}</span>`);
  },
  addMember() {
    const err = m => { const e = $('#err'); if (e) e.textContent = m; };
    const email = (ui.memberEmail || '').trim().toLowerCase(), u = peers().find(x => x.email === email);
    if (!u) return err('No student account with that email yet');
    if (isMember(u, me)) return err('Already a member');
    acceptMemberFor(me, u.id); ui.memberEmail = ''; render();
    toast(`<span style="font-size:22px">✅</span><span>${esc(u.name)} was added to the community</span>`);
  },
  send() {
    const t = ui.draft.trim();
    if (!t) return;
    if (ui.chat.startsWith('c:') && !isMember(me, user(ui.chat.slice(2)))) return toast('Only accepted members can chat');
    addMsg(ui.chat, { from: me.id, text: t.slice(0, 500) });
    ui.draft = '';
    const inp = $('#msg'); if (inp) { inp.value = ''; inp.focus(); }
    refreshMessages();
    botReply(ui.chat);
  },
  profile() {
    const f = ui.sheet.form, err = m => { const e = $('#err'); if (e) e.textContent = m; };
    if (CLOUD) {
      if (isClub(me)) { if (!f.name.trim()) return err('Your club needs a name'); if (!f.category) return err('Pick a category'); }
      else {
        const p = (me.prefs ||= newPrefs());
        ACTS.forEach(a => { const has = f.interests.includes(a.k), v = p.act[a.k] || 0; if (has && v < 2.5) p.act[a.k] = 2.5; if (!has && v > 0) p.act[a.k] = 0; });
        if (f.alerts !== (me.alerts !== false)) me.alerts = f.alerts;
      }
      Cloud.saveProfile(f).then(ok => { if (!ok) return; closeSheet(); render(); toast('<span style="font-size:22px">✨</span><span>Saved</span>'); });
      return;
    }
    me.color = f.color; me.photo = okPhoto(f.photo) ? f.photo : null;
    if (isClub(me)) {
      if (!f.name.trim()) return err('Your club needs a name');
      if (!f.category) return err('Pick a category');
      me.name = f.name.trim(); me.category = f.category; me.bio = f.bio.trim(); me.summary = (f.summary || '').trim(); me.meets = (f.meets || '').trim();
    } else {
      const p = (me.prefs ||= newPrefs());
      me.major = f.major.trim(); me.year = f.year; me.gradYear = f.gradYear ? +f.gradYear : null;
      me.alerts = f.alerts; me.privateBrowsing = !!f.privateBrowsing; me.showTaste = f.showTaste; me.favSpots = [...f.favSpots]; me.interests = [...f.interests];
      ACTS.forEach(a => {
        const has = f.interests.includes(a.k), v = p.act[a.k] || 0;
        if (has && v < 2.5) p.act[a.k] = 2.5;
        if (!has && v > 0) p.act[a.k] = 0;
      });
      if (isAlumni(me) && !me.alumniSeen) { me.alumniSeen = true; toast('<span style="font-size:22px">🎓</span><span>Welcome to the alumni<small>Your profile now shows the Alumni title</small></span>', 6000); }
    }
    save(); closeSheet(); render();
    toast('<span style="font-size:22px">✨</span><span>Saved</span>');
  },
  create() {
    const f = ui.sheet.form, a = act(f.act), club = isClub(me), err = m => { const e = $('#err'); if (e) e.textContent = m; };
    const when = whenFromKey(f);
    if (!Number.isFinite(when)) return err('Pick a date and time');
    if (when < Date.now() - MIN) return err('That time already passed');
    if (CLOUD) {
      const h = { host: me.id, act: f.act, title: f.title.trim() || a.def, place: f.place, where: (f.where || '').trim().slice(0, 60), lat: f.lat ?? null, lng: f.lng ?? null, when, max: +f.max, desc: f.desc.trim() };
      Cloud.createHangout(h, club ? (f.collab || []) : []).then(id => {
        if (!id) return;
        if (!club) { learn(me, h, 3); recordVisit(me, h.place); save(); }
        toast(club ? '<span style="font-size:22px">📣</span><span>Posted<small>Your followers can see it now</small></span>' : `<span style="font-size:22px">${a.e}</span><span>Posted! Friends can join now.</span>`);
        openChat('h:' + id);
      });
      return;
    }
    const h = { id: uid('h_'), host: me.id, act: f.act, title: f.title.trim() || a.def, place: f.place, where: (f.where || '').trim().slice(0, 60), lat: f.lat ?? null, lng: f.lng ?? null, when, max: +f.max, desc: f.desc.trim(), members: [me.id] };
    if (club) { h.club = true; if (ui.actor) h.by = ui.actor; if ((f.collab || []).length) h.cohosts = f.collab.map(id => ({ club: id, status: 'pending' })); }
    db.hangouts.push(h);
    db.chats['h:' + h.id] = [];
    addMsg('h:' + h.id, { sys: true, text: `${me.name} ${club ? 'posted this event' : 'started this hangout'}` });
    if (club) { announceClubEvent(h); (h.cohosts || []).forEach(x => pushEvent({ kind: 'collab', to: x.club, userId: me.id, hangoutId: h.id })); }
    else { pushEvent({ kind: 'new', userId: me.id, hangoutId: h.id }); learn(me, h, 3); recordVisit(me, h.place); }
    save();
    if (!club) { notifyMatches(h); notifyBestiesGoing(h, me.id, true); }
    toast(club ? `<span style="font-size:22px">📣</span><span>Posted<small>${nFol(me)} follower${nFol(me) === 1 ? '' : 's'} notified</small></span>` : `<span style="font-size:22px">${a.e}</span><span>Posted! Friends can join now.</span>`);
    openChat('h:' + h.id);
  },
};

// ───────────────────────── map: free OpenStreetMap-based tiles, with people on it (Bump style) ─────────────────────────
let map = null, layer = null;
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'; // free vector tiles from OpenStreetMap data
const webgl = () => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } };
function baseLayer() {
  if (window.maplibregl && L.maplibreGL && webgl()) {
    try { return L.maplibreGL({ style: MAP_STYLE, attribution: '' }); } catch { /* fall through to plain tiles */ }
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }); // fallback: plain OpenStreetMap tiles
}
const campusBounds = () => L.latLngBounds(CAMPUS.map(k => [PLACES[k].lat, PLACES[k].lng])).pad(0.1);
function ensureMap() {
  if (map) return map;
  if (!window.L) return null;
  map = L.map('map', { zoomControl: false, attributionControl: false, zoomSnap: 0.5, zoomDelta: 0.5, minZoom: 12, maxZoom: 19 });
  baseLayer().addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('zoomend', () => $('#map').classList.toggle('z-hi', map.getZoom() >= 17));
  map.on('click', e => { if (ui.pick) mapPicked(e.latlng.lat, e.latlng.lng); });
  return map;
}
function syncMap() {
  const el = $('#map');
  if (!el) return;
  const show = !!me && !ui.chat && ui.tab === 'home';
  el.classList.toggle('on', show);
  el.classList.toggle('picking', !!ui.pick);
  if (!show) return;
  if (!ensureMap()) { el.innerHTML = '<div class="map-off">The map needs an internet connection.</div>'; return; }
  map.invalidateSize();
  if (!ui.mapFit) {
    ui.mapFit = true;
    map.fitBounds(campusBounds(), { paddingTopLeft: [10, 120], paddingBottomRight: [10, Math.round(el.clientHeight * 0.5)], animate: false });
    $('#map').classList.toggle('z-hi', map.getZoom() >= 17);
  }
  drawMarkers();
}
// Scratch map (the hex tiles in Bump): the area around every spot you have been to is unlocked, the rest stays under pink glass.
const EXPLORE_R = 75; // metres
let HEX = null, fog = null, fogSig = '';
function hexGrid() {
  if (HEX) return HEX;
  const R = 42, mLat = 111320, mLng = 111320 * Math.cos(33.54 * Math.PI / 180);
  const b = campusBounds().pad(0.25), sw = b.getSouthWest(), ne = b.getNorthEast();
  const wM = (ne.lng - sw.lng) * mLng, hM = (ne.lat - sw.lat) * mLat, cells = [];
  for (let c = 0, x = 0; x < wM + R; c++, x += 1.5 * R) {
    for (let y = (c % 2) * (Math.sqrt(3) * R / 2); y < hM + R; y += Math.sqrt(3) * R) {
      const lat = sw.lat + y / mLat, lng = sw.lng + x / mLng;
      const pts = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i; return [lat + R * Math.sin(a) / mLat, lng + R * Math.cos(a) / mLng]; });
      cells.push({ id: `${c}:${Math.round(y)}`, lat, lng, pts, core: CAMPUS.some(k => dist({ lat, lng }, PLACES[k]) <= 160) });
    }
  }
  return (HEX = cells);
}
function exploredIds(u) {
  const spots = new Set((u.visits || []).map(v => v.p));
  db.hangouts.forEach(h => { if (h.members.includes(u.id) && h.when < Date.now()) spots.add(h.place); });
  const pts = [...[...spots].map(k => PLACES[k]).filter(Boolean), ...(u.trail || []).map(([lat, lng]) => ({ lat, lng })), ...(u.loc?.lat != null ? [{ lat: u.loc.lat, lng: u.loc.lng }] : [])];
  return new Set(hexGrid().filter(c => pts.some(p => dist(c, p) <= EXPLORE_R)).map(c => c.id));
}
function exploredPct(u) {
  if (!window.L) return 0;
  const core = hexGrid().filter(c => c.core), ex = exploredIds(u);
  return core.length ? Math.round(core.filter(c => ex.has(c.id)).length / core.length * 100) : 0;
}
function drawFog() {
  if (!fog) fog = L.layerGroup().addTo(map);
  const show = !isClub(me) && ui.scratch, ex = show ? exploredIds(me) : null;
  const sig = show ? [...ex].sort().join(',') : 'off';
  if (sig === fogSig) return;
  fogSig = sig; fog.clearLayers();
  if (!show) return;
  hexGrid().forEach(c => { if (!ex.has(c.id)) L.polygon(c.pts, { interactive: false, color: '#ff8fbf', weight: 1, opacity: 0.55, fillColor: '#ff8fbf', fillOpacity: 0.28 }).addTo(fog); });
}

const HP_SLOTS = [[0, 0], [30, 0], [-30, 0], [0, -46], [30, -46], [-30, -46]]; // pixel offsets when several hangouts share a spot
function personHtml(u) {
  const you = u.id === me.id, age = Date.now() - u.loc.ts, live = you || age < 15 * MIN, away = !you && age > 45 * MIN, st = statusOf(u);
  return `<div class="pm ${you ? 'you' : ''} ${live ? 'live' : ''} ${away ? 'away' : ''} ${ui.route === u.id ? 'sel' : ''}">
    <span class="halo"></span>${av(u, 56)}
    ${live && st ? `<em class="bub">${esc(st)}</em>` : ''}
    ${live && !you ? '<i class="lv">LIVE</i>' : ''}${away ? '<i class="mn">🌙</i>' : ''}
    <b class="nm">${you ? 'You' : esc(u.name)}</b></div>`;
}
function drawMarkers() {
  if (!map) return;
  drawFog();
  layer.clearLayers();
  const now = Date.now(), f = ui.filter, slot = {};
  const add = (lat, lng, html, size, anchor, z, onClick) => {
    const m = L.marker([lat, lng], { icon: L.divIcon({ className: '', html, iconSize: size, iconAnchor: anchor }), zIndexOffset: z, keyboard: false });
    if (onClick) m.on('click', onClick);
    m.addTo(layer);
  };
  const line = (a, b, opts) => L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { interactive: false, lineCap: 'round', ...opts }).addTo(layer);
  const people = [...nearby(me), ...(!isClub(me) && me.shareLoc && me.loc ? [me] : [])];

  // dotted trails: the path each bestie really walked
  people.forEach(u => {
    const t = u.loc.trail;
    if (u.id !== me.id && t && t.length > 1 && now - u.loc.ts < 30 * MIN) L.polyline(t, { interactive: false, color: '#ff4f9a', weight: 4, opacity: 0.9, dashArray: '1 9', lineCap: 'round' }).addTo(layer);
  });
  // the blue route to the bestie you tapped
  const rt = ui.route && user(ui.route);
  if (rt && !isClub(me) && me.shareLoc && me.loc && canSee(me, rt)) {
    const a = posOf(me), b = posOf(rt);
    if (dist(a, b) > 8) { line(a, b, { color: '#fff', weight: 11, opacity: 0.95 }); line(a, b, { color: '#3b82f6', weight: 5.5 }); }
  }

  // category pins for every spot, like the legend on a campus map
  Object.entries(PLACES).forEach(([k, p]) => {
    const kd = KINDS[p.kind];
    add(p.lat, p.lng, `<div class="sp" style="--c:${kd.c}"><span>${kd.e}</span><i>${esc(p.n)}</i></div>`, [28, 28], [14, 14], 0, () => openSheet({ type: 'spot', k }));
  });
  // events at the exact point they were pinned (or the spot's centre when nobody pinned them)
  visible(me).filter(h => h.when > now - 3 * HR && (f === 'all' || (f === 'now' ? h.when < now + HR : h.act === f))).forEach(h => {
    const p = hPos(h); if (p.lat == null) return;
    const exact = h.lat != null, key = exact ? 'e' + h.id : 'h' + h.place;
    const i = slot[key] = (slot[key] ?? -1) + 1, [dx, dy] = exact ? [0, 0] : HP_SLOTS[i % HP_SLOTS.length], a = act(h.act);
    add(p.lat, p.lng, `<div class="hp ${h.when < now + HR ? 'hot' : ''} ${ui.focusH === h.id ? 'focus' : ''}" style="--c:${a.c}"><span>${a.e}</span><b>${going(h)}</b>${h.club ? '<em>📣</em>' : ''}<i>${esc(h.title)}</i></div>`, [38, 46], [19 - dx, 46 - dy + (exact ? 0 : 16)], 100 + i, () => actions.openHangout({ id: h.id }));
  });
  // people at their exact positions. Three or more within 25 m become a group bubble.
  const groups = [];
  people.forEach(u => { const g = groups.find(x => dist(posOf(x.list[0]), posOf(u)) <= 25); if (g) g.list.push(u); else groups.push({ list: [u] }); });
  groups.forEach(({ list }) => {
    if (list.length >= 3) {
      const c = { lat: list.reduce((s, u) => s + posOf(u).lat, 0) / list.length, lng: list.reduce((s, u) => s + posOf(u).lng, 0) / list.length };
      add(c.lat, c.lng, `<div class="pg"><span class="stk">${list.slice(0, 3).map(u => av(u, 40)).join('')}</span><b>${list.length}</b></div>`, [120, 52], [60, 26], 300, () => openSheet({ type: 'spot', k: nearestPlace(c.lat, c.lng) }));
      return;
    }
    list.forEach((u, i) => {
      const dx = list.length === 1 ? 0 : i ? 34 : -34, p = posOf(u);
      add(p.lat, p.lng, personHtml(u), [110, 110], [55 - dx, 50], 300 + (u.id === me.id ? 50 : 0), () => actions.mapPerson({ id: u.id }));
    });
  });
}
function mapPicked(lat, lng) {
  const p = ui.pick;
  ui.pick = null; ui.panel = 'peek';
  if (p.kind === 'me') { setMyLocAt(lat, lng); toast('<span style="font-size:22px">📍</span><span>You are on the map</span>'); return; }
  const form = { ...(p.form || {}), lat, lng, place: nearestPlace(lat, lng) };
  refresh(); openSheet({ type: 'create', form });
}
// frame several points at once, keeping them clear of the top bar and the bottom sheet
function fitPoints(pts) {
  const ll = pts.filter(p => p && p.lat != null).map(p => [p.lat, p.lng]);
  if (!ll.length || !ensureMap()) return;
  if (ui.panel === 'full') { ui.panel = 'mid'; const pn = $('#panel'); if (pn) pn.className = 'panel ui mid'; }
  const panelH = $('#panel')?.offsetHeight || 0;
  map.fitBounds(L.latLngBounds(ll), { paddingTopLeft: [60, 200], paddingBottomRight: [60, panelH + 130], maxZoom: 18.5, animate: true, duration: 0.8 });
}
function fitPlaces(keys) { fitPoints(keys.map(k => PLACES[k])); }
function flyToPos(p, z = 17.5) {
  if (!p || p.lat == null || !ensureMap()) return;
  if (ui.panel === 'full') { ui.panel = 'mid'; const pn = $('#panel'); if (pn) pn.className = 'panel ui mid'; }
  const z2 = Math.max(map.getZoom(), z);
  // aim a bit below the target so it lands in the part of the map the panel does not cover
  const pt = map.project([p.lat, p.lng], z2).add([0, Math.round($('#map').clientHeight * 0.2)]);
  map.flyTo(map.unproject(pt, z2), z2, { duration: 0.8 });
}
function flyToPlace(k, z = 17.5) { flyToPos(PLACES[k], z); }
function mresHtml() {
  const q = ui.mq.trim().toLowerCase();
  if (!q) return '';
  const rows = [], now = Date.now();
  Object.entries(PLACES).forEach(([k, p]) => { const kd = KINDS[p.kind]; if (`${p.n} ${kd.n}`.toLowerCase().includes(q)) rows.push(`<button class="mr" data-a="focusSpot" data-k="${k}"><span class="mi" style="--c:${kd.c}">${kd.e}</span><b>${esc(p.n)}</b><small>${kd.n}</small></button>`); });
  visible(me).filter(h => h.when > now - 3 * HR && h.title.toLowerCase().includes(q)).slice(0, 3).forEach(h => rows.push(`<button class="mr" data-a="focusHangout" data-id="${h.id}"><span class="mi" style="--c:${act(h.act).c}">${act(h.act).e}</span><b>${esc(h.title)}</b><small>${esc(PLACES[h.place]?.n || '')}</small></button>`));
  db.users.filter(u => u.id !== me.id && u.name.toLowerCase().includes(q)).slice(0, 3).forEach(u => rows.push(`<button class="mr" data-a="focusUser" data-id="${u.id}">${av(u, 28)}<b>${esc(u.name)}</b><small>${isClub(u) ? 'club' : canSee(me, u) ? '📍 ' + esc(placeLabel(u)) : 'person'}</small></button>`));
  return `<div class="mres-in">${rows.length ? rows.slice(0, 7).join('') : '<p class="hint">Nothing found</p>'}</div>`;
}

// bottom sheet on the home map: drag the handle, or tap it to cycle peek / half / full
let drag = null;
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#grab')) return;
  const p = $('#panel'); if (!p) return;
  drag = { y: e.clientY, h: p.offsetHeight, p, moved: false };
  p.style.transition = 'none';
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (Math.abs(dy) > 5) drag.moved = true;
  const max = drag.p.parentElement.clientHeight - 72;
  drag.p.style.height = Math.max(44, Math.min(max, drag.h - dy)) + 'px';
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  const { p, moved } = drag, H = p.parentElement.clientHeight, cur = p.offsetHeight;
  const states = { map: 44, peek: 132, mid: H * 0.52, full: H - 72 };
  const next = moved ? Object.entries(states).sort((a, b) => Math.abs(a[1] - cur) - Math.abs(b[1] - cur))[0][0] : ui.panel === 'map' ? 'peek' : ui.panel === 'peek' ? 'mid' : ui.panel === 'mid' ? 'full' : 'mid';
  p.style.transition = ''; p.style.height = '';
  ui.panel = next; p.className = `panel ui ${next}`;
  drag = null;
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (!t.matches?.('input[type=file][data-file]')) return;
  const files = [...(t.files || [])];
  if (!files.length) return;
  try {
    if (t.dataset.file === 'gallery') { // a club adds pictures (university fair, events)
      if (!isClub(me)) return;
      if (CLOUD) {
        let added = 0;
        for (const file of files) {
          if ((me.gallery || []).length + added >= 8) break;
          if (await Cloud.addPhoto(me.id, await processPhoto(file, { max: 720 }), ui.galCap)) added++;
        }
        ui.galCap = ''; render();
        toast(`<span style="font-size:22px">📷</span><span>${added} photo${added === 1 ? '' : 's'} added</span>`);
        return;
      }
      const g = (me.gallery ||= []);
      let added = 0;
      for (const file of files) {
        if (g.length >= 8) break;
        g.unshift({ id: uid('g_'), img: await processPhoto(file, { max: 720 }), cap: (ui.galCap || '').trim(), ts: Date.now() });
        added++;
      }
      save(); render();
      toast(`<span style="font-size:22px">📷</span><span>${added} photo${added === 1 ? '' : 's'} added${files.length > added ? '<small>The limit is 8 photos</small>' : ''}</span>`);
      return;
    }
    const url = await processPhoto(files[0]);
    if (t.dataset.file === 'auth') { ui.auth.photo = url; render(); }
    else if (ui.sheet?.type === 'profile') { ui.sheet.form.photo = url; renderSheet(); }
  } catch (err) { toast(esc(err.message)); }
});

// ───────────────────────── simulation (stands in for real people) ─────────────────────────
let sim = [];
const stopSim = () => { sim.forEach(t => { clearTimeout(t); clearInterval(t); }); sim = []; };
const later = (fn, ms) => sim.push(setTimeout(fn, ms));

// a bestie you added adds you back, which unlocks seeing each other's spot
function botAddBack(id) {
  if (CLOUD) return;
  const b = user(id);
  if (!b?.bot || b.besties.includes(me.id) || Math.random() < 0.25) return;
  later(() => {
    if (!me || b.besties.includes(me.id)) return;
    b.besties.push(me.id); save();
    toast(`<span style="font-size:22px">💖</span><span>${esc(b.name)} added you back</span>`);
    if (!ui.chat) refresh();
  }, 1800 + Math.random() * 2000);
}

// a simulated student starts a hangout, biased towards what you like, so you can see the alerts work
function spawnBotHangout() {
  const top = Object.entries(me.prefs?.act || {}).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3);
  const k = top.length && Math.random() < 0.7 ? pick(top) : pick(ACTS).k;
  const bots = peers().filter(u => u.bot), host = pick(bots);
  const friends = bots.filter(u => u.id !== host.id).sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3));
  const h = {
    id: uid('h_'), host: host.id, act: k, title: pick(BOT_HANGOUTS[k]), place: ACT_PLACE[k],
    when: Math.ceil((Date.now() + (2 + Math.random() * 26) * HR) / (15 * MIN)) * 15 * MIN,
    max: pick([6, 8, 10]), desc: '', members: [host.id, ...friends.map(f => f.id)],
  };
  db.hangouts.push(h);
  db.chats['h:' + h.id] = [];
  addMsg('h:' + h.id, { sys: true, text: `${host.name} started this hangout` });
  pushEvent({ kind: 'new', userId: host.id, hangoutId: h.id });
  save();
  notifyMatches(h);
  if (!ui.chat) refresh();
}

// a club you follow posts an event, and your followers/RSVPs grow if you are a club
// a bestie joins an event: you get "Salma is going to …" (ghost-mode besties never do)
function simBestieGoes() {
  const cands = peers().filter(u => u.bot && !isGhost(u) && mutual(me, u));
  const opts = visible(me).filter(h => h.when > Date.now() && h.members.length < h.max);
  const pairs = cands.flatMap(u => opts.filter(h => !h.members.includes(u.id)).map(h => [u, h]));
  if (!pairs.length) return;
  const [u, h] = pick(pairs);
  joinHangout(h.id, u.id);
  if (!ui.chat) refresh();
}
// a club admin posts an announcement in a community you belong to
const CLUB_NEWS = {
  'Community service': ['Thank you all! We collected 4 boxes of donations today 🤝', 'Next drive: school supplies. Bring notebooks and pens.'],
  Tech: ['Hack night moves to Friday. Pizza included.', 'Arduino kits are in. Pick yours up at the workshop.'],
  'Arts & Culture': ['Rehearsal moved to the auditorium, 7 PM.', 'New members welcome at the next open mic.'],
  Outdoors: ['Saturday hike confirmed. Bring water and good shoes.', 'Photos from last hike are in the chat.'],
};
function spawnClubPost() {
  const cl = (me.following || []).map(id => user(id)).filter(c => c?.bot);
  if (!cl.length) return;
  const c = pick(cl), by = pick((c.admins || []).filter(id => id !== me.id && user(id)?.bot));
  if (!by) return;
  const text = pick(CLUB_NEWS[c.category] || ['Thanks for being part of the community!']);
  postUpdate(c, by, text);
  notifyCommunity(c, { kind: 'ann', text }, []);
  toast(`<span style="font-size:22px">📢</span><span>${esc(c.name)}<small>${esc(text.slice(0, 70))}</small></span>`, 6500, { a: 'openCommunity', id: c.id });
  if (!ui.chat) refresh();
}
function spawnClubEvent() {
  const cl = (me.following || []).map(id => user(id)).filter(c => c?.bot);
  if (!cl.length) return;
  const c = pick(cl), [k, title] = pick(CLUB_POSTS[c.category] || [['talk', 'Info session: come meet the club']]);
  const h = {
    id: uid('h_'), host: c.id, club: true, act: k, title, place: ACT_PLACE[k],
    when: Math.ceil((Date.now() + (6 + Math.random() * 40) * HR) / (15 * MIN)) * 15 * MIN, max: 50, desc: '', members: [c.id],
  };
  db.hangouts.push(h);
  db.chats['h:' + h.id] = [];
  addMsg('h:' + h.id, { sys: true, text: `${c.name} posted this event` });
  announceClubEvent(h);
  if (!ui.chat) refresh();
}
function simClub() {
  const bots = peers().filter(u => u.bot);
  const later2 = (fn, ms) => later(fn, ms);
  let n = 0;
  const grow = () => {
    if (n++ >= 5) return;
    const f = pick(bots.filter(b => !(b.following || []).includes(me.id)));
    if (f) {
      (f.following ||= []).push(me.id); pushEvent({ kind: 'follow', userId: f.id, to: me.id }); save();
      toast(`<span style="font-size:22px">🎉</span><span>${esc(f.name)} followed ${esc(me.name)}</span>`, 4800, { a: 'person', id: f.id });
      if (!ui.chat && !ui.sheet) refresh();
    }
    later2(grow, 45e3 + Math.random() * 30e3);
  };
  later2(grow, 25e3);
  const rsvp = () => {
    const ev = db.hangouts.filter(h => h.host === me.id && h.when > Date.now());
    const f = pick(followersOf(me.id).filter(u => u.bot));
    const h = ev.length ? pick(ev) : null;
    if (f && h && !h.members.includes(f.id) && h.members.length < h.max) {
      joinHangout(h.id, f.id);
      toast(`<span style="font-size:22px">🙌</span><span>${esc(f.name)} is going<small>${esc(h.title)}</small></span>`, 4800, { a: 'openHangout', id: h.id });
      if (!ui.chat && !ui.sheet) refresh();
    }
    later2(rsvp, 40e3 + Math.random() * 30e3);
  };
  later2(rsvp, 40e3);
  const IDEAS = ['Could we meet twice a month?', 'Can we get a poster for the next event?', 'A beginner session would help a lot.', 'Maybe a joint event with another club?'];
  let ideas = 0;
  const idea = () => {
    if (ideas++ >= 3) return;
    const f = pick(followersOf(me.id).filter(u => u.bot));
    if (f) {
      (me.sugs ||= []).unshift({ id: uid('s_'), ts: Date.now(), from: f.id, text: pick(IDEAS), votes: [f.id], status: 'new' });
      pushEvent({ kind: 'sug', to: me.id, userId: f.id }); save();
      toast(`<span style="font-size:22px">💡</span><span>${esc(f.name)} sent a suggestion<small>In your community</small></span>`, 5200, { a: 'openCommunity', id: me.id, t: 'sug' });
      if (!ui.chat && !ui.sheet) refresh();
    }
    later2(idea, 60e3 + Math.random() * 30e3);
  };
  later2(idea, 35e3);
}

function startSim() {
  stopSim();
  if (liveOn()) watchLive(); else if (me.live) stopLive('expired'); // pick the live location up again after a reload
  if (CLOUD) { ui.near = new Set(); checkNearby(false); return; } // real people instead of simulated ones
  ui.near = new Set();
  checkNearby(false);
  if (isClub(me)) { simClub(); return; }
  // besties walk around campus with exact positions, sometimes towards you, which is what triggers "friend nearby".
  // The speed is exaggerated so the demo shows movement.
  let tick = 0;
  sim.push(setInterval(() => {
    tick++;
    let relabel = false;
    peers().filter(u => u.bot && u.shareLoc && u.loc).forEach(u => {
      const w = u.loc;
      if (w.pause > 0) { w.pause--; return; }
      if (!w.to || dist(posOf(u), w.to) < 12) {
        if (w.to) { w.to = null; w.pause = 2 + Math.floor(Math.random() * 6); return; } // arrived: rest a moment
        const toMe = me.shareLoc && me.loc && canSee(me, u) && Math.random() < 0.4;
        const t = toMe ? posOf(me) : PLACES[pick(CAMPUS)];
        w.to = { lat: t.lat + (Math.random() - 0.5) * 0.0004, lng: t.lng + (Math.random() - 0.5) * 0.0005 };
      }
      const p = posOf(u), d = dist(p, w.to), k = Math.min(d, 16) / (d || 1);
      w.lat = p.lat + (w.to.lat - p.lat) * k; w.lng = p.lng + (w.to.lng - p.lng) * k;
      w.trail = [...(w.trail || []), [w.lat, w.lng]].slice(-10);
      w.ts = Date.now();
      const np = nearestPlace(w.lat, w.lng);
      if (np !== w.place) { w.prev = w.place; w.place = np; relabel ||= canSee(me, u); }
    });
    if (tick % 5 === 0) save();
    checkNearby();
    if (ui.tab === 'home' && !ui.chat && map) drawMarkers();
    if (relabel && !ui.chat && !ui.sheet && ui.tab === 'home' && !document.activeElement?.matches?.('input, textarea')) render();
    else if (ui.sheet?.type === 'location') renderSheet();
  }, 3000));
  // other students look at your profile now and then (they show up in your visitors list)
  const visit = () => { recordView(pick(peers().filter(u => u.bot && u.id !== me.id)).id, me.id); if (ui.tab === 'me' && !ui.sheet && !ui.chat) render(); later(visit, 80e3 + Math.random() * 80e3); };
  later(visit, 20e3 + Math.random() * 15e3);
  // new hangouts keep appearing, and clubs you follow post events
  let made = 0;
  const spawn = () => { if (made++ >= 4) return; spawnBotHangout(); later(spawn, 100e3 + Math.random() * 60e3); };
  later(spawn, 45e3 + Math.random() * 20e3);
  later(spawnClubEvent, 70e3 + Math.random() * 20e3);
  // besties joining events, and community announcements
  let goes = 0;
  const goesSoon = () => { if (goes++ >= 4) return; simBestieGoes(); later(goesSoon, 70e3 + Math.random() * 40e3); };
  later(goesSoon, 28e3 + Math.random() * 15e3);
  later(spawnClubPost, 55e3 + Math.random() * 20e3);
}

// ───────────────────────── events ─────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = actions[el.dataset.a];
  if (fn) fn(el.dataset, e);
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const fn = forms[e.target.dataset.form];
  if (fn) fn();
});
document.addEventListener('input', e => {
  const f = e.target.dataset.f;
  if (!f) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (f.startsWith('auth.')) ui.auth[f.slice(5)] = v;
  else if (f.startsWith('form.')) ui.sheet.form[f.slice(5)] = v;
  else if (f === 'msg') ui.draft = v;
  else if (f === 'q') { ui.q = v; $('#people').innerHTML = peopleHtml(); }
  else if (f === 'ann') ui.annDraft = v;
  else if (f === 'sug') ui.sugDraft = v;
  else if (f === 'find') {
    const kind = e.target.dataset.kind;
    ui.find = { kind, q: v, res: [], done: false };
    clearTimeout(findTimer);
    findTimer = setTimeout(async () => {
      const res = await Cloud.findStudents(v);
      if (!ui.find || ui.find.q !== v) return;
      const have = new Set(kind === 'head' ? (me.admins || []) : communityMembers(me));
      ui.find.res = res.filter(p => !have.has(p.id) && p.id !== Cloud.authId); ui.find.done = true;
      const el = $('#findres'); if (el) el.innerHTML = findResHtml(kind);
    }, 250);
  }
  else if (f === 'adminEmail') ui.adminEmail = v;
  else if (f === 'adminRole') ui.adminRole = v;
  else if (f === 'memberEmail') ui.memberEmail = v;
  else if (f === 'galcap') ui.galCap = v;
  else if (f === 'status') { me.status = v.slice(0, 24); save(); if (CLOUD && me.loc?.lat != null) Cloud.publishLoc(me.loc, me.live ? me.live.until : Date.now() + 4 * HR); drawMarkers(); }
  else if (f === 'mq') { ui.mq = v; const r = $('#mres'); if (r) r.innerHTML = mresHtml(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

// ───────────────────────── boot ─────────────────────────
load().then(() => {
  // the portfolio link (?demo) goes straight into the demo account: no sign-up needed to look around
  if (!CLOUD && !me && /[?&]demo(=|&|$)/.test(location.search) && user('u_demo')) { me = user('u_demo'); try { localStorage.setItem(SKEY, me.id); } catch { /* ignore */ } }
  render();
  if (me) { markActive(me); checkBadges(me); welcomeToast(); startSim(); }
});
