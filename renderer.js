// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const { ipcRenderer } = require('electron');
const { dialog } = require('electron').remote;
const {
    PlayerController,
    YoutubePlayer,
    LocalPlayer,
} = require('./player.js');

const App = {};

App.playerController = new PlayerController();
App.playerController.register(YoutubePlayer, 'youtube');
App.playerController.register(LocalPlayer, 'local');
App.updateAvailable = false;
App.ignoreUpdate = false;


// handle file select dialog
function loadLogFile() {
  dialog.showOpenDialog({
    title: 'Locate PoE Directory',
    properties: ['openDirectory'],
  }, fileNames => ipcRenderer.send('setPoePath', fileNames));
}

// handle soundtrack file selection
function loadSoundtrackFile() {
  dialog.showOpenDialog({
    title: 'Load Custom Soundtrack',
    properties: ['openFile'],
    filters: [{
      name: 'Custom Soundtrrack',
      extensions: ['soundtrack'],
    }],
  }, fileNames => ipcRenderer.send('setSoundtrack', fileNames));
}

function handleVolumeChange(volume) {
  App.playerController.setVolume(volume);
}

function updateState(event, data){
  document.getElementById('poe-path').innerText = data.path.replace(/\\/g, '/');
  let soundtrackName = data.soundtrack.replace(/\\/g, '/');
  if (soundtrackName.match(/([^/]+)\.soundtrack$/)) {
    soundtrackName = soundtrackName.match(/([^/\\]+)\.soundtrack$/)[1];
  }
  document.getElementById('soundtrack-name').innerText = soundtrackName;
  document.getElementById('poe-path-valid').style.display = data.valid ? 'inline' : 'none';
  document.getElementById('poe-path-invalid').style.display = data.valid ? 'none' : 'inline';
  document.getElementById('volume-valid').style.display = data.volume === 0 ? 'inline' : 'none';
  document.getElementById('volume-invalid').style.display = data.volume === 0 ? 'none' : 'inline';
  document.getElementById('update-container').style.display = data.isUpdateAvailable && !App.ignoreUpdate ? 'inline' : 'none';
  document.getElementById('update-buttons').style.display = !data.isUpdateDownloading ? 'inline' : 'none';
  document.getElementById('update-text').innerHTML = !data.isUpdateDownloading ? 'Update Available!' : 'Update Downloading!';
  
}

function installUpdate(){
  ipcRenderer.send('installUpdate');
}

function ignoreUpdate(){
  App.ignoreUpdate = true;
  ipcRenderer.send('updateState');
}

// backend will tell us to play a new track based on zone changes
ipcRenderer.on('changeTrack', (event, data) => {
  App.playerController.playTrack(data, 0);
});

// backend will send us state values, use it to stupidly update frontend
ipcRenderer.on('updateState', updateState );

// tell backend we'd like to update our state
ipcRenderer.send('updateState');

// backend will tell us to play a new track based on zone changes
ipcRenderer.on('errorMessage', (event, data) => {
  /* eslint-disable */
  alert(data);
  /* eslint-enable */
});

// ask for new state values every second, ya dumb, whatever.
setInterval(() => { ipcRenderer.send('updateState'); }, 1000);

module.exports = {
  loadLogFile,
  handleVolumeChange,
  loadSoundtrackFile,
  installUpdate,
  ignoreUpdate
};
