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
