// defines routes for accessing aims
async function otherRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/files',
    schema: {
      tags: ['files'],
    },
    handler: fastify.saveFile,
  });
  fastify.route({
    method: 'GET',
    url: '/files',
    schema: {
      tags: ['files'],
    },
    handler: fastify.getFiles,
  });
  fastify.route({
    method: 'GET',
    url: '/files/:filename',
    schema: {
      tags: ['files'],
      params: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getFile,
  });

  fastify.route({
    method: 'GET',
    url: '/notifications',
    handler: fastify.getNotifications,
  });

  fastify.route({
    method: 'GET',
    url: '/epads/stats',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getStats,
  });
}
module.exports = otherRoutes;
