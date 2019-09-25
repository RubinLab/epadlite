class EpadNotification {
  constructor(request, info, reason) {
    this.notification = {
      projectID: EpadNotification.getProject(request.req.url),
      username: request.query.username ? request.query.username : 'nouser',
      function: typeof info === 'string' ? info : EpadNotification.prepareMethodText(info),
      params: `${reason instanceof Error ? reason.message : reason}`,
      createdtime: new Date(),
      error: reason instanceof Error,
    };
  }

  static prepareMethodText(reqInfo) {
    return `${reqInfo.methodText} ${reqInfo.level ? reqInfo.level.toUpperCase() : ''} ${
      reqInfo.object ? reqInfo.object : ''
    }`;
  }

  static getProject(url) {
    const splitUrl = url.split('/');
    if (splitUrl[1] === 'projects') return splitUrl[2];
    return '';
  }

  notify(fastify) {
    console.log(`sending ${JSON.stringify(this)}`);
    // TODO try catch
    fastify.sse(this, this.notification.username);
  }
}
module.exports = EpadNotification;
