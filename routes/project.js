// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/files',
    handler: fastify.saveFile,
  });

  fastify.route({
    method: 'POST',
    url: '/projects',
    handler: fastify.createProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project',
    schema: {
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project',
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
    handler: fastify.deleteProject,
  });

  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/projects',
    // schema: {
    //   response: {
    //     200: 'templates_schema#',
    //   },
    // },

    handler: fastify.getProjects,
  });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.getProject,
  // });
}
module.exports = routes;
