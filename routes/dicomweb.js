// defines routes to access DICOMweb server
async function routes(fastify) {
  // GET /patients
  fastify.route({
    method: 'GET',
    url: '/subjects',
    schema: {
      tags: ['subject'],
      response: {
        200: 'epadlite_patients_schema#',
      },
    },

    handler: fastify.getPatients,
  });

  // GET /patients/patient/studies
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/studies',
    schema: {
      tags: ['study'],
      params: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
          },
        },
      },
      response: {
        200: 'epadlite_studies_schema#',
      },
    },
    handler: fastify.getPatientStudies,
  });

  // GET series
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/studies/:study/series',
    schema: {
      tags: ['series'],
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
      response: {
        200: 'epadlite_series_schema#',
      },
    },

    handler: fastify.getStudySeries,
  });

  // GET images
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject/studies/:study/series/:series/images',
    schema: {
      tags: ['images'],
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
      response: {
        200: 'epadlite_images_schema#',
      },
    },

    handler: fastify.getSeriesImages,
  });

  fastify.route({
    method: 'DELETE',
    url: '/subjects/:subject/studies/:study/series/:series',
    schema: {
      tags: ['series'],
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
      tags: ['study'],
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
  // moved to dicomweb to keep together the routes related to dicomweb server
  fastify.route({
    method: 'DELETE',
    url: '/subjects/:subject',
    schema: {
      tags: ['subject'],
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
  fastify.route({
    method: 'GET',
    url: '/subjects/:subject',
    schema: {
      tags: ['subject'],
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

    handler: fastify.getPatient,
  });

  fastify.route({
    method: 'GET',
    url: '/studies',
    schema: {
      tags: ['study'],
      response: {
        200: 'epadlite_studies_schema#',
      },
    },
    handler: fastify.getPatientStudies,
  });

  fastify.route({
    method: 'GET',
    url: '/studies/:study',
    schema: {
      tags: ['study'],
      params: {
        type: 'object',
        properties: {
          study: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getPatientStudy,
  });

  fastify.route({
    method: 'GET',
    url: '/series',
    schema: {
      tags: ['series'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },

    handler: fastify.getAllStudySeries,
  });
}

module.exports = routes;
