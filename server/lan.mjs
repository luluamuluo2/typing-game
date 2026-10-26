import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { LanRoom } from '../src/lan-model.ts'

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ico':'image/x-icon','.json':'application/json'}
const token=()=>randomBytes(24).toString('hex')
export function createLanServer({port=Number(process.env.PORT)||3000,host=process.env.HOST||'0.0.0.0',root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)))}={}) {
  const rooms=new Map();const sessions=new Map();const sockets=new Set()
  const urls=()=>{try{return Object.values(networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>`http://${a.address}:${server.address()?.port??port}`)}catch{return []}}
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost')
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
      if(url.pathname==='/lan/info'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({enabled:true,urls:urls()}));return}
      const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))
      if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
      if(!(await stat(path)).isFile())throw new Error('not found')
      res.setHeader('Content-Type',MIME[extname(path)]||'application/octet-stream')
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-cache')
      res.end(req.method==='HEAD'?undefined:await readFile(path))
    } catch {res.writeHead(404);res.end('Not found. Run npm run build before npm run lan.')}
  })
  const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false})
  server.on('upgrade',(req,socket,head)=>{
    // Do not let unrelated websites control a local game (cross-site WebSocket hijacking).
    let valid=false
    try { valid=req.url==='/lan/ws' && (!req.headers.origin || new URL(req.headers.origin).host===req.headers.host) }catch{}
    if(!valid || sockets.size>=64){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req))
  })
  const send=(ws,msg)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg))}
  const broadcast=room=>{for(const s of sessions.values())if(s.code===room.code)send(s.ws,room.snapshot())}
  const removeRoom=code=>{
    for(const [key,s] of sessions)if(s.code===code){send(s.ws,{type:'error',code:'roomClosed',message:'房间已关闭，请重新创建或加入。'});if(s.ws)s.ws.session=null;sessions.delete(key)}
    rooms.delete(code)
  }
  wss.on('connection',ws=>{
    sockets.add(ws);ws.alive=true;ws.on('pong',()=>ws.alive=true)
    let windowStart=Date.now(),count=0
    ws.on('error',()=>{})
    ws.on('message',(raw,isBinary)=>{
      try {
        if(isBinary)throw new Error('仅支持文本消息。')
        if(Date.now()-windowStart>1000){windowStart=Date.now();count=0}
        if(++count>60){ws.close(1008,'Rate limit');return}
        const m=JSON.parse(raw.toString());if(!m||typeof m!=='object')throw new Error('消息无效。')
        let session=ws.session,room=session&&rooms.get(session.code)
        if(m.type==='create'){
          if(session)throw new Error('请先离开当前房间。')
          if(rooms.size>=20)throw new Error('房间数量已满。')
          if(typeof m.source!=='string'||m.source.length>2000||!['police','thief'].includes(m.role))throw new Error('句子或角色无效。')
          let code;do {code=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code))
          const id=randomBytes(8).toString('hex'),key=token()
          room=new LanRoom(code,id,m.source,m.hints===true,Number(m.durationSeconds)||180)
          room.add(id,m.role);room.touched=Date.now();rooms.set(code,room)
          session={id,code,token:key,ws,disconnectedAt:null};sessions.set(key,session);ws.session=session
          send(ws,{type:'session',code,id,token:key});broadcast(room);return
        }
        if(m.type==='join'){
          if(session)throw new Error('请先离开当前房间。')
          room=rooms.get(String(m.code).toUpperCase());if(!room)throw new Error('房间不存在。')
          const id=randomBytes(8).toString('hex'),key=token()
          room.add(id,room.players[0].role==='police'?'thief':'police')
          session={id,code:room.code,token:key,ws,disconnectedAt:null};sessions.set(key,session);ws.session=session;room.touched=Date.now()
          send(ws,{type:'session',code:room.code,id,token:key});broadcast(room);return
        }
        if(m.type==='resume'){
          if(session)throw new Error('已在房间内。')
          const old=typeof m.token==='string'?sessions.get(m.token):null
          if(!old||old.code!==m.code||!rooms.has(old.code))throw new Error('重连已过期，请重新加入。')
          if(old.ws&&old.ws!==ws){old.ws.session=null;old.ws.close(1000,'Reconnected elsewhere')}
          old.ws=ws;old.disconnectedAt=null;ws.session=old;room=rooms.get(old.code);room.connected(old.id,true);room.touched=Date.now()
          send(ws,{type:'session',code:old.code,id:old.id,token:old.token});broadcast(room);return
        }
        if(!room||!session)throw new Error('请先创建或加入房间。')
        room.touched=Date.now()
        const player=room.players.find(p=>p.id===session.id)
        if(m.type==='ready' && room.status==='lobby')player.ready=m.ready===true
        else if(m.type==='start')room.start(session.id)
        else if(m.type==='reset')room.reset(session.id)
        else if(m.type==='input')room.input(session.id,m.key,m.round,m.seq)
        else if(m.type==='leave'){
          sessions.delete(session.token);ws.session=null
          if(session.id===room.hostId)removeRoom(room.code)
          else if(room.status==='lobby'){room.players=room.players.filter(p=>p.id!==session.id);broadcast(room)}
          else removeRoom(room.code)
          send(ws,{type:'left'});return
        } else throw new Error('当前状态不支持此操作。')
        broadcast(room)
      } catch(e){send(ws,{type:'error',message:e instanceof SyntaxError?'消息无效。':e.message||'操作失败。'})}
    })
    ws.on('close',()=>{
      sockets.delete(ws);const s=ws.session
      if(s&&s.ws===ws){s.ws=null;s.disconnectedAt=Date.now();const room=rooms.get(s.code);if(room){room.connected(s.id,false);broadcast(room)}}
    })
  })
  let last=Date.now()
  const timer=setInterval(()=>{
    const now=Date.now(),dt=now-last;last=now
    for(const room of rooms.values()){
      if(room.status==='playing'){room.tick(dt);broadcast(room)}
      if(now-room.touched>30*60_000)removeRoom(room.code)
    }
    for(const s of sessions.values())if(s.disconnectedAt&&now-s.disconnectedAt>120_000)removeRoom(s.code)
  },250)
  const heartbeat=setInterval(()=>{for(const ws of sockets){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},5000)
  return {server,rooms,sessions,listen:()=>new Promise(r=>server.listen(port,host,()=>r(server.address()))),urls,
    close:()=>new Promise(r=>{clearInterval(timer);clearInterval(heartbeat);for(const ws of sockets)ws.terminate();wss.close();server.close(r)})}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createLanServer();await app.listen();console.log(`LAN game: http://localhost:${app.server.address().port}\n${app.urls().join('\n')}\nTrusted LAN only. Do not port-forward this server.`)
}
