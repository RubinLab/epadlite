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
    url: '/wado/:source/',
    schema: {
      tags: ['wado'],
      query: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
          },
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
    // here2 path
    url: '/wadors/:source/studies/:study/series/:series/instances/:instance',
    schema: {
      tags: ['wado'],
      query: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
          instance: {
            type: 'string',
          },
        },
      },
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
    url: '/decryptandgrantaccess',
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

  // so that we can support getting query or params with body
  fastify.route({
    method: 'PUT',
    url: '/search',
    handler: fastify.search,
    description: 'Supports query and fields search using both body and query',
    schema: {
      tags: ['aim'],
      body: {
        type: 'object',
        properties: {
          fields: {
            type: 'object',
            properties: {
              subSpecialty: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              modality: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              diagnosis: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              anatomy: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              myCases: { type: 'boolean' },
              teachingFiles: { type: 'boolean' },
              query: { type: 'string' },
              project: { type: 'string' },
            },
          },
          filter: {
            type: 'object',
            properties: {
              patientName: { type: 'string' },
              subjectID: { type: 'string' },
              accessionNumber: { type: 'string' },
              name: { type: 'string' },
              age: { type: 'string' },
              sex: { type: 'string' },
              modality: { type: 'string' },
              studyDate: { type: 'string' },
              anatomy: { type: 'string' },
              observation: { type: 'string' },
              date: { type: 'string' }, // does not filter time
              templateType: { type: 'string' },
              template: { type: 'string' },
              userName: { type: 'string' },
              fullName: { type: 'string' },
              comment: { type: 'string' },
              project: { type: 'string' },
              projectName: { type: 'string' },
              userComment: { type: 'string' },
            },
            description: `A dictionary of sort fields. Sample value: { name: 'Lesion' }`,
          },
          sort: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: `An array of sort fields. Sample value: ['-name<string>']`,
          },
          query: { type: 'string' },
        },
      },
    },
  });

  fastify.route({
    method: 'GET',
    url: '/apikeys/:appid',
    schema: {
      params: {
        type: 'object',
        properties: {
          appid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getApiKey,
  });

  fastify.route({
    method: 'PUT',
    url: '/apikeys/:appid',
    handler: fastify.setApiKey,
  });

  fastify.route({
    method: 'POST',
    url: '/apikeys',
    handler: fastify.setApiKey,
  });

  fastify.route({
    method: 'POST',
    url: '/appVersion',
    schema: {
      body: {
        type: 'object',
        properties: {
          version: {
            type: 'string',
          },
          branch: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateVersion,
  });

  fastify.route({
    method: 'GET',
    url: '/appVersion',
    handler: fastify.getVersion,
  });
}
module.exports = otherRoutes;
