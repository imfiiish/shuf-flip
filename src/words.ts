// 样例数据（5 个词），按给定顺序排列
export type Word = {
  word: string
  phonetic: string
  definition: string
  tags: string[]
  audio_file: string
}

export const words: Word[] = [
  {
    word: 'alternatively',
    phonetic: "ɒ:l'tә:nәtivli",
    definition: 'adv. 非此即彼',
    tags: ['CEFR.B2', 'TOEFL'],
    audio_file: '48e09a4257.mp3',
  },
  {
    word: 'although',
    phonetic: "ɒ:l'ðou",
    definition: 'conj. 虽然, 尽管',
    tags: ['BEC', 'CEFR.B1', 'CET4', 'TEM8', '初中', '高中'],
    audio_file: 'dea713fc73.mp3',
  },
  {
    word: 'altimeter',
    phonetic: "æl'timitә",
    definition: 'n. 高度计\n[化] 测高仪',
    tags: ['GRE', 'SAT'],
    audio_file: '499321ef87.mp3',
  },
  {
    word: 'altitude',
    phonetic: "'æltitju:d",
    definition: 'n. 高度, 海拔, 高处\n[电] 高度',
    tags: ['CET4', 'GMAT', 'IELTS', 'SAT', 'TEM4', 'TEM8', 'TOEFL', '高中'],
    audio_file: 'e4c1a71b06.mp3',
  },
  {
    word: 'alto',
    phonetic: "'æltәu",
    definition: 'n. 女低音, 男声最高音, 女低音歌手',
    tags: ['SAT'],
    audio_file: 'ee24bfdc23.mp3',
  },
]
