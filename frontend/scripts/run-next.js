const { spawn } = require('child_process');

const mode = process.argv[2] || 'dev';
const port = process.env.PORT || '3006';
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, mode, '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`Failed to start Next.js in ${mode} mode: ${error.message}`);
  process.exit(1);
});
