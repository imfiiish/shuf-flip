/** 洗牌取前 k 个（均匀随机、不重复） */
export function pick(pool: readonly string[], k: number): string[] {
  const a = [...pool]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a.slice(0, Math.max(0, Math.min(k, a.length)))
}
