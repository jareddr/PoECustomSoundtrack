<script>
  import { onMount, onDestroy } from 'svelte';
  import SoundtrackEditor from './SoundtrackEditor.svelte';
  
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
  let showSettings = false;
  let showEditor = false;
  let currentZoneName = '';
  let currentTrackName = '';
  let hasCheckedInitialState = false;
  
  let playerController = null;
  let isUpdatingFromIPC = false;
  let trackNameElement = null;
  let shouldScrollTrack = false;
  
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
        // Capture track name from changeTrack event
        if (data && data.name) {
          currentTrackName = data.name;
        }
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
  });
  
  onDestroy(() => {
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
    
    // Update zone and track names from state
    if (data.currentZoneName) {
      currentZoneName = data.currentZoneName;
    }
    if (data.currentTrackName) {
      currentTrackName = data.currentTrackName;
    }
    
    const oldVolume = playerVolume;
    const newVolume = data.playerVolume ? parseInt(data.playerVolume) : 25;
    
    if (oldVolume !== newVolume) {
      // Update volume from IPC without triggering another IPC round-trip
      isUpdatingFromIPC = true;
      playerVolume = newVolume;
      // Update player volume directly without sending IPC
      if (playerController) {
        playerController.setVolume(newVolume);
      }
      isUpdatingFromIPC = false;
    } else {
      playerVolume = newVolume;
    }
    
    if (!data.isPoERunning && isPlaying) {
      isPlaying = false;
      if (playerController) {
        playerController.fadeout();
      }
    }
    
    // Auto-open settings on initial load if any checkmarks are not green
    if (!hasCheckedInitialState) {
      hasCheckedInitialState = true;
      if (!poePathValid || !volumeValid || !charEventValid) {
        showSettings = true;
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
  
  // Update volume immediately for smooth dragging (local only, no IPC)
  function updateVolumeImmediate(volume) {
    const vol = typeof volume === 'string' ? parseInt(volume) : volume;
    if (playerController) {
      playerController.setVolume(vol);
    }
    playerVolume = vol;
  }
  
  // Handle volume change and persist via IPC
  function handleVolumeChange(volume, skipIPC = false) {
    const vol = typeof volume === 'string' ? parseInt(volume) : volume;
    if (playerController) {
      playerController.setVolume(vol);
    }
    if (!skipIPC) {
      ipcRenderer.send('setPlayerVolume', vol.toString());
    }
    playerVolume = vol;
  }
  
  function installUpdate() {
    ipcRenderer.send('installUpdate');
  }
  
  function ignoreUpdateHandler() {
    ignoreUpdate = true;
    isUpdateAvailable = false;
  }
  
  function toggleSettings() {
    showSettings = !showSettings;
  }
  
  function closeSettings() {
    showSettings = false;
  }

  function openEditor() {
    showEditor = true;
  }

  function closeEditor() {
    showEditor = false;
  }

  function handleEditorSave() {
    // Reload soundtrack after save
    ipcRenderer.send('updateState');
  }
  
  let trackScrollAmount = 0;
  let trackTextElement = null;
  
  function checkTrackNameOverflow() {
    if (trackNameElement && trackTextElement) {
      const container = trackNameElement;
      const textSpan = trackTextElement;
      
      // Force a reflow to ensure accurate measurements
      void container.offsetWidth;
      void textSpan.offsetWidth;
      
      // Use getBoundingClientRect for more accurate measurements
      const containerRect = container.getBoundingClientRect();
      const textRect = textSpan.getBoundingClientRect();
      
      const containerWidth = containerRect.width;
      // Try multiple methods to get text width
      const textWidth = Math.max(
        textSpan.scrollWidth,
        textSpan.offsetWidth,
        textRect.width,
        textSpan.getBoundingClientRect().width
      );
      
      const isOverflowing = textWidth > containerWidth && containerWidth > 0 && textWidth > 0;
      
      console.log('Overflow check:', {
        containerWidth,
        textWidth,
        scrollWidth: textSpan.scrollWidth,
        offsetWidth: textSpan.offsetWidth,
        rectWidth: textRect.width,
        isOverflowing,
        trackName: currentTrackName
      });
      
      shouldScrollTrack = isOverflowing;
      
      if (isOverflowing && containerWidth > 0 && textWidth > 0) {
        // Calculate how much we need to scroll
        trackScrollAmount = textWidth - containerWidth;
        console.log('Setting scroll amount:', trackScrollAmount);
        // Set CSS variable on both container and span to ensure it's accessible
        container.style.setProperty('--scroll-amount', `${trackScrollAmount}px`);
        textSpan.style.setProperty('--scroll-amount', `${trackScrollAmount}px`);
        console.log('CSS variable set. Container classes:', container.className);
        console.log('Span classes:', textSpan.className);
        console.log('Span style:', textSpan.style.cssText);
      } else {
        container.style.removeProperty('--scroll-amount');
        textSpan.style.removeProperty('--scroll-amount');
        // If textWidth is 0, retry after a delay
        if (textWidth === 0 && currentTrackName) {
          setTimeout(() => {
            checkTrackNameOverflow();
          }, 200);
        }
      }
    }
  }
  
  // Check overflow when track name changes or elements are available
  $: if (currentTrackName) {
    // Use a small delay to ensure DOM has fully updated
    setTimeout(() => {
      requestAnimationFrame(() => {
        checkTrackNameOverflow();
      });
    }, 100);
  }
  
  // Also check when elements become available
  $: if (trackNameElement && trackTextElement && currentTrackName) {
    setTimeout(() => {
      requestAnimationFrame(() => {
        checkTrackNameOverflow();
      });
    }, 100);
  }
  
  // Handle Escape key to close settings
  let escapeHandler = null;
  $: if (showSettings && !escapeHandler) {
    escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeSettings();
      }
    };
    window.addEventListener('keydown', escapeHandler);
  } else if (!showSettings && escapeHandler) {
    window.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
</script>

<div 
  class="h-screen overflow-hidden font-exocet font-bold text-d2-text relative"
  style="background-image: url(/piety.png); background-size: cover;"
>
  <!-- Settings Cog Icon -->
  <button
    on:click={toggleSettings}
    class="absolute top-2 right-2 z-50 p-2 hover:bg-black/20 rounded transition-colors"
    title="Settings"
  >
    <i class="material-icons text-d2-text text-2xl">settings</i>
  </button>

  <!-- Main Content -->
  <div class="flex flex-col h-full">
    <!-- Soundtrack Selection at Top -->
    <div class="px-4 py-3">
      <div class="mb-1">
        <div class="text-lg mb-1">Select Soundtrack</div>
        <div class="flex items-center gap-2">
          <button type="button" class="d2button" on:click={loadSoundtrackFile}>...</button>
          <button
            type="button"
            class="text-sm flex-1 truncate cursor-pointer hover:text-d2-text-hover px-2 py-1 text-left"
            on:click={loadSoundtrackFile}
            title={soundtrackName}
          >
            {soundtrackName}
          </button>
          <button
            type="button"
            class="d2button btn-secondary"
            on:click={openEditor}
            title="Edit Soundtrack"
          >
            Edit
          </button>
        </div>
      </div>
    </div>

    <!-- Zone and Track Info -->
    <div class="px-4 flex flex-col gap-2">
      <div class="text-xl">Current Area</div>
      {#if currentZoneName}
        <div class="text-base font-bold">{currentZoneName}</div>
      {:else}
        <div class="text-base font-bold text-d2-text/60">No zone detected</div>
      {/if}
      
      <div class="text-xl">Now Playing</div>
      {#if currentTrackName}
        <div 
          class="text-base font-bold overflow-hidden whitespace-nowrap {shouldScrollTrack ? 'scrolling-track' : ''}"
          bind:this={trackNameElement}
        >
          <span 
            class="inline-block {shouldScrollTrack ? 'scrolling-text' : ''}"
            bind:this={trackTextElement}
            style={shouldScrollTrack && trackScrollAmount > 0 ? `--scroll-amount: ${trackScrollAmount}px;` : ''}
          >{currentTrackName}</span>
        </div>
      {:else}
        <div class="text-base font-bold text-d2-text/60">No track</div>
      {/if}
    </div>

    <!-- Player Containers -->
    <div id="youtube-parent-container" class="mt-2 h-[220px] flex-shrink-0"></div>
    <div id="local-parent-container" class="hidden"></div>

    <!-- Volume Control -->
    <div id="volume-control-container" class="flex items-center justify-center gap-2 px-4 py-3 flex-shrink-0">
      <i class="material-icons align-middle text-lg">volume_down</i>
      <input 
        type="range" 
        min="0" 
        max="100" 
        step="1" 
        bind:value={playerVolume}
        on:input={(e) => updateVolumeImmediate(e.target.value)}
        on:change={(e) => handleVolumeChange(e.target.value)}
        class="w-[200px] h-2 rounded-lg bg-gray-300 outline-none appearance-none cursor-pointer
               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 
               [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <i class="material-icons align-middle text-lg">volume_up</i>
    </div>

    <!-- Spacer to push update container to bottom -->
    <div class="flex-grow"></div>

    <!-- Update Container -->
    {#if isUpdateAvailable}
      <div 
        id="update-container"
        class="text-sm p-3 m-0 bg-d2-update-bg w-full"
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

  <!-- Settings Modal -->
  {#if showSettings}
    <!-- Fullscreen Modal -->
    <div 
      class="fixed inset-0 z-50 bg-d2-button border-4 border-d2-button-border p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
        <!-- Modal Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 id="settings-title" class="text-2xl font-bold">Settings</h2>
          <button
            on:click={closeSettings}
            class="p-1 hover:bg-d2-button-hover rounded transition-colors"
            title="Close"
          >
            <i class="material-icons text-d2-text">close</i>
          </button>
        </div>

        <!-- Settings Content -->
        <div class="space-y-4">
          <!-- Path of Exile Directory Selection -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-lg">Select Path of Exile Directory</span>
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
            <div class="flex items-center gap-2">
              <button type="button" class="d2button" on:click={loadLogFile}>...</button>
              <button
                type="button"
                class="text-sm flex-1 truncate cursor-pointer hover:text-d2-text-hover px-2 py-1 text-left"
                on:click={loadLogFile}
                title={poePath}
              >
                {poePath}
              </button>
            </div>
          </div>

          <!-- Music Volume Check -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-lg">Turn off in game music</span>
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
            <p class="text-sm text-d2-text/80 mt-1">Set the music volume in game to 0 to avoid clashing tracks.</p>
          </div>

          <!-- Character Event Voices Check -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-lg">Enable gameplay event voices</span>
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
            <p class="text-sm text-d2-text/80 mt-1">Enable gameplay event voices to enable boss music.</p>
          </div>
        </div>
    </div>
  {/if}

  <!-- Soundtrack Editor Modal -->
  {#if showEditor}
    <SoundtrackEditor onClose={closeEditor} onSave={handleEditorSave} />
  {/if}
</div>

<style>
  .scrolling-track {
    position: relative;
  }
  
  .scrolling-text {
    display: inline-block;
    animation: scroll-text 10s ease-in-out infinite;
    padding-right: 1rem; /* Add space at the end for smooth transition */
  }
  
  @keyframes scroll-text {
    0%, 25% {
      transform: translateX(0);
    }
    30% {
      transform: translateX(0);
    }
    70% {
      transform: translateX(calc(-1 * var(--scroll-amount)));
    }
    100% {
      transform: translateX(0);
    }
  }
</style>
