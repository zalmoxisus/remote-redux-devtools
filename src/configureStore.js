import instrument from 'redux-devtools-instrument';

export default function configureStore(next, subscriber = () => ({})) {
  return instrument(subscriber)(next);
}
