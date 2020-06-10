'use strict';

const background = () => {
    if (!chrome.fileSystemProvider) {
        console.log('There is no chrome.fileSystemProvider API. See you on ChromeOS!');
        return;
    }

    Raven.config('https://632938a00c0b4a8f82de9a627ad1101c@sentry.io/1437308', {
        release: chrome.runtime.getManifest().version
    }).install();
    console.log('Sentry initialized.');

    const onedrive_fs_ = new OneDriveFS();

    const openWindow = () => {
        chrome.app.window.create('window.html', {
            outerBounds: {
                width: 600,
                height: 420
            },
            resizable: false
        });
    };

    chrome.app.runtime.onLaunched.addListener(openWindow);

    if (chrome.fileSystemProvider.onMountRequested) {
        chrome.fileSystemProvider.onMountRequested.addListener(openWindow);
    }

    const mount = (successCallback, errorCallback) => {
        onedrive_fs_.mount(() => {
            successCallback();
        }, reason => {
            errorCallback(reason);
        });
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch(request.type) {
        case 'mount':
            mount(() => {
                sendResponse({
                    type: 'mount',
                    success: true
                });
            }, reason => {
                sendResponse({
                    type: 'mount',
                    success: false,
                    error: reason
                });
            });
            break;
        default:
            sendResponse({
                type: 'error',
                success: false,
                message: request.type ? 'Invalid request type: ' + request.type + '.' : 'No request type provided.'
            });
            break;
        }
        return true;
    });
};

background();
