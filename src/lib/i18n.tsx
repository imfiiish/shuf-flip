// 轻量 i18n：不引三方库，按 key 查词表 + {占位符} 插值。
//
// 语言默认「自动」：首次按 navigator.language 判断（zh* → 中文，其余 → 英文），
// 之后以 localStorage 里保存的选择为准。设置入口目前是占位（不做功能），
// 但 setLang 已备好，接入切换 UI 即可持久生效。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { readString, writeString } from './storage'

export type Lang = 'zh' | 'en'
/** 学习内容语言：UI 语言 = 母语，学另一种 */
export type ContentLang = 'en' | 'zh'

/** 由 UI 语言推出要学的语言（中文界面 → 学英文；英文界面 → 学中文） */
export function contentLangOf(ui: Lang): ContentLang {
  return ui === 'en' ? 'zh' : 'en'
}

// 需与 index.html 里首屏内联脚本的 key 保持一致
const KEY = 'vocab-lang'

/** 自动判定语言：已保存的优先，其次浏览器语言 */
export function detectLang(): Lang {
  const saved = readString(KEY)
  if (saved === 'zh' || saved === 'en') return saved
  const nav =
    typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

type Params = Record<string, string | number>
type Dict = Record<string, string>

const ZH: Dict = {
  // —— 通用 ——
  'app.loading': '加载中…',
  'app.loadFailed': '加载失败，请刷新重试',
  'app.initFailed': '初始化失败：{msg}',
  'common.close': '关闭',
  'common.copied': '已复制',

  // —— 返回 / 主题 ——
  'nav.home': '返回主页',
  'theme.auto': '自动',
  'theme.light': '亮色',
  'theme.dark': '暗色',
  'theme.toggle': '主题：{mode}，点击切换',
  'theme.toggleTitle': '主题：{mode}（点击切换）',

  // —— Home ——
  'home.settings': '设置',
  'home.github': 'GitHub 仓库',
  'home.logout': '退出登录',
  'home.addBook': '新建词书',
  'home.bookTitle': '{name} · 碰到 {met} · 翻开 {revealed} · 共 {total}',
  'home.deleteBook': '删除 {name}',
  'home.confirmDeleteBook': '再点一次删除 {name}',
  'home.confirmDelete': '再点一次确认删除',
  'home.bookWords': '{total} 词',
  'home.defaultBook': '词书',

  // —— 设置 ——
  'settings.title': '设置',
  'settings.language': '语言',
  'settings.note':
    '切换语言会同时切换学习方向：中文界面学英文，English 界面学中文。',

  // —— Tag 选择 ——
  'picker.aria': '选择要学的 tag',
  'picker.title': '选择要学的 tag',
  'picker.hint': '点一下 {inc}，再点一下 {exc}，再点取消',
  'picker.include': '包含',
  'picker.exclude': '排除',
  'picker.duplicate': '已存在相同 tag 的词书',
  'picker.count': '将学习 {count} 词',
  'picker.clear': '清空',
  'picker.create': '创建词书',

  // —— 词书弹窗 ——
  'book.nameAria': '词书名称',
  'book.namePlaceholder': '词书',
  'book.nameEditAria': '词书名称：{name}，点击修改',
  'book.nameEditTitle': '点击修改名称',
  'book.thisRound': '本轮',
  'book.empty': '这本词书还没有词',
  'book.copyPlay': '点击复制并发音',
  'book.start': '开始学习',

  // —— Study ——
  'study.next': '下一轮',
  'study.help': '帮助',
  'study.reveal': '显示释义',
  'study.replay': '重新播放',

  // —— 操作帮助 ——
  'help.aria': '操作帮助',
  'help.title': '操作帮助',
  'help.mouse': '鼠标',
  'help.keyboard': '键盘',
  'help.trackpad': '触控板',
  'help.clickCenter': '单击中心卡',
  'help.showOrReplay': '显示释义 / 重播发音',
  'help.clickSides': '单击两侧卡',
  'help.prevNext': '上一张 / 下一张',
  'help.rightClickCenter': '右键单击中心卡',
  'help.copyWord': '复制当前词',
  'help.doubleRight': '双击右键（中心卡外）',
  'help.next': '下一轮',
  'help.wheel': '滚轮',
  'help.space': '显示释义 / 重播发音',
  'help.prev': '上一张',
  'help.nextCard': '下一张',
  'help.toggleHelp': '打开 / 关闭帮助',
  'help.twoFinger': '双指滑动',
  'help.twoFingerCenter': '双指点按中心卡',
  'help.twoFingerDouble': '双指点按两次（中心卡外）',

  // —— Quiz ——
  'quiz.skip': '跳过测验',
  'quiz.skipConfirm': '再点一次确认跳过',
  'quiz.unknown': '陌生',
  'quiz.fuzzy': '模糊',
  'quiz.known': '熟悉',

  // —— 登录 ——
  'login.username': '账号',
  'login.passwordAria': '密码',
  'login.usernameHint': '3–20 位，字母开头，仅小写字母与数字',
  'login.passwordLabel': '再输入密码',
  'login.needDigits': '请输入数字',
  'login.mismatch': '两次不一致，请重输',
  'login.enter': '进入',
  'login.confirm': '确认',
  'login.register': '注册',
  'login.back': '返回',
  'login.err429': '尝试太频繁，请 {sec} 秒后再试',
  'login.err429NoSec': '尝试太频繁，请稍后再试',
  'login.errCredentials': '账号或密码错误',
  'login.errTaken': '这个用户名已被注册',
  'login.errUnavailable': '这个用户名不可用',
  'login.errPassword': '请输入 4 位数字密码',
  'login.errNetwork': '网络异常，请重试',
  'login.errGeneric': '出错了，请重试',
}

const EN: Dict = {
  // —— common ——
  'app.loading': 'Loading…',
  'app.loadFailed': 'Failed to load. Please refresh.',
  'app.initFailed': 'Failed to start: {msg}',
  'common.close': 'Close',
  'common.copied': 'Copied',

  // —— back / theme ——
  'nav.home': 'Back to home',
  'theme.auto': 'Auto',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.toggle': 'Theme: {mode}. Click to switch',
  'theme.toggleTitle': 'Theme: {mode} (click to switch)',

  // —— Home ——
  'home.settings': 'Settings',
  'home.github': 'GitHub repository',
  'home.logout': 'Log out',
  'home.addBook': 'New book',
  'home.bookTitle': '{name} · seen {met} · revealed {revealed} · {total} total',
  'home.deleteBook': 'Delete {name}',
  'home.confirmDeleteBook': 'Click again to delete {name}',
  'home.confirmDelete': 'Click again to confirm delete',
  'home.bookWords': '{total} words',
  'home.defaultBook': 'Book',

  // —— settings ——
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.note':
    'Switching the language also switches the study direction: a Chinese UI studies English, an English UI studies Chinese.',

  // —— tag picker ——
  'picker.aria': 'Choose tags to study',
  'picker.title': 'Choose tags to study',
  'picker.hint': 'Tap once to {inc}, tap again to {exc}, tap once more to clear',
  'picker.include': 'include',
  'picker.exclude': 'exclude',
  'picker.duplicate': 'A book with the same tags already exists',
  'picker.count': 'Study {count} words',
  'picker.clear': 'Clear',
  'picker.create': 'Create book',

  // —— book dialog ——
  'book.nameAria': 'Book name',
  'book.namePlaceholder': 'Book',
  'book.nameEditAria': 'Book name: {name}. Click to edit',
  'book.nameEditTitle': 'Click to rename',
  'book.thisRound': 'This round',
  'book.empty': 'This book has no words yet',
  'book.copyPlay': 'Click to copy and play audio',
  'book.start': 'Start studying',

  // —— Study ——
  'study.next': 'Next round',
  'study.help': 'Help',
  'study.reveal': 'Show definition',
  'study.replay': 'Replay',

  // —— help ——
  'help.aria': 'Controls',
  'help.title': 'Controls',
  'help.mouse': 'Mouse',
  'help.keyboard': 'Keyboard',
  'help.trackpad': 'Trackpad',
  'help.clickCenter': 'Click center card',
  'help.showOrReplay': 'Show definition / replay audio',
  'help.clickSides': 'Click side cards',
  'help.prevNext': 'Previous / next',
  'help.rightClickCenter': 'Right-click center card',
  'help.copyWord': 'Copy current word',
  'help.doubleRight': 'Double right-click (outside center card)',
  'help.next': 'Next round',
  'help.wheel': 'Scroll wheel',
  'help.space': 'Show definition / replay audio',
  'help.prev': 'Previous',
  'help.nextCard': 'Next',
  'help.toggleHelp': 'Open / close help',
  'help.twoFinger': 'Two-finger swipe',
  'help.twoFingerCenter': 'Two-finger tap center card',
  'help.twoFingerDouble': 'Two-finger double tap (outside center card)',

  // —— Quiz ——
  'quiz.skip': 'Skip quiz',
  'quiz.skipConfirm': 'Click again to confirm skip',
  'quiz.unknown': 'Unfamiliar',
  'quiz.fuzzy': 'Unsure',
  'quiz.known': 'Familiar',

  // —— Login ——
  'login.username': 'username',
  'login.passwordAria': 'password',
  'login.usernameHint': '3–20 chars, start with a letter, lowercase letters and digits only',
  'login.passwordLabel': 'Re-enter password',
  'login.needDigits': 'Digits only',
  'login.mismatch': "Passwords don't match, try again",
  'login.enter': 'Enter',
  'login.confirm': 'Confirm',
  'login.register': 'Register',
  'login.back': 'Back',
  'login.err429': 'Too many attempts, try again in {sec}s',
  'login.err429NoSec': 'Too many attempts, try again later',
  'login.errCredentials': 'Wrong username or password',
  'login.errTaken': 'This username is already taken',
  'login.errUnavailable': 'This username is unavailable',
  'login.errPassword': 'Enter a 4-digit password',
  'login.errNetwork': 'Network error, please retry',
  'login.errGeneric': 'Something went wrong, please retry',
}

const DICTS: Record<Lang, Dict> = { zh: ZH, en: EN }

function interpolate(s: string, params?: Params): string {
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`,
  )
}

/** 纯函数翻译（main.tsx 等无 hook 场景用） */
export function translate(lang: Lang, key: string, params?: Params): string {
  const s = DICTS[lang][key] ?? DICTS.zh[key] ?? key
  return interpolate(s, params)
}

export type TFunc = (key: string, params?: Params) => string

type Ctx = {
  lang: Lang
  /** 当前学习内容语言（与 UI 语言相反） */
  contentLang: ContentLang
  setLang: (lang: Lang) => void
  t: TFunc
}

const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((next: Lang) => {
    writeString(KEY, next)
    setLangState(next)
  }, [])

  // 同步 <html lang> 与标题，交给浏览器/读屏软件
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = lang === 'zh' ? '洗牌 · 翻牌' : 'Shuf & Flip'
  }, [lang])

  const t = useCallback<TFunc>(
    (key, params) => translate(lang, key, params),
    [lang],
  )

  const value = useMemo<Ctx>(
    () => ({ lang, contentLang: contentLangOf(lang), setLang, t }),
    [lang, setLang, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n 必须在 I18nProvider 内使用')
  return ctx
}
