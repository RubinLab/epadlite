// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'GET',
    url: '/ontology',
    schema: {
      tags: ['ontology'],
      querystring: {
        codevalue: { type: 'string' },
        codemeaning: { type: 'string' },
        description: { type: 'string' },
        schemaversion: { type: 'string' },
      },
      // response: {
      //   200: {
      //     type: 'object',
      //     properties: {
      //       id: { type: 'number' },
      //       name: { type: 'string' },
      //       parentId: { type: 'number' },
      //     },
      //   },
      // },
    },

    handler: fastify.getOntologyAll,
  });

  fastify.route({
    method: 'GET',
    url: '/ontology/:codevalue',
    schema: {
      tags: ['ontology'],
      params: {
        type: 'object',
        required: ['codevalue'],
        properties: {
          codevalue: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: {
      //     type: 'object',
      //     properties: {
      //       id: { type: 'number' },
      //       name: { type: 'string' },
      //       parentId: { type: 'number' },
      //     },
      //   },
      // },
    },
    handler: fastify.getOntologyTerm,
  });

  fastify.route({
    method: 'POST',
    url: '/ontology',
    schema: {
      tags: ['ontology'],
      body: {
        type: 'object',
        required: ['codemeaning', 'codevalue', ''],
        properties: {
          codemeaning: { type: 'string' },
          codevalue: { type: 'string' },
          description: { type: 'string' },
          schemadesignator: { type: 'string' },
          schemaversion: { type: 'string' },
          creator: { type: 'string' },
        },
      },
    },
    handler: fastify.insertOntologyItem,
  });

  fastify.route({
    method: 'PUT',
    url: '/ontology/:codevalue',
    schema: {
      tags: ['ontology'],
      body: {
        type: 'object',
        required: ['codevalue'],
        properties: {
          codevalue: { type: 'string' },
          codemeaning: { type: 'string' },
          description: { type: 'string' },
          schemadesignator: { type: 'string' },
          schemaversion: { type: 'string' },
        },
      },
    },
    handler: fastify.updateOntologyItem,
  });

  fastify.route({
    method: 'DELETE',
    url: '/ontology/:codevalue',
    schema: {
      tags: ['ontology'],
      params: {
        type: 'object',
        required: ['codevalue'],
        properties: {
          codevalue: { type: 'string' },
        },
      },
    },
    handler: fastify.deleteOntologyItem,
  });
}
module.exports = routes;
