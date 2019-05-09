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

  // GET {s}/aims
  fastify.route({
    method: 'GET',
    url: '/aims',
    querystring: {
      format: { type: 'string' },
    },
    schema: {
      // response: {
      //   200: 'aim_schema#',
      // },
    },

    handler: fastify.getProjectAims,
  });

  // POST {s}/aims/download
  // we want to have a body of an array of aim uids, so we need to use post
  fastify.route({
    method: 'POST',
    url: '/aims/download',
    querystring: {
      summary: { type: 'boolean' },
      aim: { type: 'boolean' },
    },
    schema: {
      body: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },

    handler: fastify.getAimsFromUIDs,
  });
}

module.exports = aimRoutes;
