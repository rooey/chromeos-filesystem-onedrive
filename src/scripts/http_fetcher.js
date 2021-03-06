'use strict';

//FIX #58 We shouldn't have to set this twice @rooey
const HTTP_DEBUG_ENABLED = true;

class HttpFetcher {

    // Constructor

    constructor(onedrive_client, caller, request, data, successCallback, errorCallback) {
        this.onedrive_client_ = onedrive_client;
        this.caller_ = caller;
        this.request_ = request;
        this.data_ = data;
        this.successCallback_ = successCallback;
        this.errorCallback_ = errorCallback;
    }

    // Public functions

    fetch() {
        $.ajax(this.request_).done(result => {
            this.writeLog('debug', 'HttpFetcher', this.request);
            this.writeLog('debug', 'HttpFetcher', result);
            this.sendMessageToSentry('test', 'none', 'fish', 'nothing');
            this.successCallback_(result);
        }).fail((error, textStatus, errorThrown) => {
            this.handleError(error, textStatus, errorThrown);
        });
    }

    // Private functions

    handleError(error, textStatus, errorThrown) {
        const status = Number(error.status);
        if (status === 404 || status === 409) {
            console.debug(error);
            this.errorCallback_('NOT_FOUND');
        } else if (status === 202){
            this.writeLog('debug', 'handleError', 'accepted copy');
            this.successCallback_();
        }else if (status === 416) {
            console.debug(error);
            this.successCallback_(new ArrayBuffer(), false);
        } else if (status === 401) {
            console.error(error);
            // Access token has already expired or unauthorized. Attempt to refresh.
            this.onedrive_client_.refreshToken(() => {
                this.writeLog('debug', 'handleError', 'token refreshed');
                this.successCallback_();
            }, this.errorCallback_('INVALID_OPERATION'));
        } else if (status === 429) {
            const retryAfter = error.getResponseHeader('Retry-After');
            if (retryAfter) {
                this.writeLog('debug', 'handleError', 'Retry to send request(' + this.caller_ + ') after ' + retryAfter + 's');
                setTimeout(() => {
                    this.fetch();
                }, retryAfter * 1000);
            } else {
                console.error(error);
                let message1 = this.caller_ + ' - 429(no Retry-After)';
                if (error.responseText) {
                    message1 += ' - ' + error.responseText;
                }
                this.sendMessageToSentry(message1, error, textStatus, errorThrown);
                this.errorCallback_('FAILED');
            }
        } else if (status === 0) { // Maybe, timeout?
            console.log('Retry to send request(' + this.caller_ + ') after 1s because of timeout');
            setTimeout(() => {
                this.fetch();
            }, 1000);
        } else {
            // showNotification.call(this, 'Error: status=' + status);
            console.error(error);
            if (status < 500 || 599 < status) {
                let message2 = this.caller_ + ' - ' + status;
                if (error.responseText) {
                    message2 += ' - ' + error.responseText;
                }
                this.sendMessageToSentry(message2, error, textStatus, errorThrown);
            }
            this.errorCallback_('FAILED');
        }
    }

    //FIXME #59 writeLog function should be universal @rooey
    writeLog(messageType, message, payload) {
        if ((messageType === 'debug') && (HTTP_DEBUG_ENABLED !==true)) return;
        console.log('[' + messageType + '] ' + message, payload);
        return;
    };

    //FIXME #60 sendMessageToSentry should be universal
    sendMessageToSentry(message, error, textStatus, errorThrown) {
        this.useOptions('useSentry', use => {
            //ISSUE #57 @rooey
            //Only send to sentry if user has opted-in
            if (!use) {
                return;
            }
            this.writeLog('sentry', message, error + ' ' + textStatus + ' ' + errorThrown);
            if (Raven.isSetup()) {
                Raven.captureMessage(new Error(message), {
                    extra: {
                        error: error,
                        textStatus: textStatus,
                        errorThrown: errorThrown,
                        data: this.data_
                    },
                    tags: {
                        'app.version': chrome.runtime.getManifest().version
                    }
                });
            }
        });
    }

    //FIXME #61 useOptions function should be universal
    useOptions(options, callback) {
        chrome.storage.local.get('settings', items => {
            const settings = items.settings || {};
            callback(settings[options] || false);
        });
    }
};

// Export
window.HttpFetcher = HttpFetcher;
