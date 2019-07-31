const fp = require('fastify-plugin');

async function epaddb(fastify) {
  fastify.decorate('init', async () => {
    return null;
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(epaddb);
