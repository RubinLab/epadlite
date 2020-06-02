// defines routes for tcia
async function routes(fastify) {
  fastify.route({
    method: 'GET',
    url: '/collections/:collection/subjects',
    schema: {
      tags: ['tcia'],
      params: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getTCIAPatientsFromCollection,
  });
}
module.exports = routes;
