# Vocab Cards

一个用 **React + Vite + TypeScript** 写的三卡片环形滑动背单词页。

## 功能

- 左 / 中 / 右三张卡，中间大、两边小，环形无缝滑动（首尾相接）
- 默认只显示单词；展开后显示音标、释义、tags
- 展开时朗读单词音频，再次触发只重播
- `Enter` 把当前词标记完成并移出牌组，`✓ n/5` 记录进度
- 卡片顶部小圆记录「展开释义」次数（三进制：绿 → 黄 → 红，最多一个红，空位灰）
- 跟随系统浅色 / 深色

## 快捷键

| 键 | 作用 |
| --- | --- |
| `H` / `←` | 上一张 |
| `L` / `→` | 下一张 |
| `Space` | 显示释义 + 朗读；已显示则重播 |
| `Enter` | 完成当前词并移出牌组 |
| `Ctrl+C` / `Ctrl+Z` | 撤销（还原最近完成的词并回到它） |
| `Ctrl+Shift+C` / `Ctrl+Shift+Z` | 重做 |

鼠标：点左 / 右卡翻页，点中间卡 = `Space`。

## 开发

```bash
npm install
npm run dev        # 开发
npm run typecheck  # tsc -b
npm run build      # tsc -b && vite build
npm run preview
```

## 数据

- 词条在 `src/words.ts`（示例 5 个词）
- 音频在 `public/audio/`，通过 `/audio/<audio_file>` 引用
