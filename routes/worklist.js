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
            items: {
              type: 'string',
            },
          },
          description: {
            type: 'string',
          },
          duedate: {
            type: 'string',
          },
          requirements: {
            type: 'array',
            items: {
              properties: {
                level: {
                  type: 'string',
                },
                template: {
                  type: 'string',
                },
                numOfAims: {
                  type: 'string',
                },
              },
            },
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
    body: {
      type: 'object',
      properties: {
        studyDesc: {
          type: 'string',
        },
        subjectName: {
          type: 'string',
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
            items: {
              type: 'string',
            },
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

  // /worklists/:w/studies - DELETE
  fastify.route({
    method: 'DELETE',
    url: '/worklists/:worklist/studies',
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
      body: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            projectID: { type: 'string' },
            subjectID: { type: 'string' },
            studyUID: { type: 'string' },
          },
        },
      },
    },
    handler: fastify.deleteStudyToWorklistRelation,
  });

  // /worklists/0987iuy/users/admin/subjects - POST

  // fastify.route({
  //   method: 'PUT',
  //   url: '/worklists/:worklist/requirements/:requirement',
  //   schema: {
  //     tags: ['worklist'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         worklist: {
  //           type: 'string',
  //         },
  //         requirement: {
  //           type: 'integer',
  //         },
  //       },
  //     },
  //     body: {
  //       type: 'object',
  //       properties: {
  //         level: {
  //           type: 'string',
  //         },
  //         numOfAims: {
  //           type: 'integer',
  //         },
  //         template: {
  //           type: 'string',
  //         },
  //         required: {
  //           type: 'boolean',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.setWorklistRequirement,
  // });

  fastify.route({
    method: 'DELETE',
    url: '/worklists/:worklist/requirements/:requirement',
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
    },
    handler: fastify.deleteWorklistRequirement,
  });

  fastify.route({
    method: 'POST',
    url: '/worklists/:worklist/requirements',
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
        type: 'array',
        items: {
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
    },
    handler: fastify.setWorklistRequirement,
  });

  fastify.route({
    method: 'GET',
    url: '/worklists/:worklist/progress',
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
    },
    handler: fastify.getWorklistProgress,
  });
}
module.exports = routes;
