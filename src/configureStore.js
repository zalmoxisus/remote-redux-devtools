import instrument from 'redux-devtools-instrument';

export default function configureStore(next, subscriber, options) {
  return instrument(subscriber, options)(next);
}
