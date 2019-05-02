// defines routes for accessing aims
async function aimRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/aims',
    handler: fastify.saveAim,
  });

  // TODO
  // fastify.route({
  //   method: 'PUT',
  //   url: '/aims',
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
  //   handler: fastify.updateAim,
  // });

  // GET {s}/studies/:study/series/:series/aims
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/studies/:study/series/:series/aims',
    schema: {
      params: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },

    handler: fastify.getSeriesAims,
  });
}

module.exports = aimRoutes;
