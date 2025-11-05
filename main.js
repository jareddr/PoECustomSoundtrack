const electron = require('electron');
const poeCustomSoundtrack = require('./poeCustomSoundtrack.js');
const { autoUpdater } = require('electron-updater');
const { version } = require('./package.json');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { dialog } = require('electron');
autoUpdater.logger = require('electron-log');

if(process.env.NODE_ENV === 'development'){
  autoUpdater.updateConfigPath = 'dev-app-update.yml';
}

autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

// Module to control application life.
const app = electron.app;

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let localServer = null;
let serverPort = null;

// Get MIME type based on file extension
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

// Start local HTTP server to serve the app
function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url);
      let filePath = parsedUrl.pathname;

      // Serve index.html for root path
      if (filePath === '/') {
        filePath = '/index.html';
      }

      // Remove leading slash and resolve from __dirname
      const fullPath = path.join(__dirname, filePath.substring(1));

      // Security check: ensure file is within __dirname
      if (!fullPath.startsWith(__dirname)) {
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

    // Try to start server on port 3000, or find an available port
    let currentPort = 3000;
    const maxPort = 3010;
    
    const tryStartServer = () => {
      server.listen(currentPort, '127.0.0.1', () => {
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
          reject(new Error('Could not find an available port'));
        }
      } else {
        reject(err);
      }
    });

    tryStartServer();
  });
}

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 320,
    height: 535,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: `PoE Custom Soundtrack v${version}`,
    icon: './piety.ico',
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  });

  mainWindow.setMenu(null);
  // and load the index.html of the app from the local HTTP server.
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  // Open the DevTools.
  if(process.env.NODE_ENV === 'development'){
   mainWindow.webContents.openDevTools();
  }

  poeCustomSoundtrack.run(mainWindow);

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  try {
    await startLocalServer();
    createWindow();
    autoUpdater.checkForUpdates();
    
    // IPC handlers for dialog operations (replacing electron.remote)
    electron.ipcMain.handle('open-directory-dialog', async () => {
      const window = mainWindow || BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(window, {
        title: 'Locate PoE Directory',
        properties: ['openDirectory'],
      });
      return result;
    });

    electron.ipcMain.handle('open-file-dialog', async (event, options) => {
      const window = mainWindow || BrowserWindow.getAllWindows()[0];
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
    });

    electron.ipcMain.handle('get-app-path', () => {
      return app.getAppPath();
    });
  } catch (error) {
    console.error('Failed to start local server:', error);
    app.quit();
  }
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    if (localServer) {
      localServer.close();
      localServer = null;
    }
    app.quit();
  }
});

// Clean up server before quitting
app.on('before-quit', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

autoUpdater.on('update-available', (info) => {
  poeCustomSoundtrack.updateAvailable(autoUpdater);
})
autoUpdater.on('download-progress', (progressObj) => {
  poeCustomSoundtrack.updateDownloading();
})
autoUpdater.on('update-downloaded', (info) => {
  autoUpdater.quitAndInstall();  
})
