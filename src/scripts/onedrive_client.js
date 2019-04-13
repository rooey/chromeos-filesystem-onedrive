'use strict';

let storedAppInfo = null;

let appInfo=OneDriveClient.getAppInfo();

const CLIENT_SECRET = "SECRETGOESHERE";

const AUTH_URL = appInfo.authServiceUri +
    "?client_id=" + appInfo.clientId +
    "&response_type=code" +
    "&redirect_uri=" + encodeURIComponent(appInfo.redirectUri);

const CHUNK_SIZE = 1024 * 1024 * 4; // 4MB

class OneDriveClient {

    // Constructor

    constructor(onedriveFS) {
        this.onedrive_fs_ = onedriveFS;
        this.access_token_ = null;
        this.uid_ = null;
        this.writeRequestMap = {};
        this.initializeJQueryAjaxBinaryHandler();
    };

    // Public functions

    authorize(successCallback, errorCallback) {
        this.access_token_ = OneDriveClient.getTokenFromCookie();
        if (this.access_token_) {
            successCallback();
        }
        else {
            var appInfo = OneDriveClient.getAppInfo();
            var AUTH_URL = appInfo.authServiceUri +
                "?client_id=" + appInfo.clientId +
                "&response_type=code" +
                "&redirect_uri=" + encodeURIComponent(appInfo.redirectUri);
    
            if (appInfo.scopes) {
                AUTH_URL += "&scope=" + encodeURIComponent(appInfo.scopes);
            }
            if (appInfo.resourceUri) {
                AUTH_URL += "&resource=" + encodeURIComponent(appInfo.resourceUri);
            }
    
            console.log(AUTH_URL);
            chrome.identity.launchWebAuthFlow({
                "url": AUTH_URL,
                "interactive": true
            }, redirectUrl=> {
                if (chrome.runtime.lastError) {
                    errorCallback(chrome.runtime.lastError.message);
                    return;
                }
                if (redirectUrl) {
                    var codeInfo = OneDriveClient.getCodeFromUrl(redirectUrl);
                    this.code_ = codeInfo.code;
    
                    // Get Token via POST
                    $.ajax({
                        type: "POST",
                        url: appInfo.tokenServiceUri,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        responseType: "arraybuffer",
                        data: "client_id=" + appInfo.clientId +
                            "&redirect_uri=" + appInfo.redirectUri +
                            "&client_secret=" + appInfo.clientSecret +
                            "&code=" + this.code_ +
                            "&grant_type=authorization_code",
                        dataType: "text"
                    }).done(function(jsonData) {
                        console.log("OK-jsonData");
                        console.log(jsonData);
                        var tokenInfo = OneDriveClient.prototype.getTokenInfoFromJSON(jsonData);
                        console.log("tokenInfo");
                        console.log(tokenInfo);
    
                        // Process Token - WEAREHERE
    
                        this.access_token_ = tokenInfo.access_token;
                        this.refresh_token_ = tokenInfo.refresh_token;
                        this.token_expiry_ = parseInt(tokenInfo.expires_in);
    
                        if (this.access_token_)
                        {
                            OneDriveClient.setCookie(this.access_token_, this.refresh_token_, this.token_expiry_);
                            this.driveData = OneDriveClient.getDriveData();
                            successCallback();
                        } else {
                            console.log("This error is here. 1");
                            errorCallback("failed to get an access token ");
                        }
                    }.fail(error => {
                        console.log(error);
                        errorCallback(error);
                    }))
                } else {
                    errorCallback("Authorization failed");
                }
            })
        }
    };

    getAppInfo() {
        if (storedAppInfo) {
            return storedAppInfo;
        }
     
        var scriptTag = document.getElementById("onedriveclient");
        if (!scriptTag) {
            console.log("the script tag for OneDriveClient should have its id set to 'onedriveclient'");
        }
    
        var clientId = scriptTag.getAttribute("clientId");
        if (!clientId) {
            console.log("the OneDriveClient script tag needs a clientId attribute set to your application id");
        }
    
        var scopes = scriptTag.getAttribute("scopes");
        // scopes aren't always required, so we don't warn here.
    
        var redirectUri = chrome.identity.getRedirectURL("");
    
        var resourceUri = scriptTag.getAttribute("resourceUri");
        if (!resourceUri) {
            console.log("the OneDriveClient script tag needs a resourceUri attribtue set to the oauth token service url");
        }

        var tokenServiceUri = scriptTag.getAttribute("tokenServiceUri");
        if (!tokenServiceUri) {
            console.log("the OneDriveClient script tag needs a tokenServiceUri attribtue set to the oauth token service url");
        }
        
        var authServiceUri = scriptTag.getAttribute("authServiceUri");
        if (!authServiceUri) {
            console.log("the OneDriveClient script tag needs an authServiceUri attribtue set to the oauth authentication service url");
        }
    
        var appInfo = {
            "clientId": clientId,
            "scopes": scopes,
            "redirectUri": redirectUri,
            "tokenServiceUri": tokenServiceUri,
            "authServiceUri": authServiceUri
        };
    
        storedAppInfo = appInfo;
    
        return appInfo;
    };

    getDriveData(successCallback, errorCallback) {
        var url = "https://graph.microsoft.com/v1.0/me/drive";
        console.log("url set");
        $.ajax({
            type: "GET",
            url: url,
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            console.log("preres");
            console.log(result);
            console.log("postres");
            var driveData = {
                id: result.id,
                name: this.normalizeName.call(this, result.name),
                type: result.driveType,
                quota: result.quota
            };
        
            console.log("drive data:");
            console.log(driveData);
            console.log("drive data end:");
            //return driveData;
            successCallback(result, false);
        }.fail(error => {
            console.log(error);
            errorCallback(error);
        })
        );
    };

    getTokenFromCookie() {
        var cookies = document.cookie;
        var name = "onedriveclient=";
        var start = cookies.indexOf(name);
        if (start >= 0) {
            start += name.length;
            var end = cookies.indexOf(';', start);
            if (end < 0) {
                end = cookies.length;
            }
            else {
                var postCookie = cookies.substring(end);
            }

            var value = cookies.substring(start, end);
            return value;
        }

        return "";
    };

    getTokenInfoFromJSON(jsonData) {
        if (jsonData) {
            console.log(jsonData);
    
            var tokenInfo = JSON.parse(jsonData);
            console.log("tokenInfo");
            console.log(tokenInfo);
            return tokenInfo;
        }
        else {
            console.log("failed to receive tokenInfo");
        }
    };

    getCodeFromUrl(redirectUrl) {
        if (redirectUrl) {
            var codeResponse = redirectUrl.substring(redirectUrl.indexOf("?") + 1);
            console.log(codeResponse);
    
            var codeInfo = JSON.parse(
                '{' + codeResponse.replace(/([^=]+)=([^&]+)&?/g, '"$1":"$2",').slice(0,-1) + '}',
                function(key, value) { return key === "" ? value : decodeURIComponent(value); });
            console.log("codeInfo");
            console.log(codeInfo);
            return codeInfo;
        }
        else {
            console.log("failed to receive codeInfo");
        }
    };

    getAccessToken() {
        return this.access_token_;
    };

    setAccessToken(accessToken) {
        this.access_token_ = accessToken;
    };

    unauthorize(successCallback, errorCallback) {
        if (this.access_token_) {
            $.ajax({
                type: 'POST',
                url: 'https://api.onedriveapi.com/2/auth/token/revoke',
                headers: {
                    'Authorization': 'Bearer ' + this.access_token_
                },
                dataType: 'json'
            }).done(_result => {
                chrome.identity.removeCachedAuthToken({
                    token: this.access_token_
                }, () => {
                    this.access_token_ = null;
                    successCallback();
                });
            }).fail(error => {
                console.log(error);
                errorCallback(error);
            });
        } else {
            errorCallback('Not authorized');
        }
    }

    getUserInfo(successCallback, errorCallback) {
        new HttpFetcher(this, 'getuserInfo', {
            type: 'POST',
            url: 'https://api.onedriveapi.com/2/users/get_current_account',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_
            },
            dataType: 'json'
        }, {}, result => {
            this.uid_ = result.account_id;
            successCallback({
                uid: result.account_id,
                displayName: result.name.display_name
            });
        }, errorCallback).fetch();
    }

    getUid() {
        return this.uid_;
    }

    setUid(uid) {
        this.uid_ = uid;
    }

    getMetadata(path, successCallback, errorCallback) {
        if (path === '/') {
            successCallback({
                isDirectory: true,
                name: '',
                size: 0,
                modificationTime: new Date()
            });
            return;
        }
        const fetchingMetadataObject = this.createFetchingMetadataObject(path);
        new HttpFetcher(this, 'getMetadata', fetchingMetadataObject, fetchingMetadataObject.data, result => {
            const entryMetadata = {
                isDirectory: result['.tag'] === 'folder',
                name: result.name,
                size: result.size || 0,
                modificationTime: result.server_modified ? new Date(result.server_modified) : new Date()
            };
            if (this.canFetchThumbnail(result)) {
                const data = this.jsonStringify({
                    path: path,
                    format: 'jpeg',
                    size: 'w128h128'
                });
                new HttpFetcher(this, 'get_thumbnail', {
                    type: 'GET',
                    url: 'https://graph.microsoft.com/v1.0/me/drive/root',
                    headers: {
                        'Authorization': 'Bearer ' + this.access_token_,
                    },
                    dataType: 'binary',
                    responseType: 'arraybuffer'
                }, data, image => {
                    const fileReader = new FileReader();
                    const blob = new Blob([image], {type: 'image/jpeg'});
                    fileReader.onload = e => {
                        entryMetadata.thumbnail = e.target.result;
                        successCallback(entryMetadata);
                    };
                    fileReader.readAsDataURL(blob);
                }, errorCallback).fetch();
            } else {
                successCallback(entryMetadata);
            }
        }, errorCallback).fetch();
    }

    readDirectory(path, successCallback, errorCallback) {
        const fetchingListFolderObject = this.createFetchingListFolderObject(path === '/' ? '' : path);
        new HttpFetcher(this, 'readDirectory', fetchingListFolderObject, fetchingListFolderObject.data, result => {
            const contents = result.entries;
            this.createEntryMetadatas(contents, 0, [], entries => {
                this.continueReadDirectory(result, entries, successCallback, errorCallback);
            }, errorCallback);
        }, errorCallback).fetch();
    }

    openFile(filePath, requestId, mode, successCallback, _errorCallback) {
        this.writeRequestMap[requestId] = {};
        successCallback();
    };

    closeFile(filePath, openRequestId, mode, successCallback, errorCallback) {
        const writeRequest = this.writeRequestMap[openRequestId];
        if (writeRequest && mode === 'WRITE') {
            const uploadId = writeRequest.uploadId;
            if (uploadId) {
                const data = this.jsonStringify({
                    cursor: {
                        session_id: uploadId,
                        offset: writeRequest.offset
                    },
                    commit: {
                        path: filePath,
                        mode: 'overwrite'
                    }
                });
                new HttpFetcher(this, 'closeFile', {
                    type: 'POST',
                    url: 'https://content.onedriveapi.com/2/files/upload_session/finish',
                    data: new ArrayBuffer(),
                    headers: {
                        'Authorization': 'Bearer ' + this.access_token_,
                        'OneDrive-API-Arg': data,
                        'Content-Type': 'application/octet-stream'
                    },
                    dataType: 'json'
                }, data, _result => {
                    successCallback();
                }, errorCallback).fetch();
            } else {
                successCallback();
            }
        } else {
            successCallback();
        }
    }

    readFile(filePath, offset, length, successCallback, errorCallback) {
        const data = this.jsonStringify({path: filePath});
        const range = 'bytes=' + offset + '-' + (offset + length - 1);
        new HttpFetcher(this, 'readFile', {
            type: 'POST',
            url: 'https://content.onedriveapi.com/2/files/download',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'OneDrive-API-Arg': data,
                'Range': range
            },
            dataType: 'binary',
            responseType: 'arraybuffer'
        }, {
            data: data,
            range: range
        }, result => {
            successCallback(result, false);
        }, errorCallback).fetch();
    }

    createDirectory(directoryPath, successCallback, errorCallback) {
        this.createOrDeleteEntry('create_folder', directoryPath, successCallback, errorCallback);
    };

    deleteEntry(entryPath, successCallback, errorCallback) {
        this.createOrDeleteEntry('delete', entryPath, successCallback, errorCallback);
    };

    moveEntry(sourcePath, targetPath, successCallback, errorCallback) {
        this.copyOrMoveEntry('move', sourcePath, targetPath, successCallback, errorCallback);
    };

    copyEntry(sourcePath, targetPath, successCallback, errorCallback) {
        this.copyOrMoveEntry('copy', sourcePath, targetPath, successCallback, errorCallback);
    };

    createFile(filePath, successCallback, errorCallback) {
        const data = this.jsonStringify({
            path: filePath,
            mode: 'add'
        });
        new HttpFetcher(this, 'createFile', {
            type: 'POST',
            url: 'https://content.onedriveapi.com/2/files/upload',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'OneDrive-API-Arg': data,
                'Content-Type': 'application/octet-stream'
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: 'json'
        }, data, _result => {
            successCallback();
        }, errorCallback).fetch();
    }

    writeFile(filePath, data, offset, openRequestId, successCallback, errorCallback) {
        const writeRequest = this.writeRequestMap[openRequestId];
        if (writeRequest.uploadId) {
            this.doWriteFile(filePath, data, offset, openRequestId, writeRequest, successCallback, errorCallback);
        } else {
            this.startUploadSession(sessionId => {
                writeRequest.uploadId = sessionId;
                this.doWriteFile(filePath, data, offset, openRequestId, writeRequest, successCallback, errorCallback);
            }, errorCallback);
        }
    }

    truncate(filePath, length, successCallback, errorCallback) {
        const data = this.jsonStringify({
            path: filePath
        });
        new HttpFetcher(this, 'truncate', {
            type: 'POST',
            url: 'https://content.onedriveapi.com/2/files/download',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'OneDrive-API-Arg': data,
                'Range': 'bytes=0-'
            },
            dataType: 'binary',
            responseType: 'arraybuffer'
        }, data, data => {
            this.startUploadSession(sessionId => {
                if (length < data.byteLength) {
                    // Truncate
                    const req = {
                        filePath: filePath,
                        data: data.slice(0, length),
                        offset: 0,
                        sentBytes: 0,
                        uploadId: sessionId,
                        hasMore: true,
                        needCommit: true,
                        openRequestId: null
                    };
                    this.sendContents(req, successCallback, errorCallback);
                } else {
                    // Pad with null bytes.
                    const diff = length - data.byteLength;
                    const blob = new Blob([data, new Array(diff + 1).join('\0')]);
                    const reader = new FileReader();
                    reader.addEventListener('loadend', () => {
                        const req = {
                            filePath: filePath,
                            data: reader.result,
                            offset: 0,
                            sentBytes: 0,
                            uploadId: sessionId,
                            hasMore: true,
                            needCommit: true,
                            openRequestId: null
                        };
                        this.sendContents(req, successCallback, errorCallback);
                    });
                    reader.readAsArrayBuffer(blob);
                }
            }, errorCallback);
        }, errorCallback).fetch();
    }

    unmountByAccessTokenExpired() {
        this.onedrive_fs_.unmount(this, () => {
            this.showNotification('The access token has been expired. File system unmounted.');
        });
    }

    // Private functions

    doWriteFile(filePath, data, offset, openRequestId, writeRequest, successCallback, errorCallback) {
        const req = {
            filePath: filePath,
            data: data,
            offset: offset,
            sentBytes: 0,
            uploadId: writeRequest.uploadId,
            hasMore: true,
            needCommit: false,
            openRequestId: openRequestId
        };
        this.sendContents(req, successCallback, errorCallback);
    }

    canFetchThumbnail(metadata) {
        const extPattern = /.\.(jpg|jpeg|png|tiff|tif|gif|bmp)$/i;
        return metadata['.tag'] === 'file' &&
            metadata.size < 20971520 &&
            extPattern.test(metadata.name);
    }

    startUploadSession(successCallback, errorCallback) {
        const data = this.jsonStringify({
            close: false
        });
        new HttpFetcher(this, 'startUploadSession', {
            type: 'POST',
            url: 'https://content.onedriveapi.com/2/files/upload_session/start',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'OneDrive-API-Arg': data,
                'Content-Type': 'application/octet-stream'
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: 'json'
        }, data, result => {
            console.log(result);
            const sessionId = result.session_id;
            successCallback(sessionId);
        }, errorCallback).fetch();
    }

    sendContents(options, successCallback, errorCallback) {
        if (!options.hasMore) {
            if (options.needCommit) {
                const data1 = this.jsonStringify({
                    cursor: {
                        session_id: options.uploadId,
                        offset: options.offset
                    },
                    commit: {
                        path: options.filePath,
                        mode: 'overwrite'
                    }
                });
                new HttpFetcher(this, 'sendContents(1)', {
                    type: 'POST',
                    url: 'https://content.onedriveapi.com/2/files/upload_session/finish',
                    data: new ArrayBuffer(),
                    headers: {
                        'Authorization': 'Bearer ' + this.access_token_,
                        'Content-Type': 'application/octet-stream',
                        'OneDrive-API-Arg': data1
                    },
                    dataType: 'json'
                }, data1, _result => {
                    successCallback();
                }, errorCallback).fetch();
            } else {
                successCallback();
            }
        } else {
            const len = options.data.byteLength;
            const remains = len - options.sentBytes;
            const sendLength = Math.min(CHUNK_SIZE, remains);
            const more = (options.sentBytes + sendLength) < len;
            const sendBuffer = options.data.slice(options.sentBytes, sendLength);
            const data2 = this.jsonStringify({
                cursor: {
                    session_id: options.uploadId,
                    offset: options.offset
                },
                close: false
            });
            new HttpFetcher(this, 'sendContents(2)', {
                type: 'POST',
                url: 'https://content.onedriveapi.com/2/files/upload_session/append_v2',
                dataType: 'json',
                headers: {
                    'Authorization': 'Bearer ' + this.access_token_,
                    'Content-Type': 'application/octet-stream',
                    'OneDrive-API-Arg': data2
                },
                processData: false,
                data: sendBuffer
            }, data2, _result => {
                const writeRequest = this.writeRequestMap[options.openRequestId];
                if (writeRequest) {
                    writeRequest.offset = options.offset + sendLength;
                }
                const req = {
                    filePath: options.filePath,
                    data: options.data,
                    offset: options.offset + sendLength,
                    sentBytes: options.sendBytes + sendLength,
                    uploadId: options.uploadId,
                    hasMore: more,
                    needCommit: options.needCommit,
                    openRequestId: options.openRequestId
                };
                this.sendContents(req, successCallback, errorCallback);
            }, errorCallback).fetch();
        }
    }

    copyOrMoveEntry(operation, sourcePath, targetPath, successCallback, errorCallback) {
        const data = JSON.stringify({
            from_path: sourcePath,
            to_path: targetPath
        });
        new HttpFetcher(this, 'copyOrMoveEntry', {
            type: 'POST',
            url: 'https://api.onedriveapi.com/2/files/' + operation,
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json; charset=utf-8'
            },
            data: data,
            dataType: 'json'
        }, data, _result => {
            successCallback();
        }, errorCallback).fetch();
    }

    createFetchingMetadataObject(path) {
        return {
            type: 'POST',
            url: 'https://api.onedriveapi.com/2/files/get_metadata',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json; charset=utf-8'
            },
            dataType: 'json',
            data: JSON.stringify({
                path: path,
                include_deleted: false
            })
        };
    }

    createFetchingListFolderObject(path) {
        return {
            type: 'POST',
            url: 'https://api.onedriveapi.com/2/files/list_folder',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json; charset=utf-8'
            },
            dataType: 'json',
            data: JSON.stringify({
                path: path,
                recursive: false,
                include_deleted: false
            })
        };
    }

    createFetchingContinueListFolderObject(cursor) {
        return {
            type: 'POST',
            url: 'https://api.onedriveapi.com/2/files/list_folder/continue',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json; charset=utf-8'
            },
            dataType: 'json',
            data: JSON.stringify({
                cursor: cursor
            })
        };
    }

    continueReadDirectory(readDirectoryResult, entries, successCallback, errorCallback) {
        if (readDirectoryResult.has_more) {
            const fetchingContinueListFolderObject = this.createFetchingContinueListFolderObject(readDirectoryResult.cursor);
            const data = fetchingContinueListFolderObject.data;
            new HttpFetcher(this, 'continueReadDirectory', fetchingContinueListFolderObject, data, result => {
                const contents = result.entries;
                this.createEntryMetadatas(contents, 0, entries, entries => {
                    this.continueReadDirectory(result, entries, successCallback, errorCallback);
                }, errorCallback);
            }, errorCallback).fetch();
        } else {
            successCallback(entries);
        }
    }

    createOrDeleteEntry(operation, path, successCallback, errorCallback) {
        const data = JSON.stringify({
            path: path
        });
        new HttpFetcher(this, 'createOrDeleteEntry', {
            type: 'POST',
            url: 'https://api.onedriveapi.com/2/files/' + operation,
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json; charset=utf-8'
            },
            data: data,
            dataType: 'json'
        }, data, _result => {
            successCallback();
        }, errorCallback).fetch();
    }

    showNotification(message) {
        chrome.notifications.create('', {
            type: 'basic',
            title: 'File System for OneDrive',
            message: message,
            iconUrl: '/icons/48.png'
        }, _notificationId => {
        });
    }
    normalizeName(name) {
        if (name === "root") {
            return "";
        } else {
            return name;
        }
    };

    createEntryMetadatas(contents, index, entryMetadatas, successCallback, errorCallback) {
        if (contents.length === index) {
            successCallback(entryMetadatas);
        } else {
            const content = contents[index];
            const entryMetadata = {
                isDirectory: content['.tag'] === 'folder',
                name: content.name,
                size: content.size || 0,
                modificationTime: content.server_modified ? new Date(content.server_modified) : new Date()
            };
            entryMetadatas.push(entryMetadata);
            this.createEntryMetadatas(contents, ++index, entryMetadatas, successCallback, errorCallback);
        }
    };

    initializeJQueryAjaxBinaryHandler() {
        $.ajaxTransport('+binary', (options, originalOptions, jqXHR) => {
            if (window.FormData &&
                ((options.dataType && (options.dataType === 'binary')) ||
                 (options.data && ((window.ArrayBuffer && options.data instanceof ArrayBuffer) ||
                                   (window.Blob && options.data instanceof Blob))))) {
                return {
                    send: (_, callback) => {
                        const xhr = new XMLHttpRequest(),
                            url = options.url,
                            type = options.type,
                            dataType = options.responseType || 'blob',
                            data = options.data || null;
                        xhr.addEventListener('load', () => {
                            const data = {};
                            data[options.dataType] = xhr.response;
                            callback(xhr.status, xhr.statusText, data, xhr.getAllResponseHeaders());
                        });
                        xhr.open(type, url, true);
                        for (let key in options.headers) {
                            xhr.setRequestHeader(key, options.headers[key]);
                        }
                        xhr.responseType = dataType;
                        xhr.send(data);
                    },
                    abort: () => {
                        jqXHR.abort();
                    }
                };
            }
        });
    }

    getNameFromPath(path) {
        const names = path.split('/');
        const name = names[names.length - 1];
        return name;
    };

    escapeUnicode (str) {
        const result = str.replace(/\W/g, function(c) {
            if (c === '/') {
                return c;
            } else {
                return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
            }
        });
        return result.split('"').join('\\"');
    }

    jsonStringify(obj) {
        const entries = [];
        Object.keys(obj).map((key, _index) => {
            let entry = '"' + key + '":';
            const value = obj[key];
            if (typeof value === 'string') {
                entry += '"' + this.escapeUnicode(value).split('"').join('\\"') + '"';
            } else if (typeof value === 'object') {
                entry += this.jsonStringify(value);
            } else if (typeof value === 'boolean') {
                entry += value ? 'true' : 'false';
            } else if (typeof value === 'number') {
                entry += String(value);
            }
            entries.push(entry);
        });
        return '{' + entries.join(',') + '}';
    }

};

// Export
window.OneDriveClient = OneDriveClient;