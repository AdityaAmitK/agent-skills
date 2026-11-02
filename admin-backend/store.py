"""Central package store with durable backups and per-provider symlinks."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import os
import re
import shutil
import tempfile
from inventory import package_files, scan

HOME = Path.home()
STATE = HOME / '.local/share/skill-admin'
STORE = STATE / 'skills'
BACKUPS = STATE / 'backups'
NAME = re.compile(r'^(?:(?:codex|claude):)?[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')


def safe_name(name):
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise ValueError('Invalid skill name')
    return name


def provider_id(entry):
    name=entry['name']
    canonical=Path(entry['resolved']).name
    if ':' in canonical and NAME.fullmatch(canonical):
        return canonical
    scoped=(entry['origin']!='personal' or '/synced/' in entry['path'] or '/plugins/' in entry['resolved'] or '/skills/.system/' in entry['resolved'] or name in ('skill-creator','skill-installer'))
    provider='codex' if entry['target'].startswith('codex') else 'claude'
    return provider+':'+name if scoped else name


def provider_source(name):
    safe_name(name)
    if ':' not in name:
        raise ValueError('Skill has no central package')
    provider, bare=name.split(':',1)
    candidates=[e for e in scan(HOME,'Local')['entries'] if e['target']==provider+'Local' and e['name']==bare and not e['broken']]
    if not candidates:
        raise ValueError('No source package is available on this machine')
    return Path(max(candidates,key=lambda e:source_priority(e,name))['path'])


def source_priority(entry, name):
    provider=name.split(':',1)[0]
    direct=Path(entry['resolved']).name==name
    native_claude=provider=='claude' and '/synced/' in entry['path']
    version=tuple(int(n) for n in re.findall(r'\d+',entry['path']))
    return (direct,native_claude,entry['origin']=='system',entry['origin']!='plugin',version)


def backup(path):
    if not path.exists() and not path.is_symlink():
        return
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    target = BACKUPS / stamp / str(path).lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.rename(target)


def replace_link(path, destination):
    if path.is_symlink() and path.resolve() == destination.resolve():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    backup(path)
    temp = path.with_name('.' + path.name + '.skill-admin-link')
    temp.unlink(missing_ok=True)
    temp.symlink_to(destination)
    temp.replace(path)


def notify_providers(name):
    # Root-directory events let provider watchers rediscover canonical content.
    for provider in ('codex','claude'):
        if ':' in name and name.split(':',1)[0]!=provider:
            continue
        link = HOME / ('.'+provider) / 'skills' / name.split(':')[-1]
        if link.is_symlink() and link.resolve() == (STORE/name).resolve():
            temp=link.with_name('.'+name+'.skill-admin-notify')
            temp.unlink(missing_ok=True)
            temp.symlink_to(STORE/name)
            temp.replace(link)


def consolidate():
    """Preserve enabled providers; Codex wins when same-machine copies differ."""
    STORE.mkdir(parents=True, exist_ok=True, mode=0o700)
    roots = [HOME / '.codex/skills', HOME / '.claude/skills']
    packages = {}
    for root in roots:
        if not root.exists():
            continue
        for p in sorted(root.iterdir()):
            if p.name.startswith('.') or not (p / 'SKILL.md').is_file():
                continue
            # Provider-managed system/plugin links retain their lifecycle owner.
            resolved = p.resolve()
            if '/plugins/' in str(resolved) or '/skills/.system/' in str(resolved):
                continue
            identity=provider_id(dict(name=p.name,path=str(p),resolved=str(resolved),origin='personal',target='codexLocal' if root.parent.name=='.codex' else 'claudeLocal'))
            packages.setdefault(identity, []).append(p)
    changes = []
    for name, paths in packages.items():
        dest = STORE / safe_name(name)
        if not dest.exists():
            shutil.copytree(paths[0], dest, symlinks=False,
                            ignore=shutil.ignore_patterns('.git','node_modules','__pycache__','.DS_Store','._*','*.pyc'))
        for p in paths:
            replace_link(p, dest)
        changes.append(name)
    return changes


def export_package(name):
    root = STORE / safe_name(name)
    if not (root / 'SKILL.md').is_file():
        root=provider_source(name)
    files = package_files(root)
    return {'name': name, 'files': {p: {'data':base64.b64encode((root/p).read_bytes()).decode(),
                                      'mode':(root/p).stat().st_mode & 0o777}
                                   for p in files},
            'hash':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()}


def import_package(package):
    name = safe_name(package['name'])
    files = package['files']
    if not isinstance(files, dict) or 'SKILL.md' not in files or len(files)>5000:
        raise ValueError('Invalid package')
    STORE.mkdir(parents=True, exist_ok=True, mode=0o700)
    staging = Path(tempfile.mkdtemp(prefix='.incoming-', dir=STORE))
    try:
        size = 0
        for relative, entry in files.items():
            p = Path(relative)
            if p.is_absolute() or '..' in p.parts or not p.parts:
                raise ValueError('Unsafe package path')
            data = base64.b64decode(entry['data'],validate=True)
            size += len(data)
            if size>32*1024*1024:
                raise ValueError('Package exceeds 32 MiB')
            target = staging / p
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o755 if entry.get('mode',0)&0o111 else 0o644)
        manifest = package_files(staging)
        digest = hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()
        if digest != package['hash']:
            raise ValueError('Package integrity mismatch')
        destination = STORE / name
        if destination.exists() and package_files(destination)==manifest:
            return digest
        backup(destination)
        staging.rename(destination)
        notify_providers(name)
        return digest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def set_target(name, provider, installed):
    name = safe_name(name)
    if provider not in ('codex','claude') or not isinstance(installed,bool):
        raise ValueError('Invalid installation target')
    if ':' in name and name.split(':',1)[0]!=provider:
        raise ValueError('This skill belongs to a different provider')
    dest = STORE / name
    if not (dest/'SKILL.md').is_file():
        raise ValueError('Sync a central package before enabling it')
    path = HOME / ('.'+provider) / 'skills' / name.split(':')[-1]
    if installed:
        replace_link(path, dest)
    else:
        backup(path)
    return {'name':name,'provider':provider,'installed':installed}


if __name__=='__main__':
    print(json.dumps({'centralStore':str(STORE),'consolidated':consolidate()}))
