// defines routes for accessing aims
async function otherRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/files',
    schema: {
      tags: ['files'],
    },
    handler: fastify.saveFile,
  });
  fastify.route({
    method: 'GET',
    url: '/files',
    schema: {
      tags: ['files'],
    },
    handler: fastify.getFiles,
  });
  fastify.route({
    method: 'GET',
    url: '/files/:filename',
    schema: {
      tags: ['files'],
      params: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getFile,
  });

  fastify.route({
    method: 'GET',
    url: '/notifications',
    handler: fastify.getNotifications,
  });

  // old format with trailing /
  fastify.route({
    method: 'GET',
    url: '/epads/stats/',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getStats,
  });

  // this is the new format with no trailing /, keeping the upper to keep inline with old epad
  fastify.route({
    method: 'GET',
    url: '/epads/stats',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getStats,
  });

  // old format with trailing /
  fastify.route({
    method: 'PUT',
    url: '/epad/statistics/templates/',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          host: {
            type: 'string',
          },
          templateCode: {
            type: 'string',
          },
          templateName: {
            type: 'string',
          },
          authors: {
            type: 'string',
          },
          version: {
            type: 'string',
          },
          templateLevelType: {
            type: 'string',
          },
          templateDescription: {
            type: 'string',
          },
          numOfAims: {
            type: 'integer',
          },
        },
        body: {
          type: 'string',
        },
      },
    },
    handler: fastify.saveTemplateStats,
  });

  // this is the new format with no trailing /, keeping the upper to keep inline with old epad
  fastify.route({
    method: 'PUT',
    url: '/epad/statistics/templates',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          host: {
            type: 'string',
          },
          templateCode: {
            type: 'string',
          },
          templateName: {
            type: 'string',
          },
          authors: {
            type: 'string',
          },
          version: {
            type: 'string',
          },
          templateLevelType: {
            type: 'string',
          },
          templateDescription: {
            type: 'string',
          },
          numOfAims: {
            type: 'integer',
          },
        },
        body: {
          type: 'string',
        },
      },
    },
    handler: fastify.saveTemplateStats,
  });

  // old format with trailing /
  fastify.route({
    method: 'PUT',
    url: '/epad/statistics/',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          host: {
            type: 'string',
          },
          numOfUsers: {
            type: 'integer',
          },
          numOfProjects: {
            type: 'integer',
          },
          numOfPatients: {
            type: 'integer',
          },
          numOfStudies: {
            type: 'integer',
          },
          numOfSeries: {
            type: 'integer',
          },
          numOfAims: {
            type: 'integer',
          },
          numOfDSOs: {
            type: 'integer',
          },
          numOfWorkLists: {
            type: 'integer',
          },
          numOfFiles: {
            type: 'integer',
          },
          numOfTemplates: {
            type: 'integer',
          },
          numOfPlugins: {
            type: 'integer',
          },
        },
      },
    },
    handler: fastify.saveStats,
  });

  // this is the new format with no trailing /, keeping the upper to keep inline with old epad
  fastify.route({
    method: 'PUT',
    url: '/epad/statistics',
    schema: {
      tags: ['stats'],
      query: {
        type: 'object',
        properties: {
          host: {
            type: 'string',
          },
          numOfUsers: {
            type: 'integer',
          },
          numOfProjects: {
            type: 'integer',
          },
          numOfPatients: {
            type: 'integer',
          },
          numOfStudies: {
            type: 'integer',
          },
          numOfSeries: {
            type: 'integer',
          },
          numOfAims: {
            type: 'integer',
          },
          numOfDSOs: {
            type: 'integer',
          },
          numOfWorkLists: {
            type: 'integer',
          },
          numOfFiles: {
            type: 'integer',
          },
          numOfTemplates: {
            type: 'integer',
          },
          numOfPlugins: {
            type: 'integer',
          },
        },
      },
    },
    handler: fastify.saveStats,
  });

  // trigger statistics calculations. mainly for testing purposes
  fastify.route({
    method: 'GET',
    url: '/epad/statistics/calc',
    schema: {
      tags: ['stats'],
    },
    handler: fastify.triggerStats,
  });

  fastify.route({
    method: 'POST',
    url: '/scanfolder',
    schema: {
      tags: ['files'],
    },
    handler: fastify.scanFolder,
  });

  fastify.route({
    method: 'GET',
    url: '/userinfo',
    schema: {
      tags: ['user'],
    },
    handler: fastify.getUserInfo,
  });

  fastify.route({
    method: 'GET',
    url: '/wado/',
    schema: {
      tags: ['wado'],
      query: {
        type: 'object',
        properties: {
          studyUID: {
            type: 'string',
          },
          seriesUID: {
            type: 'string',
          },
          objectUID: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getWado,
  });

  fastify.route({
    method: 'GET',
    url: '/wadors/studies/:study/series/:series/instances/:instance',
    schema: {
      tags: ['wado'],
    },
    handler: fastify.getWadoRS,
  });

  fastify.route({
    method: 'POST',
    url: '/polldw',
    handler: fastify.triggerPollDW,
  });

  fastify.route({
    method: 'GET',
    url: '/decrypt',
    handler: fastify.decrypt,
  });

  fastify.route({
    method: 'PUT',
    url: '/decryptandadd',
    handler: fastify.decryptAdd,
  });

  fastify.route({
    method: 'POST',
    url: '/reports/waterfall',
    schema: {
      tags: ['report'],
    },
    handler: fastify.getWaterfallReport,
  });

  fastify.route({
    method: 'GET',
    url: '/search',
    handler: fastify.search,
  });
}
module.exports = otherRoutes;
