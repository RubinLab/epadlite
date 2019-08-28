// defines routes for worklists
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/users/:user/worklists',
    schema: {
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.createWorklist,
  });

  fastify.route({
    method: 'POST',
    url: '/users/:user/worklists/:worklist/projects/:project/subjects',
    schema: {
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
          worklist: {
            type: 'string',
          },
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.linkWorklistToStudy,
  });

  fastify.route({
    method: 'GET',
    url: '/users/:user/worklists',
    handler: fastify.getWorklists,
  });

  fastify.route({
    method: 'PUT',
    url: '/users/:user/worklists/:worklist',
    schema: {
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
          worklist: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateWorklist,
  });

  fastify.route({
    method: 'DELETE',
    url: '/users/:user/worklists/:worklist',
    schema: {
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
          worklist: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteWorklist,
  });
}
module.exports = routes;
