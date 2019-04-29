# Code Structure

This document describes you code structure of this software. Mainly, I write down about the directory structure and the purpose of each file.

# Directories

* [/](https://github.com/rooey/chromeos-filesystem-onedrive) - Build files, Configuration files, and etc.
* [/src](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src) - This directory has one HTML file and the manifest.json file.
* [/src/_locales/en](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/_locales/en) - There is one message resource file for English.
* [/src/icons](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/icons) - This directory has some image files.
* [/src/scripts](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/scripts) - There are some JavaScript files.
* [/src/styles](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/styles) - There is one css style sheet definition file.
* [/docs](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/docs) - Currently, there is one image file which is referenced by the README.md file.

At least, if you are a programmer, first you should enter the /app/scripts directory and see each JavaScript files to understand this app's behaviors.

# Files

## For Building

### [/gulpfile.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/gulpfile.js)

This file defines all procedures to build this software with [gulp](https://gulpjs.com/).

### [/package.json](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/package.json)

This file defines npm project information, building script commands and dependencies.

## HTML

### [/src/window.html](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/window.html)

This is a HTML file for the screen which users see at first when this software is launched. For instance, this HTML file has one button to start mounting the OneDrive storage. The click event is handled by the function defined in the /src/scripts/window.js file.

## JavaScript

This software consists of some JavaScript files. The abstract structure is the following:

<img src="https://raw.githubusercontent.com/rooey/chromeos-filesystem-onedrive/master/docs/code_structure.png">

### [/src/scripts/window.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/window.js)

This window.js file is in charge of handling each click event fired on the window.html. For instance, there are the events below:

* Mount button click event
* Setting button click event
* Opened files limit radio buttons change event

Each event handler is assigned by the assignEventHandlers() function.

#### Mount button click event

When this event fired, the onClickedBtnMount() function is called. The window.js file doesn't have any process to mount the OneDrive. Instead, this event handler delegates the actual process to the background page represented by the background.js file. For instance, the onClickedBtnMount() function sends a message to the background page. The message has one key/value pair: type:"mount".

After sending the message to the background page, the function waits a response. If the response has a success flag, the function closes the window.

#### Setting button click event

When this event fired, the onClickedBtnSettings() function is called. This function opens the setting dialog.

#### Opened files limit radio buttons change event

When this event fired, the onChangedOpenedFilesLimit() function is called. In the function, the selected value is stored with the chrome.storage.local API.

#### Other

If a current date is on December, this script shows you a special image.

### [/src/scripts/background.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/background.js)

This is a background page script. Mainly, this script has a responsibility of launching the window when users want to mount the OneDrive. Also, this script has an ability to receive the message from the windo
