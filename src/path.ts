type Pt = { x: number; y: number }

/** Closed winding circuit on the large city map (0–1), CCW from south of the fountain. */
const WAYPOINTS: [number, number][] = [
  [0.2823, 0.7858],
  [0.1994, 0.7608],
  [0.1298, 0.6815],
  [0.093, 0.5633],
  [0.0797, 0.4798],
  [0.1142, 0.4214],
  [0.1697, 0.3686],
  [0.251, 0.3046],
  [0.3479, 0.2295],
  [0.4371, 0.1613],
  [0.4996, 0.1182],
  [0.6388, 0.0793],
  [0.7357, 0.1599],
  [0.7952, 0.2281],
  [0.8593, 0.3018],
  [0.9116, 0.3644],
  [0.9414, 0.4298],
  [0.9101, 0.5396],
  [0.8686, 0.6259],
  [0.7803, 0.7399],
  [0.6802, 0.8095],
  [0.5848, 0.879],
  [0.4801, 0.9096],
  [0.3698, 0.8776],
]

const pts: Pt[] = WAYPOINTS.map(([x, y]) => ({ x, y }))
const n = pts.length

function at(i: number): Pt {
  return pts[((i % n) + n) % n]
}

function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t
  const t3 = t2 * t
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  }
}

const SUB = 14
const SAMPLES: Pt[] = []
for (let i = 0; i < n; i++) {
  for (let s = 0; s < SUB; s++) {
    SAMPLES.push(catmull(at(i - 1), at(i), at(i + 1), at(i + 2), s / SUB))
  }
}

const CUMLEN: number[] = [0]
for (let i = 1; i <= SAMPLES.length; i++) {
  const a = SAMPLES[i - 1]
  const b = SAMPLES[i % SAMPLES.length]
  CUMLEN.push(CUMLEN[i - 1] + Math.hypot(b.x - a.x, b.y - a.y))
}
const TOTAL = CUMLEN[CUMLEN.length - 1]

function sampleAtLength(len: number): { pos: Pt; tan: Pt } {
  const target = ((len % TOTAL) + TOTAL) % TOTAL
  let lo = 0
  let hi = CUMLEN.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (CUMLEN[mid] < target) lo = mid + 1
    else hi = mid
  }
  const i = Math.max(1, lo)
  const a = CUMLEN[i - 1]
  const b = CUMLEN[i]
  const u = (target - a) / Math.max(1e-6, b - a)
  const p0 = SAMPLES[i - 1]
  const p1 = SAMPLES[i % SAMPLES.length]
  return {
    pos: { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u },
    tan: { x: p1.x - p0.x, y: p1.y - p0.y },
  }
}

export function pathAt(t: number): { x: number; y: number; dx: number; dy: number } {
  const { pos, tan } = sampleAtLength(t * TOTAL)
  const len = Math.hypot(tan.x, tan.y) || 1
  return { x: pos.x, y: pos.y, dx: tan.x / len, dy: tan.y / len }
}

export function wrap01(t: number): number {
  return ((t % 1) + 1) % 1
}

export function forwardDist(from: number, to: number): number {
  return wrap01(to - from)
}

export function shortestDist(a: number, b: number): number {
  const d = Math.abs(wrap01(a) - wrap01(b))
  return Math.min(d, 1 - d)
}

export function debugSamples(): Pt[] {
  return SAMPLES
}
