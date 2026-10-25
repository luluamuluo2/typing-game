import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { createPinyinGuide } from "../src/practice-view.ts"
import { preparePassage } from "../src/practice.ts"

// Minimal DOM checks for the guide's structure/state. This does not substitute
// for visual verification in a real browser.
class Element {
  children: Element[] = []
  className = ""
  textContent = ""
  attributes = new Map<string, string>()
  scrollTop = 0
  clientHeight = 180
  offsetTop = 0
  offsetHeight = 80
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
    toggle: (name: string, enabled: boolean) => {
      const classes = new Set(this.className.split(" ").filter(Boolean))
      if (enabled) classes.add(name)
      else classes.delete(name)
      this.className = [...classes].join(" ")
    },
  }
  append(...children: Element[]) { this.children.push(...children) }
  replaceChildren() { this.children = [] }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  removeAttribute(name: string) { this.attributes.delete(name) }
}

Object.assign(globalThis, { document: { createElement: () => new Element() } })

function fixture(source: string) {
  const result = preparePassage(source, "pinyin")
  if (!result.ok) throw new Error(result.error)
  const line = new Element()
  const guide = createPinyinGuide(line as unknown as HTMLElement, result.passage)
  const sources = () => line.children.map((item) => item.children[0])
  const syllables = () => line.children.map((item) => item.children[1])
  const letters = () => syllables().flatMap((item) => item.children)
  return { passage: result.passage, line, guide, sources, syllables, letters }
}

test("each whole syllable shares an atomic wrapping item with its source character", () => {
  const { passage, line, sources, syllables } = fixture("我爱学习")
  assert.equal(line.children.length, 4)
  assert.deepEqual(sources().map((item) => item.textContent), ["我", "爱", "学", "习"])
  assert.deepEqual(syllables().map((item) => item.children.map((key) => key.textContent).join("")), ["wo", "ai", "xue", "xi"])
  assert.equal(passage.target, "woaixuexi")
  for (const item of line.children) assert.equal(item.className, "practice-unit")
})

test("the current Chinese character and exact key remain synchronized within a syllable", () => {
  const { guide, sources, letters } = fixture("我爱学习")
  guide.update(5)
  assert.equal(sources()[2].attributes.get("aria-current"), "true")
  assert.equal(sources()[2].classList.contains("current"), true)
  assert.equal(sources()[0].classList.contains("done"), true)
  assert.equal(letters()[4].classList.contains("done"), true)
  assert.equal(letters()[5].classList.contains("cur"), true)
  assert.equal(letters()[5].classList.contains("blink"), true)
  assert.equal(letters()[6].classList.contains("todo"), true)
  guide.update(7)
  assert.equal(sources()[2].attributes.has("aria-current"), false)
  assert.equal(sources()[3].attributes.get("aria-current"), "true")
  assert.equal(letters().filter((letter) => letter.classList.contains("cur")).length, 1)
})

test("punctuation, whitespace, contextual polyphones and v keep their original key mapping", () => {
  const { passage, guide, sources, syllables, letters } = fixture("银行，女儿 A1！")
  assert.equal(sources().map((item) => item.textContent).join(""), passage.source)
  assert.equal(letters().map((item) => item.textContent).join(""), "yinhangnvera1")
  assert.equal(syllables()[2].children.length, 0)
  guide.update(7)
  assert.equal(sources()[3].textContent, "女")
  assert.equal(sources()[3].classList.contains("current"), true)
  assert.equal(letters()[7].textContent, "n")
  assert.equal(letters()[7].classList.contains("cur"), true)
})

test("repeated hint toggles hide only untyped letters without losing progress or rebuilding units", () => {
  const { guide, line, letters } = fixture("你好，世界！")
  const originalItems = [...line.children]
  guide.update(3)
  for (let toggle = 0; toggle < 3; toggle += 1) {
    guide.setHintsVisible(false)
    assert.equal(line.classList.contains("pinyin-hidden"), true)
    assert.ok(letters().every((item) => item.attributes.get("aria-hidden") === String(!item.classList.contains("done"))))
    guide.update(4)
    guide.setHintsVisible(true)
    assert.equal(line.classList.contains("pinyin-hidden"), false)
    assert.ok(letters().every((item) => item.attributes.get("aria-hidden") === "false"))
    assert.equal(letters()[4].classList.contains("cur"), true)
    assert.deepEqual(line.children, originalItems)
  }
})

test("scrolling follows the complete character–syllable pair, including after resize", () => {
  const { guide, line } = fixture("我爱学习")
  line.children[2].offsetTop = 180
  guide.update(5)
  assert.equal(line.scrollTop, 80)
  line.clientHeight = 100
  guide.update(5)
  assert.equal(line.scrollTop, 160)
  guide.update(0)
  assert.equal(line.scrollTop, 0)
})

test("completion clears the active key and replay starts from the first unit", () => {
  const { passage, guide, sources, letters } = fixture("你好！")
  guide.update(1, true)
  assert.equal(letters()[1].classList.contains("blink"), false)
  guide.update(passage.target.length, true)
  assert.ok(sources().every((item) => item.classList.contains("done")))
  assert.ok(letters().every((item) => item.classList.contains("done")))
  assert.ok(letters().every((item) => !item.classList.contains("cur")))
  guide.update(0)
  assert.equal(sources()[0].attributes.get("aria-current"), "true")
  assert.equal(letters()[0].classList.contains("cur"), true)
  assert.equal(letters()[1].classList.contains("todo"), true)
})

test("rebuilding for English removes all previous pinyin guide contents", () => {
  const { line } = fixture("你好")
  const result = preparePassage("Hi !", "english")
  if (!result.ok) throw new Error(result.error)
  createPinyinGuide(line as unknown as HTMLElement, result.passage)
  assert.equal(line.children.length, 0)
  assert.equal(result.passage.target, "Hi !")
})

test("layout preserves complete syllables and hint hiding does not collapse their width", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
  assert.match(css, /\.source-line\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*gap: 8px 12px;/)
  assert.match(css, /\.practice-unit\s*\{[^}]*flex: 0 0 auto;[^}]*flex-direction: column;[^}]*white-space: nowrap;/)
  assert.match(css, /\.pinyin-hidden \.pinyin-key:not\(\.done\)\s*\{\s*visibility: hidden;/)
})


test("hidden hints reveal partial and completed input, then clear it on replay", () => {
  const { passage, guide, letters } = fixture("你好")
  guide.setHintsVisible(false)
  const visible = () => letters().filter((key) => key.attributes.get("aria-hidden") === "false").map((key) => key.textContent).join("")
  assert.equal(visible(), "")
  guide.update(1)
  assert.equal(visible(), "n")
  guide.update(2)
  assert.equal(visible(), "ni")
  guide.update(3)
  assert.equal(visible(), "nih")
  guide.update(passage.target.length, true)
  assert.equal(visible(), "nihao")
  guide.update(0)
  assert.equal(visible(), "")
})

test("future characters are subdued but hidden hints never reveal untyped letters", () => {
  const { guide, line, letters } = fixture("我爱学习")
  guide.setHintsVisible(false)
  guide.update(1)
  assert.equal(line.children[0].classList.contains("active"), true)
  assert.equal(line.children[1].classList.contains("future"), true)
  assert.equal(letters()[0].attributes.get("aria-hidden"), "false")
  assert.equal(letters()[1].attributes.get("aria-hidden"), "true")
  guide.setHintsVisible(true)
  guide.setHintsVisible(false)
  assert.equal(letters()[1].attributes.get("aria-hidden"), "true")
})
