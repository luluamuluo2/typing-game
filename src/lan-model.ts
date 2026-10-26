import { preparePassage, type PracticePassage } from './practice.ts'
export type LanRole = 'police' | 'thief'
export type LanPlayer = { id: string; role: LanRole; ready: boolean; connected: boolean; index: number; mistakes: number; position: number; lastSeq: number }
export class LanRoom {
  code: string; hostId: string; passage: PracticePassage; source: string; hints: boolean
  players: LanPlayer[] = []; round = 0; status: 'lobby'|'playing'|'paused'|'finished' = 'lobby'
  remainingMs: number; durationMs: number; winner: LanRole|null = null; reason = ''
  constructor(code: string, hostId: string, source: string, hints = false, durationSeconds = 180) {
    const result = preparePassage(source, 'pinyin')
    if (!result.ok) throw new Error('请输入有效中文句子（最多2000字符）。')
    this.code=code; this.hostId=hostId; this.source=result.passage.source; this.passage=result.passage; this.hints=hints
    this.durationMs = Math.min(900, Math.max(60, Number.isFinite(durationSeconds) ? durationSeconds : 180)) * 1000
    this.remainingMs=this.durationMs
  }
  add(id: string, role: LanRole) {
    if(this.players.length>=2 || this.status!=='lobby') throw new Error('房间已满或已开始。')
    this.players.push({id,role,ready:false,connected:true,index:0,mistakes:0,position:role==='thief'?.15:0,lastSeq:0})
  }
  start(id: string) {
    if(id!==this.hostId || this.status!=='lobby' || this.players.length!==2 || !this.players.every(p=>p.ready&&p.connected)) throw new Error('需要两人准备后由房主开始。')
    this.round++; this.status='playing'; this.remainingMs=this.durationMs; this.winner=null;this.reason=''
  }
  reset(id: string) {
    if(id!==this.hostId || this.status!=='finished') throw new Error('结束后由房主再来一局。')
    this.status='lobby'; this.winner=null;this.reason=''; this.remainingMs=this.durationMs
    for(const p of this.players) Object.assign(p,{ready:false,index:0,mistakes:0,position:p.role==='thief'?.15:0,lastSeq:0})
  }
  connected(id:string, connected:boolean) {
    const p=this.players.find(p=>p.id===id); if(!p)return
    p.connected=connected
    if(!connected && this.status==='playing')this.status='paused'
    else if(this.status==='paused' && this.players.every(p=>p.connected))this.status='playing'
  }
  input(id:string,key:string,round:number,seq:number) {
    const p=this.players.find(p=>p.id===id)
    if(!p || this.status!=='playing' || round!==this.round || !Number.isSafeInteger(seq) || seq<=p.lastSeq || typeof key!=='string' || !/^[a-z0-9]$/i.test(key))return false
    p.lastSeq=seq
    if(key.toLowerCase()!==this.passage.target[p.index]) {p.mistakes++;return true}
    p.index++
    // Each source character contributes equally; partial syllables give partial movement.
    const units=this.passage.units.filter(u=>u.target.length)
    let progress=0
    for(const u of units)progress+=Math.max(0,Math.min(1,(p.index-u.start)/u.target.length))
    progress/=units.length
    p.position=(p.role==='thief'?.15:0)+progress*(p.role==='police'?1.2:1)
    const police=this.players.find(p=>p.role==='police')!;const thief=this.players.find(p=>p.role==='thief')!
    if(police.position>=thief.position)this.finish('police','caught')
    else if(thief.index>=this.passage.target.length)this.finish('thief','escaped')
    return true
  }
  tick(ms:number) {
    if(this.status!=='playing')return
    this.remainingMs=Math.max(0,this.remainingMs-Math.max(0,ms))
    if(!this.remainingMs)this.finish('thief','timeout')
  }
  finish(winner:LanRole,reason:string){this.status='finished';this.winner=winner;this.reason=reason}
  snapshot(){return {type:'state',code:this.code,hostId:this.hostId,round:this.round,status:this.status,source:this.source,passage:this.passage,hints:this.hints,players:this.players,remainingMs:this.remainingMs,winner:this.winner,reason:this.reason}}
}
