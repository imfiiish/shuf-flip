/**
 * localStorage 统一入口。
 *
 * 集中处理 try/catch，避免各模块重复「读取 → JSON.parse → 校验」样板。
 * 读取失败（没有 key / JSON 损坏 / 校验不通过 / 隐私模式）一律返回 null，
 * 由调用方决定默认值。
 */

/** 读并解析 JSON；parse 返回 null 视为无效，最终返回 null */
export function readJSON<T>(
  key: string,
  parse: (value: unknown) => T | null,
): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return parse(JSON.parse(raw))
  } catch {
    return null
  }
}

/** 写 JSON；存储不可用（配额 / 隐私模式）时静默失败 */
export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略 */
  }
}

/**
 * 读一个「字符串 key → 校验过的值」的 map。
 * 统一处理 progress / rounds 这类以 id 为 key 的存储。
 */
export function readMap<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): Record<string, T> {
  return (
    readJSON<Record<string, T>>(key, (v) => {
      if (typeof v !== 'object' || v === null) return {}
      const out: Record<string, T> = {}
      for (const [k, val] of Object.entries(v)) {
        if (isValid(val)) out[k] = val
      }
      return out
    }) ?? {}
  )
}

/** 读原始字符串（auth / theme 这类非 JSON 值） */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 写原始字符串 */
export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 忽略 */
  }
}

/** 删除 key */
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}
