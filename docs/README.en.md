# Shuf & Flip

[中文](../README.md)

Vocabulary flashcards: shuffle a deck and flip to reveal.

![](images/study.png)

## How to play

- **Shuffle** — entering study shuffles a round of cards from the book (16 by default); the next round is shuffled after each one.
- **Switch** — scroll, click the side cards, or press ← / → to move through the deck.
- **Flip** — press Space or click the center card to reveal the definition; press again to replay the audio.

## Getting started

```bash
npm install
npm run dev      # dev server
npm run build    # production build
npm run preview  # preview the build
```

## Data

Wordlists come from the companion repo [imfiiish/wordlists](https://github.com/imfiiish/wordlists):

- `categories.json` — word → tags (CET4/6, Oxford 3000/5000, curricula, CEFR)
- `definitions.json` — phonetics + Chinese definitions (from [ECDICT](https://github.com/skywind3000/ECDICT), MIT)
- `audio.json` — word → audio filename (files not committed; playback degrades silently when missing)

Wordlist content is © the original authors / publishers (Oxford University Press, educational bodies, etc.); included for study and research only — obtain permission for commercial use.

## License

[MIT](../LICENSE)
