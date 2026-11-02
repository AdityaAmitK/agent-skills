"""Read-only skill inventory. Hash complete packages and retain symlink provenance."""
from pathlib import Path
import hashlib
import json
import os
import sys

IGNORED = {'.git', 'node_modules', '__pycache__', '.DS_Store'}


def package_files(root):
    result = {}
    seen = set()
    def visit(folder, relative):
        real = folder.resolve()
        if real in seen:
            return
        seen.add(real)
        for p in sorted(folder.iterdir()):
            if p.name in IGNORED or p.name.startswith('._') or p.suffix == '.pyc':
                continue
            key = str(relative / p.name)
            if p.is_dir():
                visit(p, relative / p.name)
            elif p.is_file():
                result[key] = hashlib.sha256(p.read_bytes()).hexdigest()
        seen.remove(real)
    visit(root, Path())
    return result


def scan(home, machine, include_plugins=True):
    home = Path(home)
    roots = [(f'codex{machine}', home / '.codex/skills', 'personal'),
             (f'claude{machine}', home / '.claude/skills', 'personal'),
             (f'agents{machine}', home / '.agents/skills', 'personal'),
             (f'codex{machine}', home / '.codex/skills/.system', 'system'),
             (f'codex{machine}', home / '.codex/plugins/cache', 'plugin'),
             (f'claude{machine}', home / '.claude/plugins/cache', 'plugin')]
    entries = []
    errors = []
    for target, root, origin in roots:
        if origin == 'plugin' and not include_plugins:
            continue
        if not root.exists():
            continue
        candidates = []
        if origin == 'plugin':
            candidates = sorted({p.parent for p in root.rglob('SKILL.md') if 'node_modules' not in p.parts})
        else:
            # Includes nested synced/ skills and broken directory links.
            def discover(folder, depth=0):
                if depth > 5:
                    return
                for p in sorted(folder.iterdir()):
                    if p.name.startswith('.'):
                        continue
                    if (p / 'SKILL.md').is_file() or (p.is_symlink() and not p.exists()):
                        candidates.append(p)
                    elif p.is_dir():
                        discover(p, depth + 1)
            discover(root)
        for p in candidates:
            try:
                broken = not (p / 'SKILL.md').is_file()
                manifest = {} if broken else package_files(p)
                entries.append(dict(target=target, name=p.name, path=str(p), resolved=str(p.resolve()),
                                    symlink=p.is_symlink(), broken=broken, origin=origin,
                                    hash=None if broken else hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest(),
                                    files=manifest))
            except (OSError, RuntimeError) as exc:
                errors.append(dict(path=str(p), error=str(exc)))
    return dict(home=str(home), machine=machine, entries=entries, errors=errors)


if __name__ == '__main__':
    print(json.dumps(scan(sys.argv[1] if len(sys.argv)>1 else Path.home(),
                          sys.argv[2] if len(sys.argv)>2 else 'Mac'), indent=2))
