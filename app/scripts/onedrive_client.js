"use strict";

(function() {

    // Private fields

    var AUTH_URL = "https://login.live.com/oauth20_authorize.srf?" +
            "client_id=000000004C142702&scope=onedrive.readwrite&response_type=token" +
            "&redirect_uri=" + chrome.identity.getRedirectURL("");

    var CHUNK_SIZE = 1024 * 1024 * 4; // 4MB

    // Constructor

    var OneDriveClient = function(onedriveFS) {
        this.onedrive_fs_ = onedriveFS;
        this.access_token_ = null;
        this.writeRequestMap = {};
        initializeJQueryAjaxBinaryHandler.call(this);
    };

    // Public functions

    OneDriveClient.prototype.authorize = function(successCallback, errorCallback) {
        this.access_token_ = null;
        chrome.identity.launchWebAuthFlow({
            "url": AUTH_URL,
            "interactive": true
        }, function(redirectUrl) {
            if (chrome.runtime.lastError) {
                errorCallback(chrome.runtime.lastError.message);
                return;
            }
            if (redirectUrl) {
                var parametersStr = redirectUrl.substring(redirectUrl.indexOf("#") + 1);
                var parameters = parametersStr.split("&");
                for (var i = 0; i < parameters.length; i++) {
                    var parameter = parameters[i];
                    var kv = parameter.split("=");
                    if (kv[0] === "access_token") {
                        this.access_token_ = kv[1];
                    }
                }
                if (this.access_token_) {
                    successCallback();
                } else {
                    errorCallback("Issuing Access token failed");
                }
            } else {
                errorCallback("Authorization failed");
            }
        }.bind(this));
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
        var url = "https://api.onedrive.com/v1.0/drive/root";
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
        var url = "https://api.onedrive.com/v1.0/drive/root";
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + filePath + ":/content",
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
        var url = "https://api.onedrive.com/v1.0/drive/root";
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + entryPath,
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + sourcePath,
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + sourcePath + ":/action.copy",
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + filePath + ":/content",
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + filePath + ":/content",
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
        var status = error.status;
        if (status === 404) {
            errorCallback("NOT_FOUND");
        } else if (status === 416) {
            successCallback(new ArrayBuffer(), false);
        } else if (status === 401) {
            // Access token has already expired or unauthorized. Unmount.
            this.onedrive_fs_.doUnmount(function() {
                errorCallback("INVALID_OPERATION");
                chrome.notifications.create("", {
                    type: "basic",
                    title: "File System for OneDrive",
                    message: "The access token has been expired. File system unmounted.",
                    iconUrl: "icons/48.png"
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + options.filePath + ":/content",
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
            url: "https://api.onedrive.com/v1.0/drive/root:" + options.filePath + ":/upload.createSession",
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
                entryMetadata.mimeType = content.file.mimeType;
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
