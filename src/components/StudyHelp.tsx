// Study 页操作帮助：按鼠标 / 键盘 / 触控板分组列出全部手势。
// 触发入口在底部提示行最左侧（? 帮助），按 ? 键也可开关。
import Modal from './Modal'

/** 一组操作：标题 + 若干「操作 → 说明」 */
type Group = {
  title: string
  rows: { keys: string[]; desc: string; plain?: boolean }[]
}

const GROUPS: Group[] = [
  {
    title: '鼠标',
    rows: [
      { keys: ['单击中心卡'], desc: '显示释义 / 重播发音', plain: true },
      { keys: ['单击两侧卡'], desc: '上一张 / 下一张', plain: true },
      { keys: ['右键单击中心卡'], desc: '复制当前词', plain: true },
      { keys: ['双击右键（中心卡外）'], desc: '下一轮', plain: true },
      { keys: ['滚轮'], desc: '上一张 / 下一张', plain: true },
    ],
  },
  {
    title: '键盘',
    rows: [
      { keys: ['Space'], desc: '显示释义 / 重播发音' },
      { keys: ['Enter'], desc: '下一轮' },
      { keys: ['H', '←'], desc: '上一张' },
      { keys: ['L', '→'], desc: '下一张' },
      { keys: ['Ctrl/Cmd', 'C'], desc: '复制当前词' },
      { keys: ['?'], desc: '打开 / 关闭帮助' },
    ],
  },
  {
    title: '触控板',
    rows: [
      { keys: ['双指滑动'], desc: '上一张 / 下一张', plain: true },
      { keys: ['双指点按中心卡'], desc: '复制当前词', plain: true },
      {
        keys: ['双指点按两次（中心卡外）'],
        desc: '下一轮',
        plain: true,
      },
    ],
  },
]

export default function StudyHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} ariaLabel="操作帮助" className="help-modal">
      <h2 className="modal-title">操作帮助</h2>
      <div className="help-groups">
        {GROUPS.map((g) => (
          <section className="help-group" key={g.title}>
            <h3 className="help-group-title">{g.title}</h3>
            <dl className="help-list">
              {g.rows.map((r) => (
                <div className="help-row" key={r.desc + r.keys.join('')}>
                  <dt className="help-keys">
                    {r.plain
                      ? r.keys.join(' / ')
                      : r.keys.map((k, i) => (
                          <span key={k}>
                            {i > 0 && <span className="help-plus">+</span>}
                            <kbd>{k}</kbd>
                          </span>
                        ))}
                  </dt>
                  <dd className="help-desc">{r.desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
