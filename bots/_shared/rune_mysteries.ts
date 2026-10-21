import { runScript } from '../../sdk/runner';
import { LUMBRIDGE_TO_VARROCK, VARROCK_TO_LUMBRIDGE, climb, converse, fmt, has, pos, walkRoute } from './lib';

// UNPROVEN: the only run so far stopped in stage 1 (Duke Horacio).
// Usage: bun bots/_shared/rune_mysteries.ts <botname>
// Rune Mysteries, start to finish (unlocks Aubury's essence-mine teleport).
// Dialogue picks come straight from the server scripts:
//   areas/area_lumbridge/scripts/duke_horacio.rs2
//   areas/area_wizard_tower/scripts/sedridor.rs2
//   areas/area_varrock/scripts/aubury.rs2
// Resumable: the stage is worked out from what's in the inventory.
const LUMBRIDGE_STAIRS = { x: 3206, z: 3210 };   // SW tower staircase, ground floor
const DUKE = { x: 3212, z: 3220 };               // first floor
const WIZARD_TOWER = { x: 3109, z: 3166 };       // ground floor, ladder to basement inside
const AUBURY = { x: 3253, z: 3402 };             // rune shop, east Varrock

const TALISMAN = /^air talisman$/i, PACKAGE = /^research package$/i, NOTES = /^research notes$/i;

await runScript(async (ctx) => {
    const { bot } = ctx;
    await bot.skipTutorial();
    const inBasement = () => pos(ctx).z > 6000;

    async function toSedridor(from: 'lumbridge' | 'varrock') {
        if (from === 'varrock') await walkRoute(ctx, VARROCK_TO_LUMBRIDGE);
        const r = await bot.walkTo(WIZARD_TOWER.x, WIZARD_TOWER.z, 3, { timeout: 120_000 });
        if (!r.success) throw new Error(`Walk to Wizards' Tower: ${r.message}`);
        await climb(ctx, 'down');
    }
    async function toAubury() {
        if (inBasement()) await climb(ctx, 'up');
        await bot.walkTo(3222, 3260, 4, { timeout: 120_000 }); // back to Lumbridge north
        await walkRoute(ctx, LUMBRIDGE_TO_VARROCK);
        const r = await bot.walkTo(AUBURY.x, AUBURY.z, 3, { timeout: 90_000 });
        if (!r.success) throw new Error(`Walk to Aubury: ${r.message}`);
    }

    console.log(`Start ${fmt(ctx)}`);

    // 1. Duke Horacio -> air talisman
    if (!has(ctx, TALISMAN) && !has(ctx, PACKAGE) && !has(ctx, NOTES)) {
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
        await converse(ctx, /head wizard|sedridor/i, [/looking for the head wizard/i, /ok, here you are/i, /yes, certainly/i]);
        if (!has(ctx, PACKAGE)) throw new Error('No research package from Sedridor');
    }

    // 3. Aubury: deliver package, talk again -> research notes
    if (has(ctx, PACKAGE)) {
        console.log('== Stage 3: Aubury');
        await toAubury();
        await converse(ctx, /^aubury$/i, [/package for you/i]);
        if (!has(ctx, NOTES)) await converse(ctx, /^aubury$/i, [/package for you/i]);
        if (!has(ctx, NOTES)) throw new Error('No research notes from Aubury');
    }

    // 4. Sedridor: notes -> quest complete (air talisman back as reward)
    if (has(ctx, NOTES)) {
        console.log('== Stage 4: Sedridor (notes)');
        if (!inBasement()) await toSedridor(pos(ctx).z > 3350 ? 'varrock' : 'lumbridge');
        await converse(ctx, /head wizard|sedridor/i, []);
        if (has(ctx, NOTES)) throw new Error('Sedridor did not take the notes');
        console.log(`Quest complete! Air talisman: ${has(ctx, TALISMAN)}`);
    }

    console.log(`End ${fmt(ctx)}`);
}, { timeout: 15 * 60_000 });
