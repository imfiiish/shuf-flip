<h1 align="center">Shuf &amp; Flip</h1>

<p align="center"><a href="docs/README.zh.md">中文</a></p>

Vocabulary flashcards: shuffle a deck and flip to reveal.

![](docs/images/study.png)

## Shuffle

## Replace

## Flip

## Getting started

```bash
npm install
npm run dev      # dev server
npm run build    # production build
npm run preview  # preview the build
```

## Data

Wordlists come from the companion repo [imfiiish/wordlists](https://github.com/imfiiish/wordlists):

- `data/en/` — English wordlists (CET4/6, Oxford 3000/5000, curricula, CEFR)
  - `categories.json` — word → tags
  - `definitions.json` — phonetics + Chinese definitions (from [ECDICT](https://github.com/skywind3000/ECDICT), MIT)
- `data/zh/` — Chinese wordlists (HSK vocabulary / characters)
  - `definitions.json` — pinyin + English definitions (from [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), CC BY-SA 4.0)
  - `字义.json` — character glosses (from [Unihan](https://www.unicode.org/Public/UCD/chart/) kDefinition, Unicode License V3)
- Audio files are not committed; they live in `public/audio/` (playback degrades silently when missing). Chinese audio can be generated with `npm run audio:zh` (edge-tts).

The interface language picks the learning direction, and tags never mix: a Chinese UI studies English (CET/Oxford), an English UI studies Chinese (HSK).
Chinese entries can be generated into `server/seed/words_zh.sql` with `npm run build:zh-seed`, then loaded with seed.

Wordlist content is © the original authors / publishers (Oxford University Press, educational bodies, etc.); included for study and research only — obtain permission for commercial use.
The CC-CEDICT portion is licensed under CC BY-SA 4.0; the Unihan portion under the Unicode License V3.

## License

[MIT](LICENSE)
