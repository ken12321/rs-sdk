import { runScript } from '../../sdk/runner';
import { VARROCK_TO_LUMBRIDGE, fmt, walkRoute } from './lib';

// From the GE: bank the starter junk at Varrock West (frees inventory for logs),
// walk back to Lumbridge (west of the Dark wizard circle) and buy a steel axe
// from Bob's Brilliant Axes. There is no bank in Lumbridge, so do this first.
// Usage: bun bots/_shared/buy_axe.ts <botname>   (run ge_sell_runes first)
const VARROCK_WEST_BANK = { x: 3185, z: 3436 };
const ROUTE_SOUTH = [...VARROCK_TO_LUMBRIDGE, { x: 3230, z: 3203, name: "Bob's Brilliant Axes" }];
const KEEP = /^(bronze axe|tinderbox|shrimps|bread|coins)$/i;
const AXE_PRICE = 200;

await runScript(async (ctx) => {
    const { bot, sdk } = ctx;
    await bot.skipTutorial();
    const coins = () => sdk.findInventoryItem(/^coins$/i)?.count ?? 0;
    if (coins() < AXE_PRICE) throw new Error(`Only ${coins()} coins; run ge_sell_runes.ts first`);

    // 1. Bank everything we don't need for woodcutting.
    const r = await bot.walkTo(VARROCK_WEST_BANK.x, VARROCK_WEST_BANK.z, 3);
    if (!r.success) throw new Error(`Walk to bank: ${r.message}`);
    const bank = await bot.openBank();
    if (!bank.success) throw new Error(`openBank: ${bank.message}`);
    const junk = [...new Set(sdk.getInventory().filter(i => !KEEP.test(i.name)).map(i => i.name))];
    for (const name of junk) {
        const d = await bot.depositItem(new RegExp(`^${name}$`, 'i'), -1);
        console.log(`Deposit ${name}: ${d.success ? 'ok' : d.message}`);
    }
    await bot.closeBank();
    console.log(`Inventory now: ${sdk.getInventory().map(i => i.name).join(', ')}`);

    // 2. Walk back south to Bob's.
    await walkRoute(ctx, ROUTE_SOUTH);

    // 3. Buy the axe.
    const shop = await bot.openShop(/^bob$/i);
    if (!shop.success) throw new Error(`openShop: ${shop.message}`);
    const buy = await bot.buyFromShop(/^steel axe$/i, 1);
    console.log(`Buy steel axe: ${buy.success} ${buy.message}`);
    await bot.closeShop();
    console.log(`Done at ${fmt(ctx)}, coins left ${coins()}, steel axe: ${!!sdk.findInventoryItem(/^steel axe$/i)}`);
}, { timeout: 7 * 60_000 });
