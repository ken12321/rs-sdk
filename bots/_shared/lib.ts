// Shared helpers for the bots/_shared script library (proven on iamnotabot).
type Ctx = { bot: any; sdk: any };
export type Waypoint = { x: number; z: number; name: string };

// Proven safe Lumbridge <-> Varrock route, west of the Dark wizard circle.
export const LUMBRIDGE_TO_VARROCK: Waypoint[] = [
    { x: 3222, z: 3260, name: 'Lumbridge north' },
    { x: 3210, z: 3320, name: 'road past the farms' },
    { x: 3195, z: 3368, name: 'west of the wizard circle' },
    { x: 3180, z: 3400, name: 'Varrock south-west' },
];
export const VARROCK_TO_LUMBRIDGE: Waypoint[] = [...LUMBRIDGE_TO_VARROCK].reverse();

// Lumbridge -> Wizards' Tower along the Draynor road, walked both ways by iamnotabot.
// Avoids the woods west of the castle, where aggressive goblins/spiders killed it.
// Leaving the tower, walkTo can't path through its open doors: see B7 in learnings/problems.md.
export const LUMBRIDGE_TO_WIZARD_TOWER: Waypoint[] = [
    { x: 3215, z: 3250, name: 'Lumbridge north-west' },
    { x: 3135, z: 3250, name: 'road to Draynor' },
    { x: 3105, z: 3245, name: 'Draynor' },
    { x: 3108, z: 3195, name: 'south of Draynor' },
    { x: 3109, z: 3166, name: "Wizards' Tower" },
];

/**
 * Script arguments after the bot name. Shared scripts are invoked as
 * `bun bots/_shared/<script>.ts <botname> [args...]`; sdk/runner.ts reads
 * <botname> to load bots/<botname>/bot.env.
 */
export const scriptArgs = (): string[] => process.argv.slice(3);

export const pos = ({ sdk }: Ctx) => {
    const p = sdk.getState()!.player;
    return { x: p.worldX as number, z: p.worldZ as number, level: p.level as number };
};
export const fmt = (ctx: Ctx) => { const p = pos(ctx); return `(${p.x}, ${p.z}, L${p.level})`; };
export const has = ({ sdk }: Ctx, re: RegExp) => !!sdk.findInventoryItem(re);
export const count = ({ sdk }: Ctx, re: RegExp): number =>
    sdk.getInventory().filter((i: any) => re.test(i.name)).reduce((n: number, i: any) => n + i.count, 0);

export async function eatIfLow(ctx: Ctx, at = 5) {
    if (ctx.sdk.getSkill('hitpoints')!.level <= at && ctx.sdk.findInventoryItem(/^(shrimps|bread)$/i)) {
        const r = await ctx.bot.eatFood(/^(shrimps|bread)$/i);
        console.log(`HP low, ate: ${r.message}`);
    }
}

/**
 * Never fight back: turn auto-retaliate off so attackers can't pin us in place,
 * and we just keep walking out of their range. (controls:com_3, interface.pack 151;
 * see interface_controls/scripts/player_controls.rs2.)
 */
const AUTO_RETALIATE_OFF = 151;
export async function avoidFights(ctx: Ctx) {
    const { sdk } = ctx;
    if (sdk.getState()!.autoRetaliateEnabled === false) return;
    await sdk.sendClickComponent(AUTO_RETALIATE_OFF);
    const ok = await sdk.waitForCondition((s: any) => s.autoRetaliateEnabled === false, 5_000).then(() => true, () => false);
    console.log(ok ? 'Auto-retaliate off' : `Auto-retaliate still ${sdk.getState()!.autoRetaliateEnabled}`);
}

/** Walk a list of waypoints, retrying each leg once with a looser tolerance. */
export async function walkRoute(ctx: Ctx, route: Waypoint[]) {
    await avoidFights(ctx);
    for (const w of route) {
        await eatIfLow(ctx);
        let r = await ctx.bot.walkTo(w.x, w.z, 4, { timeout: 90_000 });
        if (!r.success) r = await ctx.bot.walkTo(w.x, w.z, 7, { timeout: 90_000 });
        console.log(`${r.success ? 'OK  ' : 'FAIL'} ${w.name} -> ${fmt(ctx)}`);
        if (!r.success) throw new Error(`Stuck on leg "${w.name}": ${r.message}`);
    }
}

/** Use the nearest stairs/ladder in the given direction and wait for the plane to change. */
export async function climb(ctx: Ctx, dir: 'up' | 'down') {
    const opt = new RegExp(`^climb[- ]${dir}$`, 'i');
    const before = pos(ctx);
    const locs = await ctx.sdk.scanNearbyLocs(15);
    const loc = locs
        .filter((l: any) => /stair|ladder/i.test(l.name) && l.optionsWithIndex.some((o: any) => opt.test(o.text)))
        .sort((a: any, b: any) => a.distance - b.distance)[0];
    if (!loc) throw new Error(`No staircase/ladder to climb ${dir} near ${fmt(ctx)}`);
    const r = await ctx.bot.interactLoc(loc, opt);
    if (!r.success) throw new Error(`Climb ${dir} failed: ${r.message}`);
    await ctx.sdk.waitForCondition((s: any) => s.player.level !== before.level || Math.abs(s.player.worldZ - before.z) > 1000, 15_000);
    console.log(`Climbed ${dir} ${loc.name} -> ${fmt(ctx)}`);
}

/**
 * Talk to an NPC and step through the whole conversation: click continue on
 * narration pages, and pick the first option matching any of `wanted`.
 * Stops if a choice appears that matches none of them.
 */
export async function converse(ctx: Ctx, npc: RegExp, wanted: RegExp[]) {
    const { bot, sdk } = ctx;
    const t = await bot.talkTo(npc);
    if (!t.success) throw new Error(`talkTo ${npc}: ${t.message}`);
    for (let step = 0; step < 80; step++) {
        const d = sdk.getDialog();
        if (!d?.isOpen || d.isWaiting) {
            // Give the next page time to arrive before deciding we're done.
            const reopened = await sdk.waitForCondition((s: any) => s.dialog?.isOpen && !s.dialog.isWaiting, 5_000)
                .then(() => true, () => false);
            if (!reopened) return;
            continue;
        }
        const page = d.pageId;
        const choices = d.options.filter((o: any) => !/continue/i.test(o.text));
        if (choices.length > 1) {
            const pick = choices.find((o: any) => wanted.some(w => w.test(o.text)));
            if (!pick) {
                console.log(`No wanted option among: ${choices.map((o: any) => o.text).join(' | ')}`);
                await bot.closeInterface();
                return;
            }
            console.log(`  > ${pick.text}`);
            const r = await sdk.clickDialogByText(new RegExp(`^${pick.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
            if (!r.success) console.log(`  click failed: ${r.message}`);
        } else {
            await sdk.sendClickDialog(d.options[0]?.index ?? 0);
        }
        // Wait for this page to go away so we never click the same page twice.
        await sdk.waitForCondition((s: any) => !s.dialog?.isOpen || s.dialog.pageId !== page, 5_000).catch(() => {});
    }
    console.log('converse: gave up after 80 steps');
}
