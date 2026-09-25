// 服务器是权威（发牌 + 收动作 + 待考池），本地只保留会话级状态。
// 登出时清空本地学习状态；词书列表等本地配置保留（服务器不存）。
import { clearBooksLocal } from './books'
import { revealDayRestore } from './progress'
import { clearQuiz } from './quiz'

export function clearLocalState(): void {
  clearBooksLocal()
  revealDayRestore({})
  clearQuiz()
}
