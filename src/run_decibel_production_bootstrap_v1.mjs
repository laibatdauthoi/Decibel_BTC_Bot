import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const ProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ProjectRoot, '.env'), quiet: true });
const Node22 = process.env.DECIBEL_NODE22_EXECUTABLE?.trim()
  ? resolve(ProjectRoot, process.env.DECIBEL_NODE22_EXECUTABLE)
  : join(process.env.LOCALAPPDATA ?? '', 'DecibelTools', 'node-v22.23.2-win-x64', 'node.exe');

/** @param {string[]} args */
function runNode(args) {
  const result = spawnSync(Node22, args, {
    cwd: ProjectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(`PRODUCTION_BOOTSTRAP_COMMAND_FAILED:${args[0]}`);
}

function verifyDependencies() {
  runNode([
    '--input-type=module',
    '-e',
    "import Database from 'better-sqlite3'; import {transformSync} from 'esbuild'; const DB=new Database(':memory:'); try { DB.exec('CREATE TABLE probe(value INTEGER); INSERT INTO probe VALUES(22)'); if(DB.prepare('SELECT value FROM probe').get().value!==22) throw Error('SQLITE_PREFLIGHT_FAILED'); } finally { DB.close(); } transformSync('const value: number = 22',{loader:'ts'}); console.log('PRODUCTION_NATIVE_DEPENDENCIES=PASS');",
  ]);
}

const mode = process.argv[2];
if (
  process.argv.length > 3 ||
  (mode !== undefined && !['--check', '--install-dependencies'].includes(mode))
)
  throw new Error('PRODUCTION_BOOTSTRAP_ARGUMENT_INVALID');
if (!existsSync(Node22)) throw new Error('DECIBEL_PRODUCTION_NODE_22_EXECUTABLE_REQUIRED');
const version = spawnSync(Node22, ['--version'], { encoding: 'utf8', windowsHide: true });
if (version.error || version.status !== 0 || version.stdout.trim() !== 'v22.23.2')
  throw new Error('DECIBEL_PRODUCTION_NODE_VERSION_REQUIRED:v22.23.2');

if (mode === '--install-dependencies') {
  const inventory = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$ErrorActionPreference='Stop'; if (Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -match 'run_decibel_production_(web|live)'}) { exit 2 }",
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (inventory.error || inventory.status !== 0)
    throw new Error('DEPENDENCY_INSTALL_REQUIRES_VERIFIED_NO_PRODUCTION_PROCESS');
  // SQLite 13 ships a platform N-API prebuilt in its integrity-checked tarball.
  // Avoid npm's unnecessary node-gyp fallback; validate the native payload below.
  // This explicit maintenance command never starts the trading runtime.
  runNode([
    join(dirname(Node22), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    'ci',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
}
verifyDependencies();
const Launcher = join(ProjectRoot, 'src', 'run_decibel_production_web_launcher_v1.ts');
if (mode !== undefined) {
  console.log(
    `PRODUCTION_STARTUP_CHECK=PASS NODE=v22.23.2 ROOT=${ProjectRoot} LAUNCHER=${Launcher}`,
  );
} else {
  runNode([
    join(ProjectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--config',
    'web_dashboard/vite.config.ts',
  ]);
  // Exit code 75: the operator picked another subaccount in the wallet menu while idle; start
  // the launcher again so it runs on that subaccount (no manual restart).
  const SUBACCOUNT_SWITCH_EXIT_CODE = 75;
  let stopping = false;
  /** @type {import('node:child_process').ChildProcess | null} */
  let Child = null;
  function startLauncher() {
    Child = spawn(Node22, ['--import', 'tsx', Launcher], {
      cwd: ProjectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    Child.once('error', () => {
      console.error('PRODUCTION_LAUNCHER_START_FAILED');
      process.exitCode = 1;
    });
    Child.once('exit', (code) => {
      if (code === SUBACCOUNT_SWITCH_EXIT_CODE && !stopping) {
        console.log('PRODUCTION_SUBACCOUNT_SWITCH=RELAUNCHING');
        startLauncher();
        return;
      }
      process.exitCode = code ?? 1;
    });
  }
  /** @param {NodeJS.Signals} signal */
  function forwardSignal(signal) {
    if (stopping) return;
    stopping = true;
    Child?.kill(signal);
  }
  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));
  startLauncher();
}
