import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import type { TagFilter, TagMode } from '../../lib/filter'
import { activeFilter, loadBooks } from '../../lib/books'
import { matchesFilter, sameFilter } from '../../lib/filter'
import { tagGroupsFor, tagsFor } from '../../lib/tags'
import { useI18n } from '../../lib/i18n'
import { allWords } from '../../data/words'

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
  const { t, contentLang } = useI18n()
  // 当前学习方向的分组与 tag（两种语言不混）
  const groups = useMemo(() => tagGroupsFor(contentLang), [contentLang])
  const TAGS = useMemo(() => tagsFor(contentLang), [contentLang])
  // 初始状态从上次保存的选择恢复
  const [modes, setModes] = useState<Record<string, TagMode>>(() => {
    const f = activeFilter(loadBooks()) ?? { include: [], exclude: [] }
    const m: Record<string, TagMode> = {}
    f.include.forEach((t) => (m[t] = 'include'))
    f.exclude.forEach((t) => (m[t] = 'exclude'))
    return m
  })

  const filter = useMemo<TagFilter>(() => {
    const include: string[] = []
    const exclude: string[] = []
    TAGS.forEach((tag) => {
      if (modes[tag] === 'include') include.push(tag)
      else if (modes[tag] === 'exclude') exclude.push(tag)
    })
    return { include, exclude }
  }, [modes, TAGS])

  const count = useMemo(
    () => allWords().filter((w) => matchesFilter(w, filter)).length,
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

  const chip = (tag: string) => {
    const m = modes[tag]
    return (
      <button
        key={tag}
        type="button"
        className={`tag-chip${m ? ` ${m}` : ''}`}
        onClick={() => toggle(tag)}
        aria-pressed={!!m}
      >
        {tag}
      </button>
    )
  }

  // 把 {inc}/{exc} 占位符换成带样式的「包含 / 排除」
  const hint = t('picker.hint')
    .split(/(\{inc\}|\{exc\})/g)
    .map((part, i) => {
      if (part === '{inc}')
        return (
          <b className="inc" key={i}>
            {t('picker.include')}
          </b>
        )
      if (part === '{exc}')
        return (
          <b className="exc" key={i}>
            {t('picker.exclude')}
          </b>
        )
      return part
    })

  return (
    <Modal onClose={onClose} ariaLabel={t('picker.aria')}>
      <h2 className="modal-title">{t('picker.title')}</h2>
      <p className="select-hint">{hint}</p>

      <div className="tag-groups">
        {groups.map((g) => (
          <div
            className="tag-group"
            key={g.label}
            role="group"
            aria-label={g.label}
          >
            <span className="tag-group-label">{g.label}</span>
            <div className="tag-group-chips">{g.tags.map(chip)}</div>
          </div>
        ))}
      </div>

      {duplicate && (
        <p className="select-warn" role="alert">
          {t('picker.duplicate')}
        </p>
      )}

      <div className="select-actions">
        <span className="select-count">{t('picker.count', { count })}</span>
        <div className="select-buttons">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setModes({})}
          >
            {t('picker.clear')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={start}
            disabled={count === 0 || duplicate}
          >
            {t('picker.create')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
