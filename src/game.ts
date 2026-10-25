import { pathAt, wrap01, forwardDist, shortestDist, debugSamples } from "./path.ts"
import { t, type MessageKey } from "./i18n.ts"
import { loadImage, MAP_IMAGE_URL } from "./assets.ts"
import { isCompositionKey, type PracticePassage } from "./practice.ts"

export type Role = "police" | "thief"
export type Vehicle = "walk" | "bike" | "car"

export type Setup = {
  playerRole: Role
  playerVehicle: Vehicle
  aiVehicle: Vehicle
  passage: PracticePassage
}

export type EndReason = "caught" | "finished"

type Actor = {
  role: Role
  t: number
  dir: 1 | -1
  vehicle: Vehicle
  allowed: Vehicle
  speed: number
  isPlayer: boolean
  animationPhase: number
  facingRow: 0 | 1 | 2 | 3
}

const WALK_CPS = 2.2
const BIKE_CPS = 3.2
const CAR_CPS = 4.5
const IDLE_MS = 220
const CATCH = 0.022
const REVERSE_GAP = 0.05
const HEAD_ON_TURN_GAP = 0.04
const TURN_ESCAPE_GAP = 0.06
const TURN_COOLDOWN_MS = 600
const THIEF_LEAD = 0.045
const THIEF_IDLE_MS = 1000
const THIEF_SLOW_GAP = 0.25
const THIEF_MAX_GAP = 0.5
const THIEF_GAP_EPSILON = 1e-12
const THIEF_RESPONSE_SECONDS = 0.35

const BASE_SPEED: Record<Vehicle, number> = {
  walk: 1 / 24,
  bike: 1 / 14,
  car: 1 / 8.5,
}

const VEHICLE_LABEL_KEY: Record<Vehicle, MessageKey> = {
  walk: "vehicle.walk",
  bike: "vehicle.bike",
  car: "vehicle.car",
}

export const VEHICLE_OPTIONS: {
  id: Vehicle
  labelKey: MessageKey
  img: string
  hintKey: MessageKey
}[] = [
  { id: "walk", labelKey: "vehicle.walk", img: "/assets/police-run-se.png", hintKey: "vehicleHint.walk" },
  { id: "bike", labelKey: "vehicle.bike", img: "/assets/bike.png", hintKey: "vehicleHint.bike" },
  { id: "car", labelKey: "vehicle.car", img: "/assets/car.png", hintKey: "vehicleHint.car" },
]

const ANIMATION_ATLAS: Record<Role, Record<Vehicle, string>> = {
  police: {
    walk: "/assets/animation/police-walk-4dir.png",
    bike: "/assets/animation/police-bike-4dir.png",
    car: "/assets/animation/police-car-4dir.png",
  },
  thief: {
    walk: "/assets/animation/thief-walk-4dir.png",
    bike: "/assets/animation/thief-bike-4dir.png",
    car: "/assets/animation/thief-car-4dir.png",
  },
}

export const GAME_IMAGE_URLS = [
  MAP_IMAGE_URL,
  ...Object.values(ANIMATION_ATLAS).flatMap((vehicles) => Object.values(vehicles)),
]

const ATLAS_COLUMNS = 4
const ATLAS_ROWS = 4
const FACING_DEAD_ZONE = 0.12
const ANIMATION_FPS: Record<Vehicle, number> = { walk: 9, bike: 10, car: 8 }
const IDLE_FRAME: Record<Vehicle, number> = { walk: 1, bike: 0, car: 0 }

// Preserve the original scene proportions independently of asset resolution.
const LOGICAL_MAP_WIDTH = 1280
// Sprite height in logical map pixels, not source-image pixels.
const DRAW_MAP_H: Record<Vehicle, number> = { walk: 64, bike: 78, car: 68 }
const ANCHOR_Y: Record<Vehicle, number> = { walk: 0.9, bike: 0.94, car: 0.9 }
const SHADOW_WIDTH: Record<Vehicle, number> = { walk: 0.34, bike: 0.62, car: 0.72 }
const SHADOW_HEIGHT: Record<Vehicle, number> = { walk: 0.055, bike: 0.06, car: 0.075 }
const ACTOR_FILTER = "saturate(0.8) contrast(0.9) brightness(0.96)"

export class ChaseGame {
  readonly canvas: HTMLCanvasElement
  readonly setup: Setup
  private ctx: CanvasRenderingContext2D
  private map!: HTMLImageElement
  private images = new Map<string, HTMLImageElement>()
  private police!: Actor
  private thief!: Actor
  private player!: Actor
  private ai!: Actor
  private index = 0
  private correct = 0
  private errors = 0
  private startedAt = 0
  private now = 0
  private lastTs = 0
  private lastCorrectAt = 0
  private lastErrorAt = 0
  private recent: number[] = []
  private peak = 0
  private reverseUntil = 0
  private thiefWaiting = false
  private running = false
  private ended: { winner: Role; reason: EndReason } | null = null
  private raf = 0
  private mapRect = { x: 0, y: 0, w: 1, h: 1, scale: 1 }
  private debug = new URLSearchParams(location.search).has("debug")
  onChange: () => void = () => {}
  onTick: () => void = () => {}
  onEnd: (winner: Role, reason: EndReason) => void = () => {}

  constructor(canvas: HTMLCanvasElement, setup: Setup) {
    this.canvas = canvas
    this.setup = setup
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("canvas")
    this.ctx = ctx
  }

  get typedIndex() {
    return this.index
  }
  get text() {
    return this.setup.passage.target
  }
  get cps() {
    const cut = this.now - 1000
    return this.recent.filter((t) => t > cut).length
  }
  get accuracy() {
    const total = this.correct + this.errors
    return total === 0 ? 1 : this.correct / total
  }
  get elapsed() {
    if (!this.startedAt) return 0
    return (this.now - this.startedAt) / 1000
  }
  get vehicleLabel() {
    return t(VEHICLE_LABEL_KEY[this.player.vehicle])
  }
  get started() {
    return this.startedAt > 0
  }
  get over() {
    return this.ended
  }
  get missCount() {
    return this.errors
  }
  get peakCps() {
    return this.peak
  }

  async boot() {
    const loaded = await Promise.all(GAME_IMAGE_URLS.map(async (u) => [u, await loadImage(u)] as const))
    for (const [u, img] of loaded) this.images.set(u, img)
    this.map = this.images.get(MAP_IMAGE_URL)!
    this.resetActors()
    this.resize()
    this.draw(performance.now())
  }

  resize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.canvas.width = Math.floor(w * dpr)
    this.canvas.height = Math.floor(h * dpr)
    this.canvas.style.removeProperty("width")
    this.canvas.style.removeProperty("height")
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  startLoop() {
    this.running = true
    const tick = (ts: number) => {
      if (!this.running) return
      this.step(ts)
      this.draw(ts)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  handleKey(e: KeyboardEvent): boolean {
    if (!this.running || this.ended || isCompositionKey(e) || e.repeat) return false
    if (e.metaKey || e.ctrlKey || e.altKey) return false
    if (e.key === "Escape") return false
    if (e.key.length !== 1) return false
    e.preventDefault()
    const expected = this.setup.passage.target[this.index]
    const now = performance.now()
    this.now = now
    const key = this.setup.passage.mode === "pinyin" ? e.key.toLowerCase() : e.key
    if (key === expected) {
      if (!this.startedAt) {
        this.startedAt = now
        this.lastTs = now
      }
      this.index += 1
      this.correct += 1
      this.lastCorrectAt = now
      // Only a new correct key releases the AI thief's half-lap wait.
      this.thiefWaiting = false
      this.recent.push(now)
      if (this.recent.length > 80) this.recent.splice(0, this.recent.length - 80)
      // A short passage can finish before the next animation frame.
      this.peak = Math.max(this.peak, this.cps)
      this.onChange()
      if (this.index >= this.setup.passage.target.length) {
        this.finish("finished")
      }
    } else {
      this.errors += 1
      this.lastErrorAt = now
      this.player.speed = 0
      this.player.vehicle = "walk"
      this.onChange()
    }
    return true
  }

  private resetActors() {
    const player: Actor = {
      role: this.setup.playerRole,
      t: this.setup.playerRole === "thief" ? THIEF_LEAD : 0,
      dir: 1,
      vehicle: "walk",
      allowed: this.setup.playerVehicle,
      speed: 0,
      isPlayer: true,
      animationPhase: 0,
      facingRow: 0,
    }
    const aiRole: Role = this.setup.playerRole === "police" ? "thief" : "police"
    const ai: Actor = {
      role: aiRole,
      t: aiRole === "thief" ? THIEF_LEAD : 0,
      dir: 1,
      vehicle: this.setup.aiVehicle,
      allowed: this.setup.aiVehicle,
      speed: BASE_SPEED[this.setup.aiVehicle],
      isPlayer: false,
      animationPhase: 0,
      facingRow: 0,
    }
    this.player = player
    this.ai = ai
    this.police = player.role === "police" ? player : ai
    this.thief = player.role === "thief" ? player : ai
    this.thiefWaiting = false
  }

  private step(ts: number) {
    this.now = ts
    const dt = this.lastTs ? Math.max(0, Math.min(0.05, (ts - this.lastTs) / 1000)) : 0
    this.lastTs = ts
    if (!this.startedAt || this.ended) return

    this.updatePlayerSpeed(ts, dt)
    this.peak = Math.max(this.peak, this.cps)
    const playerAdvance = this.player.speed * dt
    const policePlayer = this.player.role === "police"
    const gap = policePlayer ? this.distanceInDirection(this.police.t, this.thief.t, this.police.dir) : 0
    const aiAdvance = policePlayer
      ? this.cappedThiefAdvance(ts, dt, gap, playerAdvance)
      : this.ai.speed * dt
    this.advanceAnimation(this.player, dt)
    this.advanceAnimation(this.ai, dt)
    this.player.t = wrap01(this.player.t + this.player.dir * playerAdvance)
    this.ai.t = wrap01(this.ai.t + this.ai.dir * aiAdvance)
    if (policePlayer) {
      // Use the unwrapped gap so a catch cannot become a lap/behind reversal.
      // The capped AI never needs the original turn-around escape behavior.
      if (gap + aiAdvance - playerAdvance <= CATCH) this.finish("caught")
    } else {
      this.resolveChase()
    }
    this.onTick()
  }

  private cappedThiefAdvance(ts: number, dt: number, gap: number, policeAdvance: number) {
    if (this.thiefWaiting || dt <= 0) return 0
    const idle = ts - this.lastCorrectAt >= THIEF_IDLE_MS
    // Spend only space that really exists, including this frame's police move.
    // This cap applies during active/slow typing too, not just while idle.
    const budget = Math.max(0, THIEF_MAX_GAP - gap + policeAdvance)
    if (budget <= THIEF_GAP_EPSILON) {
      this.ai.speed = 0
      // A correct key can precede movement (e.g. the wrong-key penalty).
      // Keep that release armed until the police can actually move.
      if (idle) this.thiefWaiting = true
      return 0
    }

    const base = BASE_SPEED[this.ai.allowed]
    const progress = Math.max(0, Math.min(1, (gap - THIEF_SLOW_GAP) / (THIEF_MAX_GAP - THIEF_SLOW_GAP)))
    // A circular ease-out has a smooth onset and reaches the end in finite
    // time, unlike a linear remaining-distance taper's asymptotic crawl.
    const target = idle ? base * Math.sqrt(1 - progress * progress) : base
    const change = base * dt / THIEF_RESPONSE_SECONDS
    this.ai.speed += Math.max(-change, Math.min(change, target - this.ai.speed))
    const advance = Math.min(budget, this.ai.speed * dt)
    if (advance >= budget) {
      this.ai.speed = 0
      this.thiefWaiting = true
    }
    return advance
  }

  private advanceAnimation(actor: Actor, dt: number) {
    if (actor.speed <= 0.002) return
    const pace = Math.max(0.45, Math.min(1.25, actor.speed / BASE_SPEED[actor.vehicle]))
    actor.animationPhase = (actor.animationPhase + dt * ANIMATION_FPS[actor.vehicle] * pace) % ATLAS_COLUMNS
  }

  private allowedRank(v: Vehicle): number {
    return v === "car" ? 2 : v === "bike" ? 1 : 0
  }

  private updatePlayerSpeed(ts: number, dt: number) {
    const cps = this.cps
    const idle = ts - this.lastCorrectAt > IDLE_MS
    const erred = ts - this.lastErrorAt < 160
    if (erred) {
      this.player.vehicle = "walk"
      this.player.speed = 0
      return
    }
    if (idle) {
      this.player.vehicle = "walk"
      this.player.speed = Math.max(0, this.player.speed - BASE_SPEED.car * dt * 3.5)
      return
    }
    let want: Vehicle = "walk"
    if (this.allowedRank(this.player.allowed) >= 2 && cps >= CAR_CPS) want = "car"
    else if (this.allowedRank(this.player.allowed) >= 1 && cps >= BIKE_CPS) want = "bike"
    this.player.vehicle = want
    const cap = BASE_SPEED[want]
    const drive = Math.min(1.15, cps / CAR_CPS)
    this.player.speed = cap * (0.38 + 0.72 * drive)
    if (cps < WALK_CPS) this.player.speed = BASE_SPEED.walk * Math.max(0.25, cps / WALK_CPS)
  }

  private resolveChase() {
    const gap = shortestDist(this.police.t, this.thief.t)
    const sameDir = this.police.dir === this.thief.dir

    // A head-on meeting is an escape event, not a catch. The thief turns early
    // enough to run in front of the police instead of passing through them.
    if (!sameDir) {
      if (gap <= HEAD_ON_TURN_GAP && this.now >= this.reverseUntil) {
        this.turnThief(this.police.dir)
      }
      return
    }

    if (gap > CATCH || this.now < this.reverseUntil) return

    const thiefAhead = this.distanceInDirection(this.police.t, this.thief.t, this.police.dir) < REVERSE_GAP
    if (thiefAhead) {
      this.finish("caught")
      return
    }

    // The thief came up behind the police, so both turn around and the police
    // continues the chase with the thief now in front.
    const chaseDir = this.police.dir === 1 ? -1 : 1
    this.turnThief(chaseDir)
    this.police.dir = chaseDir
  }

  private distanceInDirection(from: number, to: number, dir: 1 | -1) {
    return dir === 1 ? forwardDist(from, to) : forwardDist(to, from)
  }

  private turnThief(dir: 1 | -1) {
    this.thief.dir = dir
    this.thief.t = wrap01(this.thief.t + dir * TURN_ESCAPE_GAP)
    this.reverseUntil = this.now + TURN_COOLDOWN_MS
  }

  private finish(reason: EndReason) {
    if (this.ended) return
    const winner: Role = reason === "caught" ? "police" : "thief"
    this.ended = { winner, reason }
    this.player.speed = 0
    this.ai.speed = 0
    this.onEnd(winner, reason)
  }

  private refreshMapRect(vw: number, vh: number) {
    const mw = this.map.naturalWidth
    const mh = this.map.naturalHeight
    const imageScale = Math.min(vw / mw, vh / mh)
    const w = mw * imageScale
    const h = mh * imageScale
    const x = (vw - w) / 2
    const y = (vh - h) / 2
    this.mapRect = { x, y, w, h, scale: w / LOGICAL_MAP_WIDTH }
    const parent = this.canvas.parentElement
    if (parent) {
      parent.style.setProperty("--map-left", `${x}px`)
      parent.style.setProperty("--map-right", `${vw - x - w}px`)
      parent.style.setProperty("--map-top", `${y}px`)
    }
  }

  private draw(ts: number) {
    const ctx = this.ctx
    const vw = this.canvas.clientWidth
    const vh = this.canvas.clientHeight
    ctx.clearRect(0, 0, vw, vh)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    this.refreshMapRect(vw, vh)
    ctx.fillStyle = "#172028"
    ctx.fillRect(0, 0, vw, vh)
    ctx.drawImage(this.map, this.mapRect.x, this.mapRect.y, this.mapRect.w, this.mapRect.h)

    if (this.debug) {
      ctx.save()
      ctx.strokeStyle = "rgba(255, 80, 40, 0.85)"
      ctx.lineWidth = 3
      ctx.beginPath()
      const samples = debugSamples()
      samples.forEach((p, i) => {
        const { x, y } = this.worldToScreen(p, vw, vh)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    const actors = [this.police, this.thief].sort((a, b) => pathAt(a.t).y - pathAt(b.t).y)
    for (const a of actors) this.drawActor(a, vw, vh, ts)
  }

  private worldToScreen(p: { x: number; y: number }, vw: number, vh: number) {
    void vw
    void vh
    return {
      x: this.mapRect.x + p.x * this.mapRect.w,
      y: this.mapRect.y + p.y * this.mapRect.h,
    }
  }

  private drawActor(a: Actor, vw: number, vh: number, ts: number) {
    const p = pathAt(a.t)
    const movingDx = p.dx * a.dir
    const movingDy = p.dy * a.dir
    let facesLeft = a.facingRow === 1 || a.facingRow === 3
    let facesAway = a.facingRow >= 2
    if (Math.abs(movingDx) > FACING_DEAD_ZONE) facesLeft = movingDx < 0
    if (Math.abs(movingDy) > FACING_DEAD_ZONE) facesAway = movingDy < 0
    a.facingRow = facesAway ? (facesLeft ? 3 : 2) : facesLeft ? 1 : 0
    const src = ANIMATION_ATLAS[a.role][a.vehicle]
    const img = this.images.get(src)
    if (!img) return
    const cellW = img.naturalWidth / ATLAS_COLUMNS
    const cellH = img.naturalHeight / ATLAS_ROWS
    const mapScale = this.mapRect.scale
    const targetH = DRAW_MAP_H[a.vehicle] * mapScale
    const targetW = (cellW / cellH) * targetH
    const moving = this.startedAt > 0 && !this.ended && a.speed > 0.002
    const frame = moving ? Math.floor(a.animationPhase) % ATLAS_COLUMNS : IDLE_FRAME[a.vehicle]
    const sourceX = frame * cellW
    const sourceY = a.facingRow * cellH
    const screen = this.worldToScreen(p, vw, vh)
    const x = screen.x
    const groundY = screen.y
    const ctx = this.ctx

    if (a.isPlayer) {
      const pulse = 0.86 + Math.sin(ts / 220) * 0.08
      ctx.save()
      ctx.strokeStyle = `rgba(255, 214, 76, ${pulse})`
      ctx.lineWidth = Math.max(1.5, mapScale * 1.25)
      ctx.beginPath()
      ctx.ellipse(
        x,
        groundY + mapScale * 1.5,
        Math.max(targetW * 0.4, targetH * 0.22),
        Math.max(mapScale * 2.7, targetH * 0.052),
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.fillStyle = "rgba(18, 24, 28, 0.22)"
    ctx.filter = `blur(${Math.max(1, mapScale * 1.1)}px)`
    ctx.beginPath()
    ctx.ellipse(
      x,
      groundY + mapScale,
      Math.max(targetW * SHADOW_WIDTH[a.vehicle], targetH * 0.15),
      Math.max(targetH * SHADOW_HEIGHT[a.vehicle], mapScale * 1.5),
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(x, groundY)
    ctx.filter = ACTOR_FILTER
    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      cellW,
      cellH,
      -targetW / 2,
      -targetH * ANCHOR_Y[a.vehicle],
      targetW,
      targetH,
    )
    ctx.restore()
  }
}
