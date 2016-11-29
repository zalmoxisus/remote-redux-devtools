import { stringify, parse } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
import { defaultSocketOptions } from './constants';
import { getHostForRN } from './utils/reactNative';
import { evalAction, getActionsArray } from 'remotedev-utils';
import catchErrors from 'remotedev-utils/lib/catchErrors';
import {
  getLocalFilter,
  isFiltered,
  filterStagedActions,
  filterState
} from 'remotedev-utils/lib/filters';

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
let sendOnError;
let sendTo;
let lastErrorMsg;
let locked;
let paused;
let actionCreators;
let stateSanitizer;
let actionSanitizer;

function getLiftedState() {
  return filterStagedActions(store.liftedStore.getState(), filters);
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
        payload: stringify(getLiftedState())
      })
    }).catch(function (err) {
      console.log(err);
    });
  } catch (err) {
    console.log(err);
  }
}

function relay(type, state, action, nextActionId) {
  const message = {
    type,
    id: socket.id,
    name: instanceName
  };
  if (state) {
    message.payload = type === 'ERROR' ? state :
      stringify(filterState(state, type, filters, stateSanitizer, actionSanitizer, nextActionId));
  }
  if (type === 'ACTION') {
    message.action = stringify(
      !actionSanitizer ? action : actionSanitizer(action.action, nextActionId - 1)
    );
    message.isExcess = isExcess;
    message.nextActionId = nextActionId;
  } else if (action) {
    message.action = action;
  }
  socket.emit(socket.id ? 'log' : 'log-noid', message);
}

function dispatchRemotely(action) {
  try {
    const result = evalAction(action, actionCreators);
    store.dispatch(result);
  } catch (e) {
    relay('ERROR', e.message);
  }
}

function handleMessages(message) {
  if (
    message.type === 'IMPORT' || message.type === 'SYNC' && socket.id && message.id !== socket.id
  ) {
    store.liftedStore.dispatch({
      type: 'IMPORT_STATE', nextLiftedState: parse(message.state)
    });
  } else if (message.type === 'UPDATE') {
    relay('STATE', getLiftedState());
  } else if (message.type === 'START') {
    isMonitored = true;
    if (typeof actionCreators === 'function') actionCreators = actionCreators();
    relay('STATE', getLiftedState(), actionCreators);
  } else if (message.type === 'STOP' || message.type === 'DISCONNECTED') {
    isMonitored = false;
    relay('STOP');
  } else if (message.type === 'ACTION') {
    dispatchRemotely(message.action);
  } else if (message.type === 'DISPATCH') {
    store.liftedStore.dispatch(message.action);
  }
}

function async(fn) {
  setTimeout(fn, 0);
}

function sendError(errorAction) {
  // Prevent flooding
  if (errorAction.message && errorAction.message === lastErrorMsg) return;
  lastErrorMsg = errorAction.message;

  async(() => {
    store.dispatch(errorAction);
    if (!started) send();
  });
}

function str2array(str) {
  return typeof str === 'string' ? [str] : str && str.length;
}

function init(options) {
  instanceName = options.name;
  const { blacklist, whitelist } = options.filters || {};
  filters = getLocalFilter({
    actionsBlacklist: blacklist || options.actionsBlacklist,
    actionsWhitelist: whitelist || options.actionsWhitelist
  });
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
  sendOnError = options.sendOnError;
  if (sendOn || sendOnError) {
    sendTo = options.sendTo ||
      `${socketOptions.secure ? 'https' : 'http'}://${socketOptions.hostname}:${socketOptions.port}`;
    instanceId = options.id;
  }
  if (sendOnError === 1) catchErrors(sendError);

  if (options.actionCreators) actionCreators = () => getActionsArray(options.actionCreators);
  stateSanitizer = options.stateSanitizer;
  actionSanitizer = options.actionSanitizer;
}

function login() {
  socket.emit('login', 'master', (err, channelName) => {
    if (err) { console.log(err); return; }
    channel = channelName;
    socket.subscribe(channelName).watch(handleMessages);
    socket.on(channelName, handleMessages);
  });
  started = true;
  relay('START');
}

function stop(keepConnected) {
  started = false;
  isMonitored = false;
  if (!socket) return;
  socket.destroyChannel(channel);
  if (keepConnected) {
    socket.off(channel, handleMessages);
  } else {
    socket.off();
    socket.disconnect();
  }
}

function start() {
  if (started || socket && socket.getState() === socket.CONNECTING) return;

  socket = socketCluster.connect(socketOptions);
  socket.on('error', function (err) {
    console.log(err);
  });
  socket.on('connect', () => {
    login();
  });
  socket.on('disconnect', () => {
    stop(true);
  });
}

function checkForReducerErrors(liftedState = store.liftedStore.getState()) {
  if (liftedState.computedStates[liftedState.currentStateIndex].error) {
    if (started) relay('STATE', filterStagedActions(liftedState, filters));
    else send();
    return true;
  }
  return false;
}

function monitorReducer(state = {}, action) {
  lastAction = action.type;
  if (!started && sendOnError === 2 && store.liftedStore) async(checkForReducerErrors);
  else if (action.action) {
    if (startOn && !started && startOn.indexOf(action.action.type) !== -1) async(start);
    else if (stopOn && started && stopOn.indexOf(action.action.type) !== -1) async(stop);
    else if (sendOn && !started && sendOn.indexOf(action.action.type) !== -1) async(send);
  }
  return state;
}

function handleChange(state, liftedState, maxAge) {
  if (checkForReducerErrors(liftedState)) return;

  if (lastAction === 'PERFORM_ACTION') {
    const nextActionId = liftedState.nextActionId;
    const liftedAction = liftedState.actionsById[nextActionId - 1];
    if (isFiltered(liftedAction.action, filters)) return;
    relay('ACTION', state, liftedAction, nextActionId);
    if (!isExcess && maxAge) isExcess = liftedState.stagedActionIds.length >= maxAge;
  } else {
    if (lastAction === 'JUMP_TO_STATE') return;
    if (lastAction === 'PAUSE_RECORDING') {
      paused = liftedState.isPaused;
    } else if (lastAction === 'LOCK_CHANGES') {
      locked = liftedState.isLocked;
    }
    if (paused || locked) {
      if (lastAction) lastAction = undefined;
      else return;
    }
    relay('STATE', filterStagedActions(liftedState, filters));
  }
}

export default function devToolsEnhancer(options = {}) {
  init({
    ...options,
    hostname: getHostForRN(options.hostname)
  });
  const realtime = typeof options.realtime === 'undefined'
    ? process.env.NODE_ENV === 'development' : options.realtime;
  if (!realtime && !(startOn || sendOn || sendOnError)) return f => f;

  const maxAge = options.maxAge || 30;
  return (next) => {
    return (reducer, initialState) => {
      store = configureStore(
        next, monitorReducer, {
          maxAge,
          shouldCatchErrors: !!sendOnError,
          shouldHotReload: options.shouldHotReload,
          shouldRecordChanges: options.shouldRecordChanges,
          shouldStartLocked: options.shouldStartLocked,
          pauseActionType: options.pauseActionType || '@@PAUSED'
        }
      )(reducer, initialState);

      if (realtime) start();
      store.subscribe(() => {
        if (isMonitored) handleChange(store.getState(), store.liftedStore.getState(), maxAge);
      });
      return store;
    };
  };
}

export function preEnhancer(createStore) {
  return (reducer, preloadedState, enhancer) => {
    store = createStore(reducer, preloadedState, enhancer);
    return {
      ...store,
      dispatch: (action) => (
        locked ? action : store.dispatch(action)
      )
    };
  };
}

devToolsEnhancer.updateStore = (newStore) => {
  console.warn('devTools.updateStore is deprecated use composeWithDevTools instead: ' +
    'https://github.com/zalmoxisus/remote-redux-devtools#use-devtools-compose-helper');
  store = newStore;
};

const compose = (options) => (...funcs) => (...args) =>
 [preEnhancer, ...funcs].reduceRight(
    (composed, f) => f(composed), devToolsEnhancer(options)(...args)
  );

export function composeWithDevTools(...funcs) {
  if (funcs.length === 0) {
    return devToolsEnhancer();
  }
  if (funcs.length === 1 && typeof funcs[0] === 'object') {
    return compose(funcs[0]);
  }
  return compose({})(...funcs);
}
