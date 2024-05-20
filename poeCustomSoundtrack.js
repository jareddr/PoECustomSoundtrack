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
}

function updateRunningStatus(){
  psList().then(function(ps){
    let wasPoERunning = isPoERunning;

    const running = ps.filter(proc => proc.name.match(/pathofexile/i));
    isPoERunning = running.length > 0;

    if(wasPoERunning === true && isPoERunning === false){
      reset();
    }
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
  return arr ? arr[Math.floor(Math.random() * arr.length)] : false;
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
      if (currentTrackName !== track.name) {
        currentTrackName = track.name;
        mainWindow.webContents.send('changeTrack', track);
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

  ft = fileTail.startTailing(getLogFile(settings.get('poePath')));
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
    mainWindow.webContents.send('errorMessage', `Error loading: ${file} \n ${err.message}`);
    return false;
  }
}

function doesLogExist() {
  const file = getLogFile(settings.get('poePath'));
  return doesFileExist(file);
}


function checkMusicVolume() {
  const home = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
  const configFile = `${home}\\Documents\\My Games\\Path of Exile\\production_Config.ini`;
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

function setDefaults() {
  //  make sure default soundtrack is on disk

  if (!doesFileExist(`diablo2-v${version}.soundtrack`)) {
    writeFile(`diablo2-v${version}.soundtrack`, JSON.stringify(defaults.soundtrack, null, '\t'));
  }

  // define poePath in settings if not set
  if (!settings.get('poePath')) {
    settings.set('poePath', DEFAULT_POE_PATH);
  }

  // define selected soundtrack if not set
  if (!settings.get('soundtrack')) {
    settings.set('soundtrack', `diablo2-v${version}.soundtrack`);
  }

    // define player volume if not set
    if (!settings.get('playerVolume')) {
      settings.set('playerVolume', '25');
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
  return {
    path: settings.get('poePath'),
    valid: doesLogExist(),
    volume: checkMusicVolume(),
    soundtrack: settings.get('soundtrack'),
    playerVolume: settings.get('playerVolume'),
    isUpdateAvailable,
    isUpdateDownloading,
    isPoERunning
  };
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

  loadSoundtrack(settings.get('soundtrack'));

  startWatchingLog();

  ipcMain.on('setPoePath', (event, arg) => {
    if (arg && arg[0]) {
      settings.set('poePath', arg[0]);
      if (doesLogExist()) {
        startWatchingLog();
      }
      event.sender.send('updateState', getState());
    }
  });

  ipcMain.on('setSoundtrack', (event, arg) => {
    if (arg && arg[0]) {
      const itWorked = loadSoundtrack(arg[0]);
      if (itWorked) {
        settings.set('soundtrack', arg[0]);
        event.sender.send('updateState', getState());
      }
    }
  });

  ipcMain.on('setPlayerVolume', (event, arg) => {
    if (arg) {
        settings.set('playerVolume', arg);
    }
  });

  ipcMain.on('updateState', (event) => {
    updateRunningStatus();
    event.sender.send('updateState', getState());
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
