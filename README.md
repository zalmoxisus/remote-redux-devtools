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

### Remote monitoring

Use one of [our monitor apps](https://github.com/zalmoxisus/remotedev-app) to inspect and redo actions:
- [web](http://remotedev.io/)
- [chrome app](https://chrome.google.com/webstore/detail/remotedev/faicmgpfiaijcedapokpbdejaodbelph) (recommended)
- [electron app](https://github.com/zalmoxisus/remote-redux-devtools/tree/master/install).

The source code is [here](https://github.com/zalmoxisus/remotedev-app).

Also, it can be [used in React Native debugger as a dock monitor](https://github.com/jhen0409/remote-redux-devtools-on-debugger).

### Examples
- [Web](https://github.com/zalmoxisus/remote-redux-devtools/tree/master/examples)
- [React Native](https://github.com/zalmoxisus/react-native-counter-ios-android).

### Limitations

- Use it only for development, **NOT in production!**
- The app and the monitor should be under the same external IP address.
- [For now it supports only one instance simultaneously](https://github.com/zalmoxisus/remote-redux-devtools/issues/2).
- For web apps it's easier and way faster to use [Chrome extension](https://github.com/zalmoxisus/redux-devtools-extension) instead. The remote monitoring is meant to be used for React Native, hybrid, desktop and server side apps. 

### License

MIT
