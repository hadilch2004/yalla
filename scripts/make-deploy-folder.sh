#!/bin/bash
# Builds ./deploy: ONLY the files the app needs on the web. Drag that folder onto Cloudflare Pages (or Netlify Drop).
# Leaves out the database files, tests, documents and old snapshots.
#   ./scripts/make-deploy-folder.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=deploy
rm -rf "$OUT"; mkdir "$OUT"
cp index.html app.js cloud.js config.js styles.css sw.js manifest.webmanifest logo.svg privacy.html terms.html get.html robots.txt sitemap.xml og-image.jpg googlea70a0b92ecfc78de.html _headers "$OUT/"
cp -R icons img vendor "$OUT/"
find "$OUT" -name '.DS_Store' -delete

echo "built ./$OUT ($(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1))"
# safety check: no real secret key may be in there (words in comments are fine; keys are decoded and looked at)
python3 -I - "$OUT" <<'PY'
import base64, json, pathlib, re, sys
bad = []
for f in pathlib.Path(sys.argv[1]).rglob('*'):
    if not f.is_file() or f.suffix in {'.png', '.jpg', '.jpeg'}: continue
    t = f.read_text(errors='ignore')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{16,}', t) or re.search(r'postgres(ql)?://[^\s:@/]+:[^\s@/]+@', t): bad.append((str(f), 'secret key or database password'))
    for m in re.finditer(r'eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}', t):
        try:
            if json.loads(base64.urlsafe_b64decode(m.group(1) + '=' * (-len(m.group(1)) % 4))).get('role') == 'service_role': bad.append((str(f), 'service_role JWT'))
        except Exception: pass
if bad:
    print('STOP: secret found:', bad); sys.exit(1)
PY
for f in supabase wip .claude .git tests; do [ -e "$OUT/$f" ] && { echo "STOP: $f is in the folder"; exit 1; }; done
# configuration warnings
grep -q "supabaseUrl: 'https://" "$OUT/config.js" || echo "NOTE: config.js has no Supabase URL, so the site will run as the demo."
grep -q "support@example.com" "$OUT/app.js" && echo "NOTE: the support email is still support@example.com (BRAND.support in app.js)."
grep -q "\[" "$OUT/privacy.html" && echo "NOTE: privacy.html still has [brackets] to fill in."
echo "ok"
