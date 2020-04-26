'use strict';

let storedAppInfo = null;

let appInfo = {
    "clientId": "7bee6942-63fb-4fbd-88d6-00394941de08",
    "clientSecret": "SECRET GOES HERE",
    "redirectUrl": chrome.identity.getRedirectURL(""),
    "scopes": "files.readwrite.all offline_access user.read",
    "authServiceUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    "tokenServiceUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/token"
};

const CHUNK_SIZE = 1024 * 1024 * 4; // 4MB

class OneDriveClient {

    // Constructor

    constructor(onedriveFS) {
        this.onedrive_fs_ = onedriveFS;
        this.access_token_ = null;
        this.refresh_token_ = null;
        this.uid_ = null;
        this.writeRequestMap = {};
        this.initializeJQueryAjaxBinaryHandler();
    };

    // Public functions

    authorize(successCallback, errorCallback) {
        this.access_token_ = this.getTokenFromCookie('access');
        if (this.access_token_) {
            console.log('already good');
            successCallback();
        }
        else {
            var appInfo = this.getAppInfo();
            var AUTH_URL = appInfo.authServiceUrl +
                "?client_id=" + appInfo.clientId +
                "&response_type=code" +
                "&prompt=select_account" +
                "&redirect_uri=" + encodeURIComponent(appInfo.redirectUrl);
    
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
                    var codeInfo = this.getCodeFromUrl(redirectUrl);
                    console.log("AJAX Start");
                    console.log("CODE: "+codeInfo.code);
                    // Get Token via POST
                    $.ajax({
                        type: "POST",
                        url: appInfo.tokenServiceUrl,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        responseType: "arraybuffer",
                        data: "client_id=" + appInfo.clientId +
                            "&redirect_uri=" + appInfo.redirectUrl +
                            "&client_secret=" +  appInfo.clientSecret +
                            "&code=" + codeInfo.code +
                            "&grant_type=authorization_code",
                        dataType: "text"
                    }).done(jsonData => {
                        console.log("OK-jsonData");
                        console.log(jsonData);
                        var tokenInfo = JSON.parse(jsonData);
                        console.log("tokenInfo");
                        console.log(tokenInfo);
    
                        // Process Token - WEAREHERE
    
                        this.access_token_ = tokenInfo.access_token;
                        this.refresh_token_ = tokenInfo.refresh_token;
                        this.token_expiry_ = parseInt(tokenInfo.expires_in);

                        console.log(this.access_token_);
    
                        if (this.access_token_)
                        {
                            //let driveInfo = this.getDriveData(successCallback,errorCallback);
                            //console.log(driveInfo);
                            this.setCookie(this.access_token_, this.refresh_token_, this.token_expiry_);
                            console.log("cookie has been set");
                            successCallback();
                        } else {
                            console.log("This error is here. 1");
                            errorCallback("failed to get an access token ");
                        }
                    }).fail(error => {
                        console.log("AJAX Failed");
                        console.log(error);
                        errorCallback(error);
                    })
                } else {
                    errorCallback("Authorization failed");
                }
            })
        }
    };

    refreshToken(successCallback, errorCallback){
        this.refresh_token_ = this.getTokenFromCookie('refresh');
        var appInfo = this.getAppInfo();
        var fileSystemId = 'onedrivefs://' + this.uid_;
        var thisvalue = this.onedrive_fs_.fileSystemId;

        console.log('thisvalue:');
        console.log(thisvalue);

        console.log('appInfo:');
        console.log(appInfo);

        console.log('fileSystemId:');
        console.log(fileSystemId);

        this.onedrive_fs_.getMountedCredential(fileSystemId, credential => {
            if (credential) {
                console.log('credentials:');
                console.log(credential);
                this.setTokens(credential.accessToken, credential.refreshToken);
                //this.access_token_ = credential.accessToken;
                //this.refresh_token_ = credential.refreshToken;

                var data = "client_id=" + appInfo.clientId +
                    "&scope=files.readwrite.all offline_access user.read" +
                    "&refresh_token=" + this.refresh_token_ + 
                    "&redirect_uri=" + appInfo.redirectUrl +
                    "&grant_type=refresh_token" +
                    "&client_secret=" + appInfo.clientSecret;

                console.log('dataXXFssL');
                console.log(data);
                new HttpFetcher(this, 'refreshToken', {
                    type: 'POST',
                    url: appInfo.tokenServiceUrl,
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    responseType: "arraybuffer",
                    data: data,
                    dataType: "text"

                }, {}, result => {
                    if (result) {
                        var tokenInfo = JSON.parse(result);
        
                        console.log("OK-result");
                        console.log(result);
                        console.log("tokenInfo");
                        console.log(tokenInfo);
        
                        // Process Token - WEAREHERE
        
                        this.access_token_ = tokenInfo.access_token;
                        this.refresh_token_ = tokenInfo.refresh_token;
                        this.token_expiry_ = parseInt(tokenInfo.expires_in);
                        
                        this.onedrive_fs_.registerMountedCredential(
                            fileSystemId, this.access_token_, this.refresh_token_, () => {
                            successCallback();
                        });
                        this.setCookie(this.access_token_, this.refresh_token_, this.token_expiry_);
                        console.log("cookie has been set");
        
                        successCallback();
                    }
                    else {
                        this.unmountByAccessTokenExpired();
                        errorCallback('REFRESH_TOKEN_FAILED');
                    }
                }, errorCallback).fetch();
            }
            else {
                errorCallback('CREDENTIAL_NOT_FOUND');
            }
        });
    }
    
    getAppInfo() {
        if (storedAppInfo) {
            return storedAppInfo;
        }
        
        storedAppInfo = appInfo;
        return storedAppInfo;
    };

    setCookie() {
        var expiration = new Date();
        expiration.setTime(expiration.getTime() + this.token_expiry_ * 1000);
        var cookie = "accessToken=" + this.access_token_ +"; refreshToken=" + this.refresh_token_ +"; path=/; expires=" + expiration.toUTCString()+"; driveId=";
        if (document.location.protocol.toLowerCase() === "https") {
            cookie = cookie + ";secure";
        }

        document.cookie = cookie;
    };  

    getTokenFromCookie(type) {
        var cookies = document.cookie;
        var name = type + "Token=";
        console.log('cookies:::');
        console.log(cookies);
        console.log(name);
        var start = cookies.indexOf(name);
        console.log('I am getting Token type: ' + type);
        if (start >= 0) {
            start += name.length;
            var end = cookies.indexOf(';', start);
            if (end < 0) {
                end = cookies.length;
            }
            else {
                //var postCookie = cookies.substring(end);
            }

            var value = cookies.substring(start, end);
            console.log(type + 'Token=' + value);
            return value;
        }

        return "";
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

    getToken(type) {
        switch(type){
            case 'refreshToken':
                return this.refresh_token_;
            default:
                return this.access_token_;
        }
    };

    setTokens(accessToken, refreshToken) {
        this.access_token_ = accessToken;
        this.refresh_token_ = refreshToken;
    };

    unauthorize(successCallback, errorCallback) {
        if (this.access_token_) {
            //MSFT doesn't support this; we need to delete the token instead.
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
            })
        } else {
            errorCallback('Not authorized');
        }
    }

    getDriveData(successCallback, errorCallback) {
        console.log("I got this far at least...");
        new HttpFetcher(this, 'getDriveData', {
            type: 'GET',
            url: 'https://graph.microsoft.com/v1.0/me/drive',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_
            },
            dataType: 'json'
        }, {}, result => {
            this.uid_ = result.id;
            successCallback({
                id: result.id,
                name: this.normalizeName(result.name),
                type: result.driveType,
                quota: result.quota
            });
        }, errorCallback).fetch();
    }

    getUserInfo(successCallback, errorCallback) {
        console.log("I got this far at least...");
        new HttpFetcher(this, 'getuserInfo', {
            type: 'GET',
            url: 'https://graph.microsoft.com/v1.0/me',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_
            },
            dataType: 'json'
        }, {}, result => {
            this.uid_ = result.id;
            successCallback({
                id: result.id,
                displayName: result.displayName
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
        console.log('PATH: ');
        console.log(path);
        if (path === '/') {
            console.log('path is === /');
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
            console.log('metadataobject - isDirectory:' + ('folder' in result) + 'XXX');
            const entryMetadata = {
                isDirectory: ('folder' in result),
                name: result.name,
                size: result.size || 0,
                modificationTime: result.lastModifiedDateTime ? new Date(result.lastModifiedDateTime) : new Date()
            };
            if (this.canFetchThumbnail(result)) {
                const data = JSON.stringify({
                    path: path,
                    format: 'jpeg',
                    size: 'w128h128'
                });
                new HttpFetcher(this, 'get_thumbnail', {
                    type: 'GET',
                    url: 'https://graph.microsoft.com/v1.0/me/drive/root:' + path + ':/thumbnails/0/medium/content',
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
            const contents = result.value;
            console.log(contents);
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
        if (writeRequest && writeRequest.mode === "WRITE") {
            var localFileName = writeRequest.localFileName;
            var errorHandler = () => {
                console.log("closeFile failed");
                errorCallback("FAILED");
            };
            window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
            window.requestFileSystem(window.TEMPORARY, 100 * 1024 * 1024, (fs) => {
                fs.root.getFile(localFileName, {}, (fileEntry) => {
                    fileEntry.file((file) => {
                        //var totalSize = file.size;
                        console.log("WRITE FILE TO REMOTE", localFileName, fileEntry, file);
                        var reader = new FileReader();
                        reader.addEventListener("loadend", () => {
                            this.sendSimpleUpload({
                                filePath: filePath,
                                data: reader.result
                            }, () => {
                                console.log("REMOVING TEMPORARY FILE");
                                fileEntry.remove(() => {
                                    successCallback();
                                }, errorHandler);
                            }, errorCallback);
                        });
                        reader.readAsArrayBuffer(file);
                    });
                }, errorHandler);
            }, errorHandler);
        } else {
            successCallback();
        }
    }

    readFile(filePath, offset, length, successCallback, errorCallback) {
        const data = JSON.stringify({path: filePath});
        if (offset > 0) {
            console.log("readFile:: Offset reads are not currently supported");
            errorCallback();
            return;
        }
        const range = 'bytes=' + offset + '-' + (offset + length - 1);
        new HttpFetcher(this, 'readFile', {
            type: 'GET',
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + filePath + "?select=id,@microsoft.graph.downloadUrl",
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
            }
        }, {
            data: data,
            range: range
        }, result => {
            console.log("starting download")
            console.log(result);
            new HttpFetcher(this, 'readFile', {
                type: 'GET',
                url: result["@microsoft.graph.downloadUrl"],
                dataType: 'binary',
                responseType: 'arraybuffer'
            }, {
                data: data,
                range: range
            }, result2 => {
                successCallback(result2, false);
            }, errorCallback).fetch();
        }, errorCallback).fetch();
    }

    createDirectory(directoryPath, successCallback, errorCallback) {
        this.createOrDeleteEntry('create_folder', directoryPath, successCallback, errorCallback);
    };

    deleteEntry(entryPath, successCallback, errorCallback) {
        this.createOrDeleteEntry('delete', entryPath, successCallback, errorCallback);
    };

    moveEntry(sourcePath, targetPath, successCallback, errorCallback) {
        this.doMoveEntry('move', sourcePath, targetPath, successCallback, errorCallback);
    };

    copyEntry(sourcePath, targetPath, successCallback, errorCallback) {
        console.log('copy start');
        this.doCopyEntry('copy', sourcePath, targetPath, successCallback, errorCallback);
        console.log('really done copy');
    };

    createFile(filePath, successCallback, errorCallback) {
        const data = this.jsonStringify({
            path: filePath,
            mode: 'add'
        });
        new HttpFetcher(this, 'createFile', {
            type: 'PUT',
            url: 'https://graph.microsoft.com/v1.0/me/drive/root:' + filePath + ':/content',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
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
        var writeRequest = this.writeRequestMap[openRequestId];
        writeRequest.mode = "WRITE";
        writeRequest.filePath = filePath;
        var localFileName = String(openRequestId);
        writeRequest.localFileName = localFileName;

        var errorHandler = () => {
            console.log("writeFile failed");
            errorCallback("FAILED");
        };
        window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
        window.requestFileSystem(window.TEMPORARY, 100 * 1024 * 1024, (fs) => {
            fs.root.getFile(localFileName, {create: true, exclusive: false}, (fileEntry) => {
                console.log("WRITE FILE TO TEMP", localFileName, fileEntry);
                fileEntry.createWriter((fileWriter) => {
                    fileWriter.onwriteend = () => {
                        successCallback();
                    };
                    fileWriter.onerror = errorHandler;
                    fileWriter.seek(offset);
                    var blob = new Blob([data]);
                    fileWriter.write(blob);
                }, errorHandler);
            }, errorHandler);
        }, errorHandler);
    }

    truncate(filePath, length, successCallback, errorCallback) {
        console.log('doing truncate');
        const data = this.jsonStringify({
            path: filePath
        });
        new HttpFetcher(this, 'truncate', {
            type: 'GET',
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + filePath + ":/content",
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Range': 'bytes=0-'
            },
            dataType: 'binary',
            responseType: 'arraybuffer'
        }, data, data => {
            if (length < data.byteLength) {
                // Truncate
                var req = {
                    filePath: filePath,
                    data: data.slice(0, length)
                };
                this.sendSimpleUpload(this, req, successCallback, errorCallback);
            } else {
                // Pad with null bytes.
                var diff = length - data.byteLength;
                var blob = new Blob([data, new Array(diff + 1).join('\0')]);
                var reader = new FileReader();
                reader.addEventListener("loadend", function() {
                    var req = {
                        filePath: filePath,
                        data: reader.result
                    };
                    this.sendSimpleUpload(this, req, successCallback, errorCallback);
                });
                reader.readAsArrayBuffer(blob);
            }
        }, errorCallback).fetch();
    }

    sendSimpleUpload(options, successCallback, errorCallback) {
        $.ajax({
            type: "PUT",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + options.filePath + ":/content",
            dataType: "json",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/octet-stream"
            },
            processData: false,
            data: options.data
        }).done(result => {
            console.log(result);
            successCallback();
        }).fail(error => {
            console.log(error);
            errorCallback("FAILED");
        });
    };

    createUploadSession(filePath, successCallback, errorCallback) {
        const data = this.jsonStringify({
            path: filePath,
            mode: 'add'
        });
        new HttpFetcher(this, 'createUploadSession', {
            type: 'POST', 
            url: 'https://graph.microsoft.com/v1.0/me/drive/items/:' + filePath + ':/content',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json'
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: 'json'
        }, data, _result => {
            console.log('creating an upload session');
            console.log(result);
            const uploadUrl = result.uploadUrl;
            successCallback(uploadUrl);
        }, errorCallback).fetch();
    }

    unmountByAccessTokenExpired() {
        this.onedrive_fs_.unmount(this, () => {
            this.showNotification('The access token has been expired. File system unmounted.');
        });
    }

    // Private functions

    canFetchThumbnail() {
        return false;
    }

    doCopyEntry(operation, sourcePath, targetPath, successCallback, errorCallback) {
        var sourceLastSlashPos = sourcePath.lastIndexOf("/");
        var sourceDir = sourcePath.substring(0, sourceLastSlashPos);
        var targetLastSlashPos = targetPath.lastIndexOf("/");
        var targetDir = targetPath.substring(0, targetLastSlashPos);
        var data = {};
        if (sourceDir !== targetDir) {
            console.log('source is not target');
            data.parentReference = {
                path: '/drive/root:' + targetDir
            };
        }
        new HttpFetcher(this, 'doCopyEntry', {
            type: 'POST',
            url: 'https://graph.microsoft.com/v1.0/me/drive/root:' + sourcePath + ':/copy',
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json',
                'Prefer': 'respond-async'
            },
            data: JSON.stringify(data),
            dataType: 'json'
        }, data, _result => {
            console.log('donething');
            console.log(_result);
            console.log(data.error);
            successCallback();
        }, error => {
            if (error.status === 202) {
                successCallback();
            } else {
                errorCallback();
            }
        }).fetch();
        console.log('done copy');
    }

    doMoveEntry(operation, sourcePath, targetPath, successCallback, errorCallback) {
        var sourceLastSlashPos = sourcePath.lastIndexOf("/");
        var sourceDir = sourcePath.substring(0, sourceLastSlashPos);
        var sourceName = sourcePath.substring(sourceLastSlashPos + 1);
        var targetLastSlashPos = targetPath.lastIndexOf("/");
        var targetDir = targetPath.substring(0, targetLastSlashPos);
        var targetName = targetPath.substring(targetLastSlashPos + 1);
        var data = {};
        if (sourceName !== targetName) {
            data.name = targetName;
        }
        if (sourceDir !== targetDir) {
            data.parentReference = {
                path: "/drive/root:" + targetDir
            };
        }

        new HttpFetcher(this, 'doMoveEntry', {
            type: "PATCH",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + sourcePath,
            headers: {
                'Authorization': 'Bearer ' + this.access_token_,
                'Content-Type': 'application/json; charset=utf-8'
            },
            data: JSON.stringify(data),
            dataType: 'json'
        }, data, _result => {
            successCallback();
        }, errorCallback).fetch();
    }

    createFetchingMetadataObject(path) {
        var url = "https://graph.microsoft.com/v1.0/me/drive/root";
        if (path !=="") {
            url += ":" + path;
        }
        return {
            type: 'GET',
            url: url,
            headers: {
                'Authorization': 'Bearer ' + this.access_token_
            },
            dataType: 'json',
            data: JSON.stringify({
                path: path,
                include_deleted: false
            })
        };
    }

    createFetchingListFolderObject(path) {
        var url = "https://graph.microsoft.com/v1.0/me/drive/root";
        if (path !=="") {
            url += ":" + path + ":";
        }
        return {
            type: 'GET',
            url: url + "/children",
            headers: {
                'Authorization': 'Bearer ' + this.access_token_
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
            console.log('continuereaddir');
            console.log(fetchingContinueListFolderObject);
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
        var url = "https://graph.microsoft.com/v1.0/me/drive/root";
        var data = JSON.stringify({
            path: path
        });
        var splitPath = path.split("/");
        console.log('operation is below')
        switch(operation){
            case 'create_folder':
                console.log('making a directory');
                data = JSON.stringify({
                    name: splitPath.pop(),
                    folder: {}
                });
                if (splitPath.join("/").length > 0) {
                    url += ":/" + splitPath.join("/") + ":";
                }
                url += "/children";
                operation = 'POST';
                break;
            case 'delete':
                console.log('deleting a file');
                url += ":" + path;
                break;
            default:
                console.log('making something else');
                url += ":" + path + ":/content";
                operation = 'PUT'    
        }
        console.log("operation is: " + operation);
        new HttpFetcher(this, 'createOrDeleteEntry', {
            type: operation,
            url: url,
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
    }

    createEntryMetadatas(contents, index, entryMetadatas, successCallback, errorCallback) {
        if (contents.length === index) {
            successCallback(entryMetadatas);
        } else {
            const content = contents[index];
            console.log('createEntryMetadatas - isDirectory:' + ("folder" in content) + "YYY");
            const entryMetadata = {
                isDirectory: ('folder' in content),
                name: content.name,
                size: content.size || 0,
                modificationTime: content.lastModifiedDateTime ? new Date(content.lastModifiedDateTime) : new Date()
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
