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
  constructor(request, method, reason, error) {
    this.notification = {
      projectID: this.getProject(request.req.url),
      username: request.query.username ? request.query.username : 'nouser',
      function: method,
      params: `${reason}${
        // eslint-disable-next-line no-nested-ternary
        error !== undefined ? `: ${error instanceof Error ? error.message : error}` : ''
      }`,
      createdtime: new Date(),
      error: error !== undefined ? 1 : 0,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  getProject(url) {
    const splitUrl = url.split('/');
    if (splitUrl[1] === 'projects') return splitUrl[2];
    return '';
  }

  notify(fastify) {
    console.log(`sending ${JSON.stringify(this)}`);
    // TODO try catch
    fastify.connectedUsers[this.notification.username].write(JSON.stringify(this.notification));
  }
}
module.exports = EpadNotification;
