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
        if(instance.active_player){
        	instance.active_player.pause()
	    }
    }

    this.setTrack = function(track, starting_position) {
        if(instance.active_player){
        	instance.active_player.destroy()
        	delete instance.active_player
        }
        instance.active_player = new window[instance.players[track.type]](track, starting_position, track.type + "-parent-container", instance)
    }

    this.trackEnded = function() {
        console.log('trackEnded')
        this.active_player.play()
    }

    this.playTrack = function(track, startingPosition) {
        console.log("Called: playCurrentTrack", track)
        instance.setTrack(track, startingPosition)
    }
    this.register = function(playerConstructor, type) {
        instance.players[type] = playerConstructor
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
        if(instance.track){
        	instance.setTrack(instance.track.id, instance.startTime)
        }
    }
    this.onPlayerStateChange = function(event) {
        if (event.data === 0) {
           instance.controller.trackEnded()
        }
    }

    this.poll = function() {
        if (instance.getState() == 1) {
            instance.updateProgress()
        }
    }

    this.onError = function(event){
        console.log(event)
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
    this.destroy = function(){
    	if(instance.player)
    		instance.player.destroy()
    	if(instance.element)
        	instance.element.remove()
        
        instance.player = {}
        instance.element = null
    }

	
	this.init(parentContainer)

}

LocalPlayer = function(track, startTime, parentContainer, parentController) {

    this.initialized = false
    this.playerHeading= false
    this.player = false
    this.ready = false
    this.controller = parentController
    this.track = track
    this.startTime = startTime
    this.id = false

    var instance = this

    this.setController = function(controller){
        instance.controller = controller
    }

    this.onError = function(event){
        console.log(event)
    }

    this.init = function(container, callback) {
       instance.playerHeading= document.createElement("p")

       instance.playerHeading.innerText= "Playing: " + track.id.match(/.*\/([^\/]+)/)[1]
       instance.player = instance.newPlayer()
       instance.player.autoplay = true
       instance.player.loop = true
       instance.player.controls = true

       document.getElementById(container).appendChild(instance.playerHeading)
       document.getElementById(container).appendChild(instance.player)
       instance.player.play()

    }

    this.newPlayer = function() {
        audio = new Audio(this.track.id)
        console.log(audio)
        instance.initialized = true
        return audio
    }
    this.play = function() {
        instance.player.play()
    }
    this.pause = function() {
        instance.player.pause()
    }
    this.setTrack = function(id, starting_time) {
        this.player.load(id)        
    }

    this.destroy = function(){
        if(instance.player){
            instance.player.pause()
            instance.player.remove()
        }
        instance.player = {}
    }

    
    this.init(parentContainer)

}

module.exports = {
    PlayerController: PlayerController,
    YoutubePlayer: YoutubePlayer,
    LocalPlayer: LocalPlayer
}