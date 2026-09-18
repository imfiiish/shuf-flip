import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import type { TagFilter, TagMode } from '../../lib/filter'
import { loadFilter, matchesFilter, sameFilter } from '../../lib/filter'
import { allTags } from '../../lib/tags'
import { words } from '../../data/words'

const TAGS = allTags()

// 点击循环：不选 → 包含 → 排除 → 不选
function nextMode(m: TagMode | undefined): TagMode | undefined {
  if (m === 'include') return 'exclude'
  if (m === 'exclude') return undefined
  return 'include'
}

type Props = {
  onClose: () => void
  onConfirm: (filter: TagFilter, count: number) => void
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
    onConfirm(filter, count)
  }

  return (
    <Modal onClose={onClose} ariaLabel="选择要学的 tag">
      <h2 className="modal-title">选择要学的 tag</h2>
      <p className="select-hint">
        点一下 <b className="inc">包含</b>，再点一下 <b className="exc">排除</b>
        ，再点取消
      </p>

      <div className="tag-picker">
        {TAGS.map((t) => {
          const m = modes[t]
          return (
            <button
              key={t}
              type="button"
              className={`tag-chip${m ? ` ${m}` : ''}`}
              onClick={() => toggle(t)}
              aria-pressed={!!m}
            >
              {t}
            </button>
          )
        })}
      </div>

      {duplicate && (
        <p className="select-warn" role="alert">
          已存在相同 tag 的词书
        </p>
      )}

      <div className="select-actions">
        <span className="select-count">将学习 {count} 张</span>
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
    </Modal>
  )
}
