module.exports.run = function(worker) {
  var scServer = worker.scServer;
  scServer.on('connection', function(socket) {
    socket.on('login', function (credentials, respond) {
      if (credentials === 'master') respond(null, 'master');
      else respond(null, 'monitor');
    });
    socket.on('log', function(data) {
      scServer.exchange.publish('monitor', data);
    });
    socket.on('respond', function(data) {
      scServer.exchange.publish('master', data);
    });
  });
};
