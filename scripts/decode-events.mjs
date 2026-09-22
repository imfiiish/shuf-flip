#!/usr/bin/env node
// 解码 events-*.jsonl（仅新格式：头行 + 元组）
//
// 头行：{"h":1,"sid":…,"ld":…,"p":…,"t0":…}
// 事件：[code, dt, …args]
//
// 用法：node scripts/decode-events.mjs logs/events-study-2026-09-22.jsonl
//       node scripts/decode-events.mjs <file> | jq .
//
// 注意：事件表需与 src/lib/analytics.ts 的 EVENTS 保持一致。
import { readFileSync } from 'node:fs'

const EVENTS = [
  [0, 'counts_reset', ['from', 'to']],
  [1, 'study_enter', ['filterKey']],
  [2, 'study_round', ['index', 'words']],
  [3, 'study_card', ['word', 'dir', 'dwellBeforeMs', 'dwellAfterMs', 'reveals']],
  [4, 'study_exit', ['reason']],
  [5, 'study_away', ['away', 'by']],
  [6, 'study_copy', ['word', 'revealed']],
  [7, 'study_to_quiz', ['batch']],
  [10, 'quiz_enter', ['fk', 'batch', 'total']],
  [11, 'quiz_card', ['word', 'dir', 'dwellMs', 'plays']],
  [12, 'quiz_rate', ['word', 'rating', 'plays', 'left']],
  [13, 'quiz_undo', ['word', 'rating', 'undoLeft']],
  [14, 'quiz_exit', ['reason', 'rated', 'total']],
]
const DEF = new Map(EVENTS.map(([code, type, fields]) => [code, { type, fields }]))

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/decode-events.mjs <events.jsonl>')
  process.exit(1)
}

let header = null
for (const raw of readFileSync(file, 'utf8').split('\n')) {
  if (!raw.trim()) continue
  const v = JSON.parse(raw)

  if (!Array.isArray(v)) {
    if (v.h === 1) header = v
    continue
  }

  const [code, dt, ...args] = v
  const d = DEF.get(code)
  if (!d) {
    console.log(JSON.stringify({ _unknown: v }))
    continue
  }
  const obj = {}
  d.fields.forEach((f, i) => (obj[f] = args[i]))
  console.log(
    JSON.stringify({
      t: header ? new Date(header.t0 + dt).toISOString() : dt,
      ld: header?.ld ?? null,
      sid: header?.sid ?? null,
      type: d.type,
      ...obj,
    }),
  )
}
