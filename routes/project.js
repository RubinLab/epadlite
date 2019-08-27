// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects',
    handler: fastify.createProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project',
    schema: {
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project',
    schema: {
      params: {
        type: 'object',
        properties: {
          uid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteProject,
  });

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
  //   url: '/projects/:project/aims',
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
  //   handler: fastify.getProjectAims,
  // });

  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/aims',
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
  //   handler: fastify.addProjectAim,
  // });

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/aims/:aimId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
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
  //   url: '/projects/:project/aims/:aimId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
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
  //   url: '/projects/:project/aims/:aimId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
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
    },
    handler: fastify.getProjectSubjects,
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

  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subjectId',
  //   schema: {
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
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
          subjectId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteSubjectFromProject,
  });

  // GET {s}/templates
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project',
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
  //   handler: fastify.getProject,
  // });

  fastify.route({
    method: 'POST',
    url: '/users/:userId/worklists',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.createWorklist,
  });

  fastify.route({
    method: 'POST',
    url: '/users/:userId/worklists/:worklistId/projects/:project/subjects',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.linkWorklistToStudy,
  });

  fastify.route({
    method: 'GET',
    url: '/users/:userId/worklists',
    handler: fastify.getWorklists,
  });

  fastify.route({
    method: 'PUT',
    url: '/users/:userId/worklists/:worklistId',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateWorklist,
  });

  fastify.route({
    method: 'DELETE',
    url: '/users/:userId/worklists/:worklistId',
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteWorklist,
  });
}
module.exports = routes;
