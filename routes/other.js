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
}
module.exports = otherRoutes;
