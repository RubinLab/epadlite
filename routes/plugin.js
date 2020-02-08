// defines routes for templates
async function routes(fastify) {
  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/plugins',
    schema: {
      tags: ['plugins'],
      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getPlugins,
  });
  fastify.route({
    method: 'GET',
    url: '/pluginswithproject',
    schema: {
      tags: ['plugins'],
      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getPluginsWithProject,
  });
  fastify.route({
    method: 'PUT',
    url: '/plugins/:pluginid/projects/:projectids',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.updateProjectsForPlugin,
  });

  fastify.route({
    method: 'PUT',
    url: '/plugins/:pluginid/templates/:templateids',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.updateTemplatesForPlugin,
  });

  fastify.route({
    method: 'POST',
    url: '/plugins',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.deletePlugin,
  });
  fastify.route({
    method: 'POST',
    url: '/plugins/addnew',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.savePlugin,
  });

  fastify.route({
    method: 'GET',
    url: '/plugins/docker/images',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getDockerImages,
  });
  //docker section below
}
module.exports = routes;