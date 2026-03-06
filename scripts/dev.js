const { spawn } = require('child_process');
const http = require('http');

const VITE_DEV_SERVER_URL = 'http://localhost:5173';
const VITE_START_DELAY_MS = 2000;
const SERVER_CHECK_INTERVAL_MS = 1000;
const SERVER_TIMEOUT_MS = 1000;

let viteProcess = null;

/**
 * Wait for Vite dev server to be ready
 * @returns {Promise<void>} Resolves when server is ready
 */
function waitForServer() {
  return new Promise((resolve) => {
    console.log('Waiting for Vite dev server to be ready...');
    const checkServer = setInterval(() => {
      const req = http.get(VITE_DEV_SERVER_URL, (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkServer);
          console.log('Vite dev server is ready! Starting Electron...');
          resolve();
        }
      });

      req.on('error', () => {
        // Server not ready yet, keep waiting
      });

      req.setTimeout(SERVER_TIMEOUT_MS, () => {
        req.destroy();
      });
    }, SERVER_CHECK_INTERVAL_MS);
  });
}

/**
 * Cleanup function to kill Vite process and exit
 */
function cleanup() {
  if (viteProcess) {
    viteProcess.kill();
    viteProcess = null;
  }
  process.exit();
}

// Start Vite dev server
console.log('Starting Vite dev server...');
viteProcess = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});

// Give Vite a moment to start, then wait for it to be ready
setTimeout(async () => {
  try {
    await waitForServer();
    console.log('\n=== Starting Electron Main Process ===\n');
    const electronProcess = spawn('npx', ['cross-env', 'NODE_ENV=development', 'electron', 'main.js'], {
      shell: true,
      cwd: process.cwd(),
    });
    
    // Pipe Electron stdout with prefix
    electronProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        console.log(`[ELECTRON] ${line}`);
      });
    });
    
    // Pipe Electron stderr with prefix
    electronProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        console.error(`[ELECTRON] ${line}`);
      });
    });
    
    electronProcess.on('error', (error) => {
      console.error('[ELECTRON] Error starting Electron:', error);
      cleanup();
    });
    
    electronProcess.on('exit', (code) => {
      console.log(`\n[ELECTRON] Process exited with code ${code}\n`);
      cleanup();
    });
  } catch (error) {
    console.error('Error starting Electron:', error);
    cleanup();
  }
}, VITE_START_DELAY_MS);

// Cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

