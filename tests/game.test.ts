import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import { ChaseGame, type Setup } from "../src/game.ts"
import { preparePassage } from "../src/practice.ts"
import { forwardDist, wrap01 } from "../src/path.ts"

// Rendering and assets are mocked here; these tests exercise input/game state,
// not real browser rendering, audio, or the animation loop.
Object.assign(globalThis, {
  location: { search: "" },
  window: { devicePixelRatio: 1 },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  Image: class {
    naturalWidth = 1000
    naturalHeight = 1000
    onload: () => void = () => {}
    set src(_value: string) { queueMicrotask(() => this.onload()) }
  },
})

async function createGame(source: string, mode: "pinyin" | "english" = "pinyin", boot = true, setup: Partial<Omit<Setup, "passage">> = {}) {
  const result = preparePassage(source, mode)
  if (!result.ok) throw new Error(result.error)
  const ctx = new Proxy({}, { get: (object, key) => object[key] ?? (() => {}) })
  const canvas = {
    getContext: () => ctx,
    parentElement: { clientWidth: 1000, clientHeight: 600, style: { setProperty() {} } },
    clientWidth: 1000,
    clientHeight: 600,
    style: { removeProperty() {} },
  } as unknown as HTMLCanvasElement
  const game = new ChaseGame(canvas, { playerRole: "thief", playerVehicle: "bike", aiVehicle: "bike", ...setup, passage: result.passage })
  if (boot) {
    await game.boot()
    game.startLoop()
  }
  return game
}

function key(key: string, overrides = {}) {
  return { key, preventDefault() {}, ...overrides } as KeyboardEvent
}

type MapState = {
  map: { naturalWidth: number; naturalHeight: number }
  mapRect: { x: number; y: number; w: number; h: number; scale: number }
  ctx: { drawImage(...args: unknown[]): void }
  refreshMapRect(width: number, height: number): void
  draw(ts: number): void
}

test("scene scale and placement do not depend on background pixel density", async (t) => {
  const game = await createGame("你好")
  t.after(() => game.stop())
  const state = game as unknown as MapState
  for (const [width, height] of [[1280, 720], [1000, 600], [390, 640], [1920, 540]]) {
    state.map = { naturalWidth: 1280, naturalHeight: 720 }
    state.refreshMapRect(width, height)
    const baseline = { ...state.mapRect }
    for (const density of [2, 4]) {
      state.map = { naturalWidth: 1280 * density, naturalHeight: 720 * density }
      state.refreshMapRect(width, height)
      assert.deepEqual(state.mapRect, baseline)
    }
  }
})

test("the generated background fits its actual aspect ratio while keeping logical actor scale", async (t) => {
  const game = await createGame("你好")
  t.after(() => game.stop())
  const state = game as unknown as MapState
  state.map = { naturalWidth: 1672, naturalHeight: 941 }
  for (const [width, height] of [[1000, 600], [390, 640], [1920, 540]]) {
    state.refreshMapRect(width, height)
    const rect = state.mapRect
    assert.ok(Math.abs(rect.w / rect.h - 1672 / 941) < 1e-12)
    assert.ok(rect.w <= width && rect.h <= height)
    assert.equal(rect.x, (width - rect.w) / 2)
    assert.equal(rect.y, (height - rect.h) / 2)
    assert.equal(rect.scale, rect.w / 1280)
  }
})

test("new background preserves rendered character and vehicle sizes", async (t) => {
  for (const aiVehicle of ["walk", "bike", "car"] as const) {
    const game = await createGame("你好", "pinyin", true, { aiVehicle })
    t.after(() => game.stop())
    const state = game as unknown as MapState
    const spriteSizes: unknown[][] = []
    state.ctx.drawImage = (...args) => {
      if (args.length === 9) spriteSizes.push(args.slice(-2))
    }
    state.map = { naturalWidth: 1280, naturalHeight: 720 }
    state.draw(0)
    const baseline = spriteSizes.splice(0)
    state.map = { naturalWidth: 1672, naturalHeight: 941 }
    state.draw(0)
    assert.equal(baseline.length, 2)
    assert.deepEqual(spriteSizes, baseline)
  }
})

test("one-key passages finish with peak speed recorded before a frame", async () => {
  for (const mode of ["pinyin", "english"] as const) {
    const game = await createGame(mode === "pinyin" ? "啊" : "a", mode)
    assert.equal(game.handleKey(key("a")), true)
    assert.equal(game.typedIndex, 1)
    assert.equal(game.peakCps, 1)
    assert.equal(game.over?.reason, "finished")
    assert.equal(game.over?.winner, "thief")
    assert.equal(game.handleKey(key("a")), false)
    game.stop()
  }
})

test("incorrect input does not advance; pinyin accepts uppercase letters", async () => {
  const game = await createGame("你好！")
  game.handleKey(key("x"))
  assert.equal(game.typedIndex, 0)
  assert.equal(game.missCount, 1)
  for (const character of "NIHAO") game.handleKey(key(character))
  assert.equal(game.typedIndex, 5)
  assert.equal(game.peakCps, 5)
  assert.equal(game.accuracy, 5 / 6)
  assert.equal(game.over?.reason, "finished")
  game.stop()
})

test("English still requires exact case, punctuation and spaces", async () => {
  const game = await createGame("Hi !", "english")
  game.handleKey(key("h"))
  assert.equal(game.typedIndex, 0)
  for (const character of "Hi !") game.handleKey(key(character))
  assert.equal(game.typedIndex, 4)
  assert.equal(game.missCount, 1)
  assert.equal(game.over?.reason, "finished")
  game.stop()
})

test("visual pinyin gaps do not add spaces to the typing target", async () => {
  const game = await createGame("我爱学习")
  for (const character of "wo") game.handleKey(key(character))
  game.handleKey(key(" "))
  assert.equal(game.typedIndex, 2)
  assert.equal(game.missCount, 1)
  for (const character of "aixuexi") game.handleKey(key(character))
  assert.equal(game.typedIndex, 9)
  assert.equal(game.over?.reason, "finished")
  game.stop()
})

test("IME, held keys and shortcuts do not count as typing", async () => {
  const game = await createGame("你")
  for (const overrides of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(game.handleKey(key("n", overrides)), false)
  }
  assert.equal(game.typedIndex, 0)
  assert.equal(game.missCount, 0)
  game.stop()
})

test("input is ignored before boot/start and after stop", async () => {
  const game = await createGame("你", "pinyin", false)
  assert.equal(game.handleKey(key("x")), false)
  assert.equal(game.missCount, 0)
  await game.boot()
  game.startLoop()
  game.handleKey(key("n"))
  game.stop()
  assert.equal(game.handleKey(key("i")), false)
  assert.equal(game.typedIndex, 1)
})

type TestActor = { t: number; dir: 1 | -1; speed: number; animationPhase: number }
type ChaseState = {
  police: TestActor
  thief: TestActor
  ai: TestActor
  player: TestActor
  thiefWaiting: boolean
  lastCorrectAt: number
  step(ts: number): void
}

async function simulateChase(t: TestContext, setup: Partial<Omit<Setup, "passage">> = {}) {
  let now = 10000
  t.mock.method(performance, "now", () => now)
  const game = await createGame("a".repeat(2000), "english", true, { playerRole: "police", ...setup })
  t.after(() => game.stop())
  const state = game as unknown as ChaseState
  const press = (character = "a", overrides = {}) => game.handleKey(key(character, overrides))
  const advance = (ms: number, frameMs = 20) => {
    const end = now + ms
    while (now < end) {
      now = Math.min(end, now + frameMs)
      state.step(now)
    }
  }
  const gap = () => state.police.dir === 1
    ? forwardDist(state.police.t, state.thief.t)
    : forwardDist(state.thief.t, state.police.t)
  const place = (distance: number, policeT = 0.1, dir: 1 | -1 = 1) => {
    state.police.t = policeT
    state.police.dir = dir
    state.thief.t = wrap01(policeT + dir * distance)
    state.thief.dir = dir
  }
  return { game, state, press, advance, gap, place }
}

test("police mode stays still before the first correct key and starts with normal AI speed", async (t) => {
  const sim = await simulateChase(t)
  const initial = sim.state.thief.t
  sim.advance(10000)
  sim.press("x")
  sim.advance(10000)
  assert.equal(sim.game.started, false)
  assert.equal(sim.state.thief.t, initial)
  sim.press()
  sim.advance(20)
  assert.ok(sim.state.thief.t > initial)
  assert.equal(sim.state.ai.speed, 1 / 14)
})

test("idle braking starts after one second and a quarter lap, then decreases smoothly", async (t) => {
  const sim = await simulateChase(t, { aiVehicle: "car" })
  sim.press()
  sim.advance(960)
  sim.place(0.35)
  sim.advance(20)
  assert.equal(sim.state.ai.speed, 1 / 8.5)
  sim.place(0.35)
  sim.advance(20)
  assert.ok(sim.state.ai.speed < 1 / 8.5)
  assert.ok(sim.state.ai.speed > 0)

  sim.state.ai.speed = 1 / 8.5
  sim.place(0.249)
  sim.advance(1)
  assert.equal(sim.state.ai.speed, 1 / 8.5)
  sim.place(0.25)
  sim.advance(1)
  assert.equal(sim.state.ai.speed, 1 / 8.5)
  sim.place(0.251)
  sim.advance(20)
  const onsetSpeed = sim.state.ai.speed
  assert.ok(onsetSpeed < 1 / 8.5)
  assert.ok(onsetSpeed > (1 / 8.5) * 0.99)
  sim.place(0.4)
  sim.advance(100)
  assert.ok(sim.state.ai.speed < onsetSpeed)
})

for (const vehicle of ["walk", "bike", "car"] as const) {
  test(`idle ${vehicle} thief reaches an exact finite stop and waits longer than a lap`, async (t) => {
    const sim = await simulateChase(t, { aiVehicle: vehicle })
    sim.press()
    for (let elapsed = 0; elapsed < 30000 && !sim.state.thiefWaiting; elapsed += 20) {
      sim.advance(20)
      assert.ok(sim.gap() <= 0.5 + 1e-12)
      assert.equal(sim.state.police.dir, 1)
      assert.equal(sim.state.thief.dir, 1)
    }
    assert.equal(sim.state.thiefWaiting, true)
    assert.ok(Math.abs(sim.gap() - 0.5) < 1e-12)
    assert.equal(sim.state.ai.speed, 0)
    assert.equal(sim.game.over, null)
    const stoppedAt = sim.state.thief.t
    const stoppedAnimation = sim.state.thief.animationPhase
    sim.advance(60000)
    assert.equal(sim.state.thief.t, stoppedAt)
    assert.equal(sim.state.thief.animationPhase, stoppedAnimation)
    assert.equal(sim.game.over, null)
  })
}

test("only a new correct key releases waiting; wrong/IME/repeat/shortcut inputs do not", async (t) => {
  const sim = await simulateChase(t, { aiVehicle: "car" })
  sim.press()
  sim.advance(30000)
  const lastCorrect = sim.state.lastCorrectAt
  const stoppedAt = sim.state.thief.t
  for (const overrides of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(sim.press("a", overrides), false)
    sim.advance(20)
    assert.equal(sim.state.thiefWaiting, true)
    assert.equal(sim.state.lastCorrectAt, lastCorrect)
    assert.equal(sim.state.thief.t, stoppedAt)
  }
  assert.equal(sim.press("x"), true)
  sim.advance(20)
  assert.equal(sim.state.thiefWaiting, true)
  assert.equal(sim.state.lastCorrectAt, lastCorrect)
  assert.equal(sim.state.thief.t, stoppedAt)

  sim.press()
  assert.equal(sim.state.thiefWaiting, false)
  // The recent wrong-key penalty briefly prevents police movement. The
  // successful key must stay armed, not require yet another key to resume.
  sim.advance(200)
  assert.notEqual(sim.state.thief.t, stoppedAt)
  assert.ok(sim.gap() <= 0.5 + 1e-12)
})

test("resuming from half a lap accelerates smoothly and slow typing never exceeds the cap", async (t) => {
  const sim = await simulateChase(t, { playerVehicle: "walk", aiVehicle: "car" })
  sim.press()
  sim.advance(30000)
  sim.press()
  sim.advance(20)
  assert.ok(sim.state.ai.speed > 0)
  assert.ok(sim.state.ai.speed < (1 / 8.5) * 0.1)
  for (let elapsed = 0; elapsed < 60000; elapsed += 20) {
    if (elapsed % 800 === 0) sim.press()
    if (elapsed % 4000 === 200) sim.press("x")
    sim.advance(20)
    assert.ok(sim.gap() <= 0.5 + 1e-12, `gap at ${elapsed}ms: ${sim.gap()}`)
    assert.equal(sim.state.police.dir, 1)
    assert.equal(sim.state.thief.dir, 1)
    assert.equal(sim.game.over, null)
  }
  sim.advance(30000)
  assert.equal(sim.state.thiefWaiting, true)
  const before = sim.state.thief.t
  // Even freed space/coasting cannot release an already-latched wait.
  sim.state.police.t = wrap01(sim.state.police.t + 0.02)
  sim.advance(1000)
  assert.equal(sim.state.thief.t, before)
  sim.press()
  sim.advance(20)
  assert.notEqual(sim.state.thief.t, before)
})

test("roundoff at the half-lap boundary does not consume a correct release during an error penalty", async (t) => {
  const sim = await simulateChase(t)
  sim.press()
  sim.advance(30000)
  sim.place(0.5 - 1e-14)
  const before = sim.state.thief.t
  sim.press("x")
  sim.press()
  sim.advance(20)
  assert.equal(sim.state.thiefWaiting, false)
  assert.equal(sim.state.thief.t, before)
  sim.advance(200)
  assert.notEqual(sim.state.thief.t, before)
  assert.ok(sim.gap() <= 0.5 + 1e-12)
})

for (const dir of [1, -1] as const) {
  test(`direction ${dir} keeps a directional half-lap cap across wrapping and large timestamps`, async (t) => {
    const sim = await simulateChase(t, { aiVehicle: "car" })
    sim.press()
    sim.advance(1000)
    sim.place(0.499999, dir === 1 ? 0.9 : 0.1, dir)
    const before = sim.state.thief.t
    sim.advance(600000, 600000)
    assert.equal(sim.state.thiefWaiting, true)
    assert.ok(Math.abs(sim.gap() - 0.5) < 1e-12)
    assert.ok(Math.abs(sim.state.thief.t - before) < 0.001)
    assert.equal(sim.state.thief.dir, dir)
    assert.equal(sim.state.police.dir, dir)
    sim.press()
    for (let i = 0; i < 100; i++) {
      sim.advance(50)
      assert.ok(sim.gap() <= 0.5 + 1e-12)
    }
    assert.equal(sim.game.over, null)
  })
}

test("a fresh round resets the wait latch and keeps normal initial behavior", async (t) => {
  const sim = await simulateChase(t)
  sim.press()
  sim.advance(30000)
  assert.equal(sim.state.thiefWaiting, true)
  sim.game.stop()
  const next = await createGame("aaaa", "english", true, { playerRole: "police" })
  t.after(() => next.stop())
  const state = next as unknown as ChaseState
  assert.equal(state.thiefWaiting, false)
  assert.equal(next.started, false)
  assert.equal(next.typedIndex, 0)
  assert.ok(Math.abs(forwardDist(state.police.t, state.thief.t) - 0.045) < 1e-12)
  assert.equal(state.ai.speed, 1 / 14)
})

test("police still catch the thief rather than wrapping or reversing when crossing it", async (t) => {
  const sim = await simulateChase(t, { playerVehicle: "car", aiVehicle: "walk" })
  sim.press()
  sim.advance(1000)
  sim.state.thiefWaiting = true
  sim.state.ai.speed = 0
  sim.place(0.001)
  for (let i = 0; i < 8; i++) sim.press()
  sim.advance(50)
  assert.equal(sim.game.over?.reason, "caught")
  assert.equal(sim.state.thief.dir, 1)
  assert.equal(sim.state.police.dir, 1)
})

test("thief-player mode keeps constant AI movement, catches, and its original behind reversal", async (t) => {
  const sim = await simulateChase(t, { playerRole: "thief", aiVehicle: "car" })
  sim.press()
  sim.place(0.6)
  const before = sim.state.ai.t
  sim.advance(1000)
  assert.equal(sim.state.ai.speed, 1 / 8.5)
  assert.ok(Math.abs(forwardDist(before, sim.state.ai.t) - 1 / 8.5) < 1e-12)
  assert.equal(sim.state.thiefWaiting, false)
  sim.place(0.995)
  sim.advance(20)
  assert.equal(sim.state.police.dir, -1)
  assert.equal(sim.state.thief.dir, -1)
  assert.equal(sim.game.over, null)
  sim.place(0.4, 0.1, -1)
  sim.advance(620)
  sim.place(0.025, 0.1, -1)
  sim.advance(50)
  assert.equal(sim.game.over?.reason, "caught")
})

test("beginner advances per correct key, waits indefinitely and never punishes an error", async () => {
  const game = await createGame("我爱学习中文！", "pinyin", true, { playerRole: "police", difficulty: "beginner" })
  const state = game as any
  assert.equal(game.rounds.length, 2)
  const thiefStart = state.thief.t
  game.handleKey(key("w"))
  const policeAfter = state.police.t
  assert.ok(policeAfter > 0)
  state.step(performance.now() + 120000)
  assert.equal(state.police.t, policeAfter)
  assert.equal(state.thief.t, thiefStart)
  assert.equal(game.over, null)
  game.handleKey(key("z"))
  assert.equal(game.typedIndex, 1)
  assert.equal(state.police.t, policeAfter)
  assert.equal(state.lastErrorAt, 0)
  assert.equal(game.missCount, 1) // Descriptive accuracy, no movement penalty.
  for (const letter of game.text.slice(1, game.roundEnd)) game.handleKey(key(letter))
  assert.equal(game.waitingForNextRound, true)
  assert.equal(game.typedIndex, "woaixuexi".length)
  assert.equal(state.police.t, state.thief.t)
  assert.equal(game.handleKey(key("z")), false)
  const typed = game.typedIndex
  game.continueRound()
  assert.equal(game.roundNumber, 2)
  assert.equal(game.waitingForNextRound, false)
  assert.equal(game.typedIndex, typed)
  for (const letter of game.text.slice(typed)) game.handleKey(key(letter))
  assert.deepEqual(game.over, { winner: "police", reason: "caught" })
  assert.equal(game.typedIndex, game.text.length)
  game.continueRound()
  assert.equal(game.roundNumber, 2)
  game.stop()
})

test("one-character beginner round succeeds and a new game starts fresh", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const game = await createGame("绿。", "pinyin", true, { playerRole: "police", difficulty: "beginner" })
    assert.equal(game.roundNumber, 1)
    assert.equal(game.typedIndex, 0)
    game.handleKey(key("l"))
    assert.equal(game.over, null)
    game.handleKey(key("v"))
    assert.equal(game.over?.winner, "police")
    assert.equal(game.waitingForNextRound, false)
    game.stop()
  }
})

test("practice slows AI and avoids error slowdown, other roles/modes remain challenge", async () => {
  const game = await createGame("我爱学习中文", "pinyin", true, { playerRole: "police", difficulty: "practice" })
  const state = game as any
  assert.equal(game.difficulty, "practice")
  assert.ok(Math.abs(state.ai.speed - (1 / 14) * .35) < 1e-12)
  game.handleKey(key("w"))
  state.player.speed = .02
  game.handleKey(key("z"))
  assert.equal(state.player.speed, .02)
  assert.equal(state.lastErrorAt, 0)
  game.stop()
  for (const setup of [{ playerRole: "thief" as const }, { playerRole: "police" as const }]) {
    const other = await createGame("hello", setup.playerRole === "police" ? "english" : "pinyin", true, { ...setup, difficulty: "beginner" })
    assert.equal(other.difficulty, "challenge")
    other.stop()
  }
})
