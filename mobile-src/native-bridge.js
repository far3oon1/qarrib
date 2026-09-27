import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

function toBrowserPosition(position) {
    return {
        coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed
        },
        timestamp: position.timestamp
    };
}

if (Capacitor.isNativePlatform()) {
    var watches = new Map();
    var nextWatchId = 1;
    var nativeGeolocation = {
        getCurrentPosition: function (success, error, options) {
            Geolocation.getCurrentPosition(options || {})
                .then(function (position) { success(toBrowserPosition(position)); })
                .catch(function (reason) { if (error) error(reason); });
        },
        watchPosition: function (success, error, options) {
            var watchId = nextWatchId++;
            Geolocation.watchPosition(options || {}, function (position, reason) {
                if (reason) {
                    if (error) error(reason);
                    return;
                }
                if (position) success(toBrowserPosition(position));
            }).then(function (pluginWatchId) {
                watches.set(watchId, pluginWatchId);
            }).catch(function (reason) {
                if (error) error(reason);
            });
            return watchId;
        },
        clearWatch: function (options) {
            var pluginWatchId = watches.get(options.id);
            if (pluginWatchId) {
                watches.delete(options.id);
                Geolocation.clearWatch({ id: pluginWatchId });
            }
        }
    };

    try {
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: nativeGeolocation
        });
    } catch (error) {
        navigator.geolocation = nativeGeolocation;
    }

    window.QarrabMobileNative = true;
}
