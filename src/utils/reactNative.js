/*
 * Get React Native server IP if hostname is `localhost`
 * On Android emulator, the IP of host is `10.0.2.2` (Genymotion: 10.0.3.2)
 */
export function getHostForRN(hostname) {
  const { remoteModuleConfig } = typeof window !== 'undefined' &&
    window.__fbBatchedBridgeConfig || {};
  if (
    hostname !== 'localhost' && hostname !== '127.0.0.1' ||
    !Array.isArray(remoteModuleConfig)
  ) return hostname;

  const [, AndroidConstants] = remoteModuleConfig.find(config =>
    config && config[0] === 'AndroidConstants'
  ) || [];
  if (AndroidConstants) {
    const { ServerHost = hostname } = AndroidConstants;
    return ServerHost.split(':')[0];
  }
  return hostname;
}