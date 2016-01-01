import { createStore } from 'redux';
import devTools from 'remote-redux-devtools';
import rootReducer from '../reducers';

export default function configureStore(initialState) {
  const store = devTools()(createStore)(rootReducer, initialState);

  if (module.hot) {
    // Enable Webpack hot module replacement for reducers
    module.hot.accept('../reducers', () => {
      const nextReducer = require('../reducers');
      store.replaceReducer(nextReducer);
    });
  }

  return store;
}
