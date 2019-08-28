// defines routes for accessing aims
async function otherRoutes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/files',
    handler: fastify.saveFile,
  });
}
module.exports = otherRoutes;
