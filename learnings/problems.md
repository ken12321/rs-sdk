# Problems log

Every problem we hit while running bots: SDK or tooling bugs, script failures,
what lag looks like, and places where the wiki disagrees with the live game.
Add an entry whenever something surprises you, even if you worked around it,
and give each entry an ID so it can be referenced. Update the **Status** line
instead of deleting entries; the history is the point.

Entry format:

```
### <ID> <short title>
- **Seen:** date, bot, script, position
- **What happened:** exact message or observed behaviour
- **Cause:** what it turned out to be, or "unknown"
- **Status / workaround:** open | fixed (how) | workaround (what)
```

SDK bugs should also be filed with `bun sdk/bug-report.ts "..."` (see CLAUDE.md).
Note the entry ID in the report.

## Bugs and tooling

### B1 Lite client can't start: `Cannot find package 'fflate'`
- **Seen:** 2026-10-21, iamnotabot2, first `bots/_shared/run.ts` launch
- **What happened:** `server/webclient/src/lite/runner.ts` exited with code 1: `Cannot find package 'fflate' from .../server/webclient/src/lite/world/LocIndex.ts`.
- **Cause:** `server/webclient` has its own dependencies and `bun install` had never been run there. The root `bun install` doesn't cover it.
- **Status / workaround:** fixed. `run.ts` runs `bun install` in `server/webclient` when `node_modules` is missing.

### B2 `fish.ts` can't buy a net: `Shopkeeper not found: /gerrant/i`
- **Seen:** 2026-10-21, iamnotabot2, `bots/_shared/fish.ts`, ended at (3037, 3251)
- **What happened:** with no net in inventory, the script walks to Gerrant's at (3013, 3225) and calls `openShop(/gerrant/i)`. It got `Shopkeeper not found`, then `Shop is not open`, and the bot was still around (3037, 3251), about 35 tiles from the shop.
- **Cause:** unknown. The `walkTo(3013, 3225)` result is never checked, so the walk probably failed or stopped short. The bot also had 0 coins (see B3), so the purchase would have failed anyway.
- **Status / workaround:** open. Check the `walkTo` result and coins before buying; give the bot a net instead.

### B3 iamnotabot2 lost its whole starter kit
- **Seen:** 2026-10-21, iamnotabot2. The lab log at 21:20 showed the starter kit (including a net, 18/28 slots). By 22:03 the inventory was 0/28, with 0 coins, at (3037, 3251), HP 11/11.
- **What happened:** nothing in our logs explains it.
- **Cause:** unknown, not investigated. Possibilities to check: a death (dark wizards near the Draynor spot), another session controlling the bot, or the kit being dropped or banked.
- **Status / workaround:** open. Before blaming a script, check `bun sdk/cli.ts <bot>` and whether another process is driving the bot.

### B4 A half-written log looked like a failed run
- **Seen:** 2026-10-21, iamnotabot, `rune_mysteries.ts`
- **What happened:** the log ended right after `== Stage 1: Duke Horacio`, so the script was catalogued as "stalled in stage 1".
- **Cause:** the script was still running (or was stopped) while the log was being read. A later run started in the Wizards' Tower basement and got through the talisman handover with Sedridor, so stage 1 had worked.
- **Status / workaround:** lesson. Check `ps aux | grep bots/` before treating a log that ends abruptly as a failure.

### B5 No `timeout` command on macOS
- **Seen:** 2026-10-21, running scripts from zsh on darwin
- **What happened:** `timeout 200 bun ...` failed with `command not found: timeout`.
- **Status / workaround:** use the script's own `runScript` timeout, or `gtimeout` from coreutils.

## Lag and timing

No lag incident has been recorded yet. When one happens, write down the numbers: wall time vs game ticks, `sdk.getStateAge()`, and which call stalled. These are the documented signs to look for:

- **Stale state:** `sdk.getStateAge()` keeps growing, and positions or inventory stop updating. Check it before acting after a disconnect or a long pause.
- **Silently dropped actions:** `send*` returns success but nothing happens. Compare `state.opFeedback.opRejectedCount` before and after the send.
- **Walks that time out:** `walkTo` failing on a route that normally works (the shared routes use a 90 s timeout per leg).
- **Disconnects:** `[LOGOUT DEBUG] SDK WebSocket closed` in the middle of a script, or the lite runner exiting.

## Wiki vs reality

### W1 XP rates are about 29× the standard values
- **Seen:** 2026-10-21, iamnotabot, `woodcut.ts willow 15`
- **Reality:** 54 willow logs gave +106,312 Woodcutting XP, about 1,969 XP per log (standard is 67.5), or about 424k XP/hr. Woodcutting went from 41 to 68 in 15 minutes.
- **Also:** iamnotabot2 gained a Fishing level from 4 shrimp in 60 s. At the standard 10 XP per shrimp that's 40 XP, short of the 83 needed for level 2.
- **Implication:** level-based plans from the wiki (or general RuneScape knowledge) take far less time here. Plan around levels, not XP/hr guides.

### W2 There are willows north of Lumbridge castle
- **Seen:** 2026-10-21, iamnotabot
- **Wiki:** `wiki/skills/woodcutting.md` lists willows only "SW of Draynor bank, NW of Seers bank".
- **Reality:** willows at (3233, 3244), north of Lumbridge castle. There are no dark wizards there, unlike the Draynor willows (`learnings/woodcutting.md`). This is the spot used by `bots/_shared/woodcut.ts`.
