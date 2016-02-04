import performanceNow from 'performance-now';

module.exports = function (io) {
    io
      .on('connection', (socket) => {
          console.log('socket connected: ', socket.id);

          socket.emit('hello', {message: 'Hello', time: Date.now()});

          socket.on('disconnect', () => console.log('socket disconnected: ', socket.id));
      });
};