// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'GET',
    url: '/pluginsprojects', // pluginswithproject ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getPluginsWithProject,
  });
  fastify.route({
    method: 'GET',
    url: '/projects/:projectid/plugins', // /plugins/project/:projectid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getPluginsForProject,
  });

  fastify.route({
    method: 'GET',
    url: '/pluginsannotationstemplates', // /plugins/annotation/templates ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getAnnotationTemplates,
  });

  fastify.route({
    method: 'GET',
    url: '/pluginsannotationsprojects', // /plugins/annotation/projects ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getAnnotationProjects,
  });

  fastify.route({
    method: 'POST',
    url: '/plugindefaultparameters', // /plugins/parameters/default/addnew ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.saveDefaultParameter,
  });

  fastify.route({
    method: 'POST',
    url: '/plugindefaultparameters/edit', // /plugins/parameters/default/edit/ ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.editDefaultparameter,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginprojectparameters', //  /plugins/parameters/project/addnew ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.saveProjectParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginprojectparameters/edit', // /plugins/parameters/project/edit/ ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.editProjectParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugintemplateparameters', // /plugins/parameters/template/addnew ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.saveTemplateParameter,
  });
  fastify.route({
    method: 'POST',
    url: '/plugintemplateparameters/edit', //  /plugins/parameters/template/edit/ ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.editTemplateParameter,
  });

  // GET {s}/templates
  // fastify.route({
  //   // ok
  //   method: 'GET',
  //   url: '/plugins',
  //   schema: {
  //     tags: ['plugins'],
  //   },
  //   handler: fastify.getPlugins,
  // });
  fastify.route({
    method: 'POST',
    url: '/plugins', // /plugins/addnew ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.savePlugin,
  });
  fastify.route({
    // ok
    method: 'POST',
    url: '/plugins/edit',
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.editPlugin,
  });

  fastify.route({
    method: 'POST',
    url: '/plugins/delete', // /plugins ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.deletePlugin,
  });

  fastify.route({
    method: 'GET',
    url: '/plugins/:plugindbid', // ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getOnePlugin,
  });
  fastify.route({
    method: 'GET',
    url: '/plugins/:plugindbid/defaultparameters', // /plugins/parameters/default/:plugindbid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getDefaultParameter,
  });
  fastify.route({
    method: 'PUT',
    url: '/plugins/:pluginid/projects/:projectids', // ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.updateProjectsForPlugin,
  });

  fastify.route({
    method: 'PUT',
    url: '/plugins/:pluginid/templates/:templateids', // ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.updateTemplatesForPlugin,
  });
  fastify.route({
    method: 'GET',
    url: '/plugins/:plugindbid/project/:projectdbid/projectparameters', // /plugins/parameters/project/:plugindbid/:projectdbid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getProjectParameter,
  });
  fastify.route({
    method: 'GET',
    url: '/plugins/:plugindbid/template/:templatedbid/templateparameters', // /plugins/parameters/template/:plugindbid/:templatedbid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getTemplateParameter,
  });

  fastify.route({
    method: 'GET',
    url: '/pluginqueue', // /plugins/queue/ ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.getPluginsQueue,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginqueue', // /plugins/queue/add ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.addPluginsToQueue,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginqueue/run', //  /plugins/queue/run ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.runPluginsQueue,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginqueue/stop', // /plugins/queue/stop ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.stopPluginsQueue,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginqueue/delete', // /plugins/queue/delete ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.deleteFromPluginQueue,
  });
  fastify.route({
    method: 'POST',
    url: '/pluginqueue/download', //  /plugins/download/queue/result ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.downloadPluginResult,
  });

  fastify.route({
    method: 'DELETE',
    url: '/pluginparameters/:parameterdbid/default', // /plugins/parameters/default/:parameterdbid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.deleteOneDefaultParameter,
  });
  fastify.route({
    method: 'DELETE',
    url: '/pluginparameters/:parameterdbid/project', //  /plugins/parameters/project/:parameterdbid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.deleteOneProjectParameter,
  });
  fastify.route({
    method: 'DELETE',
    url: '/pluginparameters/:parameterdbid/template', // /plugins/parameters/template/:parameterdbid ok
    schema: {
      tags: ['plugins'],
    },
    handler: fastify.deleteOneTemplateParameter,
  });
}
module.exports = routes;
