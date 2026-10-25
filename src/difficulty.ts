import type { PracticePassage } from "./practice.ts"

export type Difficulty = "beginner" | "practice" | "challenge"
export const DIFFICULTY_KEY = "speed-chase.difficulty.v1"
export function parseDifficulty(value: string | null): Difficulty {
  return value === "practice" || value === "challenge" ? value : "beginner"
}

// Count only input-bearing characters, never split a syllable or lose punctuation.
export function roundEnds(passage: PracticePassage, size = 4): number[] {
  const units = passage.units.filter(unit => unit.target.length > 0)
  const ends: number[] = []
  for (let i = size - 1; i < units.length; i += size) ends.push(units[i].end)
  if (ends.at(-1) !== passage.target.length) ends.push(passage.target.length)
  return ends
}
