//  defines routes for registering host for app key
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/register',
    schema: {
      tags: ['register'],
      body: {
        type: 'object',
        required: ['name', 'organization', 'email'],
        properties: {
          name: { type: 'string' },
          organization: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
    handler: fastify.registerServerForAppKey,
  });
}
module.exports = routes;
