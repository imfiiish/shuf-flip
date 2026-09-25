import Modal from './Modal'
import { useI18n, type Lang } from '../lib/i18n'

// 语言项用各自母语显示，方便辨认
const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

/** 设置弹窗：目前只有语言切换（切语言 = 切学习方向） */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n()

  const choose = (next: Lang) => {
    if (next === lang) return
    setLang(next)
    // 语言决定学习方向，整页重载让词库 / 词书 / tag 一起切过去
    window.location.reload()
  }

  return (
    <Modal
      onClose={onClose}
      ariaLabel={t('settings.title')}
      className="settings-modal"
    >
      <h2 className="modal-title">{t('settings.title')}</h2>

      <div className="settings-group">
        <span className="settings-label">{t('settings.language')}</span>
        <div className="seg" role="group" aria-label={t('settings.language')}>
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`seg-btn${lang === o.value ? ' on' : ''}`}
              onClick={() => choose(o.value)}
              aria-pressed={lang === o.value}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="settings-note">{t('settings.note')}</p>
    </Modal>
  )
}
