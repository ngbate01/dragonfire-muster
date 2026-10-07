# Dragonfire Muster

A free formation planner for Game of Thrones: Dragonfire.  Fan-made and unofficial.

## Files

- `src.html` – page layout and styles
- `app.js` – the app: scoring, optimizer, roster tools, accounts and cloud saves
- `catalog.json` – all 36 dragons: rarity, breed, role, affinity, speed, habit summaries, and synergy tags (`@N` = unlocks at N stars)
- `heirlooms.json` – the Dragon Growth heirloom nodes: breed or rarity, kind, and House Level, read from the game on 2026-10-06
- `sample.json` – the sample roster, its in-game test results, and its heirlooms
- `index.html` – the built page (do not edit by hand)
- `build.py` – builds `index.html` from the files above
- `habits_src.py` – our own one-line habit summaries; run it to merge them into `catalog.json`
- `video_2026-10-06.py` – stats read from a Dragon Pit screen recording on 2026-10-06
- `supabase.sql` – one-time database setup for accounts (already run on the project)

## Build

```
python build.py
```
