// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects/:project/templates',
    schema: {
      tags: ['project', 'template'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveTemplateToProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/templates/:uid',
    schema: {
      tags: ['project', 'template'],
      querystring: {
        format: { enable: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
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
    url: '/projects/:project/templates/:uid',
    schema: {
      tags: ['project', 'template'],
      params: {
        type: 'object',
        properties: {
          project: {
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
    url: '/projects/:project/templates',
    querystring: {
      format: { type: 'string' },
    },
    schema: {
      tags: ['project', 'template'],
      params: {
        type: 'object',
        properties: {
          project: {
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
  //   url: '/projects/:project/templates/download',
  //   schema: {
  //     tags: ['project', 'template'],
  //     body: {
  //       type: 'array',
  //       items: {
  //         type: 'string',
  //       },
  //     },
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },

  //   handler: fastify.getTemplatesFromUIDs,
  // });
}

module.exports = routes;
