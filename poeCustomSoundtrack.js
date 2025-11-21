const { ipcMain } = require('electron');
const defaults = require('./defaults.js');
const fs = require('fs');
const fileTail = require('file-tail');
const psList = require('ps-list');
const { version } = require('./package.json');
const constants = require('./constants.js');
const settings = require('electron-settings');
const bosses = require('./bosses.js');

let mainWindow = null;
let currentTrackName = false;
let currentTrackId = false;
let fileTailInstance = null;
let isUpdateAvailable = false;
let isUpdateDownloading = false;
let autoUpdater = false;
let isPoERunning = false;

let soundtrack = defaults.soundtrack;

// Cache for world areas data
let worldAreas = null;

// State tracking for change detection
let configFileWatcher = null;
let poeStatusCheckInterval = null;
let lastState = null;

/**
 * Reset current track tracking state
 */
function reset() {
  currentTrackName = false;
  currentTrackId = false;
}

/**
 * Update the running status of Path of Exile by checking process list
 * @returns {Promise<boolean>} True if status changed, false otherwise
 */
function updateRunningStatus() {
  return psList()
    .then((processes) => {
      const wasPoERunning = isPoERunning;
      const running = processes.filter((proc) => proc.name.match(/pathofexile/i));
      isPoERunning = running.length > 0;

      if (wasPoERunning === true && isPoERunning === false) {
        reset();
      }

      // Return true if status changed
      return wasPoERunning !== isPoERunning;
    })
    .catch((err) => {
      // Silently handle errors from process list check (e.g., tasklist command cancelled)
      // This prevents unhandled promise rejection warnings
      console.warn('Process list check failed:', err.message);
      return false;
    });
}



/**
 * Determine the track type based on location URL
 * @param {string} location - Track location URL or path
 * @returns {string} Track type: 'youtube', 'soundcloud', or 'local'
 */
function getTrackType(location) {
  if (location.match(/http/) && location.match(/youtu/)) {
    return 'youtube';
  } else if (location.match(/http/) && location.match(/soundcloud/)) {
    return 'soundcloud';
  }
  return 'local';
}

/**
 * Extract track ID from location URL
 * @param {string} location - Track location URL or path
 * @returns {string|false} Track ID or false if not found
 */
function getTrackId(location) {
  const type = getTrackType(location);
  if (type === 'youtube' && location.match(/\?v=(.{11})/)) {
    return location.match(/\?v=(.{11})/)[1];
  } else if (type === 'local') {
    return location;
  }
  return false;
}

/**
 * Get the Path of Exile client log file path
 * @param {string} poePath - Path of Exile installation directory
 * @returns {string} Full path to Client.txt log file
 */
function getLogFile(poePath) {
  return `${poePath}\\${constants.PATHS.LOG_SUBDIRECTORY}\\${constants.PATHS.LOG_FILE_NAME}`;
}

/**
 * Generate a track object from track data
 * @param {Object} track - Track data object
 * @returns {Object} Track object with type, id, name, and endSeconds
 */
function generateTrack(track) {
  const type = getTrackType(track.location);
  const id = getTrackId(track.location);
  return {
    type,
    id,
    name: track.name,
    endSeconds: track.endSeconds, // Optional ending time in seconds to loop earlier
  };
}

/**
 * Select a random element from array, excluding current track if possible
 * @param {Array} arr - Array of track objects
 * @returns {Object|false} Random track object or false if array is empty
 */
function randomElement(arr) {
  if (!arr || arr.length === 0) {
    return false;
  }

  // Find tracks other than current track
  const otherTrackArr = arr.filter((t) => getTrackId(t.location) !== currentTrackId);

  if (otherTrackArr.length === 0) {
    // No other tracks, reuse current track
    return arr[0];
  }

  // Has other tracks, exclude current track and pick a random one
  return otherTrackArr[Math.floor(Math.random() * otherTrackArr.length)];
}

/**
 * Load and cache world areas data from world_areas.json
 * @returns {boolean} True if loaded successfully, false otherwise
 */
function loadWorldAreas() {
  try {
    const worldAreasData = readJsonFile('world_areas.json');
    if (!worldAreasData) {
      console.warn('Failed to load world_areas.json');
      return false;
    }
    worldAreas = worldAreasData;
    return true;
  } catch (err) {
    console.error('Error loading world_areas.json:', err);
    return false;
  }
}

/**
 * Find a zone in world_areas.json by name (returns first match)
 * @param {string} areaName - Name of the area/zone
 * @returns {Object|null} Zone data object or null if not found
 */
function findZoneByName(areaName) {
  if (!worldAreas) {
    return null;
  }

  // Search through all entries to find first match by name
  for (const zoneId in worldAreas) {
    const zone = worldAreas[zoneId];
    if (zone && zone.name === areaName) {
      return zone;
    }
  }

  return null;
}

/**
 * Check if a track matches a zone based on match criteria
 * @param {Object} track - Track object with matches array
 * @param {Object} zone - Zone data from world_areas.json
 * @returns {boolean} True if track matches zone
 */
function trackMatchesZone(track, zone) {
  if (!track.matches || !Array.isArray(track.matches)) {
    return false;
  }

  for (const match of track.matches) {
    // Match by name
    if (match.name && zone.name === match.name) {
      return true;
    }

    // Match by tag
    if (match.tag && Array.isArray(zone.tags) && zone.tags.includes(match.tag)) {
      return true;
    }

    // Match by area_type_tag
    if (match.area_type_tag && Array.isArray(zone.area_type_tags) && zone.area_type_tags.includes(match.area_type_tag)) {
      return true;
    }
  }

  return false;
}

/**
 * Get a track for the given area name
 * @param {string} areaName - Name of the area/zone
 * @returns {Object|false} Track object or false if no track found
 */
function getTrack(areaName) {
  // First, try to match by name directly (for special cases like login, bosses, etc.)
  // This works even if the zone isn't in world_areas.json
  const nameMatchTracks = soundtrack.tracks.filter((track) => {
    if (!track.matches || !Array.isArray(track.matches)) {
      return false;
    }
    return track.matches.some((match) => match.name === areaName);
  });

  if (nameMatchTracks.length > 0) {
    const trackData = randomElement(nameMatchTracks);
    return trackData ? generateTrack(trackData) : false;
  }

  // Look up zone in world_areas.json for tag/area_type_tag matching
  const zone = findZoneByName(areaName);
  if (!zone) {
    // Zone not found in world_areas.json and no name match
    // If random fallback is enabled, return random track
    if (soundtrack.options && soundtrack.options.randomOnNoMatch) {
      const trackData = randomElement(soundtrack.tracks);
      return trackData ? generateTrack(trackData) : false;
    }
    return false;
  }

  // Find all tracks that match this zone by tags or area_type_tags
  // (name matching was already handled above)
  const matchingTracks = soundtrack.tracks.filter((track) => {
    if (!track.matches || !Array.isArray(track.matches)) {
      return false;
    }

    for (const match of track.matches) {
      // Skip name matches (already handled above)
      if (match.name) {
        continue;
      }

      // Match by tag
      if (match.tag && Array.isArray(zone.tags) && zone.tags.includes(match.tag)) {
        return true;
      }

      // Match by area_type_tag
      if (match.area_type_tag && Array.isArray(zone.area_type_tags) && zone.area_type_tags.includes(match.area_type_tag)) {
        return true;
      }
    }

    return false;
  });

  if (matchingTracks.length === 0) {
    // No matches found
    // If random fallback is enabled, return random track
    if (soundtrack.options && soundtrack.options.randomOnNoMatch) {
      const trackData = randomElement(soundtrack.tracks);
      return trackData ? generateTrack(trackData) : false;
    }
    return false;
  }

  // Multiple matches - pick one at random
  const trackData = randomElement(matchingTracks);
  if (!trackData) {
    return false;
  }

  return generateTrack(trackData);
}


/**
 * Send track change to renderer process
 * @param {Object} track - Track object to send
 */
function sendTrackChange(track) {
  if (!mainWindow || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }

  // Ensure track object is serializable for IPC
  const serializableTrack = {
    type: String(track.type || ''),
    id: String(track.id || ''),
    name: String(track.name || ''),
    endSeconds: track.endSeconds ? Number(track.endSeconds) : undefined,
  };

  try {
    mainWindow.webContents.send('changeTrack', serializableTrack);
  } catch (err) {
    console.error('Error sending changeTrack:', err);
  }
}

/**
 * Parse a line from the Path of Exile log file and trigger track changes
 * @param {string} line - Line from the log file
 */
function parseLogLine(line) {
  // Assume PoE is running if a new log line comes in
  const wasPoERunning = isPoERunning;
  isPoERunning = true;
  
  // Broadcast state if PoE just started running
  if (!wasPoERunning && isPoERunning) {
    broadcastStateUpdate();
  }

  // Watch log file for area changes
  let newArea = line.match(/You have entered ([^.]*)./);

  // Also watch for PoE to boot up and play login window music
  const loginWindow = line.match(/LOG FILE OPENING/);

  // Exit to login window
  const exitWindow = line.match(/] Async connecting to /)
    || line.match(/] Abnormal disconnect: An unexpected disconnection occurred./);

  if (loginWindow || exitWindow) {
    newArea = ['login', 'login'];
  }

  // Get the boss name if the logs contains boss dialog
  const boss = getBoss(line);
  if (boss) {
    // Boss music will be handled by the soundtrack json similar to new areas
    newArea = [boss, boss];
  }

  if (!newArea) {
    return;
  }

  const areaCode = newArea[1];
  const track = getTrack(areaCode);
  if (!track) {
    return;
  }

  // Login screen uses existing logic (check track name)
  // Zone transition checks track ID instead of track names
  const shouldChangeTrack = areaCode === 'login'
    ? currentTrackName !== track.name
    : currentTrackId !== track.id;

  if (shouldChangeTrack) {
    currentTrackName = track.name;
    currentTrackId = track.id;
    sendTrackChange(track);
  }
}

/**
 * Check whether a line in the logs contains boss dialog
 * @param {string} line - Line from the log file
 * @returns {string|null} Boss name if found, null otherwise
 */
function getBoss(line) {
  try {
    const dialogText = line.substring(line.lastIndexOf('] ') + 2);
    return bosses.dialog[dialogText] || null;
  } catch (err) {
    return null;
  }
}

/**
 * Start watching the Path of Exile log file for changes
 */
function startWatchingLog() {
  // If we're already watching a file, stop before watching a new file
  if (fileTailInstance && fileTailInstance.stop) {
    fileTailInstance.stop();
  }

  const poePath = settings.getSync('poePath');
  if (!poePath) {
    console.warn('PoE path not set, cannot watch log file');
    return;
  }

  try {
    fileTailInstance = fileTail.startTailing(getLogFile(poePath));
    fileTailInstance.on('line', parseLogLine);
    
    // Broadcast state update when log file watching starts (log file existence may have changed)
    broadcastStateUpdate();
  } catch (err) {
    console.error('Error starting log file watch:', err);
    // Still broadcast state even if watching fails (log file might not exist)
    broadcastStateUpdate();
  }
}

/**
 * Check if a file exists
 * @param {string} file - Path to the file
 * @returns {boolean} True if file exists, false otherwise
 */
function doesFileExist(file) {
  try {
    const handle = fs.openSync(file, 'r+');
    fs.closeSync(handle);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Write data to a file
 * @param {string} file - Path to the file
 * @param {string} data - Data to write
 * @returns {boolean} True if successful, false otherwise
 */
function writeFile(file, data) {
  try {
    const handle = fs.openSync(file, 'w');
    fs.writeFileSync(file, data);
    fs.closeSync(handle);
    return true;
  } catch (err) {
    console.error(`Error writing file ${file}:`, err);
    return false;
  }
}

/**
 * Read and parse a JSON file
 * @param {string} file - Path to the JSON file
 * @returns {Object|false} Parsed JSON object or false on error
 */
function readJsonFile(file) {
  try {
    const handle = fs.openSync(file, 'r+');
    let data = fs.readFileSync(file, 'utf-8');
    fs.closeSync(handle);
    data = data.replace(/\\+/g, '/');
    return JSON.parse(data);
  } catch (err) {
    const errorMsg = String(err.message || 'Unknown error');
    console.error(`Error reading JSON file ${file}:`, errorMsg);

    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('errorMessage', `Error loading: ${file}\n${errorMsg}`);
      } catch (sendErr) {
        console.error('Error sending errorMessage:', sendErr);
      }
    }
    return false;
  }
}

/**
 * Check if the Path of Exile log file exists
 * @returns {boolean} True if log file exists, false otherwise
 */
function doesLogExist() {
  const poePath = settings.getSync('poePath');
  if (!poePath) {
    return false;
  }
  const file = getLogFile(poePath);
  return doesFileExist(file);
}


/**
 * Helper function to find the Path of Exile config file
 * Handles cases where Documents folder might be in OneDrive
 * @returns {string} Path to the config file
 */
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
    process.env.ONEDRIVE
      ? `${process.env.ONEDRIVE}\\Documents\\My Games\\Path of Exile\\production_Config.ini`
      : null,
  ].filter((path) => path !== null);

  // Try each path and return the first one that exists
  for (const configPath of possiblePaths) {
    if (doesFileExist(configPath)) {
      return configPath;
    }
  }

  // If none found, return the standard path (caller will handle the error)
  return possiblePaths[0];
}

/**
 * Check the music volume setting in PoE config file
 * @returns {number|false} Music volume (0-100) or false if not found/error
 */
function checkMusicVolume() {
  const configFile = findPoEConfigFile();
  if (!configFile) {
    return false;
  }

  try {
    const handle = fs.openSync(configFile, 'r+');
    const data = fs.readFileSync(configFile, 'utf-8');
    fs.closeSync(handle);

    const match = data.match(/music_volume[2]=(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  } catch (err) {
    console.warn('Error reading music volume from config:', err.message);
    return false;
  }

  return false;
}

/**
 * Check if character event voices are disabled in PoE config file
 * @returns {boolean|false} True if disabled, false if enabled, or false on error
 */
function checkCharEvent() {
  const configFile = findPoEConfigFile();
  if (!configFile) {
    return false;
  }

  try {
    const handle = fs.openSync(configFile, 'r+');
    const data = fs.readFileSync(configFile, 'utf-8');
    fs.closeSync(handle);

    const match = data.match(/disable_char_events=(\w+)/i);
    if (match) {
      return match[1] === 'true';
    }
  } catch (err) {
    console.warn('Error reading char events setting from config:', err.message);
    return false;
  }

  return false;
}

/**
 * Watch PoE config file for changes and broadcast state updates when config values change
 */
function watchConfigFile() {
  // Stop existing watcher if any
  if (configFileWatcher) {
    try {
      configFileWatcher.close();
    } catch (err) {
      // Ignore errors when closing watcher
    }
    configFileWatcher = null;
  }

  const configFile = findPoEConfigFile();
  if (!configFile || !doesFileExist(configFile)) {
    return;
  }

  try {
    // Use fs.watch to monitor config file changes
    configFileWatcher = fs.watch(configFile, (eventType) => {
      if (eventType === 'change') {
        // Debounce: wait a bit before reading (file might still be writing)
        setTimeout(() => {
          // Re-read config values and broadcast if changed
          broadcastStateUpdate();
        }, 500);
      }
    });

    configFileWatcher.on('error', (err) => {
      console.warn('Config file watcher error:', err.message);
      configFileWatcher = null;
    });
  } catch (err) {
    console.warn('Error setting up config file watcher:', err.message);
    configFileWatcher = null;
  }
}

/**
 * Start periodic check for PoE running status
 * Only broadcasts state when status actually changes
 */
function startPoEStatusCheck() {
  // Stop existing interval if any
  if (poeStatusCheckInterval) {
    clearInterval(poeStatusCheckInterval);
    poeStatusCheckInterval = null;
  }

  // Check every 2-3 seconds (using 2500ms as a middle ground)
  poeStatusCheckInterval = setInterval(() => {
    updateRunningStatus().then((statusChanged) => {
      if (statusChanged) {
        broadcastStateUpdate();
      }
    });
  }, 2500);
}

/**
 * Stop periodic PoE status check
 */
function stopPoEStatusCheck() {
  if (poeStatusCheckInterval) {
    clearInterval(poeStatusCheckInterval);
    poeStatusCheckInterval = null;
  }
}

/**
 * Set default settings and create default soundtrack file if needed
 */
function setDefaults() {
  // Make sure default soundtrack is on disk
  const defaultSoundtrackFile = `diablo2-v${version}.soundtrack`;
  if (!doesFileExist(defaultSoundtrackFile)) {
    writeFile(
      defaultSoundtrackFile,
      JSON.stringify(defaults.soundtrack, null, '\t')
    );
  }

  // Define poePath in settings if not set
  if (!settings.getSync('poePath')) {
    settings.setSync('poePath', constants.PATHS.DEFAULT_POE_PATH);
  }

  // Define selected soundtrack if not set
  if (!settings.getSync('soundtrack')) {
    settings.setSync('soundtrack', defaultSoundtrackFile);
  }

  // Define player volume if not set
  if (!settings.getSync('playerVolume')) {
    settings.setSync('playerVolume', String(constants.PLAYER.DEFAULT_VOLUME));
  }
}

/**
 * Load a soundtrack file
 * @param {string} file - Path to the soundtrack file
 * @returns {boolean} True if loaded successfully, false otherwise
 */
function loadSoundtrack(file) {
  const currentSoundtrack = soundtrack;
  const newSoundtrack = readJsonFile(file);
  if (!newSoundtrack) {
    return false;
  }

  // Validate new format structure
  if (!newSoundtrack.tracks || !Array.isArray(newSoundtrack.tracks)) {
    console.error('Invalid soundtrack format: missing or invalid tracks array');
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('errorMessage', `Invalid soundtrack format: missing tracks array`);
      } catch (sendErr) {
        console.error('Error sending errorMessage:', sendErr);
      }
    }
    return false;
  }

  // Validate that tracks have matches array (new format)
  const hasMatches = newSoundtrack.tracks.some((track) => track.matches && Array.isArray(track.matches));
  if (!hasMatches && !newSoundtrack.map) {
    console.warn('Soundtrack file may be missing matches arrays in tracks');
  }

  // Ensure options object exists with defaults
  if (!newSoundtrack.options) {
    newSoundtrack.options = {
      randomOnNoMatch: false
    };
  } else if (typeof newSoundtrack.options.randomOnNoMatch !== 'boolean') {
    newSoundtrack.options.randomOnNoMatch = false;
  }

  soundtrack = newSoundtrack;
  return true;
}


/**
 * Get the current application state for IPC transmission
 * @returns {Object} State object with all serializable primitives
 */
function getState() {
  // Ensure all values are serializable primitives for IPC
  // Electron 31 has strict IPC serialization requirements
  try {
    // Get settings values using getSync() for synchronous access (electron-settings v4)
    const poePath = settings.getSync('poePath') || '';
    const soundtrackPath = settings.getSync('soundtrack') || '';
    const playerVolume = settings.getSync('playerVolume')
      || String(constants.PLAYER.DEFAULT_VOLUME);

    const volume = checkMusicVolume();
    const charEvent = checkCharEvent();
    const logExists = doesLogExist();

    // Create a plain object with only serializable primitives
    const state = {
      path: String(poePath),
      valid: Boolean(logExists),
      volume: (volume !== false && !isNaN(Number(volume))) ? Number(volume) : 0,
      charEvent: Boolean(charEvent),
      soundtrack: String(soundtrackPath),
      playerVolume: String(playerVolume),
      isUpdateAvailable: Boolean(isUpdateAvailable),
      isUpdateDownloading: Boolean(isUpdateDownloading),
      isPoERunning: Boolean(isPoERunning),
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
      playerVolume: String(constants.PLAYER.DEFAULT_VOLUME),
      isUpdateAvailable: false,
      isUpdateDownloading: false,
      isPoERunning: false,
    };
  }
}

/**
 * Handle update available event
 * @param {Object} updater - Auto-updater instance
 */
function updateAvailable(updater) {
  isUpdateAvailable = true;
  autoUpdater = updater;
  broadcastStateUpdate();
}

/**
 * Handle update downloading event
 */
function updateDownloading() {
  isUpdateDownloading = true;
  broadcastStateUpdate();
}

/**
 * Send state update to renderer process (event-based, for IPC handlers)
 * @param {Object} event - IPC event object
 */
function sendStateUpdate(event) {
  try {
    const state = getState();
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('updateState', state);
      lastState = state;
    }
  } catch (err) {
    console.error('Error sending updateState:', err);
  }
}

/**
 * Broadcast state update to renderer process proactively (when state changes)
 * Only sends if state has actually changed
 */
function broadcastStateUpdate() {
  if (!mainWindow || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }

  try {
    const state = getState();
    
    // Only broadcast if state has changed
    if (lastState === null || JSON.stringify(state) !== JSON.stringify(lastState)) {
      mainWindow.webContents.send('updateState', state);
      lastState = state;
    }
  } catch (err) {
    console.error('Error broadcasting updateState:', err);
  }
}

/**
 * Initialize the application and set up IPC handlers
 * @param {Object} browserWindow - Main browser window instance
 */
function run(browserWindow) {
  mainWindow = browserWindow;

  setDefaults();
  loadWorldAreas();
  loadSoundtrack(settings.getSync('soundtrack'));
  startWatchingLog();
  
  // Start watching config file for changes
  watchConfigFile();
  
  // Start periodic PoE status check
  startPoEStatusCheck();

  // IPC handler for setting PoE path
  ipcMain.on('setPoePath', (event, arg) => {
    if (arg && arg[0]) {
      settings.setSync('poePath', arg[0]);
      if (doesLogExist()) {
        startWatchingLog();
      }
      sendStateUpdate(event);
      // Also watch config file for the new path's config
      watchConfigFile();
    }
  });

  // IPC handler for setting soundtrack
  ipcMain.on('setSoundtrack', (event, arg) => {
    if (arg && arg[0]) {
      const loaded = loadSoundtrack(arg[0]);
      if (loaded) {
        settings.setSync('soundtrack', arg[0]);
        sendStateUpdate(event);
      }
    }
  });

  // IPC handler for setting player volume
  ipcMain.on('setPlayerVolume', (event, arg) => {
    if (arg) {
      settings.setSync('playerVolume', arg);
      // Broadcast state update when volume changes
      broadcastStateUpdate();
    }
  });

  // IPC handler for requesting state update (for initial load)
  ipcMain.on('updateState', (event) => {
    updateRunningStatus().then(() => {
      // Use setImmediate to ensure state is ready and avoid race conditions
      setImmediate(() => {
        sendStateUpdate(event);
      });
    });
  });

  // IPC handler for installing update
  ipcMain.on('installUpdate', () => {
    if (autoUpdater) {
      autoUpdater.downloadUpdate();
    }
  });
}

module.exports = {
  run,
  updateAvailable,
  updateDownloading,
};
