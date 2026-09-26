// Tag 分组（固定集合；组内顺序即卡片/选择器上的展示顺序）。
//
// 分组按「界面语言」列出（不是学习方向）：
//   中文界面 → 小初高 / 大学 / 牛津·CEFR / HSK·粤语
//   English 界面 → HSK / 牛津·CEFR
// 每个 tag 归属一种词库（lang）与可选口音（accent），据此决定学习方向与发音。
//
// 每个 tag 分「展示名 label」与「底层过滤值 values」：
//   - 展示名可自由润色（CET4 → CET·四级、义务教育 → 小学&初中）
//   - 一个展示名可对应多个底层 tag（必修 + 选择性必修 → 高中）
// 词库/数据库里存的是底层 values，界面只认 label；过滤仍按 values 走。
import type { Accent, ContentLang, Lang } from './i18n'

export type TagDef = {
  /** 展示名（选择器 chip / 卡片背面看到的） */
  label: string
  /** 实际用于过滤的底层 tag 值（一个展示名可对应多个） */
  values: string[]
  /** 归属词库：决定学习方向 */
  lang: ContentLang
  /** 中文发音口音（仅 zh 有意义） */
  accent?: Accent
}

export type TagGroup = { label: string; tags: TagDef[] }

/** 英文词库的 tag */
const en = (label: string, values: string[] = [label]): TagDef => ({
  label,
  values,
  lang: 'en',
})

/** 中文词库的 tag（默认普通话，可指定粤语） */
const zh = (
  label: string,
  values: string[] = [label],
  accent: Accent = 'cn',
): TagDef => ({ label, values, lang: 'zh', accent })

const HSK = (accent: Accent): TagDef[] =>
  [
    'HSK1',
    'HSK2',
    'HSK3',
    'HSK4',
    'HSK5',
    'HSK6',
    'HSK7-9',
  ].map((label) => zh(label, [label], accent))

const CEFR: TagDef[] = ['A1', 'A2', 'B1', 'B2', 'C1'].map((label) => en(label))

export const TAG_GROUPS: Record<Lang, TagGroup[]> = {
  // 中文界面：学英文（小初高/大学/牛津·CEFR）+ 学粤语中文（HSK·粤语）
  zh: [
    {
      label: '小初高',
      tags: [en('小学&初中', ['义务教育']), en('高中', ['必修', '选择性必修'])],
    },
    {
      label: '大学',
      tags: [en('CET·四级', ['CET4']), en('CET·六级', ['CET6'])],
    },
    { label: '牛津·CEFR', tags: CEFR },
    { label: 'HSK·粤语', tags: HSK('hk') },
  ],
  // English 界面：学中文（HSK，普通话）+ 学英文（牛津·CEFR）
  en: [
    { label: 'HSK', tags: HSK('cn') },
    { label: '牛津·CEFR', tags: CEFR },
  ],
}

/** 某界面语言的 tag 分组 */
export function tagGroupsFor(lang: Lang): TagGroup[] {
  return TAG_GROUPS[lang]
}

/** 某界面语言的全部 tag 定义 */
export function tagDefsFor(lang: Lang): TagDef[] {
  return TAG_GROUPS[lang].flatMap((g) => g.tags)
}

/** 全部 tag 定义（跨界面汇总，用于展示名与排序） */
const ALL_DEFS: TagDef[] = Object.values(TAG_GROUPS)
  .flat()
  .flatMap((g) => g.tags)

/** 词库里仍存在、但界面不再展示的底层 tag */
const HIDDEN_TAGS = new Set(['Oxford3000', 'Oxford5000'])

/** 底层 tag 值 → 展示名（未知值原样返回） */
export function tagLabel(value: string): string {
  return ALL_DEFS.find((d) => d.values.includes(value))?.label ?? value
}

/** 底层 tag 值在固定顺序里的位次（未知值排最后） */
export function tagRank(value: string): number {
  const i = ALL_DEFS.findIndex((d) => d.values.includes(value))
  return i === -1 ? ALL_DEFS.length : i
}

/** 一组底层 tag 值 → 展示名：按固定顺序排序并去重（合并的 tag 只留一个） */
export function displayTags(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of [...values].sort((a, b) => tagRank(a) - tagRank(b))) {
    if (HIDDEN_TAGS.has(v)) continue
    const label = tagLabel(v)
    if (!seen.has(label)) {
      seen.add(label)
      out.push(label)
    }
  }
  return out
}
