import { words } from '../data/words'

// tags 展示顺序（CEFR.A1/A2/B1/B2/C1/C2 都归到 CEFR；未列出的排最后）
const TAG_ORDER = [
  '初中',
  '高中',
  'CET4',
  'CET6',
  '考研',
  'IELTS',
  'TOEFL',
  'TEM4',
  'TEM8',
  'CEFR',
  'SAT',
  'GRE',
  'GMAT',
  'BEC',
] as const

export function tagRank(tag: string): number {
  const i = TAG_ORDER.findIndex((t) => tag === t || tag.startsWith(`${t}.`))
  return i === -1 ? TAG_ORDER.length : i
}

/** 词库里出现过的所有 tag（去重），按展示顺序排列 */
export function allTags(): string[] {
  const set = new Set<string>()
  words.forEach((w) => w.tags.forEach((t) => set.add(t)))
  return [...set].sort((a, b) => {
    const d = tagRank(a) - tagRank(b)
    return d !== 0 ? d : a.localeCompare(b)
  })
}
