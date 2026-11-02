"""Skills admin API and private machine agent. Bind to loopback only."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
import base64
import difflib
import hmac
import json
import os
import shutil
import subprocess
import threading
import time
import urllib.request
import urllib.error
from urllib.parse import unquote, urlparse
from inventory import scan, package_files
from store import HOME, STATE, STORE, safe_name, export_package, import_package, set_target, provider_id, source_priority

LOCK = threading.RLock()
MACHINE = 'Mac'
MODE = 'agent'
KEY = ''
PUBLIC_HOST = 't3-code.adityakinjawadekar.com'
PANEL = Path(__file__).resolve().parent.parent/'admin-panel/dist'
MAC_URL = 'http://127.0.0.1:18342/internal'
CACHE = {}
REFRESH = {'status':'idle','message':'No T3 refresh has been requested yet'}
REFRESH_PENDING = threading.Event()
REFRESH_LOCK = threading.Lock()


def request_t3_refresh():
    global REFRESH
    REFRESH_PENDING.set()
    if not REFRESH_LOCK.acquire(blocking=False):
        return
    REFRESH={'status':'pending','message':'Refreshing the running T3 provider catalog'}
    def run():
        global REFRESH
        try:
            while REFRESH_PENDING.is_set():
                REFRESH_PENDING.clear()
                config_path=STATE/'config.json'
                config=json.loads(config_path.read_text()) if config_path.exists() else {}
                node=config.get('node') or shutil.which('node')
                if not node:
                    REFRESH={'status':'unavailable','message':'Node.js is unavailable for T3 refresh'}
                    return
                env=dict(os.environ)
                if config.get('t3Cli'):
                    env['SKILL_ADMIN_T3_CLI']=config['t3Cli']
                result=subprocess.run([node,str(Path(__file__).with_name('refresh-t3.mjs'))],capture_output=True,text=True,timeout=120,env=env)
                REFRESH=json.loads(result.stdout.strip().splitlines()[-1]) if result.stdout.strip() else {'status':'unavailable','message':'T3 refresh helper did not return a result'}
        except (OSError,ValueError,subprocess.TimeoutExpired):
            REFRESH={'status':'unavailable','message':'T3 refresh could not complete; refresh skills in T3'}
        finally:
            try:
                report=STATE/'t3-refresh.json'
                report.write_text(json.dumps(REFRESH));report.chmod(0o600)
            except OSError:
                pass
            REFRESH_LOCK.release()
    threading.Thread(target=run,daemon=True).start()


def local_inventory():
    now = time.monotonic()
    if CACHE.get('until',0)>now:
        return CACHE['data']
    data = scan(HOME, MACHINE)
    data['packages']=[p.name for p in STORE.iterdir() if (p/'SKILL.md').is_file()] if STORE.exists() else []
    for entry in data['entries']:
        entry['metadata']=metadata(entry['path'])
    CACHE.update(until=now+3,data=data)
    return data


def rpc(action, **params):
    if action=='inventory':
        return dict(local_inventory(),refresh=REFRESH)
    if action=='export':
        return export_package(params['name'])
    if action=='import':
        result = import_package(params['package'])
    elif action=='target':
        result = set_target(params['name'], params['provider'], params['installed'])
    elif action=='text':
        name = safe_name(params['name'])
        root = STORE/name
        relative = Path(params.get('file','SKILL.md'))
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Invalid file path')
        p = root/relative
        if not p.resolve().is_relative_to(root.resolve()):
            raise ValueError('Invalid file path')
        return p.read_text(errors='replace')[:200000] if p.is_file() else ''
    else:
        raise ValueError('Unknown machine action')
    CACHE.clear()
    request_t3_refresh()
    return result


def mac(action, **params):
    req = urllib.request.Request(MAC_URL, data=json.dumps(dict(action=action,**params)).encode(),
                                 headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.load(response)
        if 'error' in result:
            raise ValueError(result['error'])
        return result['result']
    except (OSError, urllib.error.URLError) as exc:
        raise ConnectionError('Mac is offline. Wake the Mac and reconnect its skill agent.') from exc


def metadata(path):
    try:
        lines=(Path(path)/'SKILL.md').read_text(errors='replace').splitlines()
        info={}
        for index,line in enumerate(lines[:50]):
            if line.startswith(('description:','version:')):
                k,v=line.split(':',1);value=v.strip().strip('\"\'')
                if value in ('>','|','>-','|-'):
                    continuation=[]
                    for following in lines[index+1:]:
                        if following and not following.startswith((' ','\t')):
                            break
                        continuation.append(following.strip())
                    value=' '.join(continuation).strip()
                info[k]=value
        return info
    except OSError:
        return {}


def skills():
    inventories=[local_inventory()]
    machines=[dict(id='vps',name='VPS',online=True,centralStore=str(STORE),refresh=REFRESH)]
    try:
        remote=mac('inventory');inventories.append(remote)
        saved=STATE/'last-mac-inventory.json'
        saved.write_text(json.dumps(remote));saved.chmod(0o600)
        machines.append(dict(id='mac',name='Mac',online=True,centralStore=remote['home']+'/.local/share/skill-admin/skills',refresh=remote.get('refresh')))
    except ConnectionError as exc:
        machines.append(dict(id='mac',name='Mac',online=False,error=str(exc)))
        saved=STATE/'last-mac-inventory.json'
        if saved.is_file():
            inventories.append(json.loads(saved.read_text()))
    rows={}
    for inv in inventories:
        for e in inv['entries']:
            if not e['target'].startswith(('codex','claude')):
                continue
            identity=provider_id(e)
            provider=identity.split(':',1)[0] if ':' in identity else None
            row=rows.setdefault(identity,dict(id=identity,name=e['name'],description='',category=(provider+' only') if provider else 'shared',status='synced',targets={},copies=[]))
            row['copies'].append(e)
        for identity in inv.get('packages',[]):
            if identity in ('skill-creator','skill-installer'):
                continue
            provider=identity.split(':',1)[0] if ':' in identity else None
            row=rows.setdefault(identity,dict(id=identity,name=identity.split(':')[-1],description='',category=(provider+' only') if provider else 'shared',status='disabled',targets={},copies=[]))
            row.setdefault('storedMachines',[]).append(inv['machine'])
    for row in rows.values():
        identity=row['id']
        provider=identity.split(':',1)[0] if ':' in identity else None
        for target in ('codexVps','claudeVps','codexMac','claudeMac'):
            compatible=not provider or target.startswith(provider)
            candidates=[e for e in row['copies'] if e['target']==target]
            entry=max(candidates,key=lambda e:source_priority(e,identity)) if candidates else None
            direct=bool(entry and not entry['broken'] and (not provider or Path(entry['resolved']).name==identity))
            available=bool(entry and not entry['broken']) or target.removeprefix('codex').removeprefix('claude') in row.get('storedMachines',[])
            row['targets'][target]=dict(installed=direct,available=available,managed=not compatible,
                kind=('symlink' if entry['symlink'] else 'directory') if direct else 'bundled' if available else 'missing',
                path=entry['path'] if entry else None,linkTarget=entry['resolved'] if entry and entry['symlink'] else None,
                hash=entry['hash'] if entry else None,version=entry.get('metadata',{}).get('version') if entry else None)
            if entry and not row['description']:
                row['description']=entry.get('metadata',{}).get('description','')
        sources=[k for k,v in row['targets'].items() if k.endswith('Vps') and v['available'] and not v['managed']]
        row['sourceTarget']=sources[0] if sources else None
        row['canSync']=bool(sources)
        installed=[k for k,v in row['targets'].items() if v['installed']]
        hashes={v['hash'] for v in row['targets'].values() if v['installed'] and v['hash']}
        row['status']='drift' if len(hashes)>1 else 'vps-only' if installed and all(k.endswith('Vps') for k in installed) else 'mac-only' if installed and all(k.endswith('Mac') for k in installed) else 'synced' if installed else 'available'
    return dict(skills=sorted(rows.values(),key=lambda x:x['name']),machines=machines,
                refresh=dict(files='Immediate after a successful operation',t3='Active-chat discovery has not yet been verified'))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(PANEL),**kwargs)

    def log_message(self, fmt,*args):
        # No request bodies, credentials or skill contents in logs.
        print('%s %s'%(self.command,urlparse(self.path).path),flush=True)

    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        super().end_headers()

    def respond(self, body, status=200):
        data=json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.end_headers();self.wfile.write(data)

    def read_body(self):
        size=int(self.headers.get('Content-Length','0'))
        if size<0 or size>48*1024*1024:
            raise ValueError('Request too large')
        return json.loads(self.rfile.read(size)) if size else {}

    def guard(self):
        if MODE=='agent':
            return False
        host=self.headers.get('Host','').split(':')[0]
        # Public ingress is nginx with HTTPS and HTTP Basic authentication.
        return host==PUBLIC_HOST

    def do_GET(self):
        if not self.guard():
            return self.respond({'error':'Forbidden'},403)
        path=urlparse(self.path).path
        try:
            if path=='/api/skills':
                return self.respond(skills())
            if path.startswith('/api/skills/') and path.endswith('/diff'):
                name=safe_name(unquote(path.split('/')[3]))
                left=export_package(name)['files']
                right=mac('export',name=name)['files']
                differences=[]
                for relative in sorted(left.keys()|right.keys()):
                    vps=base64.b64decode(left[relative]['data']) if relative in left else b''
                    desktop=base64.b64decode(right[relative]['data']) if relative in right else b''
                    if vps==desktop:
                        continue
                    try:
                        patch=''.join(difflib.unified_diff(desktop.decode().splitlines(True),vps.decode().splitlines(True),fromfile='Mac/'+relative,tofile='VPS/'+relative))[:200000]
                    except UnicodeDecodeError:
                        patch='Binary contents differ'
                    differences.append(dict(path=relative,status='changed',diff=patch))
                return self.respond(dict(name=name,files=differences,identical=not differences))
            if path.startswith('/api/'):
                return self.respond({'error':'Not found'},404)
            if not (PANEL/'index.html').is_file():
                return self.respond({'error':'Panel build is not installed'},503)
            if not Path(self.translate_path(path)).is_file():
                self.path='/index.html'
            return super().do_GET()
        except (ValueError, OSError) as exc:
            return self.respond({'error':str(exc)},503 if isinstance(exc,ConnectionError) else 400)

    def mutate(self):
        path=urlparse(self.path).path
        try:
            if path=='/internal':
                supplied=self.headers.get('Authorization','')
                if not hmac.compare_digest(supplied,'Bearer '+KEY):
                    return self.respond({'error':'Forbidden'},403)
                body=self.read_body()
                with LOCK:
                    result=rpc(**body)
                return self.respond({'result':result})
            if not self.guard():
                return self.respond({'error':'Forbidden'},403)
            if self.headers.get('Origin')!='https://'+PUBLIC_HOST or self.headers.get('X-Panel-Request')!='1':
                return self.respond({'error':'Invalid request origin'},403)
            parts=path.split('/')
            if len(parts)!=5 or parts[1:3]!=['api','skills']:
                return self.respond({'error':'Not found'},404)
            name=safe_name(unquote(parts[3]));body=self.read_body()
            with LOCK:
                if parts[4]=='sync' and self.command=='POST':
                    package=export_package(name)
                    mac('import',package=package)
                    result=dict(name=name,hash=package['hash'],message='Central Mac package updated from VPS')
                elif parts[4]=='targets' and self.command=='PATCH':
                    target=body.get('target');installed=body.get('installed')
                    if target not in ('codexVps','claudeVps','codexMac','claudeMac') or not isinstance(installed,bool):
                        raise ValueError('Invalid target')
                    provider='codex' if target.startswith('codex') else 'claude'
                    if target.endswith('Mac'):
                        if installed:
                            try:
                                package=export_package(name)
                            except ValueError:
                                package=mac('export',name=name)
                            mac('import',package=package)
                        result=mac('target',name=name,provider=provider,installed=installed)
                    else:
                        if installed and not (STORE/name/'SKILL.md').is_file():
                            try:
                                package=export_package(name)
                            except ValueError:
                                package=mac('export',name=name)
                            import_package(package)
                        result=rpc('target',name=name,provider=provider,installed=installed)
                else:
                    return self.respond({'error':'Not found'},404)
            return self.respond(dict(result=result,refresh=dict(t3='unverified',files='updated')))
        except (ValueError,KeyError,TypeError,OSError) as exc:
            return self.respond({'error':str(exc)},503 if isinstance(exc,ConnectionError) else 400)

    do_POST=mutate
    do_PATCH=mutate


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--mode',choices=['agent','admin'],required=True)
    parser.add_argument('--port',type=int,required=True)
    args=parser.parse_args()
    MODE=args.mode;MACHINE='Mac' if MODE=='agent' else 'Vps'
    KEY=(STATE/'agent.key').read_text().strip()
    if len(KEY)<32:
        raise SystemExit('Missing private machine agent key')
    request_t3_refresh()
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
