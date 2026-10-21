# Shared bot scripts

Refined scripts any bot can run. Everything here is committed. Per-bot folders
(`bots/<name>/`) are gitignored and are the scratchpad for new ideas: once a
script there has proven itself, promote it here.

## Running

```bash
bun bots/create-bot.ts mybot                       # once per bot
bun bots/_shared/run.ts mybot woodcut willow 15    # starts mybot's lite client if needed, then runs
bun bots/_shared/run.ts mybot --stop               # stop mybot's lite client
```

`run.ts` starts `server/webclient/src/lite/runner.ts` for the bot in the background
(pid in `bots/<name>/lite.pid`, output in `lite.log`), reuses it on later runs,
and saves the script's output to `bots/<name>/<script>.log`.

If a lite client or browser is already attached, run a script directly instead.
The bot name always comes first:

```bash
bun bots/_shared/woodcut.ts mybot willow 15
```

## Catalog

| Script | Status | Usage (after `<botname>`) | Needs | Evidence |
| --- | --- | --- | --- | --- |
| `woodcut` | ✅ proven | `[tree\|oak\|willow] [minutes] [x z]` | any axe | iamnotabot, willow at (3233,3244), 15 min: 54 logs, WC 41→68, ~424k xp/hr |
| `fish` | ✅ proven | `[minutes]` | small fishing net (starter kit has one) | iamnotabot2, fresh bot, Draynor net 60 s: 4 shrimp and +1 level. ⚠️ The buy-a-net fallback (Gerrant, Port Sarim) is unproven: see B2 in `learnings/problems.md` |
| `walk_to_ge` | ✅ proven | – | – | iamnotabot, Lumbridge → GE west of the Dark wizard circle |
| `ge_sell_runes` | ✅ proven | – | at GE, starter air runes | iamnotabot, raised ≥200 gp for the axe |
| `buy_axe` | ✅ proven | – | ≥200 coins, at GE | iamnotabot, banked junk at Varrock West, bought a steel axe from Bob |
| `rune_mysteries` | ⚠️ partly proven | – | food; combat 6 died on the way (B8) | iamnotabot: stage 1 (Duke) and stage 2 (Sedridor → research package) worked; left the tower and walked back to Lumbridge north, then died. Stages 3–4 not yet seen to finish. Resumable from inventory |

`lib.ts` holds the shared helpers: `walkRoute`, the safe `LUMBRIDGE_TO_VARROCK`
and `LUMBRIDGE_TO_WIZARD_TOWER` routes, `climb`, `converse` (waits for each
dialogue page to change; see B6), `eatIfLow` and `scriptArgs`.

In development in `bots/iamnotabot/` (not yet run): `mine_essence` (Aubury
teleport → essence → Varrock East bank) and `craft_air` (Falador East bank →
air altar), the air-rune money loop that follows Rune Mysteries.

## Fresh-bot recipe

This is the order that took iamnotabot from spawn to fast woodcutting:

```bash
bun bots/create-bot.ts mybot
bun bots/_shared/run.ts mybot walk_to_ge
bun bots/_shared/run.ts mybot ge_sell_runes
bun bots/_shared/run.ts mybot buy_axe
bun bots/_shared/run.ts mybot woodcut willow 15
```

Shrimp fishing works straight from spawn: `bun bots/_shared/run.ts mybot fish 5`.

## Adding a script

1. Develop it in `bots/<name>/` and run it there until a logged run succeeds.
2. Copy it here. Take the bot name as the first argument and read the rest with
   `scriptArgs()`. Start with `await bot.skipTutorial()` and reuse `lib.ts`.
3. Add a row to the catalog with the evidence (bot, spot, duration, result),
   and mark it ⚠️ until it has run successfully from here.
