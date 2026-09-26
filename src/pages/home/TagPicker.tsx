import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import type { TagFilter, TagMode } from '../../lib/filter'
import { activeFilter, loadBooks } from '../../lib/books'
import { poolOf, sameFilter } from '../../lib/filter'
import { tagDefsFor, tagGroupsFor } from '../../lib/tags'
import type { TagDef } from '../../lib/tags'
import { useI18n } from '../../lib/i18n'
import type { Accent, ContentLang } from '../../lib/i18n'

// 点击循环：不选 → 包含 → 排除 → 不选
function nextMode(m: TagMode | undefined): TagMode | undefined {
  if (m === 'include') return 'exclude'
  if (m === 'exclude') return undefined
  return 'include'
}

type Props = {
  onClose: () => void
  onConfirm: (filter: TagFilter, lang: ContentLang, accent: Accent) => void
  /** 已有的词书筛选条件，用于查重 */
  existing: TagFilter[]
}

/** `/` 页弹出的 tag 选择窗口 */
export default function TagPicker({ onClose, onConfirm, existing }: Props) {
  const { t, lang, contentLang } = useI18n()
  // 当前界面语言的 tag 分组（中英界面的组不一样）
  const groups = useMemo(() => tagGroupsFor(lang), [lang])
  const tagDefs = useMemo(() => tagDefsFor(lang), [lang])
  const defByLabel = useMemo(() => {
    const m = new Map<string, TagDef>()
    for (const d of tagDefs) m.set(d.label, d)
    return m
  }, [tagDefs])

  // 初始状态从上次保存的选择恢复（按底层值反查展示名）
  const [modes, setModes] = useState<Record<string, TagMode>>(() => {
    const f = activeFilter(loadBooks()) ?? { include: [], exclude: [] }
    const m: Record<string, TagMode> = {}
    for (const d of tagDefsFor(lang)) {
      if (d.values.some((v) => f.include.includes(v))) m[d.label] = 'include'
      else if (d.values.some((v) => f.exclude.includes(v)))
        m[d.label] = 'exclude'
    }
    return m
  })

  const selectedDefs = useMemo(
    () => tagDefs.filter((d) => modes[d.label]),
    [tagDefs, modes],
  )
  // 当前选择落在哪套词库（没选 = 界面默认学习方向）
  const activeLang: ContentLang = selectedDefs[0]?.lang ?? contentLang
  // 选到粤语 tag 时发音走粤语
  const accent: Accent =
    activeLang === 'zh' && selectedDefs.some((d) => d.accent === 'hk')
      ? 'hk'
      : 'cn'

  const filter = useMemo<TagFilter>(() => {
    const include: string[] = []
    const exclude: string[] = []
    for (const d of selectedDefs) {
      const mode = modes[d.label]
      if (mode === 'include') include.push(...d.values)
      else if (mode === 'exclude') exclude.push(...d.values)
    }
    return { include, exclude }
  }, [selectedDefs, modes])

  const count = useMemo(
    () => poolOf(filter, activeLang).length,
    [filter, activeLang],
  )

  // 和已有词书 tag 组合重复时不允许创建
  const duplicate = useMemo(
    () => existing.some((f) => sameFilter(f, filter)),
    [existing, filter],
  )

  const toggle = (d: TagDef) =>
    setModes((s) => {
      const next = nextMode(s[d.label])
      // 选到另一种语言：清掉旧语言的选择（一本词书只学一种）
      const sameLang = Object.keys(s).every(
        (k) => k === d.label || defByLabel.get(k)?.lang === d.lang,
      )
      const copy = next && !sameLang ? {} : { ...s }
      if (next) copy[d.label] = next
      else delete copy[d.label]
      return copy
    })

  const start = () => {
    onConfirm(filter, activeLang, accent)
  }

  const chip = (d: TagDef) => {
    const m = modes[d.label]
    return (
      <button
        key={d.label}
        type="button"
        className={`tag-chip${m ? ` ${m}` : ''}`}
        onClick={() => toggle(d)}
        aria-pressed={!!m}
      >
        {d.label}
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
