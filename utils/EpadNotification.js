class EpadNotification {
  constructor(request, info, reason, refresh) {
    this.notification = {
      projectID: EpadNotification.getProject(request.req.url),
      username: request.epadAuth.username ? request.epadAuth.username : 'nouser',
      function: typeof info === 'string' ? info : EpadNotification.prepareMethodText(info),
      params: `${reason instanceof Error ? reason.message : reason}`,
      createdtime: new Date(),
      error: reason instanceof Error,
      refresh,
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
    try {
      if (this.notification.error) fastify.log.error(`Error as response ${JSON.stringify(this)}`);
      fastify.sse(this, this.notification.username);
    } catch (err) {
      fastify.log.error(`Error sending notification to user ${this.notification.username}`);
    }
  }
}
module.exports = EpadNotification;
