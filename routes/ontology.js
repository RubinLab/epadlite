// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'GET',
    url: '/ontology',
    schema: {
      tags: ['ontology'],
    },
    handler: fastify.getAll,
  });

  fastify.route({
    method: 'GET',
    url: '/ontology/:CODE_VALUE',
    schema: {
      tags: ['ontology'],
      params: {
        type: 'object',
        properties: {
          CODE_VALUE: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getTerm,
  });

  fastify.route({
    method: 'POST',
    url: '/ontology',
    schema: {
      tags: ['ontology'],
      // additionalProperties: false, // it will remove all the field that is NOT in the JSON schema

      body: {
        type: 'object',
        properties: {
          CODE_MEANING: { type: 'string' },
          CODE_VALUE: { type: 'string' },
          description: { type: 'string' },
          SCHEMA_DESIGNATOR: { type: 'string' },
          SCHEMA_VERSION: { type: 'string' },
        },
      },
      // response: {
      //   201: {
      //     type: 'object',
      //     properties: {
      //       id: { type: 'number' },
      //       name: { type: 'string' },
      //       parentId: { type: 'number' },
      //     },
      //   },
      // },
    },
    handler: fastify.insertItem,
  });
  fastify.route({
    method: 'PUT',
    url: '/ontology/search',
    schema: {
      tags: ['ontology'],
      properties: {
        CODE_VALUE: { type: 'string' },
        CODE_MEANING: { type: 'string' },
        description: { type: 'string' },
        SCHEMA_DESIGNATOR: { type: 'string' },
        SCHEMA_VERSION: { type: 'string' },
        creator: { type: 'string' },
      },
    },
    handler: fastify.searchTerm,
  });

  fastify.route({
    method: 'PUT',
    url: '/ontology',
    schema: {
      tags: ['ontology'],
      properties: {
        ID: { type: 'integer' },
        CODE_VALUE: { type: 'string' },
        CODE_MEANING: { type: 'string' },
        description: { type: 'string' },
        SCHEMA_DESIGNATOR: { type: 'string' },
        SCHEMA_VERSION: { type: 'string' },
      },
    },
    handler: fastify.updateItem,
  });
}
module.exports = routes;
