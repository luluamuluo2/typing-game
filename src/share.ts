import { locale, t, type MessageKey } from "./i18n.ts"

export type MatchResult = {
  won: boolean
  outcomeTitle: string
  elapsed: number
  peakCps: number
  accuracy: number
  mistakes: number
  role: string
  outcome: "caught" | "finished"
}

export type Rank = {
  id: "bronze" | "silver" | "gold" | "diamond" | "king"
  name: string
  tagline: string
  icon: string
  color: string
}

export const SHARE_DOMAIN = "typingchase.com"
export const SHARE_URL = `https://${SHARE_DOMAIN}`

const RANKS: Omit<Rank, "name" | "tagline">[] = [
  { id: "bronze", icon: "/assets/ranks/rank-bronze.png?v=2", color: "#c47a45" },
  { id: "silver", icon: "/assets/ranks/rank-silver.png?v=2", color: "#d8e2ea" },
  { id: "gold", icon: "/assets/ranks/rank-gold.png?v=2", color: "#f5c84b" },
  { id: "diamond", icon: "/assets/ranks/rank-diamond.png?v=2", color: "#73e2f2" },
  { id: "king", icon: "/assets/ranks/rank-king.png?v=2", color: "#ffcf65" },
]

export function rankFor(result: MatchResult): Rank {
  const score =
    result.peakCps * 12 + result.accuracy * 32 + (result.won ? 8 : 0) - Math.min(20, result.mistakes * 2)
  const index = score >= 112 ? 4 : score >= 95 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0
  const base = RANKS[index]
  return {
    ...base,
    name: t(`rank.${base.id}` as MessageKey),
    tagline: t(`rank.${base.id}Tagline` as MessageKey),
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load ${src}`))
    image.src = src
  })
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (image.naturalWidth - sourceWidth) / 2
  const sourceY = (image.naturalHeight - sourceHeight) / 2
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  value: string,
) {
  ctx.fillStyle = "#f2c14e"
  ctx.fillRect(x, y + 4, 5, 84)
  ctx.fillStyle = "rgba(255,246,227,0.55)"
  ctx.font = '24px "PingFang SC", "Noto Sans SC", sans-serif'
  ctx.fillText(label, x + 26, y + 28)
  ctx.fillStyle = "#fff6e3"
  ctx.font = '800 42px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(value, x + 26, y + 80)
}

export async function renderPoster(canvas: HTMLCanvasElement, result: MatchResult, rank: Rank) {
  const width = 1080
  const height = 1440
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")

  const scenePath = result.outcome === "caught" ? "/assets/result-caught-fx.webp" : "/assets/result-escaped-fx.webp"
  const [scene, icon] = await Promise.all([loadImage(scenePath), loadImage(rank.icon)])
  ctx.fillStyle = "#0b0a09"
  ctx.fillRect(0, 0, width, height)
  drawCover(ctx, scene, width, 700)

  const shade = ctx.createLinearGradient(0, 0, 0, 700)
  shade.addColorStop(0, "rgba(8,8,8,0.48)")
  shade.addColorStop(0.62, "rgba(10,9,8,0.66)")
  shade.addColorStop(1, "rgba(11,10,9,1)")
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, width, 700)
  ctx.fillStyle = "#0b0a09"
  ctx.fillRect(0, 680, width, height - 680)

  ctx.fillStyle = "#f2c14e"
  ctx.fillRect(0, 0, width, 12)
  ctx.textAlign = "left"
  ctx.fillStyle = "#fff6e3"
  ctx.font = '900 38px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(t("brand.name"), 72, 88)
  ctx.textAlign = "right"
  ctx.fillStyle = "rgba(255,246,227,0.62)"
  ctx.font = '24px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(t("share.posterKicker"), width - 72, 84)

  ctx.textAlign = "left"
  ctx.fillStyle = result.won ? "#f2c14e" : "#fff6e3"
  ctx.font = '900 80px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(result.outcomeTitle, 72, 202)
  ctx.fillStyle = "rgba(255,246,227,0.72)"
  ctx.font = '28px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(result.role, 76, 248)

  ctx.shadowColor = "rgba(0,0,0,0.45)"
  ctx.shadowBlur = 28
  drawContain(ctx, icon, 310, 270, 460, 460)
  ctx.shadowBlur = 0

  ctx.textAlign = "center"
  ctx.fillStyle = rank.color
  ctx.font = '900 56px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(rank.name, width / 2, 788)
  ctx.fillStyle = "rgba(255,246,227,0.7)"
  ctx.font = '27px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(rank.tagline, width / 2, 832)

  ctx.fillStyle = "rgba(242,193,78,0.24)"
  ctx.fillRect(72, 872, width - 144, 2)
  ctx.fillRect(72, 1030, width - 144, 2)
  ctx.fillRect(width / 2, 900, 2, 250)

  ctx.textAlign = "left"
  drawStat(ctx, 106, 910, t("result.peakSpeed"), `${result.peakCps} ${t("hud.keysPerSecond")}`)
  drawStat(ctx, 584, 910, t("result.accuracy"), `${Math.round(result.accuracy * 100)}%`)
  drawStat(ctx, 106, 1060, t("result.elapsed"), `${result.elapsed.toFixed(1)}s`)
  drawStat(ctx, 584, 1060, t("result.mistakes"), String(result.mistakes))

  ctx.textAlign = "center"
  ctx.fillStyle = "#fff6e3"
  ctx.font = '900 40px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(t("share.challenge"), width / 2, 1252)
  ctx.fillStyle = "#f2c14e"
  ctx.font = '800 35px "Trebuchet MS", sans-serif'
  ctx.fillText(SHARE_DOMAIN, width / 2, 1314)
  ctx.fillStyle = "rgba(255,246,227,0.42)"
  ctx.font = '22px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(locale === "zh-CN" ? "在线英文打字追逐游戏" : "ONLINE TYPING PURSUIT", width / 2, 1370)
}

export function posterBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Poster export failed"))), "image/png")
  })
}

export function downloadPoster(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `speed-chase-${Date.now()}.png`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function sharePoster(blob: Blob, result: MatchResult) {
  const file = new File([blob], "speed-chase-result.png", { type: "image/png" })
  const shareData: ShareData = {
    title: `${t("brand.name")} · ${result.outcomeTitle}`,
    text: t("share.challenge"),
    url: SHARE_URL,
    files: [file],
  }
  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    await navigator.share(shareData)
    return true
  }
  downloadPoster(blob)
  return false
}
