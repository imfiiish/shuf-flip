// Tag 分组（固定集合；组内顺序即卡片/选择器上的展示顺序）
export const TAG_GROUPS: { label: string; tags: string[] }[] = [
  {
    label: '国内升学',
    tags: ['义务教育', '必修', '选择性必修', 'CET4', 'CET6'],
  },
  {
    label: '出国留学',
    tags: ['Oxford3000', 'Oxford5000', 'A1', 'A2', 'B1', 'B2', 'C1'],
  },
]

/** 全部 tag（由 TAG_GROUPS 汇总，顺序一致） */
export const ALL_TAGS: string[] = TAG_GROUPS.flatMap((g) => g.tags)

export function tagRank(tag: string): number {
  const i = ALL_TAGS.indexOf(tag)
  return i === -1 ? ALL_TAGS.length : i
}
