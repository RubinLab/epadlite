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
      response: {
        200: 'epad_users_schema#',
      },
    },
    handler: fastify.getUsers,
  });

  fastify.route({
    method: 'GET',
    url: '/users/:user',
    schema: {
      tags: ['user'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getUser,
  });

  fastify.route({
    method: 'DELETE',
    url: '/users/:user',
    schema: {
      tags: ['user'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteUser,
  });

  fastify.route({
    method: 'PUT',
    url: '/users/:user',
    schema: {
      tags: ['user'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'object',
      },
    },
    handler: fastify.updateUser,
  });
}

module.exports = routes;
