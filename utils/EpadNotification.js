class EpadNotification {
  constructor(request, info, reason, refresh, logId) {
    this.notification = {
      projectID: EpadNotification.getProject(request.req.url),
      username: request.epadAuth.username ? request.epadAuth.username : 'nouser',
      function: typeof info === 'string' ? info : EpadNotification.prepareMethodText(info),
      params: `${reason instanceof Error ? reason.message : reason}`,
      createdtime: new Date(),
      error: reason instanceof Error,
      refresh,
    };
    this.request = request;
    this.logId = logId;
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
      if (this.notification.error)
        fastify.log.error(
          `Error as response ${JSON.stringify({ notification: this.notification })}`
        );
      const notified = fastify.sse({ notification: this.notification }, this.notification.username);
      // add to eventlog with notified
      fastify.saveEventLog(this.request, this.notification, notified, this.logId);
    } catch (err) {
      fastify.log.error(
        `Error sending notification to user ${this.notification.username}. Error: ${err.message}`
      );
      // add to eventlog with notified false (1)
      fastify.saveEventLog(this.request, this.notification, false, this.logId);
    }
  }
}
module.exports = EpadNotification;
