"""Publish only explicitly selected static app files. Never ship work or reports."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
out = root / 'dist'
out.mkdir(exist_ok=True)
files = ['index.html', 'style.css', 'app.mjs', 'core.mjs', 'project.mjs',
         'vendor/papaparse.min.js', 'vendor/LICENSE']
expected = set(files + ['.nojekyll'])
for existing in out.rglob('*'):
    if existing.is_file() and existing.relative_to(out).as_posix() not in expected:
        raise SystemExit('Unexpected file in dist. Review the directory before deploying.')
for name in files:
    target = out / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / name, target)
(out / '.nojekyll').write_text('')
print(f'Prepared {len(expected)} allowlisted static files for Pages.')
