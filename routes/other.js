// defines routes for accessing aims
async function otherRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/files',
    handler: fastify.saveFile,
  });

  fastify.route({
    method: 'DELETE',
    url: '/subjects/:subject/studies/:study/series/:series',
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
    },

    handler: fastify.deleteSeries,
  });

  fastify.route({
    method: 'DELETE',
    url: '/subjects/:subject/studies/:study',
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
        },
      },
    },

    handler: fastify.deleteStudy,
  });

  fastify.route({
    method: 'DELETE',
    url: '/subjects/:subject',
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
        },
      },
    },

    handler: fastify.deleteSubject,
  });
}
module.exports = otherRoutes;
