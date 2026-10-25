import assert from "node:assert/strict"
import test from "node:test"
import { ARTICLES } from "../src/articles.ts"
import { activeUnitIndex, isCompositionKey, MAX_SOURCE_LENGTH, preparePassage } from "../src/practice.ts"

function passage(text: string, mode: "pinyin" | "english" = "pinyin") {
  const result = preparePassage(text, mode)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error(result.error)
  return result.passage
}

test("short Chinese input produces a playable no-tone target", () => {
  assert.equal(passage("你好").target, "nihao")
  assert.equal(passage("一").target, "yi")
})

test("whole sentences resolve contextual polyphones", () => {
  assert.equal(passage("重庆银行行长重新出发。").target, "chongqingyinhanghangzhangchongxinchufa")
  assert.equal(passage("我喜欢音乐，也喜欢快乐地行走。").target, "woxihuanyinyueyexihuankuailedixingzou")
})

test("ü uses the keyboard letter v", () => {
  assert.equal(passage("女儿去旅行，绿树略微摇动。").target, "nverqulvxinglvshulveweiyaodong")
})

test("punctuation and whitespace remain in the source but not the target", () => {
  const result = passage("  你好，\r\n世界！  ")
  assert.equal(result.source, "你好， 世界！")
  assert.equal(result.target, "nihaoshijie")
  assert.equal(result.units.map((unit) => unit.source).join(""), result.source)
})

test("ASCII letters are lowercased and digits kept", () => {
  assert.equal(passage("我学 ABC，2026！").target, "woxueabc2026")
})

test("every key maps to the correct source unit, including punctuation boundaries", () => {
  const result = passage("，你好！学 A1。")
  let offset = 0
  for (const [index, unit] of result.units.entries()) {
    assert.equal(unit.start, offset)
    for (let key = unit.start; key < unit.end; key += 1) {
      assert.equal(activeUnitIndex(result, key), index)
    }
    offset += unit.target.length
    assert.equal(unit.end, offset)
  }
  assert.equal(offset, result.target.length)
  assert.equal(activeUnitIndex(result, result.target.length), -1)
})

test("empty and punctuation-only passages fail explicitly", () => {
  for (const source of ["", " \n\t ", "，。！？", "... --"]) {
    assert.deepEqual(preparePassage(source, "pinyin"), { ok: false, error: "empty" })
  }
})

test("unknown Han, emoji and other non-keyboard text are not silently dropped", () => {
  for (const source of ["你好𠮷", "你好㐀", "你好😊", "你好é", "你好Ａ", "你好\u200b"]) {
    const result = preparePassage(source, "pinyin")
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, "unsupported")
  }
})

test("length is bounded and the boundary remains playable", () => {
  assert.equal(passage("你".repeat(MAX_SOURCE_LENGTH)).units.length, MAX_SOURCE_LENGTH)
  assert.deepEqual(preparePassage("你".repeat(MAX_SOURCE_LENGTH + 1), "pinyin"), { ok: false, error: "tooLong" })
})

test("English mode keeps exact case, spaces and punctuation", () => {
  assert.equal(passage("Hi, A1!", "english").target, "Hi, A1!")
  assert.equal(preparePassage("你好", "english").ok, false)
  assert.equal(passage("A", "english").target, "A")
})

test("all built-in passages are valid in their declared mode", () => {
  for (const article of ARTICLES) assert.equal(preparePassage(article.text, article.mode).ok, true, article.id)
})

test("composition keys are detected without filtering normal input", () => {
  for (const event of [{ isComposing: true }, { keyCode: 229 }, { key: "Process" }]) {
    assert.equal(isCompositionKey(event as KeyboardEvent), true)
  }
  assert.equal(isCompositionKey({ key: "n", keyCode: 78, isComposing: false } as KeyboardEvent), false)
})
