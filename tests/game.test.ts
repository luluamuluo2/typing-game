import assert from "node:assert/strict"
import test from "node:test"
import { ChaseGame } from "../src/game.ts"
import { preparePassage } from "../src/practice.ts"

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

async function createGame(source: string, mode: "pinyin" | "english" = "pinyin", boot = true) {
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
  const game = new ChaseGame(canvas, { playerRole: "thief", playerVehicle: "bike", aiVehicle: "bike", passage: result.passage })
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
