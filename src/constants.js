export const defaultSocketOptions = {
  secure: true,
  hostname: 'localhost',
  port: 8000,
  autoReconnect: true,
  autoReconnectOptions: {
    randomness: 30000
  }
};
