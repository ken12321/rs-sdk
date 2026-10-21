import { runScript } from '../../sdk/runner';
import { LUMBRIDGE_TO_VARROCK, eatIfLow, fmt, pos, walkRoute } from './lib';

// Lumbridge -> Varrock Grand Exchange, in one run.
// Usage: bun bots/_shared/walk_to_ge.ts <botname>
// Route swings west of the Dark wizard stone circle (~3225,3370) that sits
// beside the main road south of Varrock, then follows the west side of Varrock.
const WAYPOINTS = [...LUMBRIDGE_TO_VARROCK, { x: 3181, z: 3443, name: 'Grand Exchange' }];

await runScript(async (ctx) => {
    const { bot } = ctx;
    await bot.skipTutorial();

    // Skip waypoints we've already passed (we walk roughly south -> north).
    const start = pos(ctx);
    let i = WAYPOINTS.findIndex(w => w.z > start.z + 5);
    if (i < 0) i = WAYPOINTS.length - 1;
    console.log(`Start ${fmt(ctx)} -> leg ${i}: ${WAYPOINTS[i]!.name}`);

    await eatIfLow(ctx);
    await walkRoute(ctx, WAYPOINTS.slice(i));

    const ge = await bot.openGE(20_000);
    console.log(`openGE: ${ge.success} ${ge.message}`);
    await bot.closeInterface();
}, { timeout: 6 * 60_000 });
