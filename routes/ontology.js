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
    },
    handler: fastify.getAll,
  });

  fastify.route({
    method: 'GET',
    url: '/ontology/:codevalue',
    schema: {
      tags: ['ontology'],
      params: {
        type: 'object',
        properties: {
          codevalue: {
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
          codemeaning: { type: 'string' },
          codevalue: { type: 'string' },
          description: { type: 'string' },
          schemadesignator: { type: 'string' },
          schemaversion: { type: 'string' },
          creator: { type: 'string' },
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
  // fastify.route({
  //   method: 'PUT',
  //   url: '/ontology/search',
  //   schema: {
  //     tags: ['ontology'],
  //     body: {
  //       type: 'object',
  //       properties: {
  //         CODE_VALUE: { type: 'string' },
  //         CODE_MEANING: { type: 'string' },
  //         description: { type: 'string' },
  //         SCHEMA_DESIGNATOR: { type: 'string' },
  //         SCHEMA_VERSION: { type: 'string' },
  //         creator: { type: 'string' },
  //       },
  //     },
  //   },
  //   handler: fastify.searchTerm,
  // });

  fastify.route({
    method: 'PUT',
    url: '/ontology/:CODE_VALUE',
    schema: {
      tags: ['ontology'],
      body: {
        type: 'object',
        properties: {
          // ID: { type: 'integer' },
          codevalue: { type: 'string' },
          codemeaning: { type: 'string' },
          description: { type: 'string' },
          schemadesignator: { type: 'string' },
          schemaversion: { type: 'string' },
        },
      },
    },
    handler: fastify.updateItem,
  });
}
module.exports = routes;
