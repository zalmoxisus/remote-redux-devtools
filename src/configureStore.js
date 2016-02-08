import instrument from 'redux-devtools/lib/instrument';

export default function configureStore(next, subscriber = () => ({})) {
  return instrument(subscriber)(next);
}
