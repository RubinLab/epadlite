// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects',
    handler: fastify.createProject,
  });

  //   fastify.route({
  //     method: 'PUT',
  //     url: '/projects/:projectId',
  //     schema: {
  //       params: {
  //         type: 'object',
  //         properties: {
  //           projectId: {
  //             type: 'string',
  //           },
  //         },
  //       },
  //     },
  //     handler: fastify.updateTemplate,
  //   });

  // TODO
  //   fastify.route({
  //     method: 'DELETE',
  //     url: '/projects/:projectId',
  //     schema: {
  //       params: {
  //         type: 'object',
  //         properties: {
  //           uid: {
  //             type: 'string',
  //           },
  //         },
  //       },
  //     },
  //     handler: fastify.deleteProject,
  //   });

  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/projects',
    // schema: {
    //   response: {
    //     200: 'templates_schema#',
    //   },
    // },

    handler: fastify.getProjects,
  });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:projectId/aims',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.getProjectAims,
  // });

  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:projectId/aims',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.addProjectAim,
  // });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:projectId/aims/:aimId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //         aimId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.getProjectAim,
  // });

  // fastify.route({
  //   method: 'PUT',
  //   url: '/projects/:projectId/aims/:aimId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //         aimId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.addProjectAim,
  // });

  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:projectId/aims/:aimId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //         aimId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.deleteProjectAim,
  // });

  // subjects
  fastify.route({
    method: 'GET',
    url: '/projects/:projectId/subjects',
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectSubjects,
  });

  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:projectId/subjects',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.addProjectSubject,
  // });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:projectId/subjects/:subjectId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         projectId: {
  //           type: 'string',
  //         },
  //         subjectId: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.getProjectSubject,
  // });

  fastify.route({
    method: 'PUT',
    url: '/projects/:projectId/subjects/:subjectId',
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
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

  fastify.route({
    method: 'DELETE',
    url: '/projects/:projectId/subjects/:subjectId',
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
          },
          subjectId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteSubjectFromProject,
  });
}

module.exports = routes;
