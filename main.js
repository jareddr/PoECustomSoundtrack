const electron = require('electron');
const poeCustomSoundtrack = require('./poeCustomSoundtrack.js');
const { autoUpdater } = require('electron-updater');
const { version } = require('./package.json');
autoUpdater.logger = require('electron-log');

if(process.env.Node_ENV === 'development'){
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

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 340,
    height: 520,
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
  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`);

  // Open the DevTools.
  if(process.env.Node_ENV === 'development'){
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
app.on('ready', () => {
  createWindow();
  autoUpdater.checkForUpdates();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
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
