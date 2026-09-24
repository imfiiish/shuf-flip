# 洗牌 · 翻牌

[English](docs/README.en.md)

抽认卡背单词：洗牌抽卡，翻牌看释义。

![](docs/images/study.png)

## 玩法

- **洗牌** — 进入学习时，从词书里洗出一轮卡（默认 16 张）；每轮结束再洗下一轮。
- **换牌** — 滚轮、点两侧卡，或按 ← / →，在牌组里前后切换。
- **翻牌** — 空格或点中心卡翻开释义；再按一次重播发音。

## 快速开始

```bash
npm install
npm run dev      # 本地开发
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

## 数据

词库来自配套仓库 [imfiiish/wordlists](https://github.com/imfiiish/wordlists)：

- `categories.json` — 词 → 标签（CET4/6、Oxford 3000/5000、课标、CEFR）
- `definitions.json` — 音标 + 中文释义（取自 [ECDICT](https://github.com/skywind3000/ECDICT)，MIT）
- `audio.json` — 词 → 音频文件名（音频文件不入库，缺失时自动静音）

词表内容版权归原作者 / 出版机构（Oxford University Press、相关教育机构等），仅用于学习研究；商用请自行取得授权。

## License

[MIT](LICENSE)
