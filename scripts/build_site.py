"""Publish only explicitly selected static app files. Never ship work or reports."""
from pathlib import Path
import shutil
import hashlib
import re

root = Path(__file__).resolve().parent.parent
out = root / 'dist'
out.mkdir(exist_ok=True)
files = ['index.html', 'style.css', 'app.mjs', 'core.mjs', 'project.mjs',
         'view.mjs', 'vendor/papaparse.min.js', 'vendor/LICENSE', 'assets/atkinson-next.ttf', 'assets/OFL.txt']
expected = set(files + ['.nojekyll'])
for existing in out.rglob('*'):
    if existing.is_file() and existing.relative_to(out).as_posix() not in expected:
        raise SystemExit('Unexpected file in dist. Review the directory before deploying.')
for name in files:
    target = out / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / name, target)
# A shared content version keeps cached modules and their imports on one release.
version = hashlib.sha256(b''.join((root / name).read_bytes() for name in files)).hexdigest()[:12]
for name in ['index.html', 'app.mjs', 'project.mjs', 'style.css']:
    target = out / name
    text = target.read_text()
    if name == 'index.html':
        text = re.sub(r'(href|src)="(style\.css|app\.mjs|vendor/papaparse\.min\.js)"',
                      lambda match: f'{match[1]}="{match[2]}?v={version}"', text)
    elif name == 'style.css':
        text = text.replace('assets/atkinson-next.ttf', f'assets/atkinson-next.ttf?v={version}')
    else:
        text = re.sub(r"(from\s+['\"])(\./(?:core|project|view)\.mjs)(['\"])",
                      lambda match: f'{match[1]}{match[2]}?v={version}{match[3]}', text)
    target.write_text(text)
(out / '.nojekyll').write_text('')
print(f'Prepared {len(expected)} allowlisted static files for Pages.')
