import { spawnSync } from 'node:child_process';

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.error('TAURI_SIGNING_PRIVATE_KEY is required for a signed preview build.');
  process.exit(1);
}

const command = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const result = spawnSync(command, ['pnpm', '--filter', '@sequelei/desktop', 'build'], {
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
