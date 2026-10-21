#!/usr/bin/env bun
// Run a shared script on any bot, starting its headless lite client if needed.
//
//   bun bots/_shared/run.ts <botname> <script> [args...]   # e.g. mybot woodcut willow 15
//   bun bots/_shared/run.ts <botname> --stop               # stop that bot's lite client
//
// The lite client is left running between scripts (pid in bots/<botname>/lite.pid,
// output in lite.log). Script output is shown live and saved to bots/<botname>/<script>.log.
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync, createWriteStream } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

const ROOT = resolve(import.meta.dir, '../..');
const SHARED = join(ROOT, 'bots', '_shared');
const READY = /Gateway connected/;
const READY_TIMEOUT_MS = 60_000;

const [botName = '', scriptName = '', ...args] = process.argv.slice(2);
if (!botName || !scriptName) {
    console.error('Usage: bun bots/_shared/run.ts <botname> <script> [args...]  |  <botname> --stop');
    process.exit(2);
}

const botDir = join(ROOT, 'bots', botName);
if (!existsSync(join(botDir, 'bot.env'))) {
    console.error(`No bot "${botName}". Create it first: bun bots/create-bot.ts ${botName}`);
    process.exit(2);
}
const pidFile = join(botDir, 'lite.pid');
const logFile = join(botDir, 'lite.log');

function alivePid(): number | null {
    if (!existsSync(pidFile)) return null;
    const pid = Number(readFileSync(pidFile, 'utf-8').trim());
    try {
        process.kill(pid, 0);
        return pid;
    } catch {
        unlinkSync(pidFile);
        return null;
    }
}

if (scriptName === '--stop') {
    const pid = alivePid();
    if (pid) {
        process.kill(pid);
        unlinkSync(pidFile);
        console.log(`Stopped lite client for ${botName} (pid ${pid})`);
    } else {
        console.log(`No lite client running for ${botName}`);
    }
    process.exit(0);
}

const scriptPath = join(SHARED, `${scriptName.replace(/\.ts$/, '')}.ts`);
if (!existsSync(scriptPath)) {
    console.error(`No shared script "${scriptName}" in bots/_shared (see bots/_shared/README.md)`);
    process.exit(2);
}

async function ensureLiteClient() {
    const running = alivePid();
    if (running) {
        console.log(`[run] Reusing lite client for ${botName} (pid ${running})`);
        return;
    }
    const webclient = join(ROOT, 'server', 'webclient');
    if (!existsSync(join(webclient, 'node_modules'))) {
        console.log('[run] Installing server/webclient dependencies (first run)...');
        const install = Bun.spawnSync(['bun', 'install'], { cwd: webclient, stdout: 'inherit', stderr: 'inherit' });
        if (install.exitCode !== 0) throw new Error('bun install in server/webclient failed');
    }
    const startOffset = existsSync(logFile) ? readFileSync(logFile).length : 0;
    const out = openSync(logFile, 'a');
    // Detached: its own process group, so Ctrl-C on a script leaves it running.
    const child = spawn('bun', ['src/lite/runner.ts', botName], {
        cwd: webclient,
        stdio: ['ignore', out, out],
        detached: true,
    });
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    console.log(`[run] Started lite client for ${botName} (pid ${child.pid}), waiting for gateway...`);

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Lite client exited with code ${child.exitCode}; see ${logFile}`);
        }
        if (READY.test(readFileSync(logFile, 'utf-8').slice(startOffset))) return;
        await Bun.sleep(500);
    }
    throw new Error(`Lite client not ready after ${READY_TIMEOUT_MS / 1000}s; see ${logFile}`);
}

await ensureLiteClient();

// Run the script, echoing its output live and saving it next to the bot.
const scriptLog = createWriteStream(join(botDir, `${scriptName.replace(/\.ts$/, '')}.log`));
const proc = Bun.spawn(['bun', scriptPath, botName, ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'inherit',
});
async function pump(stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream) {
    const reader = stream.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
        sink.write(r.value);
        scriptLog.write(r.value);
    }
}
await Promise.all([pump(proc.stdout, process.stdout), pump(proc.stderr, process.stderr)]);
const code = await proc.exited;
scriptLog.end();
process.exit(code);
