// defines routes for worklists
async function routes(fastify) {
  fastify.route({
    method: 'POST',
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
      body: {
        type: 'object',
        properties: {
          worklistName: {
            type: 'string',
          },
          worklistId: {
            type: 'string',
          },
          userId: {
            type: 'string',
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
    method: 'POST',
    url: '/users/:user/worklists/:worklist/projects/:project/subjects',
    schema: {
      tags: ['worklist', 'subject'],
      params: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
          worklist: {
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
    url: '/worklists',
    schema: {
      tags: ['worklist'],
    },
    handler: fastify.getWorklistsOfCreator,
  });

  fastify.route({
    method: 'PUT',
    url: '/users/:user/worklists/:worklist',
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
      body: {
        type: 'object',
        properties: {
          user: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateWorklistAssignee,
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
        },
      },
    },
    handler: fastify.updateWorklist,
  });

  fastify.route({
    method: 'DELETE',
    url: '/users/:user/worklists/:worklist',
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
    handler: fastify.deleteWorklist,
  });
}
module.exports = routes;
