const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');
const Sequelize = require('sequelize');
const config = require('../config/index');

async function epaddb(fastify, options, done) {
  const models = {};

  fastify.decorate('initMariaDB', async () => {
    const sequelizeConfig = {
      dialect: 'mariadb',
      database: config.thickDb.name,
      host: config.thickDb.host,
      port: config.thickDb.port,
      username: config.thickDb.user,
      password: config.thickDb.pass,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      define: {
        timestamps: false,
      },
      logging: config.logger,
    };

    // code from https://github.com/lyquocnam/fastify-sequelize/blob/master/index.js
    // used sequelize itself to get the latest version with mariadb support
    await new Promise(async (resolve, reject) => {
      try {
        const sequelize = new Sequelize(sequelizeConfig);
        fastify.decorate('orm', sequelize);
        await fastify.orm.authenticate();
      } catch (err) {
        if (config.env === 'test') {
          try {
            sequelizeConfig.database = '';
            const sequelize = new Sequelize(sequelizeConfig);
            await sequelize.query(`CREATE DATABASE ${config.thickDb.name};`);
            await fastify.orm.authenticate();
          } catch (testDBErr) {
            fastify.log.info(`Error in creating and connecting testdb ${testDBErr.message}`);
            reject(testDBErr);
          }
        } else {
          fastify.log.info(`Error connecting to db ${config.thickDb.name}: ${err.message}`);
          reject(err);
        }
      }
      try {
        const filenames = fs.readdirSync(`${__dirname}/../models`);
        for (let i = 0; i < filenames.length; i += 1) {
          models[filenames[i].replace(/\.[^/.]+$/, '')] = fastify.orm.import(
            path.join(__dirname, '/../models', filenames[i])
          );
        }
        models.user.belongsToMany(models.project, {
          through: 'project_user',
          as: 'projects',
          foreignKey: 'user_id',
        });
        models.worklist.hasMany(models.worklist_study, {
          foreignKey: 'worklist_id',
        });
        models.project.belongsToMany(models.user, {
          through: 'project_user',
          as: 'users',
          foreignKey: 'project_id',
        });

        await fastify.orm.sync();
        resolve();
      } catch (err) {
        fastify.log.info(`Error loading models and syncronizing db: ${err.message}`);
        reject(err);
      }
    });
  });

  // PROJECTS
  fastify.decorate('createProject', (request, reply) => {
    models.project
      .create({
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
    models.project
      .update(query, {
        where: {
          projectid: request.params.project,
        },
      })
      .then(() => {
        reply.code(200).send('Update successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate(
    'deleteRelationAndOprhanedCouchDocInternal',
    (dbProjectId, relationTable, uidField) =>
      new Promise(async (resolve, reject) => {
        try {
          const uidsToDeleteObjects = await models[relationTable].findAll({
            attributes: [uidField],
            where: { project_id: dbProjectId },
            order: [[uidField, 'ASC']],
          });
          const uidsToDelete = [];
          for (let i = 0; i < uidsToDeleteObjects.length; i += 1)
            uidsToDelete.push(uidsToDeleteObjects[i][uidField]);
          if (uidsToDelete.length > 0) {
            const numDeleted = await models[relationTable].destroy({
              where: { project_id: dbProjectId },
            });
            const uidsLeftObjects = await models[relationTable].findAll({
              attributes: [uidField],
              distinct: true,
              where: { [uidField]: uidsToDelete },
              order: [[uidField, 'ASC']],
            });
            if (uidsToDelete.length === uidsLeftObjects.length)
              fastify.log.info('all files are being used by other projects');
            else {
              const safeToDelete = [];
              let i = 0;
              let j = 0;
              // traverse the arrays once to find the ones that only exists in the first
              // assumptions arrays are both sorted according to uid, second list is a subset of first
              while (i < uidsToDelete.length && j < uidsLeftObjects.length) {
                if (uidsToDelete[i] === uidsLeftObjects[j][uidField]) {
                  i += 1;
                  j += 1;
                } else if (uidsToDelete[i] < uidsLeftObjects[j][uidField]) {
                  safeToDelete.push(uidsToDelete[i]);
                  i += 1;
                } else if (uidsToDelete[i] > uidsLeftObjects[j][uidField]) {
                  // cannot happen!
                }
              }
              // add leftovers
              while (i < uidsToDelete.length) {
                safeToDelete.push(uidsToDelete[i]);
                i += 1;
              }
              if (safeToDelete.length > 0) await fastify.deleteCouchDocsInternal(safeToDelete);
              fastify.log.info(
                `Deleted ${numDeleted} records from ${relationTable} and ${
                  safeToDelete.length
                } docs from couchdb`
              );
            }
          }
          resolve();
        } catch (err) {
          console.log(err.message);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'deleteRelationAndOprhanedSubjectsInternal',
    (dbProjectId, projectId) =>
      new Promise(async (resolve, reject) => {
        try {
          const projectSubjects = await models.project_subject.findAll({
            where: { project_id: dbProjectId },
          });
          if (projectSubjects) {
            for (let i = 0; i < projectSubjects.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.deleteSubjectFromProjectInternal(
                { project: projectId, subject: projectSubjects[i].subject_uid },
                {}
              );
            }
            resolve();
          } else resolve();
        } catch (err) {
          console.log(err.message);
          reject(err);
        }
      })
  );

  fastify.decorate('deleteProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (!project) {
        reply.code(404).send('Project not found');
      } else {
        // delete projects files (delete orphan files)
        await fastify.deleteRelationAndOprhanedCouchDocInternal(
          project.id,
          'project_file',
          'file_uid'
        );
        // delete projects aims (delete orphan aims)
        await fastify.deleteRelationAndOprhanedCouchDocInternal(
          project.id,
          'project_aim',
          'aim_uid'
        );
        // delete projects templates (delete orphan templates)
        await fastify.deleteRelationAndOprhanedCouchDocInternal(
          project.id,
          'project_template',
          'template_uid'
        );

        // delete projects subjects (delete orphan dicom files)
        await fastify.deleteRelationAndOprhanedSubjectsInternal(project.id, request.params.project);

        models.project
          .destroy({
            where: {
              projectId: request.params.project,
            },
          })
          .then(() => {
            reply.code(200).send('Deletion successful');
          })
          .catch(errDelete => {
            console.log(errDelete.message);
            reply.code(503).send(errDelete);
          });
      }
    } catch (err) {
      console.log(err.message);
    }
  });

  fastify.decorate('getProjects', (request, reply) => {
    models.project
      .findAll()
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

  fastify.decorate('createWorklist', async (request, reply) => {
    let userId;
    try {
      // find user id
      userId = await models.user.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }
    models.worklist
      .create({
        name: request.body.name,
        worklistid: request.body.worklistid,
        user_id: userId,
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
    models.worklist_study
      .create({
        worklist_id: request.params.worklist,
        project_id: request.params.project,
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

  fastify.decorate('updateWorklist', async (request, reply) => {
    let userId;
    try {
      // find user id
      userId = await models.user.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }
    models.worklist
      .update(
        { ...request.body, updatetime: Date.now(), updated_by: request.body.username },
        {
          where: {
            user_id: userId,
            worklistid: request.params.worklist,
          },
        }
      )
      .then(() => {
        reply.code(200).send('Update successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('getWorklists', async (request, reply) => {
    let userId;
    try {
      // find user id
      userId = await models.user.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }

    models.worklist
      .findAll({
        where: {
          user_id: userId,
        },
        include: [
          {
            model: models.worklist_study,
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
        reply.code(200).send({ ResultSet: { Result: result, totalRecords: result.length } });
      })

      .catch(err => {
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('deleteWorklist', async (request, reply) => {
    let userId;
    try {
      // find user id
      userId = await models.user.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }
    models.worklist
      .destroy({
        where: {
          user_id: userId,
          worklistid: request.params.worklist,
        },
      })
      .then(() => {
        reply.code(200).send('Deletion successful');
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('saveTemplateToProject', async (request, reply) => {
    try {
      let templateUid = request.params.uid;
      if (request.body) {
        await fastify.saveTemplateInternal(request.body);
        templateUid = request.body.TemplateContainer.uid;
      }
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      await models.project_template.create({
        project_id: project.id,
        template_uid: templateUid,
        enabled: request.query.enable === 'true',
        creator: request.query.username,
        updatetime: Date.now(),
      });
      reply.code(200).send('Saving successful');
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in save: ${err}`);
      reply.code(503).send(`Saving error: ${err}`);
    }
  });

  fastify.decorate('getProjectTemplates', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const templateUids = [];
      const enabled = {};
      models.project_template
        .findAll({ where: { project_id: project.id } })
        .then(projectTemplates => {
          // projects will be an array of Project instances with the specified name
          projectTemplates.forEach(projectTemplate => {
            templateUids.push(projectTemplate.template_uid);
            enabled[projectTemplate.template_uid] = projectTemplate.enabled;
          });
          fastify
            .getTemplatesFromUIDsInternal(request.query, templateUids)
            .then(result => {
              if (request.query.format === 'summary') {
                // add enable disable
                const editedResult = result;
                for (let i = 0; i < editedResult.ResultSet.Result.length; i += 1) {
                  editedResult.ResultSet.Result[i].enabled =
                    enabled[editedResult.ResultSet.Result[i].containerUID] === 1;
                }
                reply.code(200).send(editedResult);
              } else {
                if (request.query.format === 'stream') {
                  reply.header('Content-Disposition', `attachment; filename=templates.zip`);
                }
                reply.code(200).send(result);
              }
            })
            .catch(err => reply.code(503).send(err));
        });
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in save: ${err}`);
      reply.code(503).send(`Saving error: ${err}`);
    }
  });

  fastify.decorate('deleteTemplateFromProject', async (request, reply) => {
    try {
      const templateUid = request.params.uid;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      const numDeleted = await models.project_template.destroy({
        where: { project_id: project.id, template_uid: templateUid },
      });
      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const deletednum = await models.project_template.destroy({
            where: { template_uid: templateUid },
          });
          await fastify.deleteTemplateInternal(request.params);
          reply
            .code(200)
            .send(
              `Template deleted from system and removed from ${deletednum + numDeleted} projects`
            );
        } else {
          const count = await models.project_template.count({
            where: { template_uid: templateUid },
          });
          if (count === 0) {
            await fastify.deleteTemplateInternal(request.params);
            reply
              .code(200)
              .send(`Template deleted from system as it didn't exist in any other project`);
          } else
            reply.code(200).send(`Template not deleted from system as it exists in other project`);
        }
      } catch (deleteErr) {
        console.log(deleteErr);
        reply.code(503).send(`Deletion error: ${deleteErr}`);
      }
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });

  fastify.decorate('deleteTemplateFromSystem', async (request, reply) => {
    try {
      const templateUid = request.params.uid;
      const numDeleted = await models.project_template.destroy({
        where: { template_uid: templateUid },
      });
      await fastify.deleteTemplateInternal(request.params);
      reply.code(200).send(`Template deleted from system and removed from ${numDeleted} projects`);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });

  fastify.decorate('addSubjectToProject', async (request, reply) => {
    try {
      const { subject } = request.params;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const projectSubject = await models.project_subject.create({
        project_id: project.id,
        subject_uid: subject,
        creator: request.query.username,
        updatetime: Date.now(),
      });
      const studies = await fastify.getPatientStudiesInternal(request.params);
      for (let i = 0; i < studies.ResultSet.Result.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await models.project_subject_study.create({
          proj_subj_id: projectSubject.id,
          study_uid: studies.ResultSet.Result[i].studyUID,
          creator: request.query.username,
          updatetime: Date.now(),
        });
      }
      reply.code(200).send('Saving successful');
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in save: ${err}`);
      reply.code(503).send(`Saving error: ${err}`);
    }
  });

  fastify.decorate('getPatientsFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const subjectUids = [];
      const projectSubjects = await models.project_subject.findAll({
        where: { project_id: project.id },
      });
      if (projectSubjects) {
        // projects will be an array of Project instances with the specified name
        for (let i = 0; i < projectSubjects.length; i += 1) {
          subjectUids.push(projectSubjects[i].subject_uid);
        }
      }
      const result = await fastify.getPatientsInternal(subjectUids);
      // TODO implement better error handling/reporting
      if (subjectUids.length !== result.ResultSet.totalRecords)
        console.log(
          `There are ${subjectUids.length} subjects associated with this project. But only ${
            result.ResultSet.totalRecords
          } of them have dicom files`
        );
      reply.code(200).send(result);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });
  fastify.decorate('deleteSubjectFromProject', (request, reply) => {
    fastify
      .deleteSubjectFromProjectInternal(request.params, request.query)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate(
    'deleteSubjectFromProjectInternal',
    (params, query) =>
      new Promise(async (resolve, reject) => {
        try {
          const subjectUid = params.subject;
          const project = await models.project.findOne({
            where: { projectid: params.project },
          });
          if (!project) reject(new Error('Project not found'));
          else {
            const projectSubject = await models.project_subject.findOne({
              where: { project_id: project.id, subject_uid: params.subject },
            });
            if (!projectSubject) reject(new Error('Project subject association not found'));
            else {
              await models.project_subject_study.destroy({
                where: { proj_subj_id: projectSubject.id },
              });
              const numDeleted = await models.project_subject.destroy({
                where: { project_id: project.id, subject_uid: subjectUid },
              });
              // if delete from all or it doesn't exist in any other project, delete from system
              try {
                if (query.all && query.all === 'true') {
                  const projectSubjects = await models.project_subject.findAll({
                    where: { subject_uid: params.subject },
                  });
                  const projSubjIds = [];
                  if (projectSubjects) {
                    for (let i = 0; i < projectSubjects.length; i += 1) {
                      projSubjIds.push(projectSubjects[i].id);
                      // eslint-disable-next-line no-await-in-loop
                      await models.project_subject_study.destroy({
                        where: { proj_subj_id: projectSubjects[i].id },
                      });
                    }
                    await models.project_subject.destroy({
                      where: { id: projSubjIds },
                    });
                  }
                  await fastify.deleteSubjectInternal(params);
                  resolve(`Subject deleted from system and removed from ${numDeleted} projects`);
                } else {
                  const projectSubjects = await models.project_subject.findAll({
                    where: { subject_uid: subjectUid },
                  });
                  if (projectSubjects.length === 0) {
                    await models.project_subject_study.destroy({
                      where: { proj_subj_id: projectSubject.id },
                    });
                    await fastify.deleteSubjectInternal(params);
                    resolve(`Subject deleted from system as it didn't exist in any other project`);
                  } else resolve(`Subject not deleted from system as it exists in other project`);
                }
              } catch (deleteErr) {
                console.log(deleteErr.message);
                reject(deleteErr);
              }
            }
          }
        } catch (err) {
          // TODO Proper error reporting implementation required
          console.log(`Error in delete: ${err}`);
          reject(err);
        }
      })
  );

  // from CouchDB
  // fastify.decorate('getSeriesAimsFromProject', async (request, reply) => {
  //   const project = await models.project.findOne({ where: { projectid: request.params.project } });
  //     const aimUids = [];
  //     const projectSubjects = await models.project_subject.findAll({ where: { project_id: project.id } });
  //     if (projectSubjects)
  //       // projects will be an array of Project instances with the specified name
  //       projectSubjects.forEach(projectSubject => subjectUids.push(projectSubject.subject_uid));
  //     const result = await fastify.getPatientsInternal(subjectUids);
  //     reply.code(200).send(result);
  //   fastify
  //     .getAimsInternal(request.query.format, request.params)
  //     .then(result => {
  //       if (request.query.format === 'stream') {
  //         reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
  //       }
  //       reply.code(200).send(result);
  //     })
  //     .catch(err => reply.code(503).send(err));
  // });

  // fastify.decorate('getStudyAims', (request, reply) => {
  //   fastify
  //     .getAimsInternal(request.query.format, request.params)
  //     .then(result => {
  //       if (request.query.format === 'stream') {
  //         reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
  //       }
  //       reply.code(200).send(result);
  //     })
  //     .catch(err => reply.code(503).send(err));
  // });

  // fastify.decorate('getSubjectAims', (request, reply) => {
  //   fastify
  //     .getAimsInternal(request.query.format, request.params)
  //     .then(result => {
  //       if (request.query.format === 'stream') {
  //         reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
  //       }
  //       reply.code(200).send(result);
  //     })
  //     .catch(err => reply.code(503).send(err));
  // });

  fastify.decorate('getProjectAims', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const aimUids = [];
      const projectAims = await models.project_aim.findAll({ where: { project_id: project.id } });
      // projects will be an array of Project instances with the specified name
      for (let i = 0; i < projectAims.length; i += 1) {
        aimUids.push(projectAims[i].aim_uid);
      }

      fastify
        .getAimsInternal(request.query.format, request.params, aimUids)
        .then(result => {
          if (request.query.format === 'stream') {
            reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
          }
          reply.code(200).send(result);
        })
        .catch(err => reply.code(503).send(err));
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get project aims: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('getProjectAim', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const projectAimCount = await models.project_aim.count({
        where: { project_id: project.id, aim_uid: request.params.aimuid },
      });
      if (projectAimCount !== 1)
        reply
          .code(404)
          .send(`${request.params.aimuid} doesn't exist in project ${request.params.project}`);
      else
        fastify
          .getAimsInternal(request.query.format, request.params, [request.params.aimuid])
          .then(result => {
            if (request.query.format === 'stream') {
              reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
            }
            if (result.length === 1) reply.code(200).send(result[0]);
            else {
              reply.code(404).send(`Aim ${request.params.aimuid} not found`);
            }
          })
          .catch(err => reply.code(503).send(err));
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get project aim: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('saveAimToProject', async (request, reply) => {
    try {
      let aimUid = request.params.aimuid;
      if (request.body) {
        // get the uid from the json and check if it is same with param, then put as id in couch document
        if (
          request.params.aimuid &&
          request.params.aimuid !== request.body.ImageAnnotationCollection.uniqueIdentifier.root
        ) {
          fastify.log.info(
            'Conflicting aimuids: the uid sent in the url should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root'
          );
          reply
            .code(503)
            .send(
              'Conflicting aimuids: the uid sent in the url should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root'
            );
        }
        await fastify.saveAimInternal(request.body);
        aimUid = request.body.ImageAnnotationCollection.uniqueIdentifier.root;
      }
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      await models.project_aim.create({
        project_id: project.id,
        aim_uid: aimUid,
        creator: request.query.username,
        updatetime: Date.now(),
      });
      reply.code(200).send('Saving successful');
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in save: ${err}`);
      reply.code(503).send(`Saving error: ${err}`);
    }
  });

  fastify.decorate('deleteAimFromProject', async (request, reply) => {
    try {
      const aimUid = request.params.aimuid;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      const numDeleted = await models.project_aim.destroy({
        where: { project_id: project.id, aim_uid: aimUid },
      });
      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const deletednum = await models.project_aim.destroy({
            where: { aim_uid: aimUid },
          });
          await fastify.deleteAimInternal(request.params.aimuid);
          reply
            .code(200)
            .send(`Aim deleted from system and removed from ${deletednum + numDeleted} projects`);
        } else {
          const count = await models.project_aim.count({ where: { aim_uid: aimUid } });
          if (count === 0) {
            await fastify.deleteAimInternal(request.params.aimuid);
            reply.code(200).send(`Aim deleted from system as it didn't exist in any other project`);
          } else reply.code(200).send(`Aim not deleted from system as it exists in other project`);
        }
      } catch (deleteErr) {
        console.log(deleteErr);
        reply.code(503).send(`Deletion error: ${deleteErr}`);
      }
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });
  fastify.decorate('deleteAimFromSystem', async (request, reply) => {
    try {
      const aimUid = request.params.aimuid;
      const numDeleted = await models.project_aim.destroy({
        where: { aim_uid: aimUid },
      });
      await fastify.deleteAimInternal(request.params.aimuid);
      reply.code(200).send(`Aim deleted from system and removed from ${numDeleted} projects`);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });

  // from DicomwebServer
  // fastify.decorate('getPatientStudies', (request, reply) => {
  //   fastify
  //     .getPatientStudiesInternal(request.params)
  //     .then(result => reply.code(200).send(result))
  //     .catch(err => reply.code(503).send(err.message));
  // });
  fastify.decorate('addPatientStudyToProject', (request, reply) => {
    fastify
      .addPatientStudyToProjectInternal(request.params, request.query)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.decorate(
    'addPatientStudyToProjectInternal',
    (params, query) =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne({ where: { projectid: params.project } });
          let projectSubject = await models.project_subject.findOne({
            where: { project_id: project.id, subject_uid: params.subject },
          });
          if (!projectSubject)
            projectSubject = await models.project_subject.create({
              project_id: project.id,
              subject_uid: params.subject,
              creator: query.username,
              updatetime: Date.now(),
            });
          // create only when that is noot already there
          const projectSubjectStudy = await models.project_subject_study.findOne({
            where: { proj_subj_id: projectSubject.id, study_uid: params.study },
          });
          if (!projectSubjectStudy)
            await models.project_subject_study.create({
              proj_subj_id: projectSubject.id,
              study_uid: params.study,
              creator: query.username,
              updatetime: Date.now(),
            });
          resolve();
        } catch (err) {
          // TODO Proper error reporting implementation required
          reject(err);
        }
      })
  );

  fastify.decorate('getPatientStudiesFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const studyUids = [];
      const projectSubjects = await models.project_subject.findAll({
        where: { project_id: project.id },
      });
      if (projectSubjects)
        // projects will be an array of Project instances with the specified name
        for (let i = 0; i < projectSubjects.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const projectSubjectStudies = await models.project_subject_study.findAll({
            where: { proj_subj_id: projectSubjects[i].id },
          });
          if (projectSubjectStudies)
            for (let j = 0; j < projectSubjectStudies.length; j += 1) {
              studyUids.push(projectSubjectStudies[j].study_uid);
            }
        }
      const result = await fastify.getPatientStudiesInternal(request.params, studyUids);
      // TODO implement better error handling/reporting
      if (studyUids.length !== result.ResultSet.totalRecords)
        console.log(
          `There are ${studyUids.length} studies associated with this project. But only ${
            result.ResultSet.totalRecords
          } of them have dicom files`
        );
      reply.code(200).send(result);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('deletePatientStudyFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const projectSubject = await models.project_subject.findOne({
        where: { project_id: project.id, subject_uid: request.params.subject },
      });
      let numDeleted = await models.project_subject_study.destroy({
        where: { proj_subj_id: projectSubject.id, study_uid: request.params.study },
      });
      // see if there is any other study refering to this subject in ths project
      const studyCount = await models.project_subject_study.count({
        where: { proj_subj_id: projectSubject.id },
      });
      if (studyCount === 0)
        await models.project_subject.destroy({
          where: { id: projectSubject.id },
        });

      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const projectSubjectStudies = await models.project_subject_study.findAll({
            where: { study_uid: request.params.study },
          });
          const projSubjIds = [];
          const projectSubjectStudyIds = [];
          if (projectSubjectStudies) {
            for (let i = 0; i < projectSubjectStudies.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              const existingStudyCount = await models.project_subject_study.count({
                where: { proj_subj_id: projectSubjectStudies[i].proj_subj_id },
              });
              if (existingStudyCount === 1) projSubjIds.push(projectSubjectStudies[i].proj_subj_id);
              projectSubjectStudyIds.push(projectSubjectStudies[i].id);
            }
            numDeleted += await models.project_subject_study.destroy({
              where: { id: projectSubjectStudyIds },
            });
            await models.project_subject.destroy({
              where: { id: projSubjIds },
            });
          }
          await fastify.deleteStudyInternal(request.params);
          reply.code(200).send(`Study deleted from system and removed from ${numDeleted} projects`);
        } else {
          const count = await models.project_subject_study.count({
            where: { study_uid: request.params.study },
          });
          if (count === 0) {
            await fastify.deleteStudyInternal(request.params);
            reply
              .code(200)
              .send(`Study deleted from system as it didn't exist in any other project`);
          } else
            reply.code(200).send(`Study not deleted from system as it exists in other project`);
        }
      } catch (deleteErr) {
        console.log(deleteErr);
        reply.code(503).send(`Deletion error: ${deleteErr}`);
      }
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });
  // fastify.decorate('getStudySeries', (request, reply) => {
  //   fastify
  //     .getStudySeriesInternal(request.params)
  //     .then(result => reply.code(200).send(result))
  //     .catch(err => reply.code(503).send(err.message));
  // });
  // fastify.decorate('getSeriesImages', (request, reply) => {
  //   fastify
  //     .getSeriesImagesInternal(request.params, request.query)
  //     .then(result => reply.code(200).send(result))
  //     .catch(err => reply.code(503).send(err.message));
  // });

  fastify.decorate('createUser', (request, reply) => {
    models.user
      .create({
        ...request.body,
        createdtime: Date.now(),
        updatetime: Date.now(),
      })
      .then(async user => {
        const { id } = user.dataValues;
        if (request.body.projects && request.body.projects.length > 0) {
          const queries = [];
          try {
            for (let i = 0; i < request.body.projects.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              let projectId = await models.project.findOne({
                where: { projectid: request.body.projects[i].project },
                attributes: ['id'],
              });
              projectId = projectId.dataValues.id;
              const entry = {
                project_id: projectId,
                user_id: id,
                role: request.body.projects[i].role,
                createdtime: Date.now(),
                updatetime: Date.now(),
              };
              queries.push(models.project_user.create(entry));
            }

            Promise.all(queries)
              .then(() => {
                reply.code(200).send(`User succesfully created`);
              })
              .catch(err => {
                console.log(err.message);
                reply.code(503).send(err.message);
              });
          } catch (err) {
            console.log(err.message);
            reply.code(503).send(err.message);
          }
        } else {
          reply.code(200).send(`User succesfully created`);
        }
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('getProject', (request, reply) => {
    models.project
      .findOne({ where: { projectid: request.params.project } })
      .then(project => {
        reply.code(200).send(project);
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });

  fastify.decorate('updateProjectUser', async (request, reply) => {
    const rowsUpdated = {
      ...request.body,
      updatetime: Date.now(),
    };
    if (request.body.updatedBy) {
      rowsUpdated.updated_by = request.body.updatedBy;
    }
    delete rowsUpdated.updatedBy;
    let result;
    try {
      const { userId, projectId } = await fastify.getUserProjectIdsInternal(
        request.params.user,
        request.params.project
      );
      if (rowsUpdated.role.toLowerCase().trim() === 'none') {
        await models.project_user.destroy({ where: { project_id: projectId, user_id: userId } });
        reply.code(200).send(`update sucessful`);
      } else {
        result = await models.project_user.findOrCreate({
          where: { project_id: projectId, user_id: userId },
          defaults: { ...rowsUpdated, creator: request.body.updatedBy },
        });
        // check if new entry created
        // if not created, get the id and update the relation
        if (result[1]) {
          reply.code(200).send(`new relation created  sucessfully on update`);
        } else {
          await models.project_user.update(rowsUpdated, { where: { id: result[0].dataValues.id } });
          reply.code(200).send(`update sucessful`);
        }
      }
    } catch (err) {
      console.log(err.message);
      reply.code(503).send(err.message);
    }
  });

  fastify.decorate('getUserProjectIdsInternal', (username, projectid) => {
    const query = new Promise(async (resolve, reject) => {
      try {
        // find user id
        let userId = await models.user.findOne({ where: { username }, attributes: ['id'] });
        userId = userId.dataValues.id;
        // find project id
        let projectId = await models.project.findOne({ where: { projectid }, attributes: ['id'] });
        projectId = projectId.dataValues.id;
        const res = { userId, projectId };
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
    return query;
  });

  fastify.decorate('getUsers', (request, reply) => {
    models.user
      .findAll({
        include: ['projects'],
      })
      .then(users => {
        const result = [];
        users.forEach(user => {
          const projects = [];
          const projectToRole = [];
          user.projects.forEach(project => {
            projects.push(project.projectid);
            projectToRole.push(`${project.projectid}:${project.project_user.role}`);
          });

          const permissions = user.permissions ? user.permissions.split(',') : [''];
          const obj = {
            colorpreference: user.colorpreference,
            creator: user.creator,
            admin: user.admin === 1,
            enabled: user.enabled === 1,
            displayname: `${user.firstname} ${user.lastname}`,
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            passwordExpired: user.passwordexpired,
            permissions,
            projectToRole,
            projects,
            username: user.username,
          };
          result.push(obj);
        });
        reply.code(200).send({ ResultSet: { Result: result, totalRecords: result.length } });
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });
  fastify.decorate('getUser', async (request, reply) => {
    fastify
      .getUserInternal(request.params)
      .then(res => reply.code(200).send(res))
      .catch(err => {
        if (err.message.includes('No user')) reply.code(404).send(err.message);
        else reply.code(503).send(err.message);
      });
  });

  fastify.decorate(
    'getUserInternal',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          const user = await models.user.findAll({
            where: {
              username: params.user,
            },
            include: ['projects'],
          });
          if (user.length === 1) {
            const permissions = user[0].permissions ? user[0].permissions.split(',') : [''];
            const projects = [];
            const projectToRole = [];
            user[0].projects.forEach(project => {
              projects.push(project.projectid);
              projectToRole.push(`${project.projectid}:${project.project_user.role}`);
            });
            const obj = {
              colorpreference: user[0].colorpreference,
              creator: user[0].creator,
              admin: user[0].admin === 1,
              enabled: user[0].enabled === 1,
              displayname: `${user[0].firstname} ${user[0].lastname}`,
              email: user[0].email,
              firstname: user[0].firstname,
              lastname: user[0].lastname,
              passwordExpired: user[0].passwordexpired === 1,
              permissions,
              projectToRole,
              projects,
              username: user[0].username,
            };
            resolve(obj);
          } else {
            reject(new Error(`No user as ${params.user}`));
          }
        } catch (err) {
          console.log(err.message);
          reject(err);
        }
      })
  );

  fastify.decorate('deleteUser', async (request, reply) => {
    models.user
      .destroy({
        where: {
          username: request.params.user,
        },
      })
      .then(() => {
        reply.code(200).send('Deletion successful');
      })
      .catch(err => {
        console.log(err.message);
        reply.code(503).send(err.message);
      });
  });
  fastify.decorate('getPatientStudyFromProject', async (request, reply) => {
    try {
      const studyUids = [request.params.study];
      const result = await fastify.getPatientStudiesInternal(request.params, studyUids);
      if (result.ResultSet.Result.length === 1) reply.code(200).send(result.ResultSet.Result[0]);
      else {
        reply.code(404).send(`Study ${request.params.study} not found`);
      }
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('getSubjectFromProject', async (request, reply) => {
    try {
      const subjectUids = [request.params.subject];
      const result = await fastify.getPatientsInternal(subjectUids);
      if (result.ResultSet.Result.length === 1) reply.code(200).send(result.ResultSet.Result[0]);
      else {
        reply.code(404).send(`Subject ${request.params.subject} not found`);
      }
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('putOtherFileToProject', (request, reply) => {
    fastify
      .putOtherFileToProjectInternal(request.params.filename, request.params, request.query)
      .then(() => reply.code(200).send())
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.decorate(
    'checkProjectAssociation',
    (projectId, params) =>
      new Promise(async (resolve, reject) => {
        try {
          if (params.subject) {
            const projectSubject = await models.project_subject.findOne({
              where: { project_id: projectId, subject_uid: params.subject },
            });
            if (!projectSubject) {
              reject(
                new Error(`Subject ${params.subject} is not assosiated with ${params.project}`)
              );
            } else if (params.study) {
              const projectSubjectStudy = await models.project_subject_study.findOne({
                where: { proj_subj_id: projectSubject.id, study_uid: params.study },
              });
              if (!projectSubjectStudy) {
                reject(new Error(`Study ${params.study} is not assosiated with ${params.project}`));
              }
            }
          }
          resolve();
        } catch (err) {
          console.log(err);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'putOtherFileToProjectInternal',
    (filename, params, query) =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne({ where: { projectid: params.project } });
          // if the subjects and/or study is given, make sure that subject and/or study is assosiacted with the project
          if (project && project !== null) {
            fastify
              .checkProjectAssociation(project.id, params)
              .then(async () => {
                await models.project_file.create({
                  project_id: project.id,
                  file_uid: filename,
                  creator: query.username,
                  updatetime: Date.now(),
                });
                resolve();
              })
              .catch(errAssoc => reject(errAssoc));
          } else reject(new Error('Project does not exist'));
        } catch (err) {
          console.log(err);
          reject(err);
        }
      })
  );

  fastify.decorate('getProjectFiles', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const fileUids = [];
      models.project_file.findAll({ where: { project_id: project.id } }).then(projectFiles => {
        // projects will be an array of Project instances with the specified name
        projectFiles.forEach(projectFile => fileUids.push(projectFile.file_uid));
        fastify
          .getFilesFromUIDsInternal(
            request.query,
            fileUids,
            (({ subject, study, series }) => ({ subject, study, series }))(request.params)
          )
          .then(result => {
            if (request.query.format === 'stream') {
              reply.header('Content-Disposition', `attachment; filename=files.zip`);
            }
            reply.code(200).send(result);
          })
          .catch(err => reply.code(503).send(err));
      });
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('getFiles', async (request, reply) => {
    try {
      fastify
        .getFilesInternal(request.query)
        .then(result => {
          if (request.query.format === 'stream') {
            reply.header('Content-Disposition', `attachment; filename=files.zip`);
          }
          reply.code(200).send(result);
        })
        .catch(err => reply.code(503).send(err));
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('getProjectFile', async (request, reply) => {
    // TODO check for project relation!
    fastify
      .getFilesFromUIDsInternal(request.query, [request.params.filename])
      .then(result => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=files.zip`);
          reply.code(200).send(result);
        } else if (result.length === 1) reply.code(200).send(result[0]);
        else {
          fastify.log.info(`Was expecting to find 1 record, found ${result.length}`);
          reply.code(404).send(`Was expecting to find 1 record, found ${result.length}`);
        }
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('deleteFileFromProject', async (request, reply) => {
    try {
      const { filename } = request.params;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      const numDeleted = await models.project_file.destroy({
        where: { project_id: project.id, file_uid: filename },
      });
      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const deletednum = await models.project_file.destroy({
            where: { file_uid: filename },
          });
          await fastify.deleteFileInternal(request.params);
          reply
            .code(200)
            .send(`File deleted from system and removed from ${deletednum + numDeleted} projects`);
        } else {
          const count = await models.project_file.count({ where: { file_uid: filename } });
          if (count === 0) {
            await fastify.deleteFileInternal(request.params);
            reply
              .code(200)
              .send(`File deleted from system as it didn't exist in any other project`);
          } else reply.code(200).send(`File not deleted from system as it exists in other project`);
        }
      } catch (deleteErr) {
        console.log(deleteErr);
        reply.code(503).send(`Deletion error: ${deleteErr}`);
      }
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });

  fastify.decorate('deleteFileFromSystem', async (request, reply) => {
    try {
      const { filename } = request.params;
      const numDeleted = await models.project_template.destroy({
        where: { file_uid: filename },
      });
      await fastify.deleteFileInternal(request.params);
      reply.code(200).send(`File deleted from system and removed from ${numDeleted} projects`);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });

  fastify.decorate('getFile', async (request, reply) => {
    fastify
      .getFilesFromUIDsInternal(request.query, [request.params.filename])
      .then(result => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=files.zip`);
          reply.code(200).send(result);
        } else if (result.length === 1) reply.code(200).send(result[0]);
        else {
          fastify.log.info(`Was expecting to find 1 record, found ${result.length}`);
          reply.code(404).send(`Was expecting to find 1 record, found ${result.length}`);
        }
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.after(async () => {
    try {
      await fastify.initMariaDB();
      done();
    } catch (err) {
      fastify.log.info(`Cannot connect to mariadb (err:${err}), shutting down the server`);
      fastify.close();
    }
    // need to add hook for close to remove the db if test;
    fastify.addHook('onClose', async (instance, doneClose) => {
      if (config.env === 'test') {
        try {
          // if it is test remove the database
          await instance.orm.query(`DROP DATABASE ${config.thickDb.name};`);
          fastify.log.info('Destroying mariadb test database');
        } catch (err) {
          fastify.log.info(`Cannot destroy mariadb test database (err:${err.message})`);
        }
      }
      await instance.orm.close();
      doneClose();
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(epaddb);
