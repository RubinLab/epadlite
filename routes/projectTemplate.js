// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects/:projectId/templates',
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveTemplateToProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:projectId/templates/:uid',
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
          },
          uid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveTemplateToProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:projectId/templates/:uid',
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
          },
          uid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteTemplateFromProject,
  });

  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/projects/:projectId/templates',
    querystring: {
      format: { type: 'string' },
    },
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
          },
        },
      },
    },
    // schema: {
    //   response: {
    //     200: 'templates_schema#',
    //   },
    // },

    handler: fastify.getProjectTemplates,
  });

  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:projectId/templates/download',
  //   schema: {
  //     body: {
  //       type: 'array',
  //       items: {
  //         type: 'string',
  //       },
  //     },
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },

  //   handler: fastify.getTemplatesFromUIDs,
  // });
}

module.exports = routes;
