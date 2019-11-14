// defines routes for project dicomweb connections
async function routes(fastify) {
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects',
    schema: {
      tags: ['project', 'subject'],
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

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies',
    schema: {
      tags: ['project', 'study'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
        },
      },
      response: {
        200: 'epadlite_studies_schema#',
      },
    },
    handler: fastify.getPatientStudiesFromProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/series',
    schema: {
      tags: ['project', 'series'],
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
      response: {
        200: 'epadlite_series_schema#',
      },
    },
    handler: fastify.getStudySeriesFromProject,
  });

  // GET images
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/images',
    schema: {
      tags: ['project', 'images'],
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
          series: {
            type: 'string',
          },
        },
      },
      response: {
        200: 'epadlite_images_schema#',
      },
    },

    handler: fastify.getSeriesImagesFromProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series',
    schema: {
      tags: ['project', 'series'],
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
          series: {
            type: 'string',
          },
        },
      },
    },
    // TODO should we do any project level checks
    handler: fastify.deleteSeries,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject/studies/:study',
    schema: {
      tags: ['project', 'study'],
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

    handler: fastify.deletePatientStudyFromProject,
  });
  // moved to dicomweb to keep together the routes related to dicomweb server
  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject',
    schema: {
      tags: ['project', 'subject'],
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

  fastify.route({
    method: 'POST',
    url: '/projects/:project/subjects',
    schema: {
      tags: ['project', 'subject'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          subjectUid: {
            type: 'string',
          },
          subjectName: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.addSubjectToProject,
  });

  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/subjects/:subject/studies',
  //   schema: {
  //     tags: ['project', 'study'],
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
  //     body: {
  //       type: 'object',
  //       properties: {
  //         studyUid: {
  //           type: 'string',
  //         },
  //         studyDescription: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.addPatientStudyToProject,
  // });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject',
    schema: {
      tags: ['project', 'subject'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.addSubjectToProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject/studies/:study',
    schema: {
      tags: ['project', 'study'],
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
    handler: fastify.addPatientStudyToProject,
  });

  fastify.route({
    method: 'POST',
    url: '/projects/:project/subjects/:subject/studies',
    schema: {
      tags: ['project', 'study'],
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
      body: {
        type: 'object',
        properties: {
          studyUid: {
            type: 'string',
          },
          studyDesc: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.addPatientStudyToProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study',
    schema: {
      tags: ['project', 'study'],
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

    handler: fastify.getPatientStudyFromProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject',
    schema: {
      tags: ['project', 'subject'],
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

    handler: fastify.getSubjectFromProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/studies',
    schema: {
      tags: ['project', 'study'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },

    handler: fastify.getStudiesFromProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series',
    schema: {
      tags: ['project', 'series'],
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
          series: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.addNondicomSeries,
  });

  fastify.route({
    method: 'POST',
    url: '/projects/:project/subjects/:subject/studies/:study/series',
    schema: {
      tags: ['project', 'series'],
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
      body: {
        type: 'object',
        properties: {
          seriesUid: {
            type: 'string',
          },
          description: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.addNondicomSeries,
  });
}
module.exports = routes;
