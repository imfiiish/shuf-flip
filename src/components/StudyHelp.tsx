// Study 页操作帮助：按鼠标 / 键盘 / 触控板分组列出全部手势。
// 触发入口在底部提示行最左侧（? 帮助），按 ? 键也可开关。
import Modal from './Modal'
import { useI18n } from '../lib/i18n'

/** 一行操作：plain=整句描述（不可拆键位）；keys=真实键位，用 + 连接 */
type Row =
  | { kind: 'plain'; labelKey: string; descKey: string }
  | { kind: 'keys'; keys: string[]; descKey: string }

/** 一组操作：标题 key + 若干行 */
type Group = {
  titleKey: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    titleKey: 'help.mouse',
    rows: [
      { kind: 'plain', labelKey: 'help.clickCenter', descKey: 'help.showOrReplay' },
      { kind: 'plain', labelKey: 'help.clickSides', descKey: 'help.prevNext' },
      { kind: 'plain', labelKey: 'help.rightClickCenter', descKey: 'help.copyWord' },
      { kind: 'plain', labelKey: 'help.doubleRight', descKey: 'help.next' },
      { kind: 'plain', labelKey: 'help.wheel', descKey: 'help.prevNext' },
    ],
  },
  {
    titleKey: 'help.keyboard',
    rows: [
      { kind: 'keys', keys: ['Space'], descKey: 'help.space' },
      { kind: 'keys', keys: ['Enter'], descKey: 'help.next' },
      { kind: 'keys', keys: ['H', '←'], descKey: 'help.prev' },
      { kind: 'keys', keys: ['L', '→'], descKey: 'help.nextCard' },
      { kind: 'keys', keys: ['Ctrl/Cmd', 'C'], descKey: 'help.copyWord' },
      { kind: 'keys', keys: ['?'], descKey: 'help.toggleHelp' },
    ],
  },
  {
    titleKey: 'help.trackpad',
    rows: [
      { kind: 'plain', labelKey: 'help.twoFinger', descKey: 'help.prevNext' },
      { kind: 'plain', labelKey: 'help.twoFingerCenter', descKey: 'help.copyWord' },
      { kind: 'plain', labelKey: 'help.twoFingerDouble', descKey: 'help.next' },
    ],
  },
]

export default function StudyHelp({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal onClose={onClose} ariaLabel={t('help.aria')} className="help-modal">
      <h2 className="modal-title">{t('help.title')}</h2>
      <div className="help-groups">
        {GROUPS.map((g) => (
          <section className="help-group" key={g.titleKey}>
            <h3 className="help-group-title">{t(g.titleKey)}</h3>
            <dl className="help-list">
              {g.rows.map((r, i) => (
                <div className="help-row" key={i}>
                  <dt className="help-keys">
                    {r.kind === 'plain'
                      ? t(r.labelKey)
                      : r.keys.map((k, i) => (
                          <span key={k}>
                            {i > 0 && <span className="help-plus">+</span>}
                            <kbd>{k}</kbd>
                          </span>
                        ))}
                  </dt>
                  <dd className="help-desc">{t(r.descKey)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
