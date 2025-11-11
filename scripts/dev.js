const { spawn } = require('child_process');
const { exec } = require('child_process');
const http = require('http');

// Start Vite dev server
console.log('Starting Vite dev server...');
const vite = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
});

// Wait for Vite to be ready, then start Electron
function waitForServer() {
  return new Promise((resolve) => {
    console.log('Waiting for Vite dev server to be ready...');
    const checkServer = setInterval(() => {
      const req = http.get('http://localhost:5173', (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkServer);
          console.log('Vite dev server is ready! Starting Electron...');
          resolve();
        }
      });
      req.on('error', () => {
        // Server not ready yet, keep waiting
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    }, 1000);
  });
}

// Give Vite a moment to start, then wait for it to be ready
setTimeout(async () => {
  await waitForServer();
  exec('cross-env NODE_ENV=development electron main.js', {
    stdio: 'inherit',
    shell: true
  });
}, 2000);

// Cleanup on exit
process.on('SIGINT', () => {
  vite.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  vite.kill();
  process.exit();
});

