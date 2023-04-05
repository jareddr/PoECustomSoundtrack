# Path of Exile Custom Soundtrack

![](pietyd2.png)

Updated for Crucible 3.21

Usage and customization guide here: https://www.youtube.com/watch?v=DyfBy1K1Y1s

**You pick the soundtrack for every area in game!**

This app watches the Path of Exile log file to detect area changes and then plays a predefined track from youtube.

The default soundtrack shipping with the app is my attempt at zone by zone swap of PoE's music Diablo II's.

I did **not** build this because I think the Path of Exile soundtrack is bad, in fact I enjoy it quite a lot. I built it because the Diablo II soundtrack drips so heavily with nostalgia that it makes me feel like I'm back in highschool. Combining this with the game play of Path of Exile made me excited enough to start coding.

## To Use

Load up the program, use the crappy interface to choose the folder where you installed Path of Exile. Don't worry, it doesn't write any files, it just reads the `Path of Exile/Logs/Client.txt` file to detect when your in game area changes.

Turn your in game music volume down to 0

Switch areas in game, you should be hearing Diablo II music!

## Download

[Grab the latest release](https://github.com/jareddr/PoECustomSoundtrack/releases/latest)

## Will I get banned for using this?

This program merely monitors the path of exile client log file on your computer. It does not modify or interact with the executable or running program in anyway. There are many, many other PoE addon tools in regular use that also monitor the log file. Given these facts, I highly doubt you will get banned for using this program.

# Development

If anyone wants to contribute by adding features, making improvements or fixing bugs, I'd be delighted. Just make a pull request and I'll check out what you've done. The code is a sloppy mess so don't worry about coding style.

## Contributing

As you can tell from the video guide where I was playing an RF totem chieftan, this is pretty old. I have not kept up with new versions of any of the libraries. To run this on your local machine I believe you need to use node version 10.24.1.

## Dev Environment.

Use Node Version Manager (nvm) or N to drop down to node version `10.24.1`.

`npm install` will download all the requirements
`npm run` should launch the app.

## Deploying (note to self)

- Update package.json and increment the version.
- Create a draft release on your github repo with the tag vX.Y.Z where X.Y.Z is version from package.json, save the draft.
- Set an environment variable for your github token with access to make releases on the repo, GH_TOKEN=
- Commit and push your changes
- run `npm run release` to invoke electron-builder
- This must be done on a windows machine to build the windows installer/zip or a linux machine to build the appImage and snap files.
- Refresh the draft release on github.com and you should see the artifacts attached. If everything looks good publish the new release.
