class PlayerController {
  constructor() {
    this.players = {};
    this.state = false;
    this.active_player = false;
    this.volume = 25;
  }

  pause() {
    if (this.active_player.player) {
      this.active_player.pause();
    }
  }

  fadeout() {
    if (this.active_player.player) {
      this.active_player.fadeout();
    }
  }

  setTrack(track, startingPosition) {
    if (this.active_player.player) {
      this.active_player.fadeout();
      delete this.active_player;
    }
    this.active_player = new this.players[track.type](track, startingPosition, `${track.type}-parent-container`, this);
  }

  trackEnded() {
    this.active_player.play();
  }

  playTrack(track, startingPosition) {
    this.setTrack(track, startingPosition);
  }

  register(playerConstructor, type) {
    this.players[type] = playerConstructor;
  }

  getVolume() {
    return this.active_player ? this.active_player.getVolume() : 0;
  }

  setVolume(volume) {
    this.volume = volume;
    if (this.active_player.player) this.active_player.setVolume(volume);
  }

}

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
    this.pollTimer = false;
    this.id = false;
    this.trackError = false;
    this.init(parentContainer);
  }

  setController(controller) {
    this.controller = controller;
  }

  onPlayerReady() {
    this.ready = true;
    if (this.track) {
      this.setTrack(this.track.id, this.startTime);
    }
  }

  onPlayerStateChange(event) {
    if (event.data === 0) {
      this.controller.trackEnded();
    }
  }

  poll() {
    if (this.getState() === 1) {
      this.updateProgress();
    }
  }

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

  newPlayerContainer(pc) {
    const div = document.createElement('DIV');
    this.id = Math.floor(Math.random() * 10000);
    div.id = this.id;
    document.getElementById(pc).appendChild(div);

    return div;
  }

  newPlayer() {
    const playerContainer = this.container;
    this.player = new window.YT.Player(playerContainer, {
      height: '200',
      width: '100%',
      playerVars: {
        controls: 0,
        playsinline: 1,
        loop: 1,
      },
      events: {
        onReady: () => this.onPlayerReady(),
        onStateChange: event => this.onPlayerStateChange(event),
      },
    });
    this.element = this.container;
    this.initialized = true;
  }
  play() {
    this.player.playVideo();
  }
  pause() {
    this.player.pauseVideo();
  }
  setTrack(id, startingTime) {
    // hack to make html5 player work
    setTimeout(() => {
      this.player.loadVideoById({
        videoId: id,
        startSeconds: startingTime,
      });
      this.player.setVolume(this.controller.volume);
      this.play();
    }, 10);
  }
  setVolume(level) {
    this.player.setVolume(level);
  }
  getVolume() {
    return this.player.getVolume ? this.player.getVolume() : undefined;
  }

  async fadeout() {
    // hide current player
    if(this.player.setSize){
      this.player.setSize(0, 0);
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      while (this.getVolume() > 1) {
        this.setVolume(this.getVolume() * 0.8);
        /* eslint-disable */
        await sleep(300);
        /* eslint-enable */
      }
    }
    this.destroy();
  }

  destroy() {
    if (this.player.destroy) {
      this.player.destroy();
    }
    if (this.element) {
      this.element.remove();
    }

    this.player = {};
    this.element = null;
  }
}

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

  setController(controller) {
    this.controller = controller;
  }

  init() {
    this.player = this.newPlayer();
    this.player.autoplay = true;
    this.player.loop = true;
    this.setVolume(this.controller.volume);
    this.player.play();
  }

  newPlayer() {
    const audio = new Audio(this.track.id);
    this.initialized = true;
    return audio;
  }
  play() {
    this.player.play();
  }
  pause() {
    this.player.pause();
  }
  setTrack(id) {
    this.player.load(id);
  }
  setVolume(level) {
    this.player.volume = level / 100;
  }
  getVolume() {
    return this.player.volume * 100;
  }
  async fadeout() {
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    while (this.getVolume() > 1) {
      this.setVolume(this.getVolume() * 0.8);
      /* eslint-disable */
      await sleep(300);
      /* eslint-enable */
    }
    this.destroy();
  }
  destroy() {
    if (this.player) {
      this.player.pause();
      this.player.remove();
    }
    this.player = {};
  }
}

module.exports = {
  PlayerController,
  YoutubePlayer,
  LocalPlayer,
};
