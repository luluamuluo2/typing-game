import { t, type MessageKey } from "./i18n.ts"
import { loadImage } from "./assets.ts"

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

export async function renderPoster(canvas: HTMLCanvasElement, result: MatchResult, rank: Rank) {
  const width = 1080
  const height = 1920
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")

  const scenePath = result.outcome === "caught" ? "/assets/result-caught-fx.webp" : "/assets/result-escaped-fx.webp"
  const [background, scene, icon] = await Promise.all([
    loadImage("/assets/map.jpg"),
    loadImage(scenePath),
    loadImage(rank.icon),
  ])

  drawCover(ctx, background, width, height)
  const shade = ctx.createLinearGradient(0, 0, 0, height)
  shade.addColorStop(0, "rgba(8,8,8,0.46)")
  shade.addColorStop(0.5, "rgba(8,8,8,0.58)")
  shade.addColorStop(1, "rgba(8,8,8,0.9)")
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = "#f2c14e"
  ctx.fillRect(0, 0, width, 12)

  ctx.shadowColor = "rgba(0,0,0,0.45)"
  ctx.shadowBlur = 32
  drawContain(ctx, scene, 32, 120, width - 64, 790)
  ctx.shadowBlur = 0

  const lowerShade = ctx.createLinearGradient(0, 760, 0, 1440)
  lowerShade.addColorStop(0, "rgba(8,8,8,0)")
  lowerShade.addColorStop(0.42, "rgba(8,8,8,0.78)")
  lowerShade.addColorStop(1, "rgba(8,8,8,0.3)")
  ctx.fillStyle = lowerShade
  ctx.fillRect(0, 760, width, 680)

  ctx.shadowColor = "rgba(0,0,0,0.56)"
  ctx.shadowBlur = 36
  drawContain(ctx, icon, 285, 760, 510, 480)
  ctx.shadowBlur = 0

  const labelWidth = 560
  const labelHeight = 104
  const labelX = (width - labelWidth) / 2
  const labelY = 1250
  ctx.fillStyle = "rgba(8,8,8,0.78)"
  ctx.fillRect(labelX, labelY, labelWidth, labelHeight)
  ctx.strokeStyle = rank.color
  ctx.lineWidth = 3
  ctx.strokeRect(labelX, labelY, labelWidth, labelHeight)
  ctx.textAlign = "center"
  ctx.fillStyle = rank.color
  ctx.font = '900 48px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(rank.name, width / 2, labelY + 69)

  ctx.textAlign = "center"
  ctx.fillStyle = "#fff6e3"
  ctx.font = '900 46px "Trebuchet MS", "PingFang SC", sans-serif'
  ctx.fillText(t("share.challenge"), width / 2, 1518)
  ctx.fillStyle = "#f2c14e"
  ctx.font = '900 68px "Trebuchet MS", sans-serif'
  ctx.fillText(SHARE_DOMAIN, width / 2, 1620)

  ctx.fillStyle = "rgba(242,193,78,0.72)"
  ctx.fillRect(320, 1682, width - 640, 3)
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

export async function copyPoster(blob: Blob) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is unavailable")
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
}
