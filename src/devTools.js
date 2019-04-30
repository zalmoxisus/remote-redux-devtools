import { stringify, parse } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
import { defaultSocketOptions } from './constants';
import getHostForRN from 'rn-host-detect';
import { evalAction, getActionsArray } from 'redux-devtools-core/lib/utils';
import catchErrors from 'redux-devtools-core/lib/utils/catchErrors';
import {
  getLocalFilter,
  isFiltered,
  filterStagedActions,
  filterState
} from 'redux-devtools-core/lib/utils/filters';

function async(fn) {
  setTimeout(fn, 0);
}

function str2array(str) {
  return typeof str === 'string' ? [str] : str && str.length;
}

function getRandomId() {
  return Math.random().toString(36).substr(2);
}

class DevToolsEnhancer {
  constructor() {
    this.enhance.updateStore = newStore => {
      console.warn('devTools.updateStore is deprecated use composeWithDevTools instead: ' +
        'https://github.com/zalmoxisus/remote-redux-devtools#use-devtools-compose-helper');
      this.store = newStore;
    };
  }

  getLiftedStateRaw() {
    return this.store.liftedStore.getState();
  }

  getLiftedState() {
    return filterStagedActions(this.getLiftedStateRaw(), this.filters);
  }

  send() {
    if (!this.instanceId) this.instanceId = this.socket && this.socket.id || getRandomId();
    try {
      fetch(this.sendTo, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          type: 'STATE',
          id: this.instanceId,
          name: this.instanceName,
          payload: stringify(this.getLiftedState())
        })
      }).catch(function (err) {
        console.log(err);
      });
    } catch (err) {
      console.log(err);
    }
  }

  relay(type, state, action, nextActionId) {
    const message = {
      type,
      id: this.socket.id,
      name: this.instanceName,
      instanceId: this.appInstanceId,
    };
    if (state) {
      message.payload = type === 'ERROR' ? state :
        stringify(filterState(state, type, this.filters, this.stateSanitizer, this.actionSanitizer, nextActionId));
    }
    if (type === 'ACTION') {
      message.action = stringify(
        !this.actionSanitizer ? action : this.actionSanitizer(action.action, nextActionId - 1)
      );
      message.isExcess = this.isExcess;
      message.nextActionId = nextActionId;
    } else if (action) {
      message.action = action;
    }
    this.socket.emit(this.socket.id ? 'log' : 'log-noid', message);
  }

  dispatchRemotely(action) {
    try {
      const result = evalAction(action, this.actionCreators);
      this.store.dispatch(result);
    } catch (e) {
      this.relay('ERROR', e.message);
    }
  }

  handleMessages = (message) => {
    if (
      message.type === 'IMPORT' || message.type === 'SYNC' && this.socket.id && message.id !== this.socket.id
    ) {
      this.store.liftedStore.dispatch({
        type: 'IMPORT_STATE', nextLiftedState: parse(message.state)
      });
    } else if (message.type === 'UPDATE') {
      this.relay('STATE', this.getLiftedState());
    } else if (message.type === 'START') {
      this.isMonitored = true;
      if (typeof this.actionCreators === 'function') this.actionCreators = this.actionCreators();
      this.relay('STATE', this.getLiftedState(), this.actionCreators);
    } else if (message.type === 'STOP' || message.type === 'DISCONNECTED') {
      this.isMonitored = false;
      this.relay('STOP');
    } else if (message.type === 'ACTION') {
      this.dispatchRemotely(message.action);
    } else if (message.type === 'DISPATCH') {
      this.store.liftedStore.dispatch(message.action);
    }
  };

  sendError(errorAction) {
    // Prevent flooding
    if (errorAction.message && errorAction.message === this.lastErrorMsg) return;
    this.lastErrorMsg = errorAction.message;

    async(() => {
      this.store.dispatch(errorAction);
      if (!this.started) this.send();
    });
  }

  init(options) {
    this.instanceName = options.name;
    this.appInstanceId = getRandomId();
    const { blacklist, whitelist } = options.filters || {};
    this.filters = getLocalFilter({
      actionsBlacklist: blacklist || options.actionsBlacklist,
      actionsWhitelist: whitelist || options.actionsWhitelist
    });
    if (options.port) {
      this.socketOptions = {
        port: options.port,
        hostname: options.hostname || 'localhost',
        secure: options.secure
      };
    } else this.socketOptions = defaultSocketOptions;

    this.suppressConnectErrors = options.suppressConnectErrors !== undefined ? options.suppressConnectErrors : true;

    this.startOn = str2array(options.startOn);
    this.stopOn = str2array(options.stopOn);
    this.sendOn = str2array(options.sendOn);
    this.sendOnError = options.sendOnError;
    if (this.sendOn || this.sendOnError) {
      this.sendTo = options.sendTo ||
        `${this.socketOptions.secure ? 'https' : 'http'}://${this.socketOptions.hostname}:${this.socketOptions.port}`;
      this.instanceId = options.id;
    }
    if (this.sendOnError === 1) catchErrors(this.sendError);

    if (options.actionCreators) this.actionCreators = () => getActionsArray(options.actionCreators);
    this.stateSanitizer = options.stateSanitizer;
    this.actionSanitizer = options.actionSanitizer;
  }

  login() {
    this.socket.emit('login', 'master', (err, channelName) => {
      if (err) { console.log(err); return; }
      this.channel = channelName;
      this.socket.subscribe(channelName).watch(this.handleMessages);
      this.socket.on(channelName, this.handleMessages);
    });
    this.started = true;
    this.relay('START');
  }

  stop(keepConnected) {
    this.started = false;
    this.isMonitored = false;
    if (!this.socket) return;
    this.socket.destroyChannel(this.channel);
    if (keepConnected) {
      this.socket.off(this.channel, this.handleMessages);
    } else {
      this.socket.off();
      this.socket.disconnect();
    }
  }

  start() {
    if (this.started || this.socket && this.socket.getState() === this.socket.CONNECTING) return;

    this.socket = socketCluster.connect(this.socketOptions);

    this.socket.on('error', function (err) {
      // if we've already had this error before, increment it's counter, otherwise assign it '1' since we've had the error once.
      this.errorCounts[err.name] = this.errorCounts.hasOwnProperty(err.name) ? this.errorCounts[err.name] + 1 : 1;

      if (this.suppressConnectErrors) {
        if (this.errorCounts[err.name] === 1) {
          console.log('remote-redux-devtools: Socket connection errors are being suppressed. ' + '\n' +
                'This can be disabled by setting suppressConnectErrors to \'false\'.');
          console.log(err);
        }
      } else {
        console.log(err);
      }
    });
    this.socket.on('connect', () => {
      console.log('connected to remotedev-server');
      this.errorCounts = {}; // clear the errorCounts object, so that we'll log any new errors in the event of a disconnect
      this.login();
    });
    this.socket.on('disconnect', () => {
      this.stop(true);
    });
  }

  checkForReducerErrors(liftedState = this.getLiftedStateRaw()) {
    if (liftedState.computedStates[liftedState.currentStateIndex].error) {
      if (this.started) this.relay('STATE', filterStagedActions(liftedState, this.filters));
      else this.send();
      return true;
    }
    return false;
  }

  monitorReducer = (state = {}, action) => {
    this.lastAction = action.type;
    if (!this.started && this.sendOnError === 2 && this.store.liftedStore) async(this.checkForReducerErrors);
    else if (action.action) {
      if (this.startOn && !this.started && this.startOn.indexOf(action.action.type) !== -1) async(this.start);
      else if (this.stopOn && this.started && this.stopOn.indexOf(action.action.type) !== -1) async(this.stop);
      else if (this.sendOn && !this.started && this.sendOn.indexOf(action.action.type) !== -1) async(this.send);
    }
    return state;
  };

  handleChange(state, liftedState, maxAge) {
    if (this.checkForReducerErrors(liftedState)) return;

    if (this.lastAction === 'PERFORM_ACTION') {
      const nextActionId = liftedState.nextActionId;
      const liftedAction = liftedState.actionsById[nextActionId - 1];
      if (isFiltered(liftedAction.action, this.filters)) return;
      this.relay('ACTION', state, liftedAction, nextActionId);
      if (!this.isExcess && maxAge) this.isExcess = liftedState.stagedActionIds.length >= maxAge;
    } else {
      if (this.lastAction === 'JUMP_TO_STATE') return;
      if (this.lastAction === 'PAUSE_RECORDING') {
        this.paused = liftedState.isPaused;
      } else if (this.lastAction === 'LOCK_CHANGES') {
        this.locked = liftedState.isLocked;
      }
      if (this.paused || this.locked) {
        if (this.lastAction) this.lastAction = undefined;
        else return;
      }
      this.relay('STATE', filterStagedActions(liftedState, this.filters));
    }
  }

  enhance(options = {}) {
    this.init({
      ...options,
      hostname: getHostForRN(options.hostname || 'localhost')
    });
    const realtime = typeof options.realtime === 'undefined'
      ? process.env.NODE_ENV === 'development' : options.realtime;
    if (!realtime && !(this.startOn || this.sendOn || this.sendOnError)) return f => f;

    const maxAge = options.maxAge || 30;
    return next => {
      return (reducer, initialState) => {
        this.store = configureStore(
          next, this.monitorReducer, {
            maxAge,
            trace: options.trace,
            traceLimit: options.traceLimit,
            shouldCatchErrors: !!this.sendOnError,
            shouldHotReload: options.shouldHotReload,
            shouldRecordChanges: options.shouldRecordChanges,
            shouldStartLocked: options.shouldStartLocked,
            pauseActionType: options.pauseActionType || '@@PAUSED'
          }
        )(reducer, initialState);

        if (realtime) this.start();
        this.store.subscribe(() => {
          if (this.isMonitored) this.handleChange(this.store.getState(), this.getLiftedStateRaw(), maxAge);
        });
        return this.store;
      };
    };
  }
}

export default new DevToolsEnhancer().enhance;

const compose = (options) => (...funcs) => (...args) => {
  const enhancer = new DevToolsEnhancer();

  function preEnhancer(createStore) {
    return (reducer, preloadedState, enhancer) => {
      enhancer.store = createStore(reducer, preloadedState, enhancer);
      return {
        ...enhancer.store,
        dispatch: (action) => (
          enhancer.locked ? action : enhancer.store.dispatch(action)
        )
      };
    };
  }

  return [preEnhancer, ...funcs].reduceRight(
    (composed, f) => f(composed), enhancer.enhance(options)(...args)
  );
};

export function composeWithDevTools(...funcs) {
  if (funcs.length === 0) {
    return new DevToolsEnhancer().enhance();
  }
  if (funcs.length === 1 && typeof funcs[0] === 'object') {
    return compose(funcs[0]);
  }
  return compose({})(...funcs);
}
