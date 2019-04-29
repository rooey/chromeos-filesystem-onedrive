# Code Structure

This document describes the code structure of this respoistory.  Here we explain the purpose of the main directory structure and files.

# Directories

* [/](https://github.com/rooey/chromeos-filesystem-onedrive) - Build files, Configuration files, and etc.
* [/src](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src) - This directory has one HTML file and the manifest.json file.
* [/src/_locales/en](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/_locales/en) - There is currently only one message resource file for English.
* [/src/icons](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/icons) - This directory has some image files.
* [/src/scripts](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/scripts) - There are some JavaScript files.
* [/src/styles](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/src/styles) - There one contains the css style sheet definition file.
* [/docs](https://github.com/rooey/chromeos-filesystem-onedrive/tree/master/docs) - This folder contains the documentation - including this page!

At least, if you're a programmer, first you should enter the /src/scripts directory and see each JavaScript files to understand this app's behaviors.

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

This is a background page script. Mainly, this script has a responsibility of launching the window when users want to mount the OneDrive. Also, this script has an ability to receive the message from the window.js script. When the message received, this script delegates the request of mounting the OneDrive to the [/src/scripts/onedrive_fs.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/onedrive_fs.js) script. Especially, this script has one OneDriveFS instance.

This script can know what users want to mount the OneDrive by handling [chrome.fileSystemProvider.onMountRequested](https://developer.chrome.com/extensions/fileSystemProvider#event-onMountRequested) event. When this event fired, this script opens the window.html.

### [/src/scripts/onedrive_fs.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/onedrive_fs.js)

This script file is an implementation for [chrome.fileSystemProvider](https://developer.chrome.com/apps/fileSystemProvider) API. That is, this script has a responsibility of the following:

* When this script receives the request of mounting/unmounting, do mounting.mounting with the chrome.fileSystemProvider.mount()/unmount() API.
* Handling all events of the chrome.fileSystemProvider API. Each event has a name "on\***Requested", and this script has functions which has the same name of each event.
* Caching fetched meta data. For instance, Each meta data fetched is stored into [/src/scripts/metadata_cache.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/metadata_cache.js). This script improves a performance using the cache mechanism.
* This software has an ability to mount multiple accounts of OneDrive at the same time. Each connection is represented by OneDriveClient class defined in [/src/scripts/onedrive_client.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/onedrive_client.js). This script manages multiple OneDriveClient instances.

This script defines a OneDriveFS class. The OneDriveFS instance is created by the background.js. This script never communicate to OneDrive API server. Instead, this script delegates them to the onedrive_client.js script. That is, this script has a responsibility of handling FSP events and proxying them to the onedrive_client.js script.

* mount() - OneDriveClient#authorize(), OneDriveClient#getUserInfo()
* onReadDirectoryRequested() - OneDriveClient#readDirectory()
* onGetMetadataRequested() - OneDriveClient#getMetadata()
* onOpenFileRequested() - OneDriveClient#openFile()
* onReadFileRequested() - OneDriveClient#readFile()
* onCloseFileRequested() - OneDriveClient#closeFile()
* onCreateDirectoryRequested() - OneDriveClient#createDirectory()
* onDeleteEntryRequested() - OneDriveClient#deleteEntry()
* onMoveEntryRequested() - OneDriveClient#moveEntry()
* onCopyEntryRequested() - OneDriveClient#copyEntry()
* onWriteFileRequested() - OneDriveClient#writeFile()
* onTruncateRequested() - OneDriveClient#truncate()
* onCreateFileRequested() - OneDriveClient#createFile()

### [/src/scripts/onedrive_client.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/onedrive_client.js)

This script provides an ability to communicate with OneDrive API server. That is, this script uses each OneDrive API to treat user's directories/files. For instance, [OneDrive API v2](https://www.onedrive.com/developers/documentation/http/overview) is used.

This software uses the [chrome.identity](https://developer.chrome.com/extensions/identity) API to call the Microsoft Azure oAuth 2.0 token flow: (Code ---> Token ---> Refresh Token)

There are additional functions corresponding to various parts of the MS Graph API:

* authorize() - [/oauth2/v2.0/authorize](https://docs.microsoft.com/en-us/graph/auth-overview)
* getUserInfo() - [/me](https://docs.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0)
* getDriveData() - [/me/drive](https://docs.microsoft.com/en-us/graph/api/drive-get?view=graph-rest-1.0)
* getMetadata() - [/thumbnails](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_list_thumbnails?view=odsp-graph-online)
* readDirectory() - [/children](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_list_children?view=odsp-graph-online)
* readFile() - [driveitem_get_content](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_get_content?view=odsp-graph-online)
* createDirectory() - [driveitem_post_children](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_post_children?view=odsp-graph-online)
* deleteEntry() - [driveitem_delete](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delete?view=odsp-graph-online)
* moveEntry() - [driveitem_move](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_move?view=odsp-graph-online)
* copyEntry() - [driveitem_copy](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_copy?view=odsp-graph-online)
* createFile() - [driveitem_put_content](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_put_content?view=odsp-graph-online)
* writeFile() - [upload_session-start](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_createuploadsession?view=odsp-graph-online)
* truncate() - [upload_session-start](https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_createuploadsession?view=odsp-graph-online)

### [/src/scripts/metadata_cache.js](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/scripts/metadata_cache.js)

This script provides an ability to keep metadata objects. As the result, whole performance is increased because of reducing a network communication. Each metadata object is stored per each directory. That is, the cache key is a directory path.

* put() - Store metadata object array to the cache storage mapped by the specified directory path.
* get() - Retrieve metadata object/array specified by the directory path/file path.
* remove() - Delete the metadata object/array specified by the directory path/file path.

## Other

### [/src/manifest.json](https://github.com/rooey/chromeos-filesystem-onedrive/blob/master/src/manifest.json)

This is a manifest file which is needed for Chrome Apps.
