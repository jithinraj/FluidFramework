/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITelemetryErrorEvent,
    ITelemetryLogger,
} from "@prague/container-definitions";

export enum OnlineStatus {
    Offline,
    Online,
    Unknown,
}

// It tells if we have local connection only - we might not have connection to web.
// No solution for node.js (other than resolve dns names / ping specific sites)
// Can also use window.addEventListener("online" / "offline")
export function isOnline(): OnlineStatus {
    if (typeof navigator === "object" && navigator !== null && typeof navigator.onLine === "boolean") {
        return navigator.onLine ? OnlineStatus.Online : OnlineStatus.Offline;
    }
    return OnlineStatus.Unknown;
}

export function logNetworkFailure(logger: ITelemetryLogger, event: ITelemetryErrorEvent, error?: any) {
    const newEvent = {...event};
    newEvent.online = isOnline();

    if (typeof navigator === "object" && navigator !== null) {
        const nav = navigator as any;
        // tslint:disable-next-line:no-unsafe-any
        const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
        if (connection !== null && typeof connection === "object") {
            // tslint:disable-next-line:no-unsafe-any
            newEvent.connectionType = connection.type;
        }
    }

    // If we are online, log it as an error, such that we look at it ASAP.
    // But if we  are offline, log non-error event - we will remove
    // it in the future once confident it's right thing to do.
    // Note: Unfortunately false positives happen in here (i.e. cable disconnected, but it reports true)!
    if (newEvent.online === OnlineStatus.Online) {
        logger.logException(newEvent, error);
    } else {
        logger.sendTelemetryEvent(newEvent, error);
    }
}

/**
 * Wait for browser to get to connected state.
 * If connected, waits minimum of minDelay anyway (between network retries)
 * If disconnected, polls every 30 seconds anyway, to make sure we are not getting stuck because of wrong signal
 * Note that browsers will have false positives (like having Hyper-V adapter on machine,
 * or machine connected to router that is not connected to internet)
 * But there should be no false negatives.
 * The only exception - Opera returns false when user enters "Work Offline" mode, regardless of actual connectivity.
 */
export function waitForConnectedState(minDelay: number): Promise<void> {
    // Use this frequency to poll even when we are offline and able to setup online/offline listener
    // This is mostly safety net
    const offlinePollFrequency = 30000;

    return new Promise((resolve) => {
        let listener: () => void = resolve;
        let delay = minDelay;
        if (isOnline() === OnlineStatus.Offline) {
            if (typeof window === "object" && window !== null && window.addEventListener) {
                listener = () => {
                    resolve();
                    window.removeEventListener("online", listener);
                };
                window.addEventListener("online", listener, false);
                delay = Math.max(minDelay, offlinePollFrequency);
            }
        }
        setTimeout(listener, delay);
    });
}
