#!/usr/bin/env bash
# build.sh — inject src/ modules into index.html between their <style id>/<script id> markers
# Usage: ./build.sh   (run from repo root)
set -e
cd "$(dirname "$0")"

python3 - <<'PYEOF'
import re

html = open('index.html').read()

# (style_id, src_file) — CSS injected into <style id="...">...</style>
styles = [
    ('liquid-glass-system', 'src/liquid-glass.css'),
    ('panel-system-v4',     'src/panel-system-v4.css'),
]
# (script_id, src_file) — JS injected into <script id="...">...</script>
# Order here does not change DOM order; it only updates existing blocks in place.
scripts = [
    ('pro-icons-js',          'src/pro-icons.js'),
    ('panel-system-v4-js',    'src/panel-system-v4.js'),
    ('panel-system-v5-js',    'src/panel-system-v5.js'),
    ('universal-panels-js',   'src/universal-panels.js'),
    ('ui-restructure-v6-js',  'src/ui-restructure-v6.js'),
]

def inject(html, tag, _id, path):
    try:
        content = open(path).read()
    except FileNotFoundError:
        print(f"  skip (missing): {path}")
        return html
    pat = re.compile(r'<'+tag+r' id="'+re.escape(_id)+r'">[\s\S]*?</'+tag+r'>')
    block = f'<{tag} id="{_id}">\n{content}\n</{tag}>'
    if pat.search(html):
        html = pat.sub(lambda m: block, html, count=1)
        print(f"  updated <{tag} id={_id}>  <- {path}")
    else:
        print(f"  WARN: no <{tag} id={_id}> marker found in index.html")
    return html

for sid, path in styles:
    html = inject(html, 'style', sid, path)
for sid, path in scripts:
    html = inject(html, 'script', sid, path)

open('index.html', 'w').write(html)
print("Done. index.html rebuilt from src/.")
PYEOF

# v2-features.js is loaded as a separate <script src> — just copy it to root
cp src/v2-features.js v2-features.js 2>/dev/null && echo "  copied v2-features.js to root"

echo "Build complete. Review, then: git add -A && git commit -m 'msg' && git push"
