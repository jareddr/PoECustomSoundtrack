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
  let showSettings = false;
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

  async function openEditor() {
    try {
      await ipcRenderer.invoke('open-editor-window');
    } catch (err) {
      console.error('Error opening editor window:', err);
      alert('Failed to open editor window');
    }
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
        trackName: currentTrackName,
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
  class="h-screen overflow-hidden font-sans text-d2-text relative window-drag"
  style="background-image: url(/mirror.png); background-size: cover; background-position: center;"
>
  <!-- Settings Cog Icon -->
  <button
    on:click={toggleSettings}
    class="absolute top-2 right-2 z-50 p-2 hover:bg-black/20 rounded transition-colors no-drag"
    title="Settings"
  >
    <i class="material-icons text-d2-text text-2xl">settings</i>
  </button>

  <!-- Soundtrack Selection at Top -->
  <div class="absolute top-2 left-2 z-50 no-drag">
    <div class="flex items-center gap-2">
      <button type="button" class="d2button" on:click={loadSoundtrackFile}>...</button>
      <button
        type="button"
        class="text-xs truncate cursor-pointer hover:text-d2-text-hover px-2 py-1 text-left max-w-[150px]"
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

  <!-- Main Content Layout -->
  <div class="flex h-full items-center justify-center pb-16 px-16">
    <!-- Display Area -->
    <div class="flex bg-black opacity-75 mx-30 w-[350px] h-[180px] rounded-lg">
      <!-- Left Side: Player Container -->
      <div class="flex-shrink-0 rounded-l-lg mr-4 border-blue-500 border-0 overflow-hidden">
        <div id="youtube-parent-container" class="h-[150px] w-[150px]"></div>
        <div id="local-parent-container" class="hidden"></div>
      </div>

      <!-- Right Side: Zone and Track Info -->
      <div class="flex flex-col gap-4 flex-1 border-red-500 border-0 pt-4 w-[175px] overflow-hidden">
        <div>
          <div class="text-lg font-exocet font-bold mb-2">Current Area</div>
          {#if currentZoneName}
            <div class="text-sm font-bold">{currentZoneName}</div>
          {:else}
            <div class="text-sm font-bold text-d2-text/60">No zone detected</div>
          {/if}
        </div>

        <div>
          <div class="text-lg font-exocet font-bold mb-2">Now Playing</div>
          {#if currentTrackName}
            <div
              class="text-sm font-bold overflow-hidden whitespace-nowrap {shouldScrollTrack
                ? 'scrolling-track'
                : ''}"
              bind:this={trackNameElement}
            >
              <span
                class="inline-block {shouldScrollTrack ? 'scrolling-text' : ''}"
                bind:this={trackTextElement}
                style={shouldScrollTrack && trackScrollAmount > 0
                  ? `--scroll-amount: ${trackScrollAmount}px;`
                  : ''}>{currentTrackName}</span
              >
            </div>
          {:else}
            <div class="text-base font-bold text-d2-text/60">No track</div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Volume Control - Vertical Slider at Bottom Center -->
  <div
    id="volume-control-container"
    class="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center no-drag"
  >
<div class="slider-wrap">
  <input
  type="range"
  min="0"
  max="100"
  step="1"
  bind:value={playerVolume}
  on:input={(e) => updateVolumeImmediate(e.target.value)}
  on:change={(e) => handleVolumeChange(e.target.value)}
  class="vertical-slider"
/>
</div>
  </div>

  <!-- Update Container -->
  {#if isUpdateAvailable}
    <div
      id="update-container"
      class="absolute bottom-0 left-0 right-0 text-sm p-3 bg-d2-update-bg no-drag"
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

  <!-- Settings Modal -->
  {#if showSettings}
    <!-- Fullscreen Modal -->
    <div
      class="fixed inset-0 z-50 bg-bg-100 border-4 border-primary-200 p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between mb-4">
        <h2 id="settings-title" class="text-2xl font-exocet font-bold text-text-100">Settings</h2>
        <button
          on:click={closeSettings}
          class="p-1 hover:bg-bg-300 rounded transition-colors"
          title="Close"
        >
          <i class="material-icons text-text-100">close</i>
        </button>
      </div>

      <!-- Settings Content -->
      <div class="space-y-4">
        <!-- Path of Exile Directory Selection -->
        <div class="bg-bg-200 p-4 rounded border border-bg-300">
          <div class="flex items-center justify-between mb-2">
            <span class="text-lg text-text-100">Select Path of Exile Directory</span>
            <i
              class="material-icons text-accent-100 {poePathValid ? 'inline' : 'hidden'}"
              title="Path of Exile Detected!"
            >
              check_circle
            </i>
            <i
              class="material-icons text-primary-100 cursor-pointer {!poePathValid
                ? 'inline'
                : 'hidden'}"
              title="Cannot locate path of exile client log."
            >
              error
            </i>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="d2button bg-primary-200 hover:bg-primary-100 text-text-100 border-primary-300"
              on:click={loadLogFile}>...</button
            >
            <button
              type="button"
              class="text-sm flex-1 truncate cursor-pointer hover:text-text-200 px-2 py-1 text-left text-text-200"
              on:click={loadLogFile}
              title={poePath}
            >
              {poePath}
            </button>
          </div>
        </div>

        <!-- Music Volume Check -->
        <div class="bg-bg-200 p-4 rounded border border-bg-300">
          <div class="flex items-center justify-between">
            <span class="text-lg text-text-100">Turn off in game music</span>
            <i
              class="material-icons text-accent-100 {volumeValid ? 'inline' : 'hidden'}"
              title="Checks out."
            >
              check_circle
            </i>
            <i
              class="material-icons text-primary-100 cursor-pointer {!volumeValid
                ? 'inline'
                : 'hidden'}"
              title="Set the music volume in game to 0 to avoid clashing tracks."
            >
              warning
            </i>
          </div>
          <p class="text-sm text-text-200 mt-1">
            Set the music volume in game to 0 to avoid clashing tracks.
          </p>
        </div>

        <!-- Character Event Voices Check -->
        <div class="bg-bg-200 p-4 rounded border border-bg-300">
          <div class="flex items-center justify-between">
            <span class="text-lg text-text-100">Enable gameplay event voices</span>
            <i
              class="material-icons text-accent-100 {charEventValid ? 'inline' : 'hidden'}"
              title="Checks out."
            >
              check_circle
            </i>
            <i
              class="material-icons text-primary-100 cursor-pointer {!charEventValid
                ? 'inline'
                : 'hidden'}"
              title="Enable gameplay event voices to enable boss music."
            >
              warning
            </i>
          </div>
          <p class="text-sm text-text-200 mt-1">
            Enable gameplay event voices to enable boss music.
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Draggable window regions */
  .window-drag {
    -webkit-app-region: drag;
  }

  .no-drag {
    -webkit-app-region: no-drag;
  }

  .scrolling-track {
    position: relative;
  }

  .scrolling-text {
    display: inline-block;
    animation: scroll-text 10s ease-in-out infinite;
    padding-right: 1rem; /* Add space at the end for smooth transition */
  }

  @keyframes scroll-text {
    0%,
    25% {
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

  .slider-wrap {
  width: 30px;    /* overall visible width */
  height: 150px;  /* overall visible height */
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Base slider: horizontal, then rotated */
.vertical-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 150px;   /* this becomes the VERTICAL length */
  height: 8px;    /* track thickness */
  background: #220e05;
  border-radius: 5px;
  outline: none;
  cursor: pointer;

  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}

/* Track */
.vertical-slider::-webkit-slider-runnable-track {
  height: 8px;
  background: #220e05;
  border-radius: 5px;
}

/* Thumb with your image */
.vertical-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 30px;
  height: 30px;
  background: url(/button.png) no-repeat center;
  background-size: 30px 30px;
  margin-top: -9px;
  margin-left: 3px;
  border: none;
  cursor: pointer;
}
</style>
