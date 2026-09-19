import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import type { TagFilter, TagMode } from '../../lib/filter'
import { loadFilter, matchesFilter, sameFilter } from '../../lib/filter'
import { CEFR_PREFIX, allTags, tagLabel } from '../../lib/tags'
import { words } from '../../data/words'

const TAGS = allTags()

// tag 分组（按国内备考习惯）。CEFR 自动归组，未列出的进「其他」
const GROUP_DEFS: { label: string; tags: string[] }[] = [
  { label: '中学', tags: ['初中', '高中'] },
  { label: '大学', tags: ['CET4', 'CET6', '考研'] },
  { label: '留学', tags: ['IELTS', 'TOEFL', 'SAT', 'GRE', 'GMAT'] },
  { label: '专业', tags: ['TEM4', 'TEM8', 'BEC'] },
]

const GROUPS = (() => {
  const used = new Set<string>()
  const groups = GROUP_DEFS.map(({ label, tags }) => {
    const list = tags.filter((t) => TAGS.includes(t))
    list.forEach((t) => used.add(t))
    return { label, tags: list }
  }).filter((g) => g.tags.length > 0)

  const cefr = TAGS.filter((t) => t.startsWith(CEFR_PREFIX))
  if (cefr.length) groups.push({ label: 'CEFR', tags: cefr })

  const rest = TAGS.filter((t) => !used.has(t) && !t.startsWith(CEFR_PREFIX))
  if (rest.length) groups.push({ label: '其他', tags: rest })

  return groups
})()

// 点击循环：不选 → 包含 → 排除 → 不选
function nextMode(m: TagMode | undefined): TagMode | undefined {
  if (m === 'include') return 'exclude'
  if (m === 'exclude') return undefined
  return 'include'
}

type Props = {
  onClose: () => void
  onConfirm: (filter: TagFilter) => void
  /** 已有的词书筛选条件，用于查重 */
  existing: TagFilter[]
}

/** `/` 页弹出的 tag 选择窗口 */
export default function TagPicker({ onClose, onConfirm, existing }: Props) {
  // 初始状态从上次保存的选择恢复
  const [modes, setModes] = useState<Record<string, TagMode>>(() => {
    const f = loadFilter()
    const m: Record<string, TagMode> = {}
    f.include.forEach((t) => (m[t] = 'include'))
    f.exclude.forEach((t) => (m[t] = 'exclude'))
    return m
  })

  const filter = useMemo<TagFilter>(() => {
    const include: string[] = []
    const exclude: string[] = []
    TAGS.forEach((t) => {
      if (modes[t] === 'include') include.push(t)
      else if (modes[t] === 'exclude') exclude.push(t)
    })
    return { include, exclude }
  }, [modes])

  const count = useMemo(
    () => words.filter((w) => matchesFilter(w, filter)).length,
    [filter],
  )

  // 和已有词书 tag 组合重复时不允许创建
  const duplicate = useMemo(
    () => existing.some((f) => sameFilter(f, filter)),
    [existing, filter],
  )

  const toggle = (tag: string) =>
    setModes((s) => {
      const next = nextMode(s[tag])
      const copy = { ...s }
      if (next) copy[tag] = next
      else delete copy[tag]
      return copy
    })

  const start = () => {
    onConfirm(filter)
  }

  const chip = (t: string) => {
    const m = modes[t]
    const label = tagLabel(t)
    return (
      <button
        key={t}
        type="button"
        className={`tag-chip${m ? ` ${m}` : ''}`}
        onClick={() => toggle(t)}
        aria-pressed={!!m}
        title={label === t ? undefined : t}
      >
        {label}
      </button>
    )
  }

  return (
    <Modal onClose={onClose} ariaLabel="选择要学的 tag">
      <h2 className="modal-title">选择要学的 tag</h2>
      <p className="select-hint">
        点一下 <b className="inc">包含</b>，再点一下 <b className="exc">排除</b>
        ，再点取消
      </p>

      <div className="tag-groups">
        {GROUPS.map((g) => (
          <div className="tag-group" key={g.label} role="group" aria-label={g.label}>
            <span className="tag-group-label">{g.label}</span>
            <div className="tag-group-chips">{g.tags.map(chip)}</div>
          </div>
        ))}
      </div>

      {duplicate && (
        <p className="select-warn" role="alert">
          已存在相同 tag 的词书
        </p>
      )}

      <div className="select-actions">
        <span className="select-count">将学习 {count} 词</span>
        <div className="select-buttons">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setModes({})}
          >
            清空
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={start}
            disabled={count === 0 || duplicate}
          >
            创建词书
          </button>
        </div>
      </div>
    </Modal>
  )
}
