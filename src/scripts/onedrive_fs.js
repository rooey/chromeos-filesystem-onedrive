'use strict';

// Constants
// Use set DEBUG_ENABLED to true to enable verbose logging (alpha builds)
const DEBUG_ENABLED = true;

const FILE_SYSTEM_ID = 'onedrivefs';
const FILE_SYSTEM_NAME = 'OneDrive';

class OneDriveFS {

    // Constructor

    constructor() {
        this.onedrive_client_map_ = {};
        this.metadata_cache_ = {};
        this.watchers_ = {};
        this.assignEventHandlers();
    }

    // Public functions

    mount(successCallback, errorCallback) {
        const onedriveClient = new OneDriveClient(this);
        onedriveClient.authorize(() => {
            onedriveClient.getDriveData((driveInfo) => {
                onedriveClient.getUserInfo((userInfo) => {
                    this.writeLog('debug', 'driveInfo', driveInfo);

                    const fileSystemId = this.createFileSystemID(driveInfo.id);
                    chrome.fileSystemProvider.getAll(fileSystems => {
                        let mounted = false;
                        for (let i = 0; i < fileSystems.length; i++) {
                            if (fileSystems[i].fileSystemId === fileSystemId) {
                                mounted = true;
                                break;
                            }
                        }
                        if (mounted) {
                            errorCallback('ALREADY_MOUNTED');
                        } else {
                            this.onedrive_client_map_[fileSystemId] = onedriveClient;
                            chrome.storage.local.get('settings', items => {
                                const settings = items.settings || {};
                                const openedFilesLimit = settings.openedFilesLimit || '10';
                                chrome.fileSystemProvider.mount({
                                    fileSystemId: fileSystemId,
                                    displayName: FILE_SYSTEM_NAME + ' ' + driveInfo.type +' ('+ userInfo.displayName + ')',
                                    writable: true,
                                    openedFilesLimit: Number(openedFilesLimit)
                                }, () => {
                                    this.registerMountedCredential(
                                        driveInfo.id, onedriveClient.getToken('accessToken'), onedriveClient.getToken('refreshToken'), () => {
                                        successCallback();
                                    });
                                });
                            });
                        }
                    });
                }, reason => {
                    errorCallback(reason);
                });
            }, reason => {
                errorCallback(reason);
            });
        }, reason => {
            errorCallback(reason);
        });
    }

    resume(fileSystemId, successCallback, errorCallback) {
        this.getMountedCredential(fileSystemId, credential => {
            if (credential) {
                const onedriveClient = new OneDriveClient(this);
                onedriveClient.setTokens(credential.accessToken, credential.refreshToken);
                onedriveClient.setUid(credential.uid);
                this.onedrive_client_map_[fileSystemId] = onedriveClient;
                successCallback();
            } else {
                this.sendMessageToSentry('resume(): CREDENTIAL_NOT_FOUND', {
                    fileSystemId: fileSystemId
                });
                errorCallback('CREDENTIAL_NOT_FOUND');
            }
        });
    }

    unmount(onedriveClient, callback) {
        this.doUnmount(onedriveClient, null, callback);
    }

    onUnmountRequested(options, successCallback, _errorCallback) {
        this.writeLog('debug', 'onUnmountRequested', options);
        const onedriveClient = this.getOneDriveClient(options.fileSystemId);
        this.doUnmount(onedriveClient, options.requestId, successCallback);
    }

    onReadDirectoryRequested(onedriveClient, options, successCallback, errorCallback) {
        onedriveClient.readDirectory(options.directoryPath, entryMetadataList => {
            const cache = this.getMetadataCache(options.fileSystemId);
            cache.put(options.directoryPath, entryMetadataList);
            successCallback(entryMetadataList.map(e => {
                return this.trimMetadata(options, e);
            }), false);
        }, errorCallback);
    }

    onGetMetadataRequested(onedriveClient, options, successCallback, errorCallback) {
        this.writeLog('debug', 'Thumbnail', options.thumbnail);
        const metadataCache = this.getMetadataCache(options.fileSystemId);
        const cache = metadataCache.get(options.entryPath);
        if (cache.directoryExists && cache.fileExists && !options.thumbnail) {
            successCallback(this.trimMetadata(options, cache.metadata));
        } else {
            onedriveClient.getMetadata(
                options.entryPath, entryMetadata => {
                    successCallback(this.trimMetadata(options, entryMetadata));
                }, errorCallback);
        }
    }

    onOpenFileRequested(onedriveClient, options, successCallback, errorCallback) {
        onedriveClient.openFile(options.filePath, options.requestId, options.mode, successCallback, errorCallback);
    }

    onReadFileRequested(onedriveClient, options, successCallback, errorCallback) {
        this.getOpenedFile(options.fileSystemId, options.openRequestId, openedFile => {
            onedriveClient.readFile(
                openedFile.filePath, options.offset, options.length, (data, hasMore) => {
                    successCallback(data, hasMore);
                }, errorCallback);
        });
    }

    onCloseFileRequested(onedriveClient, options, successCallback, errorCallback) {
        this.getOpenedFile(options.fileSystemId, options.openRequestId, openedFile => {
            onedriveClient.closeFile(openedFile.filePath, options.openRequestId, openedFile.mode, successCallback, errorCallback);
        });
    }

    onCreateDirectoryRequested(onedriveClient, options, successCallback, errorCallback) {
        this.updateEntry(
            'createDirectory', onedriveClient, options, successCallback, errorCallback);
    }

    onDeleteEntryRequested(onedriveClient, options, successCallback, errorCallback) {
        this.updateEntry(
            'deleteEntry', onedriveClient, options, successCallback, errorCallback);
    }

    onMoveEntryRequested(onedriveClient, options, successCallback, errorCallback) {
        this.updateEntry('moveEntry', onedriveClient, options, successCallback, errorCallback);
    }

    onCopyEntryRequested(onedriveClient, options, successCallback, errorCallback) {
        this.updateEntry('copyEntry', onedriveClient, options, successCallback, errorCallback);
    }

    onWriteFileRequested(onedriveClient, options, successCallback, errorCallback) {
        this.writeLog('debug', this.name, options);
        this.getOpenedFile(options.fileSystemId, options.openRequestId, openedFile => {
            onedriveClient.writeFile(openedFile.filePath, options.data, options.offset, options.openRequestId, () => {
                const metadataCache = this.getMetadataCache(options.fileSystemId);
                metadataCache.remove(openedFile.filePath);
                successCallback();
            }, errorCallback);
        });
    }

    onTruncateRequested(onedriveClient, options, successCallback, errorCallback) {
        onedriveClient.truncate(options.filePath, options.length, () => {
            const metadataCache = this.getMetadataCache(options.fileSystemId);
            metadataCache.remove(options.filePath);
            successCallback(false);
        }, errorCallback);
    }

    onCreateFileRequested(onedriveClient, options, successCallback, errorCallback) {
        this.updateEntry(
            'createFile', onedriveClient, options, successCallback, errorCallback);
    }

    onAddWatcherRequested(onedriveClient, options, successCallback, _errorCallback) {
        const watchers = this.getWatchers(options.fileSystemId);
        watchers.add(options.entryPath);
        successCallback();
    }

    onRemoveWatcherRequested(onedriveClient, options, successCallback, _errorCallback) {
        const watchers = this.getWatchers(options.fileSystemId);
        watchers.delete(options.entryPath);
        successCallback();
    }

    onAlarm(_alarm) {
        for (let fileSystemId in this.watchers_) {
            const onedriveClient = this.getOneDriveClient(fileSystemId);
            const watchers = this.watchers_[fileSystemId];
            for (let watcher of watchers.values()) {
                this.watchDirectory(fileSystemId, onedriveClient, watcher);
            }
        }
    }

    // Private functions

    trimMetadata(options, metadata) {
        const result = {};
        if (options.isDirectory) {
            this.writeLog('debug', this.name, metadata.isDirectory);
            result.isDirectory = metadata.isDirectory;
        }
        if (options.name) result.name = metadata.name;
        if (options.size) result.size = metadata.size;
        if (options.modificationTime) result.modificationTime = metadata.modificationTime;
        if (options.thumbnail) result.thumbnail = metadata.thumbnail;
        return result;
    }

    updateEntry(operation, onedriveClient, options, successCallback, errorCallback) {
        this.writeLog('debug', 'updateEntry - ' + operation, options);
        switch (operation) {
            case 'createDirectory':
                this.doOperation (operation, options.directoryPath, onedriveClient, options, successCallback, errorCallback);
                break;

            case 'deleteEntry':
                this.doOperation (operation, options.entryPath, onedriveClient, options, successCallback, errorCallback);
                break;

            case 'createFile':
                this.doOperation (operation, options.filePath, onedriveClient, options, successCallback, errorCallback);
                break;

            default:
                onedriveClient[operation](options.sourcePath, options.targetPath, () => {
                    const metadataCache = this.getMetadataCache(options.fileSystemId);
                    metadataCache.remove(options.sourcePath);
                    metadataCache.remove(options.targetPath);
                    successCallback();
                }, errorCallback);
        }
    }

    doOperation(operation, path, onedriveClient, options, successCallback, errorCallback) {
        this.writeLog('debug', 'updateEntry - fallthrough', path);
        onedriveClient[operation](path, () => {
            const metadataCache = this.getMetadataCache(options.fileSystemId);
            metadataCache.remove(path);
            this.writeLog('debug', 'updateEntry - setpath', path);
            successCallback();
        }, errorCallback);
    }

    doUnmount(onedriveClient, requestId, successCallback) {
        this._doUnmount(
            onedriveClient.getUid(),
            successCallback
        );
    }

    _doUnmount(uid, successCallback) {
        this.unregisterMountedCredential(
            uid,
            ()=> {
                const fileSystemId = this.createFileSystemID(uid);
                this.writeLog('debug', this.name, fileSystemId);
                delete this.onedrive_client_map_[fileSystemId];
                this.deleteMetadataCache(fileSystemId);
                this.deleteWatchers(fileSystemId);
                successCallback();
                chrome.fileSystemProvider.unmount({
                    fileSystemId: fileSystemId
                }, () => {
                    // N/A
                });
            }
        );
    }

    registerMountedCredential(uid, accessToken, refreshToken, callback) {
        const fileSystemId = this.createFileSystemID(uid);
        chrome.storage.local.get('credentials', items => {
            const credentials = items.credentials || {};
            credentials[fileSystemId] = {
                accessToken: accessToken,
                refreshToken: refreshToken,
                uid: uid
            };
            chrome.storage.local.set({
                credentials: credentials
            }, callback);
        });
    }

    unregisterMountedCredential(uid, callback) {
        const fileSystemId = this.createFileSystemID(uid);
        chrome.storage.local.get('credentials', items => {
            const credentials = items.credentials || {};
            delete credentials[fileSystemId];
            chrome.storage.local.set({
                credentials: credentials
            }, callback);
        });
    }

    getMountedCredential(fileSystemId, callback) {
        chrome.storage.local.get('credentials', items => {
            const credentials = items.credentials || {};
            const credential = credentials[fileSystemId];
            callback(credential);
        });
    }

    createEventHandler(callback) {
        return (options, successCallback, errorCallback) => {
            const fileSystemId = options.fileSystemId;
            const onedriveClient = this.getOneDriveClient(fileSystemId);
            if (!onedriveClient) {
                this.resume(fileSystemId, () => {
                    callback(options, successCallback, errorCallback);
                }, reason => {
                    this.writeLog('debug', 'resume failed', reason);
                    chrome.notifications.create('', {
                        type: 'basic',
                        title: 'File System for OneDrive',
                        message: 'Resuming failed. Unmount.',
                        iconUrl: '/images/48.png'
                    }, _notificationId => {
                    });
                    this.getMountedCredential(fileSystemId, credential => {
                        if (credential) {
                            this._doUnmount(
                                onedriveClient,
                                credential.uid,
                                () => {
                                    this.sendMessageToSentry('createEventHandler(): FAILED', {
                                        fileSystemId: fileSystemId,
                                        credential: credential
                                    });
                                    errorCallback('FAILED');
                                });
                        } else {
                            this.writeLog('debug', 'Credential not found', fileSystemId);
                            this.sendMessageToSentry('createEventHandler(): Credential for [' + fileSystemId + '] not found', {
                                fileSystemId: fileSystemId
                            });
                            errorCallback('FAILED');
                        }
                    });
                });
            } else {
                callback(options, successCallback, errorCallback);
            }
        };
    }

    assignEventHandlers() {
        chrome.alarms.onAlarm.addListener(alarm => {
            if (alarm.name === 'onedrive_alarm') {
                this.onAlarm(alarm);
            }
        });
        chrome.alarms.create('onedrive_alarm', {
            delayInMinutes: 1,
            periodInMinutes: 1
        });
        chrome.fileSystemProvider.onUnmountRequested.addListener(
            (options, successCallback, errorCallback) => { // Unmount immediately
                this.writeLog('debug', 'pre onUnmountRequested', options);
                const fileSystemId = options.fileSystemId;
                const onedriveClient = this.getOneDriveClient(fileSystemId);
                if (!onedriveClient) {
                    this.resume(fileSystemId, () => {
                        this.onUnmountRequested(options, successCallback, errorCallback);
                    }, reason => {
                        this.sendMessageToSentry('assignEventHandlers(): onUnmountRequested - FAILED', {
                            reason: reason
                        });
                        errorCallback('FAILED');
                    });
                } else {
                    this.onUnmountRequested(options, successCallback, errorCallback);
                }
            });
        const funcNameList = [
            'onReadDirectoryRequested',
            'onGetMetadataRequested',
            'onOpenFileRequested',
            'onReadFileRequested',
            'onCloseFileRequested',
            'onCreateDirectoryRequested',
            'onDeleteEntryRequested',
            'onMoveEntryRequested',
            'onCopyEntryRequested',
            'onWriteFileRequested',
            'onTruncateRequested',
            'onCreateFileRequested',
            'onAddWatcherRequested',
            'onRemoveWatcherRequested'
        ];
        const caller = (self, funcName) => {
            return (options, successCallback, errorCallback) => {
                this.writeLog('debug', funcName, options);
                const onedriveClient = this.getOneDriveClient(options.fileSystemId);
                this[funcName](onedriveClient, options, successCallback, errorCallback);
            };
        };
        for (let i = 0; i < funcNameList.length; i++) {
            chrome.fileSystemProvider[funcNameList[i]].addListener(
                this.createEventHandler(
                    caller(this, funcNameList[i])
                )
            );
        }
    }

    getMetadataCache(fileSystemId) {
        let metadataCache = this.metadata_cache_[fileSystemId];
        if (!metadataCache) {
            metadataCache = new MetadataCache();
            this.metadata_cache_[fileSystemId] = metadataCache;
        }

        this.writeLog('debug', 'metadataCache', metadataCache);
        return metadataCache;
    };

    deleteMetadataCache(fileSystemId) {
        this.writeLog('debug', this.name, fileSystemId);
        delete this.metadata_cache_[fileSystemId];
    };

    createFileSystemID(uid) {
        return FILE_SYSTEM_ID + '://' + uid;
    };

    getOneDriveClient(fileSystemID) {
        return this.onedrive_client_map_[fileSystemID];
    };

    getOpenedFiles(fileSystemId, callback) {
        chrome.fileSystemProvider.get(fileSystemId, fileSystem => {
            callback(fileSystem.openedFiles);
        });
    };

    getOpenedFile(fileSystemId, openRequestId, callback) {
        this.getOpenedFiles(fileSystemId, openedFiles => {
            const openedFile = openedFiles.filter(x => {
                return x.openRequestId === openRequestId;
            });
            if (openedFile.length >= 1) {
                callback(openedFile[0]);
            } else {
                throw new Error('OpenedFile information not found. openRequestId=' + openRequestId);
            }
        });
    };

    writeLog(messageType, message, payload) {
        if ((messageType === 'debug') && (DEBUG_ENABLED !==true)) return;
        console.log('[' + messageType + '] ' + message, payload);
        return;
    };

    sendMessageToSentry(message, extra) {
        this.useOptions('useSentry', use => {
            //ISSUE #57 @rooey
            //Only send to sentry if user has opted-in
            if (!use) {
                return;
            }
            this.writeLog('sentry', message, extra);
            if (Raven.isSetup()) {
                Raven.captureMessage(new Error(message), {
                    extra: extra,
                    tags: {
                        'app.version': chrome.runtime.getManifest().version
                    }
                });
            }
        });
    }

    getWatchers(fileSystemId) {
        let watchers = this.watchers_[fileSystemId];
        if (!watchers) {
            watchers = new Set();
            this.watchers_[fileSystemId] = watchers;
        }
        return watchers;
    }

    deleteWatchers(fileSystemId) {
        delete this.watchers_[fileSystemId];
    }

    /*useWatcher(callback) {
        chrome.storage.local.get('settings', items => {
            const settings = items.settings || {};
            callback(settings.useWatcher || false);
        });
    }*/

    useOptions(options, callback) {
        chrome.storage.local.get('settings', items => {
            const settings = items.settings || {};
            callback(settings[options] || false);
        });
    }

    watchDirectory(fileSystemId, onedriveClient, entryPath) {
        this.useOptions('useWatcher', use => {
            if (!use) {
                return;
            }
            this.writeLog('debug', this.name, entryPath);
            onedriveClient.readDirectory(entryPath, entries => {
                const metadataCache = this.getMetadataCache(fileSystemId);
                const currentList = entries;
                const oldList = metadataCache.directories_[entryPath] || {};
                const nameSet = new Set();
                for (let i = 0; i < currentList.length; i++) {
                    const current = currentList[i];
                    const old = oldList[current.name];
                    if (old) {
                        // Changed
                        const isBothDirectory = current.isDirectory && old.isDirectory;
                        const isMatchType = current.isDirectory === old.isDirectory;
                        const isMatchSize = current.size === old.size;
                        const isMatchModificationTime = current.modificationTime.getTime() === old.modificationTime.getTime();
                        if (!isBothDirectory && !(isMatchType && isMatchSize && isMatchModificationTime)) {
                            this.writeLog('debug', 'Changed:', current.name);
                            this.notifyEntryChanged(fileSystemId, entryPath, 'CHANGED', current.name);
                        }
                    } else {
                        // Added
                        this.writeLog('debug', 'Added:', current.name);
                        this.notifyEntryChanged(fileSystemId, entryPath, 'CHANGED', current.name);
                    }
                    nameSet.add(current.name);
                }
                for (let oldName in oldList) {
                    if (!nameSet.has(oldName)) {
                        // Deleted
                        this.writeLog('debug', 'Deleted:', oldName);
                        this.notifyEntryChanged(fileSystemId, entryPath, 'DELETED', oldName);
                    }
                }
                metadataCache.put(entryPath, currentList);
            }, (reason) => {
                this.sendMessageToSentry('watchDirectory(): ' + reason, {
                    fileSystemId: fileSystemId
                });
            });
        });
    }

    notifyEntryChanged(fileSystemId, directoryPath, changeType, entryPath) {
        this.writeLog('debug', this.name, `notifyEntryChanged: ${directoryPath} ${entryPath} {changeType}${changeType}`);
        //console.log(`notifyEntryChanged: ${directoryPath} ${entryPath} {changeType}${changeType}`);
        chrome.fileSystemProvider.notify({
            fileSystemId: fileSystemId,
            observedPath: directoryPath,
            recursive: false,
            changeType: 'CHANGED',
            changes: [
                {entryPath: entryPath, changeType: changeType}
            ]
        }, () => {});
    }

};

// Export
window.OneDriveFS = OneDriveFS;
