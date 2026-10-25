import { pinyin } from "pinyin-pro"
import { normalizeArticle } from "./articles.ts"

export type PracticeMode = "pinyin" | "english"

export type PracticeUnit = {
  source: string
  target: string
  start: number
  end: number
}

export type PracticePassage = {
  mode: PracticeMode
  source: string
  target: string
  units: PracticeUnit[]
}

export type PracticeError = "empty" | "tooLong" | "unsupported"
export type PracticeResult =
  | { ok: true; passage: PracticePassage }
  | { ok: false; error: PracticeError; characters?: string }

export const MAX_SOURCE_LENGTH = 2000

export function preparePassage(raw: string, mode: PracticeMode): PracticeResult {
  const source = normalizeArticle(raw)
  if (!source) return { ok: false, error: "empty" }
  if (source.length > MAX_SOURCE_LENGTH) return { ok: false, error: "tooLong" }

  if (mode === "english") {
    const unsupported = [...source].filter((character) => !/^[\x20-\x7e]$/.test(character))
    if (unsupported.length) return unsupportedResult(unsupported)
    return { ok: true, passage: { mode, source, target: source, units: [] } }
  }

  const units: PracticeUnit[] = []
  const unsupported: string[] = []
  let target = ""
  // Convert the entire sentence once, so the dictionary can resolve words such
  // as 银行 / 行走 in context. Never convert each character independently.
  for (const item of pinyin(source, { type: "all", toneType: "none", v: true })) {
    let keys = ""
    if (item.isZh) {
      keys = item.pinyin.toLowerCase()
      if (!/^[a-z]+$/.test(keys)) unsupported.push(item.origin)
    } else if (/^[a-z0-9]$/i.test(item.origin)) {
      keys = item.origin.toLowerCase()
    } else if (!/^[\s\p{P}]+$/u.test(item.origin)) {
      // Unknown Han, emoji and other scripts must not silently disappear.
      unsupported.push(item.origin)
    }
    const start = target.length
    target += keys
    units.push({ source: item.origin, target: keys, start, end: target.length })
  }
  if (unsupported.length) return unsupportedResult(unsupported)
  if (!target) return { ok: false, error: "empty" }
  return { ok: true, passage: { mode, source, target, units } }
}

function unsupportedResult(characters: string[]): PracticeResult {
  return {
    ok: false,
    error: "unsupported",
    characters: [...new Set(characters)].slice(0, 6).join(" "),
  }
}

export function activeUnitIndex(passage: PracticePassage, typedIndex: number): number {
  return passage.units.findIndex((unit) => unit.end > typedIndex && unit.target.length > 0)
}

export function isCompositionKey(event: KeyboardEvent): boolean {
  // keyCode 229 covers browsers that omit isComposing at composition boundaries.
  return event.isComposing || event.keyCode === 229 || event.key === "Process"
}
