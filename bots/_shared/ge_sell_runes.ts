import { runScript } from '../../sdk/runner';

// At the GE: sell starter air runes into the standing buy offers to fund a
// steel axe (200 gp at Bob's Brilliant Axes, Lumbridge).
// Usage: bun bots/_shared/ge_sell_runes.ts <botname>   (run walk_to_ge first)
const AIR_RUNE = 556;
const TARGET_COINS = 200;
const FALLBACK_PRICE = 10;

await runScript(async ({ bot, sdk }) => {
    await bot.skipTutorial();
    const coins = () => sdk.findInventoryItem(/^coins$/i)?.count ?? 0;
    const runes = sdk.findInventoryItem(/^air rune$/i);
    if (!runes) throw new Error('No air runes in inventory');

    // Price at the current best bid so the offer fills immediately.
    let price = FALLBACK_PRICE;
    try {
        const market = await sdk.getMarketItems('air rune');
        const bid = market.items.find(m => m.id === AIR_RUNE)?.bid;
        if (bid) price = bid;
    } catch (e) {
        console.log(`Market read failed, using ${FALLBACK_PRICE} gp: ${(e as Error).message}`);
    }
    console.log(`Selling ${runes.count} air runes @ ${price} gp (coins now ${coins()})`);

    const open = await bot.openGE(60_000);
    if (!open.success) throw new Error(`openGE: ${open.message}`);

    const offer = await bot.placeGEOffer({ item: AIR_RUNE, side: 'sell', quantity: runes.count, price });
    console.log(`placeGEOffer: ${offer.success} ${offer.message}`);
    if (!offer.success) throw new Error(offer.message);

    // Wait up to 60s for the sale to fill.
    await sdk.waitForCondition(() => {
        const o = sdk.getGEState()?.offers.find(x => x.id === offer.offer?.id);
        return !!o && (o.state === 'completed' || o.coins > 0 && o.remaining === 0);
    }, 60_000).catch(() => console.log('Offer not fully filled after 60s; collecting what sold'));

    const o = sdk.getGEState()?.offers.find(x => x.id === offer.offer?.id);
    if (o) console.log(`Offer: filled ${o.filled}/${o.quantity}, coins ${o.coins}, tax ${o.tax}, state ${o.state}`);

    const collect = await bot.collectGE();
    console.log(`collectGE: ${collect.success} ${collect.message}`);
    await bot.closeInterface();

    console.log(`Coins: ${coins()} ${coins() >= TARGET_COINS ? '(enough for a steel axe)' : `(short of ${TARGET_COINS})`}`);
}, { timeout: 3 * 60_000 });
