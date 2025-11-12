/**
 * Application-wide constants
 * Centralizes magic numbers and configuration values
 */

const constants = {
  // Server configuration
  SERVER: {
    DEFAULT_PORT: 3000,
    MAX_PORT: 3010,
    HOST: '127.0.0.1',
  },

  // Player configuration
  PLAYER: {
    DEFAULT_VOLUME: 25,
    FADEOUT_MULTIPLIER: 0.8,
    FADEOUT_INTERVAL_MS: 300,
    MIN_VOLUME_THRESHOLD: 1,
    YOUTUBE_LOAD_DELAY_MS: 10,
    RANDOM_ID_MAX: 10000,
  },

  // File paths
  PATHS: {
    DEFAULT_POE_PATH: 'C:\\Program Files\\Grinding Gear Games\\Path of Exile\\',
    LOG_FILE_NAME: 'Client.txt',
    LOG_SUBDIRECTORY: 'logs',
  },

  // Update configuration
  UPDATE: {
    CHECK_INTERVAL_MS: 1000,
  },

  // YouTube API
  YOUTUBE: {
    PLAYER_HEIGHT: '200',
    PLAYER_WIDTH: '100%',
  },
};

// CommonJS export
module.exports = constants;

