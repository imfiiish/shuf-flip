// 词库查询：用 word 字符串定位词条（词库内 word 唯一，与数组顺序无关）
import type { Word } from '../data/words'
import { findWord } from '../data/words'

/** word 字符串 → Word（不存在返回 undefined） */
export function getWord(name: string): Word | undefined {
  return findWord(name)
}
