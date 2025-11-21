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
  PLAYER_HEIGHT: '200',
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
    let existingPlayer;
    if (this.activePlayer && this.activePlayer.player) {
      existingPlayer = this.activePlayer;
    }
    this.activePlayer = new this.players[track.type](track, startingPosition, `${track.type}-parent-container`, this);
    if (existingPlayer) {
      existingPlayer.fadeout();
      existingPlayer = null;
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
    if (this.track) {
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

    if ('YT' in window) {
      window.YT.ready(() => this.newPlayer());
    } else {
      window.onYouTubeIframeAPIReady = () => this.newPlayer();
    }

    if (!('YT' in window)) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
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
    // Delay to ensure HTML5 player works correctly
    setTimeout(() => {
      if (!this.player) {
        return;
      }

      if (endingTime > 0) {
        // endingTime > 0 will be added to endSeconds in loadVideoById
        this.player.loadVideoById({
          videoId: id,
          startSeconds: startingTime,
          endSeconds: endingTime,
        });
      } else {
        // Otherwise will behave as normal
        this.player.loadVideoById({
          videoId: id,
          startSeconds: startingTime,
        });
      }

      this.player.setVolume(this.controller.volume);
      this.play();
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
      this.destroy();
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
    this.destroy();
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
