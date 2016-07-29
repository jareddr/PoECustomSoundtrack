PlayerController  = function() {
    this.players = {}

    this.state = false

    this.active_player = false

    this.volume = 75

    var instance = this

    this.play = function() {
        console.log("Called: play")
        App.state.listening.set(true)
      	instance.playCurrentTrack()
    }

    this.pause = function() {
        //Session.set('player_state_playing', false)
        if(instance.active_player){
        	instance.active_player.pause()
	    }
    }

    this.setTrack = function(track, starting_position) {
        //App.state.listening.set(true)
        console.log("Called: setTrack track: " + track.id + " starting_position: " + starting_position)
        console.log(track)
        //instance.hidePlayers()
        //instance.active_player = instance.players[track.type]
        //instance.active_player.setTrack(track.id, starting_position)
        if(instance.active_player){
        	instance.active_player.destroy()
        	delete instance.active_player
        }
        instance.active_player = new window[instance.players[track.type]](track, starting_position, track.type + "-parent-container", instance)
    }

    this.trackEnded = function() {
        //if the track hasn't already switched then tell the server to switch it
        console.log('trackEnded')
        this.active_player.play()
        
    }

    this.playNextTrack = function(auto) {
        console.log("Called: playNextTrack auto: " + auto)
        auto = auto || false;
        direction = 1
        ////Meteor.call('userNextTrack', Session.get('current_room'), direction, auto)
    }
    this.playPreviousTrack = function() {
        direction = -1
        ////Meteor.call('userNextTrack', Session.get('current_room'), direction)
    }
    this.playTrack = function(track, startingPosition) {
        console.log("Called: playCurrentTrack")
        instance.setTrack(track, startingPosition)
    }
    this.getTrack = function() {
        if (!instance.active_player) {
            return false
        }
        return instance.active_player.getTrack()
    }
    this.init = function() {

    }
    this.mute = function() {
        //Session.set('player_state_muted', true)
        _.each(instance.players, function(player, type) {
            if (player.player)
                player.mute()
        })
    }
    this.unMute = function() {
        //Session.set('player_state_muted', false)
        _.each(instance.players, function(player, type) {
            if (player.player)
                player.unMute()
        })
    }
    this.setVolume = function(level) {
        instance.volume = level
        if(instance.active_player){
        	instance.active_player.setVolume(level)
        }
    }

    this.getVolume = function() {
        if (!instance.active_player) {
            return false
        }
        return instance.active_player.getVolume()
    }
    this.getState = function() {
        if (!instance.active_player) {
            return false
        }
        return instance.active_player.getState()
    }
    this.seek = function(percent) {
        if (!instance.active_player) {
            return false
        }
        instance.active_player.seek(percent)
    }
    this.getPosition = function() {
        if (!instance.active_player) {
            return false
        }
        return instance.active_player.getPosition()
    }
    this.setPosition = function(time) {
        instance.seek(time)
    }
    this.setProgress = function(percent) {
        //$('#track-progress .progress-bar').css('width', percent + '%')
    }
    this.hidePlayers = function() {
        _.each(instance.players, function(player, type) {
            player.hide()
        })
    }
    this.register = function(playerConstructor, type) {
        instance.players[type] = playerConstructor
        //playerObject.setController(instance)
    }

    this.replaceTrack = function(track){
        console.log("replacing track", track)
        //Meteor.call("replaceTrack", track)
    }

}

YoutubePlayer = function(track, startTime, parentContainer, parentController) {

    this.initialized = false
    this.player = false
    this.element = false
    this.container = false
    this.ready = false
	this.controller = parentController
    this.track = track
    this.startTime = startTime
    this.pollTimer = false
    this.id = false
    this.trackError = false

    var instance = this

    this.setController = function(controller){
        instance.controller = controller
    }

    this.onPlayerReady = function(event) {
        instance.ready = true;
        console.log("YOUTUBE PLAYER READY" + instance.id)
        if(instance.track){
        	instance.setTrack(instance.track.id, instance.startTime)
        }
        instance.hide()
    }
    this.onPlayerStateChange = function(event) {
        //instance.setVolume(instance.controller.volume)
        //Meteor.clearInterval(instance.pollTimer)
        if (event.data === 0) {
           instance.controller.trackEnded()
        }
        else{
            //instance.pollTimer = Meteor.setInterval(instance.poll, 550)
        }
    }
    this.poll = function() {
        if (instance.getState() == 1) {
            instance.updateProgress()
        }
    }
    this.updateProgress = function() {
       instance.controller.setProgress(100 * instance.getPosition() / instance.getDuration())
    }
    this.onVolumeChange = function(event) {
        //console.log(event)
    }
    this.onError = function(event){
        console.log(event)
        if(!instance.trackError){
            instance.controller.replaceTrack(instance.track)
            instance.trackError = true
        }
    }
    this.init = function(container, callback) {
    	instance.container = instance.newPlayerContainer(container)
    	instance.element = instance.container
        
        if ('YT' in window) {
            window.YT.ready(instance.newPlayer)
        } else {
            window.onYouTubeIframeAPIReady = instance.newPlayer
        }

        console.log('init = youtube')
        if(!('YT' in window)){
        	console.log("adding youtube script")
	        var tag = document.createElement('script')
	        tag.src = "https://www.youtube.com/iframe_api"
	        var firstScriptTag = document.getElementsByTagName('script')[0]
	        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
        }

    }

    this.newPlayerContainer = function(parentContainer){
    	var div = document.createElement("DIV")
    	instance.id = Math.floor(Math.random(1000000))
    	div.id = instance.id
    	document.getElementById(parentContainer).appendChild(div)

    	return div
    }

    this.newPlayer = function() {
        instance.player = new YT.Player(instance.container, {
            height: '200',
            width: '100%',
            playerVars: {
                'controls': 1,
                'playsinline': 1,
                'loop': 1
            },
            events: {
                'onReady': instance.onPlayerReady,
                'onStateChange': instance.onPlayerStateChange,
                'onVolumeChange': instance.onVolumeChange,
                'onError': instance.onError
            }
        })
        instance.element = instance.container
        instance.initialized = true
    }
    this.play = function() {
        instance.player.playVideo()
    }
    this.pause = function() {
        instance.player.pauseVideo()
    }
    this.setTrack = function(id, starting_time) {
        console.log({
            videoId: id,
            startSeconds: starting_time
        })
        instance.show()
        //hack to make html5 player work
        setTimeout(function() {
            instance.player.loadVideoById({
                videoId: id,
                startSeconds: starting_time
            })
            instance.player.setVolume(instance.controller.volume)
            instance.play()
        }, 10)

    }
    this.getTrack = function() {
        return instance.player.getVideoData().video_id
    }
    this.mute = function() {
        return instance.player.mute()
    }
    this.unMute = function() {
        return instance.player.unMute()
    }
    this.setVolume = function(level) {
        instance.player.setVolume(level)
    }
    this.getVolume = function() {
        return instance.player.getVolume()
    }
    this.getState = function() {
        return instance.player.getPlayerState()
    }
    this.getDuration = function() {
        return instance.player.getDuration()
    }
    this.seek = function(percent) {
        if(instance.player.seekTo){
            instance.player.seekTo(instance.player.getDuration() * percent)
        }
    }
    this.getPosition = function() {
        return instance.player.getCurrentTime()
    }
    this.setPosition = function(time) {
        instance.seek(time)
    }
    this.hide = function() {
        //	instance.element.style.display = 'none'
    }
    this.show = function() {
        //instance.element.style.display = 'block'
    }
    this.destroy = function(){
        //Meteor.clearTimeout(instance.pollTimer)
    	if(instance.player)
    		instance.player.destroy()
    	if(instance.element)
        	instance.element.remove()
        
        instance.player = {}
        instance.element = null
    }

	
	this.init(parentContainer)

}

module.exports = {
    PlayerController: PlayerController,
    YoutubePlayer: YoutubePlayer
}