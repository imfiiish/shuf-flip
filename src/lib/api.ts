// 后端接口封装：同源 `/api`（开发经 Vite 代理到 3001，生产同域）。
// 约定：成功返回解析后的 JSON；失败抛 ApiError（带 HTTP 状态与后端 error code）。
export type User = { id: number; username: string }

/** 一轮（服务器发牌） */
export type StudyRound = {
  roundId: number
  r: number
  fk: string
  round: string[]
  center: number
}

/** 一张卡的动作（study 上报用） */
export type ActionSlot = {
  slot: number
  met: boolean
  reveals: number
}

/** Home 汇总 */
export type StudySummary = {
  total: number
  seen: number
  revealed: number
}

export class ApiError extends Error {
  status: number
  code: string
  /** 429 时后端给的等待秒数 */
  retryAfter?: number

  constructor(status: number, code: string, retryAfter?: number) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

const BASE = '/api'

type ReqOpts = {
  method?: string
  body?: unknown
  /** 超时（ms）；网络异常/超时抛 code='network' */
  timeoutMs?: number
}

async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 15000 } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    throw new ApiError(0, 'network', undefined)
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; retryAfter?: number }
    const headerRetry = res.headers.get('Retry-After')
    throw new ApiError(
      res.status,
      typeof d.error === 'string' ? d.error : 'unknown',
      d.retryAfter ?? (headerRetry ? Number(headerRetry) : undefined),
    )
  }
  return data as T
}

export const api = {
  // —— 账号 ——
  register: (username: string, password: string, consent = true) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: { username, password, consent },
    }),
  login: (username: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User | null }>('/auth/me'),
  rename: (username: string) =>
    request<{ user: User }>('/auth/rename', {
      method: 'POST',
      body: { username },
    }),
  /** 用户名是否已注册（登录页据此决定「登录」还是「注册」） */
  exists: (username: string) =>
    request<{ exists: boolean }>(
      `/auth/exists?username=${encodeURIComponent(username)}`,
    ),

  // —— Model B：服务器发牌 / 收动作 ——
  studyRound: (fk: string, advance: boolean) =>
    request<StudyRound>('/study/round', {
      method: 'POST',
      body: { fk, advance },
    }),
  studyActions: (roundId: number, slots: ActionSlot[]) =>
    request<{ ok: true; applied: number }>('/study/actions', {
      method: 'POST',
      body: { roundId, slots },
    }),
  studyProgress: (fk: string, center: number) =>
    request<{ ok: true }>('/study/progress', {
      method: 'PUT',
      body: { fk, center },
    }),
  studyQuiz: (fk: string, batch: number) =>
    request<{ quizId: number | null; words: string[] }>('/study/quiz', {
      method: 'POST',
      body: { fk, batch },
    }),
  studyQuizRatings: (
    quizId: number,
    ratings: { word: string; rating: number }[],
  ) =>
    request<{ ok: true; applied: number }>('/study/quiz/ratings', {
      method: 'POST',
      body: { quizId, ratings },
    }),
  studySummary: (fk: string) =>
    request<StudySummary>(
      `/study/summary?fk=${encodeURIComponent(fk)}`,
    ),

  // —— 事件 ——
  sendEvents: (events: unknown[]) =>
    request<{ ok: true; stored: number }>('/events', {
      method: 'POST',
      body: events,
    }),
}
