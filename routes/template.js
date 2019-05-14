// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/templates',
    handler: fastify.saveTemplate,
  });

  fastify.route({
    method: 'PUT',
    url: '/templates/:uid',
    schema: {
      params: {
        type: 'object',
        properties: {
          uid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveTemplate,
  });

  fastify.route({
    method: 'DELETE',
    url: '/templates/:uid',
    schema: {
      params: {
        type: 'object',
        properties: {
          uid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteTemplate,
  });

  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/templates',
    querystring: {
      format: { type: 'string' },
    },
    // schema: {
    //   response: {
    //     200: 'templates_schema#',
    //   },
    // },

    handler: fastify.getTemplates,
  });
}

module.exports = routes;
