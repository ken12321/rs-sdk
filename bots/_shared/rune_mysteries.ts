import { runScript } from '../../sdk/runner';
import { LUMBRIDGE_TO_VARROCK, LUMBRIDGE_TO_WIZARD_TOWER, VARROCK_TO_LUMBRIDGE, avoidFights, climb, converse, fmt, has, pos, walkRoute, scriptArgs } from './lib';

// PARTLY PROVEN: stages 1-2 work and the walk back reaches Lumbridge north;
// stages 3-4 haven't been seen to finish (the bot died on the way, see B8).
// Usage: bun bots/_shared/rune_mysteries.ts <botname>
// Rune Mysteries, start to finish (unlocks Aubury's essence-mine teleport).
// Dialogue picks come straight from the server scripts:
//   areas/area_lumbridge/scripts/duke_horacio.rs2
//   areas/area_wizard_tower/scripts/sedridor.rs2
//   areas/area_varrock/scripts/aubury.rs2
// Resumable: the stage is worked out from what's in the inventory.
const LUMBRIDGE_STAIRS = { x: 3206, z: 3210 };   // SW tower staircase, ground floor
const DUKE = { x: 3212, z: 3220 };               // first floor
const AUBURY = { x: 3253, z: 3402 };             // rune shop, east Varrock
const SEDRIDOR = { x: 3103, z: 9571 };           // Wizards' Tower basement, past a door

// Pass `lost` after a death that lost the package (quest items aren't in the bank):
// the stage can't be read from an empty inventory, and Sedridor re-issues it.
const LOST = scriptArgs()[0] === 'lost';
const TALISMAN = /^air talisman$/i, PACKAGE = /^research package$/i, NOTES = /^research notes$/i;

await runScript(async (ctx) => {
    const { bot } = ctx;
    await bot.skipTutorial();
    const inBasement = () => pos(ctx).z > 6000;

    async function toSedridor(from: 'lumbridge' | 'varrock') {
        if (from === 'varrock') await walkRoute(ctx, VARROCK_TO_LUMBRIDGE);
        // Start from Lumbridge north-west unless we're already well along the road west;
        // cutting across from elsewhere goes through the goblin/spider woods.
        const x = pos(ctx).x;
        await walkRoute(ctx, x < 3140 ? LUMBRIDGE_TO_WIZARD_TOWER.filter(w => w.x < x - 5) : LUMBRIDGE_TO_WIZARD_TOWER);
        await climb(ctx, 'down');
    }
    async function talkSedridor(wanted: RegExp[], done: () => boolean) {
        // NPC list can lag a climb, and he's behind a door: walk over first.
        await bot.walkTo(SEDRIDOR.x, SEDRIDOR.z, 2);
        await ctx.sdk.waitForTicks(2);
        // Quest state persists between talks, so a cut-short chat just resumes.
        for (let i = 0; i < 3 && !done(); i++) await converse(ctx, /head wizard|sedridor/i, wanted);
    }
    async function toAubury() {
        if (inBasement()) await climb(ctx, 'up');
        // walkTo's pathfinder thinks the open tower doors are walls (B7); the server's
        // own walk routes through them fine.
        if (pos(ctx).z < 3170 && pos(ctx).x < 3115) {
            await ctx.sdk.sendWalk(3109, 3170, true);
            await ctx.sdk.waitForCondition(() => pos(ctx).z >= 3169, 20_000).catch(() => {});
            console.log(`Left the tower -> ${fmt(ctx)}`);
        }
        await walkRoute(ctx, [...LUMBRIDGE_TO_WIZARD_TOWER].reverse().slice(1)); // back east to Lumbridge
        await walkRoute(ctx, LUMBRIDGE_TO_VARROCK);
        const r = await bot.walkTo(AUBURY.x, AUBURY.z, 3, { timeout: 90_000 });
        if (!r.success) throw new Error(`Walk to Aubury: ${r.message}`);
    }

    console.log(`Start ${fmt(ctx)}`);
    await avoidFights(ctx);

    // 2b. Package lost after handing over the talisman: Sedridor gives another, no choices.
    if (LOST && !has(ctx, TALISMAN) && !has(ctx, PACKAGE) && !has(ctx, NOTES)) {
        console.log('== Stage 2b: Sedridor (replacement package)');
        if (!inBasement()) await toSedridor(pos(ctx).z > 3350 ? 'varrock' : 'lumbridge');
        await talkSedridor([], () => has(ctx, PACKAGE));
        if (!has(ctx, PACKAGE)) throw new Error('Sedridor did not re-issue the package');
    }

    // 1. Duke Horacio -> air talisman
    if (!LOST && !has(ctx, TALISMAN) && !has(ctx, PACKAGE) && !has(ctx, NOTES)) {
        console.log('== Stage 1: Duke Horacio');
        await bot.walkTo(LUMBRIDGE_STAIRS.x, LUMBRIDGE_STAIRS.z, 3);
        await climb(ctx, 'up');
        await bot.walkTo(DUKE.x, DUKE.z, 3);
        await converse(ctx, /^duke horacio$/i, [/quests for me/i, /sure, no problem/i]);
        if (!has(ctx, TALISMAN)) throw new Error('Duke did not hand over the air talisman');
        await bot.walkTo(LUMBRIDGE_STAIRS.x, LUMBRIDGE_STAIRS.z, 3);
        await climb(ctx, 'down');
    }

    // 2. Sedridor: hand over talisman -> research package
    if (has(ctx, TALISMAN) && !has(ctx, PACKAGE) && !has(ctx, NOTES)) {
        console.log('== Stage 2: Sedridor (talisman)');
        if (!inBasement()) await toSedridor(pos(ctx).z > 3350 ? 'varrock' : 'lumbridge');
        await talkSedridor([/looking for the head wizard/i, /ok, here you are/i, /yes, certainly/i], () => has(ctx, PACKAGE));
        if (!has(ctx, PACKAGE)) throw new Error('No research package from Sedridor');
    }

    // 3. Aubury: deliver package, talk again -> research notes
    if (has(ctx, PACKAGE)) {
        console.log('== Stage 3: Aubury');
        await toAubury();
        for (let i = 0; i < 4 && !has(ctx, NOTES); i++) await converse(ctx, /^aubury$/i, [/package for you/i]);
        if (!has(ctx, NOTES)) throw new Error('No research notes from Aubury');
    }

    // 4. Sedridor: notes -> quest complete (air talisman back as reward)
    if (has(ctx, NOTES)) {
        console.log('== Stage 4: Sedridor (notes)');
        if (!inBasement()) await toSedridor(pos(ctx).z > 3350 ? 'varrock' : 'lumbridge');
        await talkSedridor([], () => !has(ctx, NOTES));
        if (has(ctx, NOTES)) throw new Error('Sedridor did not take the notes');
        console.log(`Quest complete! Air talisman: ${has(ctx, TALISMAN)}`);
    }

    console.log(`End ${fmt(ctx)}`);
}, { timeout: 15 * 60_000 });
