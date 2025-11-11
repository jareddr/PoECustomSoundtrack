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

## Development Environment

### Prerequisites

- **Node.js**: Version 20.x LTS or higher (required)
- **npm**: Comes with Node.js
- **Git**: For cloning the repository

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/jareddr/PoECustomSoundtrack.git
   cd PoECustomSoundtrack
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the app in development mode:
   ```bash
   npm start
   ```

   This will launch the app with DevTools open and hot-reload enabled.

## Building and Deployment

### Building Locally

To build the application for your current platform without publishing:

```bash
npm run dist
```

This will create the distributable files in the `dist/` directory.

### Building for Release (GitHub)

The app uses `electron-builder` to create installers and publish to GitHub Releases. The auto-update system checks GitHub Releases for updates.

#### Prerequisites for Release

1. **GitHub Token**: You need a GitHub personal access token with the `repo` scope
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate a new token with `repo` scope
   - Save this token securely

2. **Platform-Specific Builds**:
   - **Windows builds** must be done on a Windows machine
   - **Linux builds** (AppImage, snap) must be done on a Linux machine
   - **macOS builds** must be done on a macOS machine

#### Release Process

1. **Update Version**:
   - Edit `package.json` and increment the version number (e.g., `1.6.1` → `1.6.2`)

2. **Create Draft Release on GitHub**:
   - Go to your GitHub repository
   - Navigate to Releases → Draft a new release
   - Create a tag: `vX.Y.Z` (e.g., `v1.6.2`) matching the version in `package.json`
   - Add release notes
   - **Save as draft** (do not publish yet)

3. **Set GitHub Token**:
   - **Windows (PowerShell)**:
     ```powershell
     $env:GH_TOKEN="your_github_token_here"
     ```
   - **Windows (Command Prompt)**:
     ```cmd
     set GH_TOKEN=your_github_token_here
     ```
   - **Linux/macOS**:
     ```bash
     export GH_TOKEN="your_github_token_here"
     ```

4. **Commit and Push Changes**:
   ```bash
   git add .
   git commit -m "Release v1.6.2"
   git push origin main
   ```

5. **Build and Publish**:
   ```bash
   npm run release
   ```
   
   This command will:
   - Build the application for the current platform
   - Upload the built artifacts to the draft GitHub release
   - Create the necessary update metadata files

6. **Publish the Release**:
   - Go back to GitHub and refresh the draft release page
   - Verify that all artifacts are attached (installer, zip, blockmap, etc.)
   - If everything looks good, click "Publish release"
   - The auto-update system will now detect this release for users

### Auto-Update System

The app uses `electron-updater` to automatically check for and download updates from GitHub Releases. The system:

- Checks for updates when the app starts
- Prompts users when an update is available
- Downloads updates in the background
- Installs updates on user confirmation

The auto-update system requires:
- GitHub Releases to be properly configured (handled by `electron-builder`)
- The app to be built with `electron-builder` (not just `npm run dist`)
- GitHub token to be set when running `npm run release`

## Troubleshooting

### Development Issues

**App won't start:**
- Ensure you're using Node.js 20.x LTS or higher
- Delete `node_modules` and run `npm install` again
- Check that all dependencies installed correctly

**Port already in use:**
- The app tries ports 3000-3010 automatically
- Close other applications using these ports
- Or modify the port range in `main.js` if needed

### Build Issues

**Build fails with "GH_TOKEN not set":**
- Make sure you've set the `GH_TOKEN` environment variable
- Verify the token has the `repo` scope
- On Windows, ensure you're using the correct syntax for your shell (PowerShell vs CMD)

**Build artifacts not appearing on GitHub:**
- Verify the draft release exists with the correct tag
- Check that the GitHub token has proper permissions
- Ensure you're running `npm run release` (not `npm run dist`)
- Check the build output for error messages

**Auto-update not working:**
- Verify the release is published (not just a draft)
- Check that `latest.yml` and installer files are in the GitHub release
- Ensure the app was built with `electron-builder` (not manually)
- Check the app logs (stored in user data directory) for update errors

### Runtime Issues

**App crashes on startup:**
- Check the console output for error messages
- Verify all required files are present (soundtrack files, etc.)
- Check that the PoE log file path is correct

**Updates not detected:**
- Verify the GitHub release is published and public
- Check that the version in `package.json` is lower than the release version
- Ensure you have an internet connection
- Check auto-updater logs in the app's user data directory
