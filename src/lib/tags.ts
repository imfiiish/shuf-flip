// Tag 分组（固定集合；组内顺序即卡片/选择器上的展示顺序）。
//
// 分组随「学习内容语言」走，两种语言的 tag 不混：
//   en（中文界面学英文）→ 国内升学 / 出国留学
//   zh（英文界面学中文）→ 只有 HSK 组，列各等级
//
// 分组名与 tag 值都按原文展示，不随语言翻译。
import type { ContentLang } from './i18n'

export const TAG_GROUPS: Record<
  ContentLang,
  { label: string; tags: string[] }[]
> = {
  en: [
    {
      label: '国内升学',
      tags: ['义务教育', '必修', '选择性必修', 'CET4', 'CET6'],
    },
    {
      label: '出国留学',
      tags: ['Oxford3000', 'Oxford5000', 'A1', 'A2', 'B1', 'B2', 'C1'],
    },
  ],
  zh: [
    {
      label: 'HSK',
      tags: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9'],
    },
  ],
}

/** 某学习方向的 tag 分组 */
export function tagGroupsFor(lang: ContentLang): { label: string; tags: string[] }[] {
  return TAG_GROUPS[lang]
}

/** 某学习方向的全部 tag */
export function tagsFor(lang: ContentLang): string[] {
  return TAG_GROUPS[lang].flatMap((g) => g.tags)
}

/** 全部 tag（跨语言汇总，用于 tagRank 的稳定排序） */
export const ALL_TAGS: string[] = Object.values(TAG_GROUPS)
  .flat()
  .flatMap((g) => g.tags)

export function tagRank(tag: string): number {
  const i = ALL_TAGS.indexOf(tag)
  return i === -1 ? ALL_TAGS.length : i
}
