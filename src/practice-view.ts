import { activeUnitIndex, type PracticePassage } from "./practice.ts"

export type PinyinGuide = {
  update: (typedIndex: number, finished?: boolean) => void
  setHintsVisible: (visible: boolean) => void
}

// Keep each source character and its whole syllable in one wrapping item.
// These visual boundaries never become part of the game's continuous target.
export function createPinyinGuide(line: HTMLElement, passage: PracticePassage): PinyinGuide {
  line.replaceChildren()
  const items = passage.units.map((unit) => {
    const root = document.createElement("span")
    root.className = "practice-unit"
    const source = document.createElement("span")
    source.className = "practice-source"
    source.textContent = unit.source
    const syllable = document.createElement("span")
    syllable.className = "practice-syllable"
    const keys = [...unit.target].map((letter) => {
      const key = document.createElement("span")
      key.className = "pinyin-key todo"
      key.textContent = letter
      syllable.append(key)
      return key
    })
    root.append(source, syllable)
    line.append(root)
    return { root, source, syllable, keys }
  })

  let hintsVisible = true
  const updateVisibility = () => {
    for (const item of items) {
      for (const key of item.keys) {
        key.setAttribute("aria-hidden", String(!hintsVisible && !key.classList.contains("done")))
      }
    }
  }

  return {
    update(typedIndex, finished = false) {
      const active = activeUnitIndex(passage, typedIndex)
      for (const [index, item] of items.entries()) {
        const unit = passage.units[index]
        item.source.classList.toggle("done", unit.end <= typedIndex)
        item.source.classList.toggle("current", index === active)
        item.root.classList.toggle("active", index === active)
        if (index === active) item.source.setAttribute("aria-current", "true")
        else item.source.removeAttribute("aria-current")
        for (const [offset, key] of item.keys.entries()) {
          const position = unit.start + offset
          key.classList.toggle("done", position < typedIndex)
          key.classList.toggle("cur", position === typedIndex)
          key.classList.toggle("todo", position > typedIndex)
          key.classList.toggle("blink", position === typedIndex && !finished)
        }
      }
      updateVisibility()
      // Scroll the paired rows together, never through the middle of a syllable.
      const current = items[active]?.root
      if (current) {
        const top = current.offsetTop
        const bottom = top + current.offsetHeight
        if (top < line.scrollTop) line.scrollTop = top
        else if (bottom > line.scrollTop + line.clientHeight) line.scrollTop = bottom - line.clientHeight
      }
    },
    setHintsVisible(visible) {
      line.classList.toggle("pinyin-hidden", !visible)
      hintsVisible = visible
      updateVisibility()
    },
  }
}
