// class EpadError extends Error {
//   constructor(foo = 'bar', ...params) {
//     // Pass remaining arguments (including vendor specific ones) to parent constructor
//     super(...params);
//     console.log(params);

//     // Maintains proper stack trace for where our error was thrown (only available on V8)
//     if (Error.captureStackTrace) {
//       Error.captureStackTrace(this, EpadError);
//     }

//     this.name = 'EpadError';
//     // Custom debugging information
//     this.foo = foo;
//     this.date = new Date();
//   }
// }
class EpadNotification {
  constructor(params) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    console.log(params);

    this.params = params;
    this.date = new Date();
  }

  notify(fastify) {
    console.log(`sending ${JSON.stringify(this)}`);
    // TODO try catch
    fastify.connectedUsers[this.params.username].write(JSON.stringify(this));
  }
}
module.exports = EpadNotification;
