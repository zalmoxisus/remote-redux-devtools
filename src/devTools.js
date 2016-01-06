import { stringify } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
const socketOptions = {
  protocol: 'http',
  hostname: 'remotedev.io',
  port: 80,
  autoReconnect: true
};
let socket;
let channel;
let store = {};
let shouldInit = true;
let actionsCount = 0;
let lastTime = 0;

function relay(type, state, action, nextActionId) {
  const message = {
    payload: state ? stringify(state) : '',
    action: action ? stringify(action) : '',
    nextActionId: nextActionId || '',
    type: type,
    init: shouldInit
  };
  if (shouldInit) shouldInit = false;

  socket.emit('log', message);
  console.log('message', message);
}

function init() {
  socket = socketCluster.connect(socketOptions);

  socket.emit('login', 'master', (err, channelName) => {
    // TODO: process errors
    channel = socket.subscribe(channelName);
    channel.watch(message => {
      console.log('dispatch', message);
      if (message.type === 'DISPATCH') {
        store.liftedStore.dispatch(message.action);
      } else if (message.type === 'UPDATE') {
        relay('STATE', store.liftedStore.getState());
      }
    });
  });
}

function subscriber(state = {}, action) {
  if (action && action.type) {
    setTimeout(() => {
      if (action.type === 'PERFORM_ACTION') {
        if (lastTime > action.timestamp) return state;
        actionsCount++;
        relay('ACTION', store.getState(), action, actionsCount);
      } else {
        const liftedState = store.liftedStore.getState();
        lastTime = Date.now();
        relay('STATE', liftedState);
        actionsCount = liftedState.nextActionId;
      }
    }, 0);
  }
  return state;
}

export default function devTools() {
  return (next) => {
    return (reducer, initialState) => {
      init();
      store = configureStore(next, subscriber)(reducer, initialState);
      return store;
    };
  };
}
