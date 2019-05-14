"use strict";

(function() {

    // Constants

    var FILE_SYSTEM_ID = "onedrivefs";
    var FILE_SYSTEM_NAME = "OneDrive";

    // Constructor

    var OneDriveFS = function() {
        this.onedrive_client_ = null;
        this.opened_files_ = {};
        this.metadata_cache_ = null;
        assignEventHandlers.call(this);
    };

    // Public functions

    OneDriveFS.prototype.mount = function(successCallback, errorCallback) {
        chrome.fileSystemProvider.getAll(function(fileSystems) {
            var mounted = false;
            for (var i = 0; i < fileSystems.length; i++) {
                if (fileSystems[i].fileSystemId === FILE_SYSTEM_ID) {
                    mounted = true;
                    break;
                }
            }
            if (mounted) {
                errorCallback("ALREADY_MOUNTED");
            } else {
                this.onedrive_client_ = new OneDriveClient(this);
                this.onedrive_client_.authorize(function() {
                    chrome.fileSystemProvider.mount({
                        fileSystemId: FILE_SYSTEM_ID,
                        displayName: FILE_SYSTEM_NAME,
                        writable: true
                    }, function() {
                        var lastError = chrome.runtime.lastError;
                        if (lastError) {
                            this.onedrive_client_ = null;
                            errorCallback(lastError);
                        } else {
                            this.registerMountedCredential(
                                this.onedrive_client_.getToken('accessToken'), this.onedrive_client_.getToken('refreshToken'), function() {
                                successCallback();
                            });
                        }
                    }.bind(this));
                }.bind(this), function(reason) {
                    console.log(reason);
                    errorCallback(reason);
                }.bind(this));
            }
        }.bind(this));
    };

    OneDriveFS.prototype.resume = function(successCallback, errorCallback) {
        console.log('resume - start');
        if (!this.onedrive_client_) {
            this.getMountedCredential(function (credentials) {
                if (credentials) {
                    console.log('credentials object-');
                    console.log(credentials);
                    console.log('accessToken: ' + credentials.accessToken);
                    console.log('refreshToken: ' + credentials.refreshToken);
                    this.onedrive_client_= new OneDriveClient(this);
                    this.onedrive_client_.setTokens(credentials.accessToken, credentials.refreshToken);
                    console.log('accessToken: ' + credentials.accessToken);
                    console.log('refreshToken: ' + credentials.refreshToken);
                    console.log('resume - end');
                    successCallback();
                } else {
                    errorCallback('CREDENTIAL_NOT_FOUND');
                }
            }.bind(this));
        } else {
            console.log('resume-clear');
            successCallback();
        }
    };

    OneDriveFS.prototype.registerMountedCredential = function(accessToken, refreshToken, callback) {
        console.log("registerMountedCredential");
        chrome.storage.local.get('credentials', function (items) {
            const credentials = items.credentials || {};
            credentials[FILE_SYSTEM_ID] = {
                accessToken: accessToken,
                refreshToken: refreshToken,
                uid: FILE_SYSTEM_ID
            };
            chrome.storage.local.set({
                credentials: credentials
            }, callback(credentials));
        });
    };

    OneDriveFS.prototype.getMountedCredential = function(callback) {
        chrome.storage.local.get('credentials', function (items) {
            const credentials = items.credentials || {};
            const credential = credentials[FILE_SYSTEM_ID];
            callback(credential);
        });
    };

    OneDriveFS.prototype.unregisterMountedCredential = function(callback) {
        chrome.storage.local.get('credentials', function (items) {
            const credentials = items.credentials || {};
            delete credentials[FILE_SYSTEM_ID];
            chrome.storage.local.set({
                credentials: credentials
            }, callback(credentials));
        });
    };

    OneDriveFS.prototype.onUnmountRequested = function(options, successCallback, errorCallback) {
        this.doUnmount(successCallback);
    };

    OneDriveFS.prototype.onReadDirectoryRequested = function(options, successCallback, errorCallback) {
        console.log("onReadDirectoryRequested");
        this.onedrive_client_.readDirectory(options.directoryPath, function(entryMetadataList) {
            var cache = getMetadataCache.call(this);
            cache.put(options.directoryPath, entryMetadataList);
            successCallback(entryMetadataList, false);
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onGetMetadataRequested = function(options, successCallback, errorCallback) {
        console.log("onGetMetadataRequested: thumbnail=" + options.thumbnail);
        console.log(options);
        console.log('this -');
        console.log(this);
        console.log('this.onedrive_client_ -');
        console.log(this.onedrive_client_);
        var metadataCache = getMetadataCache.call(this);
        var cache = metadataCache.get(options.entryPath);
        if (cache.directoryExists && cache.fileExists) {
            successCallback(cache.metadata);
        } else {
            console.log('GET METADATA ---');
            this.onedrive_client_.getMetadata(
                options.entryPath, function(entryMetadata) {
                    successCallback(entryMetadata);
                }.bind(this), errorCallback);
        }
    };

    OneDriveFS.prototype.onOpenFileRequested = function(options, successCallback, errorCallback) {
        console.log("onOpenFileRequested");
        console.log(options);
        this.onedrive_client_.openFile(options.filePath, options.requestId, options.mode, function() {
            this.opened_files_[options.requestId] = options.filePath;
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onReadFileRequested = function(options, successCallback, errorCallback) {
        console.log("onReadFileRequested - start");
        console.log(options);
        var filePath = this.opened_files_[options.openRequestId];
        this.onedrive_client_.readFile(
            filePath, options.offset, options.length, function(data, hasMore) {
                successCallback(data, hasMore);
                console.log("onReadFileRequested - end");
            }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onCloseFileRequested = function(options, successCallback, errorCallback) {
        console.log("onCloseFileRequested");
        var filePath = this.opened_files_[options.openRequestId];
        this.onedrive_client_.closeFile(filePath, options.openRequestId, function() {
            delete this.opened_files_[options.openRequestId];
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onCreateDirectoryRequested = function(options, successCallback, errorCallback) {
        console.log("onCreateDirectoryRequested");
        console.log(options);
        this.onedrive_client_.createDirectory(options.directoryPath, function() {
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onDeleteEntryRequested = function(options, successCallback, errorCallback) {
        console.log("onDeleteEntryRequested");
        console.log(options);
        this.onedrive_client_.deleteEntry(options.entryPath, function() {
            var metadataCache = getMetadataCache.call(this);
            metadataCache.remove(options.entryPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onMoveEntryRequested = function(options, successCallback, errorCallback) {
        console.log("onMoveEntryRequested");
        console.log(options);
        this.onedrive_client_.moveEntry(options.sourcePath, options.targetPath, function() {
            var metadataCache = getMetadataCache.call(this);
            metadataCache.remove(options.sourcePath);
            metadataCache.remove(options.targetPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onCopyEntryRequested = function(options, successCallback, errorCallback) {
        console.log("onCopyEntryRequested");
        console.log(options);
        this.onedrive_client_.copyEntry(options.sourcePath, options.targetPath, function() {
            var metadataCache = getMetadataCache.call(this);
            metadataCache.remove(options.sourcePath);
            metadataCache.remove(options.targetPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onWriteFileRequested = function(options, successCallback, errorCallback) {
        console.log("onWriteFileRequested");
        console.log(options);
        var filePath = this.opened_files_[options.openRequestId];
        this.onedrive_client_.writeFile(filePath, options.data, options.offset, options.openRequestId, function() {
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onTruncateRequested = function(options, successCallback, errorCallback) {
        console.log("onTruncateRequested");
        console.log(options);
        this.onedrive_client_.truncate(options.filePath, options.length, function() {
            console.log("onTruncateRequested - done");
            successCallback(false);
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.onCreateFileRequested = function(options, successCallback, errorCallback) {
        console.log("onCreateFileRequested");
        console.log(options);
        this.onedrive_client_.createFile(options.filePath, function() {
            var metadataCache = getMetadataCache.call(this);
            metadataCache.remove(options.filePath);
            successCallback();
        }.bind(this), errorCallback);
    };

    OneDriveFS.prototype.doUnmount = function(successCallback) {
        this.unregisterMountedCredential(function() {
                successCallback();
                chrome.fileSystemProvider.unmount({
                    fileSystemId: FILE_SYSTEM_ID
                }, function() {
                    // N/A
                    console.log('unmounted');
                });
            }
        );
    };

    // Private functions
    var createEventHandler = function(callback) {
        return function(options, successCallback, errorCallback) {
            if (!this.onedrive_client_) {
                this.resume(function() {
                    callback(options, successCallback, errorCallback);
                }.bind(this), function (reason) {
                    console.log('resume failed: ' + reason);
                    chrome.notifications.create('', {
                        type: 'basic',
                        title: 'File System for OneDrive',
                        message: 'Resuming failed. Unmount.',
                        iconUrl: '/images/48.png'
                    }, function (_notificationId) {
                    });
                    this.getMountedCredential(function (credentials) {
                        if (credentials) {
                            this.doUnmount(successCallback);
                            errorCallback('FAILED');
                        } else {
                            console.log('Credentials for [' + FILE_SYSTEM_ID + '] not found.');
                            errorCallback('FAILED');
                        }
                    }.bind(this));
                }.bind(this));
            } else {
                callback(options, successCallback, errorCallback);
            }
        }.bind(this);
    };

    /*
    var createEventHandler = function(callback) {
        return function(options, successCallback, errorCallback) {
            if (!this.onedrive_client_) {
                this.resume(function() {
                    callback(options, successCallback, errorCallback);
                }.bind(this), function(reason) {
                    console.log("resume failed");
                    errorCallback("FAILED");
                }.bind(this));
            } else {
                callback(options, successCallback, errorCallback);
            }
        }.bind(this);
    };
    */

    var assignEventHandlers = function() {
        console.log("Start: assignEventHandlers");
        chrome.fileSystemProvider.onUnmountRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onUnmountRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onReadDirectoryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onReadDirectoryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onGetMetadataRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onGetMetadataRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onOpenFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onOpenFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onReadFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onReadFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCloseFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCloseFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCreateDirectoryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCreateDirectoryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onDeleteEntryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onDeleteEntryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onMoveEntryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onMoveEntryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCopyEntryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCopyEntryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onWriteFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onWriteFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onTruncateRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onTruncateRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCreateFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCreateFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        console.log("End: assignEventHandlers");
    };

    var getMetadataCache = function() {
        if (!this.metadata_cache_) {
            this.metadata_cache_ = new MetadataCache();
        }
        return this.metadata_cache_;
    };

    // Export

    window.OneDriveFS = OneDriveFS;

})();
