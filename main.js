const electron = require('electron');
const poeCustomSoundtrack = require('./poeCustomSoundtrack.js');
const { autoUpdater } = require('electron-updater');
const { version } = require('./package.json');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const constants = require('./constants.js');

autoUpdater.logger = require('electron-log');

if (process.env.NODE_ENV === 'development') {
  autoUpdater.updateConfigPath = 'dev-app-update.yml';
}

autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

const { app, BrowserWindow, ipcMain } = electron;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;
let localServer = null;
let serverPort = null;

const isDevelopment = process.env.NODE_ENV === 'development';
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

/**
 * Get MIME type based on file extension
 * @param {string} filePath - Path to the file
 * @returns {string} MIME type for the file
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Start local HTTP server to serve the built app (production only)
 * @returns {Promise<{server: http.Server, port: number}>} Promise resolving to server and port
 */
function startLocalServer() {
  return new Promise((resolve, reject) => {
    const distPath = path.join(__dirname, 'dist-renderer');

    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let filePath = parsedUrl.pathname;

      // Serve index.html for root path
      if (filePath === '/') {
        filePath = '/index.html';
      }

      // Remove leading slash and resolve from dist-renderer
      const fullPath = path.join(distPath, filePath.substring(1));

      // Security check: ensure file is within dist-renderer
      if (!fullPath.startsWith(distPath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      // Check if file exists
      fs.stat(fullPath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        // Read and serve the file
        fs.readFile(fullPath, (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
          }

          const mimeType = getMimeType(fullPath);
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(data);
        });
      });
    });

    // Try to start server on default port, or find an available port
    let currentPort = constants.SERVER.DEFAULT_PORT;
    const maxPort = constants.SERVER.MAX_PORT;

    const tryStartServer = () => {
      server.listen(currentPort, constants.SERVER.HOST, () => {
        localServer = server;
        serverPort = currentPort;
        resolve({ server, port: currentPort });
      });
    };

    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port if current one is in use
        currentPort++;
        if (currentPort <= maxPort) {
          tryStartServer();
        } else {
          reject(new Error(`Could not find an available port between ${constants.SERVER.DEFAULT_PORT} and ${maxPort}`));
        }
      } else {
        reject(err);
      }
    });

    tryStartServer();
  });
}

/**
 * Create the main application window
 */
function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 320,
    height: 535,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: `PoE Custom Soundtrack v${version}`,
    icon: './pietyd2.ico',
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
    },
  });

  mainWindow.setMenu(null);

  // Load the app - use Vite dev server in development, built files in production
  if (isDevelopment) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadURL(`http://${constants.SERVER.HOST}:${serverPort}/`);
  }

  // Open the DevTools in development
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  poeCustomSoundtrack.run(mainWindow);

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });
}

/**
 * Initialize IPC handlers for dialog operations
 */
function setupIpcHandlers() {
  // IPC handler for directory selection dialog
  ipcMain.handle('open-directory-dialog', async () => {
    const window = mainWindow || BrowserWindow.getAllWindows()[0];
    try {
      const result = await dialog.showOpenDialog(window, {
        title: 'Locate PoE Directory',
        properties: ['openDirectory'],
      });
      return result;
    } catch (error) {
      console.error('Error opening directory dialog:', error);
      return { canceled: true };
    }
  });

  // IPC handler for file selection dialog
  ipcMain.handle('open-file-dialog', async (event, options) => {
    const window = mainWindow || BrowserWindow.getAllWindows()[0];
    try {
      const result = await dialog.showOpenDialog(window, {
        title: 'Load Custom Soundtrack',
        defaultPath: app.getAppPath(),
        properties: ['openFile'],
        filters: [{
          name: 'Custom Soundtrack',
          extensions: ['soundtrack'],
        }],
        ...options,
      });
      return result;
    } catch (error) {
      console.error('Error opening file dialog:', error);
      return { canceled: true };
    }
  });

  // IPC handler to get application path
  ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
  });
}

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', async () => {
  try {
    // Only start local server in production (dev uses Vite dev server)
    if (!isDevelopment) {
      await startLocalServer();
    }
    createWindow();
    setupIpcHandlers();
    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
});

/**
 * Clean up local server resources
 */
function cleanupServer() {
  if (localServer) {
    try {
      localServer.close();
      localServer = null;
      serverPort = null;
    } catch (error) {
      console.error('Error closing local server:', error);
    }
  }
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    cleanupServer();
    app.quit();
  }
});

// Clean up server before quitting
app.on('before-quit', () => {
  cleanupServer();
});

// Re-create window when dock icon is clicked (macOS)
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Auto-updater event handlers
autoUpdater.on('update-available', (info) => {
  poeCustomSoundtrack.updateAvailable(autoUpdater);
});

autoUpdater.on('download-progress', (progressObj) => {
  poeCustomSoundtrack.updateDownloading();
});

autoUpdater.on('update-downloaded', (info) => {
  autoUpdater.quitAndInstall();
});
