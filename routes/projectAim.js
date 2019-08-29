// defines routes for project aims
async function routes() {
  // // add an aim document, updates if exists
  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAim,
  // });
  // // update an aim document
  // fastify.route({
  //   method: 'PUT',
  //   url: '/projects/:project/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAim,
  // });
  // // delete an aim document
  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:project/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.deleteAim,
  // });
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series/:series/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     querystring: {
  //       format: { type: 'string' },
  //     },
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
  //     // response: {
  //     //   200: 'aim_schema#',
  //     // },
  //   },
  //   handler: fastify.getSeriesAimsFromProject,
  // });
  // // GET {s}/subjects/:subject/studies/:study/aims
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subject/studies/:study/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     querystring: {
  //       format: { type: 'string' },
  //     },
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
  //     // response: {
  //     //   200: 'aim_schema#',
  //     // },
  //   },
  //   handler: fastify.getStudyAims,
  // });
  // // GET {s}/subjects/:subject/aims
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/subjects/:subject/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     querystring: {
  //       format: { type: 'string' },
  //     },
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
  //     // response: {
  //     //   200: 'aim_schema#',
  //     // },
  //   },
  //   handler: fastify.getSubjectAims,
  // });
  // // GET {s}/aims
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/:project/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     querystring: {
  //       format: { type: 'string' },
  //     },
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //     // response: {
  //     //   200: 'aim_schema#',
  //     // },
  //   },
  //   handler: fastify.getProjectAims,
  // });
  // // POST {s}/aims/download
  // // we want to have a body of an array of aim uids, so we need to use post
  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/aims/download',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     querystring: {
  //       summary: { type: 'boolean' },
  //       aim: { type: 'boolean' },
  //     },
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //     body: {
  //       type: 'array',
  //       items: {
  //         type: 'string',
  //       },
  //     },
  //     // response: {
  //     //   200: 'aim_schema#',
  //     // },
  //   },
  //   handler: fastify.getAimsFromUIDs,
  // });
}
module.exports = routes;
