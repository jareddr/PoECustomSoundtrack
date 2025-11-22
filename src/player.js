// Constants - inline for now since constants.js is CommonJS and this is ES module
// In production, Vite will handle the interop, but for now we'll use values directly
const PLAYER_CONSTANTS = {
  DEFAULT_VOLUME: 25,
  FADEOUT_MULTIPLIER: 0.8,
  FADEOUT_INTERVAL_MS: 300,
  MIN_VOLUME_THRESHOLD: 1,
  YOUTUBE_LOAD_DELAY_MS: 10,
  RANDOM_ID_MAX: 10000,
};

const YOUTUBE_CONSTANTS = {
  PLAYER_HEIGHT: '170',
  PLAYER_WIDTH: '100%',
};

/**
 * Controller for managing multiple player types (YouTube, Local, etc.)
 */
class PlayerController {
  constructor() {
    this.players = {};
    this.state = false;
    this.activePlayer = false;
    this.volume = PLAYER_CONSTANTS.DEFAULT_VOLUME;
    this.youtubePlayer1 = null;
    this.youtubePlayer2 = null;
    this.activeYoutubePlayerIndex = null;
  }

  /**
   * Pause the currently active player
   */
  pause() {
    if (this.activePlayer && this.activePlayer.player) {
      this.activePlayer.pause();
    }
  }

  /**
   * Resume/play the currently active player
   */
  play() {
    if (this.activePlayer && this.activePlayer.play) {
      this.activePlayer.play();
    }
  }

  /**
   * Fade out the currently active player
   */
  fadeout() {
    if (this.activePlayer && this.activePlayer.player) {
      this.activePlayer.fadeout();
    }
  }

  /**
   * Set a new track to play
   * @param {Object} track - Track object with type, id, name, etc.
   * @param {number} startingPosition - Starting position in seconds
   */
  setTrack(track, startingPosition) {
    // Use player pool for YouTube tracks
    if (track.type === 'youtube') {
      console.log(`[PlayerController] Setting YouTube track: ${track.id || track.name || 'unknown'}, starting at ${startingPosition}s`);
      
      // Get the currently active YouTube player (if any)
      let activeYoutubePlayer = null;
      if (this.activeYoutubePlayerIndex === 1 && this.youtubePlayer1) {
        activeYoutubePlayer = this.youtubePlayer1;
        console.log(`[PlayerController] Currently active: Player 1`);
      } else if (this.activeYoutubePlayerIndex === 2 && this.youtubePlayer2) {
        activeYoutubePlayer = this.youtubePlayer2;
        console.log(`[PlayerController] Currently active: Player 2`);
      } else {
        console.log(`[PlayerController] No active player currently`);
      }

      // Start fadeout on the active player if it exists
      if (activeYoutubePlayer && activeYoutubePlayer.player) {
        console.log(`[PlayerController] Starting fadeout on active player`);
        activeYoutubePlayer.fadeout();
      }

      // Get the inactive player (will initialize both if needed)
      const inactivePlayer = this._getInactiveYoutubePlayer(track, startingPosition);

      // Determine which player we're using
      const playerIndex = inactivePlayer === this.youtubePlayer1 ? 1 : 2;
      console.log(`[PlayerController] Using Player ${playerIndex} for track: ${track.id}`);
      console.log(`[PlayerController] Player ${playerIndex} state - ready: ${inactivePlayer.ready}, has player object: ${!!inactivePlayer.player}, player type: ${typeof inactivePlayer.player}`);

      // Update the inactive player's track information
      inactivePlayer.track = track;
      inactivePlayer.startTime = startingPosition;
      inactivePlayer.endTime = track.endSeconds || 0;

      // Make the player visible again if it was hidden
      if (inactivePlayer.player && inactivePlayer.player.setSize) {
        inactivePlayer.player.setSize(YOUTUBE_CONSTANTS.PLAYER_WIDTH, YOUTUBE_CONSTANTS.PLAYER_HEIGHT);
      }

      // Restore volume to controller volume in case it was faded out
      if (inactivePlayer.player && inactivePlayer.player.setVolume) {
        inactivePlayer.player.setVolume(this.volume);
      }

      // Load the new track on the inactive player
      // This is critical - we must ensure the track loads even if player was created with empty track
      const attemptLoadTrack = () => {
        // Double-check that we have everything we need
        if (!inactivePlayer) {
          console.log(`[PlayerController] attemptLoadTrack: inactivePlayer is null/undefined`);
          return false;
        }
        // Check if player object exists and is not false/null
        // this.player is initialized to false, so we need to check it's actually an object
        if (!inactivePlayer.player || inactivePlayer.player === false) {
          console.log(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - player object not available yet`);
          return false; // Player object not available yet
        }
        // Check if player has the methods we need
        if (typeof inactivePlayer.player.loadVideoById !== 'function') {
          console.log(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - loadVideoById method not available`);
          return false; // Player object not fully initialized
        }
        if (!inactivePlayer.track || !inactivePlayer.track.id || inactivePlayer.track.id.trim() === '') {
          console.log(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - track ID not available (track: ${inactivePlayer.track ? inactivePlayer.track.id : 'null'})`);
          return false; // Track or track ID not available or empty
        }
        // Only load if player is ready
        if (!inactivePlayer.ready) {
          console.log(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - not ready yet`);
          return false; // Player not ready yet
        }
        try {
          console.log(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - Loading video ${inactivePlayer.track.id} at ${inactivePlayer.startTime}s, end: ${inactivePlayer.endTime}s`);
          inactivePlayer.setTrack(inactivePlayer.track.id, inactivePlayer.startTime, inactivePlayer.endTime);
          console.log(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - Successfully called setTrack`);
          return true; // Successfully attempted to load
        } catch (error) {
          console.error(`[PlayerController] attemptLoadTrack: Player ${playerIndex} - Error loading track:`, error);
          return false;
        }
      };

      // Try to load immediately if conditions are met
      console.log(`[PlayerController] Attempting to load track on Player ${playerIndex} immediately`);
      let loaded = attemptLoadTrack();

      // Always set up retries to handle timing issues
      // This is especially important for players that were created with empty tracks
      // and became ready before we set the real track
      const retryLoad = (delay) => {
        return () => {
          if (!loaded) {
            console.log(`[PlayerController] Retry loading track on Player ${playerIndex} after ${delay}ms delay`);
            if (attemptLoadTrack()) {
              loaded = true;
              console.log(`[PlayerController] Successfully loaded track on Player ${playerIndex} on retry`);
            }
          }
        };
      };
      
      // Multiple retry attempts to handle various timing scenarios
      if (!loaded) {
        console.log(`[PlayerController] Setting up retries for Player ${playerIndex}`);
        setTimeout(retryLoad(50), 50);   // Quick check for immediate ready state
        setTimeout(retryLoad(200), 200);    // Check after short delay
        setTimeout(retryLoad(500), 500);   // Check after medium delay
        setTimeout(retryLoad(1000), 1000);  // Final fallback check
      } else {
        console.log(`[PlayerController] Track loaded immediately on Player ${playerIndex}`);
      }

      // Set the inactive player as active
      if (inactivePlayer === this.youtubePlayer1) {
        this.activeYoutubePlayerIndex = 1;
        console.log(`[PlayerController] Set Player 1 as active`);
      } else if (inactivePlayer === this.youtubePlayer2) {
        this.activeYoutubePlayerIndex = 2;
        console.log(`[PlayerController] Set Player 2 as active`);
      }

      this.activePlayer = inactivePlayer;
    } else {
      // For non-YouTube players (e.g., local), use existing behavior
      let existingPlayer;
      if (this.activePlayer && this.activePlayer.player) {
        existingPlayer = this.activePlayer;
      }
      this.activePlayer = new this.players[track.type](track, startingPosition, `${track.type}-parent-container`, this);
      if (existingPlayer) {
        existingPlayer.fadeout();
        existingPlayer = null;
      }
      // Reset YouTube player index when switching to non-YouTube
      if (this.activePlayer && !(this.activePlayer instanceof YoutubePlayer)) {
        this.activeYoutubePlayerIndex = null;
      }
    }
  }

  /**
   * Handle track ended event - restart playback
   */
  trackEnded() {
    if (this.activePlayer) {
      this.activePlayer.play();
    }
  }

  /**
   * Play a track
   * @param {Object} track - Track object
   * @param {number} startingPosition - Starting position in seconds
   */
  playTrack(track, startingPosition) {
    this.setTrack(track, startingPosition);
  }

  /**
   * Register a player type
   * @param {Function} playerConstructor - Player class constructor
   * @param {string} type - Player type identifier
   */
  register(playerConstructor, type) {
    this.players[type] = playerConstructor;
  }

  /**
   * Get current volume
   * @returns {number} Current volume (0-100)
   */
  getVolume() {
    return this.activePlayer ? this.activePlayer.getVolume() : 0;
  }

  /**
   * Set volume for active player
   * @param {number} volume - Volume level (0-100)
   */
  setVolume(volume) {
    this.volume = volume;
    if (this.activePlayer && this.activePlayer.player) {
      this.activePlayer.setVolume(volume);
    }
  }

  /**
   * Initialize a YouTube player instance
   * @param {number} index - Player index (1 or 2)
   * @param {string} containerId - Container ID for the player
   * @param {Object} track - Track object (can be null for initial setup)
   * @param {number} startingPosition - Starting position in seconds
   * @returns {YoutubePlayer} Initialized YouTube player instance
   */
  _initializeYoutubePlayer(index, containerId, track, startingPosition) {
    const YoutubePlayerClass = this.players['youtube'];
    if (!YoutubePlayerClass) {
      return null;
    }

    // Create a placeholder track if none provided
    const playerTrack = track || { id: '', endSeconds: 0 };
    const player = new YoutubePlayerClass(playerTrack, startingPosition || 0, containerId, this);
    
    if (index === 1) {
      this.youtubePlayer1 = player;
    } else if (index === 2) {
      this.youtubePlayer2 = player;
    }
    
    return player;
  }

  /**
   * Get the inactive YouTube player, initializing both if needed
   * @param {Object} track - Track object
   * @param {number} startingPosition - Starting position in seconds
   * @returns {YoutubePlayer} The inactive player instance
   */
  _getInactiveYoutubePlayer(track, startingPosition) {
    // Initialize both players if they don't exist
    if (!this.youtubePlayer1) {
      this._initializeYoutubePlayer(1, 'youtube-parent-container', null, 0);
    }
    if (!this.youtubePlayer2) {
      this._initializeYoutubePlayer(2, 'youtube-parent-container', null, 0);
    }

    // Determine which player is currently active
    let inactivePlayer;
    if (this.activeYoutubePlayerIndex === 1) {
      inactivePlayer = this.youtubePlayer2;
    } else if (this.activeYoutubePlayerIndex === 2) {
      inactivePlayer = this.youtubePlayer1;
    } else {
      // No active player, use player 1
      inactivePlayer = this.youtubePlayer1;
    }

    return inactivePlayer;
  }
}

/**
 * YouTube player implementation using YouTube IFrame API
 */
class YoutubePlayer {
  constructor(track, startTime, parentContainer, parentController) {
    this.initialized = false;
    this.player = false;
    this.element = false;
    this.container = false;
    this.ready = false;
    this.controller = parentController;
    this.track = track;
    this.startTime = startTime;
    this.endTime = track.endSeconds;
    this.pollTimer = false;
    this.id = false;
    this.trackError = false;
    this.init(parentContainer);
  }

  /**
   * Set the controller reference
   * @param {Object} controller - PlayerController instance
   */
  setController(controller) {
    this.controller = controller;
  }

  /**
   * Handle player ready event
   */
  onPlayerReady() {
    this.ready = true;
    // Only load track if we have a valid track ID (non-empty string)
    // Empty string is falsy, so this check prevents loading empty tracks
    if (this.track && this.track.id && this.track.id.trim() !== '') {
      this.setTrack(this.track.id, this.startTime, this.endTime);
    }
  }

  /**
   * Handle player state change event
   * @param {Object} event - YouTube player state change event
   */
  onPlayerStateChange(event) {
    if (event.data === 0) {
      // State 0 = ended
      this.controller.trackEnded();
    }
  }

  /**
   * Poll player state (unused but kept for compatibility)
   */
  poll() {
    if (this.getState() === 1) {
      this.updateProgress();
    }
  }

  /**
   * Initialize the YouTube player
   * @param {string} container - Container ID for the player
   */
  init(container) {
    this.container = this.newPlayerContainer(container);
    this.element = this.container;

    // Create a callback queue for multiple players
    if (!window._youtubePlayerQueue) {
      window._youtubePlayerQueue = [];
    }

    const initCallback = () => {
      console.log(`[YoutubePlayer] Initializing player for container ${this.container.id}`);
      this.newPlayer();
    };

    if ('YT' in window) {
      // API already loaded, call immediately
      window.YT.ready(initCallback);
    } else {
      // API not loaded yet, add to queue
      window._youtubePlayerQueue.push(initCallback);
      
      // Set up the global callback if not already set
      if (!window.onYouTubeIframeAPIReady) {
        window.onYouTubeIframeAPIReady = () => {
          console.log(`[YoutubePlayer] YouTube API ready, initializing ${window._youtubePlayerQueue.length} players`);
          // Call all queued callbacks
          const queue = window._youtubePlayerQueue.slice(); // Copy array
          window._youtubePlayerQueue = []; // Clear queue
          queue.forEach(callback => {
            try {
              callback();
            } catch (error) {
              console.error('[YoutubePlayer] Error in initialization callback:', error);
            }
          });
        };
      }
    }

    if (!('YT' in window)) {
      // Only load the script once
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }

  /**
   * Create a new player container element
   * @param {string} parentContainerId - ID of parent container
   * @returns {HTMLElement} New div element for the player
   */
  newPlayerContainer(parentContainerId) {
    const div = document.createElement('DIV');
    this.id = Math.floor(Math.random() * PLAYER_CONSTANTS.RANDOM_ID_MAX);
    div.id = this.id;
    const parentElement = document.getElementById(parentContainerId);
    if (parentElement) {
      parentElement.appendChild(div);
    }
    return div;
  }

  /**
   * Create a new YouTube player instance
   */
  newPlayer() {
    const playerContainer = this.container;
    this.player = new window.YT.Player(playerContainer, {
      height: YOUTUBE_CONSTANTS.PLAYER_HEIGHT,
      width: YOUTUBE_CONSTANTS.PLAYER_WIDTH,
      playerVars: {
        controls: 0,
        playsinline: 1,
        loop: 1,
      },
      events: {
        onReady: () => this.onPlayerReady(),
        onStateChange: (event) => this.onPlayerStateChange(event),
      },
    });
    this.element = this.container;
    this.initialized = true;
    
    // Start hidden (size 0,0) - will be shown when activated
    if (this.player && this.player.setSize) {
      this.player.setSize(0, 0);
    }
  }

  /**
   * Play the video
   */
  play() {
    if (this.player && this.player.playVideo) {
      this.player.playVideo();
    }
  }

  /**
   * Pause the video
   */
  pause() {
    if (this.player && this.player.pauseVideo) {
      this.player.pauseVideo();
    }
  }

  /**
   * Set the track to play
   * @param {string} id - YouTube video ID
   * @param {number} startingTime - Start time in seconds
   * @param {number} endingTime - End time in seconds (0 for full video)
   */
  setTrack(id, startingTime, endingTime) {
    // Validate inputs
    if (!id || id.trim() === '') {
      console.warn('[YoutubePlayer] setTrack called with empty video ID');
      return;
    }

    console.log(`[YoutubePlayer] setTrack called - video: ${id}, start: ${startingTime}s, end: ${endingTime}s, ready: ${this.ready}, has player: ${!!this.player}`);

    // Delay to ensure HTML5 player works correctly
    setTimeout(() => {
      if (!this.player) {
        console.warn('[YoutubePlayer] setTrack: player object not available after delay');
        return;
      }

      try {
        console.log(`[YoutubePlayer] Loading video ${id} into player`);
        if (endingTime > 0) {
          // endingTime > 0 will be added to endSeconds in loadVideoById
          this.player.loadVideoById({
            videoId: id,
            startSeconds: startingTime,
            endSeconds: endingTime,
          });
          console.log(`[YoutubePlayer] Called loadVideoById with endSeconds: ${endingTime}`);
        } else {
          // Otherwise will behave as normal
          this.player.loadVideoById({
            videoId: id,
            startSeconds: startingTime,
          });
          console.log(`[YoutubePlayer] Called loadVideoById without endSeconds`);
        }

        this.player.setVolume(this.controller.volume);
        console.log(`[YoutubePlayer] Set volume to ${this.controller.volume}`);
        this.play();
        console.log(`[YoutubePlayer] Called play()`);
      } catch (error) {
        console.error('[YoutubePlayer] Error in setTrack:', error);
      }
    }, PLAYER_CONSTANTS.YOUTUBE_LOAD_DELAY_MS);
  }

  /**
   * Set volume
   * @param {number} level - Volume level (0-100)
   */
  setVolume(level) {
    if (this.player && this.player.setVolume) {
      this.player.setVolume(level);
    }
  }

  /**
   * Get current volume
   * @returns {number|undefined} Current volume (0-100) or undefined
   */
  getVolume() {
    return this.player && this.player.getVolume ? this.player.getVolume() : undefined;
  }

  /**
   * Fade out the player gradually
   */
  async fadeout() {
    if (!this.player || !this.player.setSize) {
      // If player doesn't support setSize, just pause it
      if (this.player) {
        this.pause();
      }
      return;
    }

    // Hide current player
    this.player.setSize(0, 0);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    while (this.getVolume() > PLAYER_CONSTANTS.MIN_VOLUME_THRESHOLD) {
      this.setVolume(this.getVolume() * PLAYER_CONSTANTS.FADEOUT_MULTIPLIER);
      await sleep(PLAYER_CONSTANTS.FADEOUT_INTERVAL_MS);
    }

    this.pause();
    // Do not destroy - player will be reused
  }

  /**
   * Destroy the player and clean up resources
   */
  destroy() {
    if (this.player && this.player.destroy) {
      this.player.destroy();
    }
    if (this.element) {
      this.element.remove();
    }

    this.player = {};
    this.element = null;
  }
}

/**
 * Local audio file player implementation
 */
class LocalPlayer {
  constructor(track, startTime, parentContainer, parentController) {
    this.initialized = false;
    this.player = false;
    this.ready = false;
    this.controller = parentController;
    this.track = track;
    this.startTime = startTime;
    this.id = false;
    this.init(parentContainer);
  }

  /**
   * Set the controller reference
   * @param {Object} controller - PlayerController instance
   */
  setController(controller) {
    this.controller = controller;
  }

  /**
   * Initialize the local player
   * @param {string} parentContainer - Parent container ID (unused for local player)
   */
  init() {
    this.player = this.newPlayer();
    this.player.autoplay = true;
    this.player.loop = true;
    this.setVolume(this.controller.volume);
    this.player.play().catch((err) => {
      console.warn('Error playing local audio:', err);
    });
  }

  /**
   * Create a new Audio element
   * @returns {HTMLAudioElement} New Audio element
   */
  newPlayer() {
    const audio = new Audio(this.track.id);
    this.initialized = true;
    return audio;
  }

  /**
   * Play the audio
   */
  play() {
    if (this.player) {
      this.player.play().catch((err) => {
        console.warn('Error playing audio:', err);
      });
    }
  }

  /**
   * Pause the audio
   */
  pause() {
    if (this.player) {
      this.player.pause();
    }
  }

  /**
   * Set the track to play
   * @param {string} id - Audio file path/URL
   */
  setTrack(id) {
    if (this.player) {
      this.player.src = id;
      this.player.load();
    }
  }

  /**
   * Set volume
   * @param {number} level - Volume level (0-100)
   */
  setVolume(level) {
    if (this.player) {
      this.player.volume = level / 100;
    }
  }

  /**
   * Get current volume
   * @returns {number} Current volume (0-100)
   */
  getVolume() {
    return this.player ? this.player.volume * 100 : 0;
  }

  /**
   * Fade out the player gradually
   */
  async fadeout() {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    while (this.getVolume() > PLAYER_CONSTANTS.MIN_VOLUME_THRESHOLD) {
      this.setVolume(this.getVolume() * PLAYER_CONSTANTS.FADEOUT_MULTIPLIER);
      await sleep(PLAYER_CONSTANTS.FADEOUT_INTERVAL_MS);
    }

    this.destroy();
  }

  /**
   * Destroy the player and clean up resources
   */
  destroy() {
    if (this.player) {
      this.player.pause();
      this.player.remove();
    }
    this.player = {};
  }
}

// Export for module usage
export {
  PlayerController,
  YoutubePlayer,
  LocalPlayer,
};

// Expose classes globally for script tag loading (legacy support)
if (typeof window !== 'undefined') {
  window.PlayerController = PlayerController;
  window.YoutubePlayer = YoutubePlayer;
  window.LocalPlayer = LocalPlayer;
}
