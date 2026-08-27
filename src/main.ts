import { init as initShareon } from "shareon"
import "shareon/css"
import "./style.css"
import { gameAudio } from "./audio.ts"
import { ARTICLES, normalizeArticle } from "./articles.ts"
import { ChaseGame, VEHICLE_OPTIONS, type Role, type Vehicle } from "./game.ts"
import { applyDocumentLocale, t } from "./i18n.ts"
import {
  downloadPoster,
  posterBlob,
  rankFor,
  renderPoster,
  SHARE_URL,
  sharePoster,
  type MatchResult,
  type Rank,
} from "./share.ts"

type Screen = "title" | "setup" | "play" | "result"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

applyDocumentLocale()

const screens: Record<Screen, HTMLElement> = {
  title: $("screen-title"),
  setup: $("screen-setup"),
  play: $("screen-play"),
  result: $("screen-result"),
}

let role: Role = "police"
let playerVehicle: Vehicle = "car"
let aiVehicle: Vehicle = "bike"
let articleId = ARTICLES[1].id
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
} = { role, playerVehicle, aiVehicle, articleId, custom: "" }

const customText = () => $<HTMLTextAreaElement>("custom-text")

function show(name: Screen) {
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", k !== name)
  }
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
  for (const a of ARTICLES) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `article${a.id === articleId ? " on" : ""}`
    btn.innerHTML = `<b>${a.title}</b><small>${t(a.noteKey)} · ${a.text.length} ${t("article.characters")}</small>`
    btn.addEventListener("click", () => {
      articleId = a.id
      customText().value = ""
      renderArticles()
    })
    box.append(btn)
  }
}

function currentText(): string {
  const custom = normalizeArticle(customText().value)
  if (custom.length >= 8) return custom
  return ARTICLES.find((a) => a.id === articleId)?.text ?? ARTICLES[0].text
}

function renderTypeLine(g: ChaseGame) {
  const line = $("type-line")
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
  const bar = $("type-bar")
  bar.style.width = `${(i / Math.max(1, text.length)) * 100}%`
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
}

async function startMatch() {
  game?.stop()
  gameAudio.startMatch()
  const text = currentText()
  lastSetup = {
    role,
    playerVehicle,
    aiVehicle,
    articleId,
    custom: customText().value,
  }
  show("play")
  const canvas = $<HTMLCanvasElement>("map-canvas")
  const g = new ChaseGame(canvas, {
    playerRole: role,
    playerVehicle,
    aiVehicle,
    text,
  })
  game = g
  g.onChange = () => hud(g)
  g.onTick = () => hudStats(g)
  g.onEnd = (winner, reason) => {
    gameAudio.finishMatch(reason)
    hud(g)
    openResult(g, winner, reason)
  }
  await g.boot()
  g.startLoop()
  hud(g)
  g.resize()
  $("type-hint").textContent =
    role === "police" ? t("play.policeHint") : t("play.thiefHint")
  window.addEventListener("resize", onResize)
}

function onResize() {
  game?.resize()
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
  $("result-stats").innerHTML = `
    <li><span>${t("result.elapsed")}</span><b>${g.elapsed.toFixed(1)}s</b></li>
    <li><span>${t("result.peakSpeed")}</span><b>${g.peakCps} ${t("hud.keysPerSecond")}</b></li>
    <li><span>${t("result.accuracy")}</span><b>${Math.round(g.accuracy * 100)}%</b></li>
    <li><span>${t("result.mistakes")}</span><b>${g.missCount}</b></li>
  `
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
  const share = $<HTMLButtonElement>("btn-poster-share")
  const download = $<HTMLButtonElement>("btn-poster-download")
  if (!dialog.open) dialog.showModal()
  share.disabled = true
  download.disabled = true
  status.textContent = t("share.preparing")
  try {
    const canvas = $<HTMLCanvasElement>("poster-canvas")
    await renderPoster(canvas, lastMatchResult, lastRank)
    lastPosterBlob = await posterBlob(canvas)
    share.disabled = false
    download.disabled = false
    status.textContent = ""
  } catch (error) {
    console.error(error)
    status.textContent = t("share.failed")
  }
}

function leavePlay() {
  game?.stop()
  gameAudio.stopMatch()
  game = null
  window.removeEventListener("resize", onResize)
}

$("btn-single").addEventListener("click", () => show("setup"))
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
$("btn-poster-share").addEventListener("click", async () => {
  if (!lastPosterBlob || !lastMatchResult) return
  try {
    const shared = await sharePoster(lastPosterBlob, lastMatchResult)
    $("poster-status").textContent = t(shared ? "share.shared" : "share.downloaded")
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return
    console.error(error)
    $("poster-status").textContent = t("share.failed")
  }
})

$("role-picks").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-role]")
  if (!btn) return
  role = btn.dataset.role as Role
  for (const el of $("role-picks").querySelectorAll(".pick")) {
    el.classList.toggle("on", el === btn)
  }
})

customText().addEventListener("input", () => {
  if (normalizeArticle(customText().value).length >= 8) {
    articleId = "custom"
    for (const el of $("article-list").querySelectorAll(".article")) el.classList.remove("on")
  }
})

window.addEventListener("keydown", (e) => {
  if (screens.play.classList.contains("hidden") || !game) return
  if (e.key === "Escape") {
    leavePlay()
    show("setup")
    return
  }
  const previousIndex = game.typedIndex
  const handled = game.handleKey(e)
  if (handled && game.typedIndex > previousIndex) gameAudio.playKey()
  hud(game)
})

vehicleButtons($("player-vehicle"), playerVehicle, (v) => {
  playerVehicle = v
})
vehicleButtons($("ai-vehicle"), aiVehicle, (v) => {
  aiVehicle = v
})
const shareonLinks = $("shareon-links")
shareonLinks.dataset.url = SHARE_URL
shareonLinks.dataset.title = t("brand.name")
shareonLinks.dataset.text = t("share.challenge")
initShareon()
renderArticles()
show("title")
