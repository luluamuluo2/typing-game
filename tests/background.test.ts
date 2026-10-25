import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { MAP_IMAGE_URL } from "../src/assets.ts"
import { GAME_IMAGE_URLS } from "../src/game.ts"

test("the new background is the original 1672 by 941 PNG asset", () => {
  const image = readFileSync(new URL(`../public${MAP_IMAGE_URL}`, import.meta.url))
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(image.toString("ascii", 12, 16), "IHDR")
  assert.equal(image.readUInt32BE(16), 1672)
  assert.equal(image.readUInt32BE(20), 941)
})

test("game preloading, menus and share posters consistently use the new background", () => {
  assert.ok(GAME_IMAGE_URLS.includes(MAP_IMAGE_URL))
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
  assert.equal(css.split(`url("${MAP_IMAGE_URL}")`).length - 1, 3)
  const share = readFileSync(new URL("../src/share.ts", import.meta.url), "utf8")
  assert.match(share, /loadImage\(MAP_IMAGE_URL\)/)
  for (const path of ["game.ts", "share.ts", "style.css"]) {
    const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8")
    assert.ok(!source.includes("/assets/map.jpg"), `${path} still uses the old background`)
  }
})
