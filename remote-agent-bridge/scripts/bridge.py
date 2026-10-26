#!/usr/bin/env python3
"""Dependency-free stdio MCP server and SSH receiver for configured T3 environments."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import sqlite3
import subprocess
import sys
import uuid

ROOT = Path.home() / '.local/share/t3-agent-bridge'
CONFIG = Path.home() / '.config/t3-agent-bridge/config.json'
LIMIT = 20 * 1024 * 1024


def config():
    return json.loads(CONFIG.read_text())


def run(argv, data=None, timeout=40):
    p = subprocess.run(argv, input=data, text=True, capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError((p.stderr or p.stdout or 'Command failed')[-4000:])
    return json.loads(p.stdout)


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value):
        raise ValueError('request_id must be 1–100 letters, digits, underscores or hyphens')
    return value


def text(value, name, maximum=100000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f'{name} must be a nonempty string of at most {maximum} characters')
    return value


def receiver(req):
    cfg = config()
    op, a = req['operation'], req.get('arguments', {})
    t3 = cfg['t3']
    if op == 'status':
        threads = run([t3, 'thread', 'list', '--project', cfg['default_project'], '--json'])
        return {'machine': cfg['machine'], 'platform': sys.platform, 'home': str(Path.home()),
                'server_reachable': True, 'project_thread_count': len(threads),
                'default_project': cfg['default_project'], 'artifact_root': str(ROOT / 'artifacts'),
                't3': subprocess.check_output([t3, '--version'], text=True).strip()}
    if op == 'read':
        tid = text(a['thread_id'], 'thread_id', 500)
        if tid.startswith('-'):
            raise ValueError('Invalid thread_id')
        result = run([t3, 'thread', 'show', tid, '--json'])
        count = a.get('message_limit', 10)
        if type(count) is not int or not 1 <= count <= 50:
            raise ValueError('message_limit must be between 1 and 50')
        messages = result.get('messages', [])
        result['messages'] = messages[-count:]
        result['omitted_messages'] = max(0, len(messages) - count)
        for m in result['messages']:
            s = m.get('text', '')
            if len(s) > 16000:
                m['text'] = s[:16000]
                m['text_truncated'] = True
        return result
    if op == 'file':
        root = (ROOT / 'artifacts').resolve()
        path = Path(text(a['path'], 'path', 4096)).expanduser().resolve(strict=True)
        if root not in path.parents or not path.is_file():
            raise ValueError('Only regular files inside the remote bridge artifact directory can be transferred')
        with path.open('rb') as f:
            data = f.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError('Artifact exceeds 20 MiB')
        return {'name': path.name, 'data': base64.b64encode(data).decode(),
                'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    if op not in ('start', 'send'):
        raise ValueError('Unknown operation')
    key = identifier(a['request_id'])
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    fingerprint = hashlib.sha256(json.dumps(req, sort_keys=True).encode()).hexdigest()
    with sqlite3.connect(ROOT / 'requests.sqlite', timeout=10) as db:
        db.execute('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT)')
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT fingerprint,result FROM requests WHERE id=?', (key,)).fetchone()
        if row:
            if row[0] != fingerprint:
                raise ValueError('request_id already used with different arguments')
            if row[1]:
                return json.loads(row[1])
            return {'request_id': key, 'status': 'outcome_unknown',
                    'instruction': 'Do not create a replacement. Inspect remote T3 threads for the request marker; the prior command may have succeeded.'}
        # Record intent before invoking T3. A lost reply cannot cause a duplicate launch/send.
        db.execute('INSERT INTO requests VALUES (?,?,NULL)', (key, fingerprint))
    try:
        if op == 'start':
            task = text(a['task'], 'task')
            project = text(a.get('project') or cfg['default_project'], 'project', 4096)
            title = text(a.get('title', 'Remote agent task'), 'title', 180)
            selection = []
            if 'provider' in a or 'model' in a:
                provider = text(a.get('provider'), 'provider', 100)
                model = text(a.get('model'), 'model', 100)
                if provider.startswith('-') or model.startswith('-'):
                    raise ValueError('Invalid provider or model')
                selection = ['--provider', provider, '--model', model]
            if project.startswith('-'):
                raise ValueError('Invalid project')
            artifacts = ROOT / 'artifacts' / key
            artifacts.mkdir(parents=True, exist_ok=True, mode=0o700)
            brief = (f'Remote task on {cfg["machine"]}. Bridge request: {key}.\n'
                     'The task below contains your scope and authorization; '
                     'do not expand it. Do not delegate to other machines or agents unless explicitly permitted in the task. '
                     f'Place requested screenshots or other shareable output in {artifacts}; never export secrets. '
                     'Return concrete findings, verification limits, and artifact paths.\n\n' + task)
            result = run([t3, 'thread', 'start', *selection,
                          '--title', f'{title} [{key}]', '--json', project, '-'], brief)
            result['artifact_directory'] = str(artifacts)
        else:
            tid = text(a['thread_id'], 'thread_id', 500)
            if tid.startswith('-'):
                raise ValueError('Invalid thread_id')
            result = run([t3, 'thread', 'send', '--json', tid, '-'], text(a['message'], 'message'))
        result['request_id'] = key
        result['machine'] = cfg['machine']
        tid = result.get('threadId')
        if tid:
            result['link'] = f'[Remote task on {cfg["machine"]}](t3-thread://v1/{tid})'
    except Exception as e:
        result = {'request_id': key, 'status': 'outcome_unknown', 'error': str(e),
                  'instruction': 'Inspect remote T3 threads before retrying. Reuse this request_id; do not launch a replacement blindly.'}
    with sqlite3.connect(ROOT / 'requests.sqlite', timeout=10) as db:
        db.execute('UPDATE requests SET result=? WHERE id=?', (json.dumps(result), key))
    return result


def remote(op, args):
    cfg = config()
    destination = args['destination']
    if destination not in cfg['peers']:
        raise ValueError(f'Unknown destination. Available: {list(cfg["peers"])}')
    peer = cfg['peers'][destination]
    command = shlex.join([peer['python'], peer['script'], '--receive'])
    return run(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'ConnectTimeout=15', peer['host'], command],
               json.dumps({'operation': op, 'arguments': {k: v for k, v in args.items() if k != 'destination'}}), 55)


DEST = {'type': 'string', 'description': 'Peer name from remote_agent_targets. Use local tools when local capabilities suffice.'}
STRING = {'type': 'string'}


def tool(name, description, properties, required):
    return {'name': name, 'description': description,
            'inputSchema': {'type': 'object', 'properties': properties,
                            'required': required, 'additionalProperties': False}}


TOOLS = [
    tool('remote_agent_targets', 'List the local environment label and configured peer names without opening connections.', {}, []),
    tool('remote_agent_status', 'Check remote SSH/T3 connectivity and discover the default project and artifact directory.',
         {'destination': DEST}, ['destination']),
    tool('remote_agent_start', 'Start a separate T3 thread on a configured peer for capabilities unavailable locally, such as browser access, native apps, builds, or deployed service inspection. Pass explicit scope and context. Reuse request_id after errors to avoid duplicate agents. Returns immediately; use remote_agent_read for results. Does not receive parent conversation automatically.',
         {'destination': DEST, 'request_id': STRING, 'task': STRING, 'title': STRING,
          'project': STRING, 'provider': STRING, 'model': STRING}, ['destination', 'request_id', 'task']),
    tool('remote_agent_read', 'Read remote thread state and latest replies. Inspect after useful local work; no automatic parent wakeup is provided.',
         {'destination': DEST, 'thread_id': STRING, 'message_limit': {'type': 'integer', 'minimum': 1, 'maximum': 50}}, ['destination', 'thread_id']),
    tool('remote_agent_send', 'Send a follow-up to a remote T3 thread. A busy thread queues the message. Reuse request_id after errors.',
         {'destination': DEST, 'request_id': STRING, 'thread_id': STRING, 'message': STRING}, ['destination', 'request_id', 'thread_id', 'message']),
    tool('remote_file_get', 'Download a remote artifact (maximum 20 MiB) into the local bridge downloads directory. Only files staged inside the remote bridge artifact directory are allowed. Returns local path and SHA-256.',
         {'destination': DEST, 'path': STRING}, ['destination', 'path']),
]


def call(name, args):
    definition = next((t for t in TOOLS if t['name'] == name), None)
    if definition is None:
        raise ValueError('Unknown tool')
    schema = definition['inputSchema']
    if set(args) - set(schema['properties']) or set(schema['required']) - set(args):
        raise ValueError('Unexpected or missing arguments')
    for key, value in args.items():
        spec = schema['properties'][key]
        if spec['type'] == 'string' and not isinstance(value, str):
            raise ValueError(f'{key} must be a string')
        if 'enum' in spec and value not in spec['enum']:
            raise ValueError(f'Invalid {key}')
    if name == 'remote_agent_targets':
        cfg = config()
        return {'content': [{'type': 'text', 'text': json.dumps({'local': cfg['machine'], 'destinations': list(cfg['peers'])})}]}
    op = {'remote_agent_status': 'status', 'remote_agent_start': 'start',
          'remote_agent_read': 'read', 'remote_agent_send': 'send', 'remote_file_get': 'file'}[name]
    result = remote(op, args)
    if op == 'file':
        data = base64.b64decode(result.pop('data'), validate=True)
        if len(data) > LIMIT or hashlib.sha256(data).hexdigest() != result['sha256']:
            raise ValueError('Artifact integrity/size check failed')
        downloads = ROOT / 'downloads'
        downloads.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = downloads / (uuid.uuid4().hex[:12] + '-' + Path(result['name']).name)
        with path.open('xb') as f:
            f.write(data)
        path.chmod(0o600)
        result['local_path'] = str(path)
    return {'content': [{'type': 'text', 'text': json.dumps(result)}],
            'isError': result.get('status') == 'outcome_unknown'}


def serve():
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            if 'id' not in request:
                continue
            method, params = request.get('method'), request.get('params', {})
            if method == 'initialize':
                version = params.get('protocolVersion')
                supported = ('2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25')
                result = {'protocolVersion': version if version in supported else '2025-06-18',
                          'capabilities': {'tools': {}},
                          'serverInfo': {'name': 't3-agent-bridge', 'version': '1.0.0'},
                          'instructions': 'Use the remote-agent-bridge skill for routing and authorization. Remote tasks are separate threads; there is no automatic wakeup.'}
            elif method == 'ping':
                result = {}
            elif method == 'tools/list':
                result = {'tools': TOOLS}
            elif method == 'tools/call':
                try:
                    result = call(params['name'], params.get('arguments', {}))
                except Exception as e:
                    result = {'content': [{'type': 'text', 'text': str(e)}], 'isError': True}
            else:
                print(json.dumps({'jsonrpc': '2.0', 'id': request['id'],
                                  'error': {'code': -32601, 'message': 'Method not found'}}), flush=True)
                continue
            response = {'jsonrpc': '2.0', 'id': request['id'], 'result': result}
        except Exception as e:
            response = {'jsonrpc': '2.0', 'id': request.get('id') if isinstance(request, dict) else None,
                        'error': {'code': -32600, 'message': str(e)}}
        print(json.dumps(response), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    if sys.argv[1:] == ['--receive']:
        try:
            print(json.dumps(receiver(json.load(sys.stdin))))
        except Exception as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)
    elif sys.argv[1:]:
        raise SystemExit('Usage: bridge.py [--receive]')
    else:
        serve()
