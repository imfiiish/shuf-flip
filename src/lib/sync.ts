// 状态同步：登录后从后端拉回状态，本地改动再推上去。
//   progress = 进度（书/轮/中心卡/待考池），推得勤但小
//   data     = 统计（books/stats/回合序/quiz），每轮推一次
// 乐观并发：带 rev 写；409 时拉回服务端覆盖（MVP：服务端赢）。网络失败下次再推。
import { api, ApiError } from './api'
import { activeFilter, loadBooks, saveBooks, setActiveFilter } from './books'
import { filterFromKey, filterKey } from './filter'
import { cascadeRestore, cascadeSnapshot } from './cascade'
import { centersRestore, centersSnapshot } from './progress'
import {
  statsRestore,
  statsSeqRestore,
  statsSeqSnapshot,
  statsSnapshot,
} from './stats'
import { pendingRestore, pendingSnapshot } from './pending'
import { clearQuiz, loadQuiz, saveQuiz } from './quiz'

const DEBOUNCE_MS = 2000

let progressRev = 0
let dataRev = 0
let progressTimer: ReturnType<typeof setTimeout> | undefined
let dataTimer: ReturnType<typeof setTimeout> | undefined
let inPull = false

function progressBlob() {
  const f = activeFilter(loadBooks())
  return {
    filterKey: f ? filterKey(f) : null,
    cascade: cascadeSnapshot(),
    centers: centersSnapshot(),
    pending: pendingSnapshot(),
  }
}

function dataBlob() {
  return {
    books: loadBooks(),
    stats: statsSnapshot(),
    seq: statsSeqSnapshot(),
    quiz: loadQuiz(),
  }
}

function applyProgress(raw: unknown): void {
  const p = (raw ?? {}) as ReturnType<typeof progressBlob>
  cascadeRestore(p.cascade)
  centersRestore(p.centers)
  pendingRestore(p.pending)
  if (typeof p.filterKey === 'string' && p.filterKey) {
    setActiveFilter(filterFromKey(p.filterKey))
  }
}

function applyData(raw: unknown): void {
  const d = (raw ?? {}) as ReturnType<typeof dataBlob>
  if (Array.isArray(d.books)) saveBooks(d.books)
  statsRestore(d.stats)
  statsSeqRestore(d.seq)
  if (d.quiz) saveQuiz(d.quiz)
  else clearQuiz()
}

async function flush(kind: 'progress' | 'data'): Promise<void> {
  try {
    if (kind === 'progress') {
      const r = await api.putProgress(progressBlob(), progressRev)
      progressRev = r.rev
    } else {
      const r = await api.putData(dataBlob(), dataRev)
      dataRev = r.rev
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'conflict' && !inPull) {
      await pullState() // 服务端更新了：拉回覆盖
    }
    // 其它（网络）错误：忽略，等下次
  }
}

function schedule(kind: 'progress' | 'data'): void {
  if (kind === 'progress') {
    if (progressTimer) return
    progressTimer = setTimeout(() => {
      progressTimer = undefined
      void flush('progress')
    }, DEBOUNCE_MS)
  } else {
    if (dataTimer) return
    dataTimer = setTimeout(() => {
      dataTimer = undefined
      void flush('data')
    }, DEBOUNCE_MS)
  }
}

/** 进度变了（切卡/切轮）：debounce 推 */
export function markProgressDirty(): void {
  schedule('progress')
}

/** 统计变了（评分/书本列表）：debounce 推 */
export function markDataDirty(): void {
  schedule('data')
}

/** 立即把两块都推上去（每轮结束 / 关页） */
export async function flushAll(): Promise<void> {
  if (progressTimer) {
    clearTimeout(progressTimer)
    progressTimer = undefined
  }
  if (dataTimer) {
    clearTimeout(dataTimer)
    dataTimer = undefined
  }
  await Promise.all([flush('progress'), flush('data')])
}

/** 登录/注册成功后，或已登录时启动：拉服务端状态；服务端为空则把本地推上去 */
export async function pullState(): Promise<void> {
  inPull = true
  try {
    const s = await api.getState()
    progressRev = s.progress.rev
    dataRev = s.data.rev
    if (s.progress.rev === 0 && s.data.rev === 0) {
      await flush('progress')
      await flush('data')
      return
    }
    applyProgress(s.progress.data)
    applyData(s.data.data)
  } finally {
    inPull = false
  }
}

/** 登出时清空本地用户状态（服务器才是权威；下次登录再拉回） */
export function clearLocalState(): void {
  progressRev = 0
  dataRev = 0
  cascadeRestore({})
  centersRestore({})
  pendingRestore({})
  statsRestore({})
  statsSeqRestore({})
  clearQuiz()
  saveBooks([])
}
