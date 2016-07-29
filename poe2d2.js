const {ipcMain} = require('electron');
const _ = require('lodash');
const fs = require('fs');
const fileTail = require('file-tail');

const DEFAULT_POE_PATH = "C:\\Program Files\\Grinding Gear Games\\Path of Exile\\"
//load settings from disk
const ElectronSettings = require('electron-settings');
let settings = new ElectronSettings({configDirPath: "./", configFilename: "settings"});

let mainWindow;
let currentTrackName = false;
let ft;

let areaMap = {
  "1_1": "options",
  "1_town": "rogue_encampment",
  "1_2": "wild",
  "1_2a": "wild",
  "1_3": "wild",
  "1_3a": "caves",
  "1_4_1": "caves",
  "1_4_0": "caves",
  "1_5": "wild",
  "1_6": "wild",
  "1_7_1": "monastery",
  "1_7_2": "monastery",
  "1_8": "wild",
  "1_9": "tristram",
  "1_9a": "tristram",
  "1_11_1": "crypt", //caverns of anger
  "1_11_2": "crypt", //caverns of wrath

  "2_1": "jungle", //Southern Forest
  "2_town": "kurast_docks", //Forest Encampment
  "2_2": "jungle", // Old Fields
  "2_2a": "spider", //Den
  "2_3": "jungle", //Crossroads
  "2_4": "kurast", //Broken Bridge
  "2_15": "kurast", //fellshrine ruins
  "2_5_1": "kurast_sewers", //The Crypt level 1
  "2_5_2": "kurast_sewers", //The Crypt level 2
  "2_6_1": "kurast_sewers", //Chanber of Sins Level 1
  "2_6_3": "kurast_sewers", //Chanber of Sins Level 2
  "2_7": "jungle", //Riverways
  "2_9": "jungle", //Western Forest
  "2_10": "spider", //Weaver's Chamber
  "2_12": "jungle",  //Wetlands
  "2_11_1": "kurast_sewers", //vaal ruins
  "2_8": "jungle", //northern forest
  "2_14_2": "kurast_sewers", //caverns
  "2_14_3": "kurast_sewers", //ancient pyramid

  "3_1": "desert", //city of sarn
  "3_town": "lut_gholein", //sarn encampment
  "3_2": "desert", //slums
  "3_3_1": "tombs", //crematorium
  "3_10_0": "sewer", //slums sewers
  "3_10_1": "sewer", //warehouse sewers
  "3_4": "desert", //warehouse district
  "3_5": "desert", //marketplace
  "3_6_1": "tombs", //catacombs
  "3_7": "valley", //battlefront
  "3_8_1": "harem", //Solaris temple level 1
  "3_8_2": "harem", //Solaris temple level 2
  "3_9": "valley", //Docks
  "3_13": "valley", //Ebony Barracks
  "3_14_1": "harem", //Lunaris Temple Level 1
  "3_14_2": "harem", //Lunaris Temple level 2
  "3_15": "valley", //Imperial gardens
  "3_16": "valley", //Hedge Maze
  "3_17_1": "sanctuary", //Library
  "3_17_2": "sanctuary", //Archives
  "3_18_1": "tombs", //Sceptre of God
  "3_18_2": "tombs",  //Upper Sceptre of God

  "4_1": "mesa",
  "4_town": "pandemonium_fortress",
  "4_2": "mesa",
  "4_3_1": "lair",
  "4_3_2": "lair",
  "4_3_3": "lair",
  "4_4_1": "mesa",
  "4_4_2": "mesa",
  "4_4_3": "mesa",
  "4_5_1": "mesa",
  "4_5_2": "mesa",
  "4_6_1": "diablo",
  "4_6_2": "diablo",
  "4_6_3": "diablo",

  "hideout1": "rogue_encampment",
  "hideout6": "lut_gholein",
  "hideout7": "kurast_docks",
  "hideout8": "rogue_encampment",
  "hideout10": "pandemonium_fortress",
  "hideout14": "rogue_encampment",
  "hideout15": "rogue_encampment",

  "mission": "crypt",
  "sidearea": "diablo",
  "labyrinth": "harem"

}

//Entering area 1_Mission1_1
//Mission1_1  not mapped to a track
//2016/07/23 22:43:24 50917281 8a3 [DEBUG Client 10496] Entering area 2_SideArea3_8
//SideArea3_8  not mapped to a track

//Hideout8_3 - Elreon (Enlightened Hideout)
//Hideout10_2 - Zana (Immaculate Hideout)
//Hideout15_2 - Vorici (Backstreet Hideout)
//Hideout7_2 - Tora (Lush Hideout)
//Hideout14_2 - Catarina (Unearthed Hideout)
//Hideout6_2 - Haku (Coastal Hideout)
//Hideout1_2 - Vagan (Battle scarred Hideout)

// 2016/07/28 08:43:03 128171593 8a3 [DEBUG Client 10028] Entering area 2_Arena1
// 2016/07/28 08:43:51 128220343 8a3 [DEBUG Client 10028] Entering area 2_Relic5
// 2016/07/28 08:45:47 128336359 8a3 [DEBUG Client 10028] Entering area 3_Daily2_3
// 2016/07/28 08:47:08 128417203 8a3 [DEBUG Client 10028] Entering area 3_Daily2_3
// 2016/07/28 08:47:13 128422015 8a3 [DEBUG Client 10028] Entering area Hideout6_2
// 2016/06/07 20:44:10 8593984 88d [DEBUG Client 8820] Entering area 1_Labyrinth_Airlock
// 2016/06/07 20:44:22 8606234 88d [DEBUG Client 8820] Entering area 1_Labyrinth_OH_straight
// 2016/06/07 20:45:09 8653671 88d [DEBUG Client 8820] Entering area 1_Labyrinth_OH_branch_door
// 2016/06/07 20:45:45 8688796 88d [DEBUG Client 8820] Entering area 1_Labyrinth_DG_end_bottleneck_#
// 2016/06/07 20:50:10 8954312 88d [DEBUG Client 8820] Entering area 1_Labyrinth_OH_branch_door
// 2016/06/07 20:50:33 8976906 88d [DEBUG Client 8820] Entering area 1_Labyrinth_C_straight
// 2016/06/07 20:51:19 9023734 88d [DEBUG Client 8820] Entering area 1_Labyrinth_boss_1
// 2016/06/07 20:52:43 9107546 88d [DEBUG Client 8820] Entering area 1_Labyrinth_DG_branch_bottleneck_1_#
// 2016/06/07 20:53:27 9151250 88d [DEBUG Client 8820] Entering area 1_Labyrinth_RT_branch_bottleneck_1
// 2016/06/07 21:00:16 9559859 88d [DEBUG Client 8820] Entering area 1_Labyrinth_boss_1
// 2016/06/07 21:01:06 9610218 88d [DEBUG Client 8820] Entering area 1_Labyrinth_OH_branch_bottleneck_1
// 2016/06/07 21:02:41 9705421 88d [DEBUG Client 8820] Entering area 1_Labyrinth_C_straight_bottleneck
// 2016/06/07 21:03:26 9750546 88d [DEBUG Client 8820] Entering area 1_Labyrinth_RT_straight_bottleneck
// 2016/06/07 21:04:45 9829484 88d [DEBUG Client 8820] Entering area 1_Labyrinth_boss_2_end


let soundtrack = [
    {"name": "options", "url": "https://www.youtube.com/watch?v=AoTDngh-d2E", "length": "2:48"},
    {"name": "rogue_encampment", "url": "https://www.youtube.com/watch?v=t1Zf9w--VhM", "length": "4:08"},
    //{"name": "rogue_encampment", "url": "C:/some/folder/somefile.mp3", "length": "4:08"},
    {"name": "wild", "url": "https://www.youtube.com/watch?v=LEKoC5s6150", "length": "8:00"},
    {"name": "tristram", "url": "https://www.youtube.com/watch?v=8nl4KeCiEtQ", "length": "7:41"},
    {"name": "monastery", "url": "https://www.youtube.com/watch?v=HvMeIJOqrhg", "length": "5:08"},
    {"name": "caves", "url": "https://www.youtube.com/watch?v=0Zd0zDnTCoM", "length": "3:53"},
    {"name": "crypt", "url": "https://www.youtube.com/watch?v=U2eHs-C1828", "length": "4:31"},

    {"name": "lut_gholein", "url": "https://www.youtube.com/watch?v=OmdXk3jJsB0", "length": "3:03"},
    {"name": "desert", "url": "https://www.youtube.com/watch?v=mseOvWsn55w", "length": "6:35"},
    {"name": "valley", "url": "https://www.youtube.com/watch?v=PYe_Dd48Mcs", "length": "2:47"},
    {"name": "sewer", "url": "https://www.youtube.com/watch?v=LH_F9SshwIw", "length": "4:00"},
    {"name": "tombs", "url": "https://www.youtube.com/watch?v=YnSKVIH4_3k", "length": "5:35"},
    {"name": "lair", "url": "https://www.youtube.com/watch?v=MbyhMeB10t8", "length": "3:16"},
    {"name": "harem", "url": "https://www.youtube.com/watch?v=ub_Igr_L-rw", "length": "2:29"},
    {"name": "sanctuary", "url": "https://www.youtube.com/watch?v=CoTRxDhyzms", "length": "1:58"},

    {"name": "kurast_docks", "url": "https://www.youtube.com/watch?v=OehozBDOF_Q", "length": "2:10"},
    {"name": "jungle", "url": "https://www.youtube.com/watch?v=3ZXLsl2qazQ", "length": "7:42"},
    {"name": "kurast", "url": "https://www.youtube.com/watch?v=bwPNeWUSjKQ", "length": "4:58"},
    {"name": "spider", "url": "https://www.youtube.com/watch?v=Ocp7GyhyeTo", "length": "4:10"},
    {"name": "kurast_sewers", "url": "https://www.youtube.com/watch?v=AvfZRdGZstA", "length": "4:34"},

    {"name": "pandemonium_fortress", "url": "https://www.youtube.com/watch?v=v2XzZZI0f48", "length": "3:56"},
    {"name": "mesa", "url": "https://www.youtube.com/watch?v=qlIBDL_W8xo", "length": "5:26"},
    {"name": "diablo", "url": "https://www.youtube.com/watch?v=n041TsHeJi8", "length": "2:35"},

    {"name": "intro", "url": "https://www.youtube.com/watch?v=LngkyTYbLrk", "length": "1:40"},
    {"name": "harrogath", "url": "https://www.youtube.com/watch?v=layjWs2IpS4", "length": "4:52"},
    {"name": "siege", "url": "https://www.youtube.com/watch?v=HylopY97ALc", "length": "6:49"},
    {"name": "ice_caves", "url": "https://www.youtube.com/watch?v=hMppfXwvVoM", "length": "4:41"},
    {"name": "temple", "url": "https://www.youtube.com/watch?v=YuTE61U3iJM", "length": "3:37"},
    {"name": "baal", "url": "https://www.youtube.com/watch?v=xcuz5IofwKo", "length": "4:23"},

  ];

let parseAreaName = function(logAreaName){
  areaName = false
  if(logAreaName.match(/(Hideout\d)/)){
    areaName = logAreaName.match(/(Hideout\d)/)[1].trim().toLowerCase()
  }
  else if(logAreaName.match(/(Mission)/)){
    areaName = "mission"
  }
  else if(logAreaName.match(/(SideArea)/)){
    areaName = "sidearea"
  }
  else if(logAreaName.match(/(Labyrinth_boss)/)){
    areaName = "izaro" 
  }
  else if(logAreaName.match(/(Labyrinth)/)){
    areaName = "labyrinth" 
  }
  else if(logAreaName.match(/\d_(.*)/)){
    areaName = logAreaName.match(/\d_(.*)/)[1].trim()
  }
  return areaName
}

let getTrackname = function(areaName){
  return areaMap[areaName] ? areaMap[areaName] : false;
}

let getTrackId = function(url){
  id = false
  type = getTrackType(url)
  if(type == 'youtube' && url.match(/\?v=(.{11})/)){
    id = url.match(/\?v=(.{11})/)[1]
  }
  else if(type == 'local'){
    id = url
  }
  return id
}

let getDurationInSeconds = function(length){
  parts = length.split(":")
  if(parts.length == 3)
    return parseInt(parts[0]) * 60*60 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  else if(parts.length == 2)
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  else
    return parseInt(parts[0])
}

let getLogFile = function(poePath){
  return poePath + "\\logs\\Client.txt"
}

let getTrackType = function(url){
  if(url.match(/http/) && url.match(/youtu/)){
    return 'youtube'
  }
  else if(url.match(/http/) && url.match(/soundcloud/)){
    return 'soundcloud'
  }
  
  return 'local'
}

let generateTrack = function(track){
  var type = getTrackType(track.url)
  var id = getTrackId(track.url)
  return {type: type, id:id, name:track.name, duration:getDurationInSeconds(track.length)}
}

let getTrack = function(areaName){
  track = false
  trackName = getTrackname(areaName)
  t = _.find(soundtrack, { 'name': trackName });
  if(t){
    track = generateTrack(t)
  }
  return track
}


let parseLogLine = function(line) {
  var newArea = line.match(/Entering area (.*)/)
  if(newArea){
    //console.log(line)
    var area = parseAreaName(newArea[1].trim())

    track = getTrack(area)
    if(track){
      if(currentTrackName != track.name){
        currentTrackName = track.name
        mainWindow.webContents.send('changeTrack' , track);
      }
    }
    else{
      console.log(area, " not mapped to a track")
    }
  }
}

let startWatchingLog = function(){
  //if we're already watching a file, lets stop
  if(ft && ft.stop){
    ft.stop()
  }

  ft = fileTail.startTailing(getLogFile(settings.get('poePath')));
  ft.on('line', parseLogLine);
 }

let doesLogExist = function(){
  var file = getLogFile(settings.get('poePath'))
  
  try{
    fs.openSync(file, 'r+');
  } catch (err) {
    return false
  }

  return true
}



let checkMusicVolume = function (){
  var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
  var configFile = home + "\\Documents\\My Games\\Path of Exile\\production_Config.ini"
  try{
    fs.openSync(configFile, 'r+');
    var data = fs.readFileSync(configFile, "utf-8")
    if(data.match(/music_volume[2]\=(\d+)/ig)){
      return parseInt(data.match(/music_volume[2]\=(\d+)/)[1])
    }
  } catch (err) {
  }
  return false
}

let run = function(browserWindow){
  mainWindow = browserWindow;

  if(!settings.get('poePath')){
    settings.set('poePath', DEFAULT_POE_PATH)
  }

  startWatchingLog()

  ipcMain.on('setPoePath', function(event, arg){
    if(arg && arg[0]){
      settings.set('poePath', arg[0])
      if(doesLogExist()){
        startWatchingLog()
      }
      event.sender.send('updateState', {path:settings.get('poePath'),valid:doesLogExist(), volume:checkMusicVolume()});
    }
  });

  ipcMain.on('updateState', function(event, arg){
     event.sender.send('updateState', {path:settings.get('poePath'),valid:doesLogExist(), volume:checkMusicVolume()});
  })
}

module.exports = {
    run: run
}