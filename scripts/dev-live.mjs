import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directories = ['app', 'components', 'lib', 'public', 'types'];
const rootFiles = new Set([
  'next.config.ts', 'proxy.ts', 'package.json', 'pnpm-lock.yaml',
  'postcss.config.mjs', 'tsconfig.json',
]);

if (!existsSync(path.join(root, '.vercel', 'project.json'))) {
  console.error('Link the existing Papiflix project first: vercel link --project papiflix');
  process.exit(1);
}

let timer;
let deploying = false;
let pending = false;
let stopped = false;

function deploy() {
  if (stopped) return;
  if (deploying) {
    pending = true;
    return;
  }
  deploying = true;
  pending = false;
  console.log('\nDeploying saved source to production using Vercel project settings...');
  const child = spawn(process.platform === 'win32' ? 'vercel.cmd' : 'vercel', ['deploy', '--prod', '--yes'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('error', (error) => console.error(`Could not start Vercel CLI: ${error.message}`));
  child.on('close', (code) => {
    deploying = false;
    if (stopped) return;
    console.log(code === 0
      ? '\nDeployment ready. Refresh https://papiflix.vercel.app to see your edits.'
      : '\nDeployment failed. The previous live deployment stays available; save a source file to retry.');
    if (pending) deploy();
  });
}

function changed(filename) {
  if (!filename || stopped) return;
  const parts = String(filename).split(/[\\/]/);
  if (parts.some((part) => part.startsWith('.') || part.endsWith('~') || part.endsWith('.log'))) return;
  clearTimeout(timer);
  timer = setTimeout(deploy, 3000);
}

const watchers = directories
  .filter((directory) => existsSync(path.join(root, directory)))
  .map((directory) => watch(path.join(root, directory), { recursive: true }, (_event, filename) => changed(filename)));
watchers.push(watch(root, (_event, filename) => {
  if (rootFiles.has(String(filename))) changed(filename);
}));
watchers.forEach((watcher) => watcher.on('error', (error) => console.error(`File watcher: ${error.message}`)));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopped = true;
    clearTimeout(timer);
    watchers.forEach((watcher) => watcher.close());
    if (!deploying) process.exit(0);
  });
}

console.log('Live production editing: saved source changes trigger a Vercel build after 3 seconds.');
console.log('This publishes to the linked production project. Press Ctrl+C to stop watching.');
deploy();
