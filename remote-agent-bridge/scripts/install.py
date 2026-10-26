#!/usr/bin/env python3
"""Install for the current account; keep environment-specific configuration local."""
import argparse
import json
import os
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--config', type=Path, help='Private configuration JSON for this environment; required on first install')
args = parser.parse_args()
os.umask(0o077)
home = Path.home()
source = Path(__file__).resolve().parent
path = home / '.config/t3-agent-bridge/config.json'
if path.exists():
    if args.config:
        parser.error('Configuration already exists; review and edit it directly instead of overwriting it')
    cfg = json.loads(path.read_text())
else:
    if not args.config:
        parser.error('First install requires --config pointing to your edited private configuration')
    cfg = json.loads(args.config.read_text())
for key in ('machine', 't3', 'default_project'):
    if not isinstance(cfg.get(key), str) or not cfg[key].strip():
        parser.error(f'Configuration requires a nonempty {key}')
if not Path(cfg['t3']).is_absolute() or not os.access(cfg['t3'], os.X_OK):
    parser.error('t3 must be the absolute path to an executable T3 CLI')
if not isinstance(cfg.get('peers'), dict) or not cfg['peers']:
    parser.error('Configuration requires at least one peer')
for peer in cfg['peers'].values():
    if not isinstance(peer, dict) or any(not isinstance(peer.get(k), str) or not peer[k].strip() for k in ('host', 'python', 'script')):
        parser.error('Each peer requires host, python, and script strings')
    if peer['host'].startswith('-') or not Path(peer['python']).is_absolute() or not Path(peer['script']).is_absolute():
        parser.error('Peer host must not start with a dash; remote python and script paths must be absolute')
runtime = home / '.local/share/t3-agent-bridge'
runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
shutil.copy2(source / 'bridge.py', runtime / 'bridge.py')
for provider in ('.codex', '.claude'):
    skill = home / provider / 'skills/remote-agent-bridge'
    if skill.resolve() != source.parent.resolve():
        shutil.copytree(source.parent, skill, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
if not path.exists():
    path.write_text(json.dumps(cfg, indent=2) + '\n')
path.chmod(0o600)
print('Installed runtime and Codex/Claude skills; existing configuration preserved.')
print('Register the runtime with your agent using the commands in references/setup.md.')
