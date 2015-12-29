import configureStore from './configureStore';
let store = {};
let shouldInit = true;
let actionsCount = 0;

function relay(type, state, action, nextActionId) {
  const message = {
    payload: state,
    action: action || '',
    nextActionId: nextActionId || '',
    type: type,
    init: shouldInit
  };
  if (shouldInit) shouldInit = false;

  console.log('message', message);
}

function subscriber(state = {}, action) {
  if (action && action.type) {
    setTimeout(() => {
      if (action.type === 'PERFORM_ACTION') {
        actionsCount++;
        relay('ACTION', store.getState(), action, actionsCount);
      } else {
        const liftedState = store.liftedStore.getState();
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
      store = configureStore(next, subscriber)(reducer, initialState);
      return store;
    };
  };
}
