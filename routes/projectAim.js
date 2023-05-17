// defines routes for project aims
async function routes(fastify) {
  // // add an aim document, updates if exists
  fastify.route({
    method: 'POST',
    url: '/projects/:project/aimfiles',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveAimFile,
  });
  fastify.route({
    method: 'PUT',
    url: '/projects/:project/aimfiles/:aimuid',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          aimuid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveAimFile,
  });
  fastify.route({
    method: 'POST',
    url: '/projects/:project/aims',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveAimToProject,
  });
  fastify.route({
    method: 'PUT',
    url: '/projects/:project/aims/:aimuid',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          aimuid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.saveAimToProject,
  });
  // delete an aim document
  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/aims/:aimuid',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          aimuid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteAimFromProject,
  });
  // GET {s}/subjects/:subject/studies/:study/series/:series/aims
  // format = count returns a map of image_uid: aim counts for images under that series (it won't have images with no aims)
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/aims',
    schema: {
      description: `no format returns a result with total count and rows having aims in json format.
        format = returnTable returns a table to generate reports from. 
        format = stream returns a stream for download. 
        format = summary returns a result with total count and rows having an array of summary info about aims.
        format = count returns a map of image_uid: aim counts for images under that series (it won't have images with no aims)`,
      tags: ['project', 'aim'],
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
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAims,
  });
  // GET {s}/subjects/:subject/studies/:study/aims
  // format = count returns a map of series_uid: aim counts for series under that study (it won't have series with no aims)
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/aims',
    schema: {
      description: `no format returns a result with total count and rows having aims in json format.
        format = returnTable returns a table to generate reports from. 
        format = stream returns a stream for download. 
        format = summary returns a result with total count and rows having an array of summary info about aims.
        format = count returns a map of series_uid: aim counts for series under that study (it won't have series with no aims)`,
      tags: ['project', 'aim'],
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
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAims,
  });
  // GET {s}/subjects/:subject/aims
  // format = count returns a map of study_uid: aim counts for studies under that subject (it won't have studies with no aims)
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/aims',
    schema: {
      description: `no format returns a result with total count and rows having aims in json format.
        format = returnTable returns a table to generate reports from. 
        format = stream returns a stream for download. 
        format = summary returns a result with total count and rows having an array of summary info about aims.
        format = count returns a map of study_uid: aim counts for studies under that subject (it won't have studies with no aims)`,
      tags: ['project', 'aim'],
      querystring: {
        format: { type: 'string' },
        longitudinal_ref: { type: 'boolean' },
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
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAims,
  });

  // format = count returns a map of subject_uid: aim counts for subjects under that project (it won't have subjects with no aims)
  fastify.route({
    method: 'GET',
    url: '/projects/:project/aims',
    schema: {
      description: `no format returns a result with total count and rows having aims in json format.
        format = returnTable returns a table to generate reports from. 
        format = stream returns a stream for download. 
        format = summary returns a result with total count and rows having an array of summary info about aims.
        format = count returns a map of subject_uid: aim counts for subjects under that project (it won't have subjects with no aims)`,
      tags: ['project', 'aim'],
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
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAims,
  });
  // POST {s}/projects/:project/aims/download
  // we want to have a body of an array of aim uids, so we need to use post
  fastify.route({
    method: 'POST',
    url: '/projects/:project/aims/download',
    querystring: {
      summary: { type: 'boolean' },
      aim: { type: 'boolean' },
    },
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getAimsFromUIDs,
  });

  fastify.route({
    method: 'POST',
    url: '/projects/:project/aims/delete',
    querystring: {
      all: { type: 'string' },
    },
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.deleteAimsFromProject,
  });

  // POST {s}/projects/:project/aims/copy
  // copies the study that aim belongs to and the aim to the new project (:project) for each aim
  // assumes the fromProject is project lite and copies the significant series from project lite
  fastify.route({
    method: 'POST',
    url: '/projects/:project/aims/copy',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.copyAimsWithUIDs,
  });

  // another route to get the project that the copy if performed from
  fastify.route({
    method: 'POST',
    url: '/projects/:project/fromprojects/:fromproject/aims/copy',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          fromproject: {
            type: 'string',
          },
        },
      },
      body: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.copyAimsWithUIDs,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/aims/changes',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getAimVersionChangesProject,
  });

  fastify.route({
    method: 'DELETE',
    url: '/projects/:project/aims',
    querystring: {
      all: { type: 'string' },
    },
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.deleteAimsFromProject,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/aims/:aimuid',
    schema: {
      tags: ['project', 'aim'],
      params: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
          },
          aimuid: {
            type: 'string',
          },
        },
      },
    },
    handler: fastify.getProjectAim,
  });

  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/series/:series/aims/:aimuid',
    schema: {
      tags: ['project', 'aim'],
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
          aimuid: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAim,
  });
  // GET {s}/subjects/:subject/studies/:study/aims
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/studies/:study/aims/:aimuid',
    schema: {
      tags: ['project', 'aim'],
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
          aimuid: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAim,
  });
  // GET {s}/subjects/:subject/aims
  fastify.route({
    method: 'GET',
    url: '/projects/:project/subjects/:subject/aims/:aimuid',
    schema: {
      tags: ['project', 'aim'],
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
          aimuid: {
            type: 'string',
          },
        },
      },
      // response: {
      //   200: 'aim_schema#',
      // },
    },
    handler: fastify.getProjectAim,
  });

  // these subject, study, series aim put, pot, delete routes does not make sense as aim has that info
  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/subjects/:subject/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAimToProject,
  // });
  // fastify.route({
  //   method: 'PUT',
  //   url: '/projects/:project/subjects/:subject/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },

  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAimToProject,
  // });
  // // delete an aim document
  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:project/subjects/:subject/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },

  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.deleteAimFromProject,
  // });
  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/subjects/:subject/studies/:study/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAimToProject,
  // });
  // fastify.route({
  //   method: 'PUT',
  //   url: '/projects/:project/subjects/:subject/studies/:study/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAimToProject,
  // });
  // // delete an aim document
  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:project/subjects/:subject/studies/:study/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.deleteAimFromProject,
  // });
  // fastify.route({
  //   method: 'POST',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series/:series/aims',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         series: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAimToProject,
  // });
  // fastify.route({
  //   method: 'PUT',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series/:series/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         series: {
  //           type: 'string',
  //         },
  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.saveAimToProject,
  // });
  // // delete an aim document
  // fastify.route({
  //   method: 'DELETE',
  //   url: '/projects/:project/subjects/:subject/studies/:study/series/:series/aims/:aimuid',
  //   schema: {
  //     tags: ['project', 'aim'],
  //     params: {
  //       type: 'object',
  //       properties: {
  //         project: {
  //           type: 'string',
  //         },
  //         subject: {
  //           type: 'string',
  //         },
  //         study: {
  //           type: 'string',
  //         },
  //         series: {
  //           type: 'string',
  //         },
  //         aimuid: {
  //           type: 'string',
  //         },
  //       },
  //     },
  //   },
  //   handler: fastify.deleteAimFromProject,
  // });
}
module.exports = routes;
