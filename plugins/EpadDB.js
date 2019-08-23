const fp = require('fastify-plugin');
// const Sequelize = require('sequelize');

async function epaddb(fastify) {
  const Project = fastify.orm.import(`${__dirname}/../models/project`);
  const Worklist = fastify.orm.import(`${__dirname}/../models/worklist`);
  const WorklistStudy = fastify.orm.import(`${__dirname}/../models/worklist_study`);
  Worklist.hasMany(WorklistStudy, { foreignKey: 'worklist_id' });
  fastify.decorate('initMariaDB', async () => {
    // Test connection
    fastify.orm
      .authenticate()
      .then(() => {
        fastify.orm
          .sync()
          .then(() => {
            console.log('db sync successful!');
          })
          .catch(err => console.log(err));
        console.log('Connection to mariadb has been established successfully.');
      })
      .catch(err => {
        console.error('Unable to connect to the database:', err);
      });
  });

  // PROJECTS
  fastify.decorate('createProject', (request, reply) => {
    Project.create({
      name: request.body.projectName,
      projectid: request.body.projectId,
      description: request.body.projectDescription,
      defaulttemplate: request.body.defaultTemplate,
      type: request.body.type,
      updatetime: Date.now(),
      creator: request.body.userName,
    })
      .then(project => {
        reply.code(200).send(`success with id ${project.id}`);
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
    Project.findAll()
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

  fastify.decorate('createWorklist', (request, reply) => {
    Worklist.create({
      name: request.body.name,
      worklistid: request.body.worklistid,
      user_id: request.params.userId,
      description: request.body.description,
      updatetime: Date.now(),
      duedate: request.body.due ? new Date(`${request.body.due}T00:00:00`) : null,
      creator: request.body.username,
    })
      .then(worklist => {
        reply.code(200).send(`success with id ${worklist.id}`);
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('linkWorklistToStudy', (request, reply) => {
    WorklistStudy.create({
      worklist_id: request.params.worklistId,
      project_id: request.params.projectId,
      updatetime: Date.now(),
      study_id: request.body.studyId ? request.body.studyId : null,
      subject_id: request.body.subjectId ? request.body.subjectId : null,
    })
      .then(res => {
        reply.code(200).send(`success with id ${res.id}`);
      })
      .catch(err => {
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('updateWorklist', (request, reply) => {
    Worklist.update(
      { ...request.body, updatetime: Date.now(), updated_by: request.body.username },
      {
        where: {
          user_id: request.params.userId,
          worklistid: request.params.worklistId,
        },
      }
    )
      .then(() => {
        reply.code(200).send('Update successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('getWorklists', (request, reply) => {
    Worklist.findAll({
      where: {
        user_id: request.params.userId,
      },
      include: [
        {
          model: WorklistStudy,
        },
      ],
    })
      .then(worklist => {
        const result = [];
        for (let i = 0; i < worklist.length; i += 1) {
          const obj = {
            completionDate: worklist[i].completedate,
            dueDate: worklist[i].duedate,
            name: worklist[i].name,
            startDate: worklist[i].startdate,
            username: worklist[i].user_id,
            workListID: worklist[i].worklistid,
            description: worklist[i].description,
            projectIDs: [],
            studyStatus: [],
            studyIDs: [],
            subjectIDs: [],
          };
          const studiesArr = worklist[i].worklist_studies;
          for (let k = 0; k < studiesArr.length; k += 1) {
            obj.projectIDs.push(studiesArr[k].dataValues.project_id);
            obj.studyStatus.push(studiesArr[k].dataValues.status);
            obj.studyIDs.push(studiesArr[k].dataValues.study_id);
            obj.subjectIDs.push(studiesArr[k].dataValues.subject_id);
          }
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
