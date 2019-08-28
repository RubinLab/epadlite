// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/templates',
    schema: {
      tags: ['template'],
    },
    handler: fastify.saveTemplate,
  });

  fastify.route({
    method: 'PUT',
    url: '/templates/:uid',
    schema: {
      tags: ['template'],
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
      tags: ['template'],
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
    schema: {
      tags: ['template'],
      //   response: {
      //     200: 'templates_schema#',
      //   },
    },

    handler: fastify.getTemplates,
  });

  fastify.route({
    method: 'POST',
    url: '/templates/download',
    schema: {
      tags: ['template'],
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
