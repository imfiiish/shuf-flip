// 全部 tag（固定集合，顺序即卡片上的展示顺序）
export const ALL_TAGS = [
  '义务教育',
  '必修',
  '选择性必修',
  'CET4',
  'CET6',
  'Oxford3000',
  'Oxford5000',
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
] as const

// TagPicker 分组
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

const ORDER: readonly string[] = ALL_TAGS

export function tagRank(tag: string): number {
  const i = ORDER.indexOf(tag)
  return i === -1 ? ORDER.length : i
}

/** tag 展示名（现为原名；保留此函数便于以后加前缀处理） */
export function tagLabel(tag: string): string {
  return tag
}
