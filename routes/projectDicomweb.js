// defines routes for project dicomweb connections
async function routes(fastify) {
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects',
    schema: {
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
      response: {
        200: 'epadlite_patients_schema#',
      },
    },
    handler: fastify.getPatientsFromProject,
  });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subject/studies',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //     response: {
  //       200: 'epadlite_patients_schema#',
  //     },
  //   },
  //   handler: fastify.getPatientStudies,
  // });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //     response: {
  //       200: 'epadlite_patients_schema#',
  //     },
  //   },
  //   handler: fastify.getStudySeries,
  // });

  // // GET images
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series/:series/images',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         series: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //     response: {
  //       200: 'epadlite_images_schema#',
  //     },
  //   },

  //   handler: fastify.getSeriesImages,
  // });

  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series/:series',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         series: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },

  //   handler: fastify.deleteSeries,
  // });

  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:project/subjects/:subject/studies/:study',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },

  //   handler: fastify.deleteStudy,
  // });
  // moved to dicomweb to keep together the routes related to dicomweb server
  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject',
    schema: {
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
        },
      },
    },

    handler: fastify.deleteSubjectFromProject,
  });

  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/subjects',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.addProjectSubject,
  // });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject',
    schema: {
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subjectId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.addSubjectToProject,
  });
}
module.exports = routes;
