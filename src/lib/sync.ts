// Model B：服务器是权威（发牌 + 收动作），本地只保留会话级状态。
// 登出时清空本地学习状态；词书列表等本地配置保留（服务器不存）。
import { revealDayRestore } from './progress'
import { pendingRestore } from './pending'
import { clearQuiz } from './quiz'

export function clearLocalState(): void {
  revealDayRestore({})
  pendingRestore({})
  clearQuiz()
}
