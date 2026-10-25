import assert from "node:assert/strict"
import test from "node:test"
import { parseDifficulty, roundEnds } from "../src/difficulty.ts"
import { preparePassage } from "../src/practice.ts"

test("stored difficulty accepts only known presets and safely defaults to beginner", () => {
  for (const value of [null, "", "broken", "beginner"]) assert.equal(parseDifficulty(value), "beginner")
  assert.equal(parseDifficulty("practice"), "practice")
  assert.equal(parseDifficulty("challenge"), "challenge")
})
test("rounds preserve context, punctuation, full syllables and a shorter final chunk", () => {
  const result = preparePassage("银行，女儿。学习吧！", "pinyin")
  assert.ok(result.ok)
  const ends = roundEnds(result.passage)
  assert.deepEqual(ends, ["yinhangnver".length, result.passage.target.length])
  assert.equal(result.passage.target.slice(0, ends[0]), "yinhangnver")
  assert.equal(result.passage.target.slice(ends[0]), "xuexiba")
})
