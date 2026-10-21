import { runScript } from '../../sdk/runner';
import { scriptArgs } from './lib';

// Power-fish shrimp at the Draynor net/bait spots (level 1), dropping raw fish when full.
// Usage: bun bots/_shared/fish.ts <botname> [minutes]
//   bun bots/_shared/fish.ts mybot 1   -> proven: 4 shrimp and a level in 60s from a fresh bot
// Stay south of z≈3232: dark wizards.
const SPOT_AREA = { x: 3087, z: 3228 };
const MAX_DRIFT = 15;
const [minutesArg = '1'] = scriptArgs();
const DURATION_MS = Number(minutesArg) * 60_000;

await runScript(async ({ bot, sdk }) => {
    await bot.skipTutorial();

    const inv = () => sdk.getInventory();
    console.log('Inventory:', inv().map((i) => `${i.name} x${i.count}`).join(', '));

    if (!sdk.findInventoryItem(/small fishing net/i)) {
        console.log('No small fishing net - buying one at Gerrant\'s (Port Sarim)');
        await bot.walkTo(3013, 3225);
        const opened = await bot.openShop(/gerrant/i);
        console.log('openShop:', opened.message);
        const bought = await bot.buyFromShop(/small fishing net/i, 1);
        console.log('buy:', bought.message);
        await bot.closeShop();
        if (!sdk.findInventoryItem(/small fishing net/i)) throw new Error('Could not get a small fishing net');
    }

    const p0 = sdk.getState()!.player!;
    if (Math.hypot(p0.worldX - SPOT_AREA.x, p0.worldZ - SPOT_AREA.z) > MAX_DRIFT) {
        console.log(`Walking to Draynor fishing spot from (${p0.worldX}, ${p0.worldZ})`);
        const walk = await bot.walkTo(SPOT_AREA.x, SPOT_AREA.z);
        console.log('walkTo:', walk.message);
    }

    const startXp = sdk.getSkillXp('fishing') ?? 0;
    const end = Date.now() + DURATION_MS;
    while (Date.now() < end) {
        if (inv().length >= 28) {
            // Power-fish: drop raw catches to keep going.
            const raw = inv().filter((i) => /^raw /i.test(i.name));
            if (raw.length === 0) {
                console.log('Inventory full of non-fish, stopping');
                break;
            }
            console.log(`Inventory full, dropping ${raw.length} raw fish`);
            for (const item of raw) {
                await sdk.sendDropItem(item.slot);
                await sdk.waitForTicks(1);
            }
            continue;
        }

        const p = sdk.getState()!.player!;
        if (Math.hypot(p.worldX - SPOT_AREA.x, p.worldZ - SPOT_AREA.z) > MAX_DRIFT) {
            await bot.walkTo(SPOT_AREA.x, SPOT_AREA.z);
        }

        const spot = sdk.getState()!.nearbyNpcs.find((npc) =>
            /fishing\s*spot/i.test(npc.name) &&
            npc.optionsWithIndex.some((o) => /^net$/i.test(o.text)) &&
            npc.optionsWithIndex.some((o) => /^bait$/i.test(o.text)),
        );
        if (!spot) {
            console.log('No net spot visible, waiting');
            await sdk.waitForTicks(3);
            continue;
        }

        const res = await bot.interactNpc(spot, /^net$/i);
        if (!res.success) {
            console.log('interact failed:', res.message);
            await sdk.waitForTicks(2);
            continue;
        }

        // Wait for a catch (XP gain) or the spot to move / us to go idle.
        const xpBefore = sdk.getSkillXp('fishing') ?? 0;
        await sdk.waitForCondition(
            (s) => (s.skills.find((k) => /fishing/i.test(k.name))?.experience ?? 0) > xpBefore,
            20_000,
        ).catch(() => {});
    }

    const counts = new Map<string, number>();
    for (const i of inv()) counts.set(i.name, (counts.get(i.name) ?? 0) + i.count);
    console.log('Fishing XP gained:', (sdk.getSkillXp('fishing') ?? 0) - startXp);
    console.log('Inventory:', [...counts].map(([n, c]) => `${n} x${c}`).join(', '));
}, {
    timeout: DURATION_MS + 240_000,
});
