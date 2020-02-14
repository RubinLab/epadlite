const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');
const Sequelize = require('sequelize');
const _ = require('lodash');
const Axios = require('axios');
const os = require('os');
const config = require('../config/index');
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
        logging: config.thickDb.logger,
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

          models.project.belongsToMany(models.user, {
            through: 'project_user',
            as: 'users',
            foreignKey: 'project_id',
          });
          // models.worklist.belongsTo(models.user, { foreignKey: 'user_id' });

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
          reject(new InternalError('Leading models and syncing db', err));
        }
      });
    } catch (err) {
      if (config.env !== 'test') {
        fastify.log.warn(`Waiting for mariadb server. ${err.message}`);
        setTimeout(fastify.initMariaDB, 3000);
      } else throw new InternalError('No connection to mariadb', err);
    }
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
          });
          if (projectSubjects) {
            for (let i = 0; i < projectSubjects.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.deleteSubjectFromProjectInternal(
                { project: projectId, subject: projectSubjects[i].subject_uid },
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
          };

          project.users.forEach(user => {
            obj.loginNames.push(user.username);
          });
          if (request.epadAuth.admin || obj.loginNames.includes(request.epadAuth.username))
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
                duedate: request.body.dueDate ? new Date(`${request.body.dueDate}T00:00:00`) : null,
                creator,
              })
              .then(worklist => {
                const relationArr = [];
                assigneeIDArr.forEach(el => {
                  relationArr.push(
                    models.worklist_user.create({
                      worklist_id: worklist.id,
                      user_id: el,
                      role: 'Assignee',
                      createdtime: Date.now(),
                      creator,
                    })
                  );
                });

                if (request.body.requirement) {
                  request.body.requirement.forEach(req => {
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
          .then(() => {
            reply.code(200).send(`Worklist ${request.params.worklist} updated successfully`);
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

  fastify.decorate('updateWorklist', (request, reply) => {
    if (request.body.assigneeList) {
      fastify.updateWorklistAssigneeInternal(request, reply);
    } else {
      const obj = { ...request.body };
      if (request.body.dueDate) {
        obj.duedate = request.body.dueDate;
        delete obj.dueDate;
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
          dueDate: worklists[i].duedate,
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
          const { level, numOfAims, template } = worklists[i].requirements[k];
          obj.requirements.push({ level, numOfAims, template });
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
                    dueDate: el.duedate,
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

      Promise.all(promises).then(async result => {
        ids.push(result[0].dataValues.id);
        ids.push(result[1].dataValues.id);

        // go to project_subject get the id of where project and subject matches
        let projectSubjectID;
        try {
          projectSubjectID = await models.project_subject.findOne({
            where: { project_id: ids[1], subject_uid: request.params.subject },
            attributes: ['id'],
          });
        } catch (err) {
          reply.send(new InternalError('Creating worklist subject association in db', err));
        }
        projectSubjectID = projectSubjectID.dataValues.id;
        let studyUIDs;
        const studyUIDList = [];
        try {
          studyUIDs = await models.project_subject_study.findAll({
            where: { proj_subj_id: projectSubjectID },
            attributes: ['study_uid'],
            raw: true,
          });
        } catch (err) {
          reply.send(new InternalError('Creating worklist subject association in db', err));
        }
        // estract uids
        studyUIDs.forEach(el => studyUIDList.push(el.study_uid));

        // get studyDescriptions
        const studyDetails = await fastify.getPatientStudiesInternal(
          request.params,
          studyUIDList,
          request.epadAuth
        );
        const studyDescMap = {};
        studyDetails.forEach(el => {
          const { studyDescription, numberOfImages, numberOfSeries } = el;
          studyDescMap[el.studyUID] = { studyDescription, numberOfImages, numberOfSeries };
        });

        // iterate over the study uid's and send them to the table
        const relationPromiseArr = [];
        studyUIDList.forEach(el => {
          relationPromiseArr.push(
            fastify.upsert(
              models.worklist_study,
              {
                worklist_id: ids[0],
                study_uid: el,
                subject_uid: request.params.subject,
                project_id: ids[1],
                updatetime: Date.now(),
                subject_name: request.body.subjectName,
                study_desc: studyDescMap[el].studyDescription,
                numOfSeries: studyDescMap[el].numberOfSeries,
                numOfImages: studyDescMap[el].numberOfImages,
              },
              {
                worklist_id: ids[0],
                study_uid: el,
                subject_uid: request.params.subject,
                project_id: ids[1],
              },
              request.epadAuth.username
            )
          );

          Promise.all(relationPromiseArr)
            .then(() => reply.code(200).send(`Saving successful`))
            .catch(err => {
              reply.send(new InternalError('Creating worklist subject association in db', err));
            });
        });
      });
    }
  });

  fastify.decorate('assignStudyToWorklist', (request, reply) => {
    if (
      !request.body ||
      request.body.studyDesc === undefined ||
      request.body.subjectName === undefined
    )
      reply.send(
        new BadRequestError(
          'Assign study to worklist',
          new Error('Missing study description or subject name in request')
        )
      );
    else {
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

      Promise.all(promises)
        .then(async result => {
          ids.push(result[0].dataValues.id);
          ids.push(result[1].dataValues.id);
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
                study_uid: request.params.study,
                subject_uid: request.params.subject,
                study_desc: request.body.studyDesc,
                subject_name: request.body.subjectName,
                project_id: ids[1],
                updatetime: Date.now(),
                numOfSeries: seriesArr.length,
                numOfImages: sumOfImageCounts,
              },
              {
                worklist_id: ids[0],
                study_uid: request.params.study,
                subject_uid: request.params.subject,
                project_id: ids[1],
              },
              request.epadAuth.username
            )
            .then(id => reply.code(200).send(`Saving successful - ${id}`))
            .catch(err => {
              reply.send(new InternalError('Creating worklist study association in db', err));
            });
        })
        .catch(err => reply.send(new InternalError('Creating worklist study association', err)));
    }
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
      const worklistId = await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
        raw: true,
      });

      request.body.forEach(el => {
        promises.push(
          models.worklist_study.destroy({
            worklist_id: worklistId,
            project_id: el.projectID,
            subject_uid: el.subjectID,
            study_uid: el.studyUID,
          })
        );
      });
      Promise.all(promises)
        .then(() => reply.code(200).send(`Deleted successfully`))
        .catch(err => {
          if (err instanceof ResourceNotFoundError)
            reply.send(
              new BadRequestError(
                `Deleting study ${request.params.study} from worklist ${request.params.worklist}`,
                err
              )
            );
          else
            reply.send(
              new InternalError(
                `Deleting study ${request.params.study} from worklist ${request.params.worklist}`,
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
      });
      const result = {};
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
          subjectID: list[i].dataValues.subject_uid,
          studyUID: list[i].dataValues.study_uid,
          workListID: request.params.worklist,
          workListName,
          worklistDuedate,
          subjectName: list[i].dataValues.subject_name,
          studyDescription: list[i].dataValues.study_desc,
        };
        result[list[i].dataValues.subject_uid] = obj;
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
        await fastify.upsert(
          models.project_template,
          {
            project_id: project.id,
            template_uid: templateUid,
            enabled: request.query.enable === 'true',
            updatetime: Date.now(),
          },
          {
            project_id: project.id,
            template_uid: templateUid,
          },
          request.epadAuth.username
        );
        reply.code(200).send('Saving successful');
      }
    } catch (err) {
      reply.send(new InternalError(`Saving template in project ${request.params.project}`, err));
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
          let projectSubject = await models.project_subject.findOne({
            where: {
              project_id: project.id,
              subject_uid: request.params.subject
                ? request.params.subject
                : request.body.subjectUid,
            },
          });

          if (!projectSubject) {
            projectSubject = await models.project_subject.create({
              project_id: project.id,
              subject_uid: request.params.subject
                ? request.params.subject
                : request.body.subjectUid,
              subject_name:
                request.body && request.body.subjectName ? request.body.subjectName : null,
              creator: request.epadAuth.username,
              updatetime: Date.now(),
              createdtime: Date.now(),
            });
          } else if (request.body) {
            reply.send(new ResourceAlreadyExistsError('Subject', request.body.subjectUid));
          }
          // if it is a dicom subject sent via put add studies to project
          if (!request.body && request.params.subject) {
            const studies = await fastify.getPatientStudiesInternal(
              request.params,
              undefined,
              request.epadAuth
            );
            for (let i = 0; i < studies.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.upsert(
                models.project_subject_study,
                {
                  proj_subj_id: projectSubject.id,
                  study_uid: studies[i].studyUID,
                  updatetime: Date.now(),
                },
                {
                  proj_subj_id: projectSubject.id,
                  study_uid: studies[i].studyUID,
                },
                request.epadAuth.username
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

  fastify.decorate('getPatientsFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null) {
        reply.send(
          new BadRequestError(
            'Getting subjects from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      } else {
        const subjectUids = [];
        const nondicoms = [];
        const projectSubjects = await models.project_subject.findAll({
          where: { project_id: project.id },
        });
        if (projectSubjects) {
          // projects will be an array of Project instances with the specified name
          for (let i = 0; i < projectSubjects.length; i += 1) {
            subjectUids.push(projectSubjects[i].subject_uid);
            if (projectSubjects[i].subject_name) {
              nondicoms.push(projectSubjects[i]);
            }
          }
        }
        const result = await fastify.getPatientsInternal(
          request.params,
          subjectUids,
          request.epadAuth
        );
        if (subjectUids.length !== result.length) {
          if (subjectUids.length === result.length + nondicoms.length) {
            for (let i = 0; i < nondicoms.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              const numberOfStudies = await models.project_subject_study.count({
                where: { proj_subj_id: nondicoms[i].id },
              });
              // eslint-disable-next-line no-await-in-loop
              const numberOfAnnotations = await models.project_aim.count({
                where: { project_id: project.id, subject_uid: nondicoms[i].subject_uid },
              });
              result.push({
                subjectName: nondicoms[i].subject_name,
                subjectID: nondicoms[i].subject_uid,
                projectID: request.params.project,
                insertUser: '', // no user in studies call
                xnatID: '', // no xnatID should remove
                insertDate: '', // no date in studies call
                uri: '', // no uri should remove
                displaySubjectID: nondicoms[i].subject_uid,
                numberOfStudies,
                numberOfAnnotations,
                examTypes: '',
              });
            }
          } else
            fastify.log.warn(
              `There are ${subjectUids.length} subjects associated with this project. But only ${
                result.length
              } of them have dicom files`
            );
        }
        reply.code(200).send(result);
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
              where: { project_id: project.id, subject_uid: params.subject },
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
              const numDeleted = await models.project_subject.destroy({
                where: { project_id: project.id, subject_uid: params.subject },
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
                  await fastify.deleteSubjectInternal(params, epadAuth);
                  resolve(`Subject deleted from system and removed from ${numDeleted} projects`);
                } else {
                  const projectSubjects = await models.project_subject.findAll({
                    where: { subject_uid: params.subject },
                  });
                  if (projectSubjects.length === 0) {
                    await models.project_subject_study.destroy({
                      where: { proj_subj_id: projectSubject.id },
                    });
                    await fastify.deleteSubjectInternal(params, epadAuth);
                    resolve(`Subject deleted from system as it didn't exist in any other project`);
                  } else resolve(`Subject not deleted from system as it exists in other project`);
                }
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

  fastify.decorate('getProjectAims', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            'Getting aims from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const aimUids = [];
        const projectAims = await models.project_aim.findAll({ where: { project_id: project.id } });
        // projects will be an array of Project instances with the specified name
        for (let i = 0; i < projectAims.length; i += 1) {
          aimUids.push(projectAims[i].aim_uid);
        }

        const result = await fastify.getAimsInternal(
          request.query.format,
          request.params,
          aimUids,
          request.epadAuth
        );
        // .then(result => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
        }
        reply.code(200).send(result);
        // })
        // .catch(err =>
        //   reply.send(
        //     new InternalError(
        //       `Getting aims from couchdb for project ${request.params.project}`,
        //       err
        //     )
        //   )
        // );
      }
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
        const user =
          aim && aim.ImageAnnotationCollection.user
            ? aim.ImageAnnotationCollection.user.loginName.value
            : '';
        const template =
          aim && aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code
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
                .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root
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

        await fastify.upsert(
          models.project_aim,
          {
            project_id: project.id,
            aim_uid: aimUid,
            user,
            template,
            subject_uid: subjectUid,
            study_uid: studyUid,
            series_uid: seriesUid,
            image_uid: imageUid,
            updatetime: Date.now(),
          },
          {
            project_id: project.id,
            aim_uid: aimUid,
          },
          request.epadAuth.username
        );
        // update the worklist completeness if in any
        await fastify.updateWorklistCompleteness(
          project.id,
          subjectUid,
          studyUid,
          user,
          request.epadAuth
        );
        reply.code(200).send('Saving successful');
      }
    } catch (err) {
      reply.send(new InternalError(`Saving aim to project ${request.params.project}`, err));
    }
  });

  fastify.decorate('addWorklistRequirement', async (worklistId, epadAuth, body) => {
    return models.worklist_requirement.create({
      ...body,
      worklist_id: worklistId,
      updatetime: Date.now(),
      createdtime: Date.now(),
      creator: epadAuth.username,
    });
  });

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

  fastify.decorate('setWorklistRequirement', async (request, reply) => {
    try {
      const worklist = await models.worklist.findOne({
        where: { worklistid: request.params.worklist },
        attributes: ['id'],
        raw: true,
      });
      if (!worklist)
        reply.send(
          new BadRequestError(
            `Worklist requirement ${request.params.requirement} add/update`,
            new ResourceNotFoundError('Worklist', request.params.worklist)
          )
        );
      else {
        if (request.params.requirement !== undefined)
          await fastify.updateWorklistRequirement(
            worklist.id,
            request.params.requirement,
            request.epadAuth,
            request.body
          );
        else await fastify.addWorklistRequirement(worklist.id, request.epadAuth, request.body);
        reply.code(200).send(`Worklist requirement ${request.params.requirement} added/updated`);
      }
    } catch (err) {
      reply.send(
        new InternalError(`Worklist requirement ${request.params.requirement} add/update`, err)
      );
    }
  });

  fastify.decorate(
    'updateWorklistCompleteness',
    (projectId, subjectUid, studyUid, user, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          // TODO check if the user is an assignee

          // get worklist studies that belong to this study and user
          // const worklistsStudiesAll = await models.worklist_study.findAll({
          //   raw: true,
          // });
          const worklistsStudies = await models.worklist_study.findAll({
            where: { project_id: projectId, subject_uid: subjectUid, study_uid: studyUid },
            raw: true,
          });
          // for each worklist study
          for (let i = 0; i < worklistsStudies.length; i += 1) {
            //  get requirements
            // eslint-disable-next-line no-await-in-loop
            const requirements = await models.worklist_requirement.findAll({
              where: { worklist_id: worklistsStudies[i].worklist_id },
              raw: true,
            });
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
                epadAuth
              );
            }
          }
          resolve();
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
    'computeWorklistCompleteness',
    async (
      worklistStudyId,
      worklistReq,
      worklistStats,
      projectId,
      subjectUid,
      studyUid,
      user,
      epadAuth
    ) => {
      // sample worklistReq
      // eslint-disable-next-line no-param-reassign
      // worklistReq = [{ id: 1, level: 'study', numOfAims: 1, template: 'ROI', required: true }];
      // get all aims
      const aims = await models.project_aim.findAll({
        where: { project_id: projectId, subject_uid: subjectUid, study_uid: studyUid, user },
        raw: true,
      });
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
        switch (worklistReq.level) {
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
          completeness: completenessPercent,
        },
        {
          worklist_study_id: worklistStudyId,
          assignee: user,
          worklist_requirement_id: worklistReq.id,
        },
        epadAuth.username
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
          include: ['progress'],
          attributes: [
            'worklist_id',
            'project_id',
            'subject_uid',
            'study_uid',
            'subject_name',
            'study_desc',
          ],
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
              subject_uid: worklistStudies[i].dataValues.subject_uid,
              subject_name: worklistStudies[i].dataValues.subject_name,
              study_uid: worklistStudies[i].dataValues.study_uid,
              study_desc: worklistStudies[i].dataValues.study_desc,
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
        const numDeleted = await models.project_aim.destroy({
          where: { project_id: project.id, aim_uid: request.params.aimuid },
        });

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
            let projectSubject = await models.project_subject.findOne({
              where: { project_id: project.id, subject_uid: params.subject },
            });
            if (!projectSubject)
              projectSubject = await models.project_subject.create({
                project_id: project.id,
                subject_uid: params.subject,
                creator: epadAuth.username,
                updatetime: Date.now(),
                createdtime: Date.now(),
              });
            // create only when that is not already there
            const projectSubjectStudy = await models.project_subject_study.findOne({
              where: { proj_subj_id: projectSubject.id, study_uid: studyUid },
            });
            if (!projectSubjectStudy) {
              let studyDesc = null;
              if (body && body.studyDesc) {
                // eslint-disable-next-line prefer-destructuring
                studyDesc = body.studyDesc;
              }
              await models.project_subject_study.create({
                proj_subj_id: projectSubject.id,
                study_uid: studyUid,
                study_desc: studyDesc,
                creator: epadAuth.username,
                updatetime: Date.now(),
                createdtime: Date.now(),
              });
            } else if (body) {
              reject(new ResourceAlreadyExistsError('Study', body.studyUid));
            }
            resolve();
          }
        } catch (err) {
          reject(
            new InternalError(`Adding study ${params.study} to project ${params.project}`, err)
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
        const studyUids = [];
        const nondicoms = [];
        const projectSubjects = await models.project_subject.findAll({
          where: { project_id: project.id, subject_uid: request.params.subject },
        });
        if (projectSubjects === null) {
          reply.send(
            new BadRequestError(
              'Get studies from project',
              new ResourceNotFoundError('Project subject association', request.params.subject)
            )
          );
        } else {
          // projects will be an array of Project instances with the specified name
          for (let i = 0; i < projectSubjects.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const projectSubjectStudies = await models.project_subject_study.findAll({
              where: { proj_subj_id: projectSubjects[i].id },
            });
            if (projectSubjectStudies)
              for (let j = 0; j < projectSubjectStudies.length; j += 1) {
                studyUids.push(projectSubjectStudies[j].study_uid);
                if (projectSubjectStudies[j].study_desc) {
                  nondicoms.push({ subject: projectSubjects[i], study: projectSubjectStudies[j] });
                }
              }
          }
          const result = await fastify.getPatientStudiesInternal(
            request.params,
            studyUids,
            request.epadAuth
          );
          if (studyUids.length !== result.length)
            if (studyUids.length === result.length + nondicoms.length) {
              for (let i = 0; i < nondicoms.length; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                const numberOfAnnotations = await models.project_aim.count({
                  where: { project_id: project.id, study_uid: nondicoms[i].study.study_uid },
                });
                result.push({
                  projectID: request.params.project,
                  patientID: nondicoms[i].subject.subject_uid,
                  patientName: nondicoms[i].subject.subject_name,
                  studyUID: nondicoms[i].study.study_uid,
                  insertDate: '',
                  firstSeriesUID: '',
                  firstSeriesDateAcquired: '',
                  physicianName: '',
                  referringPhysicianName: '',
                  birthdate: '',
                  sex: '',
                  studyDescription: nondicoms[i].study.study_desc,
                  studyAccessionNumber: '',
                  examTypes: [],
                  numberOfImages: 0, // TODO
                  numberOfSeries: 0, // TODO
                  numberOfAnnotations,
                  createdTime: '',
                  // extra for flexview
                  studyID: '',
                  studyDate: '',
                  studyTime: '',
                });
              }
            } else
              fastify.log.warn(
                `There are ${studyUids.length} studies associated with this project. But only ${
                  result.length
                } of them have dicom files`
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
      if (project === null)
        reply.send(
          new BadRequestError(
            'Delete study from project',
            new ResourceNotFoundError('Project', request.params.project)
          )
        );
      else {
        const projectSubject = await models.project_subject.findOne({
          where: { project_id: project.id, subject_uid: request.params.subject },
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
              }
              await fastify.deleteStudyInternal(request.params, request.epadAuth);
              reply
                .code(200)
                .send(`Study deleted from system and removed from ${numDeleted} projects`);
            } else {
              const count = await models.project_subject_study.count({
                where: { study_uid: request.params.study },
              });
              if (count === 0) {
                await fastify.deleteStudyInternal(request.params, request.epadAuth);
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
    fastify
      .getStudySeriesInternal(request.params, request.query, request.epadAuth)
      .then(result => reply.code(200).send(result))
      .catch(err =>
        fastify
          .getNondicomStudySeriesFromProjectInternal(request.params)
          .then(nondicomResult => reply.code(200).send(nondicomResult))
          .catch(nondicomErr => {
            reply.send(
              new InternalError(
                'Retrieving series',
                new Error(
                  `Failed from dicomweb with ${err.message} and from nondicom with ${
                    nondicomErr.message
                  }`
                )
              )
            );
          })
      );
  });
  fastify.decorate(
    'getNondicomStudySeriesFromProjectInternal',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          const result = [];
          const series = await models.nondicom_series.findAll({
            where: { study_uid: params.study },
            raw: true,
          });
          for (let i = 0; i < series.length; i += 1) {
            result.push({
              projectID: params.project,
              patientID: params.subject,
              patientName: '', // TODO
              studyUID: params.study,
              seriesUID: series[i].seriesuid,
              seriesDate: series[i].seriesdate,
              seriesDescription: series[i].description,
              examType: '',
              bodyPart: '', // TODO
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

  fastify.decorate('createUser', (request, reply) => {
    // TODO user exists check! ozge
    // TODO permissions added as string, retrieve as array. errorprone if there is space like 'CreateProject, CreateWorklist' ozge
    if (!request.body) {
      reply.send(new BadRequestError('User Creation', new Error('No body sent')));
    } else {
      // check permissions if there is a space
      // remove spaces
      const permissions = request.body.permissions ? request.body.permissions.split(',') : [''];
      const trimmedPermission = [];
      permissions.forEach(el => trimmedPermission.push(el.trim()));
      if (request.body.permissions) {
        delete request.body.permissions;
      }
      request.body.permissions = trimmedPermission.join(',');
      models.user
        .create({
          ...request.body,
          // permissions: trimmedPermission,
          createdtime: Date.now(),
          updatetime: Date.now(),
          creator: request.epadAuth.username,
        })
        .then(async user => {
          const { id } = user.dataValues;
          if (request.body.projects && request.body.projects.length > 0) {
            const queries = [];
            try {
              for (let i = 0; i < request.body.projects.length; i += 1) {
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

              Promise.all(queries)
                .then(() => {
                  reply.code(200).send(`User succesfully created`);
                })
                .catch(err => {
                  reply.send(new InternalError('Create user project associations', err));
                });
            } catch (err) {
              reply.send(new InternalError('Create user project associations', err));
            }
          } else {
            reply.code(200).send(`User succesfully created`);
          }
        })
        .catch(err => {
          reply.send(new InternalError('Create user in db', err));
        });
    }
  });

  fastify.decorate('getProject', (request, reply) => {
    models.project
      .findOne({ where: { projectid: request.params.project } })
      .then(project => {
        if (project === null)
          reply.send(new ResourceNotFoundError('Project', request.params.project));
        else reply.code(200).send(project);
      })
      .catch(err => {
        reply.send(new InternalError(`Getting project ${request.params.project}`, err));
      });
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

  fastify.decorate('updateUser', (request, reply) => {
    const rowsUpdated = {
      ...request.body,
      updated_by: request.epadAuth.username,
      updatetime: Date.now(),
    };
    models.user
      .update(rowsUpdated, { where: { username: request.params.user } })
      .then(() => {
        reply.code(200).send(`User ${request.params.user} updated sucessfully`);
      })
      .catch(err => {
        reply.send(new InternalError(`Updating user ${request.params.user}`, err));
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

  fastify.decorate('getPatientStudyFromProject', async (request, reply) => {
    try {
      // TODO check if it is in the project
      const studyUids = [request.params.study];
      const result = await fastify.getPatientStudiesInternal(
        request.params,
        studyUids,
        request.epadAuth
      );
      if (result.length === 1) reply.code(200).send(result[0]);
      else reply.send(new ResourceNotFoundError('Study', request.params.study));
    } catch (err) {
      reply.send(new InternalError(`Get study ${request.params.study}`, err));
    }
  });

  fastify.decorate('getSubjectFromProject', async (request, reply) => {
    try {
      // TODO check if it is in the project
      const subjectUids = [request.params.subject];
      const result = await fastify.getPatientsInternal(
        request.params,
        subjectUids,
        request.epadAuth
      );
      if (result.length === 1) reply.code(200).send(result[0]);
      else reply.send(new ResourceNotFoundError('Subject', request.params.subject));
    } catch (err) {
      reply.send(new InternalError(`Get subject ${request.params.subject}`, err));
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
    (projectId, params) =>
      new Promise(async (resolve, reject) => {
        try {
          if (params.subject) {
            const projectSubject = await models.project_subject.findOne({
              where: { project_id: projectId, subject_uid: params.subject },
            });
            if (!projectSubject) {
              reject(
                new ResourceNotFoundError(
                  `Project ${params.project} subject association`,
                  params.subject
                )
              );
            } else if (params.study) {
              const projectSubjectStudy = await models.project_subject_study.findOne({
                where: { proj_subj_id: projectSubject.id, study_uid: params.study },
              });
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
    'putOtherFileToProjectInternal',
    (filename, params, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const project = await models.project.findOne({ where: { projectid: params.project } });
          // if the subjects and/or study is given, make sure that subject and/or study is assosiacted with the project
          if (project === null) reject(new ResourceNotFoundError('Project', params.project));
          else {
            fastify
              .checkProjectAssociation(project.id, params)
              .then(async () => {
                await models.project_file.create({
                  project_id: project.id,
                  file_uid: filename,
                  creator: epadAuth.username,
                  updatetime: Date.now(),
                  createdtime: Date.now(),
                });
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
        const studyUids = [];
        const projectSubjects = await models.project_subject.findAll({
          where: { project_id: project.id },
        });
        if (projectSubjects === null) {
          reply.send(
            new BadRequestError(
              'Get studies from project',
              new ResourceNotFoundError('Project subject association', request.params.project)
            )
          );
        } else {
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
          const result = await fastify.getPatientStudiesInternal(
            request.params,
            studyUids,
            request.epadAuth
          );
          if (studyUids.length !== result.length)
            fastify.log.warning(
              `There are ${studyUids.length} studies associated with this project. But only ${
                result.length
              } of them have dicom files`
            );
          reply.code(200).send(result);
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Getting studies of ${request.params.subject} from project ${request.params.project}`
        ),
        err
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
        const projectSubjects = await models.project_subject.findAll({
          where: { project_id: project.id },
        });
        if (projectSubjects === null) {
          reply.send(
            new BadRequestError(
              'Get series from project',
              new ResourceNotFoundError('Project subject association', request.params.project)
            )
          );
        } else {
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
          let result = [];
          for (let j = 0; j < studyUids.length; j += 1) {
            // eslint-disable-next-line no-await-in-loop
            const studySeries = await fastify.getStudySeriesInternal(
              { study: studyUids[j] },
              request.query,
              request.epadAuth,
              true
            );
            result = result.concat(studySeries);
          }

          reply.code(200).send(result);
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Getting studies of ${request.params.subject} from project ${request.params.project}`
        ),
        err
      );
    }
  });

  fastify.decorate('addNondicomSeries', async (request, reply) => {
    // eslint-disable-next-line prefer-destructuring
    let seriesUid = request.params.seriesUid;
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
    const series = await models.nondicom_series.findOne({
      where: { seriesuid: seriesUid },
    });
    if (series) {
      reply.send(new ResourceAlreadyExistsError('Nondicom series', seriesUid));
    } else {
      await models.nondicom_series.create({
        seriesuid: seriesUid,
        study_uid: request.params.study,
        description: request.body.description,
        seriesdate: Date.now(),
        updatetime: Date.now(),
        createdtime: Date.now(),
        creator: request.epadAuth.username,
      });
      reply.code(200).send(`${seriesUid} added successfully`);
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
  fastify.decorate('upsert', (model, values, condition, user) =>
    model.findOne({ where: condition }).then(obj => {
      // update
      if (obj) return obj.update({ ...values, updated_by: user });
      // insert
      return model.create({ ...values, creator: user, createdtime: Date.now() });
    })
  );

  fastify.decorate(
    'calcStats',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          fastify.log.info('Getting stats');
          const numOfUsers = await models.user.count();
          const numOfProjects = await models.project.count();

          let numOfPatients = 0;
          if (config.mode === 'thick') {
            numOfPatients = await models.project_subject.count({
              col: 'subject_uid',
              distinct: true,
            });
          } else {
            const patients = await fastify.getPatientsInternal({}, undefined, undefined, true);
            numOfPatients = patients.length;
          }

          let numOfStudies = 0;
          if (config.mode === 'thick') {
            numOfStudies = await models.project_subject_study.count({
              col: 'study_uid',
              distinct: true,
            });
          } else {
            const studies = await fastify.getPatientStudiesInternal({}, undefined, undefined, true);
            numOfStudies = studies.length;
          }

          // always from dicomweb server
          const series = await fastify.getAllStudySeriesInternal({}, undefined, undefined, true);
          const numOfSeries = series.length;

          let numOfAims = 0;
          let numOfTemplateAimsMap = {};
          if (config.mode === 'thick') {
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

          // TODO
          const numOfDSOs = 0;

          // are these correct?
          const numOfFiles = await models.epad_file.count();
          let numOfTemplates = 0;
          if (config.mode === 'thick') {
            numOfTemplates = await models.template.count();
          } else {
            const templates = await fastify.getTemplatesInternal('summary');
            numOfTemplates = templates.length;
          }
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
            fastify.log.info(`Sending generic stats to ${request.defaults.baseURL}${epadUrl}`);
            // await request.put(encodeURI(epadUrl));
            fastify.log.info(`Statistics sent with success`);
          }

          // get template stats
          fastify.log.info('Getting template stats');
          const templates = await fastify.getTemplatesInternal('summary');
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
            if (config.mode === 'thick') {
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
                `Sending template ${templateName} stats to ${
                  request.defaults.baseURL
                }${templatesEpadUrl}`
              );
              // await request.put(encodeURI(templatesEpadUrl), templateText);
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
            fastify.orm.query(
              `insert into epadstatistics_monthly(numOfUsers, numOfProjects,numOfPatients,numOfStudies,numOfSeries,numOfAims,numOfDSOs,numOfWorkLists,numOfPacs,numOfAutoQueries,numOfFiles,numOfPlugins,numOfTemplates,creator,updatetime) (select sum(numOfUsers), sum(numOfProjects), sum(numOfPatients), sum(numOfStudies), sum(numOfSeries), sum(numOfAims),sum(numOfDSOs),sum(numOfWorkLists),sum(numOfPacs),sum(numOfAutoQueries),sum(numOfFiles),sum(numOfPlugins),sum(numOfTemplates),'admin',now()  from (select * from epadstatistics a where createdtime =(select max(createdtime) from epadstatistics b where b.host = a.host) group by host order by host) ab)`
            );
          }
          resolve('Stats sent');
        } catch (error) {
          reject(new InternalError(`Sending statistics to ${config.statsEpad}`, error));
        }
      })
  );

  fastify.after(async () => {
    try {
      await fastify.initMariaDB();
      if (config.env !== 'test') fastify.calcStats();
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
