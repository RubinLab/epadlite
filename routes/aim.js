// defines routes for accessing aims
async function aimRoutes(fastify) {
  // add an aim document, updates if exists
  fastify.route({
    method: 'POST',
    url: '/aims',
    handler: fastify.saveAim,
  });

  // update an aim document
  fastify.route({
    method: 'PUT',
    url: '/aims/:aimuid',
    schema: {
      params: {
        type: 'object',
        properties: {
          aimuid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveAim,
  });

  // delete an aim document
  fastify.route({
    method: 'DELETE',
    url: '/aims/:aimuid',
    schema: {
      params: {
        type: 'object',
        properties: {
          aimuid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteAim,
  });

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
