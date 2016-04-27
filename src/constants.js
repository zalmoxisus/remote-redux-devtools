export const defaultSocketOptions = {
  protocol: 'http',
  hostname: 'remotedev.io',
  port: 80,
  autoReconnect: true,
  autoReconnectOptions: {
    randomness: 60000
  }
};
