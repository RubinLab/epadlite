// defines routes for templates
async function routes(fastify) {
  fastify.route({
    method: 'POST',
    url: '/projects/:project/files',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveFile,
  });
  fastify.route({
    method: 'POST',
    url: '/projects/:project/subjects/:subject/files',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveFile,
  });
  fastify.route({
    method: 'POST',
    url: '/projects/:project/subjects/:subject/studies/:study/files',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveFile,
  });
  fastify.route({
    method: 'POST',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/files',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveFile,
  });

  fastify.route({
    method: 'POST',
    url: '/projects',
    schema: {
      tags: ['project'],
    },
    handler: fastify.createProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project',
    schema: {
      tags: ['project'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project',
    schema: {
      tags: ['project'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteProject,
  });

  // GET {s}/templates
  fastify.route({
    method: 'GET',
    url: '/projects',
    schema: {
      tags: ['project'],
      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getProjects,
  });

  //  cavit
  fastify.route({
    method: 'GET',
    url: '/projectswithpkasid',
    schema: {
      tags: ['project'],
      //   response: {
      //     200: 'templates_schema#',
      //   },
    },
    handler: fastify.getProjectsWithPkAsId,
  });

  // getting all plugins for given project(s)
  // fastify.route({
  //   method: 'GET',
  //   url: '/projects/plugins/:projectids',
  //   schema: {
  //     tags: ['project'],
  //     //   response: {
  //     //     200: 'templates_schema#',
  //     //   },
  //   },
  //   handler: fastify.getProjectsWithPlugins,
  // });
  //  cavit

  fastify.route({
    method: 'GET',
    url: '/projects/:project',
    schema: {
      tags: ['project'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProject,
  });
  fastify.route({
    method: 'POST',
    url: '/projects/:project/download',
    schema: {
      tags: ['project'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/files',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFiles,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/users',
    schema: {
      tags: ['project', 'users'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectUsers,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/files',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFiles,
  });
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/files',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFiles,
  });
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/files',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFiles,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteFileFromProject,
  });
  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteFileFromProject,
  });
  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject/studies/:study/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteFileFromProject,
  });
  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteFileFromProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/files/:filename',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFile,
  });
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/files/:filename',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFile,
  });
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/files/:filename',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFile,
  });
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/files/:filename',
    schema: {
      tags: ['project', 'files'],
      querystring: {
        format: { type: 'string' },
      },
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectFile,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.putOtherFileToProject,
  });
  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.putOtherFileToProject,
  });
  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject/studies/:study/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.putOtherFileToProject,
  });
  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/files/:filename',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
          series: {
            type: 'string',
          },
          filename: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.putOtherFileToProject,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/users/:user',
    schema: {
      tags: ['project', 'users'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          user: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.updateProjectUserRole,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/users/:user',
    schema: {
      tags: ['project', 'users'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          user: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteProjectUser,
  });

  fastify.route({
    method: 'POST',
    url: '/projects/:project/scanfolder',
    schema: {
      tags: ['project', 'files'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.scanFolder,
  });

  fastify.route({
    method: 'PUT',
    url: '/projects/:project/subjects/:subject/studies/:study/significantSeries',
    schema: {
      tags: ['project'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.setSignificantSeries,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/significantSeries',
    schema: {
      tags: ['project'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          subject: {
            type: 'string',
          },
          study: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getSignificantSeries,
  });
}
module.exports = routes;
