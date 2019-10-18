// defines routes for worklists
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/worklists',
    schema: {
      tags: ['worklist', 'user'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          worklistName: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
          assignee: {
            type: 'array',
          },
          description: {
            type: 'string',
          },
          dueDate: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.createWorklist,
  });

  // fastify.route({
  //   method: 'POST',
  //   url: '/worklists/:worklist/projects/:project/subjects',
  //   schema: {
  //     tags: ['worklist', 'subject'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         user: {
  //           type: 'string',
  //         },
  //         worklist: {
  //           type: 'string',
  //         },
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.linkWorklistToStudy,
  // });

  fastify.route({
    method: 'GET',
    url: '/worklists',
    schema: {
      tags: ['worklist'],
    },
    handler: fastify.getWorklistsOfCreator,
  });

  fastify.route({
    method: 'GET',
    url: '/users/:user/worklists',
    schema: {
      tags: ['worklist', 'user'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getWorklistsOfAssignee,
  });

  fastify.route({
    method: 'POST',
    url: '/worklists/:worklist/projects/:project/subjects/:subject/studies/:study',
    schema: {
      tags: ['worklist', 'user'],
      params: {
        type: 'object',
        properties: {
          worklist: {
            type: 'string',
          },
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: { type: 'string' },
        },
      },
    },
    handler: fastify.assignStudyToWorklist,
  });

  // fastify.route({
  //   method: 'PUT',
  //   url: '/worklists/:worklist',
  //   schema: {
  //     tags: ['worklist', 'user'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         user: {
  //           type: 'string',
  //         },
  //         worklist: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //     body: {
  //       type: 'object',
  //       properties: {
  //         user: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.updateWorklistAssignee,
  // });

  fastify.route({
    method: 'PUT',
    url: '/worklists/:worklist',
    schema: {
      tags: ['worklist'],
      params: {
        type: 'object',
        properties: {
          worklist: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          description: {
            type: 'string',
          },
          duedate: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateWorklist,
  });

  fastify.route({
    method: 'DELETE',
    url: '/worklists/:worklist',
    schema: {
      tags: ['worklist', 'user'],
      params: {
        type: 'object',
        properties: {
          worklist: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteWorklist,
  });

  fastify.route({
    method: 'PUT',
    url: '/worklists/:worklist/requirement/:requirement',
    schema: {
      tags: ['worklist'],
      params: {
        type: 'object',
        properties: {
          worklist: {
            type: 'string',
          },
          requirement: {
            type: 'integer',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
          },
          numOfAims: {
            type: 'integer',
          },
          template: {
            type: 'string',
          },
          required: {
            type: 'boolean',
          },
        },
      },
    },
    handler: fastify.updateWorklistRequirement,
  });
}
module.exports = routes;
