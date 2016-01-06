Remote Redux DevTools
=====================

![Demo](demo.gif)

Use [Redux DevTools](https://github.com/gaearon/redux-devtools) remotely for React Native, hybrid, desktop and server side Redux apps.

### Installation

```
npm install --save-dev remote-redux-devtools
```

### Usage

Just [add our store enhancer to your store](https://github.com/zalmoxisus/remote-redux-devtools/commit/eb18fc49e1f083a2330939af52da349b862f8df1):

##### `store/configureStore.js`

```js
import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import devTools from 'remote-redux-devtools';
import reducer from '../reducers';

export default function configureStore(initialState) {
  const finalCreateStore = compose(
    applyMiddleware(thunk),
    devTools()
  )(createStore);

  const store = finalCreateStore(reducer, initialState);

  return store;
}
```

### Remote monitor

Use one of [our remote apps](https://github.com/zalmoxisus/remotedev-app) to inspect and redo actions:
- [web](http://remotedev.io/)
- [chrome app](https://chrome.google.com/webstore/detail/remotedev/faicmgpfiaijcedapokpbdejaodbelph) (recommended)
- [electron app](https://github.com/zalmoxisus/remote-redux-devtools/tree/master/install).

Source code can be found [here](https://github.com/zalmoxisus/remotedev-app).

### Examples
- [Web](https://github.com/zalmoxisus/remote-redux-devtools/tree/master/examples)
- [React Native](https://github.com/zalmoxisus/react-native-counter-ios-android)

### Limitations

- Use it only for development, **NOT in production!**
- The app and the monitor should be under the same external IP address.
- For now it supports only one instance simultaneously.

### License

MIT
