import { Component } from 'react';

export default class RemoteMonitor extends Component {
  static update() {
    console.log('props', arguments);
    return {};
  }
}
