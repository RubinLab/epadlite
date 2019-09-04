async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/users',
    schema: {
      tags: ['user'],
      body: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
          },
          firstname: {
            type: 'string',
          },
          lastname: {
            type: 'string',
          },
          email: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.createUser,
  });

  fastify.route({
    method: 'GET',
    url: '/users',
    schema: {
      tags: ['user'],
    },
    handler: fastify.getUsers,
  });

  //   fastify.route({
  //     method: 'GET',
  //     url: '/users/:user',
  //     schema: {
  //       tags: ['user'],
  //     },
  //     handler: fastify.getUser,
  //   });
}

module.exports = routes;
