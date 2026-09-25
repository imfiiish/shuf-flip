// Model B：不再做全量状态同步（服务器发牌 + 收动作）。
// 这里只剩登出时清空本地学习状态；词书列表等本地配置保留（服务器不存）。
import { cascadeRestore } from './cascade'
import { centersRestore, revealDayRestore } from './progress'
import { statsRestore, statsSeqRestore } from './stats'
import { pendingRestore } from './pending'
import { clearQuiz } from './quiz'

export function clearLocalState(): void {
  cascadeRestore({})
  centersRestore({})
  revealDayRestore({})
  statsRestore({})
  statsSeqRestore({})
  pendingRestore({})
  clearQuiz()
}
