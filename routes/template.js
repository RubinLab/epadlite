// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/templates',
    handler: fastify.saveTemplate,
  });

  // TODO
  // fastify.route({
  //   method: 'PUT',
  //   url: '/templates',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         uid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.updateTemplate,
  // });

  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/templates',
    // schema: {
    //   response: {
    //     200: 'templates_schema#',
    //   },
    // },

    handler: fastify.getTemplates,
  });
}

module.exports = routes;
