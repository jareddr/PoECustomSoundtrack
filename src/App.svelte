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
  let soundtrackTrackCount = 0;
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

    ipcRenderer.on('stopTrack', () => {
      if (playerController) {
        playerController.fadeout();
      }
      isPlaying = false;
    });

    ipcRenderer.on('updateState', (event, data) => {
      if (data) updateState(data);
      else ipcRenderer.send('updateState');
    });

    ipcRenderer.on('errorMessage', (event, data) => {
      alert(data);
    });

    // Request initial state
    ipcRenderer.send('updateState');
    // Request again after a short delay in case first response was stale (e.g. track count)
    const retryTimer = setTimeout(() => ipcRenderer.send('updateState'), 400);

    // Refresh state when window gains focus (e.g. after loading file in editor)
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener('focus', handleWindowFocus);
    };
  });

  function handleWindowFocus() {
    ipcRenderer.send('updateState');
  }

  onDestroy(() => {
    ipcRenderer.removeAllListeners('changeTrack');
    ipcRenderer.removeAllListeners('stopTrack');
    ipcRenderer.removeAllListeners('updateState');
    ipcRenderer.removeAllListeners('errorMessage');
  });

  function updateState(data) {
    poePath = data.path.replace(/\\/g, '/');

    let name = (data.soundtrack || '').replace(/\\/g, '/');
    if (!name) {
      soundtrackName = 'Unsaved soundtrack';
    } else if (name.match(/([^/]+)\.soundtrack$/)) {
      soundtrackName = name.match(/([^/\\]+)\.soundtrack$/)[1];
    } else {
      soundtrackName = name;
    }

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
    soundtrackTrackCount = typeof data.soundtrackTrackCount === 'number' ? data.soundtrackTrackCount : 0;

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

  function minimizeWindow() {
    ipcRenderer.send('minimize-window');
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

  async   function openEditor() {
    try {
      ipcRenderer.invoke('open-editor-window');
    } catch (err) {
      console.error('Error opening editor window:', err);
      alert('Failed to open editor window');
    }
  }

  function togglePlayPause() {
    if (playerController) {
      if (isPlaying) {
        playerController.pause();
        isPlaying = false;
      } else {
        // Resume playing
        playerController.play();
        isPlaying = true;
      }
    }
  }

  function closeApp() {
    ipcRenderer.send('close-app');
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
  <!-- Decorative Buttons -->
  <!-- Top Left Button (70px) - Minimize -->
  <button
    on:click={minimizeWindow}
    class="decorative-button button-top-left no-drag"
    title="Minimize"
  >
    <div class="button-bg"></div>
    <i class="material-icons button-icon">minimize</i>
  </button>

  <!-- Top Center Button (70px) - Settings -->
  <button
    on:click={toggleSettings}
    class="decorative-button button-top-center no-drag"
    title="Settings"
  >
    <div class="button-bg"></div>
    <i class="material-icons button-icon">settings</i>
  </button>

  <!-- Top Right Button (70px) - Close -->
  <button
    on:click={closeApp}
    class="decorative-button button-top-right no-drag"
    title="Close App">
    <div class="button-bg"></div>
    <i class="material-icons button-icon">close</i>
  </button>

  <!-- Bottom Left Button (70px) - Play/Pause -->
  <button
    on:click={togglePlayPause}
    class="decorative-button button-bottom-left no-drag"
    title="Play/Pause"
  >
    <div class="button-bg"></div>
    <i class="material-icons button-icon">{isPlaying ? 'pause' : 'play_arrow'}</i>
  </button>

  <!-- Bottom Right Button (100px) - Edit -->
  <button
    on:click={openEditor}
    class="decorative-button button-bottom-right no-drag"
    title="Edit Soundtrack"
  >
    <div class="button-bg"></div>
    <i class="material-icons button-icon">edit</i>
  </button>

  <!-- Settings Cog Icon (keeping old one for now, can be removed later) -->
  <button
    on:click={toggleSettings}
    class="absolute top-2 right-2 z-50 p-2 hover:bg-black/20 rounded transition-colors no-drag"
    title="Settings"
    style="display: none;"
  >
    <i class="material-icons text-d2-text text-2xl">settings</i>
  </button>

  <!-- Soundtrack Selection at Top (hidden, replaced by decorative buttons) -->
  <div class="absolute top-2 left-2 z-50 no-drag" style="display: none;">
    <div class="flex items-center gap-2">
      <span class="text-xs truncate px-2 py-1 max-w-[150px]" title={soundtrackName}>{soundtrackName}</span>
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
      <div class="flex flex-col gap-1.5 flex-1 border-red-500 border-0 pt-2 pr-1 w-[175px] overflow-hidden font-pica min-h-0">
        <div class="min-w-0">
          <div class="text-sm font-exocet font-bold mb-0.5">Loaded Soundtrack</div>
          <div class="text-xs text-d2-text/80 truncate" title={soundtrackName}>{soundtrackName}</div>
        </div>
        <div class="min-w-0">
          <div class="text-sm font-exocet font-bold mb-0.5">Current Area</div>
          {#if currentZoneName}
            <div class="text-xs font-bold truncate" title={currentZoneName}>{currentZoneName}</div>
          {:else}
            <div class="text-xs font-bold text-d2-text/60">No zone detected</div>
          {/if}
        </div>
        <div class="min-w-0 flex-1 min-h-0 flex flex-col">
          <div class="text-sm font-exocet font-bold mb-0.5 flex-shrink-0">Now Playing</div>
          {#if soundtrackTrackCount === 0}
            <div class="text-xs text-d2-text/80 leading-tight flex-shrink-0">
              No tracks are loaded, please load a playlist using the
              <button
                type="button"
                class="inline-flex align-middle p-0.5 rounded hover:bg-white/10 transition-colors no-drag"
                on:click={openEditor}
                title="Soundtrack Editor"
                aria-label="Soundtrack Editor"
              >
                <i class="material-icons text-base">edit</i>
              </button>
              button.
            </div>
          {:else if currentTrackName}
            <div
              class="text-xs font-bold overflow-hidden whitespace-nowrap min-h-0 {shouldScrollTrack
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
            <div class="text-xs font-bold text-d2-text/60 flex-shrink-0">No track</div>
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
  style="--volume-percent: {playerVolume}%"
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

  <!-- Settings Modal (full window) -->
  {#if showSettings}
    <div
      class="fixed inset-0 z-50 no-drag bronze-panel overflow-y-auto p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <!-- Modal Header -->
        <div class="flex items-center justify-between mb-6">
          <h2 id="settings-title" class="text-2xl font-exocet font-bold uppercase tracking-wide text-bronze-title">
            Settings
          </h2>
          <button
            on:click={closeSettings}
            class="p-1 rounded transition-colors text-bronze-title hover:text-bronze-buttonHover"
            title="Close"
          >
            <i class="material-icons">close</i>
          </button>
        </div>

        <!-- Section: WINDOW -->
        <div class="mb-6">
          <div class="bronze-section-header mb-3">
            <i class="material-icons text-lg" aria-hidden="true">computer</i>
            Window
          </div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="bronze-label text-base">Select Path of Exile Directory</span>
            <i
              class="material-icons text-accent-100 flex-shrink-0 {poePathValid ? 'inline' : 'hidden'}"
              title="Path of Exile Detected!"
            >
              check_circle
            </i>
            <i
              class="material-icons text-amber-400 flex-shrink-0 {!poePathValid ? 'inline' : 'hidden'}"
              title="Cannot locate path of exile client log."
            >
              error
            </i>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="bronze-btn-primary flex-shrink-0"
              on:click={loadLogFile}
            >
              ...
            </button>
            <button
              type="button"
              class="bronze-label text-sm flex-1 truncate cursor-pointer hover:text-bronze-buttonHover px-2 py-1 text-left min-w-0"
              on:click={loadLogFile}
              title={poePath}
            >
              {poePath}
            </button>
          </div>
        </div>

        <hr class="bronze-section-divider my-4" />

        <!-- Section: GAME / PLAYBACK -->
        <div class="mb-6">
          <div class="bronze-section-header mb-3">
            <i class="material-icons text-lg" aria-hidden="true">volume_up</i>
            Game
          </div>
          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between gap-2">
                <span class="bronze-label text-base">Turn off in game music</span>
                <i
                  class="material-icons text-accent-100 flex-shrink-0 {volumeValid ? 'inline' : 'hidden'}"
                  title="Checks out."
                >
                  check_circle
                </i>
                <i
                  class="material-icons text-amber-400 flex-shrink-0 {!volumeValid ? 'inline' : 'hidden'}"
                  title="Set the music volume in game to 0 to avoid clashing tracks."
                >
                  warning
                </i>
              </div>
              <p class="bronze-label text-sm mt-1 opacity-90">
                Set the music volume in game to 0 to avoid clashing tracks.
              </p>
            </div>
            <div>
              <div class="flex items-center justify-between gap-2">
                <span class="bronze-label text-base">Enable gameplay event voices</span>
                <i
                  class="material-icons text-accent-100 flex-shrink-0 {charEventValid ? 'inline' : 'hidden'}"
                  title="Checks out."
                >
                  check_circle
                </i>
                <i
                  class="material-icons text-amber-400 flex-shrink-0 {!charEventValid ? 'inline' : 'hidden'}"
                  title="Enable gameplay event voices to enable boss music."
                >
                  warning
                </i>
              </div>
              <p class="bronze-label text-sm mt-1 opacity-90">
                Enable gameplay event voices to enable boss music.
              </p>
            </div>
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
  background: linear-gradient(
    90deg,
    #ffd700 0%,
    #ffd700 var(--volume-percent, 0%),
    #220e05 var(--volume-percent, 0%),
    #220e05 100%
  );
  border-radius: 5px;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6), 0 0 12px rgba(255, 215, 0, 0.4);
}

/* Thumb with your image */
.vertical-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 30px;
  height: 30px;
  background: url(/button.png) no-repeat center;
  background-size: 30px 30px;
  margin-top: -10px;
  margin-left: 3px;
  border: none;
  cursor: pointer;
}

/* Decorative Buttons */
.decorative-button {
  position: absolute;
  z-index: 50;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: transform 0.2s ease;
  outline: none;
}

.decorative-button:focus,
.decorative-button:focus-visible {
  outline: none;
  box-shadow: none;
}

/* Top buttons (70px) */
.button-top-center {
  width: 100px;
  height: 100px;
  top: 0%;
  left: 50%;
  transform: translateX(-50%);
}

.button-top-left {
  width: 100px;
  height: 100px;
  top: 12.5%;
  left: 19.5%;
}

.button-top-right {
  width: 100px;
  height: 100px;
  top: 12.5%;
  right: 19.5%;
}

/* Bottom buttons */
.button-bottom-left {
  width: 132px;
  height: 132px;
  bottom: 30.5%;
  left: 9.2%;
}

.button-bottom-right {
  width: 132px;
  height: 132px;
  bottom: 30.5%;
  right: 9.2%;
}

.decorative-button:active {
  transform: scale(0.95);
}

.button-top-center:active {
  transform: translateX(-50%) scale(0.95);
}

.button-bottom-left:active {
  transform: scale(0.95);
}

.button-bottom-right:active {
  transform: scale(0.95);
}

.button-bg {
  position: absolute;
  width: 100%;
  height: 100%;
  background: url(/button.png) no-repeat center;
  background-size: contain;
  top: 0;
  left: 0;
  pointer-events: none; /* Allow clicks to pass through to button */
}

.button-icon {
  position: relative;
  z-index: 1;
  color: #d2b48c;
  font-size: 2em;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  transition: color 0.2s ease, text-shadow 0.2s ease;
}

.decorative-button:hover .button-icon {
  color: #ffd700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.8), 0 0 12px rgba(255, 215, 0, 0.6), 0 0 16px rgba(255, 215, 0, 0.4);
}

.button-bottom-right .button-icon {
  font-size: 2.5em;
}
</style>
