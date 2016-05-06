import { stringify, parse } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
import { defaultSocketOptions } from './constants';

const monitorActions = [ // To be skipped for relaying actions
  '@@redux/INIT', 'TOGGLE_ACTION', 'SWEEP', 'IMPORT_STATE', 'SET_ACTIONS_ACTIVE'
];

let instanceId;
let instanceName;
let socketOptions;
let socket;
let channel;
let store = {};
let lastAction;
let filters;
let isExcess;
let isMonitored;
let started;
let startOn;
let stopOn;
let sendOn;
let sendTo;

function isFiltered(action) {
  if (!action || !action.action || !action.action.type) return false;
  return (
    filters.whitelist && !action.action.type.match(filters.whitelist.join('|')) ||
    filters.blacklist && action.action.type.match(filters.blacklist.join('|'))
  );
}

function filterStagedActions(state) {
  if (!filters) return state;

  const filteredStagedActionIds = [];
  const filteredComputedStates = [];

  state.stagedActionIds.forEach((id, idx) => {
    if (!isFiltered(state.actionsById[id])) {
      filteredStagedActionIds.push(id);
      filteredComputedStates.push(state.computedStates[idx]);
    }
  });

  return { ...state,
    stagedActionIds: filteredStagedActionIds,
    computedStates: filteredComputedStates
  };
}

function send() {
  if (!instanceId) instanceId = socket && socket.id || Math.random().toString(36).substr(2);
  try {
    fetch(sendTo, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        type: 'STATE',
        id: instanceId,
        name: instanceName,
        payload: stringify(filterStagedActions(store.liftedStore.getState()))
      })
    }).catch(function (err) {
      console.warn(err);
    });
  } catch (err) {
    console.warn(err);
  }
}

function relay(type, state, action, nextActionId) {
  if (filters && isFiltered(action)) return;
  const message = {
    type,
    id: socket.id,
    name: instanceName
  };
  if (state) message.payload = stringify(state);
  if (action) {
    message.action = stringify(action);
    message.isExcess = isExcess;
  }
  if (nextActionId) message.nextActionId = stringify(nextActionId);
  socket.emit(socket.id ? 'log' : 'log-noid', message);
}

function handleMessages(message) {
  if (
    message.type === 'IMPORT' || message.type === 'SYNC' && socket.id && message.id !== socket.id
  ) {
    store.liftedStore.dispatch({
      type: 'IMPORT_STATE', nextLiftedState: parse(message.state)
    });
  } if (message.type === 'UPDATE' || message.type === 'IMPORT' || message.type === 'START') {
    relay('STATE', filterStagedActions(store.liftedStore.getState()));
  } if (message.type === 'START') {
    isMonitored = true;
  } else if (message.type === 'STOP' || message.type === 'DISCONNECTED') {
    isMonitored = false;
    relay('STOP');
  } else if (message.type === 'ACTION') {
    store.dispatch(message.action);
  } else if (message.type === 'DISPATCH') {
    store.liftedStore.dispatch(message.action);
  }
}

function str2array(str) {
  return typeof str === 'string' ? [str] : str && str.length;
}

function init(options) {
  instanceName = options.name;
  if (options.filters) {
    filters = options.filters;
  }
  if (options.port) {
    socketOptions = {
      port: options.port,
      hostname: options.hostname || 'localhost',
      secure: options.secure
    };
  } else socketOptions = defaultSocketOptions;

  startOn = str2array(options.startOn);
  stopOn = str2array(options.stopOn);
  sendOn = str2array(options.sendOn);
  if (sendOn) {
    sendTo = options.sendTo ||
      `${socketOptions.secure ? 'https' : 'http'}://${socketOptions.hostname}:${socketOptions.port}`;
    instanceId = options.id;
  }
}

function start() {
  if (started) return;
  started = true;

  socket = socketCluster.connect(socketOptions);
  socket.on('error', function (err) {
    console.warn(err);
  });
  socket.emit('login', 'master', (err, channelName) => {
    if (err) { console.warn(err); return; }
    channel = socket.subscribe(channelName);
    channel.watch(handleMessages);
    socket.on(channelName, handleMessages);
  });
  relay('STATE', store.liftedStore.getState());
}

function stop() {
  started = false;
  isMonitored = false;
  if (channel) {
    channel.unsubscribe();
    channel.unwatch();
  }
  if (socket) {
    socket.off();
    socket.disconnect();
  }
}

function async(fn) {
  setTimeout(fn, 0);
}

function monitorReducer(state = {}, action) {
  if (action.action) {
    if (startOn && !started && startOn.indexOf(action.action.type) !== -1) async(start);
    else if (stopOn && started && stopOn.indexOf(action.action.type) !== -1) async(stop);
    else if (sendOn && !started && sendOn.indexOf(action.action.type) !== -1) async(send);
  }
  lastAction = action.type;
  return state;
}

function handleChange(state, liftedState, maxAge) {
  const nextActionId = liftedState.nextActionId;
  const liftedAction = liftedState.actionsById[nextActionId - 1];
  const action = liftedAction.action;
  if (action.type === '@@INIT') {
    relay('INIT', state, { timestamp: Date.now() });
  } else if (monitorActions.indexOf(lastAction) === -1) {
    if (lastAction === 'JUMP_TO_STATE') return;
    relay('ACTION', state, liftedAction, nextActionId);
    if (!isExcess && maxAge) isExcess = liftedState.stagedActionIds.length >= maxAge;
  } else {
    relay('STATE', filterStagedActions(liftedState));
  }
}

export default function devTools(options = {}) {
  init(options);
  const realtime = typeof options.realtime === 'undefined'
    ? process.env.NODE_ENV === 'development' : options.realtime;
  if (!realtime && !startOn) return f => f;

  const maxAge = options.maxAge || 30;
  return (next) => {
    return (reducer, initialState) => {
      store = configureStore(
        next, monitorReducer, { maxAge }
      )(reducer, initialState);

      if (realtime) start();
      store.subscribe(() => {
        if (isMonitored) handleChange(store.getState(), store.liftedStore.getState(), maxAge);
      });
      return store;
    };
  };
}
