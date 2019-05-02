// defines routes to access DICOMweb server
async function routes(fastify) {
  // GET /patients
  fastify.route({
    method: 'GET',
    url: '/subjects',
    schema: {
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
      params: {
        type: 'object',
        properties: {
          patient: {
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
}

module.exports = routes;
