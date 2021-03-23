/* eslint-disable no-underscore-dangle */
/* eslint-disable no-async-promise-executor */
const fp = require('fastify-plugin');

const { aim2dicomsr } = require('aimapi');

async function aimconvert(fastify) {
  fastify.decorate('aim2sr', (request, reply) => {
    try {
      const aim = request.body;
      const reportBuffer = aim2dicomsr(aim);

      reply.send(reportBuffer);
    } catch (err) {
      console.log(err);
    }
    reply.send(null);
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(aimconvert);
