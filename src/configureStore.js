import { compose } from 'redux';
import instrument from 'redux-devtools/lib/instrument';

export default function configureStore(next, subscriber = () => ({})) {
  return compose(
    instrument(subscriber)
  )(next);
}
