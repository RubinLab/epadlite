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
    url: '/plugins/:plugindbid',
    schema: {
      tags: ['plugins'],
      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getOnePlugin,
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
    method: 'GET',
    url: '/plugins/parameters/default/:plugindbid',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getDefaultParameter,
  });
  fastify.route({
    method: 'GET',
    url: '/plugins/parameters/project/:plugindbid/:projectdbid',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getProjectParameter,
  });
  fastify.route({
    method: 'GET',
    url: '/plugins/parameters/template/:plugindbid/:templatedbid',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getTemplateParameter,
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
  fastify.route({
    method: 'GET',
    url: '/plugins/annotation/templates',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getAnnotationTemplates,
  });

  fastify.route({
    method: 'GET',
    url: '/plugins/annotation/projects',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getAnnotationProjects,
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
    method: 'POST',
    url: '/plugins/parameters/default/addnew',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.saveDefaultParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugins/parameters/project/addnew',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.saveProjectParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugins/parameters/template/addnew',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.saveTemplateParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugins/parameters/default/edit/',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.editDefaultparameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugins/parameters/project/edit/',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.editProjectParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugins/parameters/template/edit/',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.editTemplateParameter,
  });

  fastify.route({
    method: 'POST',
    url: '/plugins/edit',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.editPlugin,
  });

  fastify.route({
    method: 'DELETE',
    url: '/plugins/parameters/default/:parameterdbid',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.deleteOneDefaultParameter,
  });
  fastify.route({
    method: 'DELETE',
    url: '/plugins/parameters/project/:parameterdbid',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.deleteOneProjectParameter,
  });
  fastify.route({
    method: 'DELETE',
    url: '/plugins/parameters/template/:parameterdbid',
    schema: {
      tags: ['plugins'],

      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.deleteOneTemplateParameter,
  });

  //trigger

  //trigger section ends
  //docker section below
}
module.exports = routes;
