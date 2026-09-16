const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Classic Bluetooth (RFCOMM/SPP) permissions for talking to the hotshoe unit.
 * Android 12+ uses the new runtime-requestable BLUETOOTH_CONNECT/BLUETOOTH_SCAN
 * permissions; pre-12 needs ACCESS_FINE_LOCATION because BT scanning was treated
 * as a location signal back then.
 */
function withHotshoeBluetoothPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    const permissions = manifest['uses-permission'];
    const has = (name) => permissions.some((p) => p.$['android:name'] === name);

    if (!has('android.permission.BLUETOOTH_CONNECT')) {
      permissions.push({ $: { 'android:name': 'android.permission.BLUETOOTH_CONNECT' } });
    }
    if (!has('android.permission.BLUETOOTH_SCAN')) {
      permissions.push({
        $: {
          'android:name': 'android.permission.BLUETOOTH_SCAN',
          'android:usesPermissionFlags': 'neverForLocation',
        },
      });
    }
    if (!has('android.permission.ACCESS_FINE_LOCATION')) {
      permissions.push({
        $: {
          'android:name': 'android.permission.ACCESS_FINE_LOCATION',
          'android:maxSdkVersion': '30',
        },
      });
    }

    return config;
  });
}

module.exports = withHotshoeBluetoothPermissions;
