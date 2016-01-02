import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
const socketOptions = {
  protocol: 'http',
  hostname: 'remotedev.io',
  port: 80,
  autoReconnect: true
};
let socket;
let store = {};
let shouldInit = true;
let actionsCount = 0;
let lastTime = 0;

function init() {
  socket = socketCluster.connect(socketOptions);
}

function relay(type, state, action, nextActionId) {
  const message = {
    payload: state,
    action: action || '',
    nextActionId: nextActionId || '',
    type: type,
    init: shouldInit
  };
  if (shouldInit) shouldInit = false;

  socket.emit('log', message);
  console.log('message', message);
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
