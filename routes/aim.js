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

  // GET {s}/subjects/:subject/studies/:study/series/:series/aims
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/studies/:study/series/:series/aims',
    schema: {
      querystring: {
        format: { type: 'string' },
      },
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

  // GET {s}/subjects/:subject/studies/:study/aims
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/studies/:study/aims',
    schema: {
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },

    handler: fastify.getStudyAims,
  });

  // GET {s}/subjects/:subject/aims
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/aims',
    schema: {
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },

    handler: fastify.getSubjectAims,
  });
}

module.exports = aimRoutes;
