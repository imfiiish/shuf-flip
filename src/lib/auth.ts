// 登录状态：暂存 localStorage（无后端，纯前端 mock）
import { readString, removeItem, writeString } from './storage'

const KEY = 'vocab-auth'
const USER_KEY = 'vocab-user'

export function isLoggedIn(): boolean {
  return readString(KEY) === '1'
}

export function login(username?: string): void {
  writeString(KEY, '1')
  if (username) writeString(USER_KEY, username)
  else removeItem(USER_KEY)
}

/** 当前登录用户名（纯前端暂存，为接后端留位；暂无展示用途） */
export function getUsername(): string {
  return readString(USER_KEY) ?? ''
}

export function logout(): void {
  removeItem(KEY)
  removeItem(USER_KEY)
}
