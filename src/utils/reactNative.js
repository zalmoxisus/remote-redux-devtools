/*
 * Get React Native server IP if hostname is `localhost`
 * On Android emulator, the IP of host is `10.0.2.2` (Genymotion: 10.0.3.2)
 */
export function getHostForRN(hostname) {
  if (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    typeof window !== 'undefined' &&
    window.__fbBatchedBridge &&
    window.__fbBatchedBridge.RemoteModules &&
    window.__fbBatchedBridge.RemoteModules.AndroidConstants
  ) {
    const {
      ServerHost = hostname
    } = window.__fbBatchedBridge.RemoteModules.AndroidConstants;
    return ServerHost.split(':')[0];
  }

  return hostname;
}