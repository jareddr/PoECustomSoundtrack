const {
  ipcMain,
} = require('electron');
const defaults = require('./defaults.js');
const fs = require('fs');
const fileTail = require('file-tail');
const psList = require('ps-list');
const { version } = require('./package.json');

const DEFAULT_POE_PATH = 'C:\\Program Files\\Grinding Gear Games\\Path of Exile\\';
//  load settings from disk
const settings = require('electron-settings');

let mainWindow;
let currentTrackName = false;
let currentTrackId = false;
let ft;
let isUpdateAvailable = false;
let isUpdateDownloading = false;
let autoUpdater = false;
let isPoERunning = false;

let soundtrack = defaults.soundtrack;

// File containing boss dialogs.
const bosses = require('./bosses.js');

function reset(){
  currentTrackName = false;
  currentTrackId = false;
}

function updateRunningStatus(){
  psList().then(function(ps){
    let wasPoERunning = isPoERunning;

    const running = ps.filter(proc => proc.name.match(/pathofexile/i));
    isPoERunning = running.length > 0;

    if(wasPoERunning === true && isPoERunning === false){
      reset();
    }
  }).catch(function(err){
    // Silently handle errors from process list check (e.g., tasklist command cancelled)
    // This prevents unhandled promise rejection warnings
    console.log('Process list check failed:', err.message);
  })
}



function getTrackType(location) {
  if (location.match(/http/) && location.match(/youtu/)) {
    return 'youtube';
  } else if (location.match(/http/) && location.match(/soundcloud/)) {
    return 'soundcloud';
  }

  return 'local';
}

function getTrackId(location) {
  let id = false;
  const type = getTrackType(location);
  if (type === 'youtube' && location.match(/\?v=(.{11})/)) {
    id = location.match(/\?v=(.{11})/)[1];
  } else if (type === 'local') {
    id = location;
  }
  return id;
}

// function getDurationInSeconds(length) {
//   const parts = length.split(':');
//   if (parts.length === 3) {
//     return (parseInt(parts[0], 10) * 60 * 60) + (parseInt(parts[1], 10) * 60)
// + parseInt(parts[2], 10);
//   } else if (parts.length === 2) {
//     return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
//   }
//   return parseInt(parts[0], 10);
// }

function getLogFile(poePath) {
  return `${poePath}\\logs\\Client.txt`;
}

function generateTrack(track) {
  const type = getTrackType(track.location);
  const id = getTrackId(track.location);
  return {
    type,
    id,
    name: track.name,
    endSeconds: track.endSeconds // Optional ending time in seconds to loop earlier.
  };
}

function randomElement(arr) {
  
  // Array with more than 1 unique track ID always change track.

  // Find tracks other than current track.
  const otherTrackArr = arr.filter(t => getTrackId(t.location) !== currentTrackId);
  
  if (otherTrackArr.length === 0) {
    // No other tracks.
    // Reuse current track.
    return arr ? arr[0] : false;
  } else {
    // Has other tracks.
    // Exclude current track and pick a random track.
    return otherTrackArr ? otherTrackArr[Math.floor(Math.random() * otherTrackArr.length)] : false;
  }
  
  //return arr ? arr[Math.floor(Math.random() * arr.length)] : false;
}

function getTrack(areaName) {
  // How to find a track
  // Get area_name from log
  // Look up track_name from soundtrack.map[area_name]
  // Look up track from _.where(soundtrack.tracks, {name: track_name})
  let track = false;
  const trackName = soundtrack.map[areaName];
  // if track name is random, choose a random track from the entire track list
  // Otherwise filter the list of tracks by matching names and then randomly choose one that matches
  const trackData = trackName === 'random' ? randomElement(soundtrack.tracks) : randomElement(soundtrack.tracks.filter(t => t.name === trackName));
  if (trackData) {
    track = generateTrack(trackData);
  }
  return track;
}


function parseLogLine(line) {

  //assume POE is running if a new log line come sin
  isPoERunning = true;

  // watch log file for area changes
  let newArea = line.match(/You have entered ([^.]*)./);

  // also watch for poe to boot up and play login window music
  const loginWindow = line.match(/LOG FILE OPENING/);
  
  // exit to login window
  const exitWindow = line.match(/] Async connecting to /)
    || line.match(/] Abnormal disconnect: An unexpected disconnection occurred./);
  
  if (loginWindow || exitWindow) {
    newArea = ['login', 'login'];
  }

  // Gets the boss name if the logs contains boss dialog.
  const boss = getBoss(line);
  if (boss) {
    // Boss music will be handled by the soundtrack json similar to new areas.
    newArea = [boss, boss];
  }
  
  if (newArea) {
    const areaCode = newArea[1];
    const track = getTrack(areaCode);
    if (track) {
      if (areaCode === 'login' && currentTrackName !== track.name // Login screen uses existing logic
          || areaCode !== 'login' && currentTrackId !== track.id) { // Zone transition checks track ID instead of track names
        currentTrackName = track.name;
        currentTrackId = track.id;
        // Ensure track object is serializable for IPC
        const serializableTrack = {
          type: String(track.type || ''),
          id: String(track.id || ''),
          name: String(track.name || ''),
          endSeconds: track.endSeconds ? Number(track.endSeconds) : undefined
        };
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          try {
            mainWindow.webContents.send('changeTrack', serializableTrack);
          } catch (err) {
            console.error('Error sending changeTrack:', err);
          }
        }
      }
    }
  }
}

// Checks whether a line in the logs contains boss dialog.
function getBoss(line) {
  try {
    // If contains boss dialog, returns the boss name.
    return bosses.dialog[line.substring(line.lastIndexOf('] ') + 2)];
  } catch (err) {
    // Otherwise returns null.
    return null;
  }
}

function startWatchingLog() {
  // if we're already watching a file, lets stop before watching a new file
  if (ft && ft.stop) {
    ft.stop();
  }

  ft = fileTail.startTailing(getLogFile(settings.getSync('poePath')));
  ft.on('line', parseLogLine);
}

function doesFileExist(file) {
  try {
    const handle = fs.openSync(file, 'r+');
    fs.closeSync(handle);
  } catch (err) {
    return false;
  }
  return true;
}

// let debugLog = function(line) {
//   try{
//     let handle = fs.openSync("debug.log", 'a');
//     fs.writeFileSync(file, line);
//     fs.closeSync(handle);
//     return true;
//   } catch (err) {
//     return false;
//   }

// }

function writeFile(file, data) {
  try {
    const handle = fs.openSync(file, 'w');
    fs.writeFileSync(file, data);
    fs.closeSync(handle);
    return true;
  } catch (err) {
    return false;
  }
}

function readJsonFile(file) {
  try {
    const handle = fs.openSync(file, 'r+');
    let data = fs.readFileSync(file, 'utf-8');
    fs.closeSync(handle);
    data = data.replace(/\\+/g, '/');
    return JSON.parse(data);
  } catch (err) {
    const errorMsg = String(err.message || 'Unknown error');
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('errorMessage', `Error loading: ${file} \n ${errorMsg}`);
      } catch (sendErr) {
        console.error('Error sending errorMessage:', sendErr);
      }
    }
    return false;
  }
}

function doesLogExist() {
  const file = getLogFile(settings.getSync('poePath'));
  return doesFileExist(file);
}


// Helper function to find the Path of Exile config file
// Handles cases where Documents folder might be in OneDrive
function findPoEConfigFile() {
  if (process.platform !== 'win32') {
    // Non-Windows: use HOME
    const home = process.env.HOME;
    return `${home}/Documents/My Games/Path of Exile/production_Config.ini`;
  }

  const userProfile = process.env.USERPROFILE;
  const possiblePaths = [
    // Standard Documents location
    `${userProfile}\\Documents\\My Games\\Path of Exile\\production_Config.ini`,
    // OneDrive Documents location
    `${userProfile}\\OneDrive\\Documents\\My Games\\Path of Exile\\production_Config.ini`,
    // Check OneDrive environment variable if set
    process.env.ONEDRIVE ? `${process.env.ONEDRIVE}\\Documents\\My Games\\Path of Exile\\production_Config.ini` : null,
  ].filter(path => path !== null);

  // Try each path and return the first one that exists
  for (const configPath of possiblePaths) {
    try {
      if (doesFileExist(configPath)) {
        return configPath;
      }
    } catch (err) {
      // Continue to next path
      continue;
    }
  }

  // If none found, return the standard path (caller will handle the error)
  return possiblePaths[0];
}

function checkMusicVolume() {
  const configFile = findPoEConfigFile();
  try {
    const handle = fs.openSync(configFile, 'r+');
    const data = fs.readFileSync(configFile, 'utf-8');
    fs.closeSync(handle);
    if (data.match(/music_volume[2]=(\d+)/ig)) {
      return parseInt(data.match(/music_volume[2]=(\d+)/)[1], 10);
    }
  } catch (err) {
    return false;
  }
  return false;
}

function checkCharEvent() {
  const configFile = findPoEConfigFile();
  try {
    const handle = fs.openSync(configFile, 'r+');
    const data = fs.readFileSync(configFile, 'utf-8');
    fs.closeSync(handle);
    if (data.match(/disable_char_events=(\w+)/ig)) {
      return data.match(/disable_char_events=(\w+)/)[1] === 'true';
    }
  } catch (err) {
    return false;
  }
  return false;
}

function setDefaults() {
  //  make sure default soundtrack is on disk

  if (!doesFileExist(`diablo2-v${version}.soundtrack`)) {
    writeFile(`diablo2-v${version}.soundtrack`, JSON.stringify(defaults.soundtrack, null, '\t'));
  }

  // define poePath in settings if not set
  if (!settings.getSync('poePath')) {
    settings.setSync('poePath', DEFAULT_POE_PATH);
  }

  // define selected soundtrack if not set
  if (!settings.getSync('soundtrack')) {
    settings.setSync('soundtrack', `diablo2-v${version}.soundtrack`);
  }

    // define player volume if not set
    if (!settings.getSync('playerVolume')) {
      settings.setSync('playerVolume', '25');
    }
}

function loadSoundtrack(file) {
  const currentSoundtrack = soundtrack;
  soundtrack = readJsonFile(file);
  if (!soundtrack) {
    soundtrack = currentSoundtrack;
    return false;
  }
  return true;
}


function getState() {
  // Ensure all values are serializable primitives for IPC
  // Electron 31 has strict IPC serialization requirements
  try {
    // Get settings values using getSync() for synchronous access (electron-settings v4)
    const poePath = settings.getSync('poePath') || '';
    const soundtrack = settings.getSync('soundtrack') || '';
    const playerVolume = settings.getSync('playerVolume') || '25';
    
    const volume = checkMusicVolume();
    const charEvent = checkCharEvent();
    const logExists = doesLogExist();
    
    // Create a plain object with only serializable primitives
    const state = {
      path: String(poePath),
      valid: Boolean(logExists),
      volume: (volume !== false && !isNaN(Number(volume))) ? Number(volume) : 0,
      charEvent: charEvent,
      soundtrack: String(soundtrack),
      playerVolume: String(playerVolume),
      isUpdateAvailable: Boolean(isUpdateAvailable),
      isUpdateDownloading: Boolean(isUpdateDownloading),
      isPoERunning: Boolean(isPoERunning)
    };
    
    // Verify serializability by attempting to stringify
    JSON.stringify(state);

      
    return state;
  } catch (err) {
    // If anything fails, return a safe default state
    console.error('Error in getState():', err);
    return {
      path: '',
      valid: false,
      volume: 0,
      charEvent: true,
      soundtrack: '',
      playerVolume: '25',
      isUpdateAvailable: false,
      isUpdateDownloading: false,
      isPoERunning: false
    };
  }
}

function updateAvailable(updater) {
  isUpdateAvailable = true;
  autoUpdater = updater;
}

function updateDownloading(){
  isUpdateDownloading = true
}

function run(browserWindow) {
  mainWindow = browserWindow;

  setDefaults();

  loadSoundtrack(settings.getSync('soundtrack'));

  startWatchingLog();

  ipcMain.on('setPoePath', (event, arg) => {
    if (arg && arg[0]) {
      settings.setSync('poePath', arg[0]);
      if (doesLogExist()) {
        startWatchingLog();
      }
      try {
        const state = getState();
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('updateState', state);
        }
      } catch (err) {
        console.error('Error sending updateState:', err);
      }
    }
  });

  ipcMain.on('setSoundtrack', (event, arg) => {
    if (arg && arg[0]) {
      const itWorked = loadSoundtrack(arg[0]);
      if (itWorked) {
        settings.setSync('soundtrack', arg[0]);
        try {
        const state = getState();
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('updateState', state);
        }
      } catch (err) {
        console.error('Error sending updateState:', err);
      }
      }
    }
  });

  ipcMain.on('setPlayerVolume', (event, arg) => {
    if (arg) {
        settings.setSync('playerVolume', arg);
    }
  });

  ipcMain.on('updateState', (event) => {
    updateRunningStatus();
    // Use setImmediate to ensure state is ready and avoid race conditions
    setImmediate(() => {
      try {
        const state = getState();
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('updateState', state);
        }
      } catch (err) {
        console.error('Error sending updateState:', err);
      }
    });
  });

  ipcMain.on('installUpdate', (event, arg) => {
    if(autoUpdater) autoUpdater.downloadUpdate();
  })
}

module.exports = {
  run,
  updateAvailable,
  updateDownloading
};
