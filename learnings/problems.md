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

### B6 `converse` gave up after the first dialogue choice
- **Seen:** 2026-10-21, iamnotabot, `rune_mysteries.ts` stage 2, Sedridor (3103, 9571)
- **What happened:** it clicked "I'm looking for the head wizard." and then returned with the dialog closed and no research package. The script failed with `No research package from Sedridor`.
- **Cause:** `converse` waited a fixed 1-2 ticks after each click. The next page hadn't arrived yet (or `isWaiting` was set), so it decided the chat was over. Also: `talkTo(/head wizard/)` right after climbing down a ladder found no NPC, because the NPC list lags the climb.
- **Status / workaround:** fixed in `bots/_shared/lib.ts`. After a click it waits up to 5 s for `dialog.pageId` to change, and up to 5 s for a closed or waiting dialog to reopen. `rune_mysteries` walks next to Sedridor first and retries the talk; quest state persists, so a cut-short chat just resumes. The handover then went through on the first try.

### B7 `walkTo` can't leave the Wizards' Tower: "destination tile is blocked"
- **Seen:** 2026-10-21, iamnotabot, after climbing the basement ladder to (3105, 3163)
- **What happened:** every destination outside the tower failed with `No path to (x, z) ... destination tile is blocked`, including 8 offsets around a waypoint. Nearby targets failed with `stops N tiles short at (3106, 3162) ... locked door or separate room?`. All three tower doors were already open (their option was `Close`).
- **Cause:** the client-side pathfinder in `walkTo` treats the open doors as walls. The "destination blocked" wording is misleading: the start was enclosed, not the destination. The server is fine: raw `sdk.sendWalk(3109, 3170)` walked straight out.
- **Status / workaround:** workaround. `rune_mysteries` calls `sdk.sendWalk(3109, 3170)` after climbing up. Filed with `bun sdk/bug-report.ts`. General lesson: when `walkTo` says every tile is blocked, try `sendWalk` toward the exit before adding route offsets.

### B8 iamnotabot died twice around Lumbridge
- **Seen:** 2026-10-21, iamnotabot, combat 6 / 11 HP. First death in the woods west of Lumbridge castle, walking straight to the Wizards' Tower. Second during `rune_mysteries` stage 3, after `OK Lumbridge north -> (3218, 3262)`. Found afterwards at (3194, 3282) with "Oh dear you are dead!" and two Attack level-ups in the messages.
- **What happened:** the first death was aggressive goblins/spiders west of the castle. Before the second, `eatIfLow` logged `HP low, ate: Failed to use inventory item`, while shrimps and bread were in the inventory. The second death lost the research package, 38 coins, the bronze axe and all food.
- **Cause:** partly unknown. The first was the route (fixed by the Draynor road, `LUMBRIDGE_TO_WIZARD_TOWER`). For the second: `eatFood()` with no target failed to eat (unknown why; now passed an explicit pattern, which is unverified). The script had also hung (see L1), so nothing was steering while the bot was attacked. An experimental `fightOffAttackers` helper in `bots/iamnotabot/lib.ts` attacks level ≤6 NPCs that are in combat nearby. It is a suspect and was deliberately not promoted.
- **Status / workaround:** open. A combat-6 bot should avoid fights, not take them: carry food and don't idle on aggressive routes. Losing the package isn't fatal: Sedridor re-issues it (`sedridor.rs2`), and Aubury re-issues the notes.

### B9 MCP `execute_code` caps out at 2 minutes
- **Seen:** 2026-10-21, iamnotabot, walking Lumbridge → GE through `execute_code`
- **What happened:** the call was cut off mid-walk near the dark wizards. Repeated short `execute_code` calls also served stale state until `disconnect_bot` and a reconnect.
- **Status / workaround:** use standalone scripts (`bun bots/<name>/x.ts`, or `bots/_shared/run.ts`) for anything longer than a quick check, and `disconnect_bot` before running a script on the same bot.

## Lag and timing

When a lag incident happens, write down the numbers: wall time vs game ticks, `sdk.getStateAge()`, and which call stalled. These are the documented signs to look for:

- **Stale state:** `sdk.getStateAge()` keeps growing, and positions or inventory stop updating. Check it before acting after a disconnect or a long pause.
- **Silently dropped actions:** `send*` returns success but nothing happens. Compare `state.opFeedback.opRejectedCount` before and after the send.
- **Walks that time out:** `walkTo` failing on a route that normally works (the shared routes use a 90 s timeout per leg).
- **Disconnects:** `[LOGOUT DEBUG] SDK WebSocket closed` in the middle of a script, or the lite runner exiting.

### L1 Gateway timeout froze a running script
- **Seen:** 2026-10-21 ~22:20, iamnotabot, `rune_mysteries.ts` stage 3 near Lumbridge north (3218, 3262)
- **What happened:** the script printed no more output, without an error or a timeout. `bun sdk/cli.ts iamnotabot` failed twice with `Failed to connect to wss://rs-sdk-demo.fly.dev/gateway — Connection timeout`, while https://rs-sdk-demo.fly.dev/ answered 200 in 0.7 s. MCP `execute_code` still connected, because it reused the already-attached client, and showed `getStateAge()` 122 ms. By then the bot had died (B8).
- **Cause:** unknown; the gateway websocket was unreachable or overloaded, not the web server.
- **Status / workaround:** open. A long-running script can hang silently. If its log stops moving, check `ps aux | grep bots/`, then the bot state through MCP, and kill the script. Scripts should get a "no progress for N s" watchdog.

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

### W3 Rune Mysteries details (from the server scripts, confirmed in play)
- **Wiki gap:** coordinates and dialogue picks for a bot.
- **Reality:**
  - Duke Horacio is on Lumbridge castle L1 (3212, 3220), up the stairs at (3206, 3210). Pick "Have you any quests for me?" then "Sure, no problem."
  - Sedridor is in the Wizards' Tower basement at (3103, 9571), via the ladder at about (3105, 3163). Pick "I'm looking for the head wizard.", then "Ok, here you are.", then "Yes, certainly."
  - Aubury is at (3253, 3402). Pick "I have been sent here with a package for you.", then talk to him again to get the notes.
  - Every item is re-issued if lost. After the quest, Aubury's op4 "Teleport" goes to the essence mine (map square 45_75), and the air ruins are at (2985, 3292).
