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
          permissions: {
            type: 'string',
          },
          projects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: {
                  type: 'string',
                },
                project: {
                  type: 'string',
                },
              },
            },
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
        200: { $ref: 'epad_users_schema#' },
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

  fastify.route({
    method: 'GET',
    url: '/users/:user/preferences',
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
    handler: fastify.getUserPreferences,
  });

  fastify.route({
    method: 'PUT',
    url: '/users/:user/preferences',
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
    handler: fastify.updateUserPreferences,
  });
}

module.exports = routes;
