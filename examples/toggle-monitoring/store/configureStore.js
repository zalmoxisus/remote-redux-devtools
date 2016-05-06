import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import invariant from 'redux-immutable-state-invariant';
import devTools from 'remote-redux-devtools';
import reducer from '../reducers';
import { START_MONITORING, STOP_MONITORING, SEND_TO_MONITOR } from '../actions/monitoring';

export default function configureStore(initialState) {
  const finalCreateStore = compose(
    applyMiddleware(invariant(), thunk),
    devTools({
      realtime: false,
      startOn: START_MONITORING, stopOn: STOP_MONITORING,
      sendOn: SEND_TO_MONITOR
    })
  )(createStore);

  const store = finalCreateStore(reducer, initialState);

  if (module.hot) {
    // Enable Webpack hot module replacement for reducers
    module.hot.accept('../reducers', () => {
      const nextReducer = require('../reducers').default;
      store.replaceReducer(nextReducer);
    });
  }

  return store;
}
