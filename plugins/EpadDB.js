const fp = require('fastify-plugin');

async function epaddb(fastify) {
  const Project = fastify.orm.import(`${__dirname}/../models/project`);
  const Worklist = fastify.orm.import(`${__dirname}/../models/worklist`);

  fastify.decorate('initMariaDB', async () => {
    // Test connection
    fastify.orm
      .authenticate()
      .then(() => {
        console.log('Connection to mariadb has been established successfully.');
      })
      .catch(err => {
        console.error('Unable to connect to the database:', err);
      });
  });

  fastify.decorate('createProject', (request, reply) => {
    Project.create({
      name: request.query.projectName,
      projectid: request.params.projectId,
      description: request.query.projectDescription,
      defaulttemplate: request.query.defaultTemplate,
      type: request.query.type,
      updatetime: Date.now(),
    })
      .then(project => {
        // console.log(project);
        reply.code(200).send(`success with id ${project.id}`);
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });
  // /users/admin/worklists/idtest11?description=desctest&name=test11
  fastify.decorate('createWorklist', (request, reply) => {
    Worklist.create({
      name: request.query.name,
      worklistid: request.params.worklistId,
      user_id: request.params.userId,
      description: request.query.description,
      updatetime: Date.now(),
    })
      .then(worklist => {
        reply.code(200).send(`success with id ${worklist.id}`);
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('updateProject', (request, reply) => {
    const query = {};
    const keys = Object.keys(request.query);
    const values = Object.values(request.query);
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i] === 'projectName') {
        query.name = values[i];
      } else {
        query[keys[i]] = values[i];
      }
    }
    Project.update(query, {
      where: {
        projectid: request.params.projectId,
      },
    })
      .then(() => {
        reply.code(200).send('Update successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('updateWorklist', (request, reply) => {
    Worklist.update(request.query, {
      where: {
        user_id: request.params.userId,
        worklistid: request.params.worklistId,
      },
    })
      .then(() => {
        reply.code(200).send('Update successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('deleteProject', (request, reply) => {
    Project.destroy({
      where: {
        projectid: request.params.projectId,
      },
    })
      .then(() => {
        reply.code(200).send('Deletion successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('getProjects', (request, reply) => {
    Project.findAll(request)
      .then(projects => {
        // projects will be an array of all Project instances
        // console.log(projects);
        reply.code(200).send(projects);
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });

  // fastify.decorate('getProject', (request, reply) => {
  //   Project.findAll()
  //     .then(projects => {
  //       // projects will be an array of all Project instances
  //       // console.log(projects);
  //       reply.code(200).send(projects);
  //     })
  //     .catch(err => {
  //       console.log(err.message);
  //       reply.code(503).send(err.message);
  //     });
  // });

  /*
  const getWorklistsInternal = params => {
    return new Promise((resolve, reject) => {
      try {
        Worklist.findAll({
          where: {
            user_id: params.userId,
          },
        })
          .then(worklist => {
            // projects will be an array of all Project instances
            // console.log(projects);
            const result = [];
            for (let i = 0; i < worklist.length; i += 1) {
              const obj = {
                completionDate: worklist[i].completedate,
                dueDate: worklist[i].dueDate,
                name: worklist[i].name,
                startDate: worklist[i].startdate,
                username: worklist[i].user_id,
                workListID: worklist[i].worklistid,
              };
              result.push(obj);
            }
            resolve({ ResultSet: { Result: result } });
          })
          .catch(err => {
            reject(err);
          });
      } catch (error) {
        reject(error);
      }
    });
  };

  */
  fastify.decorate('getWorklists', (request, reply) => {
    // getWorklistsInternal(request.params)
    Worklist.findAll({
      where: {
        user_id: request.params.userId,
      },
    })
      .then(worklist => {
        // projects will be an array of all Project instances
        // console.log(projects);
        const result = [];
        for (let i = 0; i < worklist.length; i += 1) {
          const obj = {
            completionDate: worklist[i].completedate,
            dueDate: worklist[i].duedate,
            name: worklist[i].name,
            startDate: worklist[i].startdate,
            username: worklist[i].user_id,
            workListID: worklist[i].worklistid,
          };
          result.push(obj);
        }

        reply.code(200).send({ ResultSet: { Result: result } });
      })
      .catch(err => {
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('deleteWorklist', (request, reply) => {
    Worklist.destroy({
      where: {
        user_id: request.params.userId,
        worklistid: request.params.worklistId,
      },
    })
      .then(() => {
        reply.code(200).send('Deletion successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.after(async () => {
    try {
      await fastify.initMariaDB();
    } catch (err) {
      fastify.log.info(`Cannot connect to mariadb (err:${err}), shutting down the server`);
      fastify.close();
    }
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(epaddb);
