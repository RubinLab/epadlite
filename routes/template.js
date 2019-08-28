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
    handler: fastify.deleteTemplateFromSystem,
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

  fastify.route({
    method: 'POST',
    url: '/templates/download',
    schema: {
      body: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },

    handler: fastify.getTemplatesFromUIDs,
  });
}

module.exports = routes;
