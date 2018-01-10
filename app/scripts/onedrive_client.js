"use strict";

(function() {

    // Private fields

    // For Development
    // var CLIENT_ID = "000000004C142702";
    // For Production
    // var CLIENT_ID = "000000004014A800";

    var storedAppInfo = null;

    var appInfo = {
        "clientId": "7bee6942-63fb-4fbd-88d6-00394941de08",
        "clientSecret": "wetcQA3[)aosEYTCG6979?]",
        "redirectUri": chrome.identity.getRedirectURL(""),
        "scopes": "files.readwrite.all offline_access",
        "authServiceUri": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "tokenServiceUri": "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    };

    var CHUNK_SIZE = 1024 * 1024 * 4; // 4MB

    // Constructor

    var OneDriveClient = function(onedriveFS) {
        this.onedrive_fs_ = onedriveFS;
        this.access_token_ = null;
        this.writeRequestMap = {};
        initializeJQueryAjaxBinaryHandler.call(this);
        OneDriveClient.prototype.provideAppInfo(appInfo);
    };


    // Public functions

    OneDriveClient.prototype.authorize = function(successCallback, errorCallback) {
        this.access_token_ = OneDriveClient.prototype.getTokenFromCookie();
        if (this.access_token_) {
            successCallback();
        }
        else {
            var appInfo = OneDriveClient.prototype.getAppInfo();
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
            }, function(redirectUrl) {
                if (chrome.runtime.lastError) {
                    errorCallback(chrome.runtime.lastError.message);
                    return;
                }
                if (redirectUrl) {
                    var codeInfo = OneDriveClient.prototype.getCodeFromUrl(redirectUrl);
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
                            OneDriveClient.prototype.setCookie(this.access_token_, this.refresh_token_, this.token_expiry_);
                            this.driveData = OneDriveClient.prototype.getDriveData();
                            successCallback();
                        } else {
                            console.log("This error is here. 1");
                            errorCallback("failed to get an access token ");
                        }
                    }.bind(this)).fail(function(error) {
                        handleError.call(this, error, successCallback, errorCallback);
                    }.bind(this));
                } else {
                    errorCallback("Authorization failed");
                }
            }.bind(this));
        }
    };

    OneDriveClient.prototype.getDriveData = function(successCallback, errorCallback) {
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
                name: normalizeName.call(this, result.name),
                type: result.driveType,
                quota: result.quota
            };
        
            console.log("drive data:");
            console.log(driveData);
            console.log("drive data end:");
            //return driveData;
            successCallback(result, false);
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.getToken = function(successCallback, errorCallback) {
        var appInfo = OneDriveClient.prototype.getAppInfo();
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
        }, function(redirectUrl) {
            if (chrome.runtime.lastError) {
                errorCallback(chrome.runtime.lastError.message);
                return;
            }
            if (redirectUrl) {
                var tokenInfo = OneDriveClient.prototype.getTokenInfoFromJSON(redirectUrl);
                this.access_token_ = tokenInfo.access_token;
                this.refresh_token_ = tokenInfo.refresh_token;
                this.token_expiry_ = parseInt(tokenInfo.expires_in);
                if (this.access_token_)
                {
                    OneDriveClient.prototype.setCookie(this.access_token_, this.token_expiry_);
                    successCallback();
                } else {
                    errorCallback("failed to get an access token ");
                }
            } else {
                errorCallback("Authorization failed");
            }
        }.bind(this));
    };

    OneDriveClient.prototype.refreshToken = function(successCallback, errorCallback) {
        var appInfo = OneDriveClient.prototype.getAppInfo();
        console.log("appInfo");
        console.log(appInfo);

        this.refresh_token_ = OneDriveClient.prototype.getRefreshTokenFromCookie();

        // Get Refresh Token via POST
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
                "&refresh_token=" + this.refresh_token_ +
                "&grant_type=refresh_token",
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

            successCallback();
        }.bind(this)).fail(function(error) {
            this.onedrive_fs_.doUnmount(function() {
                errorCallback("failed to get a refresh token ");
                chrome.notifications.create("", {
                    type: "basic",
                    title: "FileSystem for OneDrive",
                    message: "Failed to refresh the access token. File system unmounted.",
                    iconUrl: "/icons/48.png"
                }, function(notificationId) {
                }.bind(this));
            }.bind(this));
        }.bind(this));

        if (this.access_token_)
        {
            OneDriveClient.prototype.setCookie(this.access_token_, this.refresh_token_, this.token_expiry_);
            successCallback();
        } else {
            this.onedrive_fs_.doUnmount(function() {
                errorCallback("failed to get an access token ");
                chrome.notifications.create("", {
                    type: "basic",
                    title: "FileSystem for OneDrive",
                    message: "Failed to get a new access token. File system unmounted.",
                    iconUrl: "/icons/48.png"
                }, function(notificationId) {
                }.bind(this));
            }.bind(this));
            errorCallback("failed to get an access token ");
        }
    };

    OneDriveClient.prototype.getTokenInfoFromJSON = function(jsonData) {
        if (jsonData) {
            console.log(jsonData);

            /*    '{' + tokenResponse.replace(/([^=]+)=([^&]+)&?/g, '"$1":"$2",').slice(0,-1) + '}',*/
            var tokenInfo = JSON.parse(jsonData);
            console.log("tokenInfo");
            console.log(tokenInfo);
            return tokenInfo;
        }
        else {
            console.log("failed to receive tokenInfo");
        }
    };

    OneDriveClient.prototype.getCodeFromUrl = function(redirectUrl) {
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

    OneDriveClient.prototype.getTokenFromCookie = function() {
        var cookies = document.cookie;
        var name = "odauth=";
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

    OneDriveClient.prototype.getRefreshTokenFromCookie = function() {
        var cookies = document.cookie;
        var name = "refreshToken=";
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

    OneDriveClient.prototype.setCookie = function() {
        var expiration = new Date();
        expiration.setTime(expiration.getTime() + this.token_expiry_ * 1000);
        var cookie = "odauth=" + this.access_token_ +"; refreshToken=" + this.refresh_token_ +"; path=/; expires=" + expiration.toUTCString();

        if (document.location.protocol.toLowerCase() === "https") {
            cookie = cookie + ";secure";
        }

        document.cookie = cookie;
    };

    OneDriveClient.prototype.getAppInfo = function() {
        if (storedAppInfo) {
            return storedAppInfo;
        }

        var scriptTag = document.getElementById("odauth");
        if (!scriptTag) {
            console.log("the script tag for odauth.js should have its id set to 'odauth'");
        }

        var clientId = scriptTag.getAttribute("clientId");
        if (!clientId) {
            console.log("the odauth script tag needs a clientId attribute set to your application id");
        }

        var scopes = scriptTag.getAttribute("scopes");
        // scopes aren't always required, so we don't warn here.

        var redirectUri = scriptTag.getAttribute("redirectUri");
        if (!redirectUri) {
            console.log("the odauth script tag needs a redirectUri attribute set to your redirect landing url");
        }

        var resourceUri = scriptTag.getAttribute("resourceUri");

        var authServiceUri = scriptTag.getAttribute("authServiceUri");
        if (!authServiceUri) {
            console.log("the odauth script tag needs an authServiceUri attribtue set to the oauth authentication service url");
        }

        var appInfo = {
            "clientId": clientId,
            "scopes": scopes,
            "redirectUri": redirectUri,
            "resourceUri": resourceUri,
            "authServiceUri": authServiceUri
        };

        storedAppInfo = appInfo;

        return appInfo;
    };

    OneDriveClient.prototype.provideAppInfo = function(obj) {
        storedAppInfo = obj;
    };

    OneDriveClient.prototype.getAccessToken = function() {
        return this.access_token_;
    };

    OneDriveClient.prototype.setAccessToken = function(accessToken) {
        this.access_token_ = accessToken;
    };

    OneDriveClient.prototype.unauthorize = function(successCallback, errorCallback) {
        if (this.access_token_) {
            chrome.identity.removeCachedAuthToken({
                token: this.access_token_
            }, function() {
                this.access_token_ = null;
                successCallback();
            }.bind(this));
        } else {
            errorCallback("Not authorized");
        }
    };

    OneDriveClient.prototype.getMetadata = function(path, successCallback, errorCallback) {
        var url = "https://graph.microsoft.com/v1.0/me/drive/root";
        if (path !== "/") {
            url += ":" + path;
        }
        $.ajax({
            type: "GET",
            url: url,
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            console.log(result);
            var entryMetadata = {
                isDirectory: isDirectoryEntry.call(this, result),
                name: normalizeName.call(this, result.name),
                size: result.size,
                modificationTime: new Date(result.lastModifiedDateTime)
            };
            if (!isDirectoryEntry.call(this, result)) {
                entryMetadata.mimeType = result.mime_type;
            }
            successCallback(entryMetadata);
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.readDirectory = function(path, successCallback, errorCallback) {
        var url = "https://graph.microsoft.com/v1.0/me/drive/root";
        if (path !== "/") {
            url += ":" + path + ":";
        }
        $.ajax({
            type: "GET",
            url: url + "/children",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            console.log(result);
            var contents = result.value;
            createEntryMetadatas.call(this, contents, 0, [], successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.openFile = function(filePath, requestId, mode, successCallback, errorCallback) {
        this.writeRequestMap[requestId] = {
            mode: mode
        };
        successCallback();
    };

    OneDriveClient.prototype.closeFile = function(filePath, openRequestId, successCallback, errorCallback) {
        var writeRequest = this.writeRequestMap[openRequestId];
        if (writeRequest && writeRequest.mode === "WRITE") {
            var localFileName = writeRequest.localFileName;
            var errorHandler = function(error) {
                console.log("writeFile failed");
                console.log(error);
                errorCallback("FAILED");
            }.bind(this);
            window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
            window.requestFileSystem(window.TEMPORARY, 100 * 1024 * 1024, function(fs) {
                fs.root.getFile(localFileName, {}, function(fileEntry) {
                    fileEntry.file(function(file) {
                        var totalSize = file.size;
                        var reader = new FileReader();
                        reader.addEventListener("loadend", function() {
                            sendSimpleUpload.call(this, {
                                filePath: filePath,
                                data: reader.result
                            }, function() {
                                fileEntry.remove(function() {
                                    successCallback();
                                }.bind(this), errorHandler);
                            }.bind(this), errorCallback);
                        }.bind(this));
                        reader.readAsArrayBuffer(file);
                    }.bind(this));
                }.bind(this), errorHandler);
            }.bind(this), errorHandler);
        } else {
            successCallback();
        }
    };

    OneDriveClient.prototype.readFile = function(filePath, offset, length, successCallback, errorCallback) {
        $.ajax({
            type: "GET",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + filePath + ":/content",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Range": "bytes=" + offset + "-" + (offset + length - 1)
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }).done(function(result) {
            console.log(result);
            successCallback(result, false);
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.createDirectory = function(directoryPath, successCallback, errorCallback) {
        var lastSlashPos = directoryPath.lastIndexOf("/");
        var parent = directoryPath.substring(0, lastSlashPos);
        var name = directoryPath.substring(lastSlashPos + 1);
        var url = "https://graph.microsoft.com/v1.0/me/drive/root";
        if (parent !== "") {
            url += ":" + parent + ":";
        }
        $.ajax({
            type: "POST",
            url: url + "/children",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json"
            },
            data: JSON.stringify({
                name: name,
                folder: {}
            }),
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.deleteEntry = function(entryPath, successCallback, errorCallback) {
        $.ajax({
            type: "DELETE",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + entryPath,
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.moveEntry = function(sourcePath, targetPath, successCallback, errorCallback) {
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
        $.ajax({
            type: "PATCH",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + sourcePath,
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json"
            },
            data: JSON.stringify(data),
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.copyEntry = function(sourcePath, targetPath, successCallback, errorCallback) {
        var sourceLastSlashPos = sourcePath.lastIndexOf("/");
        var sourceDir = sourcePath.substring(0, sourceLastSlashPos);
        var targetLastSlashPos = targetPath.lastIndexOf("/");
        var targetDir = targetPath.substring(0, targetLastSlashPos);
        var data = {};
        if (sourceDir !== targetDir) {
            data.parentReference = {
                path: "/drive/root:" + targetDir
            };
        }
        $.ajax({
            type: "POST",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + sourcePath + ":/action.copy",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json",
                "Prefer": "respond-async"
            },
            data: JSON.stringify(data),
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            if (error.status === 202) {
                successCallback();
            } else {
                handleError.call(this, error, successCallback, errorCallback);
            }
        }.bind(this));
    };

    OneDriveClient.prototype.createFile = function(filePath, successCallback, errorCallback) {
        $.ajax({
            type: "PUT",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + filePath + ":/content",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/octet-stream"
            },
            processData: false,
            data: new ArrayBuffer(),
            dataType: "json"
        }).done(function(result) {
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    OneDriveClient.prototype.writeFile = function(filePath, data, offset, openRequestId, successCallback, errorCallback) {
        var writeRequest = this.writeRequestMap[openRequestId];
        writeRequest.filePath = filePath;
        var localFileName = String(openRequestId);
        writeRequest.localFileName = localFileName;
        var errorHandler = function(error) {
            console.log("writeFile failed");
            console.log(error);
            errorCallback("FAILED");
        }.bind(this);
        window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
        window.requestFileSystem(window.TEMPORARY, 100 * 1024 * 1024, function(fs) {
            fs.root.getFile(localFileName, {create: true, exclusive: false}, function(fileEntry) {
                fileEntry.createWriter(function(fileWriter) {
                    fileWriter.onwriteend = function(e) {
                        successCallback();
                    }.bind(this);
                    fileWriter.onerror = errorHandler;
                    fileWriter.seek(offset);
                    var blob = new Blob([data]);
                    fileWriter.write(blob);
                }.bind(this), errorHandler);
            }.bind(this),
            errorHandler);
        }.bind(this),
        errorHandler);
    };

    OneDriveClient.prototype.truncate = function(filePath, length, successCallback, errorCallback) {
        $.ajax({
            type: "GET",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + filePath + ":/content",
            headers: {
                "Authorization": "Bearer " + this.access_token_
            },
            dataType: "binary",
            responseType: "arraybuffer"
        }).done(function(data) {
            if (length < data.byteLength) {
                // Truncate
                var req = {
                    filePath: filePath,
                    data: data.slice(0, length)
                };
                // createUploadSession.call(this, req, successCallback, errorCallback);
                sendSimpleUpload.call(this, req, successCallback, errorCallback);
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
                    // createUploadSession.call(this, req, successCallback, errorCallback);
                    sendSimpleUpload.call(this, req, successCallback, errorCallback);
                }.bind(this));
                reader.readAsArrayBuffer(blob);
            }
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    // Private functions

    var handleError = function(error, successCallback, errorCallback) {
        console.log(error);
        var status = Number(error.status);
        if (status === 404) {
            errorCallback("NOT_FOUND");
        } else if (status === 401) {
            // Access token has already expired or unauthorized. Unmount.
            this.onedrive_fs_.doUnmount(function() {
                errorCallback("INVALID_OPERATION");
                chrome.notifications.create("", {
                    type: "basic",
                    title: "File System for OneDrive",
                    message: "The access token has expired. File system unmounted.",
                    iconUrl: "/icons/48.png"
                }, function(notificationId) {
                }.bind(this));
            }.bind(this));
        } else {
            errorCallback("FAILED");
        }
    };

    var sendSimpleUpload = function(options, successCallback, errorCallback) {
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
        }).done(function(result) {
            console.log(result);
            successCallback();
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

/*
    var createUploadSession = function(options, successCallback, errorCallback) {
        $.ajax({
            type: "POST",
            url: "https://graph.microsoft.com/v1.0/me/drive/root:" + options.filePath + ":/upload.createSession",
            headers: {
                "Authorization": "Bearer " + this.access_token_,
                "Content-Type": "application/json"
            },
            data: JSON.stringify({
                "@name.conflictBehavior": "replace"
            }),
            dataType: "json"
        }).done(function(data) {
            console.log(data);
            options.uploadUrl = data.uploadUrl;
            sendContents.call(this, options, successCallback, errorCallback);
        }.bind(this)).fail(function(error) {
            handleError.call(this, error, successCallback, errorCallback);
        }.bind(this));
    };

    var sendContents = function(options, successCallback, errorCallback) {
        if (!options.hasMore) {
            successCallback();
        } else {
            var len = options.data.byteLength;
            var remains = len - options.sentBytes;
            var sendLength = Math.min(CHUNK_SIZE, remains);
            var more = (options.sentBytes + sendLength) < len;
            var sendBuffer = options.data.slice(options.sentBytes, sendLength);
            $.ajax({
                type: "PUT",
                url: options.uploadUrl,
                dataType: "json",
                headers: {
                    "Authorization": "Bearer " + this.access_token_,
                    "Content-Range": "bytes " + options.offset + "-" + (options.offset + sendLength - 1) + "/" + len
                    //"Content-Type": "application/octet-stream"
                },
                processData: false,
                data: sendBuffer
            }).done(function(result) {
                console.log(result);
                var writeRequest = this.writeRequestMap[options.openRequestId];
                if (writeRequest) {
                    writeRequest.uploadId = result.upload_id;
                }
                var req = {
                    filePath: options.filePath,
                    data: options.data,
                    offset: options.offset + sendLength,
                    sentBytes: options.sendBytes + sendLength,
                    uploadId: result.upload_id,
                    hasMore: more,
                    openRequestId: options.openRequestId,
                    uploadUrl: options.uploadUrl
                };
                sendContents.call(this, req, successCallback, errorCallback);
            }.bind(this)).fail(function(error) {
                handleError.call(this, error, successCallback, errorCallback);
            }.bind(this));
        }
    };
*/

    var createEntryMetadatas = function(contents, index, entryMetadatas, successCallback, errorCallback) {
        if (contents.length === index) {
            successCallback(entryMetadatas);
        } else {
            var content = contents[index];
            var entryMetadata = {
                isDirectory: isDirectoryEntry.call(this, content),
                name: content.name,
                size: content.size,
                modificationTime: new Date(content.lastModifiedDateTime)
            };
            if (!isDirectoryEntry.call(this, content)) {
                if (content.file) {
                    entryMetadata.mimeType = content.file.mimeType;
                }
                else {
                    entryMetadata.mimeType = content.package.type;
                }
            }
            console.log(entryMetadata);
            entryMetadatas.push(entryMetadata);
            createEntryMetadatas.call(this, contents, ++index, entryMetadatas, successCallback, errorCallback);
        }
    };

    var isDirectoryEntry = function(entry) {
        var folder = entry.folder;
        if (folder) {
            return true;
        } else {
            return false;
        }
    };

    var normalizeName = function(name) {
        if (name === "root") {
            return "";
        } else {
            return name;
        }
    };

    var initializeJQueryAjaxBinaryHandler = function() {
        $.ajaxTransport("+binary", function(options, originalOptions, jqXHR){
            if (window.FormData &&
                ((options.dataType && (options.dataType === 'binary')) ||
                 (options.data && ((window.ArrayBuffer && options.data instanceof ArrayBuffer) ||
                                   (window.Blob && options.data instanceof Blob))))) {
                return {
                    send: function(_, callback){
                        var xhr = new XMLHttpRequest(),
                            url = options.url,
                            type = options.type,
                            dataType = options.responseType || "blob",
                            data = options.data || null;
                        xhr.addEventListener('load', function(){
                            var data = {};
                            data[options.dataType] = xhr.response;
                            callback(xhr.status, xhr.statusText, data, xhr.getAllResponseHeaders());
                        });
                        xhr.open(type, url, true);
                        for (var key in options.headers) {
                            xhr.setRequestHeader(key, options.headers[key]);
                        }
                        xhr.responseType = dataType;
                        xhr.send(data);
                    },
                    abort: function(){
                        jqXHR.abort();
                    }
                };
            }
        });
    };

    // Export

    window.OneDriveClient = OneDriveClient;

})();
