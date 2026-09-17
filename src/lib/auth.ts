// 登录状态：暂存 localStorage（无后端，纯前端 mock）
import { readString, removeItem, writeString } from './storage'

const KEY = 'vocab-auth'

export function isLoggedIn(): boolean {
  return readString(KEY) === '1'
}

export function login(): void {
  writeString(KEY, '1')
}

export function logout(): void {
  removeItem(KEY)
}
