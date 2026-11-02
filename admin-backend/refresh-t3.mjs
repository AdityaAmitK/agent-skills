// Refresh the running official T3 server through its existing authenticated RPC.
// Credentials are minted briefly by its own CLI, kept in memory, then revoked.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const home = homedir();
const cli = process.env.SKILL_ADMIN_T3_CLI || join(home, '.t3/bin/t3');
let session;
let socket;
try {
  const runtime = JSON.parse(readFileSync(join(home, '.t3/userdata/server-runtime.json'), 'utf8'));
  session = JSON.parse(execFileSync(cli, ['auth','session','issue','--scope','orchestration:read','--ttl','1m','--label','Skills administration refresh','--json'], {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
  const ticketResponse = await fetch(new URL('/api/auth/websocket-ticket/rpc',runtime.origin), {method:'POST',headers:{Authorization:`Bearer ${session.token}`},signal:AbortSignal.timeout(10000)});
  if (!ticketResponse.ok) throw new Error(`T3 ticket request returned ${ticketResponse.status}`);
  const {ticket} = await ticketResponse.json();
  const url = new URL('/ws',runtime.origin);
  url.protocol = url.protocol==='https:'?'wss:':'ws:';
  url.searchParams.set('orchestrationProtocol','2');
  url.searchParams.set('wsTicket',ticket);
  socket = new WebSocket(url);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('T3 connection timed out')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('T3 socket connection failed'));},{once:true});
  });
  let sequence=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    const decoded=JSON.parse(String(event.data));
    for(const frame of Array.isArray(decoded)?decoded:[decoded]) {
      if(frame._tag==='Ping') {socket.send(JSON.stringify({_tag:'Pong'}));continue;}
      const entry=pending.get(String(frame.requestId));
      if(frame._tag==='Exit'&&entry) {
        pending.delete(String(frame.requestId));clearTimeout(entry.timer);
        if(frame.exit?._tag==='Success') entry.resolve(frame.exit.value);
        else entry.reject(new Error('T3 rejected the provider refresh'));
      }
    }
  });
  const request=(payload,tag='server.refreshProviders')=>new Promise((resolve,reject)=>{
    const id=String(++sequence);
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('T3 provider refresh timed out'));},45000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({_tag:'Request',id,tag,payload,headers:[]}));
  });
  const refreshed=await request({},'server.getConfig');
  const providers=Array.isArray(refreshed)?refreshed:refreshed.providers||[];
  let workspaces=0;
  const jobs=[];
  for(const provider of providers) {
    if(!provider.enabled || !/codex|claude/i.test(provider.driver||provider.driverKind||provider.instanceId||''))continue;
    if(!provider.workspaceSnapshots?.length)jobs.push({instanceId:provider.instanceId});
    for(const workspace of provider.workspaceSnapshots||[]) {
      if(!workspace.cwd)continue;
      jobs.push({instanceId:provider.instanceId,cwd:workspace.cwd,fresh:true});
    }
  }
  let failures=0;
  for(let index=0;index<jobs.length;index+=3) {
    const results=await Promise.allSettled(jobs.slice(index,index+3).map(job=>request(job)));
    workspaces+=results.filter(result=>result.status==='fulfilled').length;
    failures+=results.filter(result=>result.status==='rejected').length;
  }
  console.log(JSON.stringify({status:failures?'partial':'refreshed',workspaces,failures,message:'T3 provider catalogs rescanned. Already-running turns may retain instructions loaded earlier.'}));
} catch(error) {
  console.log(JSON.stringify({status:'unavailable',message:error instanceof Error?error.message:'T3 refresh failed'}));
  process.exitCode=1;
} finally {
  socket?.close();
  if(session?.sessionId) {
    try {execFileSync(cli,['auth','session','revoke',session.sessionId],{timeout:10000,stdio:'ignore'});} catch {}
  }
}
