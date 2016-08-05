# Path of Exile Custom Soundtrack
[Downloads here](https://github.com/jareddr/PoECustomSoundtrack/releases)

[Demo Video](https://www.youtube.com/watch?v=DyfBy1K1Y1s)

![](pietyd2.png)

**You pick the soundtrack for every area in game!**

This app watches the Path of Exile log file to detect area changes and then plays a predefined track from youtube.

The default soundtrack shipping with the app is my attempt at zone by zone swap of PoE's music Diablo II's.

I did **not** build this because I think the Path of Exile soundtrack is bad, in fact I enjoy it quite a lot.  I built it because the Diablo II soundtrack drips so heavily with nostalgia that it makes me feel like I'm back in highschool.  Combining this with the game play of Path of Exile made me excited enough to start coding.

## To Use

Load up the program, use the crappy interface to choose the folder where you installed Path of Exile.  Don't worry, it doesn't write any files, it just reads the `Path of Exile/Logs/Client.txt` file to detect when your in game area changes.

Turn your in game music volume down to 0

Switch areas in game, you should be hearing Diablo II music!

## Will I get banned for using this?

I won't say yes or no, but given that this program's only interaction with Path of Exile is reading a text file from the log folder, I'd say the chances aren't very high.

## Customizing your soundtrack

For those of you who want to get your hands dirty, you can also create your own `.soundtrack` files.  These files consist of a track list and a mapping of those tracks to all the areas in Path of Exile.

Here is a snippet from the `diablo2.soundtrack` that comes with this app

```
{
	"tracks": [
		{
			"name": "options",
			"location": "https://www.youtube.com/watch?v=AoTDngh-d2E"
		},
		{
			"name": "rogue_encampment",
			"location": "https://www.youtube.com/watch?v=t1Zf9w--VhM"
		},
		{
			"name": "wild",
			"location": "https://www.youtube.com/watch?v=LEKoC5s6150"
		},
		{
			"name": "tristram",
			"location": "https://www.youtube.com/watch?v=8nl4KeCiEtQ"
		},
	],
	map: {
		"Lioneye's Watch": "rogue_encampment",
		"The Twilight Strand": "options",
		"The Coast": "wild",
		"The Tidal Island": "wild",
		"The Mud Flats": "wild",
		"The Fetid Pool": "caves",
		"The Flooded Depths": "caves",
		"The Submerged Passage": "caves",
		"The Ledge": "wild",
		"The Climb": "wild",
	}
}
```
The file consists of a list of tracks and a mapping of tracks onto Path of Exile world areas.

Each `track` must have a `name` and a `location`.
The `name` of the track is used in the `map` section.  `"The Climb: "wild"` means that when you enter The Climb, the song with the name `wild` will play.  `wild` in the `tracks` list has a location of `https://www.youtube.com/watch?v=LEKoC5s6150`

The `location` of a track can either be a youtube url (for now the full youtube.com url and not a shortened youtu.be url) OR a an audio file on your local machine.  To reference an mp3 on your computer you would define a track like this:

```
{
  "name": "my_local_track_name",
  "location": "C:\some\folder\some_file.mp3"
}
```

`random` is a special reserved track name that will allow you to play an area to play any random track from your song list.

`"The Ledge": "random",` would randomly pick a diablo 2 track every time you enter the ledge

I'd recommend using the diablo2.soundtrack file as a base and editing from there.  It should contain a reference to every zone in the game and either have it mapped to a specific track or set to random.

If you break your diablo2.soundtrack file some how, simply delete it and re-run the app, a fresh one will be generated.


## Modifying the Code

This app was built with the [Electron](http://electron.atom.io/) framework.  If you download a [release](https://github.com/jareddr/PoECustomSoundtrack/releases) the code for Path of Exile Custom Soundtrack can be found in the `resources\app` folder.

If you want to run the program from the source you'll need to obtain a copy of [Electron](http://electron.atom.io/)
