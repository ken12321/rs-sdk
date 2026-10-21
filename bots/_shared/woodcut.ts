import { runScript } from '../../sdk/runner';
import { scriptArgs } from './lib';

// Power-chop: chop the nearest matching tree, drop logs when full, stay in the area.
// Usage: bun bots/_shared/woodcut.ts <botname> [tree|oak|willow] [minutes] [x z]
//   bun bots/_shared/woodcut.ts mybot tree 0.2          -> 12s test at Lumbridge west trees
//   bun bots/_shared/woodcut.ts mybot willow 15         -> proven: WC 41 -> 68 in 15 min
//   bun bots/_shared/woodcut.ts mybot oak 10 3207 3358  -> 10 min of oaks at a chosen spot
const SPOTS: Record<string, { tree: RegExp; x: number; z: number }> = {
    tree:   { tree: /^tree$/i,   x: 3195, z: 3220 }, // Lumbridge west cluster
    oak:    { tree: /^oak$/i,    x: 3195, z: 3220 }, // scout first; override with x z
    willow: { tree: /^willow$/i, x: 3233, z: 3244 }, // north of Lumbridge castle
};
const [kind = 'tree', minutesArg = '1', xArg, zArg] = scriptArgs();
const spot = SPOTS[kind];
if (!spot) throw new Error(`Unknown tree type "${kind}"; use one of ${Object.keys(SPOTS).join(', ')}`);
const AREA = { x: xArg ? Number(xArg) : spot.x, z: zArg ? Number(zArg) : spot.z };
const DURATION_MS = Number(minutesArg) * 60_000;
const MAX_DRIFT = 15;
const EAT_AT_HP = 5;

await runScript(async ({ bot, sdk }) => {
    await bot.skipTutorial();
    const wc = () => sdk.getSkill('woodcutting')!;
    const startXp = wc().experience;
    const startLevel = wc().baseLevel;
    const t0 = Date.now();
    let logs = 0, fails = 0;

    if (!sdk.findInventoryItem(/axe$/i)) throw new Error('No axe in inventory');
    console.log(`Chopping ${kind} around (${AREA.x}, ${AREA.z}) for ${minutesArg} min, WC ${startLevel}`);

    while (Date.now() - t0 < DURATION_MS) {
        const s = sdk.getState()!;
        if (sdk.getSkill('hitpoints')!.level <= EAT_AT_HP) await bot.eatFood();

        if (s.inventory.length >= 28) {
            const d = await bot.dropItem(/logs$/i, 'all');
            console.log(`Inventory full, dropped ${d.slotsDropped} logs`);
            continue;
        }

        const p = s.player!;
        if (Math.hypot(p.worldX - AREA.x, p.worldZ - AREA.z) > MAX_DRIFT) {
            await bot.walkTo(AREA.x, AREA.z, 4);
            continue;
        }

        const tree = sdk.findNearbyLoc(spot.tree, { reachable: true });
        if (!tree) {
            console.log('No reachable tree nearby; walking back to the area centre');
            await bot.walkTo(AREA.x, AREA.z, 2);
            await sdk.waitForTicks(3);
            continue;
        }

        const r = await bot.chopTree(tree);
        if (r.success) logs++;
        else if (++fails % 5 === 0) console.log(`chopTree failing: ${r.message}`);
    }

    const gained = wc().experience - startXp;
    const hrs = (Date.now() - t0) / 3_600_000;
    console.log(`Done: ${logs} logs, +${gained} xp (${Math.round(gained / hrs)} xp/hr), WC ${startLevel} -> ${wc().baseLevel}`);
}, { timeout: DURATION_MS + 2 * 60_000 });
