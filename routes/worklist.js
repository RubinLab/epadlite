// defines routes for worklists
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/worklists',
    schema: {
      tags: ['worklist', 'user'],
      // params: {
      //   type: 'object',
      //   properties: {
      //     user: {
      //       type: 'string',
      //     },
      //   },
      // },
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

  fastify.route({
    method: 'GET',
    url: '/worklists/:worklist/users/:user/subjects',
    schema: {
      tags: ['worklist', 'user'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
          worklist: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getWorklistSubjects,
  });

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

  fastify.route({
    method: 'POST',
    url: '/worklists/:worklist/projects/:project/subjects/:subject',
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
        },
      },
    },
    handler: fastify.assignSubjectToWorklist,
  });

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
          assigneeList: {
            type: 'array',
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

  // /worklists/:w/users/:u/projects/:p/subjects/:s/studies/:s - DELETE
  // /worklists/:w/users/:u/projects/:p/subjects/:s - DELETE

  // /worklists/0987iuy/users/admin/subjects - POST

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
