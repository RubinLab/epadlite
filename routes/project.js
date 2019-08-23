// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects',
    handler: fastify.createProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:projectId',
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
    handler: fastify.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:projectId',
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

  fastify.route({
    method: 'DELETE',
    url: '/users/:userId/worklists/:worklistId',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteWorklist,
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

  // GET {s}/templates
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:projectId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.getProject,
  // });

  // /users/admin/worklists/idtest11?description=desctest&name=test11
  fastify.route({
    method: 'POST',
    url: '/users/:userId/worklists',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.createWorklist,
  });

  fastify.route({
    method: 'POST',
    url: '/users/:userId/worklists/:worklistId/projects/:projectId/subjects',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
          projectId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.linkWorklistToStudy,
  });

  fastify.route({
    method: 'GET',
    url: '/users/:userId/worklists',
    handler: fastify.getWorklists,
  });

  fastify.route({
    method: 'PUT',
    url: '/users/:userId/worklists/:worklistId',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateWorklist,
  });

  // TODO deleteWorklist
}
module.exports = routes;
