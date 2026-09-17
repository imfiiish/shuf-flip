// 登录状态：暂存 localStorage（无后端，纯前端 mock）
const KEY = 'vocab-auth'

export function isLoggedIn(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function login(): void {
  localStorage.setItem(KEY, '1')
}

export function logout(): void {
  localStorage.removeItem(KEY)
}
