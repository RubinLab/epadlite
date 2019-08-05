// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects',
    handler: fastify.createProject,
  });

  //   fastify.route({
  //     method: 'PUT',
  //     url: '/projects/:projectId',
  //     schema: {
  //       params: {
  //         type: 'object',
  //         properties: {
  //           projectId: {
  //             type: 'string',
  //           },
  //         },
  //       },
  //     },
  //     handler: fastify.updateTemplate,
  //   });

  // TODO
  //   fastify.route({
  //     method: 'DELETE',
  //     url: '/projects/:projectId',
  //     schema: {
  //       params: {
  //         type: 'object',
  //         properties: {
  //           uid: {
  //             type: 'string',
  //           },
  //         },
  //       },
  //     },
  //     handler: fastify.deleteProject,
  //   });

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
}

module.exports = routes;
