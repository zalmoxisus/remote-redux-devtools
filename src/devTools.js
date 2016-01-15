import { stringify } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
import { socketOptions } from './constants';

let socket;
let channel;
let store = {};
let shouldInit = true;
let actionsCount = 0;
let reducedState;

function relay(type, state, action, nextActionId) {
  setTimeout(() => {
    const message = {
      payload: state ? stringify(state) : '',
      action: action ? stringify(action) : '',
      nextActionId: nextActionId || '',
      type: type,
      init: shouldInit
    };
    if (shouldInit) shouldInit = false;

    socket.emit('log', message);
  }, 0);
}

function handleMessages(message) {
  if (message.type === 'DISPATCH') {
    store.liftedStore.dispatch(message.action);
  } else if (message.type === 'UPDATE') {
    relay('STATE', store.liftedStore.getState());
  }
}

function init(options = socketOptions) {
  if (channel) channel.unwatch();
  if (socket) socket.disconnect();
  socket = socketCluster.connect(options);

  socket.emit('login', 'master', (err, channelName) => {
    if (err) { console.error(err); return; }
    channel = socket.subscribe(channelName);
    channel.watch(handleMessages);
  });
}

function subscriber(state = {}, action) {
  if (action && action.type) {
    if (action.type === '@@redux/INIT') {
      actionsCount = 1;
      relay('INIT', reducedState, { timestamp: Date.now() });
    } else if (action.type === 'PERFORM_ACTION') {
      actionsCount++;
      relay('ACTION', reducedState, action, actionsCount);
    } else {
      setTimeout(() => {
        const liftedState = store.liftedStore.getState();
        relay('STATE', liftedState);
      }, 0);
    }
  }
  return state;
}

function createReducer(reducer) {
  return (state, action) => {
    reducedState = reducer(state, action);
    return reducedState;
  };
}

export default function devTools(options) {
  return (next) => {
    return (reducer, initialState) => {
      init(options);
      store = configureStore(next, subscriber)(createReducer(reducer), initialState);
      return store;
    };
  };
}
