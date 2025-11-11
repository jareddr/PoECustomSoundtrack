<script>
  import { onMount, onDestroy } from 'svelte';
  
  const { ipcRenderer } = require('electron');
  
  // State
  let poePath = 'C:/Games/Path of Exile';
  let soundtrackName = 'Load soundtrack';
  let poePathValid = false;
  let volumeValid = false;
  let charEventValid = false;
  let playerVolume = 25;
  let isUpdateAvailable = false;
  let isUpdateDownloading = false;
  let ignoreUpdate = false;
  let isPlaying = false;
  
  let playerController = null;
  let stateInterval = null;
  
  // Initialize player controller
  onMount(() => {
    if (window.PlayerController && window.YoutubePlayer && window.LocalPlayer) {
      playerController = new window.PlayerController();
      playerController.register(window.YoutubePlayer, 'youtube');
      playerController.register(window.LocalPlayer, 'local');
    } else {
      console.error('Player classes not loaded. Make sure player.js loads before App.svelte');
    }
    
    // IPC listeners
    ipcRenderer.on('changeTrack', (event, data) => {
      if (playerController) {
        playerController.playTrack(data, 0);
        isPlaying = true;
      }
    });
    
    ipcRenderer.on('updateState', (event, data) => {
      updateState(data);
    });
    
    ipcRenderer.on('errorMessage', (event, data) => {
      alert(data);
    });
    
    // Request initial state
    ipcRenderer.send('updateState');
    
    // Poll for state updates every second
    stateInterval = setInterval(() => {
      ipcRenderer.send('updateState');
    }, 1000);
  });
  
  onDestroy(() => {
    if (stateInterval) {
      clearInterval(stateInterval);
    }
    // Remove IPC listeners
    ipcRenderer.removeAllListeners('changeTrack');
    ipcRenderer.removeAllListeners('updateState');
    ipcRenderer.removeAllListeners('errorMessage');
  });
  
  function updateState(data) {
    poePath = data.path.replace(/\\/g, '/');
    
    let name = data.soundtrack.replace(/\\/g, '/');
    if (name.match(/([^/]+)\.soundtrack$/)) {
      name = name.match(/([^/\\]+)\.soundtrack$/)[1];
    }
    soundtrackName = name;
    
    poePathValid = data.valid;
    volumeValid = data.volume === 0;
    charEventValid = data.charEvent === false;
    isUpdateAvailable = data.isUpdateAvailable && !ignoreUpdate;
    isUpdateDownloading = data.isUpdateDownloading;
    
    const oldVolume = playerVolume;
    playerVolume = data.playerVolume ? parseInt(data.playerVolume) : 25;
    
    if (oldVolume !== playerVolume) {
      handleVolumeChange(playerVolume);
    }
    
    if (!data.isPoERunning && isPlaying) {
      isPlaying = false;
      if (playerController) {
        playerController.fadeout();
      }
    }
  }
  
  async function loadLogFile() {
    const results = await ipcRenderer.invoke('open-directory-dialog');
    if (results && !results.canceled && results.filePaths) {
      ipcRenderer.send('setPoePath', results.filePaths);
    }
  }
  
  async function loadSoundtrackFile() {
    const results = await ipcRenderer.invoke('open-file-dialog');
    if (results && !results.canceled && results.filePaths) {
      ipcRenderer.send('setSoundtrack', results.filePaths);
    }
  }
  
  function handleVolumeChange(volume) {
    const vol = typeof volume === 'string' ? parseInt(volume) : volume;
    if (playerController) {
      playerController.setVolume(vol);
    }
    ipcRenderer.send('setPlayerVolume', vol.toString());
    playerVolume = vol;
  }
  
  function installUpdate() {
    ipcRenderer.send('installUpdate');
  }
  
  function ignoreUpdateHandler() {
    ignoreUpdate = true;
    isUpdateAvailable = false;
    ipcRenderer.send('updateState');
  }
</script>

<div 
  class="h-screen overflow-hidden font-exocet font-bold text-d2-text text-base"
  style="background-image: url(/piety.png); background-size: cover;"
>
  <!-- Path of Exile Directory Selection -->
  <div class="px-2 py-1">
    <div class="flex items-center justify-between text-sm">
      <span>(1) Select Path of Exile directory</span>
      <i 
        class="material-icons text-green-500 {poePathValid ? 'inline' : 'hidden'}" 
        title="Path of Exile Detected!"
      >
        check_circle
      </i>
      <i 
        class="material-icons text-red-500 cursor-pointer {!poePathValid ? 'inline' : 'hidden'}" 
        title="Cannot locate path of exile client log."
      >
        error
      </i>
    </div>
    <div class="flex items-center mt-0.5">
      <a href="#" class="d2button float-left" on:click|preventDefault={loadLogFile}>...</a>
      <div 
        class="text-xs block py-1 px-2 float-left truncate cursor-pointer w-4/5 whitespace-nowrap hover:text-d2-text-hover"
        on:click={loadLogFile}
      >
        {poePath}
      </div>
    </div>
  </div>
  
  <div class="mb-1"></div>
  
  <!-- Music Volume Check -->
  <div class="px-2 py-0.5">
    <div class="flex items-center justify-between text-sm">
      <span>(11) Turn off in game music</span>
      <i 
        class="material-icons text-green-500 {volumeValid ? 'inline' : 'hidden'}" 
        title="Checks out."
      >
        check_circle
      </i>
      <i 
        class="material-icons text-orange-500 cursor-pointer {!volumeValid ? 'inline' : 'hidden'}" 
        title="Set the music volume in game to 0 to avoid clashing tracks."
      >
        warning
      </i>
    </div>
  </div>
  
  <div class="mb-1"></div>
  
  <!-- Character Event Voices Check -->
  <div class="px-2 py-0.5">
    <div class="flex items-center justify-between text-sm">
      <span>(111) Enable gameplay event voices</span>
      <i 
        class="material-icons text-green-500 {charEventValid ? 'inline' : 'hidden'}" 
        title="Checks out."
      >
        check_circle
      </i>
      <i 
        class="material-icons text-orange-500 cursor-pointer {!charEventValid ? 'inline' : 'hidden'}" 
        title="Enable gameplay event voices to enable boss music."
      >
        warning
      </i>
    </div>
  </div>
  
  <div class="mb-1"></div>
  
  <!-- Soundtrack Selection -->
  <div class="px-2 py-0.5">
    <div>
      <div class="text-sm">(1V) Select soundtrack</div>
      <div class="flex items-center mt-0.5">
        <a href="#" class="d2button float-left" on:click|preventDefault={loadSoundtrackFile}>...</a>
        <div 
          class="text-xs block py-1 px-2 float-left truncate cursor-pointer w-4/5 whitespace-nowrap hover:text-d2-text-hover"
          on:click={loadSoundtrackFile}
        >
          {soundtrackName}
        </div>
      </div>
    </div>
  </div>
  
  <!-- Player Containers -->
  <div id="youtube-parent-container" class="mt-2 h-[220px]"></div>
  <div id="local-parent-container" class="hidden"></div>
  
  <!-- Volume Control -->
  <div id="volume-control-container" class="flex items-center justify-center gap-2 px-4 py-1">
    <i class="material-icons align-middle">volume_down</i>
    <input 
      type="range" 
      min="0" 
      max="100" 
      step="1" 
      bind:value={playerVolume}
      on:input={(e) => handleVolumeChange(e.target.value)}
      class="w-[200px] h-2 rounded-lg bg-gray-300 outline-none appearance-none cursor-pointer
             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 
             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer"
    />
    <i class="material-icons align-middle">volume_up</i>
  </div>
  
  <!-- Update Container -->
  {#if isUpdateAvailable}
    <div 
      id="update-container"
      class="text-[0.7em] p-[0.7em] m-0 bg-d2-update-bg absolute bottom-0 w-full left-0"
    >
      <span id="update-text">
        {isUpdateDownloading ? 'Update Downloading!' : 'Update Available!'}
      </span>
      {#if !isUpdateDownloading}
        <span id="update-buttons" class="ml-2">
          <button class="d2button btn-primary" on:click={installUpdate}>Install</button>
          <button class="d2button btn-secondary ml-2" on:click={ignoreUpdateHandler}>Ignore</button>
        </span>
      {/if}
    </div>
  {/if}
</div>

