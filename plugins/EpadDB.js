const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');
const Sequelize = require('sequelize');
const _ = require('lodash');
const Axios = require('axios');
const os = require('os');
const schedule = require('node-schedule-tz');
const archiver = require('archiver');
const toArrayBuffer = require('to-array-buffer');
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');
const config = require('../config/index');
const EpadNotification = require('../utils/EpadNotification');
const {
  InternalError,
  ResourceNotFoundError,
  ResourceAlreadyExistsError,
  BadRequestError,
  UnauthorizedError,
  EpadError,
} = require('../utils/EpadErrors');

async function epaddb(fastify, options, done) {
  const models = {};

  fastify.decorate('initMariaDB', async () => {
    try {
      const { Op } = Sequelize;
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
        logging: config.thickDb.logger === 'true' || config.thickDb.logger === true,
        operatorsAliases: { $in: Op.in },
      };

      // code from https://github.com/lyquocnam/fastify-sequelize/blob/master/index.js
      // used sequelize itself to get the latest version with mariadb support
      await new Promise(async (resolve, reject) => {
        try {
          const sequelize = new Sequelize(sequelizeConfig);
          await sequelize.authenticate();
          fastify.decorate('orm', sequelize);
        } catch (err) {
          if (config.env === 'test') {
            try {
              sequelizeConfig.database = '';
              let sequelize = new Sequelize(sequelizeConfig);
              await sequelize.query(`CREATE DATABASE ${config.thickDb.name};`);
              sequelizeConfig.database = config.thickDb.name;
              sequelize = new Sequelize(sequelizeConfig);
              await sequelize.authenticate();
              fastify.decorate('orm', sequelize);
            } catch (testDBErr) {
              reject(new InternalError('Creating test mariadb database', testDBErr));
            }
          } else {
            reject(new InternalError(`Connecting to mariadb ${config.thickDb.name}`, err));
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
            as: 'studies',
            foreignKey: 'worklist_id',
          });
          models.worklist.hasMany(models.worklist_requirement, {
            as: 'requirements',
            foreignKey: 'worklist_id',
          });
          models.worklist_study.hasMany(models.worklist_study_completeness, {
            as: 'progress',
            foreignKey: 'worklist_study_id',
          });
          models.worklist_requirement.hasMany(models.worklist_study_completeness, {
            foreignKey: 'worklist_requirement_id',
          });

          models.worklist_study.belongsTo(models.subject, {
            foreignKey: 'subject_id',
          });
          models.worklist_study.belongsTo(models.study, {
            foreignKey: 'study_id',
          });

          models.project.belongsToMany(models.user, {
            through: 'project_user',
            as: 'users',
            foreignKey: 'project_id',
          });

          models.worklist.belongsToMany(models.user, {
            through: 'worklist_user',
            as: 'users',
            foreignKey: 'worklist_id',
          });

          models.user.belongsToMany(models.worklist, {
            through: 'worklist_user',
            as: 'worklists',
            foreignKey: 'user_id',
          });

          models.project.hasMany(models.project_subject, {
            foreignKey: 'project_id',
          });

          models.subject.hasMany(models.project_subject, {
            foreignKey: 'subject_id',
          });

          models.project_subject.belongsTo(models.subject, {
            foreignKey: 'subject_id',
          });

          models.study.hasMany(models.project_subject_study, {
            foreignKey: 'study_id',
          });

          models.project_subject.belongsToMany(models.study, {
            through: 'project_subject_study',
            foreignKey: 'proj_subj_id',
            otherKey: 'study_id',
          });

          models.project.hasMany(models.project_aim, {
            foreignKey: 'project_id',
          });

          models.project_template.belongsTo(models.project, {
            foreignKey: 'project_id',
          });

          await fastify.orm.sync();
          if (config.env === 'test') {
            try {
              await models.user.create({
                username: 'admin',
                firstname: 'admin',
                lastname: 'admin',
                email: 'admin@gmail.com',
                admin: true,
                createdtime: Date.now(),
                updatetime: Date.now(),
              });
            } catch (userCreateErr) {
              reject(new InternalError('Creating admin user in testdb', userCreateErr));
            }
          }
          fastify.log.info('Connected to mariadb server');
          resolve();
        } catch (err) {
          reject(new InternalError('Creating models and syncing db', err));
        }
      });
      return fastify.afterDBReady();
    } catch (err) {
      if (config.env !== 'test') {
        fastify.log.warn(`Waiting for mariadb server. ${err.message}`);
        setTimeout(fastify.initMariaDB, 3000);
      } else throw new InternalError('No connection to mariadb', err);
    }
    return null;
  });

  fastify.decorate('findUserIdInternal', username => {
    const query = new Promise(async (resolve, reject) => {
      try {
        // find user id
        const user = await models.user.findOne({ where: { username }, attributes: ['id'] });
        if (user === null) reject(new ResourceNotFoundError('User', username));
        const userId = user.dataValues.id;
        // find project id
        resolve(userId);
      } catch (err) {
        reject(new InternalError('Retrieving user info', err));
      }
    });
    return query;
  });

  // PROJECTS
  fastify.decorate('createProject', (request, reply) => {
    const { projectName, projectId, projectDescription, defaultTemplate, type } = request.body;
    if (projectId === 'lite') {
      reply.send(
        new BadRequestError(
          'Creating lite project',
          new Error('lite project id is reserved for system. Use another project id')
        )
      );
    } else {
      const validationErr = fastify.validateRequestBodyFields(projectName, projectId);
      if (validationErr) {
        reply.send(new BadRequestError('Creating project', new Error(validationErr)));
      }

      models.project
        .create({
          name: projectName,
          projectid: projectId,
          description: projectDescription,
          defaulttemplate: defaultTemplate,
          type,
          updatetime: Date.now(),
          createdtime: Date.now(),
          creator: request.epadAuth.username,
        })
        .then(async project => {
          // create relation as owner
          try {
            const userId = await fastify.findUserIdInternal(request.epadAuth.username);
            const entry = {
              project_id: project.id,
              user_id: userId,
              role: 'Owner',
              createdtime: Date.now(),
              updatetime: Date.now(),
              creator: request.epadAuth.username,
            };
            await models.project_user.create(entry);
            fastify.log.info(`Project with id ${project.id} is created successfully`);
            reply.code(200).send(`Project with id ${project.id} is created successfully`);
          } catch (errPU) {
            reply.send(
              new InternalError(
                'Getting user info for project owner and creating project owner relationship',
                errPU
              )
            );
          }
        })
        .catch(err => {
          reply.send(new InternalError('Creating project', err));
        });
    }
  });

  fastify.decorate('updateProject', (request, reply) => {
    if (request.params.project === 'lite') {
      reply.send(
        new BadRequestError(
          'Updating lite project',
          new Error('lite project id is reserved for system. You cannot update')
        )
      );
    } else {
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
      query.updated_by = request.epadAuth.username;
      query.updatetime = Date.now();
      models.project
        .update(query, {
          where: {
            projectid: request.params.project,
          },
        })
        .then(() => {
          fastify.log.info(`Project ${request.params.project} is updated`);
          reply.code(200).send(`Project ${request.params.project} is updated successfully`);
        })
        .catch(err => {
          reply.send(new InternalError('Updating project', err));
        });
    }
  });

  fastify.decorate(
    'deleteRelationAndOrphanedCouchDocInternal',
    (dbProjectId, relationTable, uidField) =>
      new Promise(async (resolve, reject) => {
        try {
          const uidsToDeleteObjects = await models[relationTable].findAll({
            attributes: [uidField],
            where: { project_id: dbProjectId },
            order: [[uidField, 'ASC']],
          });
          const uidsToDelete = [];
          if (uidsToDeleteObjects) {
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
                fastify.log.info(
                  `All ${relationTable} entries of project ${dbProjectId} are being used by other projects`
                );
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
          }
          resolve();
        } catch (err) {
          reject(
            new InternalError(`Deleting ${relationTable} entries of project ${dbProjectId}`, err)
          );
        }
      })
  );

  fastify.decorate(
    'deleteRelationAndOrphanedSubjectsInternal',
    (dbProjectId, projectId, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const projectSubjects = await models.project_subject.findAll({
            where: { project_id: dbProjectId },
            include: [{ model: models.subject }],
          });
          if (projectSubjects) {
            for (let i = 0; i < projectSubjects.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.deleteSubjectFromProjectInternal(
                { project: projectId, subject: projectSubjects[i].dataValues.subject.subjectuid },
                {},
                epadAuth
              );
            }
          }
          resolve();
        } catch (err) {
          reject(new InternalError(`Deleting subjects of project ${projectId}`, err));
        }
      })
  );

  fastify.decorate('deleteProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (!project) {
        reply.code(404).send(`Project ${request.params.project} not found`);
      } else {
        // delete projects files (delete orphan files)
        await fastify.deleteRelationAndOrphanedCouchDocInternal(
          project.id,
          'project_file',
          'file_uid'
        );
        // delete projects aims (delete orphan aims)
        await fastify.deleteRelationAndOrphanedCouchDocInternal(
          project.id,
          'project_aim',
          'aim_uid'
        );
        // delete projects templates (delete orphan templates)
        await fastify.deleteRelationAndOrphanedCouchDocInternal(
          project.id,
          'project_template',
          'template_uid'
        );

        // delete projects subjects (delete orphan dicom files)
        await fastify.deleteRelationAndOrphanedSubjectsInternal(
          project.id,
          request.params.project,
          request.epadAuth
        );

        await models.project.destroy({
          where: {
            projectId: request.params.project,
          },
        });
        reply.code(200).send(`Project ${request.params.project} deleted successfully`);
      }
    } catch (err) {
      reply.send(new InternalError(`Deleting project ${request.params.project}`, err));
    }
  });

  fastify.decorate('getProjects', (request, reply) => {
    models.project
      .findAll({
        order: [['name', 'ASC']],
        include: ['users'],
      })
      .then(projects => {
        // projects will be an array of all Project instances
        const result = [];
        projects.forEach(project => {
          const obj = {
            id: project.projectid,
            name: project.name,
            // numberOfAnnotations:
            // numberOfStudies:
            // numberOfSubjects:
            // subjectIDs:
            description: project.description,
            loginNames: [],
            type: project.type,
            defaultTemplate: project.defaulttemplate,
          };

          project.users.forEach(user => {
            obj.loginNames.push(user.username);
          });
          if (
            request.epadAuth.admin ||
            obj.loginNames.includes(request.epadAuth.username) ||
            obj.type.toLowerCase() === 'public'
          )
            result.push(obj);
        });
        reply.code(200).send(result);
      })
      .catch(err => {
        reply.send(
          new InternalError(
            `Getting and filtering project list for user ${request.epadAuth.username}, isAdmin ${
              request.epadAuth.admin
            }`,
            err
          )
        );
      });
  });

  fastify.decorate('validateRequestBodyFields', (name, id) => {
    if (!name || !id) {
      return EpadError.messages.requiredField;
      // eslint-disable-next-line no-else-return
    } else if ((name.length === 2 && name.includes(' ')) || name.length < 2) {
      return EpadError.messages.shortName;
    } else if (id.includes('/')) {
      return EpadError.messages.badChar;
    }
    return null;
  });

  fastify.decorate('createWorklist', (request, reply) => {
    try {
      const assigneeInfoArr = [];
      const assigneeIDArr = [];
      const creator = request.epadAuth.username;

      const { name, worklistId } = request.body;
      // validate required fields
      const validationErr = fastify.validateRequestBodyFields(name, worklistId);
      if (validationErr) {
        reply.send(new BadRequestError('Creating worklist', new Error(validationErr)));
      } else {
        if (request.body.assignees) {
          request.body.assignees.forEach(el => {
            assigneeInfoArr.push(fastify.findUserIdInternal(el));
          });
        }

        Promise.all(assigneeInfoArr)
          .then(results => {
            results.forEach(el => {
              assigneeIDArr.push(el);
            });
            models.worklist
              .create({
                name: request.body.name,
                worklistid: request.body.worklistId,
                user_id: null,
                description: request.body.description,
                updatetime: Date.now(),
                createdtime: Date.now(),
                duedate: request.body.duedate ? new Date(`${request.body.duedate}T00:00:00`) : null,
                creator,
              })
              .then(worklist => {
                const relationArr = [];
                assigneeIDArr.forEach(el => {
                  relationArr.push(
                    models.worklist_user.create({
                      worklist_id: worklist.id,
                      user_id: el,
                      role: 'assignee',
                      createdtime: Date.now(),
                      creator,
                    })
                  );
                });

                if (request.body.requirements) {
                  request.body.requirements.forEach(req => {
                    relationArr.push(
                      models.worklist_requirement.create({
                        worklist_id: worklist.id,
                        level: req.level,
                        template: req.template,
                        numOfAims: req.numOfAims,
                        creator,
                        updatetime: Date.now(),
                        createdtime: Date.now(),
                      })
                    );
                  });
                }

                // after resolving all send 200 or in catch send 503
                Promise.all(relationArr)
                  .then(() => {
                    reply.code(200).send(`Worklist ${worklist.id} is created successfully`);
                  })
                  .catch(relationErr => {
                    reply.send(
                      new InternalError('Creating worklist user association', relationErr)
                    );
                  });
              })
              .catch(worklistCreationErr => {
                reply.send(new InternalError('Creating worklist', worklistCreationErr));
              });
          })
          .catch(userIDErr => {
            if (userIDErr instanceof ResourceNotFoundError)
              reply.send(new BadRequestError('Creating worklist', userIDErr));
            else reply.send(userIDErr);
          });
      }
      // TODO: give more detailed err  message about not finding assignee id
    } catch (err) {
      if (err instanceof ResourceNotFoundError)
        reply.send(
          new BadRequestError(
            `Worklist ${request.body.worklistId} creation by user ${request.epadAuth.username}`,
            err
          )
        );
      else
        reply.send(
          new InternalError(
            `Worklist ${request.body.worklistId} creation by user ${request.epadAuth.username}`,
            err
          )
        );
    }
  });

  fastify.decorate('updateWorklistAssigneeInternal', async (request, reply) => {
    let worklistID;
    const idPromiseArray = [];
    const newAssigneeIdArr = [];
    let existingAssigneeArr;
    const tablePromiseArray = [];

    // get id numbers of worklist and existing assignees for that worklist
    try {
      worklistID = await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
      });
      worklistID = worklistID.dataValues.id;
      existingAssigneeArr = await models.worklist_user.findAll({
        where: { worklist_id: worklistID },
        attributes: ['user_id'],
      });
      existingAssigneeArr.forEach((el, i) => {
        existingAssigneeArr[i] = el.dataValues.user_id;
      });
    } catch (err) {
      if (err instanceof ResourceNotFoundError)
        reply.send(
          new BadRequestError(
            `Worklist ${request.params.worklist} update by user ${request.epadAuth.username}`,
            err
          )
        );
      else
        reply.send(
          new InternalError(
            `Worklist ${request.params.worklist} update by user ${request.epadAuth.username}`,
            err
          )
        );
    }
    // get ids of assignees for request body
    request.body.assigneeList.forEach(assignee => {
      idPromiseArray.push(
        models.user.findOne({ where: { username: assignee }, attributes: ['id'] })
      );
    });

    Promise.all(idPromiseArray)
      .then(result => {
        result.forEach(el => {
          newAssigneeIdArr.push(el.dataValues.id);
        });

        // if assignee already exist skip
        for (let i = 0; i < newAssigneeIdArr.length; i += 1) {
          if (existingAssigneeArr.includes(newAssigneeIdArr[i])) {
            const indexOld = existingAssigneeArr.indexOf(newAssigneeIdArr[i]);
            newAssigneeIdArr.splice(i, 1);
            existingAssigneeArr.splice(indexOld, 1);
            i -= 1;
          }
        }

        // if assignee doesn't exist create new
        newAssigneeIdArr.forEach(el => {
          tablePromiseArray.push(
            models.worklist_user.create({
              worklist_id: worklistID,
              user_id: el,
              role: 'assignee',
              creator: request.epadAuth.username,
              createdtime: Date.now(),
            })
          );
        });

        // if already existing is not in new list remove it
        existingAssigneeArr.forEach(el => {
          tablePromiseArray.push(
            models.worklist_user.destroy({ where: { user_id: el, worklist_id: worklistID } })
          );
        });

        Promise.all(tablePromiseArray)
          .then(async () => {
            try {
              const uidPromises = [];
              const ids = await models.worklist_study.findAll({
                where: { worklist_id: worklistID },
                attributes: ['study_id', 'subject_id', 'project_id'],
                raw: true,
              });
              for (let i = 0; i < ids.length; i += 1) {
                uidPromises.push(
                  models.study.findOne({
                    where: { id: ids[i].study_id },
                    attributes: ['studyuid'],
                    raw: true,
                  })
                );
                uidPromises.push(
                  models.subject.findOne({
                    where: { id: ids[i].subject_id },
                    attributes: ['subjectuid'],
                    raw: true,
                  })
                );
              }
              Promise.all(uidPromises)
                .then(res => {
                  for (let i = 0; i < res.length; i += 2) {
                    const index = Math.round(i / 2);
                    ids[index].studyuid = res[i].studyuid;
                    ids[index].subjectuid = res[i + 1].subjectuid;
                  }

                  const { assigneeList } = request.body;
                  const updateCompPromises = [];
                  for (let i = 0; i < assigneeList.length; i += 1) {
                    for (let k = 0; k < ids.length; k += 1) {
                      updateCompPromises.push(
                        fastify.updateWorklistCompleteness(
                          ids[k].project_id,
                          ids[k].subjectuid,
                          ids[k].studyuid,
                          assigneeList[i],
                          request.epadAuth
                        )
                      );
                    }
                  }

                  for (let i = 0; i < existingAssigneeArr.length; i += 1) {
                    updateCompPromises.push(
                      fastify.updateCompletenessOnDeleteAssignee(existingAssigneeArr[i], worklistID)
                    );
                  }

                  Promise.all(updateCompPromises)
                    .then(() => {
                      reply
                        .code(200)
                        .send(`Worklist ${request.params.worklist} updated successfully`);
                    })
                    .catch(err => {
                      reply.send(
                        new InternalError(
                          `Worklist assignee update calculate completeness ${
                            request.params.worklist
                          }`,
                          err
                        )
                      );
                    });
                })
                .catch(err => {
                  reply.send(
                    new InternalError(
                      `Worklist assignee update calculate completeness ${request.params.worklist}`,
                      err
                    )
                  );
                });
            } catch (err) {
              reply.send(
                new InternalError(`Worklist ${request.params.worklist} assignee update`, err)
              );
            }
          })
          .catch(error => {
            if (error instanceof ResourceNotFoundError)
              reply.send(
                new BadRequestError(
                  `Worklist ${request.params.worklist} update by user ${request.epadAuth.username}`,
                  error
                )
              );
            else
              reply.send(
                new InternalError(
                  `Worklist ${request.params.worklist} update by user ${request.epadAuth.username}`,
                  error
                )
              );
          });
      })
      .catch(err => {
        if (err instanceof ResourceNotFoundError)
          reply.send(
            new BadRequestError(
              `Worklist ${request.params.worklist} update by user ${request.epadAuth.username}`,
              err
            )
          );
        else
          reply.send(
            new InternalError(
              `Worklist ${request.params.worklist} update by user ${request.epadAuth.username}`,
              err
            )
          );
      });
  });

  fastify.decorate('updateCompletenessOnDeleteAssignee', async (userID, worklistID) => {
    return new Promise(async (resolve, reject) => {
      try {
        const completenessDeleteArr = [];
        const username = await fastify.findUserNameInternal(userID);
        const worklistStudy = await models.worklist_study.findAll({
          where: { worklist_id: worklistID },
          attributes: ['id'],
          raw: true,
        });
        worklistStudy.forEach(el => {
          completenessDeleteArr.push(
            models.worklist_study_completeness.destroy({
              where: { worklist_study_id: el.id, assignee: username },
            })
          );
        });
        Promise.all(completenessDeleteArr)
          .then(() => resolve())
          .catch(err => reject(err));
      } catch (err) {
        reject();
      }
    });
  });

  fastify.decorate('updateWorklist', (request, reply) => {
    if (request.body.assigneeList) {
      fastify.updateWorklistAssigneeInternal(request, reply);
    } else {
      const obj = { ...request.body };
      if (obj.duedate === '') {
        obj.duedate = null;
      }
      models.worklist
        .update(
          { ...obj, updatetime: Date.now(), updated_by: request.epadAuth.username },
          {
            where: {
              worklistid: request.params.worklist,
            },
          }
        )
        .then(() => {
          reply.code(200).send('Update successful');
        })
        .catch(err => reply.send(new InternalError('Updating worklist', err)));
    }
  });

  fastify.decorate('getWorklistsOfCreator', async (request, reply) => {
    try {
      const worklists = await models.worklist.findAll({
        where: {
          creator: request.epadAuth.username,
        },
        include: ['users', 'studies', 'requirements'],
      });
      const result = [];
      for (let i = 0; i < worklists.length; i += 1) {
        const obj = {
          completionDate: worklists[i].completedate,
          duedate: worklists[i].duedate,
          name: worklists[i].name,
          startDate: worklists[i].startdate,
          username: worklists[i].user_id,
          workListID: worklists[i].worklistid,
          description: worklists[i].description,
          projectIDs: [],
          studyStatus: [],
          studyUIDs: [],
          subjectUIDs: [],
          assignees: [],
          requirements: [],
        };

        for (let k = 0; k < worklists[i].requirements.length; k += 1) {
          const { level, numOfAims, template, id } = worklists[i].requirements[k];
          obj.requirements.push({ level, numOfAims, template, id });
        }

        for (let k = 0; k < worklists[i].users.length; k += 1) {
          obj.assignees.push(worklists[i].users[k].username);
        }

        const studiesArr = worklists[i].studies;
        const projects = [];
        const subjects = [];
        for (let k = 0; k < studiesArr.length; k += 1) {
          projects.push(studiesArr[k].dataValues.project_id);
          obj.studyStatus.push({
            [studiesArr[k].dataValues.study_uid]: studiesArr[k].dataValues.status,
          });
          obj.studyUIDs.push(studiesArr[k].dataValues.study_uid);
          subjects.push(studiesArr[k].dataValues.subject_uid);
        }
        obj.projectIDs = _.uniq(projects);
        obj.subjectUIDs = _.uniq(subjects);
        result.push(obj);
      }
      reply.code(200).send(result);
    } catch (err) {
      if (err instanceof ResourceNotFoundError)
        reply.send(new BadRequestError('Getting worklists', err));
      else reply.send(new InternalError('Getting worklists', err));
    }
  });

  fastify.decorate('getWorklistsOfAssignee', (request, reply) => {
    fastify
      .findUserIdInternal(request.params.user)
      .then(userId => {
        models.worklist_user
          .findAll({ where: { user_id: userId }, attributes: ['worklist_id'] })
          .then(worklistIDs => {
            const worklistPromises = [];
            worklistIDs.forEach(listID => {
              worklistPromises.push(
                models.worklist.findOne({
                  where: { id: listID.dataValues.worklist_id },
                })
              );
            });

            Promise.all(worklistPromises)
              .then(worklist => {
                const result = [];
                worklist.forEach(el => {
                  const obj = {
                    workListID: el.worklistid,
                    name: el.name,
                    duedate: el.duedate,
                    projectIDs: [],
                  };
                  result.push(obj);
                });
                reply.code(200).send(result);
              })
              .catch(err => {
                reply.send(new InternalError('Get worklists of assignee', err));
              });
          })
          .catch(err => {
            reply.send(new InternalError('Get worklists of assignee', err));
          });
      })
      .catch(err => {
        reply.send(new InternalError('Get worklists of assignee', err));
      });
  });

  fastify.decorate('deleteWorklist', async (request, reply) => {
    try {
      await models.worklist.destroy({
        where: {
          creator: request.epadAuth.username,
          worklistid: request.params.worklist,
        },
      });
      // TODO
      // destroy relations

      reply.code(200).send(`Worklist ${request.params.worklist} deleted successfully`);
    } catch (err) {
      if (err instanceof ResourceNotFoundError)
        reply.send(new BadRequestError(`Deleting worklist ${request.params.worklist}`, err));
      else reply.send(new InternalError(`Deleting worklist ${request.params.worklist}`, err));
    }
  });

  fastify.decorate('assignSubjectToWorklist', async (request, reply) => {
    if (!request.body || request.body.subjectName === undefined) {
      reply.send(
        new BadRequestError(
          'Assign subject to worklist',
          new Error('Missing subject name in request')
        )
      );
    } else {
      const ids = [];
      const promises = [];
      const studyDescMap = {};
      const relationPromiseArr = [];
      // find project's integer id
      // find worklist's integer id
      promises.push(
        models.worklist.findOne({
          where: { worklistid: request.params.worklist },
          attributes: ['id'],
        })
      );
      promises.push(
        models.project.findOne({
          where: { projectid: request.params.project },
          attributes: ['id'],
        })
      );
      promises.push(
        models.subject.findOne({
          where: { subjectuid: request.params.subject },
          attributes: ['id'],
        })
      );

      Promise.all(promises).then(async result => {
        for (let i = 0; i < result.length; i += 1) ids.push(result[i].dataValues.id);

        // go to project_subject get the id of where project and subject matches
        let projectSubject;
        try {
          projectSubject = await models.project_subject.findOne({
            where: { project_id: ids[1], subject_id: ids[2] },
            include: [models.study],
          });
        } catch (err) {
          reply.send(new InternalError('Creating worklist subject association in db', err));
        }
        const studyUIDs = [];
        const studyIDs = [];
        try {
          for (let i = 0; i < projectSubject.dataValues.studies.length; i += 1) {
            studyUIDs.push(projectSubject.dataValues.studies[i].dataValues.studyuid);
            studyIDs.push(projectSubject.dataValues.studies[i].dataValues.id);
          }
        } catch (err) {
          reply.send(new InternalError('Creating worklist subject association in db', err));
        }
        try {
          // get studyDescriptions
          const studyDetails = await fastify.getPatientStudiesInternal(
            request.params,
            studyUIDs,
            request.epadAuth,
            request.query
          );
          studyDetails.forEach(el => {
            const { numberOfImages, numberOfSeries } = el;
            studyDescMap[el.studyUID] = { numberOfImages, numberOfSeries };
          });

          // iterate over the study uid's and send them to the table
          for (let i = 0; i < studyIDs.length; i += 1) {
            relationPromiseArr.push(
              fastify.upsert(
                models.worklist_study,
                {
                  worklist_id: ids[0],
                  study_id: studyIDs[i],
                  subject_id: ids[2],
                  project_id: ids[1],
                  updatetime: Date.now(),
                  numOfSeries: studyDescMap[studyUIDs[i]].numberOfSeries,
                  numOfImages: studyDescMap[studyUIDs[i]].numberOfImages,
                },
                {
                  worklist_id: ids[0],
                  study_id: studyIDs[i],
                  subject_id: ids[2],
                  project_id: ids[1],
                },
                request.epadAuth.username
              )
            );
          }
        } catch (err) {
          reply.send(new InternalError('Creating worklist subject association in db', err));
        }
        Promise.all(relationPromiseArr)
          .then(async () => {
            try {
              const userNamePromises = [];
              // get user id's from worklist_user for the worklist
              const userIds = await models.worklist_user.findAll({
                where: { worklist_id: ids[0] },
                attributes: ['user_id'],
              });
              // findUsernames by userid's
              userIds.forEach(el => {
                userNamePromises.push(fastify.findUserNameInternal(el.dataValues.user_id));
              });
              Promise.all(userNamePromises)
                .then(usernameResult => {
                  const updateCompPromises = [];
                  // iterate over usernames array and updateCompleteness
                  for (let i = 0; i < studyUIDs.length; i += 1) {
                    for (let k = 0; k < usernameResult.length; k += 1) {
                      updateCompPromises.push(
                        fastify.updateWorklistCompleteness(
                          ids[1],
                          request.params.subject,
                          studyUIDs[i],
                          usernameResult[k],
                          request.epadAuth
                        )
                      );
                    }
                  }
                  Promise.all(updateCompPromises)
                    .then(() => {
                      reply.code(200).send(`Saving successful`);
                    })
                    .catch(err =>
                      reply.send(
                        new InternalError(
                          'Updating completeness in worklist study association',
                          err
                        )
                      )
                    );
                })
                .catch(err =>
                  reply.send(
                    new InternalError('Updating completeness in worklist study association', err)
                  )
                );
            } catch (err) {
              reply.send(
                new InternalError('Updating completeness in worklist study association', err)
              );
            }
          })
          .catch(err => {
            reply.send(new InternalError('Creating worklist subject association in db', err));
          });
      });
    }
  });

  fastify.decorate('assignStudyToWorklist', (request, reply) => {
    const ids = [];
    const promises = [];

    promises.push(
      models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
      })
    );
    promises.push(
      models.project.findOne({
        where: { projectid: request.params.project },
        attributes: ['id'],
      })
    );
    promises.push(
      models.subject.findOne({
        where: { subjectuid: request.params.subject },
        attributes: ['id'],
      })
    );
    promises.push(
      models.study.findOne({
        where: { studyuid: request.params.study },
        attributes: ['id'],
      })
    );

    Promise.all(promises)
      .then(async result => {
        for (let i = 0; i < result.length; i += 1) ids.push(result[i].dataValues.id);
        const seriesArr = await fastify.getStudySeriesInternal(
          request.params,
          { filterDSO: 'true' },
          request.epadAuth
        );
        const sumOfImageCounts = _.reduce(
          seriesArr,
          (memo, series) => {
            return memo + series.numberOfImages;
          },
          0
        );

        fastify
          .upsert(
            models.worklist_study,
            {
              worklist_id: ids[0],
              study_id: ids[3],
              subject_id: ids[2],
              project_id: ids[1],
              updatetime: Date.now(),
              numOfSeries: seriesArr.length,
              numOfImages: sumOfImageCounts,
            },
            {
              worklist_id: ids[0],
              study_id: ids[3],
              subject_id: ids[2],
              project_id: ids[1],
            },
            request.epadAuth.username
          )
          .then(async id => {
            try {
              const userNamePromises = [];
              // get user id's from worklist_user for the worklist
              const userIds = await models.worklist_user.findAll({
                where: { worklist_id: ids[0] },
                attributes: ['user_id'],
              });
              // findUsernames by userid's
              userIds.forEach(el => {
                userNamePromises.push(fastify.findUserNameInternal(el.dataValues.user_id));
              });
              Promise.all(userNamePromises)
                .then(res => {
                  const updateCompPromises = [];
                  // iterate over usernames array and updateCompleteness
                  res.forEach(username =>
                    updateCompPromises.push(
                      fastify.updateWorklistCompleteness(
                        ids[1],
                        request.params.subject,
                        request.params.study,
                        username,
                        request.epadAuth
                      )
                    )
                  );
                  Promise.all(updateCompPromises)
                    .then(() => {
                      reply.code(200).send(`Saving successful - ${id}`);
                    })
                    .catch(err =>
                      reply.send(
                        new InternalError(
                          'Updating completeness in worklist study association',
                          err
                        )
                      )
                    );
                })
                .catch(err =>
                  reply.send(
                    new InternalError('Updating completeness in worklist study association', err)
                  )
                );
            } catch (err) {
              reply.send(
                new InternalError('Updating completeness in worklist study association', err)
              );
            }
          })
          .catch(err => {
            reply.send(new InternalError('Creating worklist study association in db', err));
          });
      })
      .catch(err => reply.send(new InternalError('Creating worklist study association', err)));
  });

  fastify.decorate('findUserNameInternal', userid => {
    const query = new Promise(async (resolve, reject) => {
      try {
        const user = await models.user.findOne({ where: { id: userid }, attributes: ['username'] });
        if (user === null) reject(new ResourceNotFoundError('User', userid));
        const { username } = user.dataValues;
        resolve(username);
      } catch (err) {
        reject(new InternalError('Retrieving user info', err));
      }
    });
    return query;
  });

  fastify.decorate('deleteStudyToWorklistRelation', async (request, reply) => {
    if (!request.body || !Array.isArray(request.body) || request.body.length === 0) {
      reply.send(
        new BadRequestError(
          'Delete study worklist relation',
          new Error('Missing study list in request')
        )
      );
    } else {
      // find worklist id
      const promises = [];
      const worklist = await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
        raw: true,
      });

      request.body.forEach(async el => {
        try {
          const project = await models.project.findOne({
            where: { projectid: el.projectID },
            attributes: ['id'],
            raw: true,
          });
          const subject = await models.subject.findOne({
            where: { subjectuid: el.subjectID },
            attributes: ['id'],
            raw: true,
          });
          const study = await models.study.findOne({
            where: { studyuid: el.studyUID },
            attributes: ['id'],
            raw: true,
          });
          promises.push(
            models.worklist_study.destroy({
              where: {
                worklist_id: worklist.id,
                project_id: project.id,
                subject_id: subject.id,
                study_id: study.id,
              },
            })
          );
        } catch (err) {
          reply.send(
            new InternalError(
              `Deleting study ${el.studyUID} from worklist ${request.params.worklist}`,
              err
            )
          );
        }
      });
      Promise.all(promises)
        .then(() => reply.code(200).send(`Deleted successfully`))
        .catch(err => {
          if (err instanceof ResourceNotFoundError)
            reply.send(
              new BadRequestError(
                `Deleting studies ${request.body} from worklist ${request.params.worklist}`,
                err
              )
            );
          else
            reply.send(
              new InternalError(
                `Deleting studies ${request.body} from worklist ${request.params.worklist}`,
                err
              )
            );
        });
    }
  });

  fastify.decorate('getWorklistSubjects', async (request, reply) => {
    // get worklist name and id from worklist
    // get details from worklist_study table
    let workListName;
    let worklistIdKey;
    let worklistDuedate;

    let list;
    try {
      const worklist = await models.worklist.findOne({
        where: {
          worklistid: request.params.worklist,
        },
        attributes: ['name', 'id', 'duedate'],
      });
      workListName = worklist.dataValues.name;
      worklistIdKey = worklist.dataValues.id;
      worklistDuedate = worklist.dataValues.duedate;
      list = await models.worklist_study.findAll({
        where: { worklist_id: worklistIdKey },
        include: [models.subject, models.study],
      });
      const result = [];
      for (let i = 0; i < list.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const projectId = await models.project.findOne({
          where: { id: list[i].dataValues.project_id },
          attributes: ['projectid'],
        });
        const obj = {
          completionDate: list[i].dataValues.completedate,
          projectID: projectId.dataValues.projectid,
          sortOrder: list[i].dataValues.sortorder,
          startDate: list[i].dataValues.startdate,
          subjectID: list[i].dataValues.subject.dataValues.subjectuid,
          studyUID: list[i].dataValues.study.dataValues.studyuid,
          workListID: request.params.worklist,
          workListName,
          worklistDuedate,
          subjectName: list[i].dataValues.subject.dataValues.name,
          studyDescription: list[i].dataValues.study.dataValues.description,
        };
        result.push(obj);
      }
      reply.code(200).send(Object.values(result));
    } catch (err) {
      if (err instanceof ResourceNotFoundError)
        reply.send(
          new BadRequestError(`Getting subjects of the worklist ${request.params.worklist}`, err)
        );
      else
        reply.send(
          new InternalError(`Getting subjects of the worklist ${request.params.worklist}`, err)
        );
    }
  });

  fastify.decorate('saveTemplateToProject', async (request, reply) => {
    try {
      let templateUid = request.params.uid;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null) {
        reply.send(
          new BadRequestError(
            'Template saving to project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else {
        if (request.body) {
          await fastify.saveTemplateInternal(request.body);
          if (templateUid !== request.body.TemplateContainer.uid) {
            fastify.log.info(
              `The template uid sent in the url ${templateUid} is different than the template that is sent ${
                request.body.TemplateContainer.uid
              }. Using ${request.body.TemplateContainer.uid} `
            );
            templateUid = request.body.TemplateContainer.uid;
          }
        }

        await fastify.addProjectTemplateRelInternal(
          templateUid,
          project,
          request.query,
          request.epadAuth
        );

        reply.code(200).send('Saving successful');
      }
    } catch (err) {
      reply.send(new InternalError(`Saving template in project ${request.params.project}`, err));
    }
  });

  fastify.decorate(
    'addProjectTemplateRelInternal',
    (templateUid, project, query, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          let projectId = '';
          if (typeof project === 'string') {
            projectId = await fastify.findProjectIdInternal(project);
          } else {
            projectId = project.id;
          }
          await fastify.upsert(
            models.project_template,
            {
              project_id: projectId,
              template_uid: templateUid,
              enabled: query.enable === 'true',
              updatetime: Date.now(),
            },
            {
              project_id: projectId,
              template_uid: templateUid,
            },
            epadAuth.username,
            transaction
          );
          resolve();
        } catch (err) {
          reject(
            new InternalError(
              `Adding project template relation for template ${templateUid} with project ${
                project.projectid
              }`,
              err
            )
          );
        }
      })
  );

  fastify.decorate('getTemplates', async (request, reply) => {
    try {
      const templates = await fastify.getTemplatesInternal(request.query);
      if (request.query.format === 'stream') {
        reply.header('Content-Disposition', `attachment; filename=templates.zip`);
      } else if (request.query.format === 'summary') {
        // add project data
        const projectTemplates = await models.project_template.findAll({
          include: [models.project],
        });
        const templateProjects = {};
        for (let i = 0; i < projectTemplates.length; i += 1) {
          if (templateProjects[projectTemplates[i].template_uid]) {
            templateProjects[projectTemplates[i].template_uid].push(
              projectTemplates[i].dataValues.project.dataValues.projectid
            );
          } else {
            templateProjects[projectTemplates[i].template_uid] = [
              projectTemplates[i].dataValues.project.dataValues.projectid,
            ];
          }
        }
        for (let i = 0; i < templates.length; i += 1) {
          templates[i].projects = templateProjects[templates[i].containerUID];
        }
      }
      reply.code(200).send(templates);
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.decorate('getProjectTemplates', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null) {
        reply.send(
          new BadRequestError(
            'Template saving to project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else {
        const templateUids = [];
        const enabled = {};
        const projectTemplates = await models.project_template.findAll({
          where: { project_id: project.id },
        });
        // projects will be an array of Project instances with the specified name
        for (let i = 0; i < projectTemplates.length; i += 1) {
          templateUids.push(projectTemplates[i].template_uid);
          enabled[projectTemplates[i].template_uid] = projectTemplates[i].enabled;
        }
        const result = await fastify.getTemplatesFromUIDsInternal(request.query, templateUids);
        if (request.query.format === 'summary') {
          // add enable disable
          const editedResult = result;
          for (let i = 0; i < editedResult.length; i += 1) {
            editedResult[i].enabled = enabled[editedResult[i].containerUID] === 1;
          }
          reply.code(200).send(editedResult);
        } else {
          if (request.query.format === 'stream') {
            reply.header('Content-Disposition', `attachment; filename=templates.zip`);
          }
          reply.code(200).send(result);
        }
      }
    } catch (err) {
      reply.send(new InternalError(`Getting templates for project ${request.params.project}`, err));
    }
  });

  fastify.decorate('deleteTemplateFromProject', async (request, reply) => {
    try {
      const templateUid = request.params.uid;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null) {
        reply.send(
          new BadRequestError(
            'Deleting template from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else if (
        request.query.all &&
        request.query.all === 'true' &&
        request.epadAuth.admin === false
      )
        reply.send(new UnauthorizedError('User is not admin, cannot delete from system'));
      else {
        const numDeleted = await models.project_template.destroy({
          where: { project_id: project.id, template_uid: templateUid },
        });
        // if delete from all or it doesn't exist in any other project, delete from system
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
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Template ${request.params.uid} deletion from ${request.params.project}`,
          err
        )
      );
    }
  });

  fastify.decorate('deleteTemplateFromDB', params =>
    models.project_template.destroy({
      where: { template_uid: params.uid },
    })
  );

  // if there is no subject and there is request.body it is a post request to create a nondicom subject
  fastify.decorate('addSubjectToProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null) {
        reply.send(
          new BadRequestError(
            'Adding subject to project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else {
        if (
          request.params.subject === undefined &&
          (!request.body || request.body.subjectUid === undefined)
        )
          reply.send(
            new BadRequestError(
              'Adding subject to project',
              new ResourceNotFoundError('Subject', 'No id')
            )
          );
        else {
          let subject = await models.subject.findOne({
            where: {
              subjectuid: request.params.subject ? request.params.subject : request.body.subjectUid,
            },
          });
          let studies = [];
          // if it is a dicom subject sent via put get subject info from dicomweb
          if (!request.body && request.params.subject) {
            studies = await fastify.getPatientStudiesInternal(
              request.params,
              undefined,
              request.epadAuth,
              request.query
            );
          }
          if (!subject) {
            const subjectInfo = {
              subjectuid: request.params.subject ? request.params.subject : request.body.subjectUid,
              name: request.body && request.body.name ? request.body.name : null,
              gender: request.body && request.body.gender ? request.body.gender : null,
              dob: request.body && request.body.dob ? request.body.dob : null,
            };

            if (!request.body) {
              // retrieve from dicom, just get the item from first.
              // TODO is there a better way? what if they have different values
              subjectInfo.name = studies[0].patientName;
              subjectInfo.gender = studies[0].sex;
              subjectInfo.dob = studies[0].birthdate;
            }
            subject = await models.subject.create({
              subjectuid: subjectInfo.subjectuid.replace('\u0000', '').trim(),
              name: subjectInfo.name.replace('\u0000', '').trim(),
              gender: subjectInfo.gender,
              dob: subjectInfo.dob,
              creator: request.epadAuth.username,
              updatetime: Date.now(),
              createdtime: Date.now(),
            });
          } else if (request.body) {
            reply.send(new ResourceAlreadyExistsError('Subject', request.body.subjectUid));
            return;
          }

          const projectSubject = await fastify.upsert(
            models.project_subject,
            {
              project_id: project.id,
              subject_id: subject.id,
              updatetime: Date.now(),
            },
            { project_id: project.id, subject_id: subject.id },
            request.epadAuth.username
          );

          // if it is a dicom subject sent via put add studies to project
          if (!request.body && request.params.subject) {
            for (let i = 0; i < studies.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.addPatientStudyToProjectDBInternal(
                studies[i],
                projectSubject,
                request.epadAuth
              );
            }
          }
        }
        reply.code(200).send('Saving successful');
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Adding subject ${request.params.subject} to project ${request.params.project}`,
          err
        )
      );
    }
  });

  fastify.decorate('arrayUnique', (array, idField) => {
    const a = array.concat();
    for (let i = 0; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        if ((idField && a[i][idField] === a[j][idField]) || a[i] === a[j]) {
          a.splice(j, 1);
          j -= 1;
        }
      }
    }

    return a;
  });

  fastify.decorate(
    'getDBStudies',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const dbStudyUIDs = [];
          const studies = await models.study.findAll({
            include: [
              {
                model: models.project_subject_study,
                required: true,
              },
            ],
          });
          for (let i = 0; i < studies.length; i += 1) {
            dbStudyUIDs.push(studies[i].dataValues.studyuid);
          }
          resolve(dbStudyUIDs);
        } catch (err) {
          reject(new InternalError(`Getting DB StudyUIDs`, err));
        }
      })
  );

  fastify.decorate('getAimCountMap', (projectAims, project, epadAuth, field) => {
    const aimsCountMap = {};
    // if all or undefined no aim counts
    for (let i = 0; i < projectAims.length; i += 1) {
      // check if collaborator, then only his own
      const isCollaborator = fastify.isCollaborator(project, epadAuth);
      if (projectAims[i].dataValues.user === epadAuth.username || !isCollaborator) {
        // add to the map or increment
        if (!aimsCountMap[projectAims[i].dataValues[field]])
          aimsCountMap[projectAims[i].dataValues[field]] = 0;
        aimsCountMap[projectAims[i].dataValues[field]] += 1;
      }
    }
    return aimsCountMap;
  });

  fastify.decorate('getPatientsFromProject', async (request, reply) => {
    try {
      if (request.params.project === config.unassignedProjectID) {
        const dbStudyUIDs = await fastify.getDBStudies();
        // eslint-disable-next-line no-await-in-loop
        let results = await fastify.getPatientsInternal(
          request.params,
          dbStudyUIDs,
          request.epadAuth,
          true,
          '0020000D',
          'studyUID',
          true
        );
        results = _.sortBy(results, 'subjectName');
        reply.code(200).send(results);
      } else {
        const project = await models.project.findOne({
          where: { projectid: request.params.project },
          include: [{ model: models.project_aim, attributes: ['aim_uid', 'user', 'subject_uid'] }],
        });

        if (project === null) {
          reply.send(
            new BadRequestError(
              'Getting subjects from project',
              new ResourceNotFoundError('Project', request.params.project)
            )
          );
        } else {
          const projectSubjectsWhereJSON =
            request.params.project && request.params.project !== config.XNATUploadProjectID
              ? { project_id: project.id }
              : {};
          const subjects = await models.subject.findAll({
            include: [
              {
                model: models.project_subject,
                where: projectSubjectsWhereJSON,
                include: [{ model: models.study, attributes: ['exam_types', 'id'] }],
              },
            ],
            attributes: ['name', 'subjectuid'],
          });
          let results = [];
          let aimsCountMap = {};
          // if all or undefined no aim counts
          if (request.params.project !== config.XNATUploadProjectID) {
            aimsCountMap = fastify.getAimCountMap(
              project.dataValues.project_aims,
              request.params.project,
              request.epadAuth,
              'subject_uid'
            );
          }

          for (let i = 0; i < subjects.length; i += 1) {
            let examTypes = [];
            const studyIds = {};
            for (let j = 0; j < subjects[i].dataValues.project_subjects.length; j += 1) {
              for (
                let k = 0;
                k < subjects[i].dataValues.project_subjects[j].dataValues.studies.length;
                k += 1
              ) {
                if (
                  !studyIds[
                    subjects[i].dataValues.project_subjects[j].dataValues.studies[k].dataValues.id
                  ]
                ) {
                  studyIds[
                    subjects[i].dataValues.project_subjects[j].dataValues.studies[k].dataValues.id
                  ] = true;
                  const studyExamTypes = JSON.parse(
                    subjects[i].dataValues.project_subjects[j].dataValues.studies[k].dataValues
                      .exam_types
                  );
                  examTypes = fastify.arrayUnique(examTypes.concat(studyExamTypes));
                }
              }
            }
            results.push({
              subjectName: subjects[i].dataValues.name,
              subjectID: fastify.replaceNull(subjects[i].dataValues.subjectuid),
              projectID: request.params.project,
              insertUser: '', // no user in studies call
              xnatID: '', // no xnatID should remove
              insertDate: '', // no date in studies call
              uri: '', // no uri should remove
              displaySubjectID: fastify.replaceNull(subjects[i].dataValues.subjectuid),
              numberOfStudies: Object.keys(studyIds).length,
              numberOfAnnotations: aimsCountMap[subjects[i].dataValues.subjectuid]
                ? aimsCountMap[subjects[i].dataValues.subjectuid]
                : 0,
              examTypes,
            });
          }
          results = _.sortBy(results, 'subjectName');
          reply.code(200).send(results);
        }
      }
    } catch (err) {
      reply.send(new InternalError(`Getting patients from project ${request.params.project}`, err));
    }
  });

  fastify.decorate('deleteSubjectFromProject', (request, reply) => {
    fastify
      .deleteSubjectFromProjectInternal(request.params, request.query, request.epadAuth)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'deleteSubjectFromProjectInternal',
    (params, query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne({
            where: { projectid: params.project },
          });
          const subject = await models.subject.findOne({
            where: { subjectuid: params.subject },
          });
          if (project === null)
            reject(
              new BadRequestError(
                'Deleting subject from project',
                new ResourceNotFoundError('Project', params.project)
              )
            );
          else if (query.all && query.all === 'true' && epadAuth.admin === false)
            reject(new UnauthorizedError('User is not admin, cannot delete from system'));
          else {
            const projectSubject = await models.project_subject.findOne({
              where: { project_id: project.id, subject_id: subject.id },
            });
            if (projectSubject === null)
              reject(
                new BadRequestError(
                  'Deleting subject from project',
                  new ResourceNotFoundError('Project subject association', params.project)
                )
              );
            else {
              await models.project_subject_study.destroy({
                where: { proj_subj_id: projectSubject.id },
              });
              await models.project_subject.destroy({
                where: { project_id: project.id, subject_id: subject.id },
              });
              await models.worklist_study.destroy({
                where: { project_id: project.id, subject_id: subject.id },
              });
              // if delete from all or it doesn't exist in any other project, delete from system
              try {
                const projectSubjects = await models.project_subject.findAll({
                  where: { subject_id: subject.id },
                });
                if (query.all && query.all === 'true') {
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

                  // delete the subject
                  await models.subject.destroy({
                    where: { id: subject.id },
                  });
                  await fastify.deleteSubjectInternal(params, epadAuth);
                  resolve(
                    `Subject deleted from system and removed from ${
                      projectSubjects.length
                    } projects`
                  );
                } else if (projectSubjects.length === 0) {
                  await models.project_subject_study.destroy({
                    where: { proj_subj_id: projectSubject.id },
                  });
                  await models.worklist_study.destroy({
                    where: { project_id: project.id, subject_id: subject.id },
                  });
                  // delete the subject
                  await models.subject.destroy({
                    where: { id: subject.id },
                  });
                  await fastify.deleteSubjectInternal(params, epadAuth);
                  resolve(`Subject deleted from system as it didn't exist in any other project`);
                } else resolve(`Subject not deleted from system as it exists in other project`);
              } catch (deleteErr) {
                reject(
                  new InternalError(
                    `Study assosiation deletion during subject ${
                      params.subject
                    } deletion from project`,
                    deleteErr
                  )
                );
              }
            }
          }
        } catch (err) {
          reject(new InternalError(`Subject deletion from project ${params.subject}`, err));
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

  fastify.decorate(
    'filterProjectAims',
    (params, query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne(
            params.project
              ? {
                  where: { projectid: params.project },
                }
              : {}
          );
          if (project === null)
            reject(
              new BadRequestError(
                'Getting aims from project',
                new ResourceNotFoundError('Project', params.project)
              )
            );
          else {
            const aimUids = [];
            const projectAims = await models.project_aim.findAll({
              where: { project_id: project.id },
            });
            // projects will be an array of Project instances with the specified name
            for (let i = 0; i < projectAims.length; i += 1) {
              aimUids.push(projectAims[i].aim_uid);
            }

            const result = await fastify.getAimsInternal(query.format, params, aimUids, epadAuth);
            resolve(result);
          }
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getProjectAims', async (request, reply) => {
    try {
      let result = await fastify.filterProjectAims(request.params, request.query, request.epadAuth);
      if (request.query.format === 'stream') {
        reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
      } else if (request.query.format === 'summary') {
        result = result.map(obj => ({ ...obj, projectID: request.params.project }));
      }
      reply.code(200).send(result);
    } catch (err) {
      reply.send(new InternalError(`Getting aims for project ${request.params.project}`, err));
    }
  });

  fastify.decorate('getProjectAim', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            `Getting aim ${request.params.aimuid} from project`,
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const projectAimCount = await models.project_aim.count({
          where: { project_id: project.id, aim_uid: request.params.aimuid },
        });
        if (projectAimCount !== 1)
          reply.send(new ResourceNotFoundError('Project aim', request.params.aimuid));
        else {
          const result = await fastify.getAimsInternal(
            request.query.format,
            request.params,
            [request.params.aimuid],
            request.epadAuth
          );
          // .then(result => {
          if (request.query.format === 'stream') {
            reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
          }
          if (result.length === 1) reply.code(200).send(result[0]);
          else {
            reply.send(new ResourceNotFoundError('Aim', request.params.aimuid));
          }
          // })
          // .catch(err => reply.send(new InternalError(`Getting project aim from couchdb`, err)));
        }
      }
    } catch (err) {
      reply.send(new InternalError(`Getting project aim`, err));
    }
  });

  fastify.decorate('saveAimToProject', async (request, reply) => {
    try {
      let aimUid = request.params.aimuid;
      let aim = request.body;
      if (!request.params.aimuid)
        aimUid = request.body.ImageAnnotationCollection.uniqueIdentifier.root;
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            `Saving aim ${aimUid} from project`,
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        if (aim) {
          // get the uid from the json and check if it is same with param, then put as id in couch document
          if (aimUid !== aim.ImageAnnotationCollection.uniqueIdentifier.root) {
            reply.send(
              new BadRequestError(
                `Saving aim to project ${request.params.project}`,
                new Error(
                  `Conflicting aimuids: the uid sent in the url ${aimUid} should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root ${
                    aim.ImageAnnotationCollection.uniqueIdentifier.root
                  }`
                )
              )
            );
          } else await fastify.saveAimInternal(aim);
          // TODO check if the aim is already associated with any project. warn and update the project_aim entries accordingly
        } else {
          // get aim to populate project_aim data
          [aim] = await fastify.getAimsInternal('json', request.params, [aimUid], request.epadAuth);
        }
        await fastify.addProjectAimRelInternal(aim, project, request.epadAuth);
        reply.code(200).send('Saving successful');
      }
    } catch (err) {
      reply.send(new InternalError(`Saving aim to project ${request.params.project}`, err));
    }
  });

  fastify.decorate(
    'addProjectAimRelInternal',
    (aim, project, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          const aimUid = aim.ImageAnnotationCollection.uniqueIdentifier.root;
          const user =
            aim && aim.ImageAnnotationCollection.user
              ? aim.ImageAnnotationCollection.user.loginName.value
              : '';
          const template =
            aim &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code
              ? aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code
              : '';
          const subjectUid =
            aim && aim.ImageAnnotationCollection.person
              ? aim.ImageAnnotationCollection.person.id.value
              : '';
          const studyUid =
            aim &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .imageReferenceEntityCollection.ImageReferenceEntity[0]
              ? aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid
                  .root
              : '';
          const seriesUid =
            aim &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
              ? aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
                  .instanceUid.root
              : '';
          const imageUid =
            aim &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
              .imageCollection.Image[0]
              ? aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
                  .imageCollection.Image[0].sopInstanceUid.root
              : '';

          const frameId =
            aim &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .markupEntityCollection &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection
              .MarkupEntity[0] &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection
              .MarkupEntity[0].referencedFrameNumber
              ? aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .markupEntityCollection.MarkupEntity[0].referencedFrameNumber.value
              : '';

          const dsoSeriesUid =
            aim &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .segmentationEntityCollection &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .segmentationEntityCollection.SegmentationEntity[0] &&
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .segmentationEntityCollection.SegmentationEntity[0].seriesInstanceUid
              ? aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .segmentationEntityCollection.SegmentationEntity[0].seriesInstanceUid.root
              : '';

          let projectId = '';
          if (typeof project === 'string') {
            projectId = await fastify.findProjectIdInternal(project);
          } else {
            projectId = project.id;
          }
          await fastify.upsert(
            models.project_aim,
            {
              project_id: projectId,
              aim_uid: aimUid,
              user,
              template,
              subject_uid: subjectUid,
              study_uid: studyUid,
              series_uid: seriesUid,
              image_uid: imageUid,
              frame_id: Number(frameId),
              dso_series_uid: dsoSeriesUid,
              updatetime: Date.now(),
            },
            {
              project_id: projectId,
              aim_uid: aimUid,
            },
            epadAuth.username,
            transaction
          );

          // update the worklist completeness if in any
          await fastify.updateWorklistCompleteness(
            projectId,
            subjectUid,
            studyUid,
            user,
            epadAuth,
            transaction
          );

          resolve('Aim project relation is created');
        } catch (err) {
          reject(
            new InternalError(
              `Aim project relation creation aimuid ${
                aim.ImageAnnotationCollection.uniqueIdentifier.root
              }, project ${project.projectid}`,
              err
            )
          );
        }
      })
  );

  // fastify.decorate('addWorklistRequirement', async (worklistId, epadAuth, body) => {
  //   return models.worklist_requirement.create({
  //     ...body,
  //     worklist_id: worklistId,
  //     updatetime: Date.now(),
  //     createdtime: Date.now(),
  //     creator: epadAuth.username,
  //   });
  // });

  fastify.decorate('updateWorklistRequirement', async (worklistId, reqId, epadAuth, body) => {
    return fastify.upsert(
      models.worklist_requirement,
      {
        ...body,
        worklist_id: worklistId,
        updatetime: Date.now(),
      },
      {
        worklist_id: worklistId,
        id: reqId,
      },
      epadAuth.username
    );
  });

  fastify.decorate('deleteWorklistRequirement', async (request, reply) => {
    try {
      const worklist = await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
        raw: true,
      });
      if (!worklist) {
        reply.send(
          new BadRequestError(
            `Worklist requirement ${request.params.requirement} add/update`,
            new ResourceNotFoundError('Worklist', request.params.worklist)
          )
        );
      } else {
        const worklistReqCompleteness = await models.worklist_study_completeness.findOne({
          where: { worklist_requirement_id: request.params.requirement },
          attributes: ['id'],
          raw: true,
        });
        if (worklistReqCompleteness) {
          await models.worklist_study_completeness.destroy({
            where: { worklist_requirement_id: request.params.requirement },
          });
        }
        const deletedItem = await models.worklist_requirement.destroy({
          where: { worklist_id: worklist.id, id: request.params.requirement },
        });
        reply.code(200).send(`${deletedItem} requirement(s) deleted from worklist`);
      }
    } catch (err) {
      reply.send(
        new InternalError(`Worklist requirement delete ${request.params.requirement}`, err)
      );
    }
  });

  fastify.decorate('setWorklistRequirement', async (request, reply) => {
    // iterate throught the body and add each of them to the requirement table
    try {
      const promises = [];
      const worklist = await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
        raw: true,
      });
      if (!worklist)
        reply.send(
          new BadRequestError(
            `Worklist requirement add/update`,
            new ResourceNotFoundError('Worklist', request.params.worklist)
          )
        );
      else {
        request.body.forEach(req => {
          const promise = models.worklist_requirement.create({
            ...req,
            worklist_id: worklist.id,
            updatetime: Date.now(),
            createdtime: Date.now(),
            creator: request.epadAuth.username,
          });
          promises.push(promise);
        });

        await Promise.all(promises);
        // .then(async () => {
        try {
          const userNamePromises = [];
          const worklistId = worklist.id;
          const userIds = await models.worklist_user.findAll({
            where: { worklist_id: worklistId },
            attributes: ['user_id'],
            raw: true,
          });
          const ids = await models.worklist_study.findAll({
            where: { worklist_id: worklistId },
            attributes: ['study_id', 'subject_id', 'project_id'],
            raw: true,
          });
          const uidPromises = [];
          for (let i = 0; i < ids.length; i += 1) {
            uidPromises.push(
              models.study.findOne({
                where: { id: ids[i].study_id },
                attributes: ['studyuid'],
                raw: true,
              })
            );
            uidPromises.push(
              models.subject.findOne({
                where: { id: ids[i].subject_id },
                attributes: ['subjectuid'],
                raw: true,
              })
            );
          }
          const res = await Promise.all(uidPromises);
          // .then(res => {
          for (let i = 0; i < res.length; i += 2) {
            const index = Math.round(i / 2);
            ids[index].studyuid = res[i].studyuid;
            ids[index].subjectuid = res[i + 1].subjectuid;
          }
          userIds.forEach(el => {
            userNamePromises.push(fastify.findUserNameInternal(el.user_id));
          });

          const usernames = await Promise.all(userNamePromises);
          // .then(usernames => {
          const updateCompPromises = [];
          for (let i = 0; i < usernames.length; i += 1) {
            for (let k = 0; k < ids.length; k += 1) {
              updateCompPromises.push(
                fastify.updateWorklistCompleteness(
                  ids[k].project_id,
                  ids[k].subjectuid,
                  ids[k].studyuid,
                  usernames[i],
                  request.epadAuth
                )
              );
            }
          }
          try {
            reply.code(200).send(`Worklist requirement added`);
          } catch (err) {
            reply.send(
              new InternalError(
                `Worklist requirement update completeness ${request.params.worklist}`,
                err
              )
            );
          }
        } catch (err) {
          reply.send(new InternalError(`Worklist requirement ${request.params.worklist} add`, err));
        }
      }
    } catch (err) {
      reply.send(new InternalError(`Worklist requirement ${request.params.worklist} add`, err));
    }
  });

  fastify.decorate(
    'updateWorklistCompleteness',
    (projectId, subjectUid, studyUid, user, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          // TODO check if the user is an assignee

          // get worklist studies that belong to this study and user
          // const worklistsStudiesAll = await models.worklist_study.findAll({
          //   raw: true,
          // });

          const subject = await models.subject.findOne(
            {
              where: { subjectuid: subjectUid },
            },
            transaction ? { transaction } : {}
          );
          const study = await models.study.findOne(
            {
              where: { studyuid: studyUid },
            },
            transaction ? { transaction } : {}
          );

          // only calculate if we have the subject, study and worklist_study relation
          if (subject && study) {
            const worklistsStudies = await models.worklist_study.findAll(
              {
                where: { project_id: projectId, subject_id: subject.id, study_id: study.id },
                raw: true,
              },
              transaction ? { transaction } : {}
            );
            // for each worklist study
            for (let i = 0; i < worklistsStudies.length; i += 1) {
              //  get requirements
              // eslint-disable-next-line no-await-in-loop
              const requirements = await models.worklist_requirement.findAll(
                {
                  where: { worklist_id: worklistsStudies[i].worklist_id },
                  raw: true,
                },
                transaction ? { transaction } : {}
              );
              for (let j = 0; j < requirements.length; j += 1) {
                //  compute worklist completeness
                // eslint-disable-next-line no-await-in-loop
                await fastify.computeWorklistCompleteness(
                  worklistsStudies[i].id,
                  requirements[j],
                  {
                    numOfSeries: worklistsStudies[i].numOfSeries,
                    numOfImages: worklistsStudies[i].numOfImages,
                  },
                  projectId,
                  subjectUid,
                  studyUid,
                  user,
                  epadAuth,
                  transaction
                );
              }
            }
          }
          resolve('Completeness calculated!');
        } catch (err) {
          reject(
            new InternalError(
              `Updating worklist completeness for project ${projectId}, subject ${subjectUid}, study ${studyUid}, user ${user}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'findProjectIdInternal',
    project =>
      new Promise(async (resolve, reject) => {
        try {
          const projectId = await models.project.findOne({
            where: { projectid: project },
            attributes: ['id'],
            raw: true,
          });
          resolve(projectId.id);
        } catch (err) {
          reject(new InternalError(`Finding project id ${project}`, err));
        }
      })
  );

  fastify.decorate(
    'checkProjectSegAimExistence',
    (dsoSeriesUid, project) =>
      new Promise(async (resolve, reject) => {
        try {
          const projectId = await fastify.findProjectIdInternal(project);
          const aimsCount = await models.project_aim.count({
            where: { project_id: projectId, dso_series_uid: dsoSeriesUid },
          });
          resolve(aimsCount > 0);
        } catch (err) {
          reject(
            new InternalError(`Checking DSO Aim existance ${dsoSeriesUid} in ${project}`, err)
          );
        }
      })
  );

  fastify.decorate(
    'computeWorklistCompleteness',
    async (
      worklistStudyId,
      worklistReq,
      worklistStats,
      projectId,
      subjectUid,
      studyUid,
      user,
      epadAuth,
      transaction
    ) => {
      // sample worklistReq
      // eslint-disable-next-line no-param-reassign
      // worklistReq = [{ id: 1, level: 'study', numOfAims: 1, template: 'ROI', required: true }];
      // get all aims

      const aims = await models.project_aim.findAll(
        {
          where: { project_id: projectId, subject_uid: subjectUid, study_uid: studyUid, user },
          raw: true,
        },
        transaction ? { transaction } : {}
      );
      // do a one pass off aims and get stats
      const aimStats = {};
      for (let i = 0; i < aims.length; i += 1) {
        if (!(aims[i].template in aimStats)) {
          aimStats[aims[i].template] = {
            subjectUids: {},
            studyUids: {},
            seriesUids: {},
            imageUids: {},
          };
        }
        if (!('any' in aimStats)) {
          aimStats.any = {
            subjectUids: {},
            studyUids: {},
            seriesUids: {},
            imageUids: {},
          };
        }
        if (!(aims[i].subject_uid in aimStats[aims[i].template].subjectUids))
          aimStats[aims[i].template].subjectUids[aims[i].subject_uid] = 1;
        else aimStats[aims[i].template].subjectUids[aims[i].subject_uid] += 1;
        if (!(aims[i].study_uid in aimStats[aims[i].template].studyUids))
          aimStats[aims[i].template].studyUids[aims[i].study_uid] = 1;
        else aimStats[aims[i].template].studyUids[aims[i].study_uid] += 1;
        if (!(aims[i].series_uid in aimStats[aims[i].template].seriesUids))
          aimStats[aims[i].template].seriesUids[aims[i].series_uid] = 1;
        else aimStats[aims[i].template].seriesUids[aims[i].series_uid] += 1;
        if (!(aims[i].image_uid in aimStats[aims[i].template].imageUids))
          aimStats[aims[i].template].imageUids[aims[i].image_uid] = 1;
        else aimStats[aims[i].template].imageUids[aims[i].image_uid] += 1;
        // add all to any
        if (!(aims[i].subject_uid in aimStats.any.subjectUids))
          aimStats.any.subjectUids[aims[i].subject_uid] = 1;
        else aimStats.any.subjectUids[aims[i].subject_uid] += 1;
        if (!(aims[i].study_uid in aimStats.any.studyUids))
          aimStats.any.studyUids[aims[i].study_uid] = 1;
        else aimStats.any.studyUids[aims[i].study_uid] += 1;
        if (!(aims[i].series_uid in aimStats.any.seriesUids))
          aimStats.any.seriesUids[aims[i].series_uid] = 1;
        else aimStats.any.seriesUids[aims[i].series_uid] += 1;
        if (!(aims[i].image_uid in aimStats.any.imageUids))
          aimStats.any.imageUids[aims[i].image_uid] = 1;
        else aimStats.any.imageUids[aims[i].image_uid] += 1;
      }

      // filter by template first
      let completenessPercent = 0;
      // not even started yet
      if (!(worklistReq.template in aimStats)) {
        console.log(`There are no aims for the worklist req for template ${worklistReq.template}`);
      } else {
        // compare and calculate completeness
        let matchCounts = {};
        switch (worklistReq.level.toLowerCase()) {
          case 'patient':
            matchCounts = {
              completed: aimStats[worklistReq.template].subjectUids[subjectUid],
              required: worklistReq.numOfAims,
            };
            break;
          case 'subject':
            matchCounts = {
              completed: aimStats[worklistReq.template].subjectUids[subjectUid],
              required: worklistReq.numOfAims,
            };
            break;
          case 'study':
            matchCounts = {
              completed: aimStats[worklistReq.template].studyUids[studyUid],
              required: worklistReq.numOfAims,
            };
            break;
          case 'series':
            matchCounts = fastify.getMatchingCount(
              aimStats[worklistReq.template].seriesUids,
              worklistReq.numOfAims,
              worklistStats.numOfSeries
            );

            break;
          case 'image':
            matchCounts = fastify.getMatchingCount(
              aimStats[worklistReq.template].imageUids,
              worklistReq.numOfAims,
              worklistStats.numOfImages
            );

            break;
          default:
            console.log(`What is this unknown level ${worklistReq.level}`);
        }
        completenessPercent = (matchCounts.completed * 100) / matchCounts.required;
      }

      // update worklist study completeness req
      // eslint-disable-next-line no-await-in-loop
      await fastify.upsert(
        models.worklist_study_completeness,
        {
          worklist_study_id: worklistStudyId,
          updatetime: Date.now(),
          assignee: user,
          worklist_requirement_id: worklistReq.id,
          // completeness cannot be higher than 100
          completeness: completenessPercent > 100 ? 100 : completenessPercent,
        },
        {
          worklist_study_id: worklistStudyId,
          assignee: user,
          worklist_requirement_id: worklistReq.id,
        },
        epadAuth.username,
        transaction
      );
    }
  );

  fastify.decorate('getWorklistProgress', async (request, reply) => {
    try {
      const worklist = (await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
        include: ['requirements', 'users'],
      })).toJSON();
      const requirements = {};
      const users = {};
      for (let i = 0; i < worklist.requirements.length; i += 1) {
        requirements[worklist.requirements[i].id] = worklist.requirements[i];
      }
      for (let i = 0; i < worklist.users.length; i += 1) {
        users[worklist.users[i].username] = worklist.users[i];
      }
      if (!worklist)
        reply.send(
          new BadRequestError(
            `Worklist progress retrieval`,
            new ResourceNotFoundError('Worklist', request.params.worklist)
          )
        );
      else {
        const progressList = [];
        const worklistStudies = await models.worklist_study.findAll({
          where: { worklist_id: worklist.id },
          include: ['progress', 'subject', 'study'],
          attributes: ['worklist_id', 'project_id', 'subject_id', 'study_id'],
        });
        for (let i = 0; i < worklistStudies.length; i += 1) {
          for (let j = 0; j < worklistStudies[i].dataValues.progress.length; j += 1) {
            const { numOfAims, template, level } = requirements[
              worklistStudies[i].dataValues.progress[j].dataValues.worklist_requirement_id
            ];
            const { firstname, lastname } = users[
              worklistStudies[i].dataValues.progress[j].dataValues.assignee
            ];
            progressList.push({
              worklist_id: worklistStudies[i].dataValues.worklist_id,
              project_id: worklistStudies[i].dataValues.project_id,
              subject_uid: worklistStudies[i].dataValues.subject.dataValues.subjectuid,
              subject_name: worklistStudies[i].dataValues.subject.dataValues.name,
              study_uid: worklistStudies[i].dataValues.study.dataValues.studyuid,
              study_desc: worklistStudies[i].dataValues.study.dataValues.description,
              assignee: worklistStudies[i].dataValues.progress[j].dataValues.assignee,
              assignee_name: `${firstname} ${lastname}`,
              worklist_requirement_id:
                worklistStudies[i].dataValues.progress[j].dataValues.worklist_requirement_id,
              worklist_requirement_desc: `${numOfAims}:${template}:${level}`,
              completeness: worklistStudies[i].dataValues.progress[j].dataValues.completeness,
            });
          }
        }
        reply.code(200).send(progressList);
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Worklist progress retrieval for worklist ${request.params.worklist}`,
          err
        )
      );
    }
  });

  fastify.decorate('getMatchingCount', (map, singleMatch, required) => {
    let completed = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const key in map) {
      if (map[key] >= singleMatch) completed += 1;
    }
    return { completed, required };
  });
  fastify.decorate('deleteAimFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            `Deleting aim ${request.params.aimuid} from project`,
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else if (
        request.query.all &&
        request.query.all === 'true' &&
        request.epadAuth.admin === false
      )
        reply.send(new UnauthorizedError('User is not admin, cannot delete from system'));
      else {
        const args = await models.project_aim.findOne({
          where: { project_id: project.id, aim_uid: request.params.aimuid },
          attributes: ['project_id', 'subject_uid', 'study_uid', 'user'],
          raw: true,
        });

        const numDeleted = await models.project_aim.destroy({
          where: { project_id: project.id, aim_uid: request.params.aimuid },
        });

        if (args) {
          await fastify.updateWorklistCompleteness(
            args.project_id,
            args.subject_uid,
            args.study_uid,
            args.user,
            request.epadAuth
          );
        }

        // if delete from all or it doesn't exist in any other project, delete from system
        try {
          if (request.query.all && request.query.all === 'true') {
            const deletednum = await models.project_aim.destroy({
              where: { aim_uid: request.params.aimuid },
            });
            await fastify.deleteAimInternal(request.params.aimuid);
            reply
              .code(200)
              .send(`Aim deleted from system and removed from ${deletednum + numDeleted} projects`);
          } else {
            const count = await models.project_aim.count({
              where: { aim_uid: request.params.aimuid },
            });
            if (count === 0) {
              await fastify.deleteAimInternal(request.params.aimuid);
              reply
                .code(200)
                .send(`Aim deleted from system as it didn't exist in any other project`);
            } else
              reply.code(200).send(`Aim not deleted from system as it exists in other project`);
          }
        } catch (deleteErr) {
          reply.send(
            new InternalError(
              `Aim ${request.params.aimuid} deletion from system ${request.params.project}`,
              deleteErr
            )
          );
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Aim ${request.params.aimuid} deletion from project ${request.params.project}`,
          err
        )
      );
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
      reply.send(new InternalError(`Aim ${request.params.aimuid} deletion from system`, err));
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
      .addPatientStudyToProjectInternal(request.params, request.epadAuth, request.body)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });
  fastify.decorate(
    'updateStudyExamType',
    (studyUid, examTypes, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          // update with latest value
          await fastify.upsert(
            models.study,
            {
              studyuid: studyUid,
              exam_types: JSON.stringify(examTypes),
              updatetime: Date.now(),
            },
            {
              studyuid: studyUid,
            },
            epadAuth.username,
            transaction
          );
          resolve();
        } catch (err) {
          reject(new InternalError(`Adding study ${studyUid} DB`, err));
        }
      })
  );

  fastify.decorate(
    'addPatientStudyToProjectDBInternal',
    (studyInfo, projectSubject, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          // update with latest value
          const study = await fastify.upsert(
            models.study,
            {
              studyuid: studyInfo.studyUID,
              studydate: studyInfo.insertDate ? studyInfo.insertDate : null,
              description: studyInfo.studyDescription,
              subject_id: projectSubject.subject_id,
              exam_types: studyInfo.examTypes ? JSON.stringify(studyInfo.examTypes) : null,
              updatetime: Date.now(),
            },
            {
              studyuid: studyInfo.studyUID,
            },
            epadAuth.username,
            transaction
          );
          // eslint-disable-next-line no-await-in-loop
          await fastify.upsert(
            models.project_subject_study,
            {
              proj_subj_id: projectSubject.id,
              study_id: study.id,
              updatetime: Date.now(),
            },
            {
              proj_subj_id: projectSubject.id,
              study_id: study.id,
            },
            epadAuth.username,
            transaction
          );
          resolve();
        } catch (err) {
          reject(new InternalError(`Adding study ${studyInfo.studyUID} DB`, err));
        }
      })
  );

  fastify.decorate(
    'addPatientStudyToProjectInternal',
    (params, epadAuth, body) =>
      new Promise(async (resolve, reject) => {
        try {
          let studyUid = params.study;
          if (!studyUid && body) {
            // eslint-disable-next-line prefer-destructuring
            studyUid = body.studyUid;
            // check if the studyUid exists and return duplicate entity error
          }
          if (!studyUid)
            reject(
              new BadRequestError(
                'Adding study to project',
                new ResourceNotFoundError('Study', 'No study UID')
              )
            );
          const project = await models.project.findOne({ where: { projectid: params.project } });
          if (project === null)
            reject(
              new BadRequestError(
                'Adding study to project',
                new ResourceNotFoundError('Project', params.project)
              )
            );
          else {
            let subject = await models.subject.findOne({
              where: {
                subjectuid: params.subject,
              },
            });
            // upload sends subject and study data in body
            if (!subject && body && body.subjectName === undefined) {
              reject(
                new BadRequestError(
                  'Adding study to project',
                  new ResourceNotFoundError('Subject', params.subject)
                )
              );
            } else {
              let studies = [];
              if (!body) {
                // get the data from dicomwebserver if the body is empty, hence dicom
                studies = await fastify.getPatientStudiesInternal(
                  { subject: params.subject, study: params.study },
                  undefined,
                  epadAuth,
                  {}
                );
              }
              // create the subject if no subject info sent via body (for upload)
              if (!subject) {
                if (body) {
                  subject = await models.subject.create({
                    subjectuid: params.subject.replace('\u0000', '').trim(),
                    name: body.subjectName ? body.subjectName.replace('\u0000', '').trim() : '',
                    gender: body.sex,
                    dob: body.birthdate ? body.birthdate : null,
                    creator: epadAuth.username,
                    updatetime: Date.now(),
                    createdtime: Date.now(),
                  });
                } else if (studies.length === 1) {
                  // this shouldn't ever happen except tests because of nock
                  subject = await models.subject.create({
                    subjectuid: params.subject.replace('\u0000', '').trim(),
                    name: studies[0].patientName
                      ? studies[0].patientName.replace('\u0000', '').trim()
                      : '',
                    gender: studies[0].sex,
                    dob: studies[0].birthdate ? studies[0].birthdate : null,
                    creator: epadAuth.username,
                    updatetime: Date.now(),
                    createdtime: Date.now(),
                  });
                }
              }
              if (subject) {
                let projectSubject = await models.project_subject.findOne({
                  where: { project_id: project.id, subject_id: subject.id },
                });
                if (!projectSubject)
                  projectSubject = await models.project_subject.create({
                    project_id: project.id,
                    subject_id: subject.id,
                    creator: epadAuth.username,
                    updatetime: Date.now(),
                    createdtime: Date.now(),
                  });
                let studyInfo = {};
                studyInfo.studyUID = studyUid;
                if (body && body.studyDesc) studyInfo.studyDescription = body.studyDesc;
                if (body && body.insertDate) studyInfo.insertDate = body.insertDate;
                // if there is body, it is nondicom. you cannot create a nondicom if it is already in system
                // it doesn't have subject info (not upload)
                if (body && body.subjectName === undefined) {
                  const studyExists = await models.study.findOne({
                    where: { studyuid: studyInfo.studyUID },
                  });
                  if (studyExists)
                    reject(new ResourceAlreadyExistsError('Study', studyInfo.studyUID));
                } else if (studies.length === 1) [studyInfo] = studies;

                await fastify.addPatientStudyToProjectDBInternal(
                  studyInfo,
                  projectSubject,
                  epadAuth
                );
                resolve();
              } else
                reject(
                  new BadRequestError(
                    'Adding study to project',
                    new ResourceNotFoundError('Subject', params.subject)
                  )
                );
            }
          }
        } catch (err) {
          reject(
            new InternalError(`Adding study ${params.study} to project ${params.project}`, err)
          );
        }
      })
  );

  // whereJSON should include project_id, can also include subject_id
  fastify.decorate(
    'getStudiesInternal',
    (whereJSON, params, epadAuth, justIds, query) =>
      new Promise(async (resolve, reject) => {
        try {
          const projectSubjects = await models.project_subject.findAll({
            where: whereJSON,
            include: [models.subject, models.study],
          });

          const studyUids = [];
          const studyInfos = [];
          const nondicoms = [];

          if (projectSubjects === null) {
            reject(
              new BadRequestError(
                'Get studies from project',
                new ResourceNotFoundError(
                  'Project subject association with whereJSON',
                  JSON.stringify(whereJSON)
                )
              )
            );
          } else {
            for (let j = 0; j < projectSubjects.length; j += 1) {
              for (let i = 0; i < projectSubjects[j].dataValues.studies.length; i += 1) {
                studyUids.push(projectSubjects[j].dataValues.studies[i].dataValues.studyuid);
                studyInfos.push({
                  study: projectSubjects[j].dataValues.studies[i].dataValues.studyuid,
                  subject: projectSubjects[j].dataValues.subject.dataValues.subjectuid,
                });
                // ASSUMPTION: nondicoms have no studydate
                if (!projectSubjects[j].dataValues.studies[i].dataValues.studydate)
                  nondicoms.push({
                    subject: projectSubjects[j].dataValues.subject,
                    study: projectSubjects[j].dataValues.studies[i],
                  });
              }
            }
            if (!justIds) {
              if (params.project === config.unassignedProjectID) {
                const result = await fastify.getPatientStudiesInternal(
                  params,
                  studyUids,
                  epadAuth,
                  query,
                  false,
                  '0020000D',
                  'studyUID',
                  true
                );
                resolve(result);
              } else {
                const result = await fastify.getPatientStudiesInternal(
                  params,
                  studyUids,
                  epadAuth,
                  query,
                  true
                );
                let aimsCountMap = {};
                if (params.project !== config.XNATUploadProjectID) {
                  const projectAims = await models.project_aim.findAll({
                    where: {
                      project_id: whereJSON.project_id,
                    },
                    attributes: ['aim_uid', 'user', 'study_uid'],
                  });
                  aimsCountMap = fastify.getAimCountMap(
                    projectAims,
                    params.project,
                    epadAuth,
                    'study_uid'
                  );
                }
                if (studyUids.length !== result.length)
                  if (studyUids.length === result.length + nondicoms.length) {
                    for (let i = 0; i < nondicoms.length; i += 1) {
                      result.push({
                        projectID: params.project,
                        patientID: nondicoms[i].subject.dataValues.subjectuid,
                        patientName: nondicoms[i].subject.dataValues.name,
                        studyUID: nondicoms[i].study.dataValues.studyuid,
                        insertDate: '',
                        firstSeriesUID: '',
                        firstSeriesDateAcquired: '',
                        physicianName: '',
                        referringPhysicianName: '',
                        birthdate: nondicoms[i].subject.dataValues.dob,
                        sex: nondicoms[i].subject.dataValues.gender,
                        studyDescription: nondicoms[i].study.dataValues.description,
                        studyAccessionNumber: '',
                        examTypes: [],
                        numberOfImages: 0, // TODO
                        numberOfSeries: 0, // TODO
                        numberOfAnnotations: 0,
                        createdTime: '',
                        // extra for flexview
                        studyID: '',
                        studyDate: '',
                        studyTime: '',
                      });
                    }
                  } else
                    fastify.log.warn(
                      `There are ${
                        studyUids.length
                      } studies associated with this project. But only ${
                        result.length
                      } of them have dicom files`
                    );
                for (let i = 0; i < result.length; i += 1) {
                  result[i].numberOfAnnotations = aimsCountMap[result[i].studyUID]
                    ? aimsCountMap[result[i].studyUID]
                    : 0;
                }
                resolve(result);
              }
            } else {
              resolve(studyInfos);
            }
          }
        } catch (err) {
          reject(
            new InternalError(`Getting studies with where: ${JSON.stringify(whereJSON)}`, err)
          );
        }
      })
  );

  fastify.decorate('getPatientStudiesFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      if (project === null)
        reply.send(
          new BadRequestError(
            'Get studies from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const subject = await models.subject.findOne({
          where: { subjectuid: request.params.subject },
        });
        if (subject === null) {
          // handle unassigned project
          if (request.params.project === config.unassignedProjectID) {
            const result = await fastify.getPatientStudiesInternal(
              request.params,
              [],
              request.epadAuth,
              request.query,
              false,
              '0020000D',
              'studyUID',
              true
            );
            reply.code(200).send(result);
          } else {
            reply.send(
              new BadRequestError(
                'Get studies from project',
                new ResourceNotFoundError('Subject', request.params.subject)
              )
            );
          }
        } else {
          let whereJSON = {
            project_id: project.id,
            subject_id: subject.id,
          };
          if (
            request.params.project === config.XNATUploadProjectID ||
            request.params.project === config.unassignedProjectID
          )
            whereJSON = {
              subject_id: subject.id,
            };
          const result = await fastify.getStudiesInternal(
            whereJSON,
            request.params,
            request.epadAuth,
            false,
            request.query
          );
          reply.code(200).send(result);
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Getting studies of ${request.params.subject} from project ${request.params.project}`,
          err
        )
      );
    }
  });

  fastify.decorate('deletePatientStudyFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const subject = await models.subject.findOne({
        where: { subjectuid: request.params.subject },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Delete study from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else if (subject === null)
        reply.send(
          new BadRequestError(
            'Delete study from project',
            new ResourceNotFoundError('Subject', request.params.subject)
          )
        );
      else {
        const projectSubject = await models.project_subject.findOne({
          where: { project_id: project.id, subject_id: subject.id },
        });
        if (projectSubject === null) {
          reply.send(
            new BadRequestError(
              'Delete study from project',
              new ResourceNotFoundError('Project subject association', request.params.subject)
            )
          );
        } else if (
          request.query.all &&
          request.query.all === 'true' &&
          request.epadAuth.admin === false
        )
          reply.send(new UnauthorizedError('User is not admin, cannot delete from system'));
        else {
          // find the study
          const study = await models.study.findOne({
            where: { studyuid: request.params.study },
          });
          let numDeleted = await models.project_subject_study.destroy({
            where: { proj_subj_id: projectSubject.id, study_id: study.id },
          });
          // see if there is any other study refering to this subject in this project
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
                where: { study_id: study.id },
              });
              const projSubjIds = [];
              const projectSubjectStudyIds = [];
              let deletedNonDicomSeries = 0;
              if (projectSubjectStudies) {
                for (let i = 0; i < projectSubjectStudies.length; i += 1) {
                  // eslint-disable-next-line no-await-in-loop
                  const existingStudyCount = await models.project_subject_study.count({
                    where: { proj_subj_id: projectSubjectStudies[i].proj_subj_id },
                  });
                  if (existingStudyCount === 1)
                    projSubjIds.push(projectSubjectStudies[i].proj_subj_id);
                  projectSubjectStudyIds.push(projectSubjectStudies[i].id);
                }
                numDeleted += await models.project_subject_study.destroy({
                  where: { id: projectSubjectStudyIds },
                });
                await models.project_subject.destroy({
                  where: { id: projSubjIds },
                });
                // delete non dicom series if any
                deletedNonDicomSeries = await models.nondicom_series.destroy({
                  where: { study_id: study.id },
                });

                await models.worklist_study.destroy({
                  where: {
                    project_id: project.id,
                    subject_id: subject.id,
                    study_id: study.id,
                  },
                });
                await models.study.destroy({
                  where: { id: study.id },
                });
              }
              try {
                await fastify.deleteStudyInternal(request.params, request.epadAuth);
              } catch (err) {
                // ignore the error if the study has nondicom series
                if (deletedNonDicomSeries === 0) {
                  fastify.log.warn(
                    `The study is deleted from system but not dicomweb. It maybe just a nondicom study. Error: ${
                      err.message
                    }`
                  );
                }
              }
              reply
                .code(200)
                .send(`Study deleted from system and removed from ${numDeleted} projects`);
            } else {
              // see if this study is referenced by any other project
              const count = await models.project_subject_study.count({
                where: { study_id: study.id },
              });
              if (count === 0) {
                // delete non dicom series if any
                const deletedNonDicomSeries = await models.nondicom_series.destroy({
                  where: { study_id: study.id },
                });
                await models.worklist_study.destroy({
                  where: {
                    project_id: project.id,
                    subject_id: subject.id,
                    study_id: study.id,
                  },
                });
                await models.study.destroy({
                  where: { id: study.id },
                });
                try {
                  await fastify.deleteStudyInternal(request.params, request.epadAuth);
                } catch (err) {
                  // ignore the error if the study has nondicom series
                  if (deletedNonDicomSeries === 0) {
                    fastify.log.warn(
                      `The study is deleted from system but not dicomweb. It maybe just a nondicom study. Error: ${
                        err.message
                      }`
                    );
                  }
                }
                reply
                  .code(200)
                  .send(`Study deleted from system as it didn't exist in any other project`);
              } else
                reply.code(200).send(`Study not deleted from system as it exists in other project`);
            }
          } catch (deleteErr) {
            reply.send(
              new InternalError(`Study ${request.params.study} deletion from system`, deleteErr)
            );
          }
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Study ${request.params.study} deletion from project ${request.params.project}`,
          err
        )
      );
    }
  });
  fastify.decorate('getStudySeriesFromProject', (request, reply) => {
    // TODO project filtering
    if (request.query.format === 'stream' && request.params.series) {
      fastify
        .prepDownload(request.params, request.query, request.epadAuth, reply)
        .then(() => fastify.log.info(`Series ${request.params.series} download completed`))
        .catch(downloadErr => reply.send(new InternalError('Downloading series', downloadErr)));
    } else {
      const dicomPromise = new Promise(async resolve => {
        try {
          const result = await fastify.getStudySeriesInternal(
            request.params,
            request.query,
            request.epadAuth
          );
          resolve({ result, error: undefined });
        } catch (err) {
          fastify.log.info(`Retrieving series Failed from dicomweb with ${err.message}`);
          resolve({ result: [], error: `${err.message}` });
        }
      });
      const nondicomPromise = new Promise(async resolve => {
        try {
          const result = await fastify.getNondicomStudySeriesFromProjectInternal(request.params);
          resolve({ result, error: undefined });
        } catch (err) {
          fastify.log.info(`Retrieving series Failed from nondicom with ${err.message}`);
          resolve({ result: [], error: `${err.message}` });
        }
      });
      Promise.all([dicomPromise, nondicomPromise]).then(results => {
        const combinedResult = results[0].result.concat(results[1].result);
        if (results[0].error && results[1].error)
          reply.send(
            new InternalError(
              'Retrieving series',
              new Error(
                `Failed from dicomweb with ${results[0].error} and from nondicom with ${
                  results[1].error
                }`
              )
            )
          );
        else reply.code(200).send(combinedResult);
      });
    }
  });
  fastify.decorate(
    'deleteNonDicomSeriesInternal',
    seriesUid =>
      new Promise(async (resolve, reject) => {
        try {
          await models.nondicom_series.destroy({
            where: { seriesuid: seriesUid },
          });
          resolve();
        } catch (err) {
          reject(new InternalError(`Deleting nondicom series ${seriesUid}`, err));
        }
      })
  );
  fastify.decorate(
    'getNondicomStudySeriesFromProjectInternal',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          const result = [];
          const promisses = [];
          promisses.push(
            models.subject.findOne({
              where: { subjectuid: params.subject },
              raw: true,
            })
          );
          promisses.push(
            models.study.findOne({
              where: { studyuid: params.study },
              raw: true,
            })
          );
          const [subject, study] = await Promise.all(promisses);
          const series = await models.nondicom_series.findAll({
            where: { study_id: study.id },
            raw: true,
          });

          for (let i = 0; i < series.length; i += 1) {
            result.push({
              projectID: params.project,
              patientID: params.subject,
              patientName: subject.name,
              studyUID: params.study,
              seriesUID: series[i].seriesuid,
              seriesDate: series[i].seriesdate,
              seriesDescription: series[i].description,
              examType: '',
              bodyPart: '',
              accessionNumber: '',
              numberOfImages: 0, // TODO
              numberOfSeriesRelatedInstances: 0, // TODO
              numberOfAnnotations: 0, // TODO
              institution: '',
              stationName: '',
              department: '',
              createdTime: '', // TODO
              firstImageUIDInSeries: '', // TODO
              isDSO: false,
              isNonDicomSeries: true,
              seriesNo: '',
            });
          }
          resolve(result);
        } catch (err) {
          reject(err);
        }
      })
  );
  fastify.decorate('getSeriesImagesFromProject', (request, reply) => {
    // TODO project filtering
    fastify
      .getSeriesImagesInternal(request.params, request.query)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate('createUser', async (request, reply) => {
    if (!request.body) {
      reply.send(new BadRequestError('User Creation', new Error('No body sent')));
    } else {
      let existingUsername;
      let existingEmail;
      try {
        existingUsername = await models.user.findOne({
          where: { username: request.body.username },
          attributes: ['id'],
        });
        existingUsername = existingUsername ? existingUsername.dataValues.id : null;
        existingEmail = await models.user.findOne({
          where: { email: request.body.username },
          attributes: ['id'],
        });
        existingEmail = existingEmail ? existingEmail.dataValues.id : null;
      } catch (error) {
        reply.send(new InternalError('Create user in db', error));
      }
      if (existingUsername || existingEmail) {
        if (existingUsername)
          reply.send(new ResourceAlreadyExistsError(`Username `, request.body.username));
        if (existingEmail)
          reply.send(new ResourceAlreadyExistsError('Email address ', request.body.username));
      } else {
        try {
          const permissions = request.body.permissions ? request.body.permissions.split(',') : [''];
          const trimmedPermission = [];
          permissions.forEach(el => trimmedPermission.push(el.trim()));
          if (request.body.permissions) {
            delete request.body.permissions;
          }
          request.body.permissions = trimmedPermission.join(',');
          const user = await models.user.create({
            ...request.body,
            createdtime: Date.now(),
            updatetime: Date.now(),
            creator: request.epadAuth.username,
          });

          const { id } = user.dataValues;
          if (request.body.projects && request.body.projects.length > 0) {
            const queries = [];
            try {
              for (let i = 0; i < request.body.projects.length; i += 1) {
                const isNone = request.body.projects[i].role.toLowerCase() === 'none';
                if (!isNone) {
                  // eslint-disable-next-line no-await-in-loop
                  const project = await models.project.findOne({
                    where: { projectid: request.body.projects[i].project },
                    attributes: ['id'],
                  });
                  if (project === null) {
                    reply.send(
                      new BadRequestError(
                        'Create user with project associations',
                        new ResourceNotFoundError('Project', request.params.project)
                      )
                    );
                  } else {
                    const projectId = project.dataValues.id;
                    const entry = {
                      project_id: projectId,
                      user_id: id,
                      role: request.body.projects[i].role,
                      createdtime: Date.now(),
                      updatetime: Date.now(),
                    };
                    queries.push(models.project_user.create(entry));
                  }
                }
              }
              try {
                await Promise.all(queries);
                reply.code(200).send(`User succesfully created`);
              } catch (err) {
                reply.send(new InternalError('Create user project associations', err));
              }
            } catch (err) {
              reply.send(new InternalError('Create user project associations', err));
            }
          } else {
            reply.code(200).send(`User succesfully created`);
          }
        } catch (err) {
          reply.send(new InternalError('Create user in db', err));
        }
      }
    }
  });

  fastify.decorate(
    'getProjectInternal',
    projectId =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne({
            where: { projectid: projectId },
          });
          resolve(project);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getProject', async (request, reply) => {
    try {
      const project = await fastify.getProjectInternal(request.params.project);
      if (project === null)
        reply.send(new ResourceNotFoundError('Project', request.params.project));
      else if (request.query.format === 'stream') {
        await fastify.prepDownload(request.params, request.query, request.epadAuth, reply, {
          project_id: project.id,
        });
      } else reply.code(200).send(project);
    } catch (err) {
      reply.send(new InternalError(`Getting project ${request.params.project}`, err));
    }
  });
  /*
  fastify.decorate('updateProjectUser', async (request, reply) => {
    const rowsUpdated = {
      ...request.body,
      updated_by: request.epadAuth.username,
      updatetime: Date.now(),
    };
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
          defaults: { ...rowsUpdated, creator: request.epadAuth.username },
        });
        // check if new entry created
        // if not created, get the id and update the relation
        if (result[1]) {
          reply.code(200).send(`new relation created sucessfully on update`);
        } else {
          await models.project_user.update(rowsUpdated, { where: { id: result[0].dataValues.id } });
          reply.code(200).send(`update sucessful`);
        }
      }
    } catch (err) {
      if (err instanceof ResourceNotFoundError)
        reply.send(
          new BadRequestError(
            `Updating project ${request.params.project} user ${request.params.user} association`,
            err
          )
        );
      else
        reply.send(
          new InternalError(
            `Updating project ${request.params.project} user ${request.params.user} association`,
            err
          )
        );
    }
  });
  */

  fastify.decorate('getUserProjectIdsInternal', (username, projectid) => {
    const query = new Promise(async (resolve, reject) => {
      try {
        // find user id
        const user = await models.user.findOne({ where: { username }, attributes: ['id'] });
        if (user === null) reject(new ResourceNotFoundError('User', username));
        // find project id
        const project = await models.project.findOne({ where: { projectid }, attributes: ['id'] });
        if (project === null) reject(new ResourceNotFoundError('Project', projectid));

        const res = { userId: user.dataValues.id, projectId: project.dataValues.id };
        resolve(res);
      } catch (err) {
        reject(
          new InternalError(`Retrieving user ${username} and project ${projectid} db ids`, err)
        );
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
          const trimmedPermission = [];
          permissions.forEach(el => trimmedPermission.push(el.trim()));
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
            permissions: trimmedPermission,
            projectToRole,
            projects,
            username: user.username,
            role: user.role,
          };
          result.push(obj);
        });
        reply.code(200).send(result);
      })
      .catch(err => {
        reply.send(new InternalError('Getting users', err));
      });
  });

  fastify.decorate('getUser', (request, reply) => {
    fastify
      .getUserInternal(request.params)
      .then(res => reply.code(200).send(res))
      .catch(err => {
        reply.send(err);
      });
  });

  fastify.decorate('getUserPreferences', (request, reply) => {
    fastify
      .getUserInternal(request.params)
      .then(res => {
        reply.code(200).send(res.preferences ? JSON.parse(res.preferences) : {});
      })
      .catch(err => {
        reply.send(err);
      });
  });

  fastify.decorate('updateUserPreferences', (request, reply) => {
    const rowsUpdated = {
      preferences: JSON.stringify(request.body),
      updated_by: request.epadAuth.username,
      updatetime: Date.now(),
    };
    fastify
      .updateUserInternal(rowsUpdated, request.params)
      .then(() => {
        reply.code(200).send(`User ${request.params.user} updated sucessfully`);
      })
      .catch(err => {
        reply.send(new InternalError(`Updating user ${request.params.user}`, err));
      });
  });

  fastify.decorate('updateUser', (request, reply) => {
    const rowsUpdated = {
      ...request.body,
      updated_by: request.epadAuth.username,
      updatetime: Date.now(),
    };
    fastify
      .updateUserInternal(rowsUpdated, request.params)
      .then(() => {
        reply.code(200).send(`User ${request.params.user} updated sucessfully`);
      })
      .catch(err => {
        reply.send(new InternalError(`Updating user ${request.params.user}`, err));
      });
  });

  fastify.decorate(
    'updateUserInternal',
    (rowsUpdated, params) =>
      new Promise(async (resolve, reject) => {
        models.user
          .update(rowsUpdated, { where: { username: params.user } })
          .then(() => {
            resolve();
          })
          .catch(err => {
            reject(new InternalError(`Updating user ${params.user}`, err));
          });
      })
  );

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
              preferences: user[0].preferences,
            };
            resolve(obj);
          } else {
            reject(new ResourceNotFoundError('User', params.user));
          }
        } catch (err) {
          reject(new InternalError(`Getting user ${params.user}`, err));
        }
      })
  );

  fastify.decorate('deleteUser', (request, reply) => {
    models.user
      .destroy({
        where: {
          username: request.params.user,
        },
      })
      .then(() => {
        reply.code(200).send(`User ${request.params.user} is deleted successfully`);
      })
      .catch(err => {
        reply.send(new InternalError(`Deleting ${request.params.user}`, err));
      });
  });

  fastify.decorate(
    'getMultipartBuffer',
    stream =>
      new Promise(async (resolve, reject) => {
        try {
          const bufs = [];
          stream.on('data', d => {
            bufs.push(d);
          });
          stream.on('end', () => {
            const buf = Buffer.concat(bufs);
            fastify.log.info(`Packed ${Buffer.byteLength(buf)} bytes of buffer `);
            resolve(toArrayBuffer(buf));
          });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getSegDicom',
    segEntity =>
      new Promise(async (resolve, reject) => {
        try {
          const result = await this.request.get(
            `/?requestType=WADO&studyUID=${segEntity.studyInstanceUid.root}&seriesUID=${
              segEntity.seriesInstanceUid.root
            }&objectUID=${segEntity.sopInstanceUid.root}`,
            { responseType: 'stream' }
          );

          const bufs = [];
          result.data.on('data', d => {
            bufs.push(d);
          });
          result.data.on('end', () => {
            const buf = Buffer.concat(bufs);
            resolve({ uid: segEntity.sopInstanceUid.root, buffer: buf });
          });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getSeriesWadoMultipart',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          let query = params.study ? `/${params.study}` : '';
          if (params.series) query += `/series/${params.series}`;
          const resultStream = await this.request.get(`/studies${query}`, {
            responseType: 'stream',
          });
          const res = await fastify.getMultipartBuffer(resultStream.data);
          const parts = dcmjs.utilities.message.multipartDecode(res);
          resolve(parts);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'prepSeriesDownloadDir',
    (dataDir, params, query, epadAuth, retrieveSegs) =>
      new Promise(async (resolve, reject) => {
        try {
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;
          const parts = await fastify.getSeriesWadoMultipart(params);
          // get dicoms
          const dcmPromises = [];
          for (let i = 0; i < parts.length; i += 1) {
            const arrayBuffer = parts[i];
            const ds = dcmjs.data.DicomMessage.readFile(arrayBuffer);
            const dicomUid =
              ds.dict['00080018'] && ds.dict['00080018'].Value ? ds.dict['00080018'].Value[0] : i;
            dcmPromises.push(() => {
              return fs.writeFile(`${dataDir}/${dicomUid}.dcm`, Buffer.from(arrayBuffer));
            });
            isThereDataToWrite = true;
          }
          await fastify.pq.addAll(dcmPromises);
          if (query.includeAims && query.includeAims === 'true') {
            // get aims
            const aimPromises = [];
            const aims = await fastify.filterProjectAims(params, {}, epadAuth);
            const segRetrievePromises = [];
            for (let i = 0; i < aims.length; i += 1) {
              aimPromises.push(() => {
                return fs.writeFile(
                  `${dataDir}/${aims[i].ImageAnnotationCollection.uniqueIdentifier.root}.json`,
                  JSON.stringify(aims[i])
                );
              });
              // only get the segs if we are retrieving series. study already gets it
              if (
                retrieveSegs &&
                params.series &&
                aims[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .segmentationEntityCollection
              ) {
                const segEntity =
                  aims[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .segmentationEntityCollection.SegmentationEntity[0];
                segRetrievePromises.push(() => {
                  return fastify.getSegDicom(segEntity);
                });
              }
              isThereDataToWrite = true;
            }
            await fastify.pq.addAll(aimPromises);

            if (retrieveSegs && segRetrievePromises.length > 0) {
              // we need to create the segs dir. this should only happen with retrieveSegs
              fs.mkdirSync(`${dataDir}/segs`);
              const segWritePromises = [];
              const segs = await fastify.pq.addAll(segRetrievePromises);
              for (let i = 0; i < segs.length; i += 1) {
                segWritePromises.push(() => {
                  return fs.writeFile(`${dataDir}/segs/${segs[i].uid}.dcm`, segs[i].buffer);
                });
                isThereDataToWrite = true;
              }
              await fastify.pq.addAll(segWritePromises);
            }
          }
          resolve(isThereDataToWrite);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'prepStudyDownloadDir',
    (dataDir, params, query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          let isThereDataToWrite = false;
          // get study series
          const studySeries = await fastify.getStudySeriesInternal(
            { study: params.study },
            { format: 'summary' },
            epadAuth,
            true
          );
          // call fastify.prepSeriesDownloadDir(); for each
          for (let i = 0; i < studySeries.length; i += 1) {
            const seriesDir = `${dataDir}/Series-${studySeries[i].seriesUID}`;
            fs.mkdirSync(seriesDir);
            // eslint-disable-next-line no-await-in-loop
            const isThereData = await fastify.prepSeriesDownloadDir(
              seriesDir,
              { ...params, series: studySeries[i].seriesUID },
              query,
              epadAuth,
              false
            );
            isThereDataToWrite = isThereDataToWrite || isThereData;
          }
          resolve(isThereDataToWrite);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('writeHead', (dirName, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=${dirName}.zip`,
      'Access-Control-Allow-Origin': '*',
    });
  });

  // it needs the node response object
  fastify.decorate(
    'prepDownload',
    async (params, query, epadAuth, output, whereJSON, studyInfos, seriesInfos) =>
      new Promise(async (resolve, reject) => {
        try {
          // if it has res, it is fastify reply
          const isResponseJustStream = !output.res;
          const res = isResponseJustStream ? output : output.res;
          const studiesInfo = whereJSON
            ? await fastify.getStudiesInternal(whereJSON, params, epadAuth, true, query)
            : studyInfos;

          const timestamp = new Date().getTime();
          const dir = `tmp_${timestamp}`;
          let headWritten = false;
          if (!fs.existsSync(dir)) {
            const archive = archiver('zip', {
              zlib: { level: 9 }, // Sets the compression level.
            });

            fs.mkdirSync(dir);
            let dirName = params.series ? params.series : params.study;
            if (studyInfos) dirName = 'Studies';
            else if (whereJSON) {
              if (!whereJSON.subject_id) dirName = params.project;
              else if (whereJSON.subject_id.$in) dirName = 'Patients';
              else dirName = params.subject;
            }
            const dataDir = `${dir}/${dirName}`;
            fs.mkdirSync(dataDir);
            let isThereDataToWrite = false;
            if (params.series) {
              // just download one series
              const isThereData = await fastify.prepSeriesDownloadDir(
                dataDir,
                params,
                query,
                epadAuth,
                true
              );
              if (!isThereData) fs.rmdirSync(dataDir);
              isThereDataToWrite = isThereDataToWrite || isThereData;
            } else if (params.study) {
              // download all series under study
              const isThereData = await fastify.prepStudyDownloadDir(
                dataDir,
                params,
                query,
                epadAuth
              );
              if (!isThereData) fs.rmdirSync(dataDir);
              isThereDataToWrite = isThereDataToWrite || isThereData;
            } else if (studiesInfo) {
              // download all studies under subject
              for (let i = 0; i < studiesInfo.length; i += 1) {
                const studyUid = studiesInfo[i].study;
                let studySubDir = `Study-${studyUid}`;
                const subjectUid = studiesInfo[i].subject;
                if (subjectUid) {
                  if (!fs.existsSync(`${dataDir}/Patient-${subjectUid}`))
                    fs.mkdirSync(`${dataDir}/Patient-${subjectUid}`);
                  studySubDir = `Patient-${subjectUid}/Study-${studyUid}`;
                }
                const studyDir = `${dataDir}/${studySubDir}`;
                fs.mkdirSync(studyDir);
                // eslint-disable-next-line no-await-in-loop
                const isThereData = await fastify.prepStudyDownloadDir(
                  studyDir,
                  { ...params, subject: subjectUid, study: studyUid },
                  query,
                  epadAuth
                );
                if (!isThereData) fs.rmdirSync(studyDir);
                else {
                  if (!headWritten) {
                    if (!isResponseJustStream) {
                      // start writing the head so that long requests do not fail
                      fastify.writeHead(dirName, res);
                    }
                    // create the archive
                    archive
                      .on('error', err => reject(new InternalError('Archiving ', err)))
                      .pipe(res);
                    headWritten = true;
                  }
                  archive.directory(`${studyDir}`, studySubDir);
                }
                isThereDataToWrite = isThereDataToWrite || isThereData;
              }
            } else if (seriesInfos) {
              for (let i = 0; i < seriesInfos.length; i += 1) {
                const seriesDir = `${dataDir}/Series-${seriesInfos[i].series}`;
                fs.mkdirSync(seriesDir);
                // eslint-disable-next-line no-await-in-loop
                const isThereData = await fastify.prepSeriesDownloadDir(
                  seriesDir,
                  {
                    ...params,
                    subject: seriesInfos[i].subject,
                    study: seriesInfos[i].study,
                    series: seriesInfos[i].series,
                  },
                  query,
                  epadAuth,
                  false
                );
                isThereDataToWrite = isThereDataToWrite || isThereData;
              }
            }
            // check files
            const files = await fastify.getFilesInternal({ format: 'stream' }, params, dataDir);
            isThereDataToWrite = isThereDataToWrite || files;

            if (isThereDataToWrite) {
              if (!headWritten) {
                if (!isResponseJustStream) fastify.writeHead(dirName, res);
                // create the archive
                archive.on('error', err => reject(new InternalError('Archiving ', err))).pipe(res);
              }
              res.on('finish', () => {
                fs.remove(dir, error => {
                  if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                  else fastify.log.info(`${dir} deleted`);
                });
              });

              archive.on('end', () => {
                if (!isResponseJustStream) {
                  // eslint-disable-next-line no-param-reassign
                  output.sent = true;
                }
                resolve();
              });

              if (!headWritten) {
                archive.directory(`${dataDir}`, false);
              }

              archive.finalize();
            } else {
              // finalize even if no files?
              archive.finalize();
              fs.remove(dir, error => {
                if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
              reject(new InternalError('Downloading', new Error('No file in download')));
            }
          }
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getPatientStudyFromProject', async (request, reply) => {
    try {
      // TODO check if it is in the project

      if (request.query.format === 'stream') {
        await fastify.prepDownload(request.params, request.query, request.epadAuth, reply);
      } else {
        const studyUids = [request.params.study];
        const result = await fastify.getPatientStudiesInternal(
          request.params,
          studyUids,
          request.epadAuth,
          request.query
        );
        if (result.length === 1) reply.code(200).send(result[0]);
        else reply.send(new ResourceNotFoundError('Study', request.params.study));
      }
    } catch (err) {
      reply.send(new InternalError(`Get study ${request.params.study}`, err));
    }
  });

  fastify.decorate(
    'getProjectSubjectIds',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne({
            where: { projectid: params.project },
          });
          const subject = await models.subject.findOne({
            where: { subjectuid: params.subject },
          });

          if (project === null)
            reject(
              new BadRequestError(
                'Get studies from project',
                new ResourceNotFoundError('Project', params.project)
              )
            );
          else if (subject === null) reject(new ResourceNotFoundError('Subject', params.subject));
          resolve({
            project_id: project.id,
            subject_id: subject.id,
          });
        } catch (err) {
          reject(new InternalError('Putting file to project', err));
        }
      })
  );

  fastify.decorate('getSubjectFromProject', async (request, reply) => {
    try {
      // TODO check if it is in the project
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      const subject = await models.subject.findOne({
        where: { subjectuid: request.params.subject },
      });

      if (project === null)
        reply.send(
          new BadRequestError(
            'Get studies from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else if (subject === null)
        reply.send(new ResourceNotFoundError('Subject', request.params.subject));
      else if (request.query.format === 'stream') {
        await fastify.prepDownload(request.params, request.query, request.epadAuth, reply, {
          project_id: project.id,
          subject_id: subject.id,
        });
      } else {
        const subjectUids = [request.params.subject];
        const result = await fastify.getPatientsInternal(
          request.params,
          subjectUids,
          request.epadAuth
        );
        if (result.length === 1) reply.code(200).send(result[0]);
        else reply.send(new ResourceNotFoundError('Subject', request.params.subject));
      }
    } catch (err) {
      reply.send(new InternalError(`Get subject ${request.params.subject}`, err));
    }
  });

  fastify.decorate('downloadSubjects', async (request, reply) => {
    try {
      // TODO check if it is in the project
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      if (project === null)
        reply.send(
          new BadRequestError(
            'Download subjects from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        // get subject ids
        const subjectPromises = [];
        for (let i = 0; i < request.body.length; i += 1) {
          subjectPromises.push(
            new Promise(async (resolve, reject) => {
              try {
                const subj = await models.subject.findOne({
                  where: { subjectuid: request.body[i] },
                  attributes: ['id'],
                  raw: true,
                });
                resolve(subj.id);
              } catch (err) {
                reject(err);
              }
            })
          );
        }
        const subjectIds = await Promise.all(subjectPromises);
        await fastify.prepDownload(request.params, request.query, request.epadAuth, reply, {
          project_id: project.id,
          subject_id: { $in: subjectIds },
        });
      }
    } catch (err) {
      reply.send(new InternalError(`Download subjects ${JSON.stringify(request.body)}`, err));
    }
  });

  fastify.decorate('downloadStudies', async (request, reply) => {
    try {
      // TODO check if it is in the project
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      if (project === null)
        reply.send(
          new BadRequestError(
            'Download studies from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        await fastify.prepDownload(
          request.params,
          request.query,
          request.epadAuth,
          reply,
          undefined,
          request.body
        );
      }
    } catch (err) {
      reply.send(new InternalError(`Download subjects ${JSON.stringify(request.body)}`, err));
    }
  });

  fastify.decorate('downloadSeries', async (request, reply) => {
    try {
      // TODO check if it is in the project
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });

      if (project === null)
        reply.send(
          new BadRequestError(
            'Download studies from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        await fastify.prepDownload(
          request.params,
          request.query,
          request.epadAuth,
          reply,
          undefined,
          undefined,
          request.body
        );
      }
    } catch (err) {
      reply.send(new InternalError(`Download subjects ${JSON.stringify(request.body)}`, err));
    }
  });

  fastify.decorate('putOtherFileToProject', (request, reply) => {
    fastify
      .putOtherFileToProjectInternal(request.params.filename, request.params, request.epadAuth)
      .then(() =>
        reply
          .code(200)
          .send(
            `File ${request.params.filename} successfully saved in project  ${
              request.params.project
            }`
          )
      )
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'checkProjectAssociation',
    (projectId, params, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          if (params.subject) {
            const subject = await models.subject.findOne(
              {
                where: { subjectuid: params.subject },
              },
              transaction ? { transaction } : {}
            );
            if (!subject) {
              reject(
                new ResourceNotFoundError(
                  `Project ${params.project} subject association. No subject`,
                  params.subject
                )
              );
            }
            const projectSubject = await models.project_subject.findOne(
              {
                where: { project_id: projectId, subject_id: subject.id },
              },
              transaction ? { transaction } : {}
            );
            if (!projectSubject) {
              reject(
                new ResourceNotFoundError(
                  `Project ${params.project} subject association`,
                  params.subject
                )
              );
            }
            if (params.study) {
              const study = await models.study.findOne(
                {
                  where: { studyuid: params.study },
                },
                transaction ? { transaction } : {}
              );
              if (!study) {
                reject(
                  new ResourceNotFoundError(
                    `Project ${params.project} study association. No study`,
                    params.study
                  )
                );
              }
              const projectSubjectStudy = await models.project_subject_study.findOne(
                {
                  where: { proj_subj_id: projectSubject.id, study_id: study.id },
                },
                transaction ? { transaction } : {}
              );
              if (!projectSubjectStudy) {
                reject(
                  new ResourceNotFoundError(
                    `Project ${params.project} study association`,
                    params.study
                  )
                );
              }
            }
          }
          resolve();
        } catch (err) {
          reject(new InternalError('Project association check', err));
        }
      })
  );

  fastify.decorate(
    'saveFileInDB',
    (filename, projectId, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          await models.project_file.create(
            {
              project_id: projectId,
              file_uid: filename,
              creator: epadAuth.username,
              updatetime: Date.now(),
              createdtime: Date.now(),
            },
            transaction ? { transaction } : {}
          );
          resolve();
        } catch (err) {
          reject(new InternalError('Putting file to project', err));
        }
      })
  );

  fastify.decorate(
    'putOtherFileToProjectInternal',
    (filename, params, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne(
            { where: { projectid: params.project } },
            transaction ? { transaction } : {}
          );
          // if the subjects and/or study is given, make sure that subject and/or study is assosiacted with the project
          if (project === null) reject(new ResourceNotFoundError('Project', params.project));
          else {
            fastify
              .checkProjectAssociation(project.id, params, transaction)
              .then(async () => {
                await fastify.saveFileInDB(filename, project.id, epadAuth, transaction);
                resolve();
              })
              .catch(errAssoc => {
                if (errAssoc instanceof ResourceNotFoundError)
                  reject(
                    new BadRequestError(
                      'The subject and/or study the file is being put is not associated with project',
                      errAssoc
                    )
                  );
                else reject(errAssoc);
              });
          }
        } catch (err) {
          reject(new InternalError('Putting file to project', err));
        }
      })
  );

  fastify.decorate('getProjectFiles', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Getting project files',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const fileUids = [];
        const projectFiles = await models.project_file.findAll({
          where: { project_id: project.id },
        });
        // projects will be an array of Project instances with the specified name
        projectFiles.forEach(projectFile => fileUids.push(projectFile.file_uid));
        const result = await fastify.getFilesFromUIDsInternal(
          request.query,
          fileUids,
          (({ subject, study, series }) => ({ subject, study, series }))(request.params)
        );

        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=files.zip`);
        }
        reply.code(200).send(result);
      }
    } catch (err) {
      reply.send(new InternalError(`Getting files for project ${request.params.project}`, err));
    }
  });

  fastify.decorate('getProjectUsers', async (request, reply) => {
    try {
      const projectId = await models.project.findOne({
        where: { projectid: request.params.project },
        attributes: ['id'],
        raw: true,
      });
      if (projectId === null || !projectId.id)
        reply.send(
          new BadRequestError(
            'Getting project users',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const result = [];
        const projectUsers = await models.project_user.findAll({
          where: { project_id: projectId.id },
          raw: true,
        });
        const userPromise = [];
        // get users
        projectUsers.forEach(el => {
          userPromise.push(
            models.user.findOne({
              where: { id: el.user_id },
              raw: true,
            })
          );
        });
        Promise.all(userPromise)
          .then(data => {
            data.forEach((user, index) => {
              const permissions = user.permissions ? user.permissions.split(',') : '';
              const obj = {
                displayname: `${user.firstname} ${user.lastname}`,
                username: user.username,
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.email,
                permissions,
                enabled: user.enabled,
                admin: user.admin,
                passwordexpired: user.passwordexpired,
                creator: user.creator,
                role: projectUsers[index].role,
              };
              result.push(obj);
            });
            reply.code(200).send(result);
          })
          .catch(errUser => {
            reply.send(new InternalError(`Getting users for project`, errUser));
          });
      }
    } catch (err) {
      reply.send(new InternalError(`Getting users for project ${request.params.project}`, err));
    }
  });

  fastify.decorate('updateProjectUserRole', async (request, reply) => {
    try {
      const projectId = await models.project.findOne({
        where: { projectid: request.params.project },
        attributes: ['id'],
        raw: true,
      });

      const userId = await models.user.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
        raw: true,
      });

      if (!projectId.id) {
        reply.send(
          new BadRequestError(
            'Updating project users role',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else if (!userId.id) {
        reply.send(
          new BadRequestError(
            'Updating project users role',
            new ResourceNotFoundError('User', request.params.user)
          )
        );
      } else if (!request.body || !request.body.role) {
        reply.send(
          new BadRequestError(
            'Updating project users role',
            new ResourceNotFoundError('Role', request.params.user)
          )
        );
      } else {
        await fastify.upsert(
          models.project_user,
          {
            role: request.body.role,
            updatetime: Date.now(),
            project_id: projectId.id,
            user_id: userId.id,
          },
          { project_id: projectId.id, user_id: userId.id },
          request.epadAuth.username
        );
        reply.code(200).send('Update successful');
      }
    } catch (err) {
      reply.send(
        new InternalError(`Updating user role for project ${request.params.project}`, err)
      );
    }
  });

  fastify.decorate('deleteProjectUser', async (request, reply) => {
    try {
      const projectId = await models.project.findOne({
        where: { projectid: request.params.project },
        attributes: ['id'],
        raw: true,
      });

      const userId = await models.user.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
        raw: true,
      });

      if (!projectId.id) {
        reply.send(
          new BadRequestError(
            'Updating project users role',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else if (!userId.id) {
        reply.send(
          new BadRequestError(
            'Updating project users role',
            new ResourceNotFoundError('User', request.params.user)
          )
        );
      } else {
        await models.project_user.destroy({
          where: { user_id: userId.id, project_id: projectId.id },
        });
        reply.code(200).send('Delete successful');
      }
    } catch (err) {
      reply.send(
        new InternalError(`Updating user role for project ${request.params.project}`, err)
      );
    }
  });

  fastify.decorate('getProjectFile', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Getting project file',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const projectFile = await models.project_file.findOne({
          where: { project_id: project.id, file_uid: request.params.filename },
        });
        if (projectFile === null)
          reply.send(
            new BadRequestError(
              'Getting project file',
              new ResourceNotFoundError('Project file association', request.params.project)
            )
          );
        else {
          const result = await fastify.getFilesFromUIDsInternal(request.query, [
            request.params.filename,
          ]);

          if (request.query.format === 'stream') {
            reply.header('Content-Disposition', `attachment; filename=files.zip`);
            reply.code(200).send(result);
          } else if (result.length === 1) reply.code(200).send(result[0]);
          else {
            fastify.log.warn(`Was expecting to find 1 record, found ${result.length}`);
            reply.send(new ResourceNotFoundError('File', request.params.filename));
          }
        }
      }
    } catch (err) {
      reply.send(new InternalError('Getting project file', err));
    }
  });

  fastify.decorate('deleteFileFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Deleting project file',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else if (
        request.query.all &&
        request.query.all === 'true' &&
        request.epadAuth.admin === false
      )
        reply.send(new UnauthorizedError('User is not admin, cannot delete from system'));
      else {
        const numDeleted = await models.project_file.destroy({
          where: { project_id: project.id, file_uid: request.params.filename },
        });
        // if delete from all or it doesn't exist in any other project, delete from system
        try {
          if (request.query.all && request.query.all === 'true') {
            const deletednum = await models.project_file.destroy({
              where: { file_uid: request.params.filename },
            });
            await fastify.deleteFileInternal(request.params);
            reply
              .code(200)
              .send(
                `File deleted from system and removed from ${deletednum + numDeleted} projects`
              );
          } else {
            const count = await models.project_file.count({
              where: { file_uid: request.params.filename },
            });
            if (count === 0) {
              await fastify.deleteFileInternal(request.params);
              reply
                .code(200)
                .send(`File deleted from system as it didn't exist in any other project`);
            } else
              reply.code(200).send(`File not deleted from system as it exists in other project`);
          }
        } catch (deleteErr) {
          reply.send(
            new InternalError(
              `File ${request.params.filename} check and deletion from system`,
              deleteErr
            )
          );
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `File ${request.params.filename} check and deletion from project ${
            request.params.project
          }`,
          err
        )
      );
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
      reply.send(
        new InternalError(`File ${request.params.filename} check and deletion from system`, err)
      );
    }
  });

  fastify.decorate('getStudiesFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Get studies from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const result = await fastify.getStudiesInternal(
          {
            project_id: project.id,
          },
          request.params,
          request.epadAuth,
          false,
          request.query
        );

        reply.code(200).send(result);
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Getting studies of ${request.params.subject} from project ${request.params.project}`,
          err
        )
      );
    }
  });

  fastify.decorate('getSeriesFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Get series from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const studyUids = [];
        const nondicoms = [];
        const projectSubjects = await models.project_subject.findAll({
          where: { project_id: project.id },
          include: [models.subject, models.study],
        });
        if (projectSubjects === null) {
          reply.send(
            new BadRequestError(
              'Get series from project',
              new ResourceNotFoundError('Project subject association', request.params.project)
            )
          );
        } else {
          for (let i = 0; i < projectSubjects.length; i += 1) {
            for (let j = 0; j < projectSubjects[i].dataValues.studies.length; j += 1) {
              studyUids.push(projectSubjects[i].dataValues.studies[j].dataValues.studyuid);
              // ASSUMPTION: nondicoms have no studydate
              if (!projectSubjects[i].dataValues.studies[j].dataValues.studydate)
                nondicoms.push({
                  subject: projectSubjects[i].dataValues.subject,
                  study: projectSubjects[i].dataValues.studies[j],
                });
            }
          }
          let result = [];
          for (let j = 0; j < studyUids.length; j += 1) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const studySeries = await fastify.getStudySeriesInternal(
                { study: studyUids[j] },
                request.query,
                request.epadAuth,
                true
              );
              result = result.concat(studySeries);
            } catch (err) {
              fastify.log.warn(`Can be a nondicom. Ingoring error: ${err.message}`);
            }
          }
          for (let j = 0; j < nondicoms.length; j += 1) {
            // eslint-disable-next-line no-await-in-loop
            const nondicomStudySeries = await fastify.getNondicomStudySeriesFromProjectInternal({
              subject: nondicoms[j].subject.dataValues.subjectuid,
              study: nondicoms[j].study.dataValues.studyuid,
            });

            result = result.concat(nondicomStudySeries);
          }
          // TODO handle nondicom series

          result = _.sortBy(result, ['patientName', 'seriesDescription']);
          reply.code(200).send(result);
        }
      }
    } catch (err) {
      reply.send(new InternalError(`Getting studies from project ${request.params.project}`, err));
    }
  });

  // if applypatient or it is the series that is being edited apply the patient keys
  // if applystudy or it is the series that is being edited or it is the study being edited apply the study keys and patient keys
  // if it is the series that is being edited apply series keys
  fastify.decorate(
    'updateDcm',
    (dataset, tagValues, studyUid, seriesUid, applyPatient, applyStudy) => {
      // define this to make sure they don't send funny stuff
      const queryKeysPatient = {
        PatientID: '00100020',
        PatientName: '00100010',
      };
      const queryKeysStudy = {
        StudyInstanceUID: '0020000D',
        StudyDescription: '00081030',
      };
      const queryKeysSeries = {
        SeriesInstanceUID: '0020000E',
        SeriesDescription: '0008103E',
      };
      let queryKeys = {};
      if (
        applyPatient ||
        (applyStudy && dataset['0020000D'].Value[0] === studyUid) ||
        dataset['0020000E'].Value[0] === seriesUid
      ) {
        queryKeys = { ...queryKeys, ...queryKeysPatient };
      }
      if (
        (applyStudy && dataset['0020000D'].Value[0] === studyUid) ||
        dataset['0020000E'].Value[0] === seriesUid
      ) {
        queryKeys = { ...queryKeys, ...queryKeysStudy };
      }
      if (dataset['0020000E'].Value[0] === seriesUid) {
        queryKeys = { ...queryKeys, ...queryKeysSeries };
      }

      const keysInQuery = Object.keys(tagValues);
      const editedDataset = dataset;
      for (let i = 0; i < keysInQuery.length; i += 1) {
        if (queryKeys[keysInQuery[i]]) {
          switch (editedDataset[queryKeys[keysInQuery[i]]].vr) {
            case 'PN':
              editedDataset[queryKeys[keysInQuery[i]]].Value = [
                // {
                //   Alphabetic: tagValues[keysInQuery[i]],
                // },
                tagValues[keysInQuery[i]],
              ];
              break;
            case 'DS':
              editedDataset[queryKeys[keysInQuery[i]]].Value = [
                parseFloat(tagValues[keysInQuery[i]]),
              ];
              break;
            case 'IS':
              editedDataset[queryKeys[keysInQuery[i]]].Value = [
                parseInt(tagValues[keysInQuery[i]], 10),
              ];
              break;
            default:
              editedDataset[queryKeys[keysInQuery[i]]].Value = [tagValues[keysInQuery[i]]];
          }
        }
      }
      return editedDataset;
    }
  );

  // if you pass a second seriesUid, you are updating study
  fastify.decorate(
    'updateSeriesBuffers',
    (params, tagValues, studyUid, seriesUid, applyPatient, applyStudy) =>
      new Promise(async (resolve, reject) => {
        try {
          const processParams = { subject: params.subject, study: studyUid, series: seriesUid };
          const parts = await fastify.getSeriesWadoMultipart(processParams);
          const updatedDatasets = [];
          for (let i = 0; i < parts.length; i += 1) {
            const arrayBuffer = parts[i];
            const ds = dcmjs.data.DicomMessage.readFile(arrayBuffer);
            // send in the study and series in the original request
            ds.dict = fastify.updateDcm(
              ds.dict,
              tagValues,
              params.study,
              params.series,
              applyPatient,
              applyStudy
            );
            const buffer = ds.write();
            updatedDatasets.push(toArrayBuffer(buffer));
          }
          const { data, boundary } = dcmjs.utilities.message.multipartEncode(updatedDatasets);
          fastify.log.info(
            `Sending ${Buffer.byteLength(data)} bytes of data to dicom web server for saving`
          );
          // eslint-disable-next-line no-await-in-loop
          await fastify.saveDicomsInternal(data, boundary);
          resolve();
        } catch (err) {
          reject(
            new InternalError(`Updating ${JSON.stringify(params)} dicoms with ${tagValues}`, err)
          );
        }
      })
  );

  // if you pass a second studyUid, you are updating patient
  fastify.decorate(
    'updateStudyBuffers',
    (params, tagValues, studyUid, epadAuth, applyPatient, applyStudy) =>
      new Promise(async (resolve, reject) => {
        try {
          // get study series
          const studySeries = await fastify.getStudySeriesInternal(
            { study: studyUid },
            { format: 'summary' },
            epadAuth,
            true
          );
          const seriesPromises = [];
          for (let i = 0; i < studySeries.length; i += 1) {
            seriesPromises.push(() => {
              return fastify.updateSeriesBuffers(
                params,
                tagValues,
                studyUid,
                studySeries[i].seriesUID,
                applyPatient,
                applyStudy
              );
            });
          }
          await fastify.pq.addAll(seriesPromises);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'editTags',
    (request, reply) =>
      new Promise(async (resolve, reject) => {
        try {
          const { params, body, query, epadAuth } = request;
          const applyPatient = query.applyPatient === 'true';
          const applyStudy = query.applyStudy === 'true';
          const promises = [];
          promises.push(
            models.project.findOne({
              where: { projectid: params.project },
              raw: true,
            })
          );
          promises.push(
            models.subject.findOne({
              where: { subjectuid: params.subject },
              raw: true,
            })
          );

          promises.push(
            models.study.findOne({
              where: { studyuid: params.study },
              raw: true,
            })
          );
          // eslint-disable-next-line prefer-const
          let [project, subject, study] = await Promise.all(promises);
          let projectSubject = await models.project_subject.findOne({
            where: { project_id: project.id, subject_id: subject.id },
            raw: true,
          });
          const projectSubjectStudy = await models.project_subject_study.findOne({
            where: { proj_subj_id: projectSubject.id, study_id: study.id },
            raw: true,
          });
          // sanity checks, can we update?
          // if user changes name but not the PatientID and if not applyPatient, return badrequest
          if (
            (!body.PatientID || subject.subjectuid === body.PatientID) &&
            body.PatientName &&
            subject.name !== body.PatientName &&
            !applyPatient
          )
            reject(
              new BadRequestError(
                'Edit Tags',
                new Error(
                  'Cannot change patient name without changing PatientID or with applyPatient query parameter true'
                )
              )
            );
          // if user changes description but not the StudyInstanceUID and if not applystudy, return badrequest
          else if (
            (!body.StudyInstanceUID || study.studyuid === body.StudyInstanceUID) &&
            body.StudyDescription &&
            study.description !== body.StudyDescription &&
            !applyStudy
          )
            reject(
              new BadRequestError(
                'Edit Tags',
                new Error(
                  'Cannot change Study Description without changing Study Instance UID or with applyStudy query parameter true'
                )
              )
            );
          else {
            reply
              .code(202)
              .send(
                `${params.subject} ${params.study} ${params.series} tags edit request is initiated `
              );
            // changing the value in dicomweb. this will affect all projects!!
            const whereJson = await fastify.getProjectSubjectIds(params);
            const studyUids = await fastify.getStudiesInternal(
              whereJson,
              params,
              epadAuth,
              true,
              query
            );
            if (applyPatient) {
              for (let i = 0; i < studyUids.length; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await fastify.updateStudyBuffers(
                  params,
                  body,
                  studyUids[i],
                  epadAuth,
                  applyPatient,
                  applyStudy
                );
              }
            } else if (applyStudy) {
              await fastify.updateStudyBuffers(
                params,
                body,
                params.study,
                epadAuth,
                applyPatient,
                applyStudy
              );
            } else await fastify.updateSeriesBuffers(params, body, params.study, params.series);

            // if patient data is changed
            // if body has PatientID and PatientName we need to change db
            // if applyPatient just update it
            // if not we need to create another one if patient has more data!
            if (
              (body.PatientID && subject.subjectuid !== body.PatientID) ||
              (body.PatientName && subject.name !== body.PatientName)
            ) {
              if (applyPatient) {
                await models.subject.update(
                  {
                    subjectuid: body.PatientID,
                    name: body.PatientName,
                    updated_by: epadAuth.username,
                    updatetime: Date.now(),
                  },
                  {
                    where: {
                      subjectuid: params.subject,
                    },
                  }
                );
              } else {
                // needs to have subject.subjectuid !== body.PatientID but we already verify that in the beginning and verify applySubject
                const existSubject = await models.subject.findOne({
                  where: { subjectuid: body.PatientID },
                  raw: true,
                });
                if (existSubject) {
                  subject = existSubject;
                  // patient already exist add to it
                  fastify.log.warn(`Subject ${body.PatientID} already exist adding to it`);
                } else {
                  subject = await models.subject.create({
                    subjectuid: body.PatientID,
                    name: body.PatientName,
                    gender: subject.gender,
                    dob: subject.dob,
                    creator: epadAuth.username,
                    updatetime: Date.now(),
                    createdtime: Date.now(),
                  });
                }
                projectSubject = await fastify.upsert(
                  models.project_subject,
                  {
                    project_id: project.id,
                    subject_id: subject.id,
                    updatetime: Date.now(),
                  },
                  { project_id: project.id, subject_id: subject.id },
                  epadAuth.username
                );
              }
            }

            // if study data is changed
            // if body has StudyInstanceUID we need to change db
            // if applyStudy just update it
            // if not we need to create another one!
            if (
              (body.StudyInstanceUID && study.studyuid !== body.StudyInstanceUID) ||
              (body.StudyDescription && study.description !== body.StudyDescription)
            ) {
              if (applyStudy) {
                await models.study.update(
                  {
                    studyuid: body.StudyInstanceUID,
                    description: body.StudyDescription,
                    subject_id: subject.id,
                    updated_by: epadAuth.username,
                    updatetime: Date.now(),
                  },
                  {
                    where: {
                      studyuid: params.study,
                    },
                  }
                );
                // update the project_subject if subject id changed
                if (projectSubjectStudy.proj_subj_id !== projectSubject.id)
                  await fastify.upsert(
                    models.project_subject_study,
                    {
                      proj_subj_id: projectSubject.id,
                      study_id: study.id,
                      updatetime: Date.now(),
                    },
                    { proj_subj_id: projectSubjectStudy.proj_subj_id, study_id: study.id },
                    epadAuth.username
                  );
              } else if (body.StudyInstanceUID && study.studyuid !== body.StudyInstanceUID) {
                study = await models.study.findOne({
                  where: { studyuid: body.StudyInstanceUID },
                  raw: true,
                });
                if (subject) {
                  // patient already exist add to it
                  fastify.log.warn(`Study ${body.StudyInstanceUID} already exist adding to it`);
                } else {
                  study = await models.study.create({
                    studyuid: body.StudyInstanceUID,
                    description: body.StudyDescription,
                    studydate: study.studydate,
                    subject_id: subject.id,
                    exam_types: study.examTypes,
                    updated_by: epadAuth.username,
                    updatetime: Date.now(),
                  });
                }
                await fastify.upsert(
                  models.project_subject_study,
                  {
                    proj_subj_id: projectSubject.id,
                    study_id: study.id,
                    updatetime: Date.now(),
                  },
                  { proj_subj_id: projectSubjectStudy.proj_subj_id, study_id: study.id },
                  epadAuth.username
                );
              }
            }
            new EpadNotification(
              request,
              'Tag Edit Completed',
              `${params.subject} ${params.study} ${params.series}`,
              true
            ).notify(fastify);
            resolve();
          }
        } catch (err) {
          reject(
            new InternalError(
              `Editing tags ${JSON.stringify(request.params)} ${JSON.stringify(request.body)}`,
              err
            )
          );
        }
      })
  );

  // tagvalues: {tag: value},
  // applyStudy: bool,
  // applyPatient: bool,
  // /projects/:p/subjects/:s/studies/:s/series/:s?editTag=true
  fastify.decorate('addNondicomSeries', async (request, reply) => {
    // eslint-disable-next-line prefer-destructuring
    let seriesUid = request.params.series;
    if (!seriesUid) {
      // eslint-disable-next-line prefer-destructuring
      seriesUid = request.body.seriesUid;
    }
    if (!seriesUid) {
      reply.send(
        new BadRequestError(
          'Adding nondicom series to project',
          new ResourceNotFoundError('Nondicom series', 'No id')
        )
      );
    }
    if (request.query.editTags === 'true') {
      request.params.series = seriesUid;
      await fastify.editTags(request, reply);
    } else {
      const promisses = [];
      promisses.push(
        models.study.findOne({
          where: { studyuid: request.params.study },
          raw: true,
        })
      );
      promisses.push(
        models.nondicom_series.findOne({
          where: { seriesuid: seriesUid },
        })
      );
      const [study, series] = await Promise.all(promisses);
      if (series) {
        reply.send(new ResourceAlreadyExistsError('Nondicom series', seriesUid));
      } else {
        await models.nondicom_series.create({
          seriesuid: seriesUid,
          study_id: study.id,
          description: request.body.description,
          seriesdate: Date.now(),
          updatetime: Date.now(),
          createdtime: Date.now(),
          creator: request.epadAuth.username,
        });
        reply.code(200).send(`${seriesUid} added successfully`);
      }
    }
  });

  fastify.decorate(
    'getObjectCreator',
    (level, objectId) =>
      new Promise(async (resolve, reject) => {
        try {
          let uidField = '';
          let model = '';
          // see if it is a db object and check the creator
          switch (level) {
            case 'project':
              uidField = 'projectid';
              model = 'project';
              break;
            // case 'aim':
            // uidField='projectid';
            // model='project';
            // break;
            // case 'template':
            // uidField='projectid';
            // model='project';
            // break;
            // case 'file':
            // uidField='projectid';
            // model='project';
            // break;
            // case 'connection':
            // uidField='projectid';
            // model='project';
            // break;
            // case 'query':
            // uidField='projectid';
            // model='project';
            // break;
            case 'worklist':
              uidField = 'worklistid';
              model = 'worklist';
              break;
            case 'user':
              uidField = 'username';
              model = 'user';
              break;
            // case 'plugin':
            // uidField='projectid';
            // model='project';
            // break;
            default:
              uidField = undefined;
              model = undefined;
              break;
          }
          if (model) {
            const object = await models[model].findOne({
              where: { [uidField]: objectId },
            });
            if (object) resolve(object.creator);
          }
          resolve();
        } catch (err) {
          reject(new InternalError(`Getting object creator for ${level} ${objectId}`, err));
        }
      })
  );
  fastify.decorate('upsert', (model, values, condition, user, transaction) =>
    model.findOne({ where: condition }).then(obj => {
      // update
      if (obj)
        return obj.update({ ...values, updated_by: user }, transaction ? { transaction } : {});
      // insert
      return model.create(
        { ...values, creator: user, createdtime: Date.now() },
        transaction ? { transaction } : {}
      );
    })
  );

  fastify.decorate('triggerStats', (request, reply) => {
    fastify
      .calcStats()
      .then(result => {
        reply.send(result);
      })
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'calcStats',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          fastify.log.info('Getting stats');
          const numOfUsers = await models.user.count();
          const numOfProjects = await models.project.count();

          let numOfPatients = 0;
          if (config.env !== 'test' && config.mode === 'thick') {
            numOfPatients = await models.project_subject.count({
              col: 'subject_uid',
              distinct: true,
            });
          } else {
            const patients = await fastify.getPatientsInternal({}, undefined, undefined, true);
            numOfPatients = patients.length;
          }

          let numOfStudies = 0;
          if (config.env !== 'test' && config.mode === 'thick') {
            numOfStudies = await models.project_subject_study.count({
              col: 'study_uid',
              distinct: true,
            });
          } else {
            // TODO this will be affected by limit!
            const studies = await fastify.getPatientStudiesInternal(
              {},
              undefined,
              { username: 'admin' },
              {},
              true
            );
            numOfStudies = studies.length;
          }

          // always from dicomweb server
          const series = await fastify.getAllStudySeriesInternal({}, undefined);
          const numOfDSOs = _.reduce(
            series,
            (count, serie) => {
              if (serie.isDSO) return count + 1;
              return count;
            },
            0
          );
          const numOfSeries = series.length - numOfDSOs;

          let numOfAims = 0;
          let numOfTemplateAimsMap = {};
          if (config.env !== 'test' && config.mode === 'thick') {
            numOfAims = await models.project_aim.count({
              col: 'aim_uid',
              distinct: true,
            });
            numOfTemplateAimsMap = await models.project_aim.findAll({
              group: ['template'],
              attributes: ['template', [Sequelize.fn('COUNT', 'aim_uid'), 'aimcount']],
              raw: true,
            });
          } else {
            // sending empty epadAuth, would fail in thick mode, but this is not called on thick mode
            const aims = await fastify.getAimsInternal('summary', {}, undefined, {});
            numOfAims = aims.length;
            for (let i = 0; i < aims.length; i += 1) {
              if (numOfTemplateAimsMap[aims[i].template])
                numOfTemplateAimsMap[aims[i].template] += 1;
              numOfTemplateAimsMap[aims[i].template] = 1;
            }
          }

          // TODO are these correct? check with thick
          const numOfFiles = await models.project_file.count();
          // TODO make sure the migration moves the files to couch
          const templates = await fastify.getTemplatesInternal('summary');
          const numOfTemplates = templates.length;

          const numOfPlugins = await models.plugin.count();

          // no plans to implement these yet
          // const numOfPacs = RemotePACService.getInstance().getRemotePACs().size();
          // const numOfAutoQueries = new RemotePACQuery().getCount("");
          const numOfWorkLists = await models.worklist.count();

          // lets get both the hostname and the hostname from request
          const hostname = `${os.hostname()}|${fastify.hostname}`;

          // save to db
          await models.epadstatistics.create({
            host: hostname,
            numOfUsers,
            numOfProjects,
            numOfPatients,
            numOfStudies,
            numOfSeries,
            numOfAims,
            numOfDSOs,
            numOfWorkLists,
            creator: 'admin',
            createdtime: Date.now(),
            updatetime: Date.now(),
            numOfFiles,
            numOfPlugins,
            numOfTemplates,
          });

          const request = Axios.create({
            baseURL: config.statsEpad,
          });
          // generic stats url
          const epadUrl = `/epad/statistics/?numOfUsers=${numOfUsers}&numOfProjects=${numOfProjects}&numOfPatients=${numOfPatients}&numOfStudies=${numOfStudies}&numOfSeries=${numOfSeries}&numOfAims=${numOfAims}&numOfDSOs=${numOfDSOs}&numOfWorkLists=${numOfWorkLists}&numOfFiles=${numOfFiles}&numOfPlugins=${numOfPlugins}&numOfTemplates=${numOfTemplates}&host=${hostname}`;

          // send to statistics collector
          if (!config.disableStats) {
            fastify.log.info(
              `Sending generic stats to ${request.defaults.baseURL}${encodeURI(epadUrl)}`
            );
            await request.put(encodeURI(epadUrl));
            fastify.log.info(`Statistics sent with success`);
          }

          // get template stats
          fastify.log.info('Getting template stats');
          for (let i = 0; i < templates.length; i += 1) {
            const templateCode = templates[i].TemplateContainer.Template[0].codeValue;
            const templateName = templates[i].TemplateContainer.Template[0].name;
            const { authors } = templates[i].TemplateContainer.Template[0];
            const { version } = templates[i].TemplateContainer.Template[0];
            const templateLevelType = templates[i].TemplateContainer.Template[0].templateType
              ? templates[i].TemplateContainer.Template[0].templateType
              : 'Image';
            const templateDescription = templates[i].TemplateContainer.Template[0].description;
            let numOfTemplateAims = 0;
            if (config.env !== 'test' && config.mode === 'thick') {
              // ???
              numOfTemplateAims = numOfTemplateAimsMap[templateCode].aimcount || 0;
            } else {
              numOfTemplateAims = numOfTemplateAimsMap[templateCode] || 0;
            }
            const templateText = JSON.stringify(templates[i]);

            // save to db
            // eslint-disable-next-line no-await-in-loop
            await models.epadstatistics_template.create({
              host: hostname,
              templateCode,
              templateName,
              authors,
              version,
              templateLevelType,
              templateDescription,
              numOfAims: numOfTemplateAims,
              templateText,
              creator: 'admin',
              createdtime: Date.now(),
              updatetime: Date.now(),
            });
            // template stats url
            const templatesEpadUrl = `/epad/statistics/templates/?templateCode=${templateCode}&templateName=${templateName}&authors=${authors}&version=${version}&templateLevelType=${templateLevelType}&templateDescription=${templateDescription}&numOfAims=${numOfTemplateAims}&host=${hostname}`;
            // send to statistics collector
            if (!config.disableStats) {
              fastify.log.info(
                `Sending template ${templateName} stats to ${request.defaults.baseURL}${encodeURI(
                  templatesEpadUrl
                )}`
              );
              // eslint-disable-next-line no-await-in-loop
              await request.put(encodeURI(templatesEpadUrl), templateText, {
                headers: { 'Content-Type': 'text/plain' },
              });
              fastify.log.info(`Template statistics sent with success`);
            }
          }

          // done with calculating and sending the statistics
          // calculate a monthly cumulative if it is there is no record for the month
          const month = new Date().getMonth() + 1;
          const monthlyStats = await models.epadstatistics_monthly.count({
            where: {
              $and: fastify.orm.where(
                fastify.orm.fn('month', fastify.orm.col('createdtime')),
                month
              ),
            },
          });
          if (monthlyStats === 0) {
            await fastify.orm.query(
              `insert into epadstatistics_monthly(numOfUsers, numOfProjects,numOfPatients,numOfStudies,numOfSeries,numOfAims,numOfDSOs,numOfWorkLists,numOfPacs,numOfAutoQueries,numOfFiles,numOfPlugins,numOfTemplates,creator,updatetime) (select sum(numOfUsers), sum(numOfProjects), sum(numOfPatients), sum(numOfStudies), sum(numOfSeries), sum(numOfAims),sum(numOfDSOs),sum(numOfWorkLists),sum(numOfPacs),sum(numOfAutoQueries),sum(numOfFiles),sum(numOfPlugins),sum(numOfTemplates),'admin',now()  from (select * from epadstatistics a where createdtime =(select max(createdtime) from epadstatistics b where b.host = a.host) group by host order by host) ab)`
            );
          }
          resolve('Stats sent');
        } catch (error) {
          reject(new InternalError(`Sending statistics to ${config.statsEpad}`, error));
        }
      })
  );

  fastify.decorate('getStats', async (request, reply) => {
    let { year } = request.query;
    if (!year) year = new Date().getFullYear();
    const stats = await fastify.orm.query(
      `select sum(numOfUsers) numOfUsers,sum(numOfProjects) numOfProjects, sum(numOfPatients) numOfPatients,sum(numOfStudies) numOfStudies,sum(numOfSeries) numOfSeries,sum(numofAims) numofAims,sum(numOfDsos) numOfDSOs,sum(numOfPacs) numOfPacs,sum(numOfAutoQueries) numOfAutoQueries,sum(numOfWorkLists) numOfWorkLists,sum(numOfFiles) numOfFiles,max(numOfTemplates) numOfTemplates,max(numOfPlugins) numOfPlugins from epadstatistics mt inner join(select max(id) id from epadstatistics where host not like '%epad-build.stanford.edu%' and host not like '%epad-dev5.stanford.edu%' and host not like '%epad-dev4.stanford.edu%' and updatetime like '%${year}%' group by host ) st on mt.id = st.id `
    );
    const statsJson = stats[0][0];
    const statsEdited = Object.keys(statsJson).reduce(
      (p, c) => ({ ...p, [c]: statsJson[c] === null ? 0 : statsJson[c] }),
      {}
    );
    reply.send(statsEdited);
  });

  fastify.decorate('saveStats', async (request, reply) => {
    try {
      const {
        host,
        numOfUsers,
        numOfProjects,
        numOfPatients,
        numOfStudies,
        numOfSeries,
        numOfAims,
        numOfDSOs,
        numOfWorkLists,
        numOfFiles,
        numOfPlugins,
        numOfTemplates,
      } = request.query;
      await models.epadstatistics.create({
        host,
        numOfUsers,
        numOfProjects,
        numOfPatients,
        numOfStudies,
        numOfSeries,
        numOfAims,
        numOfDSOs,
        numOfWorkLists,
        creator: 'admin',
        createdtime: Date.now(),
        updatetime: Date.now(),
        numOfFiles,
        numOfPlugins,
        numOfTemplates,
      });
      reply.send('Statistics saved');
    } catch (err) {
      reply.send(new InternalError('Saving statistics', err));
    }
  });

  fastify.decorate('saveTemplateStats', async (request, reply) => {
    try {
      const {
        host,
        templateCode,
        templateName,
        authors,
        version,
        templateLevelType,
        templateDescription,
        numOfAims,
      } = request.query;
      const templateText = request.body;
      await models.epadstatistics_template.create({
        host,
        templateCode,
        templateName,
        authors,
        version,
        templateLevelType,
        templateDescription,
        numOfAims,
        templateText,
        creator: 'admin',
        createdtime: Date.now(),
        updatetime: Date.now(),
      });
      reply.send('Template statistics saved');
    } catch (err) {
      reply.send(new InternalError('Saving template statistics', err));
    }
  });

  fastify.decorate(
    'saveFileToCouch',
    (fileEntry, epadAuth) =>
      new Promise((resolve, reject) => {
        let buffer = [];
        const readableStream = fs.createReadStream(fileEntry.filepath);
        readableStream.on('data', chunk => {
          buffer.push(chunk);
        });
        readableStream.on('error', readErr => {
          fastify.log.error(`Error in reading file ${fileEntry.filepath}: ${readErr}`);
          reject(new InternalError(`Reading file ${fileEntry.filepath}`, readErr));
        });
        readableStream.on('close', () => {
          readableStream.destroy();
        });
        readableStream.on('end', async () => {
          buffer = Buffer.concat(buffer);
          const timestamp = new Date().getTime();
          const fileInfo = {
            subject_uid:
              fileEntry.subject && fileEntry.subject.subjectuid ? fileEntry.subject.subjectuid : '',
            study_uid: fileEntry.study && fileEntry.study.studyuid ? fileEntry.study.studyuid : '',
            series_uid: fileEntry.series_uid ? fileEntry.series_uid : '',
            name: `${fileEntry.name}_${timestamp}`,
            filepath: 'couchdb',
            filetype: fileEntry.filetype ? fileEntry.filetype : '',
            length: Buffer.byteLength(buffer),
          };
          const params = { project: fileEntry.project_id };
          if (fileEntry.subject) params.subject = fileEntry.subject.subjectuid;
          if (fileEntry.study) params.study = fileEntry.study.studyuid;

          await fastify.putOtherFileToProjectInternal(fileInfo.name, params, epadAuth);
          resolve({ success: true });
        });
      })
  );

  fastify.decorate(
    'saveEventLog',
    (request, notification, notified, logId) =>
      new Promise(async (resolve, reject) => {
        try {
          if (logId) {
            await models.eventlog.update(
              { updatetime: Date.now(), updated_by: request.epadAuth.username, notified },
              { where: { id: logId } }
            );
          } else {
            // remove error text just to save some space
            let params = notification.params.split('Error: ').join('');
            if (params.length >= 128) {
              params = params.slice(0, 124);
              params += '...';
            }
            const log = {
              projectID: request.params.project,
              subjectuid: request.params.subject,
              studyUID: request.params.study,
              seriesUID: request.params.series,
              aimID: request.params.aimuid,
              username: request.epadAuth.username,
              function: notification.function,
              params,
              error: notification.error,
              notified,
              updatetime: Date.now(),
            };
            await models.eventlog.create({
              ...log,
              creator: request.epadAuth.username,
              createdtime: Date.now(),
            });
          }

          resolve();
        } catch (err) {
          reject(new InternalError(`Saving notification`, err));
        }
      })
  );

  fastify.decorate(
    'getUnnotifiedEventLogs',
    request =>
      new Promise(async (resolve, reject) => {
        try {
          const logs = await models.eventlog.findAll({
            where: { username: request.epadAuth.username, notified: false },
            raw: true,
          });
          for (let i = 0; i < logs.length; i += 1) {
            new EpadNotification(
              request,
              logs[i].function,
              logs[i].error ? new Error(logs[i].params) : logs[i].params,
              false,
              logs[i].id
            ).notify(fastify);
          }

          resolve();
        } catch (err) {
          reject(new InternalError(`Saving notification ${config.statsEpad}`, err));
        }
      })
  );

  // TODO
  // how to associate with transaction?? rolback??
  fastify.decorate(
    'moveFiles',
    () =>
      new Promise((resolve, reject) => {
        try {
          // check if it is already done??
          // // fill in the values
          // const files = await models.project_file.findAll({ transaction: t });
          // // projects will be an array of Project instances with the specified name
          // files.forEach(async fileTuple => {
          //   // get the file from disk
          //   // save to couchdb saveOtherFileToProjectInternal
          //   // get filename
          //   const filename = '';
          //   await models.project_file.update(
          //     { file_uid: filename },
          //     {
          //       where: {
          //         id: fileTuple.id,
          //       },
          //     }
          //   );
          // });
          resolve();
        } catch (err) {
          reject(new InternalError('Migrating files', err));
        }
      })
  );

  // TODO
  // how to associate with transaction?? rolback??
  fastify.decorate(
    'moveTemplates',
    () =>
      new Promise((resolve, reject) => {
        try {
          resolve();
        } catch (err) {
          reject(new InternalError('Migrating templates', err));
        }
      })
  );

  // TODO
  // how to associate with transaction?? rolback??
  fastify.decorate(
    'moveAims',
    () =>
      new Promise((resolve, reject) => {
        try {
          resolve();
        } catch (err) {
          reject(new InternalError('Migrating aims', err));
        }
      })
  );

  fastify.decorate(
    'fixSchema',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          // do it all or none
          await fastify.orm.transaction(async t => {
            // first version is just lite
            // we might need to do checks for later versions
            await fastify.orm.query(`DELETE FROM dbversion`, { transaction: t });
            await fastify.orm.query(`INSERT INTO dbversion(version) VALUES('lite')`, {
              transaction: t,
            });

            // go over each table that has schema changes
            // // 1. epad_file
            // // not used. discard the changes for now

            // // 2. nondicom_series
            // // change study_id to study_uid
            // rolling back the change

            // 3. project_aim
            // // new table
            // migration from annotations required
            // annotations need to be saved in couchdb
            // TODO
            await fastify.orm.query(
              `ALTER TABLE project_aim 
                ADD COLUMN IF NOT EXISTS frame_id int(11) DEFAULT NULL AFTER image_uid,
                ADD COLUMN IF NOT EXISTS dso_series_uid varchar(256) DEFAULT NULL AFTER frame_id,
                DROP CONSTRAINT IF EXISTS project_aimuid_ind,
                ADD CONSTRAINT project_aimuid_ind UNIQUE (project_id, aim_uid);`,
              { transaction: t }
            );
            // replaces existing value if exists. should we have ignore instead?
            // TODO we are ignoring shared projects right now but we should handle that!
            await fastify.orm.query(
              `REPLACE project_aim(project_id, aim_uid, template, subject_uid, study_uid, series_uid, image_uid, frame_id, dso_series_uid, user, creator, createdtime)
                SELECT project.id, aim.AnnotationUID, aim.TEMPLATECODE, aim.PatientID, aim.StudyUID, aim.SeriesUID, aim.ImageUID, aim.FrameID, aim.DSOSeriesUID, aim.UserLoginName, aim.UserLoginName, aim.UPDATETIME 
                FROM annotations AS aim, project WHERE aim.PROJECTUID=project.projectid;`,
              { transaction: t }
            );
            fastify.log.warn('Migrated project_aim');

            // 4. project_file
            // change file_id (fk epad_file) to file_uid
            // needs to save files to couchdb first
            // add the column
            await fastify.orm.query(
              `ALTER TABLE project_file 
                ADD COLUMN IF NOT EXISTS file_uid varchar(256) NOT NULL AFTER project_id;`,
              { transaction: t }
            );
            // just put values so that we can define unique (I needed to run a query outside the transaction as the model prevents me to see the column)
            try {
              await fastify.orm.query(`SELECT file_id from project_file;`);

              await models.project_file.update(
                { file_uid: fastify.orm.literal('file_id') },
                {
                  where: {},
                  transaction: t,
                }
              );
            } catch (err) {
              fastify.log.warn(`file_id column is already deleted. that's ok. nothing to do`);
            }
            // remove the column and indexes
            // we need to add indexes for the new column after the data has been migrated
            await fastify.orm.query(
              `ALTER TABLE project_file 
                DROP CONSTRAINT IF EXISTS project_fileuid_ind,
                ADD CONSTRAINT project_fileuid_ind UNIQUE (project_id, file_uid),
                DROP KEY IF EXISTS project_file_ind,
                DROP FOREIGN KEY IF EXISTS FK_project_file_file,
                DROP KEY IF EXISTS FK_project_file_file,
                DROP COLUMN IF EXISTS file_id;`,
              { transaction: t }
            );
            fastify.log.warn('Migrated project_file');

            // // 5. project_subject
            // // add subject_name for non-dicom
            // // removing subject_name

            // // 6. project_subject_study
            // // add study_desc for non-dicom
            // // removing study_desc

            // 7. project_template
            // change template_id (fk template) to template_uid
            // needs to get template_uid from template table first
            // add the column
            await fastify.orm.query(
              `ALTER TABLE project_template 
                ADD COLUMN IF NOT EXISTS template_uid varchar(128) NOT NULL AFTER project_id;`,
              { transaction: t }
            );
            // just put values so that we can define unique (I needed to run a query outside the transaction as the model prevents me to see the column)
            try {
              await fastify.orm.query(`SELECT template_id from project_template;`);
              // TODO
              // should be something like this but the backupsql has no templates
              // await fastify.orm.query(
              //   `UPDATE project_template
              //     SET template_uid = (SELECT templateUID from template
              //     WHERE id = ${fastify.orm.literal('template_id')} );`,
              //   { transaction: t }
              // );

              await models.project_template.update(
                { template_uid: fastify.orm.literal('template_id') },
                {
                  where: {},
                  transaction: t,
                }
              );
            } catch (err) {
              fastify.log.warn(`template_id column is already deleted. that's ok. nothing to do`);
            }
            // remove the column and indexes
            await fastify.orm.query(
              `ALTER TABLE project_template 
                DROP KEY IF EXISTS uk_project_template_ind,
                DROP FOREIGN KEY IF EXISTS FK_project_template_tid,
                DROP KEY IF EXISTS FK_project_template_tid,
                DROP COLUMN IF EXISTS template_id,
                DROP CONSTRAINT IF EXISTS uk_project_template_uid_ind, 
                ADD CONSTRAINT uk_project_template_uid_ind UNIQUE (project_id, template_uid);`,
              { transaction: t }
            );
            fastify.log.warn('Migrated project_template');

            // 8. user
            // change username allowNull from true to false
            // just try putting email if username is null. shouldn't happen anyway.
            // if both are empty next step will fail and tracsaction will rollback
            await models.user.update(
              { username: fastify.orm.literal('email') },
              {
                where: {
                  username: null,
                },
                transaction: t,
              }
            );
            await fastify.orm.query(
              `ALTER TABLE user 
                MODIFY COLUMN username varchar(128) NOT NULL;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE user 
                ADD COLUMN IF NOT EXISTS preferences varchar(3000) NULL AFTER colorpreference;`,
              { transaction: t }
            );
            fastify.log.warn('Migrated user');

            // 9. worklist_user - new table
            // needs data migration to move assignee user from worklist table
            // verify user_id still exist we didnt migrate already
            // TODO: we are assuming admin is a user. what if the system doesn't have admin
            // just put values so that we can define unique (I needed to run a query outside the transaction as the model prevents me to see the column)
            try {
              await fastify.orm.query(`SELECT user_id from worklist;`);
              await fastify.orm.query(
                `INSERT INTO worklist_user(worklist_id, user_id, role, creator)
                  SELECT worklist.id, worklist.user_id, 'assignee', 'admin' from worklist;`,
                { transaction: t }
              );
            } catch (err) {
              fastify.log.warn(`user_id column is already deleted. that's ok. nothing to do`);
            }
            fastify.log.warn('Migrated worklist_user');

            // 10. worklist
            // remove user_id
            // IMPORTANT data migration required before deleting the user_id
            await fastify.orm.query(
              `ALTER TABLE worklist 
                DROP FOREIGN KEY IF EXISTS FK_worklist_user,
                DROP KEY IF EXISTS FK_worklist_user,
                DROP COLUMN IF EXISTS user_id;`,
              { transaction: t }
            );
            fastify.log.warn('Migrated worklist');

            // // 11. worklist_requirement - new table
            // // no data migration
            // add foreign key constraints
            await fastify.orm.query(
              `ALTER TABLE worklist_requirement
                DROP FOREIGN KEY IF EXISTS worklist_requirement_ibfk_1;`,
              { transaction: t }
            );

            await fastify.orm.query(
              `ALTER TABLE worklist_requirement
                ADD FOREIGN KEY IF NOT EXISTS worklist_requirement_ibfk_1 (worklist_id) REFERENCES worklist (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );

            // 12. worklist_study
            // new fields subject_id, numOfSeries and numOfImages
            // no data migration to fill in new fields, in old epad data was in worklist_subject only
            await fastify.orm.query(
              `ALTER TABLE worklist_study 
                ADD COLUMN IF NOT EXISTS subject_id int(10) unsigned DEFAULT NULL AFTER study_id,
                ADD COLUMN IF NOT EXISTS numOfSeries int(10) unsigned DEFAULT NULL AFTER sortorder,
                ADD COLUMN IF NOT EXISTS numOfImages int(10) unsigned DEFAULT NULL AFTER numOfSeries,
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_study,
                DROP KEY IF EXISTS FK_workliststudy_study,
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_subject,
                DROP KEY IF EXISTS FK_workliststudy_subject,
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_project,
                DROP KEY IF EXISTS FK_workliststudy_project,
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_worklist,
                DROP KEY IF EXISTS FK_workliststudy_worklist,
                DROP CONSTRAINT IF EXISTS worklist_study_ind,
                ADD CONSTRAINT worklist_study_ind UNIQUE (worklist_id,study_id,subject_id, project_id);`,
              { transaction: t }
            );
            // for some reason doesn't work in the same alter table statement
            await fastify.orm.query(
              `ALTER TABLE worklist_study 
                ADD FOREIGN KEY IF NOT EXISTS FK_workliststudy_subject (subject_id) REFERENCES subject (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS FK_workliststudy_study (study_id) REFERENCES study (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS FK_workliststudy_project (project_id) REFERENCES project (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS FK_workliststudy_worklist (worklist_id) REFERENCES worklist (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );
            // old epad only saves data in worklist_subject, move data from there
            // TODO sort order moved as is. i.e: all studies of the subject has the same sortorder
            // TODO fill in numOfSeries and numOfImages
            await fastify.orm.query(
              `INSERT INTO worklist_study (worklist_id, project_id, sortorder, status, startdate, completedate, creator, createdtime, updatetime, updated_by, study_id) 
                SELECT ws.worklist_id, ws.project_id, ws.sortorder, ws.status, ws.startdate, ws.completedate, ws.creator, ws.createdtime, ws.updatetime, ws.updated_by, pss.study_id 
                FROM worklist_subject ws, project_subject ps, project_subject_study pss 
                WHERE ws.project_id = ps.project_id AND ws.subject_id = ps.subject_id AND ps.id = pss.proj_subj_id;`,
              { transaction: t }
            );
            fastify.log.warn('Migrated worklist_study');

            // // 13. worklist_study_completeness - new table
            // // no data migration
            // add foreign key constraints
            await fastify.orm.query(
              `ALTER TABLE worklist_study_completeness
                DROP FOREIGN KEY IF EXISTS worklist_study_completeness_ibfk_1, 
                DROP FOREIGN KEY IF EXISTS worklist_study_completeness_ibfk_2;`,
              { transaction: t }
            );

            await fastify.orm.query(
              `ALTER TABLE worklist_study_completeness
                ADD FOREIGN KEY IF NOT EXISTS worklist_study_completeness_ibfk_1 (worklist_study_id) REFERENCES worklist_study (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS worklist_study_completeness_ibfk_2 (worklist_requirement_id) REFERENCES worklist_requirement (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );

            // 14. study
            // new field exam_types
            // TODO fill in the exam_types
            await fastify.orm.query(
              `ALTER TABLE study
                DROP FOREIGN KEY IF EXISTS FK_study_subject;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE study 
                ADD COLUMN IF NOT EXISTS exam_types varchar(128) DEFAULT NULL AFTER subject_id,
                ADD FOREIGN KEY IF NOT EXISTS FK_study_subject (subject_id) REFERENCES subject (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );

            // set the orphaned project_user entities to the first admin
            await fastify.orm.query(
              `UPDATE project_user SET user_id = (SELECT id FROM user WHERE admin = true LIMIT 1) 
                WHERE id IN (SELECT id FROM project_user 
                  WHERE user_id NOT IN (SELECT id FROM user)); `
            );

            // project_user delete cascade
            await fastify.orm.query(
              `ALTER TABLE project_user 
                DROP FOREIGN KEY IF EXISTS FK_project_user_project,
                DROP KEY IF EXISTS FK_project_user_project,
                DROP FOREIGN KEY IF EXISTS FK_project_user_user,
                DROP KEY IF EXISTS FK_project_user_user`,
              { transaction: t }
            );
            // for some reason doesn't work in the same alter table statement
            await fastify.orm.query(
              `ALTER TABLE project_user 
                ADD FOREIGN KEY IF NOT EXISTS FK_project_user_project (project_id) REFERENCES project (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS FK_project_user_user (user_id) REFERENCES user (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );

            await fastify.orm.query(
              `ALTER TABLE eventlog 
                ADD COLUMN IF NOT EXISTS notified int(1) NOT NULL DEFAULT 0 AFTER error;`,
              { transaction: t }
            );

            // add nondicom delete cascade
            await fastify.orm.query(
              `ALTER TABLE nondicom_series 
                DROP FOREIGN KEY IF EXISTS FK_series_study,
                DROP KEY IF EXISTS FK_series_study;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE nondicom_series 
                ADD FOREIGN KEY IF NOT EXISTS FK_series_study (study_id) REFERENCES study (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );
          });

          // the db schema is updated successfully lets copy the files
          await fastify.moveAims();
          await fastify.moveFiles();
          await fastify.moveTemplates();

          resolve('Database tables altered successfully');
        } catch (err) {
          reject(new InternalError('Migrating database schema', err));
        }
      })
  );

  fastify.decorate(
    'migrateSubject',
    (study, project, epadAuth, t) =>
      new Promise(async (resolve, reject) => {
        try {
          const subject = await models.subject.create(
            {
              subjectuid: study.patientID.replace('\u0000', '').trim(),
              name: study.patientName.replace('\u0000', '').trim(),
              gender: study.sex,
              dob: study.birthdate ? study.birthdate : null,
              creator: epadAuth.username,
              updatetime: Date.now(),
              createdtime: Date.now(),
            },
            { transaction: t }
          );

          const projectSubject = await fastify.upsert(
            models.project_subject,
            {
              project_id: project.id,
              subject_id: subject.id,
              updatetime: Date.now(),
            },
            { project_id: project.id, subject_id: subject.id },
            epadAuth.username,
            t
          );
          resolve({
            subjectUID: study.patientID.trim(),
            projectSubject,
          });
        } catch (errSubject) {
          reject(errSubject);
        }
      })
  );

  fastify.decorate(
    'migrateDataLite2Thick',
    epadAuth =>
      new Promise(async (resolve, reject) => {
        let project = await models.project.findOne({ where: { projectid: 'lite' } });
        // if there is no lite project and we are in lite mode, we need to migrate
        if (project === null && config.mode === 'lite') {
          fastify.log.warn('We need to migrate the db for lite project');
          // do it all or none with transaction
          const t = await fastify.orm.transaction();
          try {
            // create new project called lite
            project = await models.project.create(
              {
                name: 'lite',
                projectid: 'lite',
                description: 'lite',
                // no default template
                // defaulttemplate: defaultTemplate,
                type: 'Private',
                updatetime: Date.now(),
                createdtime: Date.now(),
                creator: epadAuth.username,
              },
              { transaction: t }
            );
            fastify.log.warn('Lite project is created');

            // fill in each project relation table
            // 1. project_aim
            // get aims from couch and add entities
            const aims = await fastify.getAimsInternal('json', {}, undefined, epadAuth);
            for (let i = 0; i < aims.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.addProjectAimRelInternal(aims[i], project, epadAuth, t);
            }
            fastify.log.warn('Aim db records are created');

            // 2. project_file
            // get files from couch and add entities
            const files = await fastify.getFilesInternal({ format: 'json' }, {});
            for (let i = 0; i < files.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.saveFileInDB(files[i].name, project.id, epadAuth, t);
            }
            fastify.log.warn('File db records are created');

            // can be done in one call
            // 3. project_subject
            // get studies from dicomwebserver and add entities
            // 4. project_subject_study
            // get studies from dicomwebserver and add entities
            // TODO this gets affected by limit, migrate will only transfer limited number of studies
            const studies = await fastify.getPatientStudiesInternal(
              {},
              undefined,
              epadAuth,
              {},
              true
            );
            // map to contain a studies attribute to contain a list of studies
            const subjects = {};
            const subjectPromisses = [];
            for (let i = 0; i < studies.length; i += 1) {
              if (!subjects[studies[i].patientID.trim()]) {
                subjects[studies[i].patientID.trim()] = { studies: [studies[i]] };
                subjectPromisses.push(fastify.migrateSubject(studies[i], project, epadAuth, t));
              } else {
                // if subject already exists push study to the subject in the map
                subjects[studies[i].patientID.trim()].studies.push(studies[i]);
              }
            }
            const values = await Promise.all(subjectPromisses);
            for (let i = 0; i < values.length; i += 1) {
              for (let j = 0; j < subjects[values[i].subjectUID].studies.length; j += 1) {
                // eslint-disable-next-line no-await-in-loop
                await fastify.addPatientStudyToProjectDBInternal(
                  subjects[values[i].subjectUID].studies[j],
                  values[i].projectSubject,
                  epadAuth,
                  t
                );
              }
            }
            fastify.log.warn('DICOM db records are created');

            // 5. project_template
            // get aims from couch and add entities
            const templates = await fastify.getTemplatesInternal({ format: 'summary' });
            for (let i = 0; i < templates.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.addProjectTemplateRelInternal(
                templates[i].containerUID,
                project,
                { enable: 'true' },
                epadAuth,
                t
              );
            }
            fastify.log.warn('Template db records are created');

            // 6. project_user
            // get users from the user table and add relation
            await fastify.orm.query(
              `INSERT INTO project_user(project_id, user_id, role, creator)
              SELECT ${project.id}, user.id, 'Member', '${epadAuth.username}' from user;`,
              { transaction: t }
            );
            fastify.log.warn('User accosiations are created');
            // 7. project_subject_user
            // TODO ?? not used in lite but what is the intention in old epad

            // no action required for these tables - not used in lite
            // 8. project_plugin
            // 9. project_pluginparameter
            // 10. project_subject_study_series_user

            // and tables that have project_id in it
            // 11. worklist_study
            // add lite project_id only to empty ones
            await fastify.orm.query(
              `UPDATE worklist_study SET project_id = ${project.id} where project_id is NULL`,
              { transaction: t }
            );
            fastify.log.warn('Worklist study project ids are filled');

            // no action required for these tables - not used in lite
            // 12. worklist_subject : not used in lite but was used in old epad. data migration handle it though
            // 13. disabled_template
            // 14. epad_file
            // 15. events
            // 16. remote_pac_query
            // 17. user_flaggedimage

            await t.commit();
            resolve('Data moved to thick model');
          } catch (err) {
            await t.rollback();
            reject(new InternalError('Lite2thick data migration', err));
          }
        } else {
          resolve('No data move needed');
        }
      })
  );

  fastify.decorate(
    'afterDBReady',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          // do the schema and migration operations after the connection is established
          await fastify.fixSchema();
          await fastify.migrateDataLite2Thick({ username: 'admin' });
          resolve();
        } catch (err) {
          reject(new InternalError('afterDBReady', err));
        }
      })
  );

  fastify.after(async () => {
    try {
      await fastify.initMariaDB();

      if (config.env !== 'test') {
        // schedule calculating statistics at 1 am at night
        schedule.scheduleJob('stats', '0 1 * * *', 'America/Los_Angeles', () => {
          const random = Math.random() * 1800 + 1;
          setTimeout(() => {
            fastify.log.info(`Calculating and sending statistics at ${new Date()}`);
            fastify.calcStats();
          }, random * 1000);
        });
      }
      done();
    } catch (err) {
      fastify.log.error(`Cannot connect to mariadb (err:${err.message}), shutting down the server`);
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
          fastify.log.error(`Cannot destroy mariadb test database (err:${err.message})`);
        }
      }
      try {
        await instance.orm.close();
      } catch (err) {
        fastify.log.error(`Cannot close connection to (err:${err.message})`);
      }
      doneClose();
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(epaddb);
