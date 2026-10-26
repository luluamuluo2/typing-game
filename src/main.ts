import "./style.css"
import { initLan } from "./lan.ts"
import { preloadImages } from "./assets.ts"
import { gameAudio } from "./audio.ts"
import { ARTICLES } from "./articles.ts"
import { ChaseGame, GAME_IMAGE_URLS, VEHICLE_OPTIONS, type Role, type Vehicle } from "./game.ts"
import { applyDocumentLocale, t } from "./i18n.ts"
import { isCompositionKey, preparePassage, type PracticeMode } from "./practice.ts"
import { createPinyinGuide, type PinyinGuide } from "./practice-view.ts"
import {
  copyPoster,
  downloadPoster,
  posterBlob,
  rankFor,
  renderPoster,
  type MatchResult,
  type Rank,
} from "./share.ts"

import { DIFFICULTY_KEY, parseDifficulty, type Difficulty } from "./difficulty.ts"

type Screen = "title" | "setup" | "play" | "result"

type PersonalBest = {
  fastestTime: number | null
  peakCps: number
  accuracy: number
  fewestMistakes: number
}

type RecordMetric = keyof PersonalBest

const PERSONAL_BESTS_KEY = "speed-chase.personal-bests.v1"
const INITIAL_IMAGE_URLS = [
  ...GAME_IMAGE_URLS,
  "/logo.png",
  "/assets/police-idle.png",
  "/assets/thief-idle.png",
  ...VEHICLE_OPTIONS.map((option) => option.img),
  "/assets/result-caught-fx.webp",
  "/assets/result-escaped-fx.webp",
  "/assets/result-badge-win.webp",
  "/assets/result-badge-loss.webp",
  "/assets/new-record.webp",
  "/assets/ranks/rank-bronze.png?v=2",
  "/assets/ranks/rank-silver.png?v=2",
  "/assets/ranks/rank-gold.png?v=2",
  "/assets/ranks/rank-diamond.png?v=2",
  "/assets/ranks/rank-king.png?v=2",
]

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

applyDocumentLocale()

const screens: Record<Screen, HTMLElement> = {
  title: $("screen-title"),
  setup: $("screen-setup"),
  play: $("screen-play"),
  result: $("screen-result"),
}
const loadingScreen = $("screen-loading")

let role: Role = "police"
let playerVehicle: Vehicle = "bike"
let aiVehicle: Vehicle = "bike"
let mode: PracticeMode = "pinyin"
let articleId = ARTICLES[0].id
let difficulty: Difficulty = "beginner"
try { difficulty = parseDifficulty(localStorage.getItem(DIFFICULTY_KEY)) } catch { /* Storage is optional. */ }
let showPinyin = false
let lanActive = false
let composing = false
let pinyinGuide: PinyinGuide | null = null
const modeDrafts: Record<PracticeMode, { articleId: string; custom: string }> = {
  pinyin: { articleId: ARTICLES[0].id, custom: "" },
  english: { articleId: "matches", custom: "" },
}
let game: ChaseGame | null = null
let lastMatchResult: MatchResult | null = null
let lastRank: Rank | null = null
let lastPosterBlob: Blob | null = null
let lastSetup: {
  role: Role
  playerVehicle: Vehicle
  aiVehicle: Vehicle
  articleId: string
  custom: string
  mode: PracticeMode
  difficulty: Difficulty
} = { role, playerVehicle, aiVehicle, articleId, custom: "", mode, difficulty }

const customText = () => $<HTMLTextAreaElement>("custom-text")

function show(name: Screen) {
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", k !== name)
  }
}

async function prepareApp() {
  const bar = $("loading-bar")
  const percent = $("loading-percent")
  const progress = loadingScreen.querySelector<HTMLElement>("[role='progressbar']")!
  const retry = $<HTMLButtonElement>("btn-loading-retry")
  retry.classList.add("hidden")
  $("loading-status").textContent = t("loading.status")

  const minimumDisplay = new Promise((resolve) => window.setTimeout(resolve, 350))
  const loading = preloadImages(INITIAL_IMAGE_URLS, (loaded, total) => {
    const value = total === 0 ? 100 : Math.round((loaded / total) * 100)
    bar.style.width = `${value}%`
    percent.textContent = `${value}%`
    progress.setAttribute("aria-valuenow", String(value))
  })
  const [failed] = await Promise.all([loading, minimumDisplay])

  if (failed.length > 0) {
    $("loading-status").textContent = t("loading.failed")
    retry.classList.remove("hidden")
    return
  }

  loadingScreen.classList.add("is-ready")
  window.setTimeout(() => {
    loadingScreen.classList.add("hidden")
    show("title")
  }, 220)
}

function vehicleButtons(root: HTMLElement, selected: Vehicle, onPick: (v: Vehicle) => void) {
  root.innerHTML = ""
  for (const opt of VEHICLE_OPTIONS) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `pick veh${opt.id === selected ? " on" : ""}`
    btn.innerHTML = `<img src="${opt.img}" alt="" /><span>${t(opt.labelKey)}</span><small>${t(opt.hintKey)}</small>`
    btn.addEventListener("click", () => {
      onPick(opt.id)
      vehicleButtons(root, opt.id, onPick)
    })
    root.append(btn)
  }
}

function renderArticles() {
  const box = $("article-list")
  box.innerHTML = ""
  for (const a of ARTICLES.filter((article) => article.mode === mode)) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `article${a.id === articleId ? " on" : ""}`
    btn.innerHTML = `<b>${a.title}</b><small>${t(a.noteKey)} · ${a.text.length} ${t("article.characters")}</small>`
    btn.addEventListener("click", () => {
      articleId = a.id
      customText().value = ""
      renderArticles()
      renderPracticePreview()
    })
    box.append(btn)
  }
}

function currentPassage() {
  const source = articleId === "custom"
    ? customText().value
    : ARTICLES.find((article) => article.id === articleId && article.mode === mode)?.text ?? ""
  return preparePassage(source, mode)
}

function renderDifficulty() {
  const available = mode === "pinyin" && role === "police"
  const select = $<HTMLSelectElement>("difficulty")
  select.value = difficulty
  select.disabled = !available
  $("difficulty-description").textContent = available
    ? `${t(`difficulty.${difficulty}Desc`)} ${t("difficulty.hintSetting")}` : t("difficulty.unavailable")
  $("setup-hint").textContent = available ? t(`difficulty.${difficulty}Desc`) : t("setup.hint")
}

function renderPracticePreview() {
  renderDifficulty()
  const result = currentPassage()
  const error = $("practice-error")
  error.textContent = result.ok ? "" : `${t(`practice.error.${result.error}`)}${result.characters ? ` ${result.characters}` : ""}`
  customText().setAttribute("aria-invalid", String(!result.ok && articleId === "custom"))
  $("practice-preview").textContent = result.ok
    ? result.passage.units.map((unit) => unit.target).filter(Boolean).join(" ")
    : ""
  $("practice-preview-wrap").classList.toggle("hidden", mode !== "pinyin" || !result.ok)
  $("practice-rules").textContent = t(mode === "pinyin" ? "practice.pinyinRules" : "practice.englishRules")
  customText().placeholder = t(mode === "pinyin" ? "setup.customPlaceholder" : "setup.englishPlaceholder")
}

function renderSource(g: ChaseGame) {
  const passage = g.setup.passage
  pinyinGuide = createPinyinGuide($("source-line"), passage)
  $("pinyin-guide").classList.toggle("hidden", passage.mode !== "pinyin")
  updateHintVisibility(g)
}

function updateHintVisibility(g: ChaseGame) {
  const button = $("btn-pinyin-hint")
  button.textContent = t(showPinyin ? "practice.hideHint" : "practice.showHint")
  button.setAttribute("aria-pressed", String(showPinyin))
  pinyinGuide?.setHintsVisible(showPinyin)
  // Pinyin lives only in the aligned guide. The original strip is English-only.
  $("type-line").classList.toggle("hidden", g.setup.passage.mode === "pinyin")
}

function renderSourceProgress(g: ChaseGame) {
  if (g.setup.passage.mode !== "pinyin") return
  $("round-progress").classList.toggle("hidden", !g.beginner)
  $("round-progress").textContent = `${t("difficulty.round")} ${g.roundNumber} / ${g.rounds.length}`
  $("round-complete").classList.toggle("hidden", !g.waitingForNextRound)
  // Keep all typed content for review, but only show the current short task ahead.
  for (const [index, element] of [...$("source-line").children].entries()) {
    const unit = g.setup.passage.units[index]
    element.classList.toggle("hidden", g.beginner && unit.start >= g.roundEnd && unit.target.length > 0)
  }
  pinyinGuide?.update(g.typedIndex, Boolean(g.over) || g.waitingForNextRound)
  $("typing-progress").textContent = `${g.typedIndex} / ${g.text.length} ${t("practice.keys")}`
}

function renderTypeLine(g: ChaseGame) {
  $("type-bar").style.width = `${(g.typedIndex / Math.max(1, g.text.length)) * 100}%`
  const line = $("type-line")
  if (g.setup.passage.mode === "pinyin") {
    line.replaceChildren()
    return
  }
  const text = g.text
  const i = g.typedIndex
  const before = text.slice(Math.max(0, i - 18), i)
  const current = text[i] ?? ""
  const after = text.slice(i + 1, i + 52)
  const show = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/ /g, '<span class="sp">·</span>')
  line.innerHTML = `<span class="done">${show(before)}</span><span class="cur${g.over ? "" : " blink"}">${current === " " ? "·" : show(current)}</span><span class="todo">${show(after)}</span>`
}

function hudStats(g: ChaseGame) {
  $("hud-cps").textContent = String(g.cps)
  $("hud-vehicle").textContent = g.vehicleLabel
  $("hud-acc").textContent = `${Math.round(g.accuracy * 100)}%`
  $("hud-time").textContent = g.elapsed.toFixed(1)
}

function hud(g: ChaseGame) {
  hudStats(g)
  renderTypeLine(g)
  renderSourceProgress(g)
}

async function startMatch() {
  const result = currentPassage()
  renderPracticePreview()
  if (!result.ok) {
    customText().focus()
    return
  }
  leavePlay()
  lastSetup = { role, playerVehicle, aiVehicle, articleId, custom: customText().value, mode, difficulty }
  show("play")
  const canvas = $<HTMLCanvasElement>("map-canvas")
  const g = new ChaseGame(canvas, { playerRole: role, playerVehicle, aiVehicle, passage: result.passage, difficulty })
  game = g
  screens.play.classList.toggle("beginner-mode", g.beginner)
  renderSource(g)
  renderTypeLine(g)
  renderSourceProgress(g)
  $("type-hint").textContent = t("loading.status")
  g.onChange = () => hud(g)
  g.onTick = () => hudStats(g)
  g.onEnd = (winner, reason) => {
    gameAudio.finishMatch(reason)
    hud(g)
    openResult(g, winner, reason)
  }
  try {
    await g.boot()
    // Escape, Quit, or another match can invalidate an in-flight boot.
    if (game !== g) return
    gameAudio.startMatch()
    g.startLoop()
    hud(g)
    g.resize()
    screens.play.focus({ preventScroll: true })
    $("type-hint").textContent = t(g.beginner ? "difficulty.beginnerHint" : "play.ready")
    window.addEventListener("resize", onResize)
  } catch (error) {
    if (game !== g) return
    console.error(error)
    leavePlay()
    show("setup")
    $("practice-error").textContent = t("loading.failed")
  }
}

function onResize() {
  game?.resize()
  if (game) renderSourceProgress(game)
}

function passageRecordKey(g: ChaseGame) {
  let hash = 2166136261
  const passage = g.setup.passage
  // Keep existing English records and isolate Chinese passages that share pinyin.
  const identity = passage.mode === "pinyin" ? `${passage.source}\0${passage.target}` : g.text
  for (let i = 0; i < identity.length; i += 1) {
    hash ^= identity.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${g.difficulty === "challenge" ? "" : `${g.difficulty}:`}${passage.mode === "pinyin" ? "pinyin:" : ""}${g.setup.playerRole}:${(hash >>> 0).toString(36)}`
}

function readPersonalBests(): Record<string, PersonalBest> {
  try {
    const value = localStorage.getItem(PERSONAL_BESTS_KEY)
    return value ? (JSON.parse(value) as Record<string, PersonalBest>) : {}
  } catch {
    return {}
  }
}

function updatePersonalBest(g: ChaseGame, won: boolean) {
  const records = readPersonalBests()
  const key = passageRecordKey(g)
  const previous = records[key]
  const current: PersonalBest = {
    fastestTime: won ? g.elapsed : null,
    peakCps: g.peakCps,
    accuracy: g.accuracy,
    fewestMistakes: g.missCount,
  }

  if (!previous) {
    records[key] = current
    try {
      localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(records))
    } catch {
      // The result page still works when storage is unavailable.
    }
    return { best: current, broken: new Set<RecordMetric>() }
  }

  const best: PersonalBest = { ...previous }
  const broken = new Set<RecordMetric>()
  if (current.fastestTime !== null) {
    if (best.fastestTime === null) {
      best.fastestTime = current.fastestTime
    } else if (current.fastestTime < best.fastestTime - 0.05) {
      best.fastestTime = current.fastestTime
      broken.add("fastestTime")
    }
  }
  if (current.peakCps > best.peakCps) {
    best.peakCps = current.peakCps
    broken.add("peakCps")
  }
  if (current.accuracy > best.accuracy + 0.0005) {
    best.accuracy = current.accuracy
    broken.add("accuracy")
  }
  if (current.fewestMistakes < best.fewestMistakes) {
    best.fewestMistakes = current.fewestMistakes
    broken.add("fewestMistakes")
  }

  records[key] = best
  try {
    localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(records))
  } catch {
    // The in-memory result can still be displayed for this match.
  }
  return { best, broken }
}

function renderResultStats(g: ChaseGame, won: boolean) {
  const { best, broken } = updatePersonalBest(g, won)
  const newIcon = (metric: RecordMetric) =>
    broken.has(metric)
      ? `<img class="new-record-icon" src="/assets/new-record.webp" alt="${t("result.newRecordAlt")}" />`
      : ""
  const bestLabel = (value: string) => `<small>${t("result.personalBest")} ${value}</small>`

  $("result-stats").innerHTML = `
    <li class="${broken.has("fastestTime") ? "is-record" : ""}">
      ${newIcon("fastestTime")}<span>${t("result.elapsed")}</span><b>${g.elapsed.toFixed(1)}s</b>
      ${bestLabel(best.fastestTime === null ? "--" : `${best.fastestTime.toFixed(1)}s`)}
    </li>
    <li class="${broken.has("peakCps") ? "is-record" : ""}">
      ${newIcon("peakCps")}<span>${t("result.peakSpeed")}</span><b>${g.peakCps} ${t("hud.keysPerSecond")}</b>
      ${bestLabel(`${best.peakCps} ${t("hud.keysPerSecond")}`)}
    </li>
    <li class="${broken.has("accuracy") ? "is-record" : ""}">
      ${newIcon("accuracy")}<span>${t("result.accuracy")}</span><b>${Math.round(g.accuracy * 100)}%</b>
      ${bestLabel(`${Math.round(best.accuracy * 100)}%`)}
    </li>
    <li class="${broken.has("fewestMistakes") ? "is-record" : ""}">
      ${newIcon("fewestMistakes")}<span>${t("result.mistakes")}</span><b>${g.missCount}</b>
      ${bestLabel(String(best.fewestMistakes))}
    </li>
  `
}

function openResult(g: ChaseGame, winner: Role, reason: "caught" | "finished") {
  const youWin = winner === g.setup.playerRole
  screens.result.dataset.outcome = reason
  const badge = $<HTMLImageElement>("result-badge")
  badge.src = youWin ? "/assets/result-badge-win.webp" : "/assets/result-badge-loss.webp"
  badge.alt = youWin ? t("result.badgeWin") : t("result.badgeLoss")
  $("result-kicker").textContent = youWin ? t("result.win") : t("result.loss")
  if (reason === "caught") {
    $("result-title").textContent = youWin ? t("result.caughtWin") : t("result.caughtLoss")
    $("result-desc").textContent = t("result.caughtDescription")
  } else {
    $("result-title").textContent = youWin ? t("result.escapedWin") : t("result.escapedLoss")
    $("result-desc").textContent = t("result.escapedDescription")
  }
  if (g.beginner) $("result-desc").textContent = t("difficulty.allDone")
  renderResultStats(g, youWin)
  lastMatchResult = {
    won: youWin,
    outcomeTitle: $("result-title").textContent ?? "",
    elapsed: g.elapsed,
    peakCps: g.peakCps,
    accuracy: g.accuracy,
    mistakes: g.missCount,
    role: t(g.setup.playerRole === "police" ? "role.police" : "role.thief"),
    outcome: reason,
  }
  lastRank = rankFor(lastMatchResult)
  lastPosterBlob = null
  $<HTMLImageElement>("result-rank-icon").src = lastRank.icon
  $<HTMLImageElement>("result-rank-icon").alt = lastRank.name
  $("result-rank-name").textContent = lastRank.name
  $("result-rank-name").style.color = lastRank.color
  $("result-rank-tagline").textContent = lastRank.tagline
  show("result")
}

function closePoster() {
  const dialog = $<HTMLDialogElement>("poster-dialog")
  if (dialog.open) dialog.close()
}

async function openPoster() {
  if (!lastMatchResult || !lastRank) return
  const dialog = $<HTMLDialogElement>("poster-dialog")
  const status = $("poster-status")
  const copy = $<HTMLButtonElement>("btn-poster-copy")
  const download = $<HTMLButtonElement>("btn-poster-download")
  if (!dialog.open) dialog.showModal()
  copy.disabled = true
  download.disabled = true
  status.textContent = t("share.preparing")
  try {
    const canvas = $<HTMLCanvasElement>("poster-canvas")
    await renderPoster(canvas, lastMatchResult, lastRank)
    lastPosterBlob = await posterBlob(canvas)
    const canCopyImage = Boolean(navigator.clipboard && typeof ClipboardItem !== "undefined")
    copy.disabled = !canCopyImage
    download.disabled = false
    status.textContent = canCopyImage ? "" : t("share.copyUnsupported")
  } catch (error) {
    console.error(error)
    status.textContent = t("share.failed")
  }
}

function leavePlay() {
  game?.stop()
  gameAudio.stopMatch()
  game = null
  composing = false
  window.removeEventListener("resize", onResize)
}

$("btn-single").addEventListener("click", () => show("setup"))
$("btn-loading-retry").addEventListener("click", () => {
  void prepareApp()
})
$("btn-back-title").addEventListener("click", () => show("title"))
$("btn-start").addEventListener("click", () => {
  void startMatch()
})
$("btn-giveup").addEventListener("click", () => {
  leavePlay()
  show("setup")
})
$("btn-again").addEventListener("click", () => {
  closePoster()
  leavePlay()
  role = lastSetup.role
  playerVehicle = lastSetup.playerVehicle
  aiVehicle = lastSetup.aiVehicle
  articleId = lastSetup.articleId
  mode = lastSetup.mode
  difficulty = lastSetup.difficulty
  customText().value = lastSetup.custom
  void startMatch()
})
$("btn-to-setup").addEventListener("click", () => {
  closePoster()
  leavePlay()
  show("setup")
})
$("btn-poster").addEventListener("click", () => {
  void openPoster()
})
$("btn-poster-close").addEventListener("click", closePoster)
$("poster-dialog").addEventListener("click", (event) => {
  if (event.target === $("poster-dialog")) closePoster()
})
$("btn-poster-download").addEventListener("click", () => {
  if (!lastPosterBlob) return
  downloadPoster(lastPosterBlob)
  $("poster-status").textContent = t("share.downloaded")
})
$("btn-poster-copy").addEventListener("click", async () => {
  if (!lastPosterBlob) return
  try {
    await copyPoster(lastPosterBlob)
    $("poster-status").textContent = t("share.copied")
  } catch (error) {
    console.error(error)
    $("poster-status").textContent = t("share.copyFailed")
  }
})

$("role-picks").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-role]")
  if (!btn) return
  role = btn.dataset.role as Role
  renderDifficulty()
  for (const el of $("role-picks").querySelectorAll(".pick")) {
    el.classList.toggle("on", el === btn)
  }
})

customText().addEventListener("input", () => {
  articleId = "custom"
  for (const el of $("article-list").querySelectorAll(".article")) el.classList.remove("on")
  renderPracticePreview()
})

$("practice-mode").addEventListener("change", () => {
  modeDrafts[mode] = { articleId, custom: customText().value }
  mode = $<HTMLSelectElement>("practice-mode").value as PracticeMode
  articleId = modeDrafts[mode].articleId
  customText().value = modeDrafts[mode].custom
  renderArticles()
  renderPracticePreview()
})

$("difficulty").addEventListener("change", () => {
  difficulty = parseDifficulty($<HTMLSelectElement>("difficulty").value)
  try { localStorage.setItem(DIFFICULTY_KEY, difficulty) } catch { /* Storage is optional. */ }
  renderDifficulty()
})

$("btn-next-round").addEventListener("click", () => {
  game?.continueRound()
  screens.play.focus({ preventScroll: true })
})

$("btn-pinyin-hint").addEventListener("click", () => {
  showPinyin = !showPinyin
  if (game) {
    updateHintVisibility(game)
    game.resize()
  }
})

window.addEventListener("compositionstart", () => { composing = true })
window.addEventListener("compositionend", () => { composing = false })

window.addEventListener("keydown", (e) => {
  if (lanActive || screens.play.classList.contains("hidden") || !game) return
  if (composing || isCompositionKey(e)) {
    $("type-hint").textContent = t("title.inputHint")
    return
  }
  if (e.key === "Escape") {
    leavePlay()
    show("setup")
    return
  }
  if ((e.key === " " || e.key === "Enter") && e.target instanceof HTMLElement && e.target.closest("button")) return
  const previousIndex = game.typedIndex
  const handled = game.handleKey(e)
  if (handled && game.typedIndex > previousIndex) gameAudio.playKey()
  if (handled) {
    if (game.difficulty !== "challenge") {
      $("type-hint").textContent = t(game.typedIndex === previousIndex ? "difficulty.retry"
        : game.beginner ? "difficulty.beginnerHint" : "difficulty.practiceDesc")
      return
    }
    $("type-hint").textContent = game.started
      ? t(role === "police" ? "play.policeHint" : "play.thiefHint")
      : t("play.ready")
  }
})

vehicleButtons($("player-vehicle"), playerVehicle, (v) => {
  playerVehicle = v
})
vehicleButtons($("ai-vehicle"), aiVehicle, (v) => {
  aiVehicle = v
})
renderArticles()
renderPracticePreview()
initLan(() => {
  lanActive = true
  leavePlay()
  for (const screen of Object.values(screens)) screen.classList.add("hidden")
}, () => {
  lanActive = false
  show("title")
})
void prepareApp()
