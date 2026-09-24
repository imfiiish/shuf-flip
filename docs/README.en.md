# Shuf & Flip

[中文](../README.md)

Vocabulary flashcards: shuffle a deck and flip to reveal.

![](images/study.png)

## How to play

A study round is 16 cards, with three moves:

- **Shuffle** — entering study shuffles a fresh round from the book; the next round is shuffled after each one.
- **Switch** — scroll, click the side cards, or press ← / → to move through the deck.
- **Flip** — press Space or click the center card to reveal the definition; press again to replay the audio.

Sampling works in two layers: **new cards use cascading windows** (high short-term repetition, full coverage over time — formulas in [sampling.md](sampling.md)); **switching uses weighting** — when a round lands on words you've already flipped, those slots are refilled by the words most due for review. E.g. 4 repeats out of 16 become the 4 most-needed words rather than random repeats. (Weighted refill is planned, not implemented yet.)

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
