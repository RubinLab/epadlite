//  defines routes for ontology
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
        referenceuid: { type: 'string' },
        referencename: { type: 'string' },
        referencetype: { type: 'string' },
      },
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
    handler: fastify.getOntologyTermByCodeValue,
  });

  // referenceuid : template uid or plugin id
  // referencename : template name or plugin name
  // referencetype : t for template or p for plugin

  fastify.route({
    method: 'POST',
    url: '/ontology',
    schema: {
      tags: ['ontology'],
      body: {
        type: 'object',
        required: ['codemeaning', 'referenceuid', 'referencename', 'referencetype'],
        properties: {
          codemeaning: { type: 'string' },
          codevalue: { type: 'string' },
          description: { type: 'string' },
          schemadesignator: { type: 'string' },
          schemaversion: { type: 'string' },
          referenceuid: { type: 'string' },
          referencename: { type: 'string' },
          referencetype: { type: 'string' },
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
          referenceuid: { type: 'string' },
          referencename: { type: 'string' },
          referencetype: { type: 'string' },
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
