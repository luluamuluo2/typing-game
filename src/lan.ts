import './lan.css'
import { ARTICLES } from './articles.ts'
import { MAP_IMAGE_URL } from './assets.ts'
import { pathAt } from './path.ts'
import { createPinyinGuide, type PinyinGuide } from './practice-view.ts'
import { isCompositionKey, type PracticePassage } from './practice.ts'

type Role = 'police' | 'thief'
type Player = { id: string; role: Role; ready: boolean; connected: boolean; index: number; mistakes: number; position: number; lastSeq?: number }
type State = { type: 'state'; code: string; hostId: string; round: number; status: 'lobby' | 'playing' | 'paused' | 'finished'; source: string; passage: PracticePassage; hints: boolean; players: Player[]; remainingMs: number; winner: Role | null; reason: string | null }
type Session = { code: string; token: string; id: string }
const SESSION_KEY = 'speed-chase.lan.session.v1'
const roleName = (role: Role) => role === 'police' ? '警察' : '小偷'

/** A separate, server-authoritative game: never advances movement or typing locally. */
export function initLan(onEnter: () => void, onExit: () => void) {
  const root = document.createElement('section')
  root.id = 'screen-lan'
  root.className = 'screen hidden'
  root.tabIndex = -1
  root.innerHTML = `<div class="lan-panel">
    <header class="lan-header"><div><p class="kicker">双人 · 同一局域网</p><h2>警察抓小偷</h2></div><button class="btn ghost" data-el="exit">退出联机</button></header>
    <p data-el="connection" role="status" aria-live="polite">正在检查本地服务器…</p>
    <p data-el="error" class="lan-error" role="alert"></p>
    <div data-el="addresses" class="lan-addresses"></div>
    <details class="lan-rules"><summary>玩法与连接说明</summary><p>两台电脑连接同一个 Wi-Fi / 局域网，打开下方同一个服务器地址，再用房间码加入。静态网页预览不支持联机，请在项目目录运行 <code>npm run lan:start</code>。仅在可信局域网使用，不要将端口开放到公网。</p><p>房主统一选择中文文章、角色和拼音提示；双方使用服务器生成的同一份拼音。切到英文输入法，连续输入无声调拼音，ü 输入 v，跳过空格与标点。已正确输入的拼音保留，错误不会前进；只显示自己的输入进度与答案。</p><p>小偷领先 0.15 圈；移动按原文有效字符进度计算（一个音节内按字母比例前进），全文对应警察 1.2 圈、小偷 1 圈。警察追上即获胜，小偷先打完即逃脱。房主选择有效比赛时长（默认 3 分钟），超时小偷获胜。断线时双方暂停、计时冻结；重连后恢复。双方准备后由房主开始，再来一局须重新准备。</p></details>
    <div data-el="setup" class="lan-setup">
      <form data-el="create-form" class="lan-box"><h3>创建房间</h3><label>同一篇中文文章（最多 2000 字）<textarea data-el="source" maxlength="2000" required rows="5"></textarea></label><div class="lan-options"><label>我的角色 <select data-el="role"><option value="police">警察</option><option value="thief">小偷</option></select></label><label>时长 <select data-el="duration"><option value="180">3 分钟</option><option value="300">5 分钟</option><option value="600">10 分钟</option><option value="900">15 分钟</option></select></label><label><input type="checkbox" data-el="hints"> 显示双方拼音提示</label></div><button class="btn primary" data-el="create" disabled>创建房间</button></form>
      <form data-el="join-form" class="lan-box"><h3>加入房间</h3><label>房间码<input data-el="code" required maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="输入房主的房间码"></label><p class="hint">自动成为另一角色，文章和提示与房主一致。</p><button class="btn" data-el="join" disabled>加入房间</button></form>
    </div>
    <div data-el="room" class="hidden"><div class="lan-room-head"><h3>房间 <strong data-el="room-code"></strong></h3><button class="btn mini" data-el="leave">离开房间</button></div><p data-el="status" role="status" aria-live="polite"></p><div data-el="players" class="lan-players"></div><div class="lan-actions"><button class="btn" data-el="ready">准备</button><button class="btn primary" data-el="start">开始比赛</button><button class="btn" data-el="reset">再来一局</button><span data-el="hint-status"></span><b data-el="clock"></b></div>
      <div class="lan-map"><img class="lan-map-image" data-el="map" alt="城市追逐赛道"><div class="lan-runner lan-police" data-el="police"><img src="/assets/police-idle.png" alt="警察"><span>警察</span></div><div class="lan-runner lan-thief" data-el="thief"><img src="/assets/thief-idle.png" alt="小偷"><span>小偷</span></div></div>
      <div class="lan-typing"><div class="lan-room-head"><b>你的文章 · 看中文打拼音</b><span data-el="progress"></span></div><div class="source-line" data-el="guide"></div><progress data-el="bar" max="1" value="0" aria-label="自己的输入进度"></progress><p class="hint" data-el="input-status">请切到英文输入法；开始后直接打字。</p></div>
    </div>
  </div>`
  document.getElementById('app')!.append(root)
  const el = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-el="${name}"]`)!
  el<HTMLImageElement>('map').src = MAP_IMAGE_URL
  el<HTMLTextAreaElement>('source').value = ARTICLES.find(a => a.mode === 'pinyin')!.text
  let active = false
  let socket: WebSocket | null = null
  let state: State | null = null
  let session: Session | null = null
  let guide: PinyinGuide | null = null
  let guideIdentity = ''
  let seq = 0
  let composing = false
  let reconnectTimer: number | undefined
  let retries = 0
  let generation = 0
  let resuming = false
  const connected = () => socket?.readyState === WebSocket.OPEN
  const send = (message: object) => { if (connected()) socket!.send(JSON.stringify(message)) }
  const error = (message: string) => { el('error').textContent = message }
  const saveSession = () => { try { if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY) } catch { /* Optional storage. */ } }
  const clearRoom = () => {
    session = null; state = null; guide = null; guideIdentity = ''; seq = 0; resuming = false
    saveSession(); render()
  }
  function render() {
    const ready = Boolean(connected() && !resuming)
    el<HTMLButtonElement>('create').disabled = !ready
    el<HTMLButtonElement>('join').disabled = !ready
    el('setup').classList.toggle('hidden', Boolean(session || state))
    el('room').classList.toggle('hidden', !state)
    if (!state) return
    const own = state.players.find(player => player.id === session?.id)
    const host = state.hostId === session?.id
    el('room-code').textContent = state.code
    el('status').textContent = !ready ? '连接已中断，比赛暂停。正在自动重连…' : state.status === 'lobby' ? '等待两位玩家准备，由房主开始。' : state.status === 'paused' ? '有人断线：比赛与计时已暂停，等待重连。' : state.status === 'finished' ? `${state.winner ? roleName(state.winner) : ''}获胜！${state.reason === 'caught' ? '警察追上了小偷。' : state.reason === 'timeout' ? '时间到，小偷成功逃脱。' : '本局结束。'}` : `比赛进行中：你是${own ? roleName(own.role) : ''}，直接输入拼音！`
    el('players').replaceChildren(...state.players.map(player => {
      const card = document.createElement('div')
      card.className = 'lan-player'
      card.textContent = `${roleName(player.role)}${player.id === session?.id ? '（你）' : ''}${player.id === state!.hostId ? ' · 房主' : ''} — ${!player.connected ? '离线' : player.ready ? '已准备' : '未准备'} · ${Math.round(player.index / state!.passage.target.length * 100)}% · 错误 ${player.mistakes}`
      return card
    }))
    const readyButton = el<HTMLButtonElement>('ready')
    readyButton.textContent = own?.ready ? '取消准备' : '准备'
    readyButton.disabled = !ready || state.status !== 'lobby'
    readyButton.classList.toggle('hidden', state.status !== 'lobby')
    el('start').classList.toggle('hidden', !host || state.status !== 'lobby')
    el<HTMLButtonElement>('start').disabled = !ready || state.players.length !== 2 || !state.players.every(player => player.ready && player.connected)
    el('reset').classList.toggle('hidden', !host || state.status !== 'finished')
    el<HTMLButtonElement>('reset').disabled = !ready
    el('hint-status').textContent = state.hints ? '房主设定：拼音提示开启' : '房主设定：拼音提示关闭'
    const seconds = Math.ceil(state.remainingMs / 1000)
    el('clock').textContent = `剩余 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    const identity = `${state.code}:${state.round}:${state.passage.target}`
    if (guideIdentity !== identity) { guide = createPinyinGuide(el('guide'), state.passage); guideIdentity = identity }
    guide?.setHintsVisible(state.hints)
    guide?.update(own?.index ?? 0, state.status !== 'playing')
    el('progress').textContent = `${own?.index ?? 0} / ${state.passage.target.length} 字母`
    el<HTMLProgressElement>('bar').value = (own?.index ?? 0) / state.passage.target.length
    for (const role of ['police', 'thief'] as const) {
      const player = state.players.find(p => p.role === role)
      el(role).classList.toggle('hidden', !player)
      if (player) { const point = pathAt(player.position % 1); el(role).style.left = `${point.x * 100}%`; el(role).style.top = `${point.y * 100}%` }
    }
  }
  function connect(epoch: number) {
    if (!active || epoch !== generation) return
    el('connection').textContent = '正在连接局域网服务器…'
    const url = new URL('/lan/ws', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url)
    socket = ws
    ws.addEventListener('open', () => {
      if (socket !== ws || !active) { ws.close(); return }
      retries = 0
      el('connection').textContent = '已连接本地服务器 · 请让另一台电脑打开下方局域网地址'
      if (session) { resuming = true; send({ type: 'resume', code: session.code, token: session.token }) }
      render()
    })
    ws.addEventListener('message', event => {
      if (socket !== ws || !active) return
      let message: State | ({ type: 'session' } & Session) | { type: 'error'; message: string; code?: string }
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (message.type === 'session') { session = { code: message.code, token: message.token, id: message.id }; resuming = false; saveSession(); error(''); render() }
      else if (message.type === 'state') {
        const previousStatus = state?.status
        if (state?.round !== message.round) seq = 0
        state = message
        seq = Math.max(seq, message.players.find(player => player.id === session?.id)?.lastSeq ?? 0)
        resuming = false; render()
        if (message.status === 'playing' && previousStatus !== 'playing') root.focus({ preventScroll: true })
      } else if (message.type === 'error') {
        if (resuming || message.code === 'roomClosed') clearRoom()
        error(message.message)
      }
    })
    ws.addEventListener('close', () => {
      if (socket !== ws || !active || generation !== epoch) return
      socket = null
      el('connection').textContent = '服务器连接中断，正在重连。已开始的比赛会暂停。'
      render()
      reconnectTimer = window.setTimeout(() => connect(epoch), Math.min(1000 * 2 ** retries++, 10000))
    })
    ws.addEventListener('error', () => { /* close schedules reconnect. */ })
  }
  async function open() {
    active = true; onEnter(); root.classList.remove('hidden'); root.focus(); error('')
    const epoch = ++generation
    try { const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); if (saved && typeof saved.code === 'string' && typeof saved.token === 'string' && typeof saved.id === 'string') session = saved } catch { /* Optional storage. */ }
    render()
    el('connection').textContent = '正在检查本地服务器…'
    el('addresses').replaceChildren()
    try {
      const response = await fetch('/lan/info', { signal: AbortSignal.timeout(5000) })
      const info = await response.json() as { enabled?: boolean; urls?: string[] }
      if (!active || epoch !== generation) return
      if (!response.ok || info.enabled !== true) throw new Error('Unavailable')
      for (const value of info.urls ?? []) {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol)) continue
        const link = document.createElement('a'); link.href = url.href; link.textContent = url.href
        el('addresses').append(link)
      }
      connect(epoch)
    } catch {
      if (!active || epoch !== generation) return
      el('connection').textContent = '此页面没有局域网服务器。静态预览不能联机。'
      error('请在项目目录运行 npm run lan:start，再打开终端显示的局域网地址。两台电脑须使用同一个服务器地址；确认防火墙允许此端口。退出后可重新进入检查。')
    }
  }
  el('exit').addEventListener('click', () => {
    send({ type: 'leave' }); active = false; generation++; window.clearTimeout(reconnectTimer)
    socket?.close(); socket = null; clearRoom(); root.classList.add('hidden'); onExit()
  })
  el('leave').addEventListener('click', () => { send({ type: 'leave' }); clearRoom(); error('') })
  el('create-form').addEventListener('submit', event => {
    event.preventDefault(); error('')
    send({ type: 'create', source: el<HTMLTextAreaElement>('source').value, role: el<HTMLSelectElement>('role').value, hints: el<HTMLInputElement>('hints').checked, durationSeconds: Number(el<HTMLSelectElement>('duration').value) })
  })
  el('join-form').addEventListener('submit', event => { event.preventDefault(); error(''); send({ type: 'join', code: el<HTMLInputElement>('code').value.trim().toUpperCase() }) })
  el('ready').addEventListener('click', () => { send({ type: 'ready', ready: !state?.players.find(player => player.id === session?.id)?.ready }) })
  el('start').addEventListener('click', () => send({ type: 'start' }))
  el('reset').addEventListener('click', () => send({ type: 'reset' }))
  window.addEventListener('compositionstart', () => { composing = true })
  window.addEventListener('compositionend', () => { composing = false })
  window.addEventListener('keydown', event => {
    if (!active || !connected() || resuming || state?.status !== 'playing') return
    if (composing || isCompositionKey(event)) { el('input-status').textContent = '请切到英文输入法，不要使用中文输入法。'; return }
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (!/^[a-z0-9]$/i.test(event.key)) return
    event.preventDefault()
    send({ type: 'input', key: event.key.toLowerCase(), round: state.round, seq: ++seq })
    el('input-status').textContent = '只接受正确字母；错误不前进。输入进度由服务器确认。'
  })
  document.getElementById('btn-lan')!.addEventListener('click', () => { void open() })
}
