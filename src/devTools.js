import { stringify, parse } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
import { socketOptions } from './constants';

let instanceName;
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
      id: socket.id,
      name: instanceName,
      init: shouldInit
    };
    if (shouldInit) shouldInit = false;

    socket.emit(socket.id ? 'log' : 'log-noid', message);
  }, 0);
}

function handleMessages(message) {
  if (message.type === 'DISPATCH') {
    store.liftedStore.dispatch(message.action);
  } else if (message.type === 'UPDATE') {
    relay('STATE', store.liftedStore.getState());
  } else if (message.type === 'SYNC') {
    if (socket.id && message.id !== socket.id) {
      store.liftedStore.dispatch({
        type: 'IMPORT_STATE', nextLiftedState: parse(message.state)
      });
    }
  }
}

function init(options) {
  if (channel) channel.unwatch();
  if (socket) socket.disconnect();
  socket = socketCluster.connect(options && options.port ? options : socketOptions);

  socket.emit('login', 'master', (err, channelName) => {
    if (err) { console.error(err); return; }
    channel = socket.subscribe(channelName);
    channel.watch(handleMessages);
    socket.on(channelName, handleMessages);
  });

  if (options) instanceName = options.name;
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
