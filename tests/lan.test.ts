import {test} from 'node:test'
import assert from 'node:assert/strict'
import {LanRoom} from '../src/lan-model.ts'
// @ts-ignore Node server runs directly with native type stripping.
import {createLanServer} from '../server/lan.mjs'
import {WebSocket} from 'ws'
const room=()=>{const r=new LanRoom('A','p','我爱学习。',false,180);r.add('p','police');r.add('t','thief');r.players.forEach(p=>p.ready=true);r.start('p');return r}
test('LAN role authority, canonical pinyin and short passage police catch',()=>{
 const r=new LanRoom('A','p','山');r.add('p','police');r.add('t','thief');r.players.forEach(p=>p.ready=true)
 assert.throws(()=>r.start('t'));r.start('p');assert.equal(r.passage.target,'shan')
 r.input('p','s',r.round,1);assert.equal(r.winner,'police')
})
test('LAN input validates target, sequence and round; no raw position trust',()=>{
 const r=room();assert.equal(r.input('p','x',r.round,1),true);assert.equal(r.players[0].index,0)
 r.input('p','w',r.round,2);const index=r.players[0].index
 r.input('p','o',r.round,2);r.input('p','o',r.round+1,3);assert.equal(r.players[0].index,index)
})
test('LAN pause freezes clock, reconnect resumes, finish/reset clears progress',()=>{
 const r=room();r.connected('t',false);r.tick(99999);assert.equal(r.remainingMs,180000)
 r.connected('t',true);r.tick(180000);assert.equal(r.winner,'thief')
 assert.throws(()=>r.reset('t'));r.reset('p');assert.equal(r.status,'lobby');assert.equal(r.players[0].ready,false)
})
test('LAN thief can escape on canonical text completion without AI cap',()=>{
 const r=room();for(const [i,key] of [...r.passage.target].entries())r.input('t',key,r.round,i+1)
 assert.equal(r.winner,'thief');assert.equal(r.reason,'escaped');assert.ok(r.players[1].position>0.5)
})
test('LAN real two-client create/join/ready/start/input/disconnect/resume/reset',async()=>{
 const app=createLanServer({port:0,host:'127.0.0.1'});const address=await app.listen();const url=`ws://127.0.0.1:${address.port}/lan/ws`
 const clients: any[]=[]
 async function client(){const ws=new WebSocket(url);const queue:any[]=[];ws.on('message',(raw:any)=>queue.push(JSON.parse(raw.toString())));await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej)});clients.push(ws);return {ws,send:(m:any)=>ws.send(JSON.stringify(m)),wait:async(predicate:any)=>{const end=Date.now()+3000;while(Date.now()<end){const at=queue.findIndex(predicate);if(at>=0)return queue.splice(at,1)[0];await new Promise(r=>setTimeout(r,10))}throw new Error('Timed out waiting for server message')}}}
 try {
 const a=await client();a.send({type:'create',source:'银行行走。',role:'police',durationSeconds:300});const sa=await a.wait((m:any)=>m.type==='session')
 const b=await client();b.send({type:'join',code:sa.code});const sb=await b.wait((m:any)=>m.type==='session')
 a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await a.wait((m:any)=>m.type==='state'&&m.players.length===2&&m.players.every((p:any)=>p.ready))
 b.send({type:'start'});await b.wait((m:any)=>m.type==='error');a.send({type:'start'});const start=await a.wait((m:any)=>m.status==='playing');const startB=await b.wait((m:any)=>m.status==='playing');assert.deepEqual(start.passage,startB.passage)
 b.ws.close();await a.wait((m:any)=>m.status==='paused');const c=await client();c.send({type:'resume',code:sb.code,token:sb.token});await c.wait((m:any)=>m.status==='playing')
 for(const [i,key] of [...start.passage.target].entries())c.send({type:'input',key,round:start.round,seq:i+1})
 const done=await a.wait((m:any)=>m.status==='finished');assert.equal(done.winner,'thief')
 a.send({type:'reset'});const reset=await a.wait((m:any)=>m.status==='lobby'&&m.players.length===2&&m.players.every((p:any)=>!p.ready));assert.equal(reset.players[1].index,0)
 const info=await fetch(`http://127.0.0.1:${address.port}/lan/info`).then(r=>r.json());assert.equal(info.enabled,true)
 } finally {clients.forEach(ws=>ws.terminate());await app.close()}
})
test('LAN rejects malformed/full rooms and foreign WebSocket origins',async()=>{
 const app=createLanServer({port:0,host:'127.0.0.1'});const address=await app.listen()
 try {
  const r=new LanRoom('B','p','你好');r.add('p','police');r.add('t','thief');assert.throws(()=>r.add('x','thief'))
  assert.throws(()=>new LanRoom('B','p','。'));assert.throws(()=>new LanRoom('B','p','我'.repeat(2001)))
  const status=await new Promise<number>((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${address.port}/lan/ws`,{origin:'https://unrelated.example'});ws.on('unexpected-response',(_req:any,res:any)=>{resolve(res.statusCode);res.destroy();ws.terminate()});ws.on('error',()=>{});ws.on('open',()=>{ws.terminate();reject(new Error('Foreign origin accepted'))})})
  assert.equal(status,403)
 }finally{await app.close()}
})
