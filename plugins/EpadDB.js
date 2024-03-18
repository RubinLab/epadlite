/* eslint-disable no-async-promise-executor */
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');
const { Sequelize, QueryTypes, Op } = require('sequelize');
const _ = require('lodash');
const Axios = require('axios');
const os = require('os');
const schedule = require('node-schedule-tz');
const archiver = require('archiver');
const toArrayBuffer = require('to-array-buffer');
const extractZip = require('extract-zip');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const { createOfflineAimSegmentation } = require('aimapi');
// eslint-disable-next-line no-global-assign
window = {};
const globalMapQueueById = new Map();
const dcmjs = require('dcmjs');
const config = require('../config/index');
const appVersion = require('../package.json').version;
const DockerService = require('../utils/Docker');
const {
  InternalError,
  ResourceNotFoundError,
  ResourceAlreadyExistsError,
  BadRequestError,
  UnauthorizedError,
  EpadError,
} = require('../utils/EpadErrors');
const EpadNotification = require('../utils/EpadNotification');

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
        logging: config.thickDb.logger === 'true' || config.thickDb.logger === true,
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
            // eslint-disable-next-line import/no-dynamic-require, global-require
            models[filenames[i].replace(/\.[^/.]+$/, '')] = require(path.join(
              __dirname,
              '/../models',
              filenames[i]
            ))(fastify.orm, Sequelize.DataTypes);
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
          //  for plugins

          models.plugin.belongsToMany(models.project, {
            through: 'project_plugin',
            as: 'pluginproject',
            foreignKey: 'plugin_id',
          });
          models.project.belongsToMany(models.plugin, {
            through: 'project_plugin',
            as: 'projectplugin',
            foreignKey: 'project_id',
          });

          models.plugin.belongsToMany(models.template, {
            through: 'plugin_template',
            as: 'plugintemplate',
            foreignKey: 'plugin_id',
          });
          models.template.belongsToMany(models.plugin, {
            through: 'plugin_template',
            as: 'templateplugin',
            foreignKey: 'template_id',
          });

          models.plugin.hasMany(models.plugin_parameters, {
            as: 'defaultparameters',
            foreignKey: 'plugin_id',
          });
          models.plugin_parameters.belongsTo(models.plugin, { foreignKey: 'plugin_id' });
          models.plugin_queue.belongsTo(models.plugin, {
            as: 'queueplugin',
            foreignKey: 'plugin_id',
          });
          models.plugin_queue.belongsTo(models.project, {
            as: 'queueproject',
            foreignKey: 'project_id',
          });
          //  for plugins end

          models.project.hasMany(models.project_subject, {
            foreignKey: 'project_id',
          });

          models.subject.hasMany(models.project_subject, {
            foreignKey: 'subject_id',
          });

          models.subject.hasMany(models.study, {
            foreignKey: 'subject_id',
          });

          models.study.belongsTo(models.subject, {
            foreignKey: 'subject_id',
          });

          models.nondicom_series.belongsTo(models.study, {
            foreignKey: 'study_id',
          });

          models.project_subject.belongsTo(models.subject, {
            foreignKey: 'subject_id',
          });

          models.project_subject.belongsTo(models.project, {
            foreignKey: 'project_id',
          });

          models.study.hasMany(models.project_subject_study, {
            foreignKey: 'study_id',
          });

          models.project_subject.belongsToMany(models.study, {
            through: 'project_subject_study',
            foreignKey: 'proj_subj_id',
            otherKey: 'study_id',
          });

          models.project_subject_report.belongsTo(models.subject, {
            foreignKey: 'subject_id',
            onDelete: 'CASCADE',
          });

          models.project_subject_report.belongsTo(models.project, {
            foreignKey: 'project_id',
            onDelete: 'CASCADE',
          });

          models.project.hasMany(models.project_aim, {
            foreignKey: 'project_id',
          });

          models.project_template.belongsTo(models.project, {
            foreignKey: 'project_id',
          });

          models.project_aim.belongsTo(models.project, {
            foreignKey: 'project_id',
            onDelete: 'CASCADE',
          });

          models.project_aim.belongsToMany(models.user, {
            through: 'project_aim_user',
            as: 'users',
            foreignKey: 'project_aim_id',
          });

          models.user.belongsToMany(models.project_aim, {
            through: 'project_aim_user',
            as: 'projectAims',
            foreignKey: 'user_id',
          });

          models.project_subject_study_series_significance.belongsTo(models.project, {
            foreignKey: 'project_id',
            onDelete: 'CASCADE',
          });

          models.project_subject_study_series_significance.belongsTo(models.subject, {
            foreignKey: 'subject_id',
            onDelete: 'CASCADE',
          });

          models.project_subject_study_series_significance.belongsTo(models.study, {
            foreignKey: 'study_id',
            onDelete: 'CASCADE',
          });

          await fastify.orm.sync();
          if (config.env === 'test') {
            try {
              await fastify.orm.query(
                `INSERT IGNORE INTO user(username, firstname, lastname, email, admin, createdtime, updatetime) VALUES('admin', 'admin', 'admin', 'admin@gmail.com', true, ${Date.now()}, ${Date.now()})`
              );
            } catch (userCreateErr) {
              reject(new InternalError('Creating admin user in testdb', userCreateErr));
            }
            try {
              await fastify.orm.query(
                `INSERT IGNORE INTO registeredapps(apikey,name, email, organization, emailvalidationcode, ontologyname, hostname, epadtype, creator, createdtime, updatetime) VALUES('1111','testname','testemail','testorganization','testvalid', 'testontologyname', 'testontologyhost', 't', 'test', ${Date.now()}, ${Date.now()})`
              );
            } catch (apikeyerror) {
              reject(new InternalError('Creating apikey  in testdb', apikeyerror));
            }
          }
          fastify.log.info('Connected to mariadb server');
          fastify.decorate('models', models);
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

  fastify.decorate('findUserIdInternal', (username) => {
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
    fastify
      .createProjectInternal(
        projectName,
        projectId,
        projectDescription,
        defaultTemplate,
        type,
        request.epadAuth
      )
      .then((res) => reply.code(200).send(res))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'createProjectInternal',
    (projectName, projectId, projectDescription, defaultTemplate, type, epadAuth) =>
      new Promise((resolve, reject) => {
        if (projectId === 'lite') {
          reject(
            new BadRequestError(
              'Creating lite project',
              new Error('lite project id is reserved for system. Use another project id')
            )
          );
        } else {
          const validationErr = fastify.validateRequestBodyFields(projectName, projectId);
          if (validationErr) {
            reject(new BadRequestError('Creating project', new Error(validationErr)));
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
              creator: epadAuth.username,
            })
            .then(async (project) => {
              // create relation as owner
              try {
                const userId = await fastify.findUserIdInternal(epadAuth.username);
                const entry = {
                  project_id: project.id,
                  user_id: userId,
                  role: 'Owner',
                  createdtime: Date.now(),
                  updatetime: Date.now(),
                  creator: epadAuth.username,
                };
                await models.project_user.create(entry);
                // if there is default template add that template to project
                await fastify.tryAddDefaultTemplateToProject(defaultTemplate, project, epadAuth);
                // if teaching make sure both teeaching and significant image templates are added
                if (config.mode === 'teaching') {
                  if (defaultTemplate !== config.teachingTemplate)
                    await fastify.tryAddDefaultTemplateToProject(
                      config.teachingTemplate,
                      project,
                      epadAuth
                    );
                  if (defaultTemplate !== config.sigImageTemplate)
                    await fastify.tryAddDefaultTemplateToProject(
                      config.sigImageTemplate,
                      project,
                      epadAuth
                    );
                }

                fastify.log.info(`Project with id ${project.id} is created successfully`);
                resolve(`Project with id ${project.id} is created successfully`);
              } catch (errPU) {
                reject(
                  new InternalError(
                    'Getting user info for project owner and creating project owner relationship',
                    errPU
                  )
                );
              }
            })
            .catch((err) => {
              if (
                err.errors &&
                err.errors[0] &&
                err.errors[0].type &&
                err.errors[0].type === 'unique violation'
              )
                reject(new ResourceAlreadyExistsError('Project', projectId));
              else reject(new InternalError('Creating project', err));
            });
        }
      })
  );

  fastify.decorate(
    'tryAddDefaultTemplateToProject',
    (defaultTemplate, project, epadAuth) =>
      new Promise(async (resolve) => {
        if (defaultTemplate && defaultTemplate !== '') {
          try {
            // check if template exists in system
            const template = await fastify.getTemplateInternal(defaultTemplate, 'summary');
            await fastify.addProjectTemplateRelInternal(
              template.containerUID,
              project,
              {},
              epadAuth
            );

            resolve(true);
          } catch (errTemplate) {
            fastify.log.warn(
              `Could not add template ${defaultTemplate} to project ${JSON.stringify(project)}`
            );
          }
        }
        resolve(false);
      })
  );

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
        } else if (keys[i] === 'defaultTemplate') {
          query.defaulttemplate = values[i];
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
        .then(async () => {
          // if there is default template add that template to project
          await fastify.tryAddDefaultTemplateToProject(
            query.defaultTemplate || query.defaulttemplate,
            request.params.project,
            request.epadAuth
          );

          fastify.log.info(`Project ${request.params.project} is updated`);
          reply.code(200).send(`Project ${request.params.project} is updated successfully`);
        })
        .catch((err) => {
          reply.send(new InternalError('Updating project', err));
        });
    }
  });

  fastify.decorate(
    'deleteRelationAndOrphanedCouchDocInternal',
    (dbProjectId, relationTable, uidField, projectId) =>
      new Promise(async (resolve, reject) => {
        try {
          let whereJSON = { project_id: dbProjectId };
          if (uidField === 'aim_uid') whereJSON = { ...whereJSON, ...fastify.qryNotDeleted() };
          const uidsToDeleteObjects = await models[relationTable].findAll({
            attributes: [uidField],
            where: whereJSON,
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

              let leftQry = `SELECT distinct ${uidField} FROM ${relationTable} WHERE ${uidField} in ('${uidsToDelete.join(
                `','`
              )}')`;
              if (uidField === 'aim_uid') leftQry += ` AND deleted is NULL `;
              leftQry += ` ORDER BY ${uidField} ASC`;
              const uidsLeftObjects = await fastify.orm.query(leftQry, { type: QueryTypes.SELECT });
              if (uidsToDelete.length === uidsLeftObjects.length) {
                fastify.log.info(
                  `All ${relationTable} entries of project ${dbProjectId} are being used by other projects`
                );
                // update projects if aim
                if (relationTable === 'project_aim')
                  await fastify.removeProjectFromCouchDocsInternal(uidsToDelete, projectId);
              } else {
                const safeToDelete = [];
                const updateIfAim = [];
                let i = 0;
                let j = 0;
                // traverse the arrays once to find the ones that only exists in the first
                // assumptions arrays are both sorted according to uid, second list is a subset of first
                while (i < uidsToDelete.length && j < uidsLeftObjects.length) {
                  if (uidsToDelete[i] === uidsLeftObjects[j][uidField]) {
                    updateIfAim.push(uidsToDelete[i]);
                    i += 1;
                    j += 1;
                  } else if (uidsToDelete[i] < uidsLeftObjects[j][uidField]) {
                    safeToDelete.push(uidsToDelete[i]);
                    i += 1;
                  } else if (uidsToDelete[i] > uidsLeftObjects[j][uidField]) {
                    // cannot happen!
                    console.log(
                      `should not happen! uidsto delete ${uidsToDelete[i]}, uidsLeftObjects ${uidsLeftObjects[j][uidField]}, uidfield ${uidField}`
                    );
                    // just in case
                    updateIfAim.push(uidsToDelete[i]);
                  }
                }
                // add leftovers
                while (i < uidsToDelete.length) {
                  safeToDelete.push(uidsToDelete[i]);
                  i += 1;
                }
                if (safeToDelete.length > 0) await fastify.deleteCouchDocsInternal(safeToDelete);
                if (updateIfAim.length > 0 && relationTable === 'project_aim')
                  await fastify.removeProjectFromCouchDocsInternal(safeToDelete, projectId);
                fastify.log.info(
                  `Deleted ${numDeleted} records from ${relationTable} and ${safeToDelete.length} docs from couchdb`
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
          'file_uid',
          request.params.project
        );
        // delete projects aims (delete orphan aims)
        await fastify.deleteRelationAndOrphanedCouchDocInternal(
          project.id,
          'project_aim',
          'aim_uid',
          request.params.project
        );
        // delete projects templates (delete orphan templates)
        await fastify.deleteRelationAndOrphanedCouchDocInternal(
          project.id,
          'project_template',
          'template_uid',
          request.params.project
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

  fastify.decorate('getProjectNameMap', async () => {
    try {
      const projects = await models.project.findAll({
        where: config.mode === 'lite' ? { projectid: 'lite' } : {},
        attributes: ['projectid', 'name'],
        raw: true,
      });
      const projectNameMap = {};
      if (projects) {
        projects.forEach((prj) => {
          projectNameMap[prj.projectid] = prj.name;
        });
      }
      return projectNameMap;
    } catch (err) {
      throw new InternalError(`Getting project name map`, err);
    }
  });

  fastify.decorate('getAccessibleProjectIdsByName', async (name, epadAuth) => {
    try {
      const projects = await models.project.findAll({
        where: {
          ...(config.mode === 'lite' ? { projectid: 'lite' } : {}),
          name: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('name')), 'LIKE', `%${name}%`),
        },
        attributes: ['projectid', 'name'],
        raw: true,
      });

      if (projects) {
        const projectIds = projects.map((prj) => prj.projectid);
        if (!epadAuth.admin) {
          let { collaboratorProjIds, aimAccessProjIds } = await fastify.getAccessibleProjects(
            epadAuth
          );
          collaboratorProjIds = collaboratorProjIds.reduce((id) => projectIds.includes(id), []);

          aimAccessProjIds = aimAccessProjIds.reduce((id) => projectIds.includes(id), []);
          return {
            collaboratorProjIds,
            aimAccessProjIds,
          };
        }
        return { collaboratorProjIds: [], aimAccessProjIds: projectIds };
      }
      return { collaboratorProjIds: [], aimAccessProjIds: [] };
    } catch (err) {
      throw new InternalError(`Getting accessible project ids by project name`, err);
    }
  });

  fastify.decorate('getProjects', async (request, reply) => {
    try {
      const promisses = [
        models.project.findAll({
          where: config.mode === 'lite' ? { projectid: 'lite' } : {},
          order: [['name', 'ASC']],
          include: [{ model: models.project_subject, required: false, separate: true }],
        }),
        // I'm not interested in users that don't have any projects
        fastify.orm.query(
          'SELECT pu.project_id as project_id, u.username as username FROM user u INNER JOIN project_user pu ON u.id = pu.user_id ORDER BY pu.project_id, u.username',
          { type: QueryTypes.SELECT }
        ),
      ];
      const [projects, projectUsers] = await Promise.all(promisses);

      const projectUserMap = {};
      if (projectUsers) {
        projectUsers.forEach((projectUser) => {
          // eslint-disable-next-line no-unused-expressions
          projectUserMap[projectUser.project_id]
            ? projectUserMap[projectUser.project_id].push(projectUser.username)
            : (projectUserMap[projectUser.project_id] = [projectUser.username]);
        });
      }
      // projects will be an array of all Project instances
      const result = [];
      const projectsLen = projects.length;
      for (let i = 0; i < projectsLen; i += 1) {
        const project = projects[i];
        // if the mode is teaching get the count of teaching files
        let numberOfTeachingFiles;
        if (config.mode === 'teaching') {
          // eslint-disable-next-line no-await-in-loop
          const teachingFileCount = await fastify.orm.query(
            `SELECT count(aim_uid) aimCount FROM project_aim WHERE template='99EPAD_947' and project_id=${project.id};`,
            { raw: true, type: QueryTypes.SELECT }
          );
          numberOfTeachingFiles =
            teachingFileCount && teachingFileCount[0] ? teachingFileCount[0].aimCount : 0;
        }
        let numberOfSubjects = project.dataValues.project_subjects.length;
        if (project.projectid === config.XNATUploadProjectID) {
          // eslint-disable-next-line no-await-in-loop
          const allSubjects = await fastify.orm.query(
            `SELECT count(distinct subject_id) subjCount from project_subject;`,
            { raw: true, type: QueryTypes.SELECT }
          );
          numberOfSubjects = allSubjects && allSubjects[0] ? allSubjects[0].subjCount : 0;
        } else if (project.projectid === config.unassignedProjectID) {
          if (config.pollDW) {
            // eslint-disable-next-line no-await-in-loop
            const unassingedSubjects = await fastify.orm.query(
              `SELECT count(id) subjCount from subject where id not in (select subject_id from project_subject);`,
              { raw: true, type: QueryTypes.SELECT }
            );
            numberOfSubjects =
              unassingedSubjects && unassingedSubjects[0] ? unassingedSubjects[0].subjCount : 0;
          } else {
            // I need t grab it from dicomweb server
            // eslint-disable-next-line no-await-in-loop
            const results = await fastify.getUnassignedSubjectsfromDicomweb(
              request.params,
              request.epadAuth,
              true
            );
            numberOfSubjects = results.length;
          }
        }
        const obj = {
          id: project.dataValues.projectid,
          name: project.dataValues.name,
          // numberOfAnnotations:
          // numberOfStudies:
          numberOfSubjects,
          numberOfTeachingFiles,
          // subjectIDs:
          description: project.dataValues.description,
          loginNames: [],
          type: project.dataValues.type,
          defaultTemplate: project.dataValues.defaulttemplate,
        };

        if (projectUserMap[project.dataValues.id])
          projectUserMap[project.dataValues.id].forEach((username) => {
            obj.loginNames.push(username);
          });
        if (
          request.epadAuth.admin ||
          obj.loginNames.includes(request.epadAuth.username) ||
          obj.type.toLowerCase() === 'public'
        ) {
          // if config liteOnTop, move lite to the top
          if (config.projOnTop && config.projOnTop === project.dataValues.projectid)
            result.unshift(obj);
          else result.push(obj);
        }
      }
      reply.code(200).send(result);
    } catch (err) {
      reply.send(
        new InternalError(
          `Getting and filtering project list for user ${request.epadAuth.username}, isAdmin ${request.epadAuth.admin}`,
          err
        )
      );
    }
  });

  //  Plugin section
  fastify.decorate('getProjectsWithPkAsId', (request, reply) => {
    models.project
      .findAll({
        order: [['id', 'ASC']],
        include: ['users'],
      })
      .then((projects) => {
        const result = [];
        projects.forEach((project) => {
          const obj = {
            id: project.id,
            name: project.name,
            projectid: project.projectid,
            description: project.description,
            loginNames: [],
            type: project.type,
          };

          project.users.forEach((user) => {
            obj.loginNames.push(user.username);
          });
          if (request.epadAuth.admin || obj.loginNames.includes(request.epadAuth.username))
            result.push(obj);
        });
        reply.code(200).send(result);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              `Getting and filtering project list for user ${request.epadAuth.username}, isAdmin ${request.epadAuth.admin}`,
              err
            )
          );
      });
  });
  // not used for now
  // fastify.decorate('getPlugins', async (request, reply) => {
  //   models.plugin
  //     .findAll()
  //     .then(plugins => {
  //       reply.code(200).send(plugins);
  //     })
  //     .catch(err => {
  //       reply.code(500).send(new InternalError('Getting plugin list', err));
  //     });
  // });

  fastify.decorate('getPluginsForProject', (request, reply) => {
    const paramProjectId = request.params.projectid;
    models.project
      .findOne({
        include: ['projectplugin'],
        where: { projectid: paramProjectId },
      })
      .then((plugins) => {
        reply.code(200).send(plugins);
      })
      .catch((err) => {
        reply.code(500).send(new InternalError('Getting plugin list for the project', err));
      });
  });
  fastify.decorate('getTemplatesDataFromDb', (request, reply) => {
    models.template
      .findAll()
      .then((templates) => {
        reply.code(200).send(templates);
      })
      .catch((err) => {
        reply.code(500).send(new InternalError('Getting templates from db', err));
      });
  });

  fastify.decorate('getContainerLog', (request, reply) => {
    const { containerid } = request.params;
    fastify
      .getUserPluginDataPathInternal()
      .then((pluginDataRootPath) => {
        // eslint-disable-next-line no-param-reassign
        pluginDataRootPath = path.join(__dirname, `../pluginsDataFolder`);
        fastify
          .getObjectCreator('pluginqueue', containerid, '')
          .then((creator) => {
            const dock = new DockerService(fs, fastify, path);

            dock
              .inspectContainer(`epadplugin_${containerid}`)
              .then((inspectResultObject) => {
                fastify.log.info('inspect result object', inspectResultObject);
                fastify.log.info(
                  `trying to read from the path : ${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
                );
                if (
                  fs.existsSync(`${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`)
                ) {
                  fastify.log.info('log file found sending to frontend');
                  reply.raw.setHeader('Content-type', 'application/octet-stream');
                  reply.raw.setHeader('Access-Control-Allow-Origin', '*');
                  reply.raw.setHeader('connection', 'keep-alive');
                  const rdsrtm = fs.createReadStream(
                    `${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
                  );
                  reply.send(rdsrtm);
                  fastify.log.info(
                    `container not running but trying to find log file : ${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
                  );
                } else {
                  reply.code(404).send('log file not found');
                }
              })
              .catch((err) => {
                fastify.log.info('err', err);
                reply.code(500).send(err);
              });
          })
          .catch((err) => {
            fastify.log.info(
              `error on getting creator for the plugin container epadplugin_${containerid}`,
              err
            );
            reply
              .code(500)
              .send(
                new InternalError(
                  `error on getting creator for the plugin container epadplugin_${containerid}`,
                  err
                )
              );
          });
        // need to get the creator internally
      })
      .catch((err) => {
        fastify.log.info('error on getting plugin data path for log file ', err);
        reply
          .code(500)
          .send(
            new InternalError(
              `Error happened while trying to get the log file for container: epadplugin_${containerid}`,
              err
            )
          );
      });
  });

  fastify.decorate('getPluginsWithProject', (request, reply) => {
    models.plugin
      .findAll({
        include: ['pluginproject', 'plugintemplate', 'defaultparameters'],
        required: false,
      })
      .then((plugins) => {
        const result = [];
        plugins.forEach((data) => {
          const pluginObj = {
            description: data.dataValues.description,
            developer: data.dataValues.developer,
            documentation: data.dataValues.documentation,
            enabled: data.dataValues.enabled,
            id: data.dataValues.id,
            image_repo: data.dataValues.image_repo,
            image_tag: data.dataValues.image_tag,
            image_name: data.dataValues.image_name,
            image_id: data.dataValues.image_id,
            modality: data.dataValues.modality,
            name: data.dataValues.name,
            plugin_id: data.dataValues.plugin_id,
            processmultipleaims: data.dataValues.processmultipleaims,
            projects: [],
            status: data.dataValues.status,
            templates: [],
            parameters: [],
          };

          data.dataValues.pluginproject.forEach((project) => {
            const projectObj = {
              id: project.id,
              projectid: project.projectid,
              projectname: project.name,
            };

            pluginObj.projects.push(projectObj);
          });

          data.dataValues.plugintemplate.forEach((template) => {
            const templateObj = {
              id: template.id,
              templateName: template.templateName,
            };

            pluginObj.templates.push(templateObj);
          });

          data.dataValues.defaultparameters.forEach((parameter) => {
            const parameterObj = {
              id: parameter.id,
              plugin_id: parameter.plugin_id,
              name: parameter.name,
              sendname: parameter.sendname,
              uploadimages: parameter.uploadimages,
              uploadaims: parameter.uploadaims,
              sendparamtodocker: parameter.sendparamtodocker,
              refreshdicoms: parameter.refreshdicoms,
              format: parameter.format,
              prefix: parameter.prefix,
              inputbinding: parameter.inputBinding,
              default_value: parameter.default_value,
              type: parameter.type,
              description: parameter.description,
            };

            pluginObj.parameters.push(parameterObj);
          });
          result.push(pluginObj);
        });

        reply.code(200).send(result);
      })
      .catch((err) => {
        reply.code(500).send(new InternalError(`getPluginsWithProject error `, err));
      });
  });

  fastify.decorate('getOnePlugin', (request, reply) => {
    const { plugindbid } = request.params;
    models.plugin
      .findOne({
        include: ['pluginproject', 'plugintemplate', 'defaultparameters'],
        where: { id: plugindbid },
        required: false,
      })
      .then((pluginone) => {
        const pluginObj = {
          description: pluginone.dataValues.description,
          developer: pluginone.dataValues.developer,
          documentation: pluginone.dataValues.documentation,
          enabled: pluginone.dataValues.enabled,
          id: pluginone.dataValues.id,
          image_repo: pluginone.dataValues.image_repo,
          image_tag: pluginone.dataValues.image_tag,
          image_name: pluginone.dataValues.image_name,
          image_id: pluginone.dataValues.image_id,
          modality: pluginone.dataValues.modality,
          name: pluginone.dataValues.name,
          plugin_id: pluginone.dataValues.plugin_id,
          processmultipleaims: pluginone.dataValues.processmultipleaims,
          projects: [],
          status: pluginone.dataValues.status,
          templates: [],
          parameters: [],
        };

        pluginone.dataValues.pluginproject.forEach((project) => {
          const projectObj = {
            id: project.id,
            projectid: project.projectid,
            projectname: project.name,
          };

          pluginObj.projects.push(projectObj);
        });

        pluginone.dataValues.plugintemplate.forEach((template) => {
          const templateObj = {
            id: template.id,
            templateName: template.templateName,
          };

          pluginObj.templates.push(templateObj);
        });

        pluginone.dataValues.defaultparameters.forEach((parameter) => {
          const parameterObj = {
            id: parameter.id,
            plugin_id: parameter.plugin_id,
            name: parameter.name,
            sendname: parameter.sendname,
            uploadimages: parameter.uploadimages,
            uploadaims: parameter.uploadaims,
            sendparamtodocker: parameter.sendparamtodocker,
            refreshdicoms: parameter.refreshdicoms,
            format: parameter.format,
            prefix: parameter.prefix,
            inputbinding: parameter.inputBinding,
            default_value: parameter.default_value,
            type: parameter.type,
            description: parameter.description,
          };

          pluginObj.parameters.push(parameterObj);
        });

        reply.code(200).send(pluginone);
      })
      .catch((err) => {
        reply.code(500).send(new InternalError(`getOnePlugin error `, err));
      });
  });

  fastify.decorate('updateProjectsForPlugin', async (request, reply) => {
    const { pluginid } = request.params;
    const { projectsToRemove, projectsToAdd } = request.body;
    const dbPromisesForCreate = [];
    const formattedProjects = [];

    fastify.log.info(`projects to remove : ${projectsToRemove}`);
    fastify.log.info(`projects to add : ${projectsToAdd}`);
    let whereObj = {};
    whereObj = {
      plugin_id: pluginid,
      project_id: projectsToRemove,
    };

    if (projectsToRemove && projectsToAdd) {
      models.project_plugin
        .destroy({
          where: whereObj,
        })
        .then(() => {
          projectsToAdd.forEach((projectid) => {
            dbPromisesForCreate.push(
              models.project_plugin.create({
                project_id: projectid,
                plugin_id: pluginid,
                createdtime: Date.now(),
                updatetime: Date.now(),
                enabled: 1,
                creator: request.epadAuth.username,
                updated_by: request.epadAuth.username,
              })
            );
          });

          return Promise.all(dbPromisesForCreate).then(() => {
            models.plugin
              .findOne({
                include: ['pluginproject'],
                required: false,
                where: {
                  id: pluginid,
                },
              })
              .then((allTProjectsForPlugin) => {
                allTProjectsForPlugin.dataValues.pluginproject.forEach((project) => {
                  const projectObj = {
                    id: project.id,
                    projectid: project.projectid,
                    projectname: project.name,
                  };
                  formattedProjects.push(projectObj);
                });
                reply.code(200).send(formattedProjects);
              })
              .catch((err) => {
                reply
                  .code(500)
                  .send(
                    new InternalError(
                      'something went wrong while assigning project to plugin ',
                      err
                    )
                  );
              });
          });
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError('something went wrong while unassigning project from plugin ', err)
            );
        });
    } else {
      reply
        .code(500)
        .send(
          new InternalError(
            'Editing projects for plugin failed. ',
            new Error('Necessary parameters {projectsToRemove, projectsToAdd} are not in the body ')
          )
        );
    }
  });

  fastify.decorate('updateTemplatesForPlugin', (request, reply) => {
    const { pluginid } = request.params.pluginid;
    const { templatesToRemove, templatesToAdd } = request.body;
    const dbPromisesForCreate = [];
    const formattedTemplates = [];
    if (templatesToRemove && templatesToAdd) {
      models.plugin_template
        .destroy({
          where: {
            plugin_id: pluginid,
            template_id: templatesToRemove,
          },
        })
        .then(() => {
          templatesToAdd.forEach((templateid) => {
            dbPromisesForCreate.push(
              models.plugin_template.create({
                template_id: templateid,
                plugin_id: pluginid,
                createdtime: Date.now(),
                updatetime: Date.now(),
                enabled: 1,
                creator: request.epadAuth.username,
                updated_by: request.epadAuth.username,
              })
            );
          });

          return Promise.all(dbPromisesForCreate).then(() => {
            models.plugin
              .findOne({
                include: ['plugintemplate'],
                required: false,
                where: {
                  id: pluginid,
                },
              })
              .then((allTemplatesForPlugin) => {
                allTemplatesForPlugin.dataValues.plugintemplate.forEach((template) => {
                  const templateObj = {
                    id: template.id,
                    templateName: template.templateName,
                  };
                  formattedTemplates.push(templateObj);
                });
                reply.send(formattedTemplates);
              })
              .catch((err) => {
                reply
                  .code(500)
                  .send(
                    new InternalError(
                      'something went wrong while assigning template to plugin ',
                      err
                    )
                  );
              });
          });
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError('something went wrong while unassigning template from plugin ', err)
            );
        });
    } else {
      reply
        .code(500)
        .send(
          new InternalError(
            'Editing templates for plugin failed.',
            new Error('Necessary parameters { templatesToAdd,templatesToAdd} are not in the body ')
          )
        );
    }
  });

  fastify.decorate('deletePlugin', async (request, reply) => {
    const { selectedRowPluginId, pluginIdsToDelete } = request.body;
    const existInQueue = [];
    const ableToDelete = [];
    let pluginid = [];
    if (typeof selectedRowPluginId !== 'undefined') {
      pluginid.push(selectedRowPluginId);
    } else {
      pluginid = [...pluginIdsToDelete];
    }
    if (request.epadAuth.admin === false) {
      reply.send(new UnauthorizedError('User has no right to delete plugin'));
    } else {
      try {
        for (let cnt = 0; cnt < pluginid.length; cnt += 1) {
          // eslint-disable-next-line no-await-in-loop
          const resultQueueExist = await models.plugin_queue.findAll({
            where: {
              plugin_id: pluginid[cnt],
            },
          });
          fastify.log.info('checking if queue has the plugin : ', resultQueueExist.length);
          if (resultQueueExist.length === 0) {
            // eslint-disable-next-line no-await-in-loop
            await models.plugin_parameters.destroy({
              where: {
                plugin_id: pluginid[cnt],
              },
            });
            // eslint-disable-next-line no-await-in-loop
            await models.plugin_projectparameters.destroy({
              where: {
                plugin_id: pluginid[cnt],
              },
            });
            // eslint-disable-next-line no-await-in-loop
            await models.plugin_template.destroy({
              where: {
                plugin_id: pluginid[cnt],
              },
            });
            // eslint-disable-next-line no-await-in-loop
            await models.plugin_templateparameters.destroy({
              where: {
                plugin_id: pluginid[cnt],
              },
            });
            // eslint-disable-next-line no-await-in-loop
            await models.project_plugin.destroy({
              where: {
                plugin_id: pluginid[cnt],
              },
            });
            // eslint-disable-next-line no-await-in-loop
            await models.plugin.destroy({
              where: {
                id: pluginid[cnt],
              },
            });
            ableToDelete.push(pluginid[cnt]);
          } else {
            existInQueue.push(pluginid[cnt]);
          }
        }
        if (existInQueue.length > 0) {
          reply.code(200).send(ableToDelete);
        } else {
          reply.code(200).send('Plugin deleted seccessfully');
        }
      } catch (err) {
        reply.code(500).send(new InternalError('Something went wrong when deleting plugin', err));
      }
    }
  });

  fastify.decorate('savePlugin', (request, reply) => {
    let tempprocessmultipleaims = null;

    const { pluginform } = request.body;
    if (pluginform.processmultipleaims !== '') {
      tempprocessmultipleaims = pluginform.processmultipleaims;
    }
    if (request.epadAuth.admin === false) {
      reply.send(new UnauthorizedError('User has no right to create plugin'));
    } else {
      // check if plugin_id exist
      models.plugin
        .findAll({
          where: { plugin_id: pluginform.plugin_id },
        })
        .then((result) => {
          if (result.length === 0) {
            // save plugin
            models.plugin
              .create({
                plugin_id: pluginform.plugin_id,
                name: pluginform.name,
                description: pluginform.description,
                image_repo: pluginform.image_repo,
                image_tag: pluginform.image_tag,
                image_name: pluginform.image_name,
                image_id: pluginform.image_id,
                enabled: pluginform.enabled,
                modality: pluginform.modality,
                creator: request.epadAuth.username,
                createdtime: Date.now(),
                updatetime: '1970-01-01 00:00:01',
                developer: pluginform.developer,
                documentation: pluginform.documentation,
                processmultipleaims: tempprocessmultipleaims,
              })
              .then(() => {
                reply.code(200).send('Plugin saved seccessfully');
              })
              .catch((err) => {
                reply
                  .code(500)
                  .send(
                    new InternalError(
                      'Something went wrong while creating a new plugin in plugin table',
                      err
                    )
                  );
              });
            // save plugin end
          } else {
            reply
              .code(500)
              .send(new InternalError('Select different id ', new Error('id exist already')));
          }
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError('Something went wrong while verifying duplicate plugin_id', err)
            );
        });
      // check plugin id end
    }
  });

  fastify.decorate('editPlugin', (request, reply) => {
    const { pluginform } = request.body;
    let tempprocessmultipleaims = null;
    if (pluginform.processmultipleaims !== '') {
      tempprocessmultipleaims = pluginform.processmultipleaims;
    }
    models.plugin
      .update(
        {
          ...pluginform,
          updatetime: Date.now(),
          updated_by: request.epadAuth.username,
          processmultipleaims: tempprocessmultipleaims,
        },
        {
          where: {
            id: pluginform.dbid,
          },
        }
      )
      .then(() => {
        reply.code(200).send(pluginform);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError('Something went wrong while updating plugin in plugin table', err)
          );
      });
  });
  // not used for now
  // fastify.decorate('getAnnotationTemplates', (request, reply) => {
  //   const templateCodes = [];
  //   const templates = [];
  //   models.project_aim
  //     .findAll({
  //       attributes: ['template'],
  //       distinct: ['template'],
  //     })
  //     .then(results => {
  //       results.forEach(template => {
  //         templateCodes.push(template.dataValues.template);
  //       });
  //       return models.template
  //         .findAll({
  //           where: { templateCode: templateCodes },
  //         })
  //         .then(result => {
  //           result.forEach(template => {
  //             const templateObj = {
  //               id: template.dataValues.id,
  //               templateName: template.dataValues.templateName,
  //               templateCode: template.dataValues.templateCode,
  //               modality: template.dataValues.modality,
  //             };

  //             templates.push(templateObj);
  //           });
  //           reply.code(200).send(templates);
  //         })
  //         .catch(err => {
  //           reply
  //             .code(500)
  //             .send(
  //               new InternalError(
  //                 'Something went wrong while getting template list from Template table',
  //                 err
  //               )
  //             );
  //         });
  //     })
  //     .catch(err => {
  //       reply
  //         .code(500)
  //         .send(
  //           new InternalError(
  //             'Something went wrong while getting template codes from annotations table',
  //             err
  //           )
  //         );
  //     });
  // });

  // fastify.decorate('getUniqueProjectsIfAnnotationExist', (request, reply) => {
  //   //  getting unique projects which have annotations under
  //   const projectUids = [];
  //   const projects = [];
  //   models.project_aim
  //     .findAll({
  //       attributes: ['project_id'],
  //       distinct: ['project_id'],
  //     })
  //     .then(results => {
  //       results.forEach(project => {
  //         projectUids.push(project.dataValues.project_id);
  //       });
  //       return models.project
  //         .findAll({
  //           where: { id: projectUids },
  //         })
  //         .then(result => {
  //           result.forEach(project => {
  //             const projectObj = {
  //               id: project.dataValues.id,
  //               name: project.dataValues.name,
  //               projectid: project.dataValues.projectid,
  //               type: project.dataValues.type,
  //               creator: project.dataValues.creator,
  //             };

  //             projects.push(projectObj);
  //           });
  //           reply.code(200).send(projects);
  //         })
  //         .catch(err => {
  //           reply
  //             .code(500)
  //             .send(
  //               new InternalError(
  //                 'Something went wrong while getting project list from Project table',
  //                 err
  //               )
  //             );
  //         });
  //     })
  //     .catch(err => {
  //       reply
  //         .code(500)
  //         .send(
  //           new InternalError(
  //             'Something went wrong while getting project uids from annotations table',
  //             err
  //           )
  //         );
  //     });
  // });

  fastify.decorate('saveDefaultParameter', (request, reply) => {
    const parameterform = request.body;
    if (request.epadAuth.admin === false) {
      reply.send(new UnauthorizedError('User has no right to add plugin default parameters'));
    } else {
      models.plugin_parameters
        .create({
          plugin_id: parameterform.plugindbid,
          paramid: parameterform.paramid,
          name: parameterform.name,
          sendname: parseInt(parameterform.sendname, 10),
          uploadimages: parseInt(parameterform.uploadimages, 10),
          uploadaims: parseInt(parameterform.uploadaims, 10),
          sendparamtodocker: parseInt(parameterform.sendparamtodocker, 10),
          refreshdicoms: parseInt(parameterform.refreshdicoms, 10),
          format: parameterform.format,
          prefix: parameterform.prefix,
          inputBinding: parameterform.inputBinding,
          default_value: parameterform.default_value,
          creator: request.epadAuth.username,
          createdtime: Date.now(),
          type: parameterform.type,
          description: parameterform.description,
          updatetime: '1970-01-01 00:00:01',
          //  developer: parameterform.developer,
          //  documentation: parameterform.documentation,
        })
        .then(() => {
          reply.code(200).send('default parameters saved seccessfully');
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError(
                'Something went wrong while saving default paramters in plugin_parameters table',
                err
              )
            );
        });
    }
  });
  fastify.decorate('getDefaultParameter', (request, reply) => {
    //  returns all paramters for a given plugin with the dbid not plugin_id

    const { plugindbid } = request.params;
    const parameters = [];
    models.plugin_parameters
      .findAll({
        // where: { plugin_id: plugindbid, creator: request.epadAuth.username }, #=> removed creator to show default params for runtime editing
        where: { plugin_id: plugindbid },
      })
      .then((result) => {
        result.forEach((parameter) => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
            paramid: parameter.dataValues.paramid,
            name: parameter.dataValues.name,
            sendname: parameter.dataValues.sendname,
            uploadimages: parameter.dataValues.uploadimages,
            uploadaims: parameter.dataValues.uploadaims,
            sendparamtodocker: parameter.dataValues.sendparamtodocker,
            refreshdicoms: parameter.dataValues.refreshdicoms,
            format: parameter.dataValues.format,
            prefix: parameter.dataValues.prefix,
            inputBinding: parameter.dataValues.inputBinding,
            default_value: parameter.dataValues.default_value,
            creator: parameter.dataValues.creator,
            createdtime: parameter.dataValues.createdtime,
            updatetime: parameter.dataValues.updatetime,
            updated_by: parameter.dataValues.updated_by,
            type: parameter.dataValues.type,
            description: parameter.dataValues.description,
          };

          parameters.push(parameterObj);
        });
        reply.code(200).send(parameters);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while getting parameters list from plugin_paramters table',
              err
            )
          );
      });
  });
  fastify.decorate('deleteOneDefaultParameter', (request, reply) => {
    const parameterIdToDelete = request.params.parameterdbid;
    if (request.epadAuth.admin === false) {
      reply.send(new UnauthorizedError('User has no right to delete plugin default parameters'));
    } else {
      models.plugin_parameters
        .destroy({
          where: {
            id: parameterIdToDelete,
          },
        })
        .then(() => {
          reply.code(200).send('parameter deleted seccessfully');
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError(
                'Something went wrong while deleting from plugin_parameters table',
                err
              )
            );
        });
    }
  });

  fastify.decorate('editDefaultparameter', (request, reply) => {
    const paramsForm = request.body;
    if (request.epadAuth.admin === false) {
      reply.send(new UnauthorizedError('User has no right to edit plugin default parameters'));
    } else {
      models.plugin_parameters
        .update(
          {
            paramid: paramsForm.paramid,
            name: paramsForm.name,
            sendname: parseInt(paramsForm.sendname, 10),
            uploadimages: parseInt(paramsForm.uploadimages, 10),
            uploadaims: parseInt(paramsForm.uploadaims, 10),
            sendparamtodocker: parseInt(paramsForm.sendparamtodocker, 10),
            refreshdicoms: parseInt(paramsForm.refreshdicoms, 10),
            format: paramsForm.format,
            prefix: paramsForm.prefix,
            inputBinding: paramsForm.inputBinding,
            default_value: paramsForm.default_value,
            updatetime: Date.now(),
            updated_by: request.epadAuth.username,
            type: paramsForm.type,
            description: paramsForm.description,
          },
          {
            where: {
              id: paramsForm.paramdbid,
            },
          }
        )
        .then(() => {
          reply.code(200).send(paramsForm);
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError(
                'Something went wrong while updating parameters in plugin_parameters table',
                err
              )
            );
        });
    }
  });

  fastify.decorate('getProjectParameter', (request, reply) => {
    const { plugindbid, projectdbid } = request.params;
    const parameters = [];
    models.plugin_projectparameters
      .findAll({
        where: {
          plugin_id: plugindbid,
          project_id: projectdbid,
          creator: request.epadAuth.username,
        },
      })
      .then((result) => {
        result.forEach((parameter) => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
            project_id: parameter.dataValues.project_id,
            paramid: parameter.dataValues.paramid,
            name: parameter.dataValues.name,
            sendname: parameter.dataValues.sendname,
            uploadimages: parameter.dataValues.uploadimages,
            uploadaims: parameter.dataValues.uploadaims,
            sendparamtodocker: parameter.dataValues.sendparamtodocker,
            format: parameter.dataValues.format,
            prefix: parameter.dataValues.prefix,
            inputBinding: parameter.dataValues.inputBinding,
            default_value: parameter.dataValues.default_value,
            creator: parameter.dataValues.creator,
            createdtime: parameter.dataValues.createdtime,
            updatetime: parameter.dataValues.updatetime,
            updated_by: parameter.dataValues.updated_by,
            type: parameter.dataValues.type,
            description: parameter.dataValues.description,
          };

          parameters.push(parameterObj);
        });
        reply.code(200).send(parameters);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while getting project parameters list from plugin_projectparamters table',
              err
            )
          );
      });
  });
  fastify.decorate('saveProjectParameter', (request, reply) => {
    const parameterform = request.body;
    models.plugin_projectparameters
      .create({
        plugin_id: parameterform.plugindbid,
        project_id: parameterform.projectdbid,
        paramid: parameterform.paramid,
        name: parameterform.name,
        sendname: parseInt(parameterform.sendname, 10),
        uploadimages: parseInt(parameterform.uploadimages, 10),
        uploadaims: parseInt(parameterform.uploadaims, 10),
        sendparamtodocker: parseInt(parameterform.sendparamtodocker, 10),
        format: parameterform.format,
        prefix: parameterform.prefix,
        inputBinding: parameterform.inputBinding,
        default_value: parameterform.default_value,
        creator: request.epadAuth.username,
        createdtime: Date.now(),
        type: parameterform.type,
        description: parameterform.description,
        updatetime: '1970-01-01 00:00:01',
        //  developer: parameterform.developer,
        //  documentation: parameterform.documentation,
      })
      .then((inserteddata) => {
        reply.code(200).send(inserteddata);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while saving project paramters in plugin_projectparameters table',
              err
            )
          );
      });
  });
  fastify.decorate('deleteOneProjectParameter', (request, reply) => {
    const parameterIdToDelete = request.params.parameterdbid;
    models.plugin_projectparameters
      .destroy({
        where: {
          id: parameterIdToDelete,
        },
      })
      .then(() => {
        reply.code(200).send('parameter deleted seccessfully from plugin_projectparamaters');
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while deleting from plugin_projectparameters table',
              err
            )
          );
      });
  });
  fastify.decorate('editProjectParameter', (request, reply) => {
    const paramsForm = request.body;
    models.plugin_projectparameters
      .update(
        {
          paramid: paramsForm.id,
          name: paramsForm.name,
          sendname: parseInt(paramsForm.sendname, 10),
          uploadimages: parseInt(paramsForm.uploadimages, 10),
          uploadaims: parseInt(paramsForm.uploadaims, 10),
          sendparamtodocker: parseInt(paramsForm.sendparamtodocker, 10),
          format: paramsForm.format,
          prefix: paramsForm.prefix,
          inputBinding: paramsForm.inputBinding,
          default_value: paramsForm.default_value,
          updatetime: Date.now(),
          updated_by: request.epadAuth.username,
          type: paramsForm.type,
          description: paramsForm.description,
        },
        {
          where: {
            id: paramsForm.paramdbid,
          },
        }
      )
      .then(() => {
        reply.code(200).send(paramsForm);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while updating project parameters in plugin_projectparameters table',
              err
            )
          );
      });
  });

  fastify.decorate('getTemplateParameter', (request, reply) => {
    const { plugindbid, templatedbid } = request.params;
    const parameters = [];
    models.plugin_templateparameters
      .findAll({
        where: {
          plugin_id: plugindbid,
          template_id: templatedbid,
          creator: request.epadAuth.username,
        },
      })
      .then((result) => {
        result.forEach((parameter) => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
            template_id: parameter.dataValues.template_id,
            paramid: parameter.dataValues.paramid,
            name: parameter.dataValues.name,
            format: parameter.dataValues.format,
            prefix: parameter.dataValues.prefix,
            inputBinding: parameter.dataValues.inputBinding,
            default_value: parameter.dataValues.default_value,
            creator: parameter.dataValues.creator,
            createdtime: parameter.dataValues.createdtime,
            updatetime: parameter.dataValues.updatetime,
            updated_by: parameter.dataValues.updated_by,
            type: parameter.dataValues.type,
            description: parameter.dataValues.description,
          };

          parameters.push(parameterObj);
        });

        reply.code(200).send(parameters);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while getting template parameters list from plugin_templateparamters table',
              err
            )
          );
      });
  });

  fastify.decorate('saveTemplateParameter', (request, reply) => {
    const parameterform = request.body;
    models.plugin_templateparameters
      .create({
        plugin_id: parameterform.plugindbid,
        template_id: parameterform.templatedbid,
        paramid: parameterform.paramid,
        name: parameterform.name,
        format: parameterform.format,
        prefix: parameterform.prefix,
        inputBinding: parameterform.inputBinding,
        default_value: parameterform.default_value,
        creator: request.epadAuth.username,
        createdtime: Date.now(),
        type: parameterform.type,
        description: parameterform.description,
        updatetime: '1970-01-01 00:00:01',
        //  developer: parameterform.developer,
        //  documentation: parameterform.documentation,
      })
      .then((inserteddata) => {
        reply.code(200).send(inserteddata);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while saving template paramters in plugin_templateparameters table',
              err
            )
          );
      });
  });
  fastify.decorate('deleteOneTemplateParameter', (request, reply) => {
    const parameterIdToDelete = request.params.parameterdbid;

    models.plugin_templateparameters
      .destroy({
        where: {
          id: parameterIdToDelete,
        },
      })
      .then(() => {
        reply
          .code(200)
          .send('template parameter deleted seccessfully from plugin_templateparamaters');
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while deleting template parameter from plugin_templateparameters table',
              err
            )
          );
      });
  });
  fastify.decorate('editTemplateParameter', (request, reply) => {
    const paramsForm = request.body;
    models.plugin_templateparameters
      .update(
        {
          paramid: paramsForm.paramid,
          name: paramsForm.name,
          format: paramsForm.format,
          prefix: paramsForm.prefix,
          inputBinding: paramsForm.inputBinding,
          default_value: paramsForm.default_value,
          updatetime: Date.now(),
          updated_by: request.epadAuth.username,
          type: paramsForm.type,
          description: paramsForm.description,
        },
        {
          where: {
            id: paramsForm.paramdbid,
          },
        }
      )
      .then(() => {
        reply.code(200).send(paramsForm);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while updating template parameters in plugin_templateparameters table',
              err
            )
          );
      });
  });
  fastify.decorate('deleteFromPluginQueue', (request, reply) => {
    const pluginIdToDelete = [...request.body];
    const idsToDelete = [];
    const dock = new DockerService(fs, fastify, path);
    const promisesArray = [];

    for (let cnt = 0; cnt < pluginIdToDelete.length; cnt += 1) {
      const containerName = `epadplugin_${pluginIdToDelete[cnt]}`;
      promisesArray.push(
        dock
          .checkContainerExistance(containerName)
          .then((resInspect) => {
            fastify.log.info('deleteFromPluginQueue inspect element result', resInspect.message);
            if (resInspect.message === '404') {
              fastify.log.info('need to throw an error here ');
              throw new Error('404');
            }
            if (resInspect.State.Status !== 'running') {
              idsToDelete.push(pluginIdToDelete[cnt]);
              fastify.log.info('deleteFromPluginQueue not running but container found');
              dock.deleteContainer(containerName).then((deleteReturn) => {
                fastify.log.info('deleteFromPluginQueue delete container result :', deleteReturn);
              });
            }
          })
          .catch((err) => {
            fastify.log.info('inspect element err', err);
            fastify.log.info('deleting from plugin queue ');
            if (err.message === '404') {
              idsToDelete.push(pluginIdToDelete[cnt]);
            }
          })
      );
    }
    Promise.all(promisesArray).then(() => {
      models.plugin_queue
        .findAll({
          where: {
            id: idsToDelete,
          },
        })
        .then((tableData) => {
          tableData.forEach((eachRow) => {
            const folderToDelete = path.join(
              __dirname,
              `../pluginsDataFolder/${eachRow.creator}/${eachRow.id}`
            );
            if (fs.existsSync(folderToDelete)) {
              fs.remove(folderToDelete, { recursive: true });
            }
            fastify.log.info('folder to delete :', folderToDelete);
          });
        })
        .then(() => {
          // delete plugin subquue rows which contain plugin_queue id
          models.plugin_subqueue
            .destroy({
              where: {
                parent_qid: idsToDelete,
              },
            })
            .then(() => {
              models.plugin_queue
                .destroy({
                  where: {
                    id: idsToDelete,
                  },
                })
                .then(() => {
                  reply.code(200).send(idsToDelete);
                })
                .catch((err) => {
                  reply
                    .code(500)
                    .send(
                      new InternalError(
                        'Something went wrong while deleting the process from queue',
                        err
                      )
                    );
                });
            });
        })
        .catch(
          (err) =>
            new InternalError(
              'Something went wrong while getting all process to delete from queue',
              err
            )
        );
    });
  });
  fastify.decorate('addPluginsToQueue', (request, reply) => {
    // plugin queue table, column status can have these string values: waiting, running, ended,error, added
    // plugin queue table column plugin_parametertype  can have these string values: default, project, template, runtime

    const promisesCreateForEachAnnotation = [];

    const queueObjects = request.body;

    // if each aim is a plugin process
    if (queueObjects.processMultipleAims === 0) {
      const tempAims = { ...queueObjects.aims };
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, value] of Object.entries(tempAims)) {
        const newAimObject = {};
        newAimObject[key] = value;

        promisesCreateForEachAnnotation.push(
          models.plugin_queue.create({
            plugin_id: queueObjects.pluginDbId,
            project_id: queueObjects.projectDbId,
            template_id: -1,
            plugin_parametertype: queueObjects.parameterType,
            creator: request.epadAuth.username,
            status: 'added',
            runtime_params: queueObjects.runtimeParams,
            aim_uid: newAimObject,
            starttime: '1970-01-01 00:00:01',
            endtime: '1970-01-01 00:00:01',
          })
        );
      }

      Promise.all(promisesCreateForEachAnnotation)
        .then((queuedata) => {
          reply.code(200).send(queuedata);
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError(
                'Something went wrong while adding each selected annotation to the plugin queue',
                err
              )
            );
        });
    } else {
      // if all aims are sent to same plugin process
      models.plugin_queue
        .create({
          plugin_id: queueObjects.pluginDbId,
          project_id: queueObjects.projectDbId,
          template_id: -1,
          plugin_parametertype: queueObjects.parameterType,
          creator: request.epadAuth.username,
          status: 'added',
          runtime_params: queueObjects.runtimeParams,
          aim_uid: queueObjects.aims,
          starttime: '1970-01-01 00:00:01',
          endtime: '1970-01-01 00:00:01',
        })
        .then((queuedata) => {
          reply.code(200).send(queuedata);
        })
        .catch((err) => {
          reply
            .code(500)
            .send(
              new InternalError(
                'Something went wrong while adding plugin process to the queue',
                err
              )
            );
        });
    }
  });

  fastify.decorate('insertPluginSubqueue', (request, reply) => {
    const subQueueObj = request.body;
    models.plugin_subqueue
      .create({
        qid: subQueueObj.qid,
        parent_qid: subQueueObj.parent_qid,
        status: subQueueObj.status,
        creator: request.epadAuth.username,
      })
      .then((inserteddata) => {
        reply.code(200).send(inserteddata);
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError(
              'Something went wrong while adding parent plugin for the plugin flow',
              err
            )
          );
      });
  });

  fastify.decorate('pluginCopyAimsBetweenPlugins', (request, reply) => {
    const { fromid, toid } = request.params;
    models.plugin_queue
      .findOne({
        where: { id: fromid },
        required: false,
      })
      .then((eachRowObj) => {
        if (request.epadAuth.admin === true || request.epadAuth.username === eachRowObj.creator) {
          models.plugin_queue
            .update(
              {
                aim_uid: eachRowObj.aim_uid,
              },
              {
                where: {
                  id: toid,
                },
              }
            )
            .then(() => {
              reply.code(200).send();
            })
            .catch((err) => new InternalError('pluginCopyAimsBetweenPlugins error', err));
        } else {
          reply
            .code(401)
            .send(
              new InternalError(
                `copy aims from parent plugin: user doesn't have the necessary right `,
                ''
              )
            );
        }
      })
      .catch((err) => {
        reply.code(500).send(new InternalError(`pluginCopyAimsBetweenPlugins error `, err));
      });
  });

  fastify.decorate('deletePluginSubqueue', (request, reply) => {
    const rowToDelete = request.params.id;

    models.plugin_subqueue
      .destroy({
        where: {
          id: rowToDelete,
        },
      })
      .then(() => {
        reply.code(200).send('plugin deleted from the subqueue');
      })
      .catch((err) => {
        reply
          .code(500)
          .send(
            new InternalError('Something went wrong while deleting plugin from the subqueue', err)
          );
      });
  });

  fastify.decorate('getPluginParentsInQueue', (request, reply) => {
    const result = [];
    const { qid } = request.params;
    models.plugin_subqueue
      .findAll({
        where: { qid },
        required: false,
      })
      .then((eachRowObj) => {
        eachRowObj.forEach((data) => {
          const pluginObj = {
            id: data.dataValues.id,
            qid: data.dataValues.qid,
            parent_qid: data.dataValues.parent_qid,
            status: data.dataValues.status,
            creator: data.dataValues.creator,
          };
          if (request.epadAuth.admin === true || request.epadAuth.username === pluginObj.creator) {
            result.push(pluginObj);
          }
        });

        reply.code(200).send(result);
      })
      .catch((err) => {
        reply.code(500).send(new InternalError(`getPluginParentsInQueue error `, err));
      });
  });

  fastify.decorate('getPluginsQueue', (request, reply) => {
    const result = [];
    models.plugin_queue
      .findAll({
        include: ['queueplugin', 'queueproject'],
        required: false,
      })
      .then((eachRowObj) => {
        eachRowObj.forEach((data) => {
          const pluginObj = {
            id: data.dataValues.id,
            plugin_id: data.dataValues.plugin_id,
            project_id: data.dataValues.project_id,
            plugin_parametertype: data.dataValues.plugin_parametertype,
            aim_uid: data.dataValues.aim_uid,
            runtime_params: data.dataValues.runtime_params,
            max_memory: data.dataValues.max_memory,
            status: data.dataValues.status,
            creator: data.dataValues.creator,
            starttime: data.dataValues.starttime,
            endtime: data.dataValues.endtime,
          };
          if (data.dataValues.queueplugin !== null) {
            pluginObj.plugin = { ...data.dataValues.queueplugin.dataValues };
          }
          if (data.dataValues.queueproject !== null) {
            pluginObj.project = { ...data.dataValues.queueproject.dataValues };
          }
          if (request.epadAuth.admin === true || request.epadAuth.username === pluginObj.creator) {
            result.push(pluginObj);
          }
        });

        reply.code(200).send(result);
      })
      .catch((err) => {
        reply.code(500).send(new InternalError(`getPluginsQueue error `, err));
      });
  });
  fastify.decorate('stopPluginsQueue', async (request, reply) => {
    const queueIds = [...request.body];
    fastify.log.info('queueIds', queueIds);
    const dock = new DockerService(fs, fastify, path);
    const containerLists = await dock.listContainers();
    let containerFound = false;
    reply.code(202).send();
    for (let cnt = 0; cnt < queueIds.length; cnt += 1) {
      const containerName = `/epadplugin_${queueIds[cnt]}`;
      let containerId = null;
      let queuid = null;

      for (let i = 0; i < containerLists.length; i += 1) {
        if (containerLists[i].names.includes(containerName)) {
          if (containerLists[i].state === 'running') {
            containerFound = true;
            containerId = containerLists[i].id;
            queuid = queueIds[cnt];
            break;
          }
        }
      }
      if (containerFound === true) {
        // eslint-disable-next-line no-await-in-loop
        await fastify.updateStatusQueueProcessInternal(queuid, 'stopping');
        new EpadNotification(
          request,
          `container: ${containerName} is stopping the process `,
          'success',
          true
        ).notify(fastify);
        containerFound = false;
        fastify.log.info(`container name found  stopping : ${containerName}`);
        // eslint-disable-next-line no-await-in-loop
        const returnContainerStop = await dock.stopContainer(containerId);
        fastify.log.info(`container stopped : ${returnContainerStop}`);
        // eslint-disable-next-line no-await-in-loop
        await fastify.updateStatusQueueProcessInternal(queuid, 'ended');
        new EpadNotification(
          request,
          `container: ${containerName} has ended processing`,
          'success',
          true
        ).notify(fastify);
      } else {
        for (let queueIdCnt = 0; queueIdCnt < queueIds.length; queueIdCnt += 1) {
          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueIds[queueIdCnt], 'ended');
          new EpadNotification(
            request,
            `container: epadplugin_${queueIds[queueIdCnt]} has ended processing`,
            'success',
            true
          ).notify(fastify);
        }
      }
    }
  });
  fastify.decorate('runPluginsQueue', async (request, reply) => {
    //  will receive a queue object which contains plugin id
    let queueIdsArrayToStart = null;
    let sequence = false;
    if (typeof request.body.ids === 'undefined') {
      queueIdsArrayToStart = request.body;
    } else {
      queueIdsArrayToStart = request.body.ids;
    }
    if (typeof request.body.sequence !== 'undefined') {
      sequence = request.body.sequence;
    }

    // const allStatus = ['added', 'ended', 'error', 'running', 'inqueue'];
    const allStatus = ['added', 'ended', 'error'];
    try {
      reply.code(202).send(`runPluginsQueue called and retuened 202 inernal queue is started`);

      const tableData = await models.plugin_queue.findAll({
        include: ['queueplugin', 'queueproject'],
        where: { id: queueIdsArrayToStart, status: allStatus },
      });
      const seqresult = [];
      for (let i = 0; i < tableData.length; i += 1) {
        const data = tableData[i];
        const nonseqresult = [];
        const pluginObj = {
          id: data.dataValues.id,
          plugin_id: data.dataValues.plugin_id,
          project_id: data.dataValues.project_id,
          plugin_parametertype: data.dataValues.plugin_parametertype,
          aim_uid: data.dataValues.aim_uid,
          runtime_params: data.dataValues.runtime_params,
          max_memory: data.dataValues.max_memory,
          status: data.dataValues.status,
          creator: data.dataValues.creator,
          starttime: data.dataValues.starttime,
          endtime: data.dataValues.endtime,
        };
        if (data.dataValues.queueplugin !== null) {
          pluginObj.plugin = { ...data.dataValues.queueplugin.dataValues };
        }
        if (data.dataValues.queueproject !== null) {
          pluginObj.project = { ...data.dataValues.queueproject.dataValues };
        }
        try {
          const dock = new DockerService(fs, fastify, path);
          const containerName = `epadplugin_${pluginObj.id}`;
          // eslint-disable-next-line no-await-in-loop
          const resInspect = await dock.checkContainerExistance(containerName);
          if (resInspect.message === '404') {
            fastify.log.info('not a real error. Container has not found so we can create new one');
            nonseqresult.push(pluginObj);
            seqresult.push(pluginObj);
            if (!sequence) {
              fastify.runPluginsQueueInternal(nonseqresult, request);
            }
          } else {
            fastify.log.info(`container is not running : ${containerName}`);
            dock.deleteContainer(containerName).then((deleteReturn) => {
              fastify.log.info(`delete container result :${deleteReturn}`);
              nonseqresult.push(pluginObj);
              seqresult.push(pluginObj);
              if (!sequence) {
                fastify.runPluginsQueueInternal(nonseqresult, request);
              }
            });
          }
        } catch (err) {
          fastify.log.info(`error happened while adding queue object : ${err}`);
        }
      }
      if (sequence) {
        const removeIds = [];
        const indicetoremove = [];
        for (let i = 0; i < seqresult.length; i += 1) {
          if (!globalMapQueueById.has(seqresult[i].id)) {
            globalMapQueueById.set(seqresult[i].id, '');
          } else {
            removeIds.push(seqresult[i].id);
          }
        }

        for (let i = 0; removeIds.length; i += 1) {
          for (let k = 0; seqresult.length; k += 1) {
            if (seqresult[k].id === removeIds[i]) {
              seqresult[k] = { id: -1 };
              indicetoremove.push(k);
            }
          }
        }
        for (let k = 0; indicetoremove.length; k += 1) {
          seqresult.slice(indicetoremove[k], 1);
        }
        await fastify.runPluginsQueueInternal(seqresult, request);
      }
    } catch (err) {
      fastify.log.error(`runPluginsQueue error : ${err}`);
    }
  });

  fastify.decorate('runNextPluginInSubQueueInternal', async (paramQid, request) => {
    /* 
      This function is used to run sub child plugins when ever the parent plugin terminates its process.
      it does not return any values. it receives parent plugin id (paramQid) to look in the subqueue if it exist a child proces.
      if there are exising child processes the collected child ids are sent to runpluginsQueue function which is the main function to run the queue. 
    */
    const result = [];
    try {
      return await models.plugin_subqueue
        .findAll({
          where: { parent_qid: paramQid, status: 0 },
        })
        .then(async (tableData) => {
          tableData.forEach((data) => {
            const queueObj = {
              id: data.dataValues.id,
              qid: data.dataValues.qid,
              parent_qid: data.dataValues.parent_qid,
              status: data.dataValues.status,
              creator: data.dataValues.creator,
            };
            result.push(queueObj.qid);
          });
          if (result.length > 0) {
            await models.plugin_queue
              .findAll({
                include: ['queueplugin', 'queueproject'],
                where: { id: result },
              })
              .then((queueData) => {
                queueData.forEach((data) => {
                  const qresult = [];
                  const pluginObj = {
                    id: data.dataValues.id,
                    plugin_id: data.dataValues.plugin_id,
                    project_id: data.dataValues.project_id,
                    plugin_parametertype: data.dataValues.plugin_parametertype,
                    aim_uid: data.dataValues.aim_uid,
                    runtime_params: data.dataValues.runtime_params,
                    max_memory: data.dataValues.max_memory,
                    status: data.dataValues.status,
                    creator: data.dataValues.creator,
                    starttime: data.dataValues.starttime,
                    endtime: data.dataValues.endtime,
                  };
                  if (data.dataValues.queueplugin !== null) {
                    pluginObj.plugin = { ...data.dataValues.queueplugin.dataValues };
                  }
                  if (data.dataValues.queueproject !== null) {
                    pluginObj.project = { ...data.dataValues.queueproject.dataValues };
                  }
                  qresult.push(pluginObj);
                  fastify.runPluginsQueueInternal(qresult, request);
                });
              });
            return 200;
          }
          return 404;
        });
    } catch (err) {
      fastify.log.error(`runPluginsQueue error : ${err}`);
      return 404;
    }
  });
  //  internal functions
  fastify.decorate('getPluginProjectParametersInternal', (pluginid, projectid) => {
    const parameters = [];
    return models.plugin_projectparameters
      .findAll({
        where: { plugin_id: pluginid, project_id: projectid },
      })
      .then((result) => {
        result.forEach((parameter) => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
            project_id: parameter.dataValues.project_id,
            paramid: parameter.dataValues.paramid,
            name: parameter.dataValues.name,
            format: parameter.dataValues.format,
            prefix: parameter.dataValues.prefix,
            inputBinding: parameter.dataValues.inputBinding,
            default_value: parameter.dataValues.default_value,
            creator: parameter.dataValues.creator,
            createdtime: parameter.dataValues.createdtime,
            updatetime: parameter.dataValues.updatetime,
            updated_by: parameter.dataValues.updated_by,
            type: parameter.dataValues.type,
            description: parameter.dataValues.description,
          };

          parameters.push(parameterObj);
        });
        return parameters;
      })
      .catch((err) => new InternalError('error while getPluginProjectParametersInternal', err));
  });
  fastify.decorate('getPluginDeafultParametersInternal', (pluginid) => {
    const parameters = [];
    return models.plugin_parameters
      .findAll({
        where: { plugin_id: pluginid },
      })
      .then((result) => {
        result.forEach((parameter) => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
            paramid: parameter.dataValues.paramid,
            name: parameter.dataValues.name,
            sendname: parameter.dataValues.sendname,
            uploadimages: parameter.dataValues.uploadimages,
            uploadaims: parameter.dataValues.uploadaims,
            sendparamtodocker: parameter.dataValues.sendparamtodocker,
            refreshdicoms: parameter.dataValues.refreshdicoms,
            format: parameter.dataValues.format,
            prefix: parameter.dataValues.prefix,
            inputBinding: parameter.dataValues.inputBinding,
            default_value: parameter.dataValues.default_value,
            creator: parameter.dataValues.creator,
            createdtime: parameter.dataValues.createdtime,
            updatetime: parameter.dataValues.updatetime,
            updated_by: parameter.dataValues.updated_by,
            type: parameter.dataValues.type,
            description: parameter.dataValues.description,
          };

          parameters.push(parameterObj);
        });
        return parameters;
      })
      .catch((err) => new InternalError('error while getPluginDeafultParametersInternal', err));
  });
  fastify.decorate(
    'createPluginfoldersInternal',
    (pluginparams, userfolder, aims, projectid, projectdbid, processmultipleaims, request) =>
      new Promise(async (resolve, reject) => {
        let tempPluginparams = null;
        if (Array.isArray(pluginparams)) {
          tempPluginparams = [...pluginparams];
        } else {
          const tempKeyArray = Object.keys(pluginparams);
          const temValuesArray = [];

          for (let i = 0; i < tempKeyArray.length; i += 1) {
            temValuesArray.push(pluginparams[tempKeyArray[i]]);
          }
          tempPluginparams = [...temValuesArray];
        }

        for (let i = 0; i < tempPluginparams.length; i += 1) {
          // output folder
          if (tempPluginparams[i].format === 'OutputFolder') {
            try {
              const outputfolder = `${userfolder}/${tempPluginparams[i].paramid}/`;
              fastify.log.info(`create plguin folders -> outputfolder : ${outputfolder}`);
              if (!fs.existsSync(outputfolder)) {
                fs.mkdirSync(outputfolder, { recursive: true });
              } else {
                fs.rmdirSync(outputfolder, { recursive: true });
                fs.mkdirSync(outputfolder, { recursive: true });
              }
            } catch (err) {
              reject(err);
            }
          }
          // outputfolder end
          if (tempPluginparams[i].format === 'InputFolder') {
            // get selected aims
            if (
              tempPluginparams[i].paramid === 'aims' &&
              Object.keys(aims).length > 0 &&
              typeof processmultipleaims !== 'object'
            ) {
              try {
                // eslint-disable-next-line no-await-in-loop
                const source = await fastify.getAimsInternal(
                  'stream',
                  {},
                  { aims: Object.keys(aims) },
                  request.epadAuth
                );
                const inputfolder = `${userfolder}/${tempPluginparams[i].paramid}/`;
                fastify.log.info(`create plguin folders -> inputfolder : ${inputfolder}`);
                if (!fs.existsSync(inputfolder)) {
                  fs.mkdirSync(inputfolder, { recursive: true });
                } else {
                  fs.rmdirSync(inputfolder, { recursive: true });
                  fs.mkdirSync(inputfolder, { recursive: true });
                }

                const writeStream = fs.createWriteStream(`${inputfolder}annotations.zip`);

                source
                  .pipe(writeStream)
                  // eslint-disable-next-line no-loop-func
                  .on('close', () => {
                    fastify.log.info(
                      `Aims zip copied to aims folder ${inputfolder}annotations.zip`
                    );

                    extractZip(`${inputfolder}annotations.zip`, { dir: `${inputfolder}` })
                      .then(() => {
                        fastify.log.info(`${inputfolder}annotations.zip extracted`);
                        fs.remove(`${inputfolder}annotations.zip`, (error) => {
                          if (error) {
                            fastify.log.info(
                              `Zip annotations.zip file deletion error ${error.message}`
                            );
                            reject(error);
                          } else {
                            fastify.log.info(`${inputfolder}annotations.zip deleted`);
                          }
                        });
                      })
                      .catch((error) => {
                        reject(
                          new InternalError(`Extracting zip ${inputfolder}annotations.zip`, error)
                        );
                      });
                  })
                  // eslint-disable-next-line no-loop-func
                  .on('error', (error) => {
                    reject(new InternalError(`Copying zip ${inputfolder}annotations.zip`, error));
                  });
              } catch (err) {
                reject(err);
              }
            }
            // get dicoms (series level)
            if (tempPluginparams[i].paramid === 'dicoms') {
              const inputfolder = `${userfolder}/${pluginparams[i].paramid}/`;
              fastify.log.info(`creating dicoms in this folder : ${inputfolder}`);
              let isItFirstTimeGettingDicoms = false;
              try {
                if (!fs.existsSync(inputfolder)) {
                  fs.mkdirSync(inputfolder, { recursive: true });
                  isItFirstTimeGettingDicoms = true;
                }

                if (typeof processmultipleaims !== 'object' && Object.keys(aims).length > 0) {
                  // aim level dicoms
                  if (tempPluginparams[i].refreshdicoms === 1 || isItFirstTimeGettingDicoms) {
                    if (fs.existsSync(inputfolder)) {
                      fs.rmdirSync(inputfolder, { recursive: true });
                      fs.mkdirSync(inputfolder, { recursive: true });
                    }
                    const aimsKeysLength = Object.keys(aims).length;
                    const aimsKeys = Object.keys(aims);
                    for (let aimsCnt = 0; aimsCnt < aimsKeysLength; aimsCnt += 1) {
                      const eacAimhObj = aims[aimsKeys[aimsCnt]];
                      fastify.log.info(`getting dicoms for aim : ${eacAimhObj}`);
                      // eslint-disable-next-line no-await-in-loop
                      const returnSerieFolder = await fastify.prepSeriesDownload(
                        request.headers.origin,
                        {
                          project: projectid,
                          subject: eacAimhObj.subjectID,
                          study: eacAimhObj.studyUID,
                          series: eacAimhObj.seriesUID,
                        },
                        { format: 'stream', includeAims: 'true' },
                        request.epadAuth,
                        'undefined',
                        '', // added for seriesinfo
                        true // added for return folder
                      );
                      const returnSerieFolderFullPath = path.join(
                        __dirname,
                        `../${returnSerieFolder}`
                      );
                      try {
                        const foldersListSource = fs.readdirSync(returnSerieFolderFullPath);
                        for (
                          let foldecount = 0;
                          foldecount < foldersListSource.length;
                          foldecount += 1
                        ) {
                          fs.copySync(
                            `${returnSerieFolderFullPath}/${foldersListSource[foldecount]}`,
                            `${inputfolder}/`
                          );
                        }

                        fastify.log.info(`copying folder ${returnSerieFolderFullPath} succeed`);
                      } catch (err) {
                        fastify.log.error(
                          `file copy from ${returnSerieFolderFullPath} encountered error: -> ${err}`
                        );
                        reject(
                          new InternalError(
                            `file copy from ${returnSerieFolderFullPath} encountered error`,
                            err
                          )
                        );
                      }
                      try {
                        fs.removeSync(`${returnSerieFolderFullPath}`);
                        fastify.log.info(
                          `removing series folder from tmp : ${returnSerieFolderFullPath} succeed`
                        );
                      } catch (err) {
                        fastify.log.error(
                          `removing series folder from tmp: ${returnSerieFolderFullPath} encountered error -> ${err}`
                        );
                        reject(
                          new InternalError(
                            `removing series folder from tmp ${returnSerieFolderFullPath} encountered error`,
                            err
                          )
                        );
                      }
                    } // req inputs : reqOrigin, params, query, epadAuth, output, seriesInfos, returnFolder
                  }
                } else {
                  // project level dicoms
                  // eslint-disable-next-line no-lonely-if
                  if (tempPluginparams[i].refreshdicoms === 1 || isItFirstTimeGettingDicoms) {
                    //  if dicoms folder exist already don't get imgaes again
                    fastify.log.info(
                      `calling prep download for project level files/folders for { project: projectid } : ${projectid} - {project_id: projectdbid} : ${projectdbid}`
                    );
                    if (fs.existsSync(inputfolder)) {
                      fs.rmdirSync(inputfolder, { recursive: true });
                      fs.mkdirSync(inputfolder, { recursive: true });
                    }
                    // eslint-disable-next-line no-await-in-loop
                    const dicomPath = await fastify.prepProjectDownload(
                      request.headers.origin,
                      { project: projectid },
                      { format: 'stream', includeAims: 'false' },
                      request.epadAuth,
                      'undefined',
                      {
                        project_id: projectdbid,
                      },
                      true
                    );
                    const pathFrom = path.join(__dirname, `../${dicomPath}/${projectid}`);
                    try {
                      fs.moveSync(`${pathFrom}`, `${inputfolder}`, { overwrite: true });
                      fastify.log.info(`copying folder ${pathFrom} succeed`);
                    } catch (err) {
                      fastify.log.error(`file copy from ${pathFrom} encountered error: -> ${err}`);
                      reject(
                        new InternalError(`file copy from ${pathFrom} encountered error`, err)
                      );
                    }
                    try {
                      fs.removeSync(`${pathFrom}`);
                      fastify.log.info(`removing folder ${pathFrom} succeed`);
                    } catch (err) {
                      fastify.log.error(`removing folder ${pathFrom} encountered error -> ${err}`);
                      reject(
                        new InternalError(`removing folder ${pathFrom} encountered error`, err)
                      );
                    }
                    fastify.log.info(`tmp folder location to move to the container : ${pathFrom}`);
                    fastify.log.info(
                      `full path for tmp folder location : ${__dirname}/${dicomPath}`
                    );
                    fastify.log.info(
                      `plugin Params used for the plugin process : ${JSON.stringify(
                        tempPluginparams[i]
                      )}`
                    );
                    fastify.log.info(
                      `moving tmp folder content to the destination : ${inputfolder}`
                    );
                  } else {
                    fastify.log.info(
                      `don't refresh dicoms selected -> skipping prep download for project level files/folders for { project: projectid } : ${projectid} - {project_id: projectdbid} : ${projectdbid}`
                    );
                  }
                }
              } catch (err) {
                reject(err);
              }
            }
          }
        }
        resolve(1);
      })
  );
  fastify.decorate('getUserPluginDataPathInternal', async () => {
    const dock = new DockerService(fs, fastify, path);
    const inspectResultContainerEpadLite = await dock.checkContainerExistance('epad_lite');
    let epadLitePwd = '';
    return new Promise((resolve, reject) => {
      const epadLiteBindPoints = inspectResultContainerEpadLite.HostConfig.Binds;

      for (let cntPoints = 0; cntPoints < epadLiteBindPoints.length; cntPoints += 1) {
        if (epadLiteBindPoints[cntPoints].includes('pluginData')) {
          // eslint-disable-next-line prefer-destructuring
          epadLitePwd = epadLiteBindPoints[cntPoints].split(':')[1];
          // epadLitePwd = epadLitePwd.split(':')[0];
          break;
        }
      }
      if (epadLitePwd === '') {
        reject(new Error(`couldn't find epad_lite container. Please restart epad.`));
      }
      resolve(epadLitePwd);
    });
  });
  fastify.decorate('extractPluginParamtersInternal', (queueObject, request) =>
    new Promise(async (resolve, reject) => {
      const parametertype = queueObject.plugin_parametertype;
      const pluginid = queueObject.plugin_id;
      const projectdbid = queueObject.project_id;
      const pluginnameid = queueObject.plugin.plugin_id;
      const pluginname = queueObject.plugin.name;
      const { projectid } = queueObject.project;
      // eslint-disable-next-line prefer-destructuring
      const processmultipleaims = queueObject.plugin.processmultipleaims;
      const runtimeParams = queueObject.runtime_params;
      const aims = queueObject.aim_uid;
      let paramsToSendToContainer = null;

      const pluginsDataFolder = path.join(
        __dirname,
        `../pluginsDataFolder/${queueObject.creator}/${queueObject.id}`
      );
      if (!fs.existsSync(pluginsDataFolder)) {
        fs.mkdirSync(pluginsDataFolder, { recursive: true });
      }

      // const localServerBindPoint = path.join(
      //   __dirname,
      //   `../pluginsDataFolder/${queueObject.creator}/${queueObject.id}`
      // );

      const pluginsDataFolderlog = path.join(
        __dirname,
        `../pluginsDataFolder/${queueObject.creator}/${queueObject.id}/logs`
      );
      if (!fs.existsSync(`${pluginsDataFolderlog}`)) {
        fs.mkdirSync(`${pluginsDataFolderlog}`);
      }
      // this part is important to define auto created containers bindpoint related to user's computer path
      // here relative path does not work since epad_lite relative path will be different than auto created containers
      // this means /home/node/app does not exist in the created containrs by the plugin
      const dock = new DockerService(fs, fastify, path);
      const inspectResultContainerEpadLite = await dock.checkContainerExistance('epad_lite');
      const epadLiteBindPoints = inspectResultContainerEpadLite.HostConfig.Binds;
      let epadLitePwd = '';
      fastify.log.info(`getting epad_lite bind points to reflect : ${epadLiteBindPoints}`);
      for (let cntPoints = 0; cntPoints < epadLiteBindPoints.length; cntPoints += 1) {
        if (epadLiteBindPoints[cntPoints].includes('pluginData')) {
          epadLitePwd = epadLiteBindPoints[cntPoints];
          break;
        }
      }
      const tmpLocalServerBindPoint = epadLitePwd.split(':')[0];
      // this part is important
      // below part is necessary for local development out of the container
      //  const localServerBindPoint = pluginsDataFolder;
      // comment out above command and uncomment below line before pushing to git
      const localFullPathBindPoint = `${tmpLocalServerBindPoint}/${queueObject.creator}/${queueObject.id}`;
      //  pluginsDataFolder = localFullPathBindPoint;
      fastify.log.info(`getting epad_lite bind points and pwd local : ${localFullPathBindPoint}`);
      if (parametertype === 'default') {
        try {
          paramsToSendToContainer = await fastify.getPluginDeafultParametersInternal(pluginid);
          await fastify.createPluginfoldersInternal(
            paramsToSendToContainer,
            pluginsDataFolder,
            aims,
            projectid,
            projectdbid,
            processmultipleaims,
            request
          );
          const returnObject = {
            params: paramsToSendToContainer,
            serverfolder: localFullPathBindPoint,
            relativeServerFolder: pluginsDataFolder,
            projectid,
            projectdbid,
            pluginnameid,
            pluginname,
          };
          resolve(returnObject);
        } catch (err) {
          reject(new InternalError('error while getting plugin default paraeters', err));
        }
      }

      if (parametertype === 'project') {
        try {
          paramsToSendToContainer = await fastify.getPluginProjectParametersInternal(
            pluginid,
            projectdbid
          );

          await fastify.createPluginfoldersInternal(
            paramsToSendToContainer,
            pluginsDataFolder,
            aims,
            projectid,
            projectdbid,
            processmultipleaims,
            request
          );
          const returnObject = {
            params: paramsToSendToContainer,
            serverfolder: localFullPathBindPoint,
            relativeServerFolder: pluginsDataFolder,
            projectid,
            projectdbid,
            pluginnameid,
            pluginname,
          };
          resolve(returnObject);
        } catch (err) {
          reject(new InternalError('error while getting plugin project paraeters', err));
        }
      }

      if (parametertype === 'runtime') {
        if (processmultipleaims === null || processmultipleaims === 1) {
          paramsToSendToContainer = runtimeParams;
        } else {
          paramsToSendToContainer = aims[Object.keys(aims)[0]].pluginparamters;
        }
        try {
          await fastify.createPluginfoldersInternal(
            paramsToSendToContainer,
            pluginsDataFolder,
            aims,
            projectid,
            projectdbid,
            processmultipleaims,
            request
          );
          const returnObject = {
            params: paramsToSendToContainer,
            serverfolder: localFullPathBindPoint,
            relativeServerFolder: pluginsDataFolder,
            projectid,
            projectdbid,
            pluginnameid,
            pluginname,
          };
          resolve(returnObject);
        } catch (err) {
          reject(new InternalError('error while getting plugin runtime paraeters', err));
        }
      }
    }).catch((err) => new Error(err))
  );

  fastify.decorate('updateStatusQueueProcessInternal', (queuid, status) => {
    let tempTime = '1970-01-01 00:00:01';
    const dateIbj = {};
    if (status === 'running') {
      tempTime = Date.now();
      dateIbj.starttime = tempTime;
    }
    if (status === 'ended' || status === 'error') {
      tempTime = Date.now();
      dateIbj.endtime = tempTime;
    }
    if (status === 'waiting') {
      models.plugin_queue
        .update(
          {
            status,
            starttime: Date.now(),
            endtime: tempTime,
          },
          {
            where: {
              id: queuid,
            },
          }
        )
        .then((data) => data)
        .catch(
          (err) => new InternalError('error while updating queue process status for waiting', err)
        );
    }
    if (status === 'running') {
      models.plugin_queue
        .update(
          {
            status,
          },
          {
            where: {
              id: queuid,
            },
          }
        )
        .then((data) => data)
        .catch(
          (err) => new InternalError('error while updating queue process status for running', err)
        );
    }
    if (status === 'inqueue') {
      models.plugin_queue
        .update(
          {
            status,
          },
          {
            where: {
              id: queuid,
            },
          }
        )
        .then((data) => data)
        .catch(
          (err) => new InternalError('error while updating queue process status for running', err)
        );
    }
    if (status === 'ended' || status === 'error') {
      models.plugin_queue
        .update(
          {
            status,
            endtime: Date.now(),
          },
          {
            where: {
              id: queuid,
            },
          }
        )
        .then((data) => data)
        .catch(
          (err) =>
            new InternalError('error while updating queue process status for ended or error', err)
        );
    }
    if (status === 'stopping') {
      fastify.log.info(`db is writing status for the plugin : ${status} `);
      models.plugin_queue
        .update(
          {
            status,
          },
          {
            where: {
              id: queuid,
            },
          }
        )
        .then((data) => data)
        .catch(
          (err) => new InternalError('error while updating queue process status for stopping', err)
        );
    }
  });

  fastify.decorate(
    'sortPluginParamsAndExtractWhatToMapInternal',
    async (pluginParamsObj) =>
      new Promise(async (resolve, reject) => {
        try {
          let tempPluginParams = null;
          if (Array.isArray(pluginParamsObj.params)) {
            tempPluginParams = [...pluginParamsObj.params];
          } else {
            const tempKeyArray = Object.keys(pluginParamsObj.params);
            const temValuesArray = [];

            for (let i = 0; i < tempKeyArray.length; i += 1) {
              temValuesArray.push(pluginParamsObj.params[tempKeyArray[i]]);
            }
            tempPluginParams = [...temValuesArray];
          }

          const tempLocalFolder = pluginParamsObj.serverfolder;

          // eslint-disable-next-line prefer-arrow-callback
          tempPluginParams.sort((first, second) => {
            if (first.inputBinding === '' && second.inputBinding === '') {
              return -1;
            }
            if (first.inputBinding !== '' && second.inputBinding !== '') {
              if (parseInt(first.inputBinding, 10) < parseInt(second.inputBinding, 10)) {
                return -1;
              }

              return 1;
            }
            if (first.inputBinding === '' && second.inputBinding !== '') {
              return -1;
            }
            if (first.inputBinding !== '' && second.inputBinding === '') {
              return 1;
            }

            return 0;
          });
          const onlyNameValues = [];
          const foldersToBind = [];
          for (let i = 0; i < tempPluginParams.length; i += 1) {
            if (
              tempPluginParams[i].format === 'InputFolder' ||
              tempPluginParams[i].format === 'OutputFolder'
            ) {
              if (tempPluginParams[i].default_value !== '') {
                foldersToBind.push(
                  `${tempLocalFolder}/${tempPluginParams[i].paramid}:${tempPluginParams[i].default_value}`
                );
              }
            }
            if (tempPluginParams[i].paramid === 'parameters') {
              if (tempPluginParams[i].sendparamtodocker === 1) {
                if (tempPluginParams[i].prefix !== '') {
                  onlyNameValues.push(tempPluginParams[i].prefix);
                }
                if (tempPluginParams[i].name !== '' && tempPluginParams[i].sendname !== 0) {
                  onlyNameValues.push(tempPluginParams[i].name);
                }
                if (tempPluginParams[i].default_value !== '') {
                  onlyNameValues.push(tempPluginParams[i].default_value);
                }
              }
            }
          }
          const returnObj = {
            paramsDocker: onlyNameValues,
            dockerFoldersToBind: foldersToBind,
          };

          return resolve(returnObj);
        } catch (err) {
          return reject(
            new InternalError('error sortPluginParamsAndExtractWhatToMapInternal', err)
          );
        }
      })
  );

  fastify.decorate('downloadPluginResult', (request, reply) => {
    const queueObject = request.body;
    const outputPath = `${queueObject.creator}/${queueObject.id}/output/`;
    const dest = path.join(__dirname, `../pluginsDataFolder/${outputPath}`);
    fastify.writeHead(`${queueObject.name}.output.zip`, reply.raw, request.headers.origin);

    const archive = archiver('zip', {
      zlib: { level: 9 }, // Sets the compression level.
    });

    // eslint-disable-next-line func-names
    // eslint-disable-next-line prefer-arrow-callback
    archive.on('error', function (err) {
      throw err;
    });

    archive.directory(dest, false);
    archive.finalize();
    archive.pipe(reply.raw);
  });

  fastify.decorate('findFilesAndSubfilesInternal', (dirParam, fileArrayParam, extensionParam) => {
    const infuncfileArray = fs.readdirSync(dirParam);
    let cumfileArrayParam = [];
    if (Array.isArray(fileArrayParam)) {
      cumfileArrayParam = fileArrayParam;
    }

    for (let i = 0; i < infuncfileArray.length; i += 1) {
      if (fs.statSync(`${dirParam}/${infuncfileArray[i]}`).isDirectory()) {
        cumfileArrayParam = fastify.findFilesAndSubfilesInternal(
          `${dirParam}/${infuncfileArray[i]}`,
          cumfileArrayParam,
          extensionParam
        );
      } else {
        const ext = infuncfileArray[i].split('.');

        if (extensionParam === ext[ext.length - 1] || extensionParam === '') {
          cumfileArrayParam.push({ path: dirParam, file: infuncfileArray[i] });
        }
      }
    }
    return cumfileArrayParam;
  });
  // we mey need to transpose calculations.csv columns and rows depending on the params given for the plugin
  fastify.decorate(
    'pluginTransposeCsv',
    async (csvPath, csvFile) =>
      new Promise((resolve, reject) => {
        const csvLines = [];
        const tmpTransposedFileName = 'tempTransposedcsv.csv';
        let rowNumForSegid = -1;
        try {
          if (fs.existsSync(`${csvPath}/${tmpTransposedFileName}`)) {
            fs.unlinkSync(`${csvPath}/${tmpTransposedFileName}`);
          }
        } catch (e) {
          reject(
            new InternalError(
              `error happened while removing temporary calculation file ${tmpTransposedFileName}`,
              e
            )
          );
        }
        fs.createReadStream(`${csvPath}/${csvFile}`)
          .pipe(csv({ skipLines: 0, headers: [] }))
          .on('data', (data) => {
            csvLines.push(Object.values(data));
          })
          .on('end', () => {
            const dsoIds = [];
            for (let k = 0; k < csvLines[0].length; k += 1) {
              let aLineString = '';
              let dontAdd = false;

              for (let i = 0; i < csvLines.length; i += 1) {
                if (rowNumForSegid > -1 && rowNumForSegid === k) {
                  dsoIds.push(csvLines[i][rowNumForSegid]);
                }
                if (csvLines[i][k] === 'Segmentation UID') {
                  fastify.log.info(
                    `looking for seg uid column number: ',${i}.${k},${csvLines[i][k]}`
                  );
                  fastify.log.info(`seg uid column no: ${k}`);
                  rowNumForSegid = k;
                }
                if (i < csvLines.length - 1) {
                  aLineString = `${aLineString}"${csvLines[i][k]}",`;
                } else {
                  aLineString = `${aLineString}"${csvLines[i][k]}"\n`;
                }
                if (
                  csvLines[0][k] === 'Series UID' ||
                  csvLines[0][k] === 'Mask' ||
                  csvLines[0][k] === 'Image' ||
                  csvLines[0][k] === 'Accession Number' ||
                  csvLines[0][k] === 'Study UID' ||
                  csvLines[0][k] === 'Patient ID' ||
                  csvLines[0][k] === 'Patient Name' ||
                  csvLines[0][k] === 'PyRadiomics Version' ||
                  csvLines[0][k] === 'DSO Desc' ||
                  csvLines[0][k] === 'Segmentation UID' ||
                  csvLines[0][k] === 'DSOSeries UID'
                ) {
                  dontAdd = true;
                }
              }
              if (dontAdd === false) {
                fs.appendFileSync(`${csvPath}/${tmpTransposedFileName}`, aLineString);
              }
            }
            fs.renameSync(`${csvPath}/${csvFile}`, `${csvPath}/${csvFile}_old`);
            if (fs.existsSync(`${csvPath}/${tmpTransposedFileName}`)) {
              fs.renameSync(`${csvPath}/${tmpTransposedFileName}`, `${csvPath}/${csvFile}`);
            } else {
              reject(
                new InternalError(
                  `error happened; ${tmpTransposedFileName} file does not exist in output folder`,
                  ''
                )
              );
            }

            resolve({ lines: csvLines, rownum: rowNumForSegid, dsoids: dsoIds });
          })
          .on('error', (err) => {
            reject(
              new InternalError(
                `error happened while read stream was trying to read from ${csvPath}/${csvFile} file in output folder`,
                err
              )
            );
          });
      })
  );

  //  plugin calculations verify codemaning existance in ontology and add calculations to the user aim part
  fastify.decorate(
    'parseCsvForPluginCalculationsInternal',
    async (csvFileParam, pluginParameters) => {
      const result = [];
      return new Promise(async (resolve, reject) => {
        let transposedCsv = {};
        if (pluginParameters.pluginnameid.includes('pyradiomics')) {
          try {
            transposedCsv = await fastify.pluginTransposeCsv(csvFileParam.path, csvFileParam.file);
          } catch (err) {
            reject(
              new InternalError(
                `error happened while transposing pyradiomics.csv for pyradiomics plugin instance`,
                err
              )
            );
          }
        }
        if (fs.existsSync(`${csvFileParam.path}/${csvFileParam.file}`)) {
          fs.createReadStream(`${csvFileParam.path}/${csvFileParam.file}`)
            .pipe(csv({ skipLines: 0, headers: ['key'] }))
            .on('data', (data) => {
              result.push(data);
            })
            .on('end', () => {
              if (pluginParameters.pluginnameid.includes('pyradiomics')) {
                resolve({
                  resultobj: result,
                  rownumobj: transposedCsv.rownum,
                  alldsoIds: transposedCsv.dsoids,
                });
              } else {
                resolve({ resultobj: result, rownumobj: null, alldsoIds: null });
              }
            })
            .on('error', (err) => {
              reject(
                new InternalError(
                  'error happened while reading plugin calculation csv file in output folder',
                  err
                )
              );
            });
        } else {
          reject(
            new InternalError(
              `error happened while reading ${csvFileParam.path}/${csvFileParam.file} for pyradiomics plugin instance after the transposition`,
              ''
            )
          );
        }
      });
    }
  );
  // below function attaches segmentation and calcuation via CalculationEntityReferencesSegmentationEntityStatement
  fastify.decorate(
    'createImageAnnotationStatementforPluginCalcInternal',
    (partCalcEntity, segEntity, mapCalcEntUidToImgannotStatObj) =>
      new Promise((resolve, reject) => {
        try {
          let calcEntityUid = null;
          let segEntityUid = null;
          if (partCalcEntity.uniqueIdentifier.root) {
            calcEntityUid = partCalcEntity.uniqueIdentifier.root;
          }
          if (partCalcEntity.uniqueIdentifier.root) {
            segEntityUid = segEntity.uniqueIdentifier.root;
          }
          const partImageAnnotationStatement = {
            'xsi:type': 'CalculationEntityReferencesSegmentationEntityStatement',
            subjectUniqueIdentifier: {
              root: calcEntityUid, //  calculationEntity->uniqueIdentifier->root
            },
            objectUniqueIdentifier: {
              root: segEntityUid, //  SegmentationEntity->uniqueIdentifier->root
            },
          };
          //  mapCalcEntUidToImgannotStatObj.set(calcEntityUid, partImageAnnotationStatement);
          mapCalcEntUidToImgannotStatObj.set(
            partCalcEntity.typeCode[0].code,
            partImageAnnotationStatement
          );
          resolve(partImageAnnotationStatement);
        } catch (err) {
          reject(
            new InternalError('error happened while creating plugin ImageAnnotationStatement', err)
          );
        }
      })
  );

  fastify.decorate(
    'createCalcEntityforPluginCalcInternal',
    (lexiconObjParam, calcValueParam, pluginparams) =>
      new Promise((resolve, reject) => {
        try {
          // section for pyradiomics prefix addition for calc aim
          let prefixVal = '';
          for (let paramcount = 0; paramcount < pluginparams.params.length; paramcount += 1) {
            if (pluginparams.params[paramcount].format === 'Parameters') {
              if (pluginparams.params[paramcount].name === 'pyradiomicsprefix') {
                prefixVal = pluginparams.params[paramcount].default_value;
                break;
              }
            }
          }
          // section for pyradiomics prefix addition for calc aim ends
          const partCalcEntity = {
            uniqueIdentifier: {
              root: fastify.generateUidInternal(),
            },
            typeCode: [
              {
                code: lexiconObjParam.codevalue,
                codeSystemName: '99EPAD',
                'iso:displayName': {
                  'xmlns:iso': 'uri:iso.org:21090',
                  value: lexiconObjParam.codemeaning,
                },
              },
            ],
            description: {
              value: lexiconObjParam.codemeaning,
            },
            calculationResultCollection: {
              CalculationResult: [
                {
                  type: 'Scalar',
                  'xsi:type': 'CompactCalculationResult',
                  unitOfMeasure: {
                    value: 'no units',
                  },
                  dataType: {
                    code: 'C48870',
                    codeSystemName: 'NCI',
                    'iso:displayName': {
                      'xmlns:iso': 'uri:iso.org:21090',
                      value: 'Double',
                    },
                  },
                  dimensionCollection: {
                    Dimension: [
                      {
                        index: {
                          value: 0,
                        },
                        size: {
                          value: 1,
                        },
                        label: {
                          value: lexiconObjParam.codemeaning,
                        },
                      },
                    ],
                  },
                  value: {
                    value: calcValueParam,
                  },
                },
              ],
            },
            algorithm: {
              name: {
                value: lexiconObjParam.referencename,
              },
              type: [
                {
                  code: lexiconObjParam.referenceuid,
                  codeSystemName: '99EPAD',
                  codeSystemVersion: '1',
                  'iso:displayName': {
                    'xmlns:iso': 'uri:iso.org:21090',
                    value: lexiconObjParam.referencename,
                  },
                },
              ],
              version: {
                value: 1,
              },
            },
          };
          // for pyradiomics
          if (prefixVal !== '') {
            partCalcEntity.description.value = `${prefixVal}_${partCalcEntity.description.value}`;
          }
          // for pyradiomics ends
          resolve(partCalcEntity);
        } catch (err) {
          reject(new InternalError('error happened while creating plugin calculation entity', err));
        }
      })
  );
  fastify.decorate(
    'createPartialAimForPluginCalcInternal',
    (csvFileParam, pluginInfoParam, csvColumnActual, pluginparams, codeValues, segEntity) => {
      const partCalcEntityArray = [];
      const partImageAnnotationStatementArray = [];
      let willCallRemoteOntology = false;
      const tmpcodeValues = codeValues;
      const mapCodeValuesToCalcEntity = new Map();
      const mapCalcEntUidToImgannotStatObj = new Map();

      return new Promise(async (resolve, reject) => {
        try {
          if (
            config.ontologyApiKey !== 'local' &&
            config.ontologyApiKey !== 'YOUR_ONTOLOGY_APIKEY'
          ) {
            willCallRemoteOntology = true;
          }
          for (let i = 0; i < csvFileParam.length; i += 1) {
            let newLexiconObj = {};
            const lexiconObj = {
              codemeaning: csvFileParam[i].key,
              description: 'plugin adds automatically',
              schemadesignator: '99EPAD',
              schemaversion: 'v1',
              referenceuid: pluginInfoParam.pluginnameid,
              referencename: pluginInfoParam.pluginname,
              referencetype: 'p',
              creator: 'epadplugins',
            };

            if (csvColumnActual === 1) {
              try {
                // this part needs to call remote ontology server
                if (willCallRemoteOntology === true) {
                  // eslint-disable-next-line no-await-in-loop
                  newLexiconObj = await Axios.post(`${config.statsEpad}/api/ontology`, {
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `apikey config.ontologyApiKey`,
                    },
                    lexiconObj,
                  });
                } else {
                  // eslint-disable-next-line no-await-in-loop
                  newLexiconObj = await fastify.insertOntologyItemInternal(lexiconObj);
                  fastify.log.info(
                    `wrote feature values to the local lexicon -> cm : ${newLexiconObj.codemeaning} cv : ${newLexiconObj.codevalue}`
                  );
                }
                tmpcodeValues[lexiconObj.codemeaning] = newLexiconObj.codevalue;
                // eslint-disable-next-line no-await-in-loop
                const resultCalcEntitObj = await fastify.createCalcEntityforPluginCalcInternal(
                  newLexiconObj,
                  csvFileParam[i][`_${csvColumnActual}`],
                  pluginparams
                );
                // eslint-disable-next-line no-await-in-loop
                const resultImageAnnotationStatementObj = await fastify.createImageAnnotationStatementforPluginCalcInternal(
                  resultCalcEntitObj,
                  segEntity,
                  mapCalcEntUidToImgannotStatObj
                );
                mapCodeValuesToCalcEntity.set(newLexiconObj.codevalue, resultCalcEntitObj);
                partCalcEntityArray.push(resultCalcEntitObj);
                partImageAnnotationStatementArray.push(resultImageAnnotationStatementObj);
              } catch (err) {
                if (err instanceof InternalError) {
                  throw err;
                } else if (err.code === 409) {
                  err.lexiconObj.referenceuid = lexiconObj.referenceuid;
                  err.lexiconObj.referencename = lexiconObj.referencename;
                  tmpcodeValues[err.lexiconObj.codemeaning] = err.lexiconObj.codevalue;

                  // eslint-disable-next-line no-await-in-loop
                  const resultCalcEntitObj = await fastify.createCalcEntityforPluginCalcInternal(
                    err.lexiconObj,
                    csvFileParam[i][`_${csvColumnActual}`],
                    pluginparams
                  );
                  // eslint-disable-next-line no-await-in-loop
                  const resultImageAnnotationStatementObj = await fastify.createImageAnnotationStatementforPluginCalcInternal(
                    resultCalcEntitObj,
                    segEntity,
                    mapCalcEntUidToImgannotStatObj
                  );
                  mapCodeValuesToCalcEntity.set(err.lexiconObj.codevalue, resultCalcEntitObj);
                  fastify.log.info(
                    `feature value exist in db already actual values from db used -> codemeaning : ${err.lexiconObj.codemeaning} codevalue : ${err.lexiconObj.codevalue}`
                  );
                  partCalcEntityArray.push(resultCalcEntitObj);
                  partImageAnnotationStatementArray.push(resultImageAnnotationStatementObj);
                  // lexicon object exist already so get codemeaning to form partial aim calculations
                }
              }
            } else {
              // eslint-disable-next-line dot-notation
              lexiconObj.codevalue = tmpcodeValues[csvFileParam[i]['key']];
              // eslint-disable-next-line dot-notation
              lexiconObj.codemeaning = csvFileParam[i]['key'];
              // eslint-disable-next-line no-await-in-loop
              const resultCalcEntitObj = await fastify.createCalcEntityforPluginCalcInternal(
                lexiconObj,
                csvFileParam[i][`_${csvColumnActual}`],
                pluginparams
              );
              mapCodeValuesToCalcEntity.set(lexiconObj.codevalue, resultCalcEntitObj);
              // eslint-disable-next-line no-await-in-loop
              const resultImageAnnotationStatementObj = await fastify.createImageAnnotationStatementforPluginCalcInternal(
                resultCalcEntitObj,
                segEntity,
                mapCalcEntUidToImgannotStatObj
              );
              partCalcEntityArray.push(resultCalcEntitObj);
              partImageAnnotationStatementArray.push(resultImageAnnotationStatementObj);
            }
          }
          resolve({
            calcEntityOb: partCalcEntityArray,
            mapCvtoCm: mapCodeValuesToCalcEntity,
            mapCalcEntToImgAnntStmnt: mapCalcEntUidToImgannotStatObj,
            imgAnnotStmArray: partImageAnnotationStatementArray,
          });
        } catch (err) {
          reject(
            new InternalError(
              'error happened while creating partial aim from plugin calculations',
              err
            )
          );
        }
      });
    }
  );
  /* below mergePartialCalcAimWithUserAimPluginCalcInternal method adds calculatinEntities,
    ImageAnnotationStatement(CalculationEntityReferencesSegmentationEntityStatement) to the user
    aim cretated by the plugin
  */
  fastify.decorate(
    'mergePartialCalcAimWithUserAimPluginCalcInternal',
    (partialAimParam, userAimParam, aimFileLocation) => {
      const fileArray = [];
      let parsedAimFile = null;
      let jsonString = {};
      return new Promise((resolve, reject) => {
        try {
          fastify.findFilesAndSubfilesInternal(aimFileLocation, fileArray, 'json');
          let foundAimInIndice = null;
          for (let cntFileArray = 0; cntFileArray < fileArray.length; cntFileArray += 1) {
            if (fileArray[cntFileArray].file === userAimParam) {
              foundAimInIndice = cntFileArray;
              break;
            }
          }
          let newMergedCalcEntity = {};
          let newMergedImageAnnotationStatement = {};
          let partEntities = [];
          let partImageAnnotationStatement = [];
          jsonString = fs.readFileSync(`${aimFileLocation}/${userAimParam}`, 'utf8');
          parsedAimFile = JSON.parse(jsonString);
          // caclculation entity add,merge
          if (
            // eslint-disable-next-line no-prototype-builtins
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].hasOwnProperty(
              'calculationEntityCollection'
            )
          ) {
            for (
              let calcentcnt = 0;
              calcentcnt <
              parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .calculationEntityCollection.CalculationEntity.length;
              calcentcnt += 1
            ) {
              const eacCodeValue =
                parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .calculationEntityCollection.CalculationEntity[calcentcnt].typeCode[0].code;
              if (partialAimParam.mapCvtoCm.has(eacCodeValue)) {
                partialAimParam.mapCvtoCm.delete(eacCodeValue);
                partialAimParam.mapCalcEntToImgAnntStmnt.delete(eacCodeValue);
              }
            }
            partEntities = Array.from(partialAimParam.mapCvtoCm.values());
            fastify.log.info(
              `this cacl in the part array Calculationentities: ${JSON.stringify(partEntities[0])}`
            );
            newMergedCalcEntity = parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].calculationEntityCollection.CalculationEntity.concat(
              partEntities
            );
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].calculationEntityCollection.CalculationEntity = newMergedCalcEntity;
          } else {
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0][
              // eslint-disable-next-line dot-notation
              'calculationEntityCollection'
            ] = { CalculationEntity: partialAimParam.calcEntityOb };
          }
          // ImageAnnotationstatement(CalculationEntityReferencesSegmentationEntityStatement) add,merge
          if (
            // eslint-disable-next-line no-prototype-builtins
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].hasOwnProperty(
              'imageAnnotationStatementCollection'
            )
          ) {
            // for (
            //   let imgAnnotStmcnt = 0;
            //   imgAnnotStmcnt <
            //   parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            //     .imageAnnotationStatementCollection.ImageAnnotationStatement.length;
            //   imgAnnotStmcnt += 1
            // ) {
            //   const calcEntityUid =
            //     parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            //       .imageAnnotationStatementCollection.ImageAnnotationStatement[imgAnnotStmcnt]
            //       .subjectUniqueIdentifier.root;
            //   if (partialAimParam.mapCalcEntToImgAnntStmnt.has(calcEntityUid)) {
            //     partialAimParam.mapCalcEntToImgAnntStmnt.delete(calcEntityUid);
            //   }
            // }
            partImageAnnotationStatement = Array.from(
              partialAimParam.mapCalcEntToImgAnntStmnt.values()
            );
            fastify.log.info(
              `this cacl in the part array Annotationstatements: ${JSON.stringify(
                partImageAnnotationStatement[0]
              )}`
            );
            newMergedImageAnnotationStatement = parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageAnnotationStatementCollection.ImageAnnotationStatement.concat(
              partImageAnnotationStatement
            );
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageAnnotationStatementCollection.ImageAnnotationStatement = newMergedImageAnnotationStatement;
          } else {
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0][
              // eslint-disable-next-line dot-notation
              'imageAnnotationStatementCollection'
            ] = { ImageAnnotationStatement: partialAimParam.imgAnnotStmArray };
          }
          // write back the resulting aim to the user aim
          fs.writeFileSync(
            `${aimFileLocation}/${userAimParam}`,
            JSON.stringify(parsedAimFile),
            'utf8'
          );
          fastify.log.info(
            `merging calculation part aim with the user aim : partialaimparam ended file to write : ${JSON.stringify(
              fileArray[foundAimInIndice]
            )}`
          );
          resolve(fileArray[foundAimInIndice]);
        } catch (err) {
          reject(
            new InternalError(
              'error happened while mergin user aim with plugin calculation entites',
              err
            )
          );
        }
      });
    }
  );

  fastify.decorate(
    'uploadMergedAimPluginCalcInternal',
    async (aimFileLocation, projectidParam) =>
      new Promise(async (resolve, reject) => {
        const fileArray = [];
        try {
          fileArray.push(aimFileLocation.file);
          const { success, errors } = await fastify.saveFiles(
            aimFileLocation.path,
            fileArray,
            { project: projectidParam },
            { forceSave: 'true' },
            'admin'
          );

          fastify.log.info(`uploading merged aim back to epad error: ${errors}`);
          fastify.log.info(
            `upload merged aim back to epad success: ${success}, aimfile : ${aimFileLocation.file}`
          );
          if (!success) {
            reject(
              new InternalError(
                'error happened while uploading merged aim with plugin calculations',
                'success : false'
              )
            );
          }
          fastify.log.info(
            `upload succeed for the merged aim ->aim info : ${JSON.stringify(aimFileLocation)}`
          );
          resolve(200);
        } catch (err) {
          reject(
            new InternalError(
              'error happened while uploading merged aim with plugin calculations',
              err
            )
          );
        }
      })
  );
  // pyradiomics section--------

  fastify.decorate(
    'pluginConvertJsonToCsvFormatForALineInternal',
    async (fileFullPath, jsonToConvert) =>
      new Promise(async (resolve, reject) => {
        // array no 4 : dso file location
        // array no 7 : dso image file location
        try {
          fastify.log.info(
            `creating input csv dsolists.csv for pyradiomics this calls create a line from given param`
          );
          fs.appendFileSync(
            fileFullPath,
            `${jsonToConvert.dsouid},1,${jsonToConvert.studyInstanceUid},${jsonToConvert.patientId},Series-${jsonToConvert.series}/segs/${jsonToConvert.dsouid}.dcm,5,6,Series-${jsonToConvert.series}/${jsonToConvert.dsoImage}.dcm,${jsonToConvert.series},9,10,${jsonToConvert.patientName},SEG,1,14,15,16,17,18,19,${jsonToConvert.description},21,\n`
          );

          resolve('ok');
        } catch (err) {
          reject(
            new InternalError('error happened while pyradiomics converting json to csv line', err)
          );
        }
      })
  );

  fastify.decorate('pluginCollectDsoInfoFromAimsInternal', async (fileObject) => {
    //  receives a file , return a line for the csv ->dsoLists.csv
    let parsedAimFile = null;
    return new Promise((resolve, reject) => {
      try {
        const aimJsonString = fs.readFileSync(`${fileObject.path}/${fileObject.file}`, 'utf8');
        parsedAimFile = JSON.parse(aimJsonString);
        const rootpath = parsedAimFile.ImageAnnotationCollection.uniqueIdentifier.root;
        const dsoUid =
          parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .segmentationEntityCollection.SegmentationEntity[0].sopInstanceUid.root;
        const study =
          parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .segmentationEntityCollection.SegmentationEntity[0].studyInstanceUid.root;
        const series =
          parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .instanceUid.root;
        const dsoImage =
          parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .segmentationEntityCollection.SegmentationEntity[0].referencedSopInstanceUid.root;
        const studyInstanceUid = parsedAimFile.ImageAnnotationCollection.studyInstanceUid.root;
        const patientId = parsedAimFile.ImageAnnotationCollection.person.id.value;
        const patientName = parsedAimFile.ImageAnnotationCollection.person.name.value;
        const description =
          parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value;
        const lineJson = {
          rootpath,
          dsouid: dsoUid,
          study,
          series,
          dsoImage,
          studyInstanceUid,
          patientId,
          patientName,
          description,
        };
        resolve(lineJson);
      } catch (err) {
        reject(
          new InternalError('error happened while collecting dso info from the aim file', err)
        );
      }
    });
  });

  fastify.decorate(
    'pluginGetAimFilesInternal',
    async (filePath) =>
      new Promise(async (resolve, reject) => {
        const fileArray = [];
        try {
          await fastify.findFilesAndSubfilesInternal(filePath, fileArray, 'json');
          fastify.log.info(`plugin is collecting aims : ${JSON.stringify(fileArray)}`);
          resolve(fileArray);
        } catch (err) {
          reject(new InternalError('error happened while plugin was collecting aims', err));
        }
      })
  );

  fastify.decorate(
    'createPluginPyradiomicsDsoListInternal',
    async (pluginparams) =>
      new Promise(async (resolve, reject) => {
        let resultObj = null;
        let resultObjFiles = null;
        const arrayForDsoListCsv = [];
        const dsoListName = 'dsoList.csv';
        try {
          resultObjFiles = await fastify.pluginGetAimFilesInternal(
            `${pluginparams.relativeServerFolder}/aims`
          );
          fs.openSync(`${pluginparams.relativeServerFolder}/dicoms/${dsoListName}`, 'w');

          for (let i = 0; i < resultObjFiles.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            resultObj = await fastify.pluginCollectDsoInfoFromAimsInternal(resultObjFiles[i]);
            // eslint-disable-next-line no-await-in-loop
            await fastify.pluginConvertJsonToCsvFormatForALineInternal(
              `${pluginparams.relativeServerFolder}/dicoms/${dsoListName}`,
              resultObj
            );
            arrayForDsoListCsv.push(resultObj);
          }
          resolve(200);
        } catch (err) {
          reject(new InternalError(' error happened while creating pyradiomics dso list', err));
        }
      })
  );
  fastify.decorate(
    'pluginFindSegEntUidFromSopUid',
    async (dsoId, folderToLook) =>
      new Promise(async (resolve, reject) => {
        let infuncfileArray = [];
        try {
          infuncfileArray = fs.readdirSync(folderToLook);
          for (let arraycnt = 0; arraycnt < infuncfileArray.length; arraycnt += 1) {
            const aimJsonString = fs.readFileSync(
              `${folderToLook}/${infuncfileArray[arraycnt]}`,
              'utf8'
            );
            const parsedAimFile = JSON.parse(aimJsonString);
            const segEntities =
              parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .segmentationEntityCollection.SegmentationEntity;
            for (let segEntitycnt = 0; segEntitycnt < segEntities.length; segEntitycnt += 1) {
              if (dsoId === segEntities[segEntitycnt].sopInstanceUid.root) {
                resolve(
                  parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .segmentationEntityCollection.SegmentationEntity[segEntitycnt]
                );
              }
            }
          }
          reject(
            new InternalError(
              `aim or segmentationentity not found for given dso id ${dsoId}`,
              '404'
            )
          );
        } catch (err) {
          reject(
            new InternalError(
              `error happened while plugin is trying to find aim or segmentationEntity for the given dso id ${dsoId}`,
              err
            )
          );
        }
      })
  );
  fastify.decorate(
    'pluginFindAimforGivenDso',
    async (dsoId, folderToLook) =>
      new Promise(async (resolve, reject) => {
        let infuncfileArray = [];
        try {
          infuncfileArray = fs.readdirSync(folderToLook);
          for (let arraycnt = 0; arraycnt < infuncfileArray.length; arraycnt += 1) {
            const aimJsonString = fs.readFileSync(
              `${folderToLook}/${infuncfileArray[arraycnt]}`,
              'utf8'
            );
            const parsedAimFile = JSON.parse(aimJsonString);
            const dsouidFromAim =
              parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .segmentationEntityCollection.SegmentationEntity[0].sopInstanceUid.root;
            if (dsoId === dsouidFromAim) {
              resolve(infuncfileArray[arraycnt]);
            }
          }
          reject(new InternalError(`aim not found for given dso id ${dsoId}`, '404'));
        } catch (err) {
          reject(
            new InternalError(
              `error happened while plugin is trying to find aim for the given dso id ${dsoId}`,
              err
            )
          );
        }
      })
  );
  // pyradiomics
  fastify.decorate('generateUidInternal', () => {
    let uid = `2.25.${Math.floor(1 + Math.random() * 9)}`;
    for (let index = 0; index < 38; index += 1) {
      uid += Math.floor(Math.random() * 10);
    }
    return uid;
  });
  //  plugin calculations verify codemaning existance in ontology and add calculations to the user aim part ends

  fastify.decorate(
    'pluginAddSegmentationToAim',
    async (aimjsonarray, dcmFilesarray) =>
      new Promise(async (resolve, reject) => {
        try {
          fastify.log.info(
            `pluginAddSegmentationToAim -> aimarray : ${JSON.stringify(aimjsonarray)}`
          );
          fastify.log.info(
            `pluginAddSegmentationToAim -> segmentation array : ${JSON.stringify(dcmFilesarray)}`
          );
          const readStreamForDcm = fs.createReadStream(
            `${dcmFilesarray[0].path}/${dcmFilesarray[0].file}`
          );
          // eslint-disable-next-line no-await-in-loop
          const bufferArray = await fastify.getMultipartBuffer(readStreamForDcm);
          const segTags = dcmjs.data.DicomMessage.readFile(bufferArray);
          const segDS = dcmjs.data.DicomMetaDictionary.naturalizeDataset(segTags.dict);
          // eslint-disable-next-line no-underscore-dangle
          segDS._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(segTags.meta);

          const { aim } = createOfflineAimSegmentation(segDS, {
            loginName: { value: '' }, // epadAuth.username,
            name: { value: '' }, // `${epadAuth.firstname} ${epadAuth.lastname}`,
          });
          // looking in the returned aim for "ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection"
          const dicomJson = aim.getAimJSON();
          fastify.log.info(
            `pluginAddSegmentationToAim -> tags in dicom seg
            ${JSON.stringify(dicomJson)}`
          );
          fastify.log.info(
            `pluginAddSegmentationToAim -> aimjsonArray to get the aim to merge with segmentation ${JSON.stringify(
              aimjsonarray[0]
            )}`
          );
          const jsonString = fs.readFileSync(
            `${aimjsonarray[0].path}/${aimjsonarray[0].file}`,
            'utf8'
          );
          const parsedAimFile = JSON.parse(jsonString);
          if (
            // eslint-disable-next-line no-prototype-builtins
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].hasOwnProperty(
              'segmentationEntityCollection'
            )
          ) {
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection.SegmentationEntity.concat(
              dicomJson.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .segmentationEntityCollection.SegmentationEntity
            );
          } else {
            parsedAimFile.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection =
              dicomJson.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection;
          }

          fastify.log.info(
            `resulting aim after adding segmentation part to aim : ${JSON.stringify(parsedAimFile)}`
          );
          fs.writeFileSync(
            `${aimjsonarray[0].path}/${aimjsonarray[0].file}`,
            JSON.stringify(parsedAimFile),
            'utf8'
          );
          resolve(true);
        } catch (err) {
          reject(
            new InternalError(
              `error happened while plugin adding segmentationEntitiy to given aim ${aimjsonarray[0]}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate('runPluginsQueueInternal', async (result, request) => {
    const pluginQueueList = [...result];
    try {
      const seq = request.body.sequence || false;
      if (seq) {
        for (let i = 0; i < pluginQueueList.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(pluginQueueList[i].id, 'inqueue');
        }
      }
      for (let i = 0; i < pluginQueueList.length; i += 1) {
        let containerErrorTrack = 0;
        const imageRepo = `${pluginQueueList[i].plugin.image_repo}:${pluginQueueList[i].plugin.image_tag}`;
        const queueId = pluginQueueList[i].id;
        try {
          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueId, 'waiting');
          new EpadNotification(
            request,
            `ePad is preparing folder structure for plugin image: ${imageRepo} `,
            'success',
            true
          ).notify(fastify);

          fastify.log.info(`pluginQueueList[i] :${JSON.stringify(pluginQueueList[i])}`);
          // eslint-disable-next-line no-await-in-loop
          const pluginParameters = await fastify.extractPluginParamtersInternal(
            pluginQueueList[i],
            request
          );

          // eslint-disable-next-line no-prototype-builtins
          if (pluginParameters.hasOwnProperty('message')) {
            if (pluginParameters.message.includes('Error')) {
              containerErrorTrack += 1;
              // eslint-disable-next-line no-await-in-loop
              await fastify.updateStatusQueueProcessInternal(queueId, 'error');
              new EpadNotification(
                request,
                `docker encountered an error while preparing the container : ${imageRepo}`,
                new Error(`${pluginParameters.message}`),
                true
              ).notify(fastify);
              throw new InternalError('', pluginParameters.message);
            }
          }
          fastify.log.info(`called image : ${imageRepo}`);
          const dock = new DockerService(fs, fastify, path);
          let checkImageExistOnHub = false;
          let checkImageExistLocal = false;
          try {
            fastify.log.info(`trying to pull first : ${imageRepo}`);
            // eslint-disable-next-line no-await-in-loop
            await dock.pullImageA(imageRepo);
            checkImageExistOnHub = true;
          } catch (err) {
            fastify.log.info(
              `${imageRepo} is not reachable , does not exist on the hub or requires login`
            );
          }
          if (checkImageExistOnHub === false) {
            // check local image existance

            // eslint-disable-next-line no-await-in-loop
            const imageList = await dock.listImages();
            const litSize = imageList.length;

            for (let cnt = 0; cnt < litSize; cnt += 1) {
              if (imageRepo !== ':' && imageRepo !== '') {
                if (imageList[cnt].RepoTags.includes(imageRepo)) {
                  checkImageExistLocal = true;
                  fastify.log.info('image found locally');
                  break;
                }
              }
            }
          }
          if (checkImageExistOnHub === true || checkImageExistLocal === true) {
            try {
              // eslint-disable-next-line no-await-in-loop
              let opreationresult = '';
              // eslint-disable-next-line no-await-in-loop
              const sortedParams = await fastify.sortPluginParamsAndExtractWhatToMapInternal(
                pluginParameters
              );

              // Add if additional input files will be prepared before starting plugin ? (adding for pyradiomics for now)
              if (pluginParameters.pluginnameid.includes('pyradiomics')) {
                fastify.log.info(`running plugin is an instance of pyradiomics plugin`);
                // eslint-disable-next-line no-await-in-loop
                await fastify.createPluginPyradiomicsDsoListInternal(pluginParameters);
              }
              let uploadImageBackFlag = null;
              let uploadAimsBackFlag = null;
              let outputFileParam = null;
              let addsegmentationentitytoaim = null;
              for (let prmsCnt = 0; prmsCnt < pluginParameters.params.length; prmsCnt += 1) {
                if (pluginParameters.params[prmsCnt].format === 'OutputFile') {
                  outputFileParam = pluginParameters.params[prmsCnt].default_value;
                }
                if (pluginParameters.params[prmsCnt].format === 'OutputFolder') {
                  uploadImageBackFlag = pluginParameters.params[prmsCnt].uploadimages;
                  uploadAimsBackFlag = pluginParameters.params[prmsCnt].uploadaims;
                }
                if (pluginParameters.params[prmsCnt].name === 'addsegmentationentitytoaim') {
                  addsegmentationentitytoaim = true;
                }
              }
              if (pluginParameters.pluginnameid.includes('pyradiomics')) {
                // this if block is only to verify if dsoList.csv is created before the container starts.Its purpose is just to write to console.It can be removed if no debugging is necessary
                fastify.log.info(
                  ` plugin dsolist file created before the pyradiomics container starts : ${pluginParameters.relativeServerFolder}/dicoms/dsoList.csv`
                );
                const csvLines = [];
                fs.createReadStream(`${pluginParameters.relativeServerFolder}/dicoms/dsoList.csv`)
                  .pipe(csv({ skipLines: 0, headers: [] }))
                  // eslint-disable-next-line no-loop-func
                  .on('data', (data) => {
                    csvLines.push(Object.values(data));
                  })
                  .on('end', () => {
                    for (let cvslinecnt = 0; cvslinecnt < csvLines.length; cvslinecnt += 1) {
                      fastify.log.info(
                        `dsoList file content before plugin starts: ${csvLines[cvslinecnt]}`
                      );
                    }
                  })
                  .on('error', (err) => {
                    containerErrorTrack += 1;
                    // eslint-disable-next-line no-new
                    new InternalError(
                      'error happened while reading plugin calculation csv file in output folder',
                      err
                    );
                  });
              }
              // eslint-disable-next-line no-await-in-loop
              await fastify.updateStatusQueueProcessInternal(queueId, 'running');
              new EpadNotification(
                request,
                `plugin image: ${imageRepo} started the process and container is running`,
                'success',
                true
              ).notify(fastify);
              // eslint-disable-next-line no-await-in-loop
              opreationresult = await dock.createContainer(
                imageRepo,
                `epadplugin_${queueId}`,
                sortedParams,
                pluginQueueList[i]
              );

              fastify.log.info(`opreationresult : ${JSON.stringify(opreationresult)}`);
              // eslint-disable-next-line no-prototype-builtins
              if (opreationresult.hasOwnProperty('stack')) {
                fastify.log.info(`error catched in upper level : ${opreationresult.stack}`);
                // eslint-disable-next-line no-new
                throw new InternalError('', opreationresult);
              }

              // eslint-disable-next-line no-await-in-loop
              opreationresult = ` plugin image : ${imageRepo} terminated the container process with success`;
              new EpadNotification(request, opreationresult, 'success', true).notify(fastify);
              fastify.log.info(`plugin finished working for the image: ${imageRepo}`);

              //  upload the result from container to the series
              const fileArray = [];

              fastify.log.info(
                'plugin finished processing checking if there are dicoms or csv file for calculations'
              );
              if (fs.existsSync(`${pluginParameters.relativeServerFolder}/output`)) {
                // look for dcm files to upload section

                const dcmFilesWithoutPath = [];

                fastify.findFilesAndSubfilesInternal(
                  `${pluginParameters.relativeServerFolder}/output`,
                  fileArray,
                  'dcm'
                );
                const dicomfilesNumberInOutputfolder = fileArray.length;
                for (let cnt = 0; cnt < dicomfilesNumberInOutputfolder; cnt += 1) {
                  dcmFilesWithoutPath.push(fileArray[cnt].file);
                }

                fastify.log.info(
                  `dcm files in the plugin output folder -> we will first upload aims: ${JSON.stringify(
                    fileArray
                  )}`
                );
                fastify.log.info(
                  `source path for files to upload back to epad :${pluginParameters.relativeServerFolder}/output`
                );
                fastify.log.info(`checking plugin params : ${JSON.stringify(pluginParameters)}`);
                if (addsegmentationentitytoaim) {
                  if (dicomfilesNumberInOutputfolder > 0) {
                    // this if block is for contourtodso and expected one aim in plugin aim foler and expected one segmentation (example.dcm) in the plugin output folder
                    fastify.log.info(
                      'dcm files exist in the output folder for any type of plugin. Collect dicom tags to write to aim'
                    );
                    // eslint-disable-next-line no-await-in-loop
                    const aimFiles = await fastify.pluginGetAimFilesInternal(
                      `${pluginParameters.relativeServerFolder}/aims`
                    );
                    // eslint-disable-next-line no-await-in-loop
                    await fastify.pluginAddSegmentationToAim(aimFiles, fileArray);
                  } else {
                    fastify.log.info(
                      `no dicoms found in the output folder for any type of plugin `
                    );
                  }
                } else {
                  fastify.log.info(
                    `pluginAddSegmentationToAim will be called (if true): ${addsegmentationentitytoaim}`
                  );
                }
                // look for dcm files to upload section ends

                // this section needs to be executed if csv needs to be proecessed
                // write plugin calculations to aim
                const csvArray = [];
                fastify.findFilesAndSubfilesInternal(
                  `${pluginParameters.relativeServerFolder}/output`,
                  csvArray,
                  'csv'
                );
                fastify.log.info(
                  `csv files exists in the plugin output folder : ${JSON.stringify(csvArray)}`
                );

                if (csvArray.length > 0) {
                  let csvfound = null;
                  let pyradiomicsFeatureValuesFile = null;
                  for (let cntCsvArray = 0; cntCsvArray < csvArray.length; cntCsvArray += 1) {
                    if (csvArray[cntCsvArray].file === `${outputFileParam}`) {
                      csvfound = cntCsvArray;
                      pyradiomicsFeatureValuesFile = csvArray[cntCsvArray].file;
                      break;
                    }
                  }
                  if (csvfound !== null) {
                    new EpadNotification(
                      request,
                      `${pluginParameters.pluginname} is processing output csv files `,
                      'success',
                      true
                    ).notify(fastify);
                    fastify.log.info(
                      `plugin is processing csv file ${pyradiomicsFeatureValuesFile} from output folder ${pluginParameters.relativeServerFolder}/output`
                    );
                    const tempFileObject = csvArray[csvfound];
                    let calcObj = null;
                    try {
                      //  eslint-disable-next-line no-await-in-loop
                      calcObj = await fastify.parseCsvForPluginCalculationsInternal(
                        tempFileObject,
                        pluginParameters
                      );
                    } catch (err) {
                      containerErrorTrack = +1;
                      fastify.log.error(
                        `Error:parsing csv file in the queue failed for pyradiomics plugin instance: ${err}`
                      );
                      // eslint-disable-next-line no-await-in-loop
                      await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                      new EpadNotification(
                        request,
                        '',
                        new Error(
                          `error happened while parsing csv file in the queue for pyradiomics plugin instance ${pluginParameters.pluginname} `
                        ),
                        true
                      ).notify(fastify);
                    }
                    fastify.log.info(
                      `parseCsvForPluginCalculationsInternal -> after the transposition will be decided to continue or not. calcObj : ${JSON.stringify(
                        calcObj
                      )}`
                    );
                    if (calcObj) {
                      const resObj = calcObj.resultobj;
                      const totalcolumnumber = Object.keys(resObj[0]).length;
                      const pluginInfoFromParams = {
                        pluginnameid: pluginParameters.pluginnameid,
                        pluginname: pluginParameters.pluginname,
                      };
                      // this block needs to be called in an array of each csv column
                      const codeValues = {};
                      for (
                        let csvColumncount = 1;
                        csvColumncount < totalcolumnumber;
                        csvColumncount += 1
                      ) {
                        let returnPartialPluginCalcAim = null;
                        let foundAimIdFordso = null;
                        let foundSegEntity = null;
                        let mergedaimFileLocation = null;
                        // find the aim id from the dso id -> if the plugin is pyradiomics
                        if (pluginParameters.pluginnameid.includes('pyradiomics')) {
                          try {
                            fastify.log.info(
                              `finding the aim for the dso: ${
                                calcObj.alldsoIds[csvColumncount - 1]
                              }`
                            );
                            // eslint-disable-next-line no-await-in-loop
                            foundAimIdFordso = await fastify.pluginFindAimforGivenDso(
                              calcObj.alldsoIds[csvColumncount - 1],
                              `${pluginParameters.relativeServerFolder}/aims`
                            );
                          } catch (err) {
                            containerErrorTrack = +1;
                            fastify.log.error(
                              `Error: finding aim for the dso: ${
                                calcObj.alldsoIds[csvColumncount - 1]
                              } ,err: ${err}`
                            );
                            // eslint-disable-next-line no-await-in-loop
                            await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                            new EpadNotification(
                              request,
                              '',
                              new Error(
                                `error happened while ${
                                  pluginInfoFromParams.pluginname
                                } was searching for the dso :${
                                  calcObj.alldsoIds[csvColumncount - 1]
                                }`
                              ),
                              true
                            ).notify(fastify);
                          }
                        } else {
                          try {
                            // we assume that plugins other than pyradiomics will use only one aim for the calculations
                            const tmpAims = [];
                            fastify.findFilesAndSubfilesInternal(
                              `${pluginParameters.relativeServerFolder}/aims`,
                              tmpAims,
                              'json'
                            );
                            // we may need to rename the foundAimIdFordso. Because we only collect aimid from dso for pyradiomics.
                            // eslint-disable-next-line prefer-destructuring
                            foundAimIdFordso = tmpAims[0];
                          } catch (err) {
                            containerErrorTrack = +1;
                            fastify.log.error(
                              `Error: finding aim for non pyradiomics plugins ,err: ${err}`
                            );
                            // eslint-disable-next-line no-await-in-loop
                            await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                            new EpadNotification(
                              request,
                              '',
                              new Error(
                                `error happened while  ${pluginInfoFromParams.pluginname} was searching for plugin aims `
                              ),
                              true
                            ).notify(fastify);
                          }
                        }
                        try {
                          fastify.log.info(
                            'creating calculation part of the aim from the feature values'
                          );
                          // eslint-disable-next-line no-await-in-loop
                          foundSegEntity = await fastify.pluginFindSegEntUidFromSopUid(
                            calcObj.alldsoIds[csvColumncount - 1],
                            `${pluginParameters.relativeServerFolder}/aims`
                          );
                          // eslint-disable-next-line no-await-in-loop
                          returnPartialPluginCalcAim = await fastify.createPartialAimForPluginCalcInternal(
                            resObj,
                            pluginInfoFromParams,
                            csvColumncount,
                            pluginParameters,
                            codeValues,
                            foundSegEntity
                          );
                        } catch (err) {
                          containerErrorTrack = +1;
                          fastify.log.error(
                            `Error : creating calculation part of the aim from the feature values, err: ${err}`
                          );
                          // eslint-disable-next-line no-await-in-loop
                          await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                          new EpadNotification(
                            request,
                            '',
                            new Error(
                              `error happened while ${pluginInfoFromParams.pluginname} was creating calculations from feature values`
                            ),
                            true
                          ).notify(fastify);
                        }
                        try {
                          fastify.log.info(
                            `merging calculation object with the aim with the id : ${foundAimIdFordso}`
                          );
                          // eslint-disable-next-line no-await-in-loop
                          mergedaimFileLocation = await fastify.mergePartialCalcAimWithUserAimPluginCalcInternal(
                            returnPartialPluginCalcAim,
                            foundAimIdFordso,
                            `${pluginParameters.relativeServerFolder}/aims`
                          );
                        } catch (err) {
                          containerErrorTrack = +1;
                          fastify.log.error(
                            `merging calculation object with the aim with the aimid : ${foundAimIdFordso},err: ${err}`
                          );
                          // eslint-disable-next-line no-await-in-loop
                          await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                          new EpadNotification(
                            request,
                            '',
                            new Error(
                              `error happened while  ${pluginInfoFromParams.pluginname} was merging the calculation with the orginal aim: ${foundAimIdFordso} `
                            ),
                            true
                          ).notify(fastify);
                        }
                        if (uploadAimsBackFlag === 1) {
                          try {
                            fastify.log.info(
                              `uploading processed aim with the aimid: ${JSON.stringify(
                                foundAimIdFordso
                              )} by the plugin`
                            );
                            // eslint-disable-next-line no-await-in-loop
                            await fastify.uploadMergedAimPluginCalcInternal(
                              mergedaimFileLocation,
                              pluginParameters.projectid
                            );
                          } catch (err) {
                            containerErrorTrack = +1;
                            fastify.log.error(
                              `Error : uploading processed aim with the aimid: ${foundAimIdFordso} by the plugin, err:${err}`
                            );
                            // eslint-disable-next-line no-await-in-loop
                            await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                            new EpadNotification(
                              request,
                              '',
                              new Error(
                                `error happened while  ${pluginInfoFromParams.pluginname} was uploading back the aim : ${foundAimIdFordso}`
                              ),
                              true
                            ).notify(fastify);
                          }
                        } else {
                          fastify.log.info(`user set don't upload aims back flag`);
                        }
                      }
                      // eslint-disable-next-line no-await-in-loop
                      new EpadNotification(
                        request,
                        `${pluginInfoFromParams.pluginname}`,
                        `completed the process for epadplugin_${queueId}`,
                        true
                      ).notify(fastify);
                    } else {
                      containerErrorTrack = +1;
                      // eslint-disable-next-line no-await-in-loop
                      await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                      new EpadNotification(
                        request,
                        '',
                        new Error(
                          `error happened while ${pluginParameters.pluginname} was procesing transposed results. Content is missing`
                        ),
                        true
                      ).notify(fastify);
                    }
                  } else {
                    fastify.log.info(
                      `required ${outputFileParam} file couldn't be found to process in output folder for the plugin`
                    );
                  }
                } else {
                  fastify.log.info('no csv file found in output folder for the plugin');
                  // upload aims without regarding pyradiomics or not just check upload back aim flag.this means epad will not process the csv file and will not write back into aim
                  // but a plugin can still manipulate aim wihtout a csv. this is the case we cover here.
                  if (uploadAimsBackFlag === 1) {
                    const foundAimsAnyPlugin = [];
                    try {
                      try {
                        fastify.log.info(
                          `finding the aims for any plugin which has upload aim back flag is set and is not required to process csv file for feature values`
                        );
                        // eslint-disable-next-line no-await-in-loop
                        fastify.findFilesAndSubfilesInternal(
                          `${pluginParameters.relativeServerFolder}/aims`,
                          foundAimsAnyPlugin,
                          'json'
                        );
                        fastify.log.info(
                          `found aims for any plugin : ${JSON.stringify(foundAimsAnyPlugin)}`
                        );
                      } catch (err) {
                        containerErrorTrack = +1;
                        fastify.log.error(`Error: finding aims for any plugin err: ${err}`);
                        // eslint-disable-next-line no-await-in-loop
                        await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                        new EpadNotification(
                          request,
                          '',
                          new Error(
                            `error happened while lookingup for aims for any type of plugin which has "uploadaimback" flag set ${pluginParameters.pluginname} `
                          ),
                          true
                        ).notify(fastify);
                      }
                      fastify.log.info(
                        `uploading processed aim for any plugin with the aimid: ${JSON.stringify(
                          foundAimsAnyPlugin
                        )} by the plugin`
                      );
                      for (
                        let foundAimsAnyPluginCnt = 0;
                        foundAimsAnyPluginCnt < foundAimsAnyPlugin.length;
                        foundAimsAnyPluginCnt += 1
                      ) {
                        // eslint-disable-next-line no-await-in-loop
                        await fastify.uploadMergedAimPluginCalcInternal(
                          foundAimsAnyPlugin[foundAimsAnyPluginCnt],
                          pluginParameters.projectid
                        );
                      }
                    } catch (err) {
                      containerErrorTrack = +1;
                      fastify.log.error(
                        `Error : while uploading processed aim for any type of plugin with the aimid: ${JSON.stringify(
                          foundAimsAnyPlugin
                        )} by the plugin, err:${err}`
                      );
                      // eslint-disable-next-line no-await-in-loop
                      await fastify.updateStatusQueueProcessInternal(queueId, 'error');
                      new EpadNotification(
                        request,
                        '',
                        new Error(
                          `error happened while  ${
                            pluginParameters.pluginname
                          } was uploading back the aim for any type plugin with aimid: ${JSON.stringify(
                            foundAimsAnyPlugin
                          )}`
                        ),
                        true
                      ).notify(fastify);
                    }
                  } else {
                    fastify.log.info(`user set don't upload aims back flag`);
                  }
                }

                // tthis section needs to be executed if csv needs to be proecessed // section ends

                //  dicom upload
                if (uploadImageBackFlag === 1) {
                  if (dicomfilesNumberInOutputfolder > 0) {
                    new EpadNotification(
                      request,
                      `${pluginParameters.pluginname} is processing output dcm files `,
                      'success',
                      true
                    ).notify(fastify);
                    fastify.log.info(
                      `plugin is uploading dcm files from output folder ${pluginParameters.relativeServerFolder}/output`
                    );
                    //  eslint-disable-next-line no-await-in-loop
                    const { success, errors } = await fastify.saveFiles(
                      `${pluginParameters.relativeServerFolder}/output`,
                      dcmFilesWithoutPath,
                      { project: pluginParameters.projectid },
                      {},
                      request.epadAuth
                    );

                    fastify.log.info(
                      `dcm upload process project id :${pluginParameters.projectid}`
                    );
                    fastify.log.info(`dcm upload process error: ${errors}`);
                    fastify.log.info(`dcm upload process success: ${success}`);
                  } else {
                    fastify.log.info(`no dcm file found in output folder for the plugin`);
                  }
                } else {
                  fastify.log.info(
                    `user didn't set "uploadbackdicoms" flag to upload back dicoms from output folder `
                  );
                }
              }
            } catch (err) {
              containerErrorTrack = +1;
              const operationresult = ` plugin image : ${imageRepo} terminated the container process with error`;
              // eslint-disable-next-line no-await-in-loop
              await fastify.updateStatusQueueProcessInternal(queueId, 'error');
              new EpadNotification(request, operationresult, err, true).notify(fastify);
            }
          } else {
            // eslint-disable-next-line no-await-in-loop
            await fastify.updateStatusQueueProcessInternal(queueId, 'error');
            fastify.log.info(`image not found : ${imageRepo} `);
            new EpadNotification(
              request,
              'error',
              new Error(`no image found check syntax "${imageRepo}" or change to a valid repo`),
              true
            ).notify(fastify);
          }
        } catch (err) {
          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueId, 'error');
          new EpadNotification(
            request,
            '',
            new Error(`${imageRepo} instance failed in the queue `),
            true
          ).notify(fastify);
        }
        if (containerErrorTrack === 0) {
          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueId, 'ended');
          new EpadNotification(
            request,
            ``,
            `completed the process for epadplugin_${queueId}`,
            true
          ).notify(fastify);
          // check the sub queue when the parent is done processing. here we will start the subqueue.
          // eslint-disable-next-line no-await-in-loop
          const childPluginQueueId = await fastify.runNextPluginInSubQueueInternal(
            queueId,
            request
          );
          fastify.log.info(
            `epadplugin_${queueId} is done. checking sub queue situation : ${JSON.stringify(
              childPluginQueueId
            )}`
          );
        }
      }
      // delete global ids here
      for (let gqidscnt = 0; gqidscnt < pluginQueueList.length; gqidscnt += 1) {
        globalMapQueueById.delete(pluginQueueList[gqidscnt].id);
      }
    } catch (err) {
      fastify.log.error(`plugin queue encountered an error : ${err}`);
    }
  });
  //  internal functions ends
  //  plugins section ends

  // regiter host for app section

  fastify.decorate(
    'sendEmailInternal',
    (paramFrom, paramTo, paramSubject, paramText) =>
      // eslint-disable-next-line no-new
      new Promise((resolve, reject) => {
        if (config.notificationEmail) {
          const mailOptions = {
            from: paramFrom,
            to: paramTo,
            subject: paramSubject,
            text: paramText,
          };

          fastify.nodemailer.sendMail(mailOptions, (err, info) => {
            if (err) {
              fastify.log.error(`could not send email to ${paramTo}. Error: ${err.message}`);
              reject(new InternalError('Error Happened while senfing an email', err));
            } else {
              fastify.log.info(`Email accepted for ${JSON.stringify(info.accepted)}`);
              resolve(info);
            }
          });
        }
        reject(new InternalError('Mail relay settings are not found', new Error('334')));
        //  Error : 334 means –> Provide SMTP authentication credentials.
      })
  );

  fastify.decorate('generateEmailValidationCodeInternal', () => {
    //  key generation copied from the link https://codepen.io/corenominal/pen/rxOmMJ
    let d = new Date().getTime();
    if (window.performance && typeof window.performance.now === 'function') {
      d += performance.now();
    }

    const uuid = 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
      // eslint-disable-next-line no-bitwise
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      // eslint-disable-next-line no-bitwise
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
  });

  fastify.decorate('generateAppKeyInternal', () => {
    //  key generation copied from the link https://codepen.io/corenominal/pen/rxOmMJ

    let d = new Date().getTime();

    if (window.performance && typeof window.performance.now === 'function') {
      d += performance.now();
    }

    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      // eslint-disable-next-line no-bitwise
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      // eslint-disable-next-line no-bitwise
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
  });
  fastify.decorate(
    'getRegisteredServerInternal',
    async (paramHostname, paramEmail, paramEmailValKey) => {
      fastify.log.info(
        `looking for email:${paramEmail} and hostname: ${paramHostname} to check existance for registered server `
      );
      const whereParams = { hostname: paramHostname, email: paramEmail };
      if (paramEmailValKey !== '') {
        whereParams.emailvalidationcode = paramEmailValKey;
      }
      const registeredServers = await models.registeredapps.findAll({
        where: whereParams,
        order: [['updatetime', 'DESC']],
      });
      return registeredServers;
    }
  );

  fastify.decorate('getApiKeyWithSecretInternal', async (secret) => {
    fastify.log.info(`looking for secret to check existance for registered server and api key `);
    const registeredServers = await models.registeredapps.findAll({
      where: { secret },
      order: [['updatetime', 'DESC']],
      raw: true,
    });
    if (registeredServers && registeredServers[0]) return registeredServers[0].apikey;
    return null;
  });

  fastify.decorate('registerServerForAppKey', async (request, reply) => {
    const requestSenderServerName = request.raw.headers.host.split(':')[0];
    const tempBody = request.body;
    let tempEpadStatServer = config.statsEpad.split('//')[1];
    if (
      tempEpadStatServer === '' ||
      tempEpadStatServer === undefined ||
      tempEpadStatServer === 'undefined'
    ) {
      tempEpadStatServer = config.statsEpad;
    }
    if (!requestSenderServerName.includes(tempEpadStatServer)) {
      const resultRemoteRegister = await Axios.post(`${config.statsEpad}/register`, {
        headers: {
          'Content-Type': 'application/json',
        },
        tempBody,
      });

      fastify.log.info(
        `remote server rsponse for register server for the apikey : ${resultRemoteRegister}`
      );
      reply.code(resultRemoteRegister.code).send(resultRemoteRegister.data);
      return;
    }

    const tempName = request.body.name;
    const tempEmail = request.body.email;
    const tempOrganization = request.body.organization;
    const tempUserEmailvalidationcode = request.body.emailvalidationcode;
    const tempHostname = requestSenderServerName;
    let emailSentResult = null;

    fastify.log.info(
      `registering requested with the info-> email : ${tempEmail} , hostname: ${tempHostname}, ,server(requestSender): ${requestSenderServerName} , url: ${request}`
    );

    const serverExistance = await fastify.getRegisteredServerInternal(
      tempHostname,
      tempEmail,
      tempUserEmailvalidationcode
    );
    const lastRecordOfRegisteredServer = serverExistance[serverExistance.length - 1];
    fastify.log.info(
      `we are checking if the server exist : getting last inserted data : ${lastRecordOfRegisteredServer}`
    );

    if (tempUserEmailvalidationcode === '' && lastRecordOfRegisteredServer === undefined) {
      fastify.log.info(
        'registering new server for api key but apikey will be inserted after email validation'
      );
      const tempGeneratedEmailValidationCode = fastify.generateEmailValidationCodeInternal();
      const registeredObject = await models.registeredapps.create({
        name: tempName,
        organization: tempOrganization,
        hostname: tempHostname,
        email: tempEmail,
        emailvalidationcode: tempGeneratedEmailValidationCode,
        creator: request.epadAuth.username,
        createdtime: Date.now(),
        emailvalidationsent: Date.now(),
      });
      // send an email tempGeneratedEmailValidationCode
      try {
        emailSentResult = await fastify.sendEmailInternal(
          config.notificationEmail.auth.user,
          tempEmail,
          'ePad register api key email verification code',
          tempGeneratedEmailValidationCode
        );
        fastify.log.info(`sent email succeed, result : ${emailSentResult}`);
      } catch (error) {
        reply.send(new InternalError('email sending issue', error));
        return;
      }

      fastify.log.info(`new server registered for the apikey: ${JSON.stringify(registeredObject)}`);
      reply.code(200).send('validationsent');
    } else if (tempUserEmailvalidationcode === '' && lastRecordOfRegisteredServer !== undefined) {
      fastify.log.info(
        `server exist already updating email verification code : ${lastRecordOfRegisteredServer}`
      );
      const tempGeneratedEmailValidationCode = fastify.generateEmailValidationCodeInternal();
      await models.registeredapps.update(
        {
          emailvalidationcode: tempGeneratedEmailValidationCode,
          updatetime: Date.now(),
          emailvalidationsent: Date.now(),
          updated_by: request.epadAuth.username,
        },
        {
          where: {
            id: lastRecordOfRegisteredServer.dataValues.id,
          },
        }
      );
      // send an email tempGeneratedEmailValidationCode
      try {
        emailSentResult = await fastify.sendEmailInternal(
          config.notificationEmail.auth.user,
          tempEmail,
          'ePad register api key email verification code',
          tempGeneratedEmailValidationCode
        );
        fastify.log.info(`sent email succeed, result : ${emailSentResult}`);
      } catch (error) {
        reply.send(new InternalError('email sending issue', error));
        return;
      }
      reply.code(200).send('validationsent');
    } else {
      fastify.log.info('user sent validation code we are verifiying and will return apikey');
      if (lastRecordOfRegisteredServer !== undefined) {
        const tempGenerateAppKey = fastify.generateAppKeyInternal();
        await models.registeredapps.update(
          {
            apikey: tempGenerateAppKey,
            updatetime: Date.now(),
            updated_by: request.epadAuth.username,
          },
          {
            where: {
              id: lastRecordOfRegisteredServer.dataValues.id,
            },
          }
        );
        // send an email for api key tempGenerateAppKey
        try {
          emailSentResult = await fastify.sendEmailInternal(
            config.notificationEmail.auth.user,
            tempEmail,
            'ePad api key',
            tempGenerateAppKey
          );
          fastify.log.info(`sent email succeed, result : ${emailSentResult}`);
        } catch (error) {
          reply.send(new InternalError('email sending issue', error));
          return;
        }
        reply.code(200).send('validated');
      } else {
        reply.code(200).send('invalid');
      }
    }
  });
  // register host for app section ends

  fastify.decorate('validateRequestBodyFields', (name, id) => {
    if (!name || !id) {
      return EpadError.messages.requiredField;
      // eslint-disable-next-line no-else-return
    } else if ((name.length === 2 && name.includes(' ')) || name.length < 2) {
      return EpadError.messages.shortName;
    } else if (id.includes('/') || id.includes(' ')) {
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
          request.body.assignees.forEach((el) => {
            assigneeInfoArr.push(fastify.findUserIdInternal(el));
          });
        }

        Promise.all(assigneeInfoArr)
          .then((results) => {
            results.forEach((el) => {
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
              .then((worklist) => {
                const relationArr = [];
                assigneeIDArr.forEach((el) => {
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
                  request.body.requirements.forEach((req) => {
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
                  .catch((relationErr) => {
                    reply.send(
                      new InternalError('Creating worklist user association', relationErr)
                    );
                  });
              })
              .catch((worklistCreationErr) => {
                if (
                  worklistCreationErr.errors &&
                  worklistCreationErr.errors[0] &&
                  worklistCreationErr.errors[0].type &&
                  worklistCreationErr.errors[0].type === 'unique violation'
                )
                  reply.send(new ResourceAlreadyExistsError('Worklist', request.body.worklistId));
                else reply.send(new InternalError('Creating worklist', worklistCreationErr));
              });
          })
          .catch((userIDErr) => {
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
    request.body.assigneeList.forEach((assignee) => {
      idPromiseArray.push(
        models.user.findOne({ where: { username: assignee }, attributes: ['id'] })
      );
    });

    Promise.all(idPromiseArray)
      .then((result) => {
        result.forEach((el) => {
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
        newAssigneeIdArr.forEach((el) => {
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

        // TODO for each item in the worklist check if the user has access to the project and add user to project if (s)he doesn't

        // if already existing is not in new list remove it
        existingAssigneeArr.forEach((el) => {
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
                .then((res) => {
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
                    .catch((err) => {
                      reply.send(
                        new InternalError(
                          `Worklist assignee update calculate completeness ${request.params.worklist}`,
                          err
                        )
                      );
                    });
                })
                .catch((err) => {
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
          .catch((error) => {
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
      .catch((err) => {
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

  fastify.decorate(
    'updateCompletenessOnDeleteAssignee',
    async (userID, worklistID) =>
      new Promise(async (resolve, reject) => {
        try {
          const completenessDeleteArr = [];
          const username = await fastify.findUserNameInternal(userID);
          const worklistStudy = await models.worklist_study.findAll({
            where: { worklist_id: worklistID },
            attributes: ['id'],
            raw: true,
          });
          worklistStudy.forEach((el) => {
            completenessDeleteArr.push(
              models.worklist_study_completeness.destroy({
                where: { worklist_study_id: el.id, assignee: username },
              })
            );
          });
          Promise.all(completenessDeleteArr)
            .then(() => resolve())
            .catch((err) => reject(err));
        } catch (err) {
          reject();
        }
      })
  );

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
        .catch((err) => reply.send(new InternalError('Updating worklist', err)));
    }
  });

  fastify.decorate('isAssigneeOfWorklist', async (worklistId, username) => {
    try {
      const worklists = await models.worklist.findAll({
        where: {
          '$users.username$': username,
          worklistid: worklistId,
        },
        include: ['users'],
      });
      return worklists && worklists.length === 1;
    } catch (err) {
      fastify.log.error(
        `Could not check if the user ${username} is an assignee of the worklist ${worklistId}`
      );
      return false;
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
      .then((userId) => {
        models.worklist_user
          .findAll({ where: { user_id: userId }, attributes: ['worklist_id'] })
          .then((worklistIDs) => {
            const worklistPromises = [];
            worklistIDs.forEach((listID) => {
              worklistPromises.push(
                models.worklist.findOne({
                  where: { id: listID.dataValues.worklist_id },
                })
              );
            });

            Promise.all(worklistPromises)
              .then((worklist) => {
                const result = [];
                worklist.forEach((el) => {
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
              .catch((err) => {
                reply.send(new InternalError('Get worklists of assignee', err));
              });
          })
          .catch((err) => {
            reply.send(new InternalError('Get worklists of assignee', err));
          });
      })
      .catch((err) => {
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

  fastify.decorate(
    'checkAndAddProjectRights',
    (worklistId, projectId, epadAuth) =>
      new Promise((resolve, reject) => {
        const addAssignees = [];
        // check if all assignees has rights, add if not
        fastify.orm
          .query(
            `SELECT user_id FROM worklist_user WHERE worklist_id = ${worklistId} AND user_id NOT IN 
        (SELECT user_id FROM project_user WHERE project_id = ${projectId});`
          )
          .then((assigneesWithNoRights) => {
            // the return value is an array of values array and column def array
            if (assigneesWithNoRights[0].length > 0) {
              // we need to add them
              // just push to relationPromiseArr
              for (let i = 0; i < assigneesWithNoRights[0].length; i += 1) {
                addAssignees.push(
                  fastify.upsert(
                    models.project_user,
                    {
                      role: 'Collaborator',
                      updatetime: Date.now(),
                      project_id: projectId,
                      user_id: assigneesWithNoRights[0][i].user_id,
                    },
                    { project_id: projectId, user_id: assigneesWithNoRights[0][i].user_id },
                    epadAuth.username // TODO should we add as admin, user may not even have rights
                  )
                );
              }
              const useridonly = assigneesWithNoRights[0].map((item) => item.user_id);
              Promise.all(addAssignees)
                .then(() => resolve(useridonly))
                .catch((err) => reject(err));
            } else resolve();
          })
          .catch((err) => reject(err));
      })
  );

  fastify.decorate('assignSubjectToWorklist', async (request, reply) => {
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
    promises.push(
      models.user.findOne({
        where: { username: request.epadAuth.username },
        attributes: ['id'],
      })
    );

    const result = await Promise.all(promises);
    let missingData = false;
    for (let i = 0; i < result.length; i += 1)
      ids.push(result[i] && result[i].dataValues ? result[i].dataValues.id : (missingData = true));
    if (missingData) {
      reply.send(
        new InternalError('Creating worklist subject association', new Error('Missing data'))
      );
      return;
    }
    const addedUserIds = await fastify.checkAndAddProjectRights(ids[0], ids[1], request.epadAuth);
    // go to project_subject get the id of where project and subject matches
    let projectSubject;
    try {
      projectSubject = await models.project_subject.findOne({
        where: { project_id: ids[1], subject_id: ids[2] },
        include: [models.study],
      });
    } catch (err) {
      reply.send(
        new InternalError(
          'Creating worklist subject association in db. Get project_subject relation',
          err
        )
      );
      return;
    }
    const studyUIDs = [];
    const studyIDs = [];
    try {
      for (let i = 0; i < projectSubject.dataValues.studies.length; i += 1) {
        studyUIDs.push(projectSubject.dataValues.studies[i].dataValues.studyuid);
        studyIDs.push(projectSubject.dataValues.studies[i].dataValues.id);
      }
    } catch (err) {
      reply.send(
        new InternalError(
          'Creating worklist subject association in db. Create studyUID, studyID arrays',
          err
        )
      );
      return;
    }
    try {
      // TODO get it from db instead
      // get studyDescriptions
      const studyDetails = await fastify.getStudiesInternal(
        {
          project_id: ids[1],
          subject_id: ids[2],
        },
        request.params,
        request.epadAuth,
        false,
        request.query
      );
      studyDetails.forEach((el) => {
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
      reply.send(
        new InternalError(
          'Creating worklist subject association in db. Creating worklist_study promises',
          err
        )
      );
      return;
    }
    try {
      await Promise.all(relationPromiseArr);
      const userNamePromises = [];
      // get user id's from worklist_user for the worklist
      const userIds = await models.worklist_user.findAll({
        where: { worklist_id: ids[0] },
        attributes: ['user_id'],
      });
      // findUsernames by userid's
      userIds.forEach((el) => {
        userNamePromises.push(fastify.findUserNameInternal(el.dataValues.user_id));
      });
      const usernameResult = await Promise.all(userNamePromises);
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
      await Promise.all(updateCompPromises);
      reply
        .code(200)
        .send(
          addedUserIds && addedUserIds.length > 0
            ? `Saving successful. Added users ${JSON.stringify(addedUserIds)} to project ${ids[1]}`
            : `Saving successful`
        );
    } catch (err) {
      reply.send(new InternalError('Updating completeness in worklist study association', err));
    }
  });

  fastify.decorate('assignStudyToWorklist', (request, reply) => {
    fastify
      .assignStudyToWorklistInternal(request.query, request.params, request.epadAuth)
      .then((res) => reply.code(200).send(res))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'assignStudyToWorklistInternal',
    (query, params, epadAuth) =>
      new Promise(async (resolve, reject) => {
        const ids = [];
        const promises = [];

        promises.push(
          models.worklist.findOne({
            where: { worklistid: params.worklist },
            attributes: ['id'],
          })
        );
        promises.push(
          models.project.findOne({
            where: { projectid: params.project },
            attributes: ['id'],
          })
        );
        promises.push(
          models.subject.findOne({
            where: { subjectuid: params.subject },
            attributes: ['id'],
          })
        );
        promises.push(
          models.study.findOne({
            where: { studyuid: params.study },
            attributes: ['id'],
          })
        );
        promises.push(
          models.user.findOne({
            where: { username: epadAuth.username },
            attributes: ['id'],
          })
        );

        Promise.all(promises)
          .then(async (result) => {
            let missingData = false;
            // result[i] can be null when subject is not created before, just tests
            for (let i = 0; i < result.length; i += 1)
              // eslint-disable-next-line no-unused-expressions
              result[i] ? ids.push(result[i].dataValues.id) : (missingData = true);
            if (missingData) {
              reject(
                new InternalError('Creating worklist study association', new Error('Missing data'))
              );
            } else if (query.annotationStatus !== undefined) {
              // set annotation status
              // NOT_STARTED(1), IN_PROGRESS(2), DONE(3), ERROR(4), DELETE(0)
              // API should not accept ERROR(4)
              if (query.annotationStatus < 0 || query.annotationStatus > 3) {
                reject(
                  new InternalError(
                    'Setting annotation status ',
                    new Error(`Unknown status ${query.annotationStatus}`)
                  )
                );
              } else if (query.annotationStatus === 0) {
                // I get the user from the authentication 'cause only I can say I'm done with a case
                // delete the tuple so that we can go back to auto
                models.project_subject_study_series_user_status
                  .destroy({
                    where: {
                      worklist_id: ids[0],
                      study_id: ids[3],
                      subject_id: ids[2],
                      project_id: ids[1],
                      user_id: ids[4],
                    },
                  })
                  .then(() => resolve('Annotation status deleted successfully'))
                  .catch((err) => reject(new InternalError('Deleting annotation status', err)));
              } else {
                fastify
                  .upsert(
                    models.project_subject_study_series_user_status,
                    {
                      worklist_id: ids[0],
                      study_id: ids[3],
                      subject_id: ids[2],
                      project_id: ids[1],
                      user_id: ids[4],
                      annotationStatus: query.annotationStatus,
                      updatetime: Date.now(),
                    },
                    {
                      worklist_id: ids[0],
                      study_id: ids[3],
                      subject_id: ids[2],
                      project_id: ids[1],
                      user_id: ids[4],
                    },
                    epadAuth.username
                  )
                  .then(() => resolve('Annotation status updated successfully'))
                  .catch((err) => reject(new InternalError('Updating annotation status', err)));
              }
            } else {
              const seriesArr = await fastify.getSeriesDicomOrNotInternal(
                params,
                { filterDSO: 'true' },
                epadAuth
              );
              const sumOfImageCounts = _.reduce(
                seriesArr,
                (memo, series) => memo + series.numberOfImages,
                0
              );
              // check if all assignees have right to the project, and add
              const addedUserIds = await fastify.checkAndAddProjectRights(ids[0], ids[1], epadAuth);
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
                  epadAuth.username
                )
                .then(async () => {
                  try {
                    const userNamePromises = [];
                    // get user id's from worklist_user for the worklist
                    const userIds = await models.worklist_user.findAll({
                      where: { worklist_id: ids[0] },
                      attributes: ['user_id'],
                    });
                    // findUsernames by userid's
                    userIds.forEach((el) => {
                      userNamePromises.push(fastify.findUserNameInternal(el.dataValues.user_id));
                    });
                    Promise.all(userNamePromises)
                      .then((res) => {
                        const updateCompPromises = [];
                        // iterate over usernames array and updateCompleteness
                        res.forEach((username) =>
                          updateCompPromises.push(
                            fastify.updateWorklistCompleteness(
                              ids[1],
                              params.subject,
                              params.study,
                              username,
                              epadAuth
                            )
                          )
                        );
                        Promise.all(updateCompPromises)
                          .then(() => {
                            resolve(
                              addedUserIds && addedUserIds.length > 0
                                ? `Saving successful. Added users ${JSON.stringify(
                                    addedUserIds
                                  )} to project ${ids[1]}`
                                : `Saving successful`
                            );
                          })
                          .catch((err) =>
                            reject(
                              new InternalError(
                                'Updating completeness in worklist study association',
                                err
                              )
                            )
                          );
                      })
                      .catch((err) =>
                        reject(
                          new InternalError(
                            'Updating completeness in worklist study association',
                            err
                          )
                        )
                      );
                  } catch (err) {
                    reject(
                      new InternalError('Updating completeness in worklist study association', err)
                    );
                  }
                })
                .catch((err) => {
                  reject(new InternalError('Creating worklist study association in db', err));
                });
            }
          })
          .catch((err) => {
            reject(new InternalError('Creating worklist study association', err));
          });
      })
  );

  fastify.decorate('findUserNameInternal', (userid) => {
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

      request.body.forEach(async (el) => {
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
        .catch((err) => {
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

  fastify.decorate('getManualProgressMap', async (worklistId) => {
    // I could not create association with composite foreign key
    const manualProgress = await models.project_subject_study_series_user_status.findAll({
      where: { worklist_id: worklistId },
      raw: true,
      attributes: [
        'worklist_id',
        'project_id',
        'subject_id',
        'study_id',
        'user_id',
        'annotationStatus',
      ],
    });
    const manualProgressMap = {};
    for (let i = 0; i < manualProgress.length; i += 1) {
      manualProgressMap[
        `${manualProgress[i].worklist_id}-${manualProgress[i].project_id}-${manualProgress[i].subject_id}-${manualProgress[i].study_id}-${manualProgress[i].user_id}`
      ] = manualProgress[i].annotationStatus;
    }
    return manualProgressMap;
  });

  fastify.decorate(
    'getManualProgressForUser',
    (manualProgressMap, worklistId, projectId, subjectId, studyId, userId) => {
      switch (manualProgressMap[`${worklistId}-${projectId}-${subjectId}-${studyId}-${userId}`]) {
        case 2:
          return 50;
        case 3:
          return 100;
        default:
          return 0;
      }
    }
  );

  fastify.decorate('getWorklistStudies', async (request, reply) => {
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
        include: ['users'],
      });
      workListName = worklist.dataValues.name;
      worklistIdKey = worklist.dataValues.id;
      worklistDuedate = worklist.dataValues.duedate;
      let userId;
      for (let i = 0; i < worklist.users.length; i += 1) {
        if (worklist.users[i].username === request.params.user) {
          userId = worklist.users[i].id;
          break;
        }
      }
      if (!userId) {
        reply.send(
          new BadRequestError(
            `Getting subjects of the worklist ${request.params.worklist}`,
            new Error(`User ${request.params.user} is not an assignee of the worklist`)
          )
        );
      } else if (
        request.epadAuth.username !== request.params.user &&
        request.epadAuth.username !== worklist.dataValues.creator
      ) {
        reply.send(
          new UnauthorizedError('User is not the assignee or the creator of the worklist')
        );
      } else {
        // TODO if there are no requirements, the worklist completeness is not filled and adding progress to join makes the query to return nothing
        list = await models.worklist_study.findAll({
          where: {
            worklist_id: worklistIdKey,
          },
          include: [
            {
              model: models.worklist_study_completeness,
              as: 'progress',
              required: false,
              where: { assignee: request.epadAuth.username },
            },
            models.subject,
            models.study,
          ],
        });
        const manualProgressMap = await fastify.getManualProgressMap(worklist.dataValues.id);
        const result = [];
        for (let i = 0; i < list.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const projectId = await models.project.findOne({
            where: { id: list[i].dataValues.project_id },
            attributes: ['projectid'],
          });
          if (
            manualProgressMap[
              `${list[i].dataValues.worklist_id}-${list[i].dataValues.project_id}-${list[i].dataValues.subject_id}-${list[i].dataValues.study_id}-${userId}`
            ]
          ) {
            const completeness = fastify.getManualProgressForUser(
              manualProgressMap,
              list[i].dataValues.worklist_id,
              list[i].dataValues.project_id,
              list[i].dataValues.subject_id,
              list[i].dataValues.study_id,
              userId
            );
            result.push({
              completionDate: list[i].dataValues.completedate,
              projectID: projectId.dataValues.projectid,
              sortOrder: list[i].dataValues.sortorder,
              startDate: list[i].dataValues.startdate,
              subjectID: list[i].dataValues.subject.dataValues.subjectuid,
              studyUID: list[i].dataValues.study.dataValues.studyuid,
              studyDate: list[i].dataValues.study.dataValues.studydate,
              workListID: request.params.worklist,
              workListName,
              worklistDuedate,
              subjectName: list[i].dataValues.subject.dataValues.name,
              studyDescription: list[i].dataValues.study.dataValues.description,
              completeness,
              progressType: 'MANUAL',
            });
          } else {
            result.push({
              completionDate: list[i].dataValues.completedate,
              projectID: projectId.dataValues.projectid,
              sortOrder: list[i].dataValues.sortorder,
              startDate: list[i].dataValues.startdate,
              subjectID: list[i].dataValues.subject.dataValues.subjectuid,
              studyUID: list[i].dataValues.study.dataValues.studyuid,
              studyDate: list[i].dataValues.study.dataValues.studydate,
              workListID: request.params.worklist,
              workListName,
              worklistDuedate,
              subjectName: list[i].dataValues.subject.dataValues.name,
              studyDescription: list[i].dataValues.study.dataValues.description,
              completeness:
                list[i].dataValues.progress && list[i].dataValues.progress[0]
                  ? list[i].dataValues.progress[0].dataValues.completeness
                  : 0, // I get only the specific user's progress
              progressType:
                list[i].dataValues.progress && list[i].dataValues.progress[0] ? 'AUTO' : 'MANUAL',
            });
          }
        }
        reply.code(200).send(Object.values(result));
      }
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
              `The template uid sent in the url ${templateUid} is different than the template that is sent ${request.body.TemplateContainer.uid}. Using ${request.body.TemplateContainer.uid} `
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
              `Adding project template relation for template ${templateUid} with project ${project.projectid}`,
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
          reply.code(200).send(`Template deleted from project`);
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

  fastify.decorate('deleteTemplateFromDB', (params) =>
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
              { ...request.query, filterDSO: 'true' }
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
            } else {
              // check if the uid is in dicomweb
              studies = await fastify.getPatientStudiesInternal(
                { subject: subjectInfo.subjectuid },
                undefined,
                request.epadAuth,
                { ...request.query, filterDSO: 'true' }
              );
              if (studies.length > 0) {
                reply.send(new ResourceAlreadyExistsError('Subject', request.body.subjectUid));
                return;
              }
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
            reply.send(
              new ResourceAlreadyExistsError(
                'Subject',
                request.params.subject ? request.params.subject : request.body.subjectUid
              )
            );
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
            // if the studies are empty try using getStudiesInternal to see if there are manual studies
            if (studies.length === 0) {
              studies = await fastify.getStudiesInternal(
                {
                  subject_id: subject.id,
                },
                request.params,
                request.epadAuth,
                false,
                { ...request.query, filterDSO: 'true' }
              );
            }
            for (let i = 0; i < studies.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.addPatientStudyToProjectDBInternal(
                studies[i],
                projectSubject,
                request.epadAuth,
                { ...request.query, filterDSO: 'true' }
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
  fastify.decorate(
    'addSubjectToDBIfNotExistInternal',
    (subjectInfo, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          // see if subject exists
          let subject = await models.subject.findOne({
            where: { subjectuid: subjectInfo.subjectuid.replace('\u0000', '').trim() },
          });
          if (subject === null) {
            subject = await models.subject.create({
              subjectuid: subjectInfo.subjectuid.replace('\u0000', '').trim(),
              name: subjectInfo.name.replace('\u0000', '').trim(),
              gender: subjectInfo.gender,
              dob: subjectInfo.dob,
              creator: epadAuth.username,
              updatetime: Date.now(),
              createdtime: Date.now(),
            });
          }
          resolve(subject);
        } catch (err) {
          reject(err);
        }
      })
  );

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

  fastify.decorate(
    'getAccessibleProjects',
    (epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const collaboratorProjIds =
            (epadAuth.projectToRole &&
              epadAuth.projectToRole
                .filter((role) => role.endsWith('Collaborator'))
                .map((item) => item.split(':')[0])) ||
            [];
          const aimAccessProjIds =
            (epadAuth.projectToRole &&
              epadAuth.projectToRole
                .filter((role) => role && !role.endsWith('Collaborator'))
                .map((item) => item.split(':')[0])) ||
            [];
          // TODO should we access public project's aims? removing it for now
          // const projects = await models.project.findAll({
          //   where: { type: 'Public' },
          //   attributes: ['projectid'],
          //   raw: true,
          // });
          // if (projects) {
          //   for (let i = 0; i < projects.length; i += 1) {
          //     if (
          //       !aimAccessProjIds.includes(projects[i].projectid) &&
          //       !collaboratorProjIds.includes(projects[i].projectid)
          //     )
          //       aimAccessProjIds.push(projects[i].projectid);
          //   }
          // }
          resolve({ collaboratorProjIds, aimAccessProjIds });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getProjectAimCountMap',
    (params, epadAuth, field) =>
      new Promise(async (resolve, reject) => {
        try {
          let whereJSON = {};
          if (params.project) whereJSON = { ...whereJSON, '$project.projectid$': params.project };
          if (params.subject) whereJSON = { ...whereJSON, subject_uid: params.subject };
          if (params.study) whereJSON = { ...whereJSON, study_uid: params.study };
          whereJSON = {
            ...whereJSON,
            ...fastify.qryNotDeleted(),
          };
          // check if collaborator, then only his own
          if (params.project) {
            const isCollaborator = fastify.isCollaborator(params.project, epadAuth);
            if (isCollaborator) whereJSON = { ...whereJSON, '$users.username$': epadAuth.username };
          }
          const projectAims = await models.project_aim.findAll({
            where: whereJSON,
            attributes: ['aim_uid', field],
            include: [
              { model: models.project },
              { model: models.user, as: 'users', required: false }, // left outer, just in case
            ],
          });
          // if there is a project and user has no role in project (public project)
          // TODO discuss Chris, Daniel
          if (params.project && !fastify.hasRoleInProject(params.project, epadAuth)) {
            resolve({});
          }
          const aimsCountMap = {};
          // if all or undefined no aim counts
          for (let i = 0; i < projectAims.length; i += 1) {
            // add to the map or increment
            if (!aimsCountMap[projectAims[i].dataValues[field]])
              aimsCountMap[projectAims[i].dataValues[field]] = 0;
            aimsCountMap[projectAims[i].dataValues[field]] += 1;
          }
          resolve(aimsCountMap);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getUnassignedSubjectsfromDicomweb',
    (params, epadAuth, noSort = false) =>
      new Promise(async (resolve, reject) => {
        try {
          const dbStudyUIDs = await fastify.getDBStudies();
          let results = await fastify.getPatientsInternal(
            params,
            dbStudyUIDs,
            epadAuth,
            true,
            '0020000D',
            'studyUID',
            true
          );
          if (!noSort) results = _.sortBy(results, 'subjectName');
          resolve(results);
        } catch (err) {
          reject(new InternalError(`Getting DB StudyUIDs`, err));
        }
      })
  );

  fastify.decorate('getSubjectUIDsFromProject', async (projectID) => {
    try {
      const subjects = await models.subject.findAll({
        include: [
          {
            model: models.project_subject,
            include: [{ model: models.project, where: { projectid: projectID } }],
          },
        ],
      });
      return subjects.map((subject) => subject.dataValues.subjectuid);
    } catch (err) {
      fastify.log.error(
        `Couldn't retrieve list of subjectuids from project ${projectID} Error: ${err.message}`
      );
      return [];
    }
  });

  fastify.decorate('getSubjectUIDsFromAimsInProject', async (projectID) => {
    try {
      // TODO do I need to check if the user has access?
      const projectAims = await models.project_aim.findAll({
        include: [
          {
            model: models.project,
            where: { projectid: projectID },
          },
        ],
        where: fastify.qryNotDeleted(),
        attributes: ['subject_uid'],
        group: ['subject_uid'],
      });
      return projectAims.map((subject) => subject.dataValues.subject_uid);
    } catch (err) {
      fastify.log.error(
        `Couldn't retrieve list of subjectuids from project ${projectID} Error: ${err.message}`
      );
      return [];
    }
  });

  fastify.decorate('getPatientsFromProject', async (request, reply) => {
    try {
      if (request.params.project === config.unassignedProjectID && config.pollDW === 0) {
        const results = await fastify.getUnassignedSubjectsfromDicomweb(
          request.params,
          request.epadAuth
        );
        reply.code(200).send(results);
      } else {
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
          const projectSubjectsWhereJSON =
            request.params.project && request.params.project !== config.XNATUploadProjectID
              ? { project_id: project.id }
              : {};
          let subjects = [];
          if (request.params.project === config.unassignedProjectID) {
            subjects = await models.subject.findAll({
              where: { '$project_subjects.project_id$': null },
              include: [
                {
                  model: models.project_subject,
                },
                { model: models.study, attributes: ['exam_types', 'id'] },
              ],
            });
          } else {
            subjects = await models.subject.findAll({
              include: [
                {
                  model: models.project_subject,
                  where: projectSubjectsWhereJSON,
                  include: [{ model: models.study, attributes: ['exam_types', 'id'] }],
                },
              ],
            });
          }
          let results = [];
          let aimsCountMap = {};
          // if all or undefined no aim counts
          if (
            request.params.project !== config.XNATUploadProjectID &&
            request.params.project !== config.unassignedProjectID
          ) {
            aimsCountMap = await fastify.getProjectAimCountMap(
              {
                project: request.params.project,
              },
              request.epadAuth,
              'subject_uid'
            );
          }

          for (let i = 0; i < subjects.length; i += 1) {
            let examTypes = [];
            const studyIds = {};
            if (subjects[i].dataValues.project_subjects.length > 0) {
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
            } else if (subjects[i].dataValues.studies.length > 0) {
              // if it is for nonassigned it is coming directly as studies
              for (let k = 0; k < subjects[i].dataValues.studies.length; k += 1) {
                if (!studyIds[subjects[i].dataValues.studies[k].dataValues.id]) {
                  studyIds[subjects[i].dataValues.studies[k].dataValues.id] = true;
                  const studyExamTypes = JSON.parse(
                    subjects[i].dataValues.studies[k].dataValues.exam_types
                  );
                  examTypes = fastify.arrayUnique(examTypes.concat(studyExamTypes));
                }
              }
            }
            results.push({
              subjectName: subjects[i].dataValues.name,
              subjectID: fastify.replaceNull(subjects[i].dataValues.subjectuid),
              projectID: request.params.project,
              insertUser: subjects[i].dataValues.creator ? subjects[i].dataValues.creator : '',
              xnatID: '', // no xnatID should remove
              insertDate: subjects[i].dataValues.createdtime
                ? fastify.getFormattedDate(subjects[i].dataValues.createdtime)
                : '',
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
      .then((result) => {
        reply.code(200).send(result);
        if (config.env !== 'test')
          new EpadNotification(request, 'Deleted subject', request.params.subject, true).notify(
            fastify
          );
      })
      .catch((err) => reply.send(err));
  });
  fastify.decorate(
    'deleteSeriesAimProjectRels',
    (params, username) =>
      new Promise(async (resolve, reject) => {
        try {
          await fastify.deleteAimDB({ series_uid: params.series }, username);
          resolve();
        } catch (err) {
          reject(new InternalError(`Deletion of aim project relation from ${params.series}`, err));
        }
      })
  );
  fastify.decorate(
    'deleteSubjectFromAllInternal',
    (params, projectSubjects, subject, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
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
          if (subject !== null) {
            await fastify.deleteAimsInternal(
              { subject: subject.subjectuid, project: params.project },
              epadAuth,
              { all: 'true' },
              undefined,
              true
            );
            // delete the subject
            await models.subject.destroy({
              where: { id: subject.id },
            });
          }
          if (!config.disableDICOMSend) await fastify.deleteSubjectInternal(params, epadAuth);
          else fastify.log.info('DICOM Send disabled. Skipping subject DICOM delete');
          resolve(
            `Subject deleted from system and removed from ${projectSubjects.length} projects`
          );
        } catch (err) {
          reject(new InternalError(`Subject deletion from system ${params.subject}`, err));
        }
      })
  );

  fastify.decorate(
    'deleteSubjectFromProjectInternal',
    (params, query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          if (
            (params.project === config.XNATUploadProjectID ||
              params.project === config.unassignedProjectID) &&
            query.all !== 'true'
          ) {
            reject(
              new BadRequestError(
                `Deleting subject from ${params.project} project`,
                new Error(`Not supported without system delete`)
              )
            );
          }
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
            let projectSubject = null;
            if (subject !== null) {
              projectSubject = await models.project_subject.findOne({
                where: { project_id: project.id, subject_id: subject.id },
              });
            }
            if (projectSubject === null) {
              if (query.all !== 'true') {
                reject(
                  new BadRequestError(
                    'Deleting subject from project',
                    new ResourceNotFoundError('Project subject association', params.project)
                  )
                );
              } else {
                let projectSubjects = [];
                if (subject !== null) {
                  projectSubjects = await models.project_subject.findAll({
                    where: { subject_id: subject.id },
                  });
                }
                const result = await fastify.deleteSubjectFromAllInternal(
                  params,
                  projectSubjects,
                  subject,
                  epadAuth
                );
                resolve(result);
              }
            } else {
              await models.project_subject_study.destroy({
                where: { proj_subj_id: projectSubject.id },
              });
              await models.project_subject.destroy({
                where: { project_id: project.id, subject_id: subject.id },
              });
              await models.worklist_study.destroy({
                where: { project_id: project.id, subject_id: subject.id },
              });
              await fastify.deleteAimsInternal(
                { subject: subject.subjectuid, project: params.project },
                epadAuth,
                { all: query.all },
                undefined,
                true
              );

              // if delete from all or it doesn't exist in any other project, delete from system
              try {
                const projectSubjects = await models.project_subject.findAll({
                  where: { subject_id: subject.id },
                });
                if (query.all && query.all === 'true') {
                  const result = await fastify.deleteSubjectFromAllInternal(
                    params,
                    projectSubjects,
                    subject,
                    epadAuth
                  );
                  resolve(result);
                } else if (projectSubjects.length === 0) {
                  await models.project_subject_study.destroy({
                    where: { proj_subj_id: projectSubject.id },
                  });
                  await models.worklist_study.destroy({
                    where: { project_id: project.id, subject_id: subject.id },
                  });
                  await fastify.deleteAimsInternal(
                    { subject: subject.subjectuid, project: params.project },
                    epadAuth,
                    { all: query.all },
                    undefined,
                    true
                  );
                  // delete the subject
                  await models.subject.destroy({
                    where: { id: subject.id },
                  });
                  if (!config.disableDICOMSend)
                    await fastify.deleteSubjectInternal(params, epadAuth);
                  else fastify.log.info('DICOM Send disabled. Skipping subject DICOM delete');
                  resolve(`Subject deleted from system as it didn't exist in any other project`);
                } else resolve(`Subject not deleted from system as it exists in other project`);
              } catch (deleteErr) {
                reject(
                  new InternalError(
                    `Study assosiation deletion during subject ${params.subject} deletion from project`,
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

  fastify.decorate(
    'getFileUidsForProject',
    (params) =>
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
                'Getting files from project',
                new ResourceNotFoundError('Project', params.project)
              )
            );
          else {
            const fileUids = [];
            const projectFiles = await models.project_file.findAll({
              where: { project_id: project.id },
            });
            // projects will be an array of Project instances with the specified name
            for (let i = 0; i < projectFiles.length; i += 1) {
              fileUids.push(projectFiles[i].file_uid);
            }

            resolve(fileUids);
          }
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getReportFromDB',
    async (params, report, epadAuth, bestResponseType, metric, template, shapes) => {
      try {
        const type = fastify.getReportType(report, metric, template, shapes);
        const projSubjReport = await models.project_subject_report.findOne({
          where: {
            '$subject.subjectuid$': params.subject,
            '$project.projectid$': params.project,
            type,
          },
          include: [{ model: models.project }, { model: models.subject }],
        });
        if (projSubjReport) {
          if (bestResponseType) {
            // get bestresponse for waterfall
            // if old, missing response cat, should be updated
            if (
              !projSubjReport.dataValues.response_cat_min ||
              !projSubjReport.dataValues.response_cat_baseline
            )
              return null;
            if (bestResponseType.toLowerCase() === 'min')
              return {
                bestResponse: Number(projSubjReport.dataValues.best_response_min),
                responseCat: projSubjReport.dataValues.response_cat_min,
              };
            if (bestResponseType.toLowerCase() === 'baseline')
              return {
                bestResponse: Number(projSubjReport.dataValues.best_response_baseline),
                responseCat: projSubjReport.dataValues.response_cat_baseline,
              };
            fastify.log.warn(`Unsupported bestResponseType ${bestResponseType}`);
            return null;
          }
          // if not bestresponse, I want the actual report
          if (projSubjReport.dataValues.report) {
            const reportJson = JSON.parse(projSubjReport.dataValues.report);
            // if the user is a collaborator (s)he should only see his/her report
            if (fastify.isCollaborator(params.project, epadAuth)) {
              if (reportJson[epadAuth.username])
                return { [epadAuth.username]: reportJson[epadAuth.username] };
              return null;
            }
            return reportJson;
          }
        }
        if (bestResponseType) return { bestResponse: null, responseCat: null };
        return null;
      } catch (err) {
        throw new InternalError(
          `Getting report ${report} from params ${JSON.stringify(params)}`,
          err
        );
      }
    }
  );

  fastify.decorate('getProjectAims', async (request, reply) => {
    try {
      // sort by name when retrieving list of aims instead of creation date
      const filter = { sort: 'name<string>' };
      if (request.query.format === 'returnTable' && request.query.templatecode) {
        filter.template = request.query.templatecode;
      }
      let result;
      // check for saved reports
      if (request.query.report) {
        switch (request.query.report) {
          case 'RECIST':
            // should be one patient
            if (request.params.subject) {
              result = await fastify.getReportFromDB(
                request.params,
                request.query.report,
                request.epadAuth
              );
              if (result) {
                if (!result.tLesionNames) {
                  // new format should have usernames
                  reply.code(200).send(result);
                  return;
                }
                // if it is the old format in db. update reports and try one more time
                try {
                  fastify.log.info('Found a patient with old recist report. Trying to update');
                  const projectId = await fastify.findProjectIdInternal(request.params.project);
                  await fastify.updateReports(
                    projectId,
                    request.params.project,
                    request.params.subject
                  );
                  result = await fastify.getReportFromDB(
                    request.params,
                    request.query.report,
                    request.epadAuth
                  );
                  if (result && !result.tLesionNames) {
                    reply.code(200).send(result);
                    return;
                  }
                } catch (reportErr) {
                  fastify.log.warn(
                    `Could not update the report for patient ${request.params.subject} Error: ${reportErr.message}`
                  );
                }
              }
            } else {
              reply.send(new BadRequestError('Recist Report', new Error('Subject required')));
              return;
            }
            break;
          default:
            fastify.log.info(`Report ${request.query.report} not in db. trying to generate`);
        }
      }
      // if they just want counts, get it from mariadb don't bother couchdb
      // would not have series with no aims
      // it returns the counts of one level below, study aim counts for subject/aims, series aim counts for study/aims, image aim counts for series/aims
      if (request.query.format === 'count') {
        let { field } = request.query;
        if (!field) {
          if (
            request.params.project &&
            request.params.subject &&
            request.params.study &&
            request.params.series
          )
            field = 'image_uid';
          if (
            request.params.project &&
            request.params.subject &&
            request.params.study &&
            !request.params.series
          )
            field = 'series_uid';
          if (
            request.params.project &&
            request.params.subject &&
            !request.params.study &&
            !request.params.series
          )
            field = 'study_uid';
          if (
            request.params.project &&
            !request.params.subject &&
            !request.params.study &&
            !request.params.series
          )
            field = 'subject_uid';
        }
        const aimCountMap = await fastify.getProjectAimCountMap(
          request.params,
          request.epadAuth,
          field
        );
        reply.code(200).send(aimCountMap);
        return;
      }
      result = await fastify.getAimsInternal(
        request.query.format,
        request.params,
        filter,
        request.epadAuth,
        request.query.bookmark,
        request
      );
      if (request.query.report) {
        const collab = fastify.isCollaborator(request.params.project, request.epadAuth);
        switch (request.query.report) {
          case 'RECIST':
            // should be one patient
            if (request.params.subject)
              result = fastify.getRecist(result.rows, request, collab, request.epadAuth);
            else {
              reply.send(new BadRequestError('Recist Report', new Error('Subject required')));
              return;
            }
            break;
          case 'Longitudinal':
            if (request.params.subject) {
              result = await fastify.getLongitudinal(
                result.rows,
                undefined,
                undefined,
                request,
                request.query.metric,
                request.query.html,
                collab,
                request.epadAuth
              );
            } else {
              reply.send(new BadRequestError('Longitudinal Report', new Error('Subject required')));
              return;
            }

            break;
          default:
            break;
        }
      } else {
        switch (request.query.format) {
          case 'returnTable':
            result = fastify.fillTable(
              result.rows,
              request.query.templatecode,
              request.query.columns.split(','),
              request.query.shapes
            );
            break;
          case 'stream':
            reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
            break;
          case 'summary':
            result.rows = result.rows.map((obj) => ({ ...obj, projectID: request.params.project }));
            break;
          default:
            if (request.query.longitudinal_ref) {
              const aimsByName = {};
              const aimsByTUID = {};
              let tUIDCount = 0;
              result.rows.forEach((aim) => {
                const name = aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
                  '~'
                )[0];
                const studyDate =
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startDate
                    .value;
                let type;
                // recist
                if (
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imagingObservationEntityCollection &&
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imagingObservationEntityCollection.ImagingObservationEntity[0]
                    .imagingObservationCharacteristicCollection &&
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imagingObservationEntityCollection.ImagingObservationEntity[0].imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0].label.value.toLowerCase() ===
                    'type'
                )
                  type =
                    aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                      .imagingObservationEntityCollection.ImagingObservationEntity[0]
                      .imagingObservationCharacteristicCollection
                      .ImagingObservationCharacteristic[0].typeCode[0]['iso:displayName'].value;
                // recist v2
                if (
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imagingObservationEntityCollection &&
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imagingObservationEntityCollection.ImagingObservationEntity[0]
                    .imagingObservationCharacteristicCollection &&
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imagingObservationEntityCollection.ImagingObservationEntity[0]
                    .imagingObservationCharacteristicCollection
                    .ImagingObservationCharacteristic[1] &&
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imagingObservationEntityCollection.ImagingObservationEntity[0].imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[1].label.value.toLowerCase() ===
                    'type'
                )
                  type =
                    aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                      .imagingObservationEntityCollection.ImagingObservationEntity[0]
                      .imagingObservationCharacteristicCollection
                      .ImagingObservationCharacteristic[1].typeCode[0]['iso:displayName'].value;

                if (name && !aimsByName[name]) aimsByName[name] = { aim, type };
                else if (
                  aimsByName[name].aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startDate
                    .value > studyDate
                )
                  aimsByName[name] = { aim, type };
                if (
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .trackingUniqueIdentifier
                ) {
                  if (
                    !aimsByTUID[
                      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                        .trackingUniqueIdentifier.root
                    ]
                  )
                    aimsByTUID[
                      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].trackingUniqueIdentifier.root
                    ] = { aim, type };
                  else if (
                    aimsByTUID[
                      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                        .trackingUniqueIdentifier.root
                    ].aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                      .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startDate
                      .value > studyDate
                  )
                    aimsByTUID[
                      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].trackingUniqueIdentifier.root
                    ] = { aim, type };
                  tUIDCount += 1;
                }
              });
              if (tUIDCount === result.length) result = aimsByTUID;
              else result = aimsByName;
            }
            break;
        }
      }
      reply.code(200).send(result);
    } catch (err) {
      reply.send(new InternalError(`Getting aims for project ${request.params.project}`, err));
    }
  });

  fastify.decorate('getProjectAim', async (request, reply) => {
    try {
      const result = await fastify.getAimsInternal(
        request.query.format,
        request.params,
        { aims: [request.params.aimuid] },
        request.epadAuth
      );
      if (request.query.format === 'stream') {
        reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
      }
      if (result.rows.length === 1) reply.code(200).send(result.rows[0]);
      else {
        reply.send(new ResourceNotFoundError('Aim', request.params.aimuid));
      }
    } catch (err) {
      reply.send(new InternalError(`Getting project aim`, err));
    }
  });

  fastify.decorate('saveAimToProject', async (request, reply) => {
    try {
      let aimUid = request.params.aimuid;
      if (
        request.params.project === config.XNATUploadProjectID ||
        request.params.project === config.unassignedProjectID
      ) {
        reply.send(
          new BadRequestError(
            `Saving aim ${aimUid} to project ${request.params.project}`,
            new Error(`Saving to ${request.params.project} project is not supported`)
          )
        );
      }
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
                  `Conflicting aimuids: the uid sent in the url ${aimUid} should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root ${aim.ImageAnnotationCollection.uniqueIdentifier.root}`
                )
              )
            );
          } else await fastify.saveAimInternal(aim, request.params.project);
          // TODO check if the aim is already associated with any project. warn and update the project_aim entries accordingly
        } else {
          // get aim to populate project_aim data

          const aimsRes = await fastify.getAimsInternal(
            'json',
            {}, // I do not need params, looking for a specific aim (not in this project)
            { aims: [aimUid] },
            request.epadAuth
          );
          [aim] = aimsRes.rows;
          // just update the projects
          await fastify.saveAimInternal(aimUid, request.params.project);
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
          const users = fastify.getAuthorUsernames(aim);
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
          let projectUid = '';
          if (typeof project === 'string') {
            projectId = await fastify.findProjectIdInternal(project);
            projectUid = project;
          } else {
            projectId = project.id;
            projectUid = project.dataValues.projectid;
          }
          const projectAimRec = await fastify.upsert(
            models.project_aim,
            {
              project_id: projectId,
              aim_uid: aimUid,
              template,
              subject_uid: subjectUid,
              study_uid: studyUid,
              series_uid: seriesUid,
              image_uid: imageUid,
              frame_id: Number(frameId),
              dso_series_uid: dsoSeriesUid,
              updatetime: Date.now(),
              deleted: null,
            },
            {
              project_id: projectId,
              aim_uid: aimUid,
            },
            epadAuth.username,
            transaction
          );

          const userIdPromises = [];
          users.forEach((el) => {
            userIdPromises.push(fastify.findUserIdInternal(el));
          });
          const userIds = await Promise.all(userIdPromises);
          const usersRelationArr = [];
          userIds.forEach((userId) => {
            usersRelationArr.push(
              fastify.upsert(
                models.project_aim_user,
                {
                  project_aim_id: projectAimRec.dataValues.id,
                  user_id: userId,
                  updatetime: Date.now(),
                },
                {
                  project_aim_id: projectAimRec.dataValues.id,
                  user_id: userId,
                },
                epadAuth.username,
                transaction
              )
            );
          });
          await Promise.all(usersRelationArr);

          // update the worklist completeness if in any
          await fastify.aimUpdateGateway(
            projectId,
            subjectUid,
            studyUid,
            users,
            epadAuth,
            transaction,
            projectUid
          );

          resolve('Aim project relation is created');
        } catch (err) {
          reject(
            new InternalError(
              `Aim project relation creation aimuid ${
                aim.ImageAnnotationCollection.uniqueIdentifier.root
              }, project ${project.projectid ? project.projectid : project}`,
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

  fastify.decorate('updateWorklistRequirement', async (worklistId, reqId, epadAuth, body) =>
    fastify.upsert(
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
    )
  );

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
        request.body.forEach((req) => {
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
          userIds.forEach((el) => {
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
            await Promise.all(updateCompPromises);
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

  // gets multiple users in an array
  fastify.decorate(
    'aimUpdateGateway',
    (projectId, subjectUid, studyUid, users, epadAuth, transaction, projectUid) =>
      new Promise(async (resolve, reject) => {
        try {
          for (let i = 0; i < users.length; i += 1)
            // eslint-disable-next-line no-await-in-loop
            await fastify.updateWorklistCompleteness(
              projectId,
              subjectUid,
              studyUid,
              users[i],
              epadAuth,
              transaction
            );
          // give warning but do not fail if you cannot update the report (it fails if dicoms are not in db)
          try {
            await fastify.updateReports(projectId, projectUid, subjectUid, transaction);
          } catch (reportErr) {
            fastify.log.warn(
              `Could not update the report for patient ${subjectUid} Error: ${reportErr.message}`
            );
          }
          resolve('Aim gateway completed!');
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getAndSavePrecomputeReports',
    (projectId, subjectId, result, epadAuth, transaction, collab) =>
      new Promise(async (resolve, reject) => {
        try {
          // recist is default the rest should be added to the config
          const precomputeReports = [{ report: 'RECIST' }, ...config.precomputeReports];
          const reportPromises = [];
          precomputeReports.forEach((pr) =>
            reportPromises.push(
              fastify
                .getAndSaveReport(
                  projectId,
                  subjectId,
                  result,
                  epadAuth,
                  pr.report,
                  pr.metric,
                  pr.template,
                  pr.shapes,
                  transaction,
                  collab
                )
                .catch((err) =>
                  fastify.log.error(
                    `Updating precompute report ${pr.report} ${pr.metric} for project ${projectId}, subject ${subjectId}. Error ${err.message}`
                  )
                )
            )
          );
          await Promise.all(reportPromises);
          resolve();
        } catch (err) {
          reject(
            new InternalError(
              `Updating precompute report for project ${projectId}, subject ${subjectId}`,
              err
            )
          );
        }
      })
  );

  // I have the report just extract the part and save it
  fastify.decorate(
    'savePrecomputeReports',
    (
      projectId,
      subjectId,
      reportMultiUser,
      report,
      metric,
      template,
      shapes,
      epadAuth,
      transaction
    ) =>
      new Promise(async (resolve, reject) => {
        try {
          // recist is default the rest should be added to the config
          const precomputeReports = [{ report: 'RECIST' }, ...config.precomputeReports];
          const reportPromises = [];
          precomputeReports.forEach((pr) => {
            if (
              pr.report === report &&
              (pr.metric === metric || pr.report === metric) &&
              pr.template === template &&
              pr.shapes === shapes
            )
              reportPromises.push(
                fastify
                  .saveReport2DB(
                    projectId,
                    subjectId,
                    reportMultiUser,
                    pr.report,
                    pr.metric,
                    pr.template,
                    pr.shapes,
                    epadAuth,
                    transaction
                  )
                  .catch((err) =>
                    fastify.log.error(
                      `Updating precompute report from ready report ${pr.report} ${pr.metric} for project ${projectId}, subject ${subjectId}. Error ${err.message}`
                    )
                  )
              );
          });
          await Promise.all(reportPromises);
          resolve();
        } catch (err) {
          reject(
            new InternalError(
              `Updating precompute report for project ${projectId}, subject ${subjectId}`,
              err
            )
          );
        }
      })
  );
  fastify.decorate(
    'getAndSaveReport',
    (
      projectId,
      subjectId,
      result,
      epadAuth,
      report,
      metric,
      template,
      shapes,
      transaction,
      collab
    ) =>
      new Promise(async (resolve, reject) => {
        try {
          const reportMultiUser =
            report === 'RECIST'
              ? fastify.getRecist(result, undefined, collab, epadAuth)
              : await fastify.getLongitudinal(
                  result,
                  template,
                  shapes,
                  undefined,
                  metric,
                  false,
                  collab,
                  epadAuth
                );
          if (reportMultiUser && reportMultiUser !== {}) {
            await fastify.saveReport2DB(
              projectId,
              subjectId,
              reportMultiUser,
              report,
              metric,
              template,
              shapes,
              epadAuth,
              transaction
            );
            fastify.log.info(`${report} ${metric}  report for ${subjectId} updated`);
            resolve(`${report} ${metric}  got and saved`);
          } else {
            fastify.log.info(
              `${report} ${metric} report generation failed, deleting old report for ${subjectId} if exists`
            );
            await models.project_subject_report.destroy({
              where: {
                project_id: projectId,
                subject_id: subjectId,
                type: fastify.getReportType(report, metric, template, shapes),
              },
            });
            reject(
              new InternalError(
                `Updating ${report} ${metric}  report for project ${projectId}, subject ${subjectId}`,
                new Error('Report not generated')
              )
            );
          }
        } catch (err) {
          reject(
            new InternalError(
              `Updating ${report} ${metric} report for project ${projectId}, subject ${subjectId}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'saveReport2DB',
    (
      projectId,
      subjectId,
      reportMultiUser,
      report,
      metric,
      template,
      shapes,
      epadAuth,
      transaction
    ) =>
      new Promise(async (resolve, reject) => {
        try {
          const type = fastify.getReportType(report, metric, template, shapes);
          // TODO how to support multiple readers in waterfall getting the first report for now
          const singleReport =
            Object.keys(reportMultiUser).length > 0
              ? reportMultiUser[Object.keys(reportMultiUser)[0]]
              : reportMultiUser;
          const bestResponseBaseline = singleReport.tRRBaseline
            ? fastify.getBestResponseVal(singleReport.tRRBaseline)
            : fastify.getBestResponse(reportMultiUser, 'BASELINE', metric);
          const bestResponseMin = singleReport.tRRMin
            ? fastify.getBestResponseVal(singleReport.tRRMin)
            : fastify.getBestResponse(reportMultiUser, 'MIN', metric);
          const responseCatBaseline = fastify.getResponseCategory(
            reportMultiUser,
            'BASELINE',
            metric
          );
          const responseCatMin = fastify.getResponseCategory(reportMultiUser, 'MIN', metric);
          await fastify.upsert(
            models.project_subject_report,
            {
              project_id: projectId,
              subject_id: subjectId,
              type,
              report: JSON.stringify(reportMultiUser),
              best_response_baseline: bestResponseBaseline,
              best_response_min: bestResponseMin,
              response_cat_baseline: responseCatBaseline,
              response_cat_min: responseCatMin,
              updated: true,
              updatetime: Date.now(),
            },
            {
              project_id: projectId,
              subject_id: subjectId,
              type,
            },
            epadAuth.username,
            transaction
          );
          resolve();
        } catch (err) {
          reject(
            new InternalError(
              `Updating ${report} ${metric} report for project ${projectId}, subject ${subjectId}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'updateReports',
    (projectId, projectUid, subjectUid, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          // precompute reports should always be done by admin
          const epadAuth = { admin: true, username: 'admin' };
          // check if we have the subject in db so that we don't attempt if not
          const subject = await models.subject.findOne(
            {
              where: { subjectuid: subjectUid },
              attributes: ['id', 'subjectuid'],
              raw: true,
            },
            transaction ? { transaction } : {}
          );
          if (!subject) {
            resolve('No DICOMS, skipping report generation');
          } else {
            // just RECIST for now
            // get the RECIST as admin all the time so that we have everyone's data in db and filter when returning
            const result = await fastify.getAimsInternal(
              'json',
              { project: projectUid, subject: subjectUid },
              undefined,
              epadAuth,
              undefined,
              undefined,
              true
            );
            await fastify.getAndSavePrecomputeReports(
              projectId,
              subject.id,
              result.rows,
              epadAuth,
              transaction,
              false // it is admin
            );
            resolve('Reports updated!');
          }
        } catch (err) {
          reject(
            new InternalError(
              `Updating reports for project ${projectId}, subject ${subjectUid}`,
              err
            )
          );
        }
      })
  );

  // gets a single username
  fastify.decorate(
    'updateWorklistCompleteness',
    (projectId, subjectUid, studyUid, user, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          // filter by assignee
          const dbUser = await models.user.findOne(
            {
              where: { username: user },
              include: ['worklists'],
            },
            transaction ? { transaction } : {}
          );
          const worklistIds = dbUser ? dbUser.worklists.map((wl) => wl.dataValues.id) : [];
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
                where: {
                  project_id: projectId,
                  subject_id: subject.id,
                  study_id: study.id,
                  worklist_id: worklistIds,
                },
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
              // TODO if there are no requirements, the worklist completeness is not filled
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
                  transaction,
                  subject.id
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
    (project) =>
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
    'findSubjectIdInternal',
    (subject) =>
      new Promise(async (resolve, reject) => {
        try {
          const subjectId = await models.subject.findOne({
            where: { subjectuid: subject },
            attributes: ['id'],
            raw: true,
          });
          resolve(subjectId.id);
        } catch (err) {
          reject(new InternalError(`Finding subject id ${subject}`, err));
        }
      })
  );

  // when deleting, we should check if there is any aim in the SYSTEM referring to the DSO other than the aim being deleted (send dsoSeriesUid, aimUid)
  // when we see a new seg in a project (either upload or add to project), check if there is any aim referring to the DSO in that project (send dsoSeriesUid, project)
  // when trying to retrieve/delete the default seg aim, check with the template (send dsoSeriesUid, project, aimUid, template)
  fastify.decorate(
    'checkProjectSegAimExistence',
    (dsoSeriesUid, project, aimUid, template) =>
      new Promise(async (resolve, reject) => {
        try {
          // handle no project filter for deleting from system
          const projectId = project ? await fastify.findProjectIdInternal(project) : null;
          // TODO do I need to check if the user has access?
          const aims = await models.project_aim.findAll({
            where: {
              ...(projectId ? { project_id: projectId } : {}),
              dso_series_uid: dsoSeriesUid,
              ...(aimUid ? { aim_uid: { [Op.not]: aimUid } } : {}),
              ...fastify.qryNotDeleted(),
              ...(template ? { template } : {}),
            },
            raw: true,
          });
          if (aims.length > 0) {
            if (aims.length > 1)
              console.error(
                `Aims length for DSO series ${dsoSeriesUid} is ${aims.length}. It is not supposed to be more than 1!`
              );
            resolve(aims[0].aim_uid);
          }
          resolve(null);
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
      transaction,
      subjectId
    ) => {
      // sample worklistReq
      // eslint-disable-next-line no-param-reassign
      // worklistReq = [{ id: 1, level: 'study', numOfAims: 1, template: 'ROI', required: true }];
      // get all aims
      const whereJSON = {
        project_id: projectId,
        subject_uid: subjectUid,
        study_uid: studyUid,
        '$users.username$': user,
        ...fastify.qryNotDeleted(),
      };
      // if the requirement is patient level, calculate patient level and update all studies
      // I need to compute using all aims for that patient
      if (worklistReq.level.toLowerCase() === 'patient') {
        delete whereJSON.study_uid;
      }
      const aims = await models.project_aim.findAll(
        {
          where: whereJSON,
          include: [{ model: models.user, as: 'users' }],
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
        if (!(aims[i].dataValues.subject_uid in aimStats[aims[i].dataValues.template].subjectUids))
          aimStats[aims[i].dataValues.template].subjectUids[aims[i].dataValues.subject_uid] = 1;
        else aimStats[aims[i].dataValues.template].subjectUids[aims[i].dataValues.subject_uid] += 1;
        if (!(aims[i].dataValues.study_uid in aimStats[aims[i].dataValues.template].studyUids))
          aimStats[aims[i].dataValues.template].studyUids[aims[i].dataValues.study_uid] = 1;
        else aimStats[aims[i].dataValues.template].studyUids[aims[i].dataValues.study_uid] += 1;
        if (!(aims[i].dataValues.series_uid in aimStats[aims[i].dataValues.template].seriesUids))
          aimStats[aims[i].dataValues.template].seriesUids[aims[i].dataValues.series_uid] = 1;
        else aimStats[aims[i].dataValues.template].seriesUids[aims[i].dataValues.series_uid] += 1;
        if (!(aims[i].dataValues.image_uid in aimStats[aims[i].dataValues.template].imageUids))
          aimStats[aims[i].dataValues.template].imageUids[aims[i].dataValues.image_uid] = 1;
        else aimStats[aims[i].dataValues.template].imageUids[aims[i].dataValues.image_uid] += 1;
        // add all to any
        if (!(aims[i].dataValues.subject_uid in aimStats.any.subjectUids))
          aimStats.any.subjectUids[aims[i].dataValues.subject_uid] = 1;
        else aimStats.any.subjectUids[aims[i].dataValues.subject_uid] += 1;
        if (!(aims[i].dataValues.study_uid in aimStats.any.studyUids))
          aimStats.any.studyUids[aims[i].dataValues.study_uid] = 1;
        else aimStats.any.studyUids[aims[i].dataValues.study_uid] += 1;
        if (!(aims[i].dataValues.series_uid in aimStats.any.seriesUids))
          aimStats.any.seriesUids[aims[i].dataValues.series_uid] = 1;
        else aimStats.any.seriesUids[aims[i].dataValues.series_uid] += 1;
        if (!(aims[i].dataValues.image_uid in aimStats.any.imageUids))
          aimStats.any.imageUids[aims[i].dataValues.image_uid] = 1;
        else aimStats.any.imageUids[aims[i].dataValues.image_uid] += 1;
      }
      // filter by template first
      let completenessPercent = 0;
      // not even started yet
      if (!(worklistReq.template in aimStats)) {
        fastify.log.info(
          `There are no aims for the worklist req for template ${worklistReq.template}`
        );
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
            fastify.log.info(`What is this unknown level ${worklistReq.level}`);
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

      // we need to update the other studies of the patient also if the requirement is patient level
      if (
        worklistReq.level.toLowerCase() === 'patient' ||
        worklistReq.level.toLowerCase() === 'subject'
      ) {
        // only get the studies with the worklist that the requirement belongs to
        const worklistStudies = await models.worklist_study.findAll(
          {
            where: {
              project_id: projectId,
              subject_id: subjectId,
              worklist_id: worklistReq.worklist_id,
            },
            raw: true,
          },
          transaction ? { transaction } : {}
        );
        for (let i = 0; i < worklistStudies.length; i += 1) {
          if (
            worklistStudies[i].subject_id === subjectId &&
            worklistStudies[i].id !== worklistStudyId
          ) {
            // eslint-disable-next-line no-await-in-loop
            await fastify.upsert(
              models.worklist_study_completeness,
              {
                worklist_study_id: worklistStudies[i].id,
                updatetime: Date.now(),
                assignee: user,
                worklist_requirement_id: worklistReq.id,
                // completeness cannot be higher than 100
                completeness: completenessPercent > 100 ? 100 : completenessPercent,
              },
              {
                worklist_study_id: worklistStudies[i].id,
                assignee: user,
                worklist_requirement_id: worklistReq.id,
              },
              epadAuth.username,
              transaction
            );
          }
        }
      }
    }
  );

  fastify.decorate('getWorklistProgress', async (request, reply) => {
    try {
      const worklist = (
        await models.worklist.findOne({
          where: { worklistid: request.params.worklist },
          attributes: ['id'],
          include: [
            {
              model: models.worklist_requirement,
              required: false,
              as: 'requirements',
            },
            'users',
          ],
        })
      ).toJSON();
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
          include: [
            {
              model: models.worklist_study_completeness,
              required: false,
              as: 'progress',
            },
            'subject',
            'study',
          ],
          attributes: ['worklist_id', 'project_id', 'subject_id', 'study_id'],
        });
        // I could not create association with composite foreign key
        const manualProgressMap = await fastify.getManualProgressMap(worklist.id);
        for (let i = 0; i < worklistStudies.length; i += 1) {
          for (let j = 0; j < worklistStudies[i].dataValues.progress.length; j += 1) {
            if (users[worklistStudies[i].dataValues.progress[j].dataValues.assignee]) {
              const { numOfAims, template, level } = requirements[
                worklistStudies[i].dataValues.progress[j].dataValues.worklist_requirement_id
              ];
              const { firstname, lastname, id } = users[
                worklistStudies[i].dataValues.progress[j].dataValues.assignee
              ];
              if (
                manualProgressMap[
                  `${worklistStudies[i].dataValues.worklist_id}-${worklistStudies[i].dataValues.project_id}-${worklistStudies[i].dataValues.subject_id}-${worklistStudies[i].dataValues.study_id}-${id}`
                ]
              ) {
                const completeness = fastify.getManualProgressForUser(
                  manualProgressMap,
                  worklistStudies[i].dataValues.worklist_id,
                  worklistStudies[i].dataValues.project_id,
                  worklistStudies[i].dataValues.subject_id,
                  worklistStudies[i].dataValues.study_id,
                  id
                );
                progressList.push({
                  worklist_id: worklistStudies[i].dataValues.worklist_id,
                  project_id: worklistStudies[i].dataValues.project_id,
                  subject_uid: worklistStudies[i].dataValues.subject.dataValues.subjectuid,
                  subject_name: worklistStudies[i].dataValues.subject.dataValues.name,
                  study_uid: worklistStudies[i].dataValues.study.dataValues.studyuid,
                  study_desc: worklistStudies[i].dataValues.study.dataValues.description,
                  assignee: worklistStudies[i].dataValues.progress[j].dataValues.assignee,
                  assignee_name: `${firstname} ${lastname}`,
                  completeness,
                  type: 'MANUAL',
                });
              } else {
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
                  type: 'AUTO',
                });
              }
            } else {
              fastify.log.error(
                `Worklist ${worklistStudies[i].dataValues.worklist_id} has completeness records for unassigned user ${worklistStudies[i].dataValues.progress[j].dataValues.assignee}`
              );
            }
          }
          // if no auto progress, use manual progress to traverse
          // TODO what if there are other users assigned to the worklist?
          if (worklistStudies[i].dataValues.progress.length === 0) {
            for (let j = 0; j < worklist.users.length; j += 1) {
              const { firstname, lastname, id } = users[worklist.users[j].username];
              let completeness = 0;
              if (
                manualProgressMap[
                  `${worklistStudies[i].dataValues.worklist_id}-${worklistStudies[i].dataValues.project_id}-${worklistStudies[i].dataValues.subject_id}-${worklistStudies[i].dataValues.study_id}-${id}`
                ]
              ) {
                completeness = fastify.getManualProgressForUser(
                  manualProgressMap,
                  worklistStudies[i].dataValues.worklist_id,
                  worklistStudies[i].dataValues.project_id,
                  worklistStudies[i].dataValues.subject_id,
                  worklistStudies[i].dataValues.study_id,
                  id
                );
              }
              progressList.push({
                worklist_id: worklistStudies[i].dataValues.worklist_id,
                project_id: worklistStudies[i].dataValues.project_id,
                subject_uid: worklistStudies[i].dataValues.subject.dataValues.subjectuid,
                subject_name: worklistStudies[i].dataValues.subject.dataValues.name,
                study_uid: worklistStudies[i].dataValues.study.dataValues.studyuid,
                study_desc: worklistStudies[i].dataValues.study.dataValues.description,
                assignee: worklist.users[j].username,
                assignee_name: `${firstname} ${lastname}`,
                completeness,
                type: 'MANUAL',
              });
            }
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

  fastify.decorate('deleteAimDB', async (whereJson, username) => {
    let whereStr = '';
    if (whereJson.series_uid) whereStr += `series_uid = '${whereJson.series_uid}'`;
    if (whereJson.subject_uid)
      whereStr += `${whereStr !== '' ? ' AND ' : ''} subject_uid = '${whereJson.subject_uid}'`;
    if (whereJson.project_id)
      whereStr += `${whereStr !== '' ? ' AND ' : ''} project_id = ${whereJson.project_id}`;
    if (whereJson.aim_uid) {
      if (Array.isArray(whereJson.aim_uid)) {
        whereStr += `${whereStr !== '' ? ' AND ' : ''} aim_uid IN ('${whereJson.aim_uid.join(
          "','"
        )}')`;
      } else {
        whereStr += `${whereStr !== '' ? ' AND ' : ''} aim_uid = '${whereJson.aim_uid}'`;
      }
    }
    let numDeleted = 0;
    if (config.auditLog === true) {
      // TODO updatetime = ${Date.now()},
      const ret = await fastify.orm.query(
        `update project_aim SET updated_by = '${username}', deleted = 1 WHERE ${whereStr}`
      );
      numDeleted = ret[0].affectedRows;
    } else {
      numDeleted = await models.project_aim.destroy({
        where: whereJson,
      });
    }
    return numDeleted;
  });

  fastify.decorate('qryNotDeleted', () => ({
    // $or: [
    //   {
    //     deleted: {
    //       $eq: 0,
    //     },
    //   },
    //   {
    //     deleted: {
    //       $eq: null,
    //     },
    //   },
    // ],
    deleted: null,
  }));

  fastify.decorate('getDeletedAimsDB', (project) =>
    models.project_aim.findAll({
      where: {
        '$project.projectid$': project,
        deleted: 1,
      },
      include: [{ model: models.project }],
      attributes: ['aim_uid'],
    })
  );

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
        if (
          !(
            request.epadAuth.admin ||
            (config.mode !== 'teaching' &&
              fastify.isOwnerOfProject(request, request.params.project)) ||
            // eslint-disable-next-line no-await-in-loop
            (await fastify.isCreatorOfObject(request, {
              level: 'aim',
              objectId: request.params.aimuid,
              project: request.params.project,
            })) === true
          )
        ) {
          reply.send(
            new InternalError(
              `Aim ${request.params.aimuid}  deletion from project ${request.params.project}`,
              new Error('User does not have sufficient rights')
            )
          );
          return;
        }

        const aimDelete = await fastify.deleteAimsInternal(
          request.params,
          request.epadAuth,
          request.query,
          [request.params.aimuid]
        );
        reply.code(200).send({ message: aimDelete });
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
  fastify.decorate('deleteAimsFromProject', async (request, reply) => {
    try {
      const project = await models.project.findOne({
        where: { projectid: request.params.project },
      });
      if (project === null)
        reply.send(
          new BadRequestError(
            `Deleting aims ${JSON.stringify(request.body)} from project`,
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
        // for each aim check if the user has a right to delete
        let aimsThatCanBeDeleted = [];
        const aimsThatCannotBeDeleted = [];
        if (request.body && Array.isArray(request.body)) {
          for (let i = 0; i < request.body.length; i += 1) {
            if (
              request.epadAuth.admin ||
              (config.mode !== 'teaching' &&
                fastify.isOwnerOfProject(request, request.params.project)) ||
              // eslint-disable-next-line no-await-in-loop
              (await fastify.isCreatorOfObject(request, {
                level: 'aim',
                objectId: request.body[i],
                project: request.params.project,
              })) === true
            )
              aimsThatCanBeDeleted.push(request.body[i]);
            else aimsThatCannotBeDeleted.push(request.body[i]);
          }
        } else aimsThatCanBeDeleted = request.body;
        if (!Array.isArray(aimsThatCanBeDeleted) || aimsThatCanBeDeleted.length > 0) {
          const aimDelete = await fastify.deleteAimsInternal(
            request.params,
            request.epadAuth,
            request.query,
            aimsThatCanBeDeleted
          );
          if (aimsThatCannotBeDeleted.length > 0)
            new EpadNotification(
              request,
              `Only some of the aims were deleted. User does not have the sufficient rights to delete `,
              aimsThatCannotBeDeleted.join(', ')
            ).notify(fastify);
          reply.code(200).send({ message: aimDelete, aimsThatCannotBeDeleted });
        } else {
          reply.send(
            new InternalError(
              `Aims ${JSON.stringify(request.body)}  deletion from project ${
                request.params.project
              }`,
              new Error('User does not have sufficient rights')
            )
          );
        }
      }
    } catch (err) {
      reply.send(
        new InternalError(
          `Aims ${JSON.stringify(request.body)}  deletion from project ${request.params.project}`,
          err
        )
      );
    }
  });

  // params should always have the project. if we want to delete from all projects just send all:true query param
  // segs
  fastify.decorate(
    'deleteAimsInternal',
    (params, epadAuth, query, body, skipCheckAndDeleteNoAimStudies, skipSegDelete) =>
      new Promise(async (resolve, reject) => {
        try {
          let aimQry = {};
          if (body && Array.isArray(body)) aimQry = { aim_uid: body };
          else {
            if (params.subject) aimQry = { ...aimQry, subject_uid: params.subject };
            if (params.study) aimQry = { ...aimQry, study_uid: params.study };
            if (params.series) aimQry = { ...aimQry, series_uid: params.series };
          }
          aimQry = {
            ...aimQry,
            ...fastify.qryNotDeleted(),
          };
          const qry =
            query.all && query.all === 'true'
              ? aimQry
              : { '$project.projectid$': params.project, ...aimQry };
          const dbAims = await models.project_aim.findAll({
            where: qry,
            attributes: ['project_id', 'subject_uid', 'study_uid', 'aim_uid', 'dso_series_uid'],
            include: [{ model: models.project }, { model: models.user, as: 'users' }],
          });
          let aimUids = [];
          const studyInfos = [];
          let segDeletePromises = []; // an array for deleting all segs

          for (let i = 0; i < dbAims.length; i += 1) {
            if (!aimUids.includes(dbAims[i].dataValues.aim_uid))
              aimUids.push(dbAims[i].dataValues.aim_uid);
            if (
              !studyInfos.includes({
                project: params.project,
                subject: dbAims[i].dataValues.subject_uid,
                study: dbAims[i].dataValues.study_uid,
              })
            )
              studyInfos.push({
                project: params.project,
                subject: dbAims[i].dataValues.subject_uid,
                study: dbAims[i].dataValues.study_uid,
              });
            // check if there are any aims pointing to the DSO
            // do we need to if we will always have only one aim pointing to the seg?
            // delete seg should only work if there is no aim in the system pointing to the seg, regardless of the project
            if (!skipSegDelete && dbAims[i].dataValues.dso_series_uid) {
              // eslint-disable-next-line no-await-in-loop
              const existingAim = await fastify.checkProjectSegAimExistence(
                dbAims[i].dataValues.dso_series_uid,
                null,
                dbAims[i].dataValues.aim_uid
              );
              if (!existingAim)
                segDeletePromises.push(
                  fastify.deleteSeriesDicomsInternal({
                    study: dbAims[i].dataValues.study_uid,
                    series: dbAims[i].dataValues.dso_series_uid,
                  })
                );
              else
                fastify.log.warn(
                  `Aim ${dbAims[i].dataValues.aim_uid} refers to a segmentation with DSO Series UID ${dbAims[i].dataValues.dso_series_uid}. However, the DSO is referred by another aim ${existingAim}. It won't be deleted from the system`
                );
            }
          }
          // if the aim records are deleted from db but there are leftovers in the couchdb
          if (aimUids.length === 0 && body && Array.isArray(body)) {
            aimUids = body;
          }
          // if there were no aim records in db but couchdb has some aims
          // we'd need to query couchdb for those to get the studyInfos
          if (studyInfos.length === 0 && aimUids.length > 0) {
            const result = await fastify.getAimsInternal('summary', params, aimUids, epadAuth);
            for (let i = 0; i < result.rows.length; i += 1) {
              if (
                !studyInfos.includes({
                  project: params.project,
                  subject: result.rows[i].subjectID,
                  study: result.rows[i].studyUID,
                })
              )
                studyInfos.push({
                  project: params.project,
                  subject: result.rows[i].subjectID,
                  study: result.rows[i].studyUID,
                });
            }
          }
          // get the project db record if params.project is sent
          const project = params.project
            ? await models.project.findOne({
                where: { projectid: params.project },
              })
            : null;

          // delete the aims in this project (if any)
          const numDeleted =
            aimUids.length > 0
              ? await fastify.deleteAimDB(
                  { aim_uid: aimUids, ...(project ? { project_id: project.id } : {}) },
                  epadAuth.username
                )
              : 0;
          // if delete from all or it doesn't exist in any other project, delete from system
          try {
            if (query.all && query.all === 'true') {
              await fastify.deleteCouchDocsInternal(aimUids);
              await fastify.aimUpdateGatewayInBulk(dbAims, epadAuth, params.project);
              await Promise.all(segDeletePromises);
              if (!skipCheckAndDeleteNoAimStudies)
                await fastify.checkAndDeleteNoAimStudies(studyInfos, epadAuth);
              resolve(`Aims deleted from system and removed from ${numDeleted} projects`);
            } else {
              // check if the aims to be deleted exist in any other project
              // make sure to handle auditlog deletes
              const leftovers = await models.project_aim.findAll({
                where: { aim_uid: aimUids, ...fastify.qryNotDeleted() },
                attributes: ['project_id', 'subject_uid', 'study_uid', 'aim_uid', 'dso_series_uid'],
              });
              if (leftovers.length === 0) {
                await fastify.deleteCouchDocsInternal(aimUids);
                await fastify.aimUpdateGatewayInBulk(dbAims, epadAuth, params.project);

                await Promise.all(segDeletePromises);
                if (!skipCheckAndDeleteNoAimStudies)
                  await fastify.checkAndDeleteNoAimStudies(studyInfos, epadAuth);
                resolve(`Aims deleted from system as they didn't exist in any other project`);
              } else {
                const leftoverIds = [];
                for (let i = 0; i < leftovers.length; i += 1) {
                  // go one one by
                  // eslint-disable-next-line no-await-in-loop
                  await fastify.saveAimInternal(leftovers[i].aim_uid, params.project, true);
                  fastify.log.info(`Aim not deleted from system as it exists in other project`);
                  leftoverIds.push(leftovers[i].aim_uid);
                }
                const deletedAims = dbAims.filter((e) => !leftoverIds.includes(e.aim_uid));
                segDeletePromises = [];
                const deletedAimUids = [];
                for (let i = 0; i < deletedAims.length; i += 1) {
                  deletedAimUids.push(deletedAims[i].aim_uid);
                  // check if there are any aims pointing to the DSO, deleting the segmentations of the deleted aims only
                  // do we need to if we will always have only one aim pointing to the seg? what if in another project
                  if (!skipSegDelete && deletedAims[i].dso_series_uid) {
                    // eslint-disable-next-line no-await-in-loop
                    const existingAim = await fastify.checkProjectSegAimExistence(
                      deletedAims[i].dso_series_uid,
                      null,
                      deletedAims[i].aim_uid
                    );
                    if (!existingAim)
                      segDeletePromises.push(
                        fastify.deleteSeriesDicomsInternal({
                          study: deletedAims[i].study_uid,
                          series: deletedAims[i].dso_series_uid,
                        })
                      );
                    else
                      fastify.log.warn(
                        `One of the deleted aims, ${deletedAims[i].aim_uid}, refers to a segmentation with DSO Series UID ${deletedAims[i].dso_series_uid}. However, the DSO is referred by another aim ${existingAim}. It won't be deleted from the system`
                      );
                  }
                }
                await fastify.deleteCouchDocsInternal(deletedAimUids);
                await fastify.aimUpdateGatewayInBulk(deletedAims, epadAuth, params.project);
                await Promise.all(segDeletePromises);
                // it doesn't filter the not deleted ones. does an extra check
                if (!skipCheckAndDeleteNoAimStudies)
                  await fastify.checkAndDeleteNoAimStudies(studyInfos, epadAuth);
                resolve(
                  `${leftovers.length} aims not deleted from system as they exist in other project`
                );
              }
            }
          } catch (deleteErr) {
            reject(
              new InternalError(
                `Aims ${JSON.stringify(aimUids)} deletion from system ${params.project}`,
                deleteErr
              )
            );
          }
        } catch (err) {
          reject(
            new InternalError(
              `Aims ${JSON.stringify(body || params)}  deletion from project ${params.project}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'checkAndDeleteNoAimStudies',
    (studyInfos, epadAuth) =>
      new Promise(async (resolve, reject) => {
        if (config.deleteNoAimStudy) {
          try {
            const deletedStudies = [];
            // see if the study have any other aims
            // and deleteNoAimStudy true
            // get unique studyUIDs
            const deleted = [];
            for (let i = 0; i < studyInfos.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              const leftoversCount = await models.project_aim.count({
                where: {
                  '$project.projectid$': studyInfos[i].project,
                  subject_uid: studyInfos[i].subject,
                  study_uid: studyInfos[i].study,
                  ...fastify.qryNotDeleted(),
                },
                include: [{ model: models.project }],
              });
              if (
                leftoversCount === 0 &&
                !deletedStudies.includes(`${studyInfos[i].project}-${studyInfos[i].study}`)
              ) {
                deletedStudies.push(`${studyInfos[i].project}-${studyInfos[i].study}`);
                // delete study
                fastify.log.info(
                  `Deleting study ${studyInfos[i].study} from ${studyInfos[i].project} as there is no aim in the study and deleteNoAimStudy is set to true`
                );
                // delete significant series for the study
                // eslint-disable-next-line no-await-in-loop
                const idsToDelete = await models.project_subject_study_series_significance.findAll({
                  where: {
                    '$project.projectid$': studyInfos[i].project,
                    '$study.studyuid$': studyInfos[i].study,
                  },
                  include: [models.project, models.study],
                  attributes: ['id'],
                });
                // eslint-disable-next-line no-await-in-loop
                await models.project_subject_study_series_significance.destroy({
                  where: { id: idsToDelete.map((item) => item.dataValues.id) },
                });
                fastify.log.info(
                  `Deleted ${idsToDelete.length} significant series for study ${studyInfos[i].study} and project ${studyInfos[i].project}`
                );
                // eslint-disable-next-line no-await-in-loop
                await fastify.deletePatientStudyFromProjectInternal({
                  params: studyInfos[i],
                  epadAuth,
                  query: {},
                });
                deleted.push(studyInfos[i]);
              }
            }
            resolve(`Deleted ${JSON.stringify(deleted)}`);
          } catch (err) {
            reject(
              new InternalError(
                `Check delete no studies when no aims ${JSON.stringify(studyInfos)} `,
                err
              )
            );
          }
        } else resolve('Nothing to do');
      })
  );

  fastify.decorate(
    'aimUpdateGatewayInBulk',
    (args, epadAuth, projectId) =>
      new Promise(async (resolve, reject) => {
        try {
          if (args) {
            for (let i = 0; i < args.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.aimUpdateGateway(
                args[i].dataValues.project_id,
                args[i].dataValues.subject_uid,
                args[i].dataValues.study_uid,
                args[i].dataValues.users.map((u) => u.username),
                epadAuth,
                undefined,
                projectId
              );
            }
          }
          resolve('Finished bulk update');
        } catch (err) {
          reject(err);
        }
      })
  );
  fastify.decorate('deleteAimFromSystem', async (request, reply) => {
    try {
      const aimUid = request.params.aimuid;
      const numDeleted = await fastify.deleteAimDB({ aim_uid: aimUid }, request.epadAuth.username);
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
      .addPatientStudyToProjectInternal(
        request.params,
        request.epadAuth,
        request.body,
        request.query
      )
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
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
    'updateStudyDBRecord',
    (studyUid, studyRecord, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          // update with latest value
          await fastify.upsert(
            models.study,
            {
              studyuid: studyUid,
              ...studyRecord,
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
    (studyInfo, projectSubject, epadAuth, query, transaction) =>
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
              // eslint-disable-next-line no-nested-ternary
              referring_physician: studyInfo.referringPhysicianName
                ? studyInfo.referringPhysicianName.Aphabetic
                  ? studyInfo.referringPhysicianName.Aphabetic
                  : studyInfo.referringPhysicianName
                : null,
              accession_number: studyInfo.studyAccessionNumber
                ? studyInfo.studyAccessionNumber
                : null,
              study_id: studyInfo.studyID ? studyInfo.studyID : null,
              study_time: studyInfo.studyTime ? studyInfo.studyTime : null,
              num_of_images: studyInfo.numberOfImages ? studyInfo.numberOfImages : 0,
              num_of_series: studyInfo.numberOfSeries ? studyInfo.numberOfSeries : 0,
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

          // if study have segmentations we should check if there is an annotation for it
          if (
            studyInfo.examTypes &&
            studyInfo.examTypes.includes('SEG') &&
            query &&
            query.from &&
            query.from === config.unassignedProjectID
          ) {
            fastify.log.info('There are SEGs coming from unassigned checking for AIMs');
            // get series
            // for each seg see if it has an annotation, generate if not
            const seriesList = await fastify.getStudySeriesInternal(
              { study: studyInfo.studyUID },
              {},
              epadAuth,
              true
            );
            for (let i = 0; i < seriesList.length; i += 1) {
              if (seriesList[i].examType === 'SEG') {
                // eslint-disable-next-line no-await-in-loop
                const existingAim = await fastify.checkProjectSegAimExistence(
                  seriesList[i].seriesUID,
                  studyInfo.projectID
                );
                if (!existingAim) {
                  const params = {
                    project: studyInfo.projectID,
                    subject: studyInfo.patientID,
                    study: studyInfo.studyUID,
                    series: seriesList[i].seriesUID,
                  };
                  // We need to pull dicom seg and create an aim file
                  // eslint-disable-next-line no-await-in-loop
                  const [segPart] = await fastify.getSeriesWadoMultipart(params);
                  if (segPart) {
                    const segTags = dcmjs.data.DicomMessage.readFile(segPart);
                    const segDS = dcmjs.data.DicomMetaDictionary.naturalizeDataset(segTags.dict);
                    // eslint-disable-next-line no-underscore-dangle
                    segDS._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(segTags.meta);
                    let segmentSeq = segDS.SegmentSequence;
                    if (segmentSeq.constructor.name !== 'Array') {
                      segmentSeq = [segmentSeq];
                    }
                    fastify.log.info(
                      `A segmentation is uploaded with series UID ${
                        segDS.SeriesInstanceUID
                      } which doesn't have an aim, generating an aim with name ${
                        segDS.SeriesDescription || segmentSeq[0].SegmentLabel
                      } `
                    );
                    const { aim } = createOfflineAimSegmentation(segDS, {
                      loginName: { value: epadAuth.username },
                      name: { value: `${epadAuth.firstname} ${epadAuth.lastname}` },
                    });
                    const aimJson = aim.getAimJSON();
                    // eslint-disable-next-line no-await-in-loop
                    await fastify.saveAimJsonWithProjectRef(aimJson, params, epadAuth);
                  }
                }
              }
            }
          } else {
            fastify.log.info('No need to check for segmentation AIMs');
          }
          resolve();
        } catch (err) {
          reject(new InternalError(`Adding study ${studyInfo.studyUID} DB`, err));
        }
      })
  );

  fastify.decorate(
    'addPatientStudyToProjectInternal',
    (params, epadAuth, body, query) =>
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
                subjectuid: params.subject.replace('\u0000', '').trim(),
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
                } else if (studies.length > 0) {
                  // this happens in stella when a study is being sent to create a teaching file
                  if (studies.length > 1) {
                    const accessions = studies.map((item) => item.studyAccessionNumber);
                    fastify.log.info(
                      `Received ${studies.length} study records for the studyuid ${
                        params.study
                      } with accessions ${accessions.join(',')}`
                    );
                    if (config.mode === 'teaching')
                      reject(
                        new InternalError(
                          'Adding study to Stella',
                          new Error(
                            `Study with UID '${params.study}' has ${
                              studies.length
                            } study records with accessions '${accessions.join(
                              ','
                            )}'. Stella doesn't support multiple records for a study at this moment`
                          )
                        )
                      );
                    else
                      reject(
                        new InternalError(
                          'Adding study to project',
                          new Error(
                            `Study with UID '${params.study}' has ${
                              studies.length
                            } study records with accessions '${accessions.join(',')}'`
                          )
                        )
                      );
                    return;
                  }
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
                // anything added here needs to be added to getDicomInfo in Other to make the uploaded dicoms to fill in
                if (body && body.studyDesc) studyInfo.studyDescription = body.studyDesc;
                if (body && body.insertDate) studyInfo.insertDate = body.insertDate;
                if (body && body.studyAccessionNumber)
                  studyInfo.studyAccessionNumber = body.studyAccessionNumber;
                if (body && body.referringPhysicianName)
                  studyInfo.referringPhysicianName = body.referringPhysicianName;
                if (body && body.studyID) studyInfo.studyID = body.studyID;
                if (body && body.studyTime) studyInfo.studyTime = body.studyTime;
                // if there is body, it is nondicom. you cannot create a nondicom if it is already in system
                // it doesn't have subject info (not upload)
                const studyExists = await models.study.findOne({
                  where: { studyuid: studyInfo.studyUID },
                });
                if (body && body.subjectName === undefined && studyExists) {
                  reject(new ResourceAlreadyExistsError('Study', studyInfo.studyUID));
                } else {
                  if (studies.length === 1) [studyInfo] = studies;
                  await fastify.addPatientStudyToProjectDBInternal(
                    { ...studyInfo, projectID: params.project },
                    projectSubject,
                    epadAuth,
                    query
                  );
                  resolve();
                }
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

  /**
   * Check the validity of the request (ip call is being made from)
   * and returns the apikey if present for the appid that is sent in the params
   */
  fastify.decorate('getApiKey', async (request, reply) => {
    try {
      const dbApiKey = await models.apikeys.findAll({
        where: {
          appid: request.params.appid,
        },
        raw: true,
      });
      if (dbApiKey && dbApiKey.length > 0) {
        if (dbApiKey[0].valid_ips.includes(request.socket.remoteAddress)) {
          reply.code(200).send(dbApiKey[0].apikey);
        } else
          reply.send(
            new UnauthorizedError(`The request's ip address doesn't have right to access api key`)
          );
      } else reply.send(new ResourceNotFoundError('Application', request.params.appid));
    } catch (err) {
      reply.send(new InternalError('Api key retrieval', err));
    }
  });

  /** Add/update an apikey with a set of valid ips to access the api key */
  fastify.decorate('setApiKey', async (request, reply) => {
    try {
      const missingAtt = [];
      if (!request.body.appid) missingAtt.push('appid');
      if (!request.body.apikey) missingAtt.push('apikey');
      if (!request.body.validIPs) missingAtt.push('validIPs');
      else {
        request.body.valid_ips = request.body.validIPs.join(',');
        delete request.body.validIPs;
      }

      if (missingAtt.length > 0)
        reply.send(
          new BadRequestError(
            'Missing attribute(s) in body',
            new Error(`Missing ${missingAtt.join(',')}`)
          )
        );
      else {
        await fastify.upsert(
          models.apikeys,
          request.body,
          request.params.appid ? { appid: request.params.appid } : {},
          request.epadAuth ? request.epadAuth.username : request.socket.remoteAddress
        );
        reply.code(200).send('Api key set with valid IPs');
      }
    } catch (err) {
      reply.send(new InternalError('Set api key', err));
    }
  });

  fastify.decorate('add0s', (val) => (val > 9 ? val : `0${val}`));

  fastify.decorate('getFormattedTime', (dateFromDB) => {
    // dicom time
    if (dateFromDB && dateFromDB.length === 6) {
      return `${dateFromDB.substring(0, 2)}:${dateFromDB.substring(2, 4)}:${dateFromDB.substring(
        4
      )}`;
    }
    return dateFromDB;
  });

  fastify.decorate('getFormattedDate', (dateFromDB) => {
    // dicom date
    if (dateFromDB && dateFromDB.length === 8) {
      return `${dateFromDB.substring(0, 4)}-${dateFromDB.substring(4, 6)}-${dateFromDB.substring(
        6
      )}`;
    }
    const dbDate = new Date(dateFromDB);
    const month = dbDate.getMonth() + 1;
    const date = dbDate.getDate();

    return `${dbDate.getFullYear()}-${fastify.add0s(month)}-${fastify.add0s(date)}`;
  });

  fastify.decorate('getFormattedDateTime', (dateFromDB) => {
    const dbDate = new Date(dateFromDB);
    const hour = dbDate.getHours();
    const minute = dbDate.getMinutes();
    const seconds = dbDate.getSeconds();

    return `${fastify.getFormattedDate(dateFromDB)} ${fastify.add0s(hour)}:${fastify.add0s(
      minute
    )}:${fastify.add0s(seconds)}`;
  });

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
          let nondicoms = [];
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
            const createdTimes = {};
            if (
              params.project === config.unassignedProjectID &&
              config.pollDW &&
              projectSubjects.length === 0
            ) {
              const studyWhere = whereJSON.subject_id ? { subject_id: whereJSON.subject_id } : {};
              const studies = await models.study.findAll({
                where: {
                  ...studyWhere,
                  '$project_subject_studies.study_id$': null,
                },
                include: [{ model: models.project_subject_study }, { model: models.subject }],
              });
              if (studies !== null) {
                for (let i = 0; i < studies.length; i += 1) {
                  studyUids.push(studies[i].dataValues.studyuid);
                  studyInfos.push({
                    study: studies[i].dataValues.studyuid,
                    subject: studies[i].dataValues.subject.dataValues.subjectuid,
                  });
                  nondicoms.push({
                    subject: studies[i].dataValues.subject,
                    study: studies[i],
                  });
                }
              }
            } else {
              for (let j = 0; j < projectSubjects.length; j += 1) {
                if (projectSubjects[j].dataValues.studies) {
                  for (let i = 0; i < projectSubjects[j].dataValues.studies.length; i += 1) {
                    if (
                      !studyUids.includes(
                        projectSubjects[j].dataValues.studies[i].dataValues.studyuid
                      )
                    ) {
                      studyUids.push(projectSubjects[j].dataValues.studies[i].dataValues.studyuid);
                      studyInfos.push({
                        study: projectSubjects[j].dataValues.studies[i].dataValues.studyuid,
                        subject: projectSubjects[j].dataValues.subject.dataValues.subjectuid,
                      });
                      const dbDate = new Date(
                        projectSubjects[j].dataValues.studies[i].dataValues.createdtime
                      );
                      createdTimes[
                        projectSubjects[j].dataValues.studies[i].dataValues.studyuid
                      ] = fastify.getFormattedDateTime(dbDate);
                      // ASSUMPTION: nondicoms have no studydate
                      if (
                        !projectSubjects[j].dataValues.studies[i].dataValues.studydate ||
                        config.pollDW
                      )
                        nondicoms.push({
                          subject: projectSubjects[j].dataValues.subject,
                          study: projectSubjects[j].dataValues.studies[i],
                        });
                    }
                  }
                }
              }
            }
            if (!justIds) {
              if (params.project === config.unassignedProjectID && config.pollDW === 0) {
                const result = await fastify.getPatientStudiesInternal(
                  params,
                  studyUids,
                  epadAuth,
                  query,
                  false,
                  '0020000D',
                  'studyUID',
                  true,
                  createdTimes
                );
                resolve(result);
              } else {
                let result = [];
                if (config.pollDW === 0)
                  result = await fastify.getPatientStudiesInternal(
                    params,
                    studyUids,
                    epadAuth,
                    query,
                    true,
                    '0020000D',
                    'studyUID',
                    false,
                    createdTimes
                  );
                let aimsCountMap = {};
                if (
                  params.project !== config.XNATUploadProjectID &&
                  params.project !== config.unassignedProjectID &&
                  whereJSON.project_id
                ) {
                  aimsCountMap = await fastify.getProjectAimCountMap(
                    {
                      project: params.project,
                    },
                    epadAuth,
                    'study_uid'
                  );
                }
                nondicoms = _.sortBy(nondicoms, 'study.dataValues.studydate');
                if (studyUids.length !== result.length)
                  if (studyUids.length === result.length + nondicoms.length) {
                    for (let i = 0; i < nondicoms.length; i += 1) {
                      const dbDate = new Date(nondicoms[i].study.dataValues.studydate);

                      result.push({
                        projectID: params.project,
                        patientID: nondicoms[i].subject.dataValues.subjectuid,
                        patientName: nondicoms[i].subject.dataValues.name,
                        studyUID: nondicoms[i].study.dataValues.studyuid,
                        insertDate: fastify.getFormattedDate(dbDate),
                        firstSeriesUID: '',
                        firstSeriesDateAcquired: '',
                        physicianName: '',
                        referringPhysicianName: nondicoms[i].study.dataValues.referring_physician,
                        birthdate: fastify.getFormattedDate(nondicoms[i].subject.dataValues.dob),
                        sex: nondicoms[i].subject.dataValues.gender,
                        studyDescription: nondicoms[i].study.dataValues.description,
                        studyAccessionNumber: nondicoms[i].study.dataValues.accession_number,
                        examTypes: nondicoms[i].study.dataValues.exam_types
                          ? JSON.parse(nondicoms[i].study.dataValues.exam_types)
                          : [],
                        numberOfImages: nondicoms[i].study.dataValues.num_of_images,
                        numberOfSeries: nondicoms[i].study.dataValues.num_of_series,
                        numberOfAnnotations: 0,
                        createdTime: fastify.getFormattedDateTime(
                          new Date(nondicoms[i].study.dataValues.createdtime)
                        ),
                        // extra for flexview
                        studyID: nondicoms[i].study.dataValues.study_id,
                        studyDate: fastify.getFormattedDate(dbDate),
                        studyTime: fastify.getFormattedTime(
                          nondicoms[i].study.dataValues.study_time
                        ),
                      });
                    }
                  } else
                    fastify.log.warn(
                      `There are ${studyUids.length} studies associated with this project. But only ${result.length} of them have dicom files`
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
          if (request.params.project === config.unassignedProjectID && config.pollDW === 0) {
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

  fastify.decorate(
    'deletePatientStudyFromAllInternal',
    (params, study, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          let deletedNonDicomSeries = 0;
          let numDeleted = 0;
          if (study !== null) {
            const projectSubjectStudies = await models.project_subject_study.findAll({
              where: { study_id: study.id },
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
              // delete non dicom series if any
              deletedNonDicomSeries = await models.nondicom_series.destroy({
                where: { study_id: study.id },
              });

              await models.worklist_study.destroy({
                where: {
                  study_id: study.id,
                },
              });
              await models.study.destroy({
                where: { id: study.id },
              });
              const siblingCount = await models.study.count({
                where: { subject_id: study.subject_id },
              });
              if (siblingCount === 0) {
                await models.subject.destroy({
                  where: { id: study.subject_id },
                });
              }
            }
          }
          try {
            if (!config.disableDICOMSend) await fastify.deleteStudyInternal(params, epadAuth);
            else fastify.log.info('DICOM Send disabled. Skipping study DICOM delete');
          } catch (err) {
            // ignore the error if the study has nondicom series
            if (deletedNonDicomSeries === 0) {
              fastify.log.warn(
                `The study is deleted from system but not dicomweb. It maybe just a nondicom study. Error: ${err.message}`
              );
            }
          }
          resolve(numDeleted);
        } catch (err) {
          reject(new InternalError(`Study deletion from system ${params.study}`, err));
        }
      })
  );

  fastify.decorate('deletePatientStudyFromProject', (request, reply) => {
    fastify
      .deletePatientStudyFromProjectInternal(request)
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'deletePatientStudyFromProjectInternal',
    async (request) =>
      new Promise(async (resolve, reject) => {
        try {
          if (
            (request.params.project === config.XNATUploadProjectID ||
              request.params.project === config.unassignedProjectID) &&
            request.query.all !== 'true'
          ) {
            reject(
              new BadRequestError(
                `Deleting study from ${request.params.project} project`,
                new Error(`Not supported without system delete`)
              )
            );
          } else {
            const project = await models.project.findOne({
              where: { projectid: request.params.project },
            });
            const subject = await models.subject.findOne({
              where: { subjectuid: request.params.subject },
            });
            if (project === null)
              reject(
                new BadRequestError(
                  'Delete study from project',
                  new ResourceNotFoundError('Project', request.params.project)
                )
              );
            else if (
              subject === null &&
              request.params.project !== config.XNATUploadProjectID &&
              request.params.project !== config.unassignedProjectID
            )
              reject(
                new BadRequestError(
                  'Delete study from project',
                  new ResourceNotFoundError('Subject', request.params.subject)
                )
              );
            else {
              let numDeleted = 0;
              let projectSubject = null;
              if (subject != null) {
                projectSubject = await models.project_subject.findOne({
                  where: { project_id: project.id, subject_id: subject.id },
                });
              }
              if (projectSubject === null) {
                if (request.query.all !== 'true') {
                  reject(
                    new BadRequestError(
                      'Delete study from project',
                      new ResourceNotFoundError(
                        'Project subject association',
                        request.params.subject
                      )
                    )
                  );
                } else {
                  const study = await models.study.findOne({
                    where: { studyuid: request.params.study },
                  });
                  numDeleted += await fastify.deletePatientStudyFromAllInternal(
                    request.params,
                    study,
                    request.epadAuth
                  );
                  if (config.env !== 'test') {
                    if (!config.deleteNoAimStudy && !request.raw) {
                      // it is not delete no aim study but the request is not an actual request. cannot notify
                      fastify.log.warn('Cannot notify user about the study delete from system');
                    } else
                      new EpadNotification(
                        request,
                        'Deleted study from system',
                        request.params.study,
                        true
                      ).notify(fastify);
                  }
                  resolve(`Study deleted from system and removed from ${numDeleted} projects`);
                }
              } else if (
                request.query.all &&
                request.query.all === 'true' &&
                request.epadAuth.admin === false
              )
                reject(new UnauthorizedError('User is not admin, cannot delete from system'));
              else {
                // find the study
                const study = await models.study.findOne({
                  where: { studyuid: request.params.study },
                });

                numDeleted += await models.project_subject_study.destroy({
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
                    numDeleted += await fastify.deletePatientStudyFromAllInternal(
                      request.params,
                      study,
                      request.epadAuth
                    );
                    if (config.env !== 'test')
                      new EpadNotification(
                        request,
                        'Deleted study from system',
                        request.params.study,
                        true
                      ).notify(fastify);
                    resolve(`Study deleted from system and removed from ${numDeleted} projects`);
                  } else {
                    // see if this study is referenced by any other project
                    const count = await models.project_subject_study.count({
                      where: { study_id: study.id },
                    });
                    if (count === 0) {
                      let deletedNonDicomSeries = 0;
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
                      const siblingCount = await models.study.count({
                        where: { subject_id: study.subject_id },
                      });
                      if (siblingCount === 0) {
                        await models.subject.destroy({
                          where: { id: study.subject_id },
                        });
                      }
                      try {
                        if (!config.disableDICOMSend)
                          await fastify.deleteStudyInternal(request.params, request.epadAuth);
                        else fastify.log.info('DICOM Send disabled. Skipping study DICOM delete');
                      } catch (err) {
                        // ignore the error if the study has nondicom series
                        if (deletedNonDicomSeries === 0) {
                          fastify.log.warn(
                            `The study is deleted from system but not dicomweb. It maybe just a nondicom study. Error: ${err.message}`
                          );
                        }
                      }
                      if (config.env !== 'test')
                        new EpadNotification(
                          request,
                          `Deleted study from system as it didn't exist in any other project`,
                          request.params.study,
                          true
                        ).notify(fastify);
                      resolve(`Study deleted from system as it didn't exist in any other project`);
                    } else {
                      if (config.env !== 'test')
                        new EpadNotification(
                          request,
                          'Deleted study',
                          request.params.study,
                          true
                        ).notify(fastify);
                      resolve(`Study not deleted from system as it exists in other project`);
                    }
                  }
                } catch (deleteErr) {
                  reject(
                    new InternalError(
                      `Study ${request.params.study} deletion from system`,
                      deleteErr
                    )
                  );
                }
              }
            }
          }
        } catch (err) {
          reject(
            new InternalError(
              `Study ${request.params.study} deletion from project ${request.params.project}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'getSeriesDicomOrNotInternal',
    (params, query, epadAuth, noStats) =>
      new Promise((resolveMain, rejectMain) => {
        const dicomPromise = new Promise(async (resolve) => {
          try {
            const result = await fastify.getStudySeriesInternal(params, query, epadAuth, noStats);
            resolve({ result, error: undefined });
          } catch (err) {
            fastify.log.info(`Retrieving series Failed from dicomweb with ${err.message}`);
            resolve({ result: [], error: `${err.message}` });
          }
        });
        const nondicomPromise = new Promise(async (resolve) => {
          try {
            const result = await fastify.getNondicomStudySeriesFromProjectInternal(params);
            resolve({ result, error: undefined });
          } catch (err) {
            fastify.log.info(`Retrieving series Failed from nondicom with ${err.message}`);
            resolve({ result: [], error: `${err.message}` });
          }
        });
        Promise.all([dicomPromise, nondicomPromise])
          .then((results) => {
            const combinedResult = results[0].result.concat(results[1].result);
            if (results[0].error && results[1].error)
              rejectMain(
                new InternalError(
                  'Retrieving series',
                  new Error(
                    `Failed from dicomweb with ${results[0].error} and from nondicom with ${results[1].error}`
                  )
                )
              );
            resolveMain(combinedResult);
          })
          .catch((err) => rejectMain(new InternalError('Retrieving series', err)));
      })
  );

  fastify.decorate('getStudySeriesFromProject', (request, reply) => {
    // TODO project filtering
    if (request.query.format === 'stream' && request.params.series) {
      fastify
        .prepSeriesDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply
        )
        .then(() => fastify.log.info(`Series ${request.params.series} download completed`))
        .catch((downloadErr) => reply.send(new InternalError('Downloading series', downloadErr)));
    } else {
      fastify
        .getSeriesDicomOrNotInternal(request.params, request.query, request.epadAuth)
        .then((combinedResult) => {
          // order by series number
          reply.code(200).send(_.sortBy(combinedResult, 'seriesNo'));
        })
        .catch((err) => {
          reply.send(err);
        });
    }
  });
  fastify.decorate(
    'deleteNonDicomSeriesInternal',
    (seriesUid) =>
      new Promise(async (resolve, reject) => {
        try {
          const count = await models.nondicom_series.destroy({
            where: { seriesuid: seriesUid },
          });
          if (count > 0) resolve();
          else reject(new Error('No nondicom entity'));
        } catch (err) {
          reject(new InternalError(`Deleting nondicom series ${seriesUid}`, err));
        }
      })
  );
  fastify.decorate(
    'getNondicomStudySeriesFromProjectInternal',
    (params) =>
      new Promise(async (resolve, reject) => {
        try {
          const result = [];
          const series = await models.nondicom_series.findAll({
            where: { '$study.studyuid$': params.study },
            include: [{ model: models.study, include: ['subject'] }],
          });
          const seriesSignificanceMap = await fastify
            .getSignificantSeriesInternal(params.project, params.subject, params.study)
            .catch((err) => {
              fastify.log.warn(
                `Could not get significant series for nondicom ${params.study}. Error: ${err.message}`
              );
              return [];
            });
          for (let i = 0; i < series.length; i += 1) {
            result.push({
              projectID: params.project,
              patientID: series[i].dataValues.study.dataValues.subject.dataValues.subjectuid,
              patientName: series[i].dataValues.study.dataValues.subject.dataValues.name,
              studyUID: params.study,
              seriesUID: series[i].dataValues.seriesuid,
              seriesDate: series[i].dataValues.seriesdate,
              seriesDescription: series[i].dataValues.description || '',
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
              significanceOrder: seriesSignificanceMap[series[i].dataValues.seriesuid]
                ? seriesSignificanceMap[series[i].dataValues.seriesuid]
                : undefined,
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
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  fastify.decorate('createUser', (request, reply) => {
    fastify
      .createUserInternal(request.body, request.params, request.epadAuth)
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  // body should be an object with fields
  // {username, firstname, lastname, email, enabled, admin, permissions, projects}
  fastify.decorate(
    'createUserInternal',
    (body, params, epadAuth) =>
      new Promise(async (resolve, reject) => {
        if (!body) {
          reject(new BadRequestError('User Creation', new Error('No body sent')));
        } else {
          let existingUsername;
          let existingEmail;
          try {
            existingUsername = await models.user.findOne({
              where: { username: body.username },
              attributes: ['id'],
            });
            existingUsername = existingUsername ? existingUsername.dataValues.id : null;
            existingEmail = await models.user.findOne({
              where: { email: body.username },
              attributes: ['id'],
            });
            existingEmail = existingEmail ? existingEmail.dataValues.id : null;
          } catch (error) {
            reject(new InternalError('Create user in db', error));
          }
          if (existingUsername || existingEmail) {
            if (existingUsername)
              reject(new ResourceAlreadyExistsError(`Username `, body.username));
            if (existingEmail)
              reject(new ResourceAlreadyExistsError('Email address ', body.username));
          } else {
            try {
              const permissions = body.permissions ? body.permissions.split(',') : [''];
              const trimmedPermission = [];
              permissions.forEach((el) => trimmedPermission.push(el.trim()));
              if (body.permissions) {
                // eslint-disable-next-line no-param-reassign
                delete body.permissions;
              }
              // eslint-disable-next-line no-param-reassign
              body.permissions = trimmedPermission.join(',');
              const user = await models.user.create({
                ...body,
                createdtime: Date.now(),
                updatetime: Date.now(),
                creator: epadAuth.username,
              });

              const { id } = user.dataValues;
              if (body.projects && body.projects.length > 0) {
                const queries = [];
                try {
                  for (let i = 0; i < body.projects.length; i += 1) {
                    const isNone = body.projects[i].role.toLowerCase() === 'none';
                    if (!isNone) {
                      // eslint-disable-next-line no-await-in-loop
                      const project = await models.project.findOne({
                        where: { projectid: body.projects[i].project },
                        attributes: ['id'],
                      });
                      if (project === null) {
                        reject(
                          new BadRequestError(
                            'Create user with project associations',
                            new ResourceNotFoundError('Project', params.project)
                          )
                        );
                      } else {
                        const projectId = project.dataValues.id;
                        const entry = {
                          project_id: projectId,
                          user_id: id,
                          role: body.projects[i].role,
                          createdtime: Date.now(),
                          updatetime: Date.now(),
                        };
                        queries.push(models.project_user.create(entry));
                      }
                    }
                  }
                  try {
                    await Promise.all(queries);
                    await fastify.addOrphanAimsInternal(body.username, id);
                    resolve(`User succesfully created`);
                  } catch (err) {
                    reject(new InternalError('Create user project associations', err));
                  }
                } catch (err) {
                  reject(new InternalError('Create user project associations', err));
                }
              } else {
                await fastify.addOrphanAimsInternal(body.username, id);
                resolve(`User succesfully created`);
              }
            } catch (err) {
              reject(new InternalError('Create user in db', err));
            }
          }
        }
      })
  );

  fastify.decorate(
    'addOrphanAimsInternal',
    (username, userIdIn) =>
      new Promise(async (resolve, reject) => {
        try {
          let userId = userIdIn;
          fastify.log.info(`Checking if there are orphan aims for username ${username}`);
          if (!userId) {
            const dbUser = await models.user.findOne({
              where: { username },
              attributes: ['id'],
              raw: true,
            });
            if (dbUser) userId = dbUser.id;
          }
          // get aims that belongs to this username
          const aims = await fastify.getUserAIMsInternal(username, 'summary');
          // for each aim
          // find the project_aim and add a project_aim_user entry
          const promises = [];
          for (let i = 0; i < aims.length; i += 1) {
            promises.push(
              new Promise(async (resolveIn, rejectIn) => {
                try {
                  const args = await models.project_aim.findOne({
                    where: {
                      '$project.projectid$': aims[i].projectID,
                      aim_uid: aims[i].aimID,
                      ...fastify.qryNotDeleted(),
                    },
                    attributes: ['id'],
                    include: [{ model: models.project }],
                  });
                  if (args !== null)
                    await fastify.upsert(
                      models.project_aim_user,
                      {
                        project_aim_id: args.dataValues.id,
                        user_id: userId,
                      },
                      {
                        project_aim_id: args.dataValues.id,
                        user_id: userId,
                      },
                      username
                    );
                  resolveIn('Success');
                } catch (err) {
                  rejectIn(err);
                }
              })
            );
          }
          await Promise.all(promises);
          if (aims.length > 0) fastify.log.info(`Added ${aims.length} AIMs to ${username}`);
          else fastify.log.info('No orphan AIMs');
          resolve(`Added ${aims.length} AIMs to ${username}`);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getProjectInternal',
    (projectId) =>
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
        await fastify.prepProjectDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply,
          {
            project_id: project.id,
          }
        );
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
      .then((users) => {
        const result = [];
        //  cavit
        //  fastify.log.info('users --------->', users);
        //  cavit
        users.forEach((user) => {
          const projects = [];
          const projectToRole = [];
          user.projects.forEach((project) => {
            projects.push(project.projectid);
            projectToRole.push(`${project.projectid}:${project.project_user.role}`);
          });

          const permissions = user.permissions ? user.permissions.split(',') : [''];
          const trimmedPermission = [];
          permissions.forEach((el) => trimmedPermission.push(el.trim()));
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
          //  cavit
          //  fastify.log.info(' after adding project to each user --->>', obj);
          //  cavit
          result.push(obj);
        });
        reply.code(200).send(result);
      })
      .catch((err) => {
        reply.send(new InternalError('Getting users', err));
      });
  });

  fastify.decorate('getUser', (request, reply) => {
    fastify
      .getUserInternal(request.params)
      .then((res) => reply.code(200).send(res))
      .catch((err) => {
        reply.send(err);
      });
  });

  fastify.decorate('getUserPreferences', (request, reply) => {
    fastify
      .getUserInternal(request.params)
      .then((res) => {
        reply.code(200).send(res.preferences ? JSON.parse(res.preferences) : {});
      })
      .catch((err) => {
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
      .catch((err) => {
        reply.send(new InternalError(`Updating user ${request.params.user}`, err));
      });
  });

  fastify.decorate('updateUser', (request, reply) => {
    const rowsUpdated = {
      ...request.body,
      updated_by: request.epadAuth.username,
      updatetime: Date.now(),
    };
    // noone should be able to set admin apart from admins
    if (request.epadAuth.admin === false && request.body.admin) {
      reply.send(new UnauthorizedError('User has no right to update admin info'));
    } else {
      fastify
        .updateUserInternal(rowsUpdated, request.params)
        .then(() => {
          reply.code(200).send(`User ${request.params.user} updated sucessfully`);
        })
        .catch((err) => {
          reply.send(new InternalError(`Updating user ${request.params.user}`, err));
        });
    }
  });

  // updating username may affect the data in the tables below
  // eventlog, events, reviewer, user_flaggdimage, project_aim
  // updateUserInternal won't handle these tables
  fastify.decorate(
    'updateUserInternal',
    (rowsUpdated, params) =>
      new Promise(async (resolve, reject) => {
        models.user
          .update(rowsUpdated, { where: { username: params.user } })
          .then(async () => {
            if (rowsUpdated.username) await fastify.addOrphanAimsInternal(rowsUpdated.username);
            resolve();
          })
          .catch((err) => {
            reject(new InternalError(`Updating user ${params.user}`, err));
          });
      })
  );

  fastify.decorate(
    'updateUserInWorklistCompleteness',
    (email, username) =>
      new Promise(async (resolve, reject) => {
        models.worklist_study_completeness
          .update({ assignee: username }, { where: { assignee: email } })
          .then(() => {
            resolve();
          })
          .catch((err) => {
            reject(new InternalError(` Updating worklist_study_completeness ${username}`, err));
          });
      })
  );

  fastify.decorate(
    'getUserInternal',
    (params) =>
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
            user[0].projects.forEach((project) => {
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
    const deleteFromUser = models.user.destroy({
      where: {
        username: request.params.user,
      },
    });
    const deleteFromProgress = models.worklist_study_completeness.destroy({
      where: {
        assignee: request.params.user,
      },
    });
    Promise.all([deleteFromUser, deleteFromProgress])
      .then(() => {
        reply.code(200).send(`User ${request.params.user} is deleted successfully`);
      })
      .catch((err) => {
        reply.send(new InternalError(`Deleting ${request.params.user}`, err));
      });
  });

  fastify.decorate(
    'getMultipartBuffer',
    (stream) =>
      new Promise(async (resolve, reject) => {
        try {
          const bufs = [];
          stream.on('data', (d) => {
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
    (segEntity) =>
      new Promise(async (resolve, reject) => {
        try {
          const result = await this.request.get(
            `/?requestType=WADO&studyUID=${segEntity.studyInstanceUid.root}&seriesUID=${segEntity.seriesInstanceUid.root}&objectUID=${segEntity.sopInstanceUid.root}`,
            { responseType: 'stream' }
          );

          const bufs = [];
          result.data.on('data', (d) => {
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
    (params) =>
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

  // downloadParams = { aim: 'true', seg: 'true', summary: 'true' }
  fastify.decorate(
    'prepAimDownloadOneBatch',
    (dataDir, params, downloadParams, aims, header, data, archive) =>
      new Promise(async (resolve, reject) => {
        try {
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;
          // get aims
          const aimPromises = [];
          const segRetrievePromises = [];
          if (
            (downloadParams.summary && downloadParams.summary.toLowerCase() === 'true') ||
            (downloadParams.aim && downloadParams.aim.toLowerCase() === 'true') ||
            (downloadParams.seg && downloadParams.seg.toLowerCase() === 'true')
          ) {
            aims.forEach((aim) => {
              if (downloadParams.summary && downloadParams.summary.toLowerCase() === 'true') {
                const imageAnnotations =
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation;

                imageAnnotations.forEach((imageAnnotation) => {
                  // handle no comment
                  const commentSplit =
                    imageAnnotation.comment && imageAnnotation.comment.value
                      ? imageAnnotation.comment.value.split('~~')
                      : [''];
                  const points = [];
                  if (
                    imageAnnotation.markupEntityCollection &&
                    imageAnnotation.markupEntityCollection.MarkupEntity[0]
                  ) {
                    imageAnnotation.markupEntityCollection.MarkupEntity[0].twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate.forEach(
                      (coor) => {
                        points.push(`(${coor.x.value} ${coor.y.value})`);
                      }
                    );
                  }

                  // eslint-disable-next-line no-param-reassign
                  header = fastify.getCalculationHeaders(imageAnnotation, header);
                  // eslint-disable-next-line no-param-reassign
                  header = fastify.getOtherHeaders(imageAnnotation, header);
                  // eslint-disable-next-line no-param-reassign
                  header = fastify.arrayUnique(header, 'id');
                  // add values common to all annotations
                  // if the format is old first convert it to the standard DICOM format
                  const aimDate = fastify.fixAimDate(imageAnnotation.dateTime.value);
                  let row = {
                    aimUid: aim.ImageAnnotationCollection.uniqueIdentifier.root,
                    date: aimDate.toString(),
                    patientName: aim.ImageAnnotationCollection.person.name.value,
                    patientId: aim.ImageAnnotationCollection.person.id.value,
                    reviewer: fastify.getAuthorUsernameString(aim),
                    reviewerNames: fastify.getAuthorNameString(aim),
                    name: imageAnnotation.name.value.split('~')[0],
                    comment: commentSplit[0],
                    userComment: commentSplit.length > 1 ? commentSplit[1] : '',
                    points: `[${points}]`,
                    dsoSeriesUid:
                      imageAnnotation.segmentationEntityCollection &&
                      imageAnnotation.segmentationEntityCollection.SegmentationEntity
                        ? imageAnnotation.segmentationEntityCollection.SegmentationEntity[0]
                            .seriesInstanceUid.root
                        : '',
                    studyUid:
                      imageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity[0]
                        .imageStudy.instanceUid.root,
                    seriesUid:
                      imageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity[0]
                        .imageStudy.imageSeries.instanceUid.root,
                    imageUid:
                      imageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity[0]
                        .imageStudy.imageSeries.imageCollection.Image[0].sopInstanceUid.root,
                  };

                  row = fastify.getCalculationData(imageAnnotation, row);
                  row = fastify.getOtherData(imageAnnotation, row);
                  data.push(row);
                });
              }
              if (downloadParams.aim && downloadParams.aim.toLowerCase() === 'true') {
                if (archive)
                  archive.append(JSON.stringify(aim), {
                    name: `${dataDir}/${aim.ImageAnnotationCollection.uniqueIdentifier.root}.json`,
                  });
                else
                  aimPromises.push(() =>
                    fs.writeFile(
                      `${dataDir}/${aim.ImageAnnotationCollection.uniqueIdentifier.root}.json`,
                      JSON.stringify(aim)
                    )
                  );
              }
              // only get the segs if we are retrieving series. study already gets it
              if (
                downloadParams.seg &&
                downloadParams.seg.toLowerCase() === 'true' &&
                aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .segmentationEntityCollection
              ) {
                const segEntity =
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .segmentationEntityCollection.SegmentationEntity[0];
                segRetrievePromises.push(() => fastify.getSegDicom(segEntity));
              }
              isThereDataToWrite = true;
            });
            await fastify.pq.addAll(aimPromises);
            if (
              downloadParams.seg &&
              downloadParams.seg.toLowerCase() === 'true' &&
              segRetrievePromises.length > 0
            ) {
              // we need to create the segs dir. this should only happen with retrieveSegs
              if (!archive) fs.mkdirSync(`${dataDir}/segs`);
              const segWritePromises = [];
              const segs = await fastify.pq.addAll(segRetrievePromises);
              for (let i = 0; i < segs.length; i += 1) {
                if (archive)
                  archive.append(segs[i].buffer, { name: `${dataDir}/segs/${segs[i].uid}.dcm` });
                else
                  segWritePromises.push(() =>
                    fs.writeFile(`${dataDir}/segs/${segs[i].uid}.dcm`, segs[i].buffer)
                  );
                isThereDataToWrite = true;
              }
              await fastify.pq.addAll(segWritePromises);
            }
          }
          resolve({ isThereDataToWrite, data, header });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('fixAimDate', (date) => {
    if (date.includes('GMT')) {
      // 10.09.2018T03:51:41PM.Zone:GMT
      // parse with regex. will return ['10.09.2018T03:51:41PM', '10', '09', '2018', '03', '51', '41', 'PM', index: 0, input: '10.09.2018T03:51:41PM', groups: undefined]
      const tZOffset = new Date().getTimezoneOffset();
      const dateParts = date
        .replace('.Zone:GMT', '')
        .match(/(\d\d)\.(\d\d)\.(\d\d\d\d)T(\d\d):(\d\d):(\d\d)(AM|PM)/);
      const hour =
        (dateParts[7] === 'PM' ? Number(dateParts[4]) + 12 : Number(dateParts[4])) + tZOffset / 60;
      const min = Number(dateParts[5]) + (tZOffset % 60);
      return new Date(
        `${dateParts[3]}-${dateParts[1]}-${dateParts[2]}T${fastify.padZeros(
          hour
        )}:${fastify.padZeros(min)}:${dateParts[6]}.000`
      );
    }
    // DICOM format
    const dateParts = date.match(/(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/);
    return new Date(
      `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}T${dateParts[4]}:${dateParts[5]}:${dateParts[6]}.000`
    );
  });

  fastify.decorate('padZeros', (number) => (number > 9 ? number : `0${number}`));

  fastify.decorate(
    'prepAimDownload',
    (dataDir, params, epadAuth, downloadParams, aimsResult, archive) =>
      new Promise(async (resolve, reject) => {
        try {
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;
          // create the header base
          let header = [
            // Date_Created	Patient_Name	Patient_ID	Reviewer	Name Comment	Points	Study_UID	Series_UID	Image_UID
            { id: 'aimUid', title: 'Aim_UID' },
            { id: 'date', title: 'Date_Created' },
            { id: 'patientName', title: 'Patient_Name' },
            { id: 'patientId', title: 'Patient_ID' },
            { id: 'reviewer', title: 'Reviewer' },
            { id: 'reviewerNames', title: 'Reviewer Names' },
            { id: 'name', title: 'Name' },
            { id: 'comment', title: 'Comment' },
            { id: 'userComment', title: 'User_Comment' },
            { id: 'points', title: 'Points' },
            { id: 'dsoSeriesUid', title: 'DSO_Series_UID' },
            { id: 'studyUid', title: 'Study_UID' },
            { id: 'seriesUid', title: 'Series_UID' },
            { id: 'imageUid', title: 'Image_UID' },
          ];
          let data = [];
          const aims = aimsResult.rows;
          if (aims.length < aimsResult.total_rows) {
            fastify.log.info(
              `Download requires time to get ${Math.ceil(
                aimsResult.total_rows / aims.length
              )} batches`
            );
            let totalAimCount = aims.length;
            let { bookmark } = aimsResult;
            // put the first batch
            let batchReturn = await fastify.prepAimDownloadOneBatch(
              dataDir,
              params,
              downloadParams,
              aims,
              header,
              data,
              archive
            );
            isThereDataToWrite = batchReturn.isThereDataToWrite || isThereDataToWrite;
            header = batchReturn.header;
            data = batchReturn.data;
            fastify.log.info('Downloaded first batch');
            let i = 2;
            // get batches and put them in download dir till we get all aims
            while (totalAimCount < aimsResult.total_rows) {
              // eslint-disable-next-line no-await-in-loop
              const newResult = await fastify.getAimsInternal(
                'json',
                params,
                undefined,
                epadAuth,
                bookmark
              );
              batchReturn =
                // eslint-disable-next-line no-await-in-loop
                await fastify.prepAimDownloadOneBatch(
                  dataDir,
                  params,
                  downloadParams,
                  newResult.rows,
                  header,
                  data,
                  archive
                );
              isThereDataToWrite = batchReturn.isThereDataToWrite || isThereDataToWrite;
              header = batchReturn.header;
              data = batchReturn.data;
              // eslint-disable-next-line prefer-destructuring
              bookmark = newResult.bookmark;
              totalAimCount += newResult.rows.length;

              fastify.log.info(`Downloaded batch ${i}`);
              i += 1;
            }
          } else {
            const batchReturn = await fastify.prepAimDownloadOneBatch(
              dataDir,
              params,
              downloadParams,
              aims,
              header,
              data,
              archive
            );
            isThereDataToWrite = batchReturn.isThereDataToWrite || isThereDataToWrite;
            header = batchReturn.header;
            data = batchReturn.data;
          }
          // TODO archive
          if (downloadParams.summary && downloadParams.summary.toLowerCase() === 'true') {
            // create the csv writer and write the summary
            const csvWriter = createCsvWriter({
              path: `${dataDir}/summary.csv`,
              header,
            });
            csvWriter
              .writeRecords(data)
              .then(() => fastify.log.info('The summary CSV file was written successfully'));
            isThereDataToWrite = true;
          }
          resolve(isThereDataToWrite);
        } catch (err) {
          reject(err);
        }
      })
  );

  // if the download is for one series only or a list of series, retrieveSegs is sent as true
  // if it is study or a list of studies it is false
  // TODO should we check if it is already downloaded?
  fastify.decorate(
    'prepSeriesDownloadDir',
    (dataDir, params, query, epadAuth, retrieveSegs, fileUids, archive) =>
      new Promise(async (resolve, reject) => {
        try {
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;
          try {
            const parts = await fastify.getSeriesWadoMultipart(params);
            // get dicoms
            const dcmPromises = [];
            for (let i = 0; i < parts.length; i += 1) {
              const arrayBuffer = parts[i];
              const ds = dcmjs.data.DicomMessage.readFile(arrayBuffer);
              const dicomUid =
                ds.dict['00080018'] && ds.dict['00080018'].Value ? ds.dict['00080018'].Value[0] : i;
              if (archive)
                archive.append(Buffer.from(arrayBuffer), { name: `${dataDir}/${dicomUid}.dcm` });
              else
                dcmPromises.push(() =>
                  fs.writeFile(`${dataDir}/${dicomUid}.dcm`, Buffer.from(arrayBuffer))
                );
              isThereDataToWrite = true;
            }
            await fastify.pq.addAll(dcmPromises);
          } catch (errDicom) {
            // TODO make a stricter check. dicomweb-server is returning 500 now. should it return 404
            fastify.log.error(
              `Could not retrive DICOMs, can be a nondicom series. Ignoring. Error: ${
                errDicom.message
              }. ${JSON.stringify(params)}`
            );
          }
          if (query.includeAims && query.includeAims === 'true') {
            const aimsResult = await fastify.getAimsInternal('json', params, undefined, epadAuth);
            const isThereAimToWrite = await fastify.prepAimDownload(
              dataDir,
              params,
              epadAuth,
              retrieveSegs ? { aim: 'true', seg: 'true' } : { aim: 'true' },
              aimsResult,
              archive
            );
            isThereDataToWrite = isThereDataToWrite || isThereAimToWrite;
          }
          const files = await fastify.getFilesFromUIDsInternal(
            { format: 'stream' },
            fileUids,
            params,
            dataDir,
            archive
          );
          isThereDataToWrite = isThereDataToWrite || files;
          resolve(isThereDataToWrite);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'prepStudyDownloadDir',
    (dataDir, params, query, epadAuth, fileUids, archive) =>
      new Promise(async (resolve, reject) => {
        try {
          let isThereDataToWrite = false;
          // get study series
          const studySeries = await fastify.getSeriesDicomOrNotInternal(
            { study: params.study },
            { format: 'summary' },
            epadAuth,
            true
          );
          // call fastify.prepSeriesDownloadDir(); for each
          for (let i = 0; i < studySeries.length; i += 1) {
            const seriesDir = `${dataDir}/Series-${studySeries[i].seriesUID}`;
            if (!archive) fs.mkdirSync(seriesDir);
            // eslint-disable-next-line no-await-in-loop
            const isThereData = await fastify.prepSeriesDownloadDir(
              seriesDir,
              { ...params, series: studySeries[i].seriesUID },
              query,
              epadAuth,
              false,
              fileUids,
              archive
            );
            isThereDataToWrite = isThereDataToWrite || isThereData;
          }
          if (query.includeAims && query.includeAims === 'true') {
            const studyAimsParams = { ...params, series: '' }; // for study aims, series uid is empty
            const aimsResult = await fastify.getAimsInternal(
              'json',
              studyAimsParams,
              undefined,
              epadAuth
            );
            const isThereAimToWrite = await fastify.prepAimDownload(
              dataDir,
              studyAimsParams,
              epadAuth,
              { aim: 'true' },
              aimsResult,
              archive
            );
            isThereDataToWrite = isThereDataToWrite || isThereAimToWrite;
          }
          const files = await fastify.getFilesFromUIDsInternal(
            { format: 'stream' },
            fileUids,
            { ...params, series: 'NA' },
            dataDir,
            archive
          );
          isThereDataToWrite = isThereDataToWrite || files;
          resolve(isThereDataToWrite);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('writeHead', (dirName, res, reqOrigin) => {
    // if there is corsorigin in config and it is not false then reflect request origin
    res.writeHead(200, {
      ...{
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${dirName}.zip`,
      },
      ...(config.corsOrigin ? { 'Access-Control-Allow-Origin': reqOrigin } : {}),
    });
  });

  fastify.decorate('setUpDownload', async (projectId, dirName, output, returnFolder, reqOrigin) => {
    // not handling all project intentionally. only download files for that project
    const fileUids = await fastify.getFileUidsForProject({ project: projectId });
    // if it has res, it is fastify reply
    const isResponseJustStream = !output.raw;
    const res = isResponseJustStream ? output : output.raw;
    const timestamp = new Date().getTime();
    // create tmp parent directory if it does not exist
    if (returnFolder && !fs.existsSync('tmp')) fs.mkdirSync('tmp');
    const dir = returnFolder ? `tmp/tmp_${timestamp}` : '';

    if (returnFolder && fs.existsSync(dir)) {
      console.error('temp file exists');
      return {};
    }
    let archive;
    if (!returnFolder)
      archive = archiver('zip', {
        zlib: { level: 9 }, // Sets the compression level.
      });

    if (returnFolder) fs.mkdirSync(dir);
    const dataDir = returnFolder ? `${dir}/${dirName}` : dirName;
    if (returnFolder) fs.mkdirSync(dataDir);
    const isThereDataToWrite = false;
    const headWritten = true;
    if (!isResponseJustStream) fastify.writeHead(dirName, res, reqOrigin);
    // create the archive
    if (!returnFolder)
      archive
        .on('error', (err) => {
          throw new InternalError('Archiving ', err);
        })
        .pipe(res);
    return {
      fileUids,
      isResponseJustStream,
      headWritten,
      archive,
      dir,
      dataDir,
      isThereDataToWrite,
    };
  });

  fastify.decorate(
    'wrapUpDownload',
    (
      isThereDataToWrite,
      returnFolder,
      archive,
      dir,
      callback
      // eslint-disable-next-line consistent-return
    ) => {
      if (isThereDataToWrite) {
        if (!returnFolder) archive.on('end', callback);

        if (!returnFolder) archive.finalize();
        else callback(dir);
      } else {
        // finalize even if no files?
        if (!returnFolder) archive.finalize();
        throw new InternalError('Downloading', new Error('No file in download'));
      }
    }
  );

  // downloads subject(s)
  // either params.subject is full or whereJSON has {project_id} or {project_id, subject_id} and subject_id is array
  fastify.decorate(
    'prepSubjectsDownload',
    (reqOrigin, params, query, epadAuth, output, whereJSON, returnFolder) =>
      new Promise(async (resolve, reject) => {
        if (
          !params.subject &&
          !(whereJSON && whereJSON.project_id && Array.isArray(whereJSON.subject_id))
        ) {
          fastify.log.error(
            'Either params.subject should be full or whereJSON should have {project_id} or {project_id, subject_id} and subject_id is array'
          );
          reject(
            new BadRequestError(
              'Improper download inputs',
              new InternalError('Subject, Subjects or Project required')
            )
          );
        } else {
          try {
            const dirName = params.subject ? params.subject : 'Patients';
            const {
              fileUids,
              isResponseJustStream,
              headWritten,
              archive,
              dir,
              dataDir,
              isThereDataToWrite,
            } = await fastify.setUpDownload(
              params.project,
              dirName,
              output,
              returnFolder,
              reqOrigin
            );
            const studiesInfo = await fastify.getStudiesInternal(
              whereJSON,
              params,
              epadAuth,
              true,
              query
            );
            const prepReturn = await fastify.prepMultipleStudies(
              studiesInfo,
              dataDir,
              true,
              fileUids,
              params,
              query,
              epadAuth,
              headWritten,
              returnFolder,
              archive,
              isThereDataToWrite
            );
            // see if there are files
            if (params.subject) {
              if (!fs.existsSync(`${dataDir}/Patient-${params.subject}`))
                fs.mkdirSync(`${dataDir}/Patient-${params.subject}`);
              // eslint-disable-next-line no-await-in-loop
              const files = await fastify.getFilesFromUIDsInternal(
                { format: 'stream' },
                fileUids,
                { subject: params.subject, study: 'NA', series: 'NA' },
                `${dataDir}/Patient-${params.subject}`,
                !returnFolder ? archive : undefined
              );
              prepReturn.isThereDataToWrite = prepReturn.isThereDataToWrite || files;
            } else {
              // TODO what to do if it is project download
              for (let i = 0; i < whereJSON.subject_id.length; i += 1) {
                // we need to get subject_uid
                // eslint-disable-next-line no-await-in-loop
                const { subjectuid } = await models.subject.findOne({
                  where: { id: whereJSON.subject_id[i] },
                  attributes: ['subjectuid'],
                  raw: true,
                });
                if (returnFolder && !fs.existsSync(`${dataDir}/Patient-${subjectuid}`))
                  fs.mkdirSync(`${dataDir}/Patient-${subjectuid}`);
                // eslint-disable-next-line no-await-in-loop
                const files = await fastify.getFilesFromUIDsInternal(
                  { format: 'stream' },
                  fileUids,
                  { subject: subjectuid, study: 'NA', series: 'NA' },
                  `${dataDir}/Patient-${subjectuid}`,
                  !returnFolder ? archive : undefined
                );
                prepReturn.isThereDataToWrite = prepReturn.isThereDataToWrite || files;
              }
            }

            fastify.wrapUpDownload(
              prepReturn.isThereDataToWrite,
              returnFolder,
              archive,
              dir,
              (returnDir) => {
                if (!isResponseJustStream) {
                  // eslint-disable-next-line no-param-reassign
                  output.sent = true;
                }
                if (returnFolder) resolve(returnDir);
                else resolve();
              }
            );
          } catch (err) {
            console.log(err);
            reject(err);
          }
        }
      })
  );

  // downloads study(s)
  // either params.study is full or studyinfos
  fastify.decorate(
    'prepStudiesDownload',
    (reqOrigin, params, query, epadAuth, output, studyInfos, returnFolder) =>
      new Promise(async (resolve, reject) => {
        if (!params.study && !studyInfos) {
          fastify.log.error('Either params.study should be full or studyinfos');
          reject(
            new BadRequestError(
              'Improper download inputs',
              new InternalError('Study, Studies required')
            )
          );
        } else {
          try {
            const dirName = params.study ? params.study : 'Studies';
            const {
              fileUids,
              isResponseJustStream,
              headWritten,
              archive,
              dir,
              dataDir,
              isThereDataToWrite,
            } = await fastify.setUpDownload(
              params.project,
              dirName,
              output,
              returnFolder,
              reqOrigin
            );
            let prepReturn = { headWritten };
            prepReturn = await fastify.prepMultipleStudies(
              studyInfos,
              dataDir,
              false,
              fileUids,
              params,
              query,
              epadAuth,
              headWritten,
              returnFolder,
              archive,
              isThereDataToWrite
            );

            fastify.wrapUpDownload(
              prepReturn.isThereDataToWrite,
              returnFolder,
              archive,
              dir,
              (returnDir) => {
                if (!isResponseJustStream) {
                  // eslint-disable-next-line no-param-reassign
                  output.sent = true;
                }
                if (returnFolder) resolve(returnDir);
                else resolve();
              }
            );
          } catch (err) {
            console.log(err);
            reject(err);
          }
        }
      })
  );

  // downloads series(s)
  // either params.series is full or seriesinfos
  fastify.decorate(
    'prepSeriesDownload',
    (reqOrigin, params, query, epadAuth, output, seriesInfos, returnFolder) =>
      new Promise(async (resolve, reject) => {
        if (!params.series && !seriesInfos) {
          fastify.log.error('Either params.series should be full or seriesInfos');
          reject(
            new BadRequestError(
              'Improper download inputs',
              new InternalError('Series or multiple series required')
            )
          );
        } else {
          try {
            const dirName = params.series ? params.series : 'Series';
            const {
              fileUids,
              isResponseJustStream,
              headWritten,
              archive,
              dir,
              dataDir,
              isThereDataToWrite,
            } = await fastify.setUpDownload(
              params.project,
              dirName,
              output,
              returnFolder,
              reqOrigin
            );
            const prepReturn = { headWritten, isThereDataToWrite };
            if (seriesInfos) {
              for (let i = 0; i < seriesInfos.length; i += 1) {
                const seriesDir = `${dataDir}/Series-${seriesInfos[i].series}`;
                if (returnFolder) fs.mkdirSync(seriesDir);
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
                  true,
                  fileUids,
                  !returnFolder ? archive : undefined
                );
                prepReturn.isThereDataToWrite = prepReturn.isThereDataToWrite || isThereData;
              }
            } else if (params.series) {
              const seriesDir = `${dataDir}/Series-${params.series}`;
              if (returnFolder) fs.mkdirSync(seriesDir);
              // eslint-disable-next-line no-await-in-loop
              const isThereData = await fastify.prepSeriesDownloadDir(
                seriesDir,
                params,
                query,
                epadAuth,
                true,
                fileUids,
                !returnFolder ? archive : undefined
              );
              prepReturn.isThereDataToWrite = prepReturn.isThereDataToWrite || isThereData;
            }
            fastify.wrapUpDownload(
              prepReturn.isThereDataToWrite,
              returnFolder,
              archive,
              dir,
              (returnDir) => {
                if (!isResponseJustStream) {
                  // eslint-disable-next-line no-param-reassign
                  output.sent = true;
                }
                if (returnFolder) resolve(returnDir);
                else resolve();
              }
            );
          } catch (err) {
            console.log(err);
            reject(err);
          }
        }
      })
  );

  // downloads project
  // requires params.project and whereJSON.project_id
  fastify.decorate(
    'prepProjectDownload',
    (reqOrigin, params, query, epadAuth, output, whereJSON, returnFolder) =>
      new Promise(async (resolve, reject) => {
        if (!params.project || !whereJSON.project_id) {
          fastify.log.error('params.project and whereJSON.project_id should be full');
          reject(
            new BadRequestError('Improper download inputs', new InternalError('projectId required'))
          );
        } else {
          try {
            const dirName = params.project;
            const {
              fileUids,
              isResponseJustStream,
              headWritten,
              archive,
              dir,
              dataDir,
              isThereDataToWrite,
            } = await fastify.setUpDownload(
              params.project,
              dirName,
              output,
              returnFolder,
              reqOrigin
            );
            const studiesInfo = await fastify.getStudiesInternal(
              whereJSON,
              params,
              epadAuth,
              true,
              query
            );

            const prepReturn = await fastify.prepMultipleStudies(
              studiesInfo,
              dataDir,
              true,
              fileUids,
              params,
              query,
              epadAuth,
              headWritten,
              returnFolder,
              archive,
              isThereDataToWrite
            );
            const files = await fastify.getFilesFromUIDsInternal(
              { format: 'stream' },
              fileUids,
              { subject: 'NA', study: 'NA', series: 'NA' },
              dataDir,
              !returnFolder ? archive : undefined
            );
            prepReturn.isThereDataToWrite = prepReturn.isThereDataToWrite || files;
            // see if there are files
            const subjects = await models.subject.findAll({
              where: { '$project_subjects.project_id$': whereJSON.project_id },
              include: [models.project_subject],
            });
            if (subjects !== null) {
              for (let i = 0; i < subjects.length; i += 1) {
                if (
                  returnFolder &&
                  !fs.existsSync(`${dataDir}/Patient-${subjects[i].dataValues.subjectuid}`)
                )
                  fs.mkdirSync(`${dataDir}/Patient-${subjects[i].dataValues.subjectuid}`);
                // eslint-disable-next-line no-await-in-loop
                const patientFiles = await fastify.getFilesFromUIDsInternal(
                  { format: 'stream' },
                  fileUids,
                  {
                    subject: subjects[i].dataValues.subjectuid,
                    study: 'NA',
                    series: 'NA',
                  },
                  `${dataDir}/Patient-${subjects[i].dataValues.subjectuid}`,
                  !returnFolder ? archive : undefined
                );
                prepReturn.isThereDataToWrite = prepReturn.isThereDataToWrite || patientFiles;
              }
            }

            fastify.wrapUpDownload(
              prepReturn.isThereDataToWrite,
              returnFolder,
              archive,
              dir,
              (returnDir) => {
                if (!isResponseJustStream) {
                  // eslint-disable-next-line no-param-reassign
                  output.sent = true;
                }
                if (returnFolder) resolve(returnDir);
                else resolve();
              }
            );
          } catch (err) {
            console.log(err);
            reject(err);
          }
        }
      })
  );

  fastify.decorate(
    'prepMultipleStudies',
    async (
      studiesInfo,
      dataDir,
      downloadPatientFiles,
      fileUids,
      params,
      query,
      epadAuth,
      headWritten,
      returnFolder,
      archive,
      isThereDataToWrite
    ) => {
      const patientsFolders = [];
      // download all studies under subject
      for (let i = 0; i < studiesInfo.length; i += 1) {
        const studyUid = studiesInfo[i].study;
        let studySubDir = `Study-${studyUid}`;
        const subjectUid = studiesInfo[i].subject;
        let isTherePatientData = false;
        if (subjectUid) {
          if (returnFolder && !fs.existsSync(`${dataDir}/Patient-${subjectUid}`))
            fs.mkdirSync(`${dataDir}/Patient-${subjectUid}`);
          // if there is wherejson, it can be project or subject(s) download
          // if it is project download, one subject or multiple subjects I need to get files for that subjects
          if (downloadPatientFiles && !patientsFolders.includes(`Patient-${subjectUid}`)) {
            patientsFolders.push(`Patient-${subjectUid}`);
            isTherePatientData =
              isTherePatientData ||
              // eslint-disable-next-line no-await-in-loop
              (await fastify.getFilesFromUIDsInternal(
                { format: 'stream' },
                fileUids,
                { subject: subjectUid, study: 'NA', series: 'NA' },
                `${dataDir}/Patient-${subjectUid}`,
                !returnFolder ? archive : undefined
              ));
          }
          studySubDir = `Patient-${subjectUid}/Study-${studyUid}`;
        }
        const studyDir = `${dataDir}/${studySubDir}`;
        if (returnFolder) fs.mkdirSync(studyDir);
        // eslint-disable-next-line no-await-in-loop
        const isThereData = await fastify.prepStudyDownloadDir(
          studyDir,
          { ...params, subject: subjectUid, study: studyUid },
          query,
          epadAuth,
          fileUids,
          !returnFolder ? archive : undefined
        );
        if (returnFolder && !isThereData) fs.rmdirSync(studyDir);
        // eslint-disable-next-line no-param-reassign
        isThereDataToWrite = isThereDataToWrite || isThereData || isTherePatientData;
      }
      return { headWritten, isThereDataToWrite, patientsFolders };
    }
  );

  fastify.decorate('getPatientStudyFromProject', async (request, reply) => {
    try {
      // TODO check if it is in the project

      if (request.query.format === 'stream') {
        await fastify.prepStudiesDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply
        );
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
    (params) =>
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
        let whereJSON = {
          subject_id: subject.id,
        };
        if (request.params.project !== config.XNATUploadProjectID)
          whereJSON = { ...whereJSON, project_id: project.id };
        await fastify.prepSubjectsDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply,
          whereJSON
        );
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
        let whereJSON = {
          subject_id: subjectIds,
        };
        if (request.params.project !== config.XNATUploadProjectID)
          whereJSON = { ...whereJSON, project_id: project.id };

        await fastify.prepSubjectsDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply,
          whereJSON
        );
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
        await fastify.prepStudiesDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply,
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
        await fastify.prepSeriesDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply,
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
            `File ${request.params.filename} successfully saved in project  ${request.params.project}`
          )
      )
      .catch((err) => reply.send(err));
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
              .catch((errAssoc) => {
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
        projectFiles.forEach((projectFile) => fileUids.push(projectFile.file_uid));
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
        projectUsers.forEach((el) => {
          userPromise.push(
            models.user.findOne({
              where: { id: el.user_id },
              raw: true,
            })
          );
        });
        const data = await Promise.all(userPromise);
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
          `File ${request.params.filename} check and deletion from project ${request.params.project}`,
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
        let result = [];
        if (request.params.project === config.unassignedProjectID && config.pollDW === 0) {
          result = await fastify.getPatientStudiesInternal(
            request.params,
            [],
            request.epadAuth,
            request.query,
            false,
            '0020000D',
            'studyUID',
            true
          );
        } else {
          const whereJSON =
            request.params.project !== config.XNATUploadProjectID
              ? {
                  project_id: project.id,
                }
              : {};
          result = await fastify.getStudiesInternal(
            whereJSON,
            request.params,
            request.epadAuth,
            false,
            request.query
          );
        }

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
              // TODO see if we can use getSeriesDicomOrNotInternal instead. leaving like this as we get nondicoms below
              // eslint-disable-next-line no-await-in-loop
              const studySeries = await fastify.getStudySeriesInternal(
                { project: request.params.project, study: studyUids[j] },
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
          // sort by series number (was ['patientName', 'seriesDescription'])
          result = _.sortBy(result, 'seriesNo');
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
        PatientID: { tag: '00100020', vr: 'LO' },
        PatientName: { tag: '00100010', vr: 'PN' },
      };
      const queryKeysStudy = {
        StudyInstanceUID: { tag: '0020000D', vr: 'UI' },
        StudyDescription: { tag: '00081030', vr: 'LO' },
      };
      const queryKeysSeries = {
        SeriesInstanceUID: { tag: '0020000E', vr: 'UI' },
        SeriesDescription: { tag: '0008103E', vr: 'LO' },
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
          // if dicom doesn't have that tag, add it
          if (!editedDataset[queryKeys[keysInQuery[i]].tag]) {
            editedDataset[queryKeys[keysInQuery[i]].tag] = { vr: queryKeys[keysInQuery[i]].vr };
          }
          switch (queryKeys[keysInQuery[i]].vr) {
            case 'PN':
              editedDataset[queryKeys[keysInQuery[i]].tag].Value = [
                // {
                //   Alphabetic: tagValues[keysInQuery[i]],
                // },
                tagValues[keysInQuery[i]],
              ];
              break;
            case 'DS':
              editedDataset[queryKeys[keysInQuery[i]].tag].Value = [
                parseFloat(tagValues[keysInQuery[i]]),
              ];
              break;
            case 'IS':
              editedDataset[queryKeys[keysInQuery[i]].tag].Value = [
                parseInt(tagValues[keysInQuery[i]], 10),
              ];
              break;
            default:
              editedDataset[queryKeys[keysInQuery[i]].tag].Value = [tagValues[keysInQuery[i]]];
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
            new InternalError(
              `Updating ${JSON.stringify(params)} dicoms with ${JSON.stringify(tagValues)}`,
              err
            )
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
          const studySeries = await fastify.getSeriesDicomOrNotInternal(
            { study: studyUid },
            { format: 'summary' },
            epadAuth,
            true
          );
          for (let i = 0; i < studySeries.length; i += 1) {
            // causes dicomwebserver to crash when done in parallel
            // eslint-disable-next-line no-await-in-loop
            await fastify.updateSeriesBuffers(
              params,
              tagValues,
              studyUid,
              studySeries[i].seriesUID,
              applyPatient,
              applyStudy
            );
          }
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
          let applyPatient = query.applyPatient === 'true';
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
          else if (
            ((body.PatientID && subject.subjectuid !== body.PatientID) ||
              (body.PatientName && subject.name !== body.PatientName)) &&
            (!body.StudyInstanceUID || study.studyuid === body.StudyInstanceUID) &&
            !applyStudy
          )
            reject(
              new BadRequestError(
                'Edit Tags',
                new Error(
                  'Cannot change Patient information without changing Study Instance UID or with applyStudy query parameter true'
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
                  studyUids[i].study,
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
              // if there is only one study under patient and applystudy it is applypatient too
              if (studyUids.length === 1 && applyStudy) applyPatient = true;
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
                    name: body.PatientName ? body.PatientName : subject.name,
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
              (body.StudyDescription && study.description !== body.StudyDescription) ||
              applyStudy
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
                let newStudy = await models.study.findOne({
                  where: { studyuid: body.StudyInstanceUID },
                  raw: true,
                });
                if (newStudy) {
                  // study already exist add to it
                  fastify.log.warn(`Study ${body.StudyInstanceUID} already exist adding to it`);
                } else {
                  newStudy = await models.study.create({
                    studyuid: body.StudyInstanceUID,
                    description: body.StudyDescription || study.description,
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
                    study_id: newStudy.id,
                    updatetime: Date.now(),
                  },
                  { proj_subj_id: projectSubjectStudy.proj_subj_id, study_id: newStudy.id },
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
      if (!request.epadAuth.admin) {
        reply.send(new UnauthorizedError('User is not admin, cannot edit tags'));
      } else {
        request.params.series = seriesUid;
        await fastify.editTags(request, reply);
      }
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
    (level, objectId, projectId) =>
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
            case 'aim':
              uidField = 'aim_uid';
              model = 'project_aim';
              break;
            case 'template':
              uidField = 'template_uid';
              model = 'project_template';
              break;
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
            case 'pluginqueue':
              uidField = 'id';
              model = 'plugin_queue';
              break;
            case 'subject':
              uidField = 'subjectuid';
              model = 'subject';
              break;
            case 'study':
              uidField = 'studyuid';
              model = 'study';
              break;
            default:
              uidField = undefined;
              model = undefined;
              break;
          }
          if (model) {
            let whereJSON = { [uidField]: objectId };
            if (model.startsWith('project_') && !projectId) {
              // check if all the entities are the same user's and resolve that username if so
              // resolves '' if not
              const objects = await models[model].findAll({
                where: whereJSON,
              });
              let creator = '';
              for (let i = 0; i < objects.length; i += 1) {
                // eslint-disable-next-line prefer-destructuring
                if (creator === '') creator = objects[i].creator;
                else if (creator !== objects[i].creator) creator = '';
              }
              resolve(creator);
            } else {
              // checks relation
              if (model.startsWith('project_') && projectId)
                whereJSON = { ...whereJSON, project_id: projectId };

              const object = await models[model].findOne({
                where: whereJSON,
              });
              if (object) resolve(object.creator);
            }
          }
          resolve();
        } catch (err) {
          reject(new InternalError(`Getting object creator for ${level} ${objectId}`, err));
        }
      })
  );
  fastify.decorate('upsert', (model, values, condition, user, transaction) =>
    model.findOne({ where: condition }).then((obj) => {
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
      .then((result) => {
        reply.send(result);
      })
      .catch((err) => reply.send(err));
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
          if (config.env !== 'test' && config.mode !== 'lite') {
            const qry = `SELECT COUNT(DISTINCT subject_id) AS count FROM project_subject;`;
            numOfPatients = (await fastify.orm.query(qry, { type: QueryTypes.SELECT }))[0].count;
          } else {
            const patients = await fastify.getPatientsInternal({}, undefined, undefined, true);
            numOfPatients = patients.length;
          }

          let numOfStudies = 0;
          if (config.env !== 'test' && config.mode !== 'lite') {
            const qry = `SELECT COUNT(DISTINCT study_id) AS count FROM project_subject_study;`;
            numOfStudies = (await fastify.orm.query(qry, { type: QueryTypes.SELECT }))[0].count;
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
          const numOfTemplateAimsMap = {};
          if (config.env !== 'test') {
            const qry = `SELECT COUNT(DISTINCT aim_uid) AS count FROM project_aim WHERE deleted is NULL;`;
            numOfAims = (await fastify.orm.query(qry, { type: QueryTypes.SELECT }))[0].count;
            const numOfTemplateAims = await models.project_aim.findAll({
              group: ['template'],
              attributes: ['template', [Sequelize.fn('COUNT', 'aim_uid'), 'aimcount']],
              raw: true,
              where: fastify.qryNotDeleted(),
            });
            numOfTemplateAims.forEach((item) => {
              numOfTemplateAimsMap[item.template] = item.aimcount;
            });
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
            const numOfTemplateAims = numOfTemplateAimsMap[templateCode] || 0;
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
    // eslint-disable-next-line prefer-const
    let { year, host } = request.query;
    if (!year) year = new Date().getFullYear();
    let hostFilter = '';
    if (host) hostFilter = ` and host like '%${host}%'`;
    const stats = await fastify.orm.query(
      `select sum(numOfUsers) numOfUsers,sum(numOfProjects) numOfProjects, sum(numOfPatients) numOfPatients,sum(numOfStudies) numOfStudies,sum(numOfSeries) numOfSeries,sum(numOfAims) numOfAims,sum(numOfDsos) numOfDSOs,sum(numOfPacs) numOfPacs,sum(numOfAutoQueries) numOfAutoQueries,sum(numOfWorkLists) numOfWorkLists,sum(numOfFiles) numOfFiles,max(numOfTemplates) numOfTemplates,max(numOfPlugins) numOfPlugins from epadstatistics mt inner join(select max(id) id from epadstatistics where host not like '%epad-build.stanford.edu%' and host not like '%epad-dev5.stanford.edu%' and host not like '%epad-dev4.stanford.edu%' and updatetime like '%${year}%' ${hostFilter} group by SUBSTRING_INDEX(SUBSTRING_INDEX(host, '|', 2), '|', -1) ) st on mt.id = st.id `
    );
    const statsJson = stats[0][0];
    const statsEdited = Object.keys(statsJson).reduce(
      (p, c) => ({ ...p, [c]: statsJson[c] === null ? 0 : statsJson[c] }),
      {}
    );
    reply.send(statsEdited);
  });

  fastify.decorate('getTemplateStats', async (request, reply) => {
    // eslint-disable-next-line prefer-const
    let { year, host, template } = request.query;
    if (!year) year = new Date().getFullYear();
    let hostFilter = '';
    if (host) hostFilter = ` and host like '%${host}%'`;
    const stats = await fastify.orm.query(
      `select numOfAims from epadstatistics_template where updatetime like '%${year}%' and templateCode='${template}' ${hostFilter} order by id desc limit 1`
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
        readableStream.on('data', (chunk) => {
          buffer.push(chunk);
        });
        readableStream.on('error', (readErr) => {
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
              function: notification.function.slice(0, 127),
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
    (request) =>
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
          reject(
            new InternalError(`Getting notifications for user ${request.epadAuth.username}`, err)
          );
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
    'addProjectIDToAims',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const projectAims = await models.project_aim.findAll({
            include: [
              {
                model: models.project,
                attributes: ['projectid'],
              },
            ],
            attributes: ['aim_uid'],
            where: fastify.qryNotDeleted(),
          });
          const aimProjects = projectAims.map((projectAim) => ({
            aim: projectAim.dataValues.aim_uid,
            project: projectAim.dataValues.project.dataValues.projectid,
          }));
          await fastify.addProjectIdsToAimsInternal(aimProjects);
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
          await fastify.orm.transaction(async (t) => {
            // first version is just lite
            // we might need to do checks for later versions
            // TODO we do version check in checkAndMigrateVersion now, double check removing this is ok
            // await fastify.orm.query(`DELETE FROM dbversion`, { transaction: t });
            // await fastify.orm.query(`INSERT INTO dbversion(version) VALUES('lite')`, {
            //   transaction: t,
            // });

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
                ADD COLUMN IF NOT EXISTS deleted int(11) DEFAULT NULL AFTER dso_series_uid,
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
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_subject,
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_project,
                DROP FOREIGN KEY IF EXISTS FK_workliststudy_worklist,
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
            // cavit

            await fastify.orm.query(
              `ALTER TABLE registeredapps
                ADD COLUMN IF NOT EXISTS name varchar(128) AFTER id,
                ADD COLUMN IF NOT EXISTS organization varchar(128) AFTER name,
                ADD COLUMN IF NOT EXISTS email varchar(128) AFTER organization,
                ADD COLUMN IF NOT EXISTS emailvalidationcode varchar(128) AFTER email,
                ADD COLUMN IF NOT EXISTS emailvalidationsent timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ADD COLUMN IF NOT EXISTS secret varchar(128) AFTER epadtype,
                MODIFY COLUMN apikey varchar(128) null;`,
              { transaction: t }
            );
            fastify.log.warn('Altered registerapp table');
            // 15. plugin
            // new columns below added to support dockerized plugins

            await fastify.orm.query(
              `ALTER TABLE plugin
                ADD COLUMN IF NOT EXISTS image_repo varchar(128) AFTER name,
                ADD COLUMN IF NOT EXISTS image_tag varchar(32) AFTER image_repo,
                ADD COLUMN IF NOT EXISTS type varchar(5) AFTER image_tag,
                ADD COLUMN IF NOT EXISTS image_name varchar(128) AFTER type,
                ADD COLUMN IF NOT EXISTS image_id varchar(128) AFTER image_name,
                ADD COLUMN IF NOT EXISTS basecommand varchar(128) AFTER image_id,
                ADD COLUMN IF NOT EXISTS memory int(5) AFTER basecommand,
                ADD COLUMN IF NOT EXISTS maxruntime int(10) AFTER memory;`,
              { transaction: t }
            );
            fastify.log.warn('Altered plugin table');

            await fastify.orm.query(
              `ALTER TABLE plugin_parameters
                ADD COLUMN IF NOT EXISTS sendname tinyint(1) DEFAULT 0 AFTER name,
                ADD COLUMN IF NOT EXISTS uploadimages tinyint(1) DEFAULT 0 AFTER sendname,
                ADD COLUMN IF NOT EXISTS uploadaims tinyint(1) DEFAULT 0 AFTER uploadimages,
                ADD COLUMN IF NOT EXISTS sendparamtodocker tinyint(1) DEFAULT 1 AFTER uploadaims,
                ADD COLUMN IF NOT EXISTS refreshdicoms tinyint(1) DEFAULT 0 AFTER sendparamtodocker;;`,
              { transaction: t }
            );
            fastify.log.warn('Altered plugin parameters table');

            await fastify.orm.query(
              `ALTER TABLE plugin_projectparameters
                ADD COLUMN IF NOT EXISTS sendname tinyint(1) DEFAULT 0 AFTER name,
                ADD COLUMN IF NOT EXISTS uploadimages tinyint(1) DEFAULT 0 AFTER sendname,
                ADD COLUMN IF NOT EXISTS uploadaims tinyint(1) DEFAULT 0 AFTER uploadimages,
                ADD COLUMN IF NOT EXISTS sendparamtodocker tinyint(1) DEFAULT 1 AFTER uploadaims;`,
              { transaction: t }
            );
            fastify.log.warn('Altered plugin project_parameters table');

            await fastify.orm.query(
              `ALTER TABLE plugin_queue
              MODIFY COLUMN status varchar(10) ;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE lexicon 
                ADD COLUMN IF NOT EXISTS referenceuid varchar(100) NULL AFTER SCHEMA_VERSION,
                ADD COLUMN IF NOT EXISTS referencename varchar(100) NULL AFTER referenceuid,
                ADD COLUMN IF NOT EXISTS referencetype char(1) NULL AFTER referencename,
                ADD COLUMN IF NOT EXISTS indexno int(11) DEFAULT 0 AFTER referencetype;`,
              { transaction: t }
            );
            fastify.log.warn('Altered lexicon table');
            // cavit
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
                DROP FOREIGN KEY IF EXISTS FK_project_user_user`,
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
                DROP FOREIGN KEY IF EXISTS FK_series_study;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE nondicom_series 
                ADD FOREIGN KEY IF NOT EXISTS FK_series_study (study_id) REFERENCES study (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );

            // alter study to remove the createdtime change on every update
            await fastify.orm.query(
              `ALTER TABLE study 
                MODIFY COLUMN createdtime timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
              { transaction: t }
            );

            // alter subject to remove the createdtime change on every update
            await fastify.orm.query(
              `ALTER TABLE subject 
                MODIFY COLUMN createdtime timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
              { transaction: t }
            );

            // alter study to add additional view
            await fastify.orm.query(
              `ALTER TABLE study 
                ADD COLUMN IF NOT EXISTS referring_physician varchar(128) DEFAULT NULL AFTER description,
                ADD COLUMN IF NOT EXISTS accession_number varchar(64) DEFAULT NULL AFTER referring_physician,
                ADD COLUMN IF NOT EXISTS num_of_images int(10) DEFAULT NULL AFTER accession_number,
                ADD COLUMN IF NOT EXISTS num_of_series int(10) DEFAULT NULL AFTER num_of_images,
                ADD COLUMN IF NOT EXISTS study_id varchar(32) DEFAULT NULL AFTER num_of_series,
                ADD COLUMN IF NOT EXISTS study_time varchar(32) DEFAULT NULL AFTER study_id;`,
              { transaction: t }
            );

            await fastify.orm.query(
              `ALTER TABLE upload_processing 
                MODIFY COLUMN path varchar(1024) NOT NULL;`,
              { transaction: t }
            );

            // update worklist status
            await fastify.orm.query(
              `ALTER TABLE project_subject_study_series_user_status 
                DROP FOREIGN KEY IF EXISTS FK_psssustatus_worklist,
                DROP FOREIGN KEY IF EXISTS FK_psssustatus_project,
                DROP KEY IF EXISTS FK_psssustatus_project,
                DROP FOREIGN KEY IF EXISTS FK_psssustatus_study,
                DROP KEY IF EXISTS FK_psssustatus_study,
                DROP FOREIGN KEY IF EXISTS FK_psssustatus_subject,
                DROP KEY IF EXISTS FK_psssustatus_subject,
                DROP FOREIGN KEY IF EXISTS FK_psssustatus_user,
                DROP KEY IF EXISTS FK_psssustatus_user,
                DROP CONSTRAINT IF EXISTS psssustatus_user;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE project_subject_study_series_user_status 
                ADD COLUMN IF NOT EXISTS worklist_id int(10) unsigned DEFAULT NULL AFTER id, 
                ADD FOREIGN KEY IF NOT EXISTS FK_psssustatus_worklist (worklist_id) REFERENCES worklist (id) ON DELETE CASCADE ON UPDATE CASCADE, 
                ADD FOREIGN KEY IF NOT EXISTS FK_psssustatus_project (project_id) REFERENCES project (id) ON DELETE CASCADE ON UPDATE CASCADE, 
                ADD FOREIGN KEY IF NOT EXISTS FK_psssustatus_study (study_id) REFERENCES study (id) ON DELETE CASCADE ON UPDATE CASCADE, 
                ADD FOREIGN KEY IF NOT EXISTS FK_psssustatus_subject (subject_id) REFERENCES subject (id) ON DELETE CASCADE ON UPDATE CASCADE, 
                ADD FOREIGN KEY IF NOT EXISTS FK_psssustatus_user (user_id) REFERENCES user (id) ON DELETE CASCADE ON UPDATE CASCADE, 
                ADD CONSTRAINT psssustatus_user UNIQUE (worklist_id, project_id, subject_id, study_id, series_uid, user_id);`,
              { transaction: t }
            );
            fastify.log.warn(
              'worklist_id column is added to project_subject_study_series_user_status'
            );
            await fastify.orm.query(
              `ALTER TABLE project_subject_report 
                MODIFY COLUMN type varchar(256) NOT NULL,
                ADD COLUMN IF NOT EXISTS response_cat_baseline varchar(4) DEFAULT NULL AFTER best_response_min,
                ADD COLUMN IF NOT EXISTS response_cat_min varchar(4) DEFAULT NULL AFTER response_cat_baseline;`,
              { transaction: t }
            );
            fastify.log.warn('response_cat is added to project_subject_report');

            // db version audit
            await fastify.orm.query(
              `ALTER TABLE dbversion 
                ADD COLUMN IF NOT EXISTS id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
                ADD COLUMN IF NOT EXISTS date timestamp NOT NULL AFTER version,
                ADD COLUMN IF NOT EXISTS branch varchar(40) DEFAULT NULL AFTER date;`,
              { transaction: t }
            );
            fastify.log.warn('date added to dbversion ');

            // add entries to project_aim_user if not there
            await fastify.orm.query(
              `INSERT IGNORE INTO project_aim_user(project_aim_id, user_id, creator)
            SELECT project_aim.id, user.id, 'admin' from project_aim, user where project_aim.user=user.username;`,
              { transaction: t }
            );
            fastify.log.warn('project_aim_user table is filled ');

            await fastify.orm.query(
              `DELETE FROM project_plugin 
                WHERE plugin_id NOT IN (SELECT ID FROM plugin);`,
              { transaction: t }
            );

            await fastify.orm.query(
              `DELETE FROM project_plugin 
                WHERE project_id NOT IN (SELECT ID FROM project);`,
              { transaction: t }
            );

            await fastify.orm.query(
              `ALTER TABLE project_plugin 
                DROP FOREIGN KEY IF EXISTS project_plugin_ibfk_1,
                DROP FOREIGN KEY IF EXISTS project_plugin_ibfk_2;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE project_plugin 
                ADD FOREIGN KEY IF NOT EXISTS project_plugin_ibfk_1 (project_id) REFERENCES project (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS project_plugin_ibfk_2 (plugin_id) REFERENCES plugin (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );

            await fastify.orm.query(
              `ALTER TABLE plugin_queue 
                DROP FOREIGN KEY IF EXISTS plugin_queue_ibfk_1,
                DROP FOREIGN KEY IF EXISTS plugin_queue_ibfk_2;`,
              { transaction: t }
            );
            await fastify.orm.query(
              `ALTER TABLE plugin_queue 
                ADD FOREIGN KEY IF NOT EXISTS plugin_queue_ibfk_1 (plugin_id) REFERENCES plugin (id) ON DELETE CASCADE ON UPDATE CASCADE,
                ADD FOREIGN KEY IF NOT EXISTS plugin_queue_ibfk_2 (project_id) REFERENCES project (id) ON DELETE CASCADE ON UPDATE CASCADE;`,
              { transaction: t }
            );
            fastify.log.warn('plugin relation foreign keys fixed');
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
    (epadAuth) =>
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
            const aimsRes = await fastify.getAimsInternal(
              'json',
              {},
              undefined,
              epadAuth,
              undefined,
              undefined,
              true
            );
            const aims = aimsRes.rows;
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
                  {},
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
    'addProcessing',
    async (params, query, folderPath, filesOnly, attemptNumber, zipSource, epadAuth) => {
      try {
        await fastify.upsert(
          models.upload_processing,
          {
            params: JSON.stringify(params),
            query: JSON.stringify(query),
            path: folderPath,
            files_only: filesOnly,
            attempt_number: attemptNumber,
            zip_source: zipSource,
            updatetime: Date.now(),
          },
          {
            params: JSON.stringify(params),
            query: JSON.stringify(query),
            path: folderPath,
          },
          epadAuth.username
        );
        fastify.log.info(`Added processing for ${folderPath}`);
      } catch (err) {
        throw new InternalError('addProcessing', err);
      }
    }
  );

  fastify.decorate(
    'updateProcessing',
    async (params, query, folderPath, filesOnly, attemptNumber, epadAuth) => {
      try {
        let updates = { updatetime: Date.now(), updated_by: epadAuth.username };
        if (filesOnly !== undefined) updates = { ...updates, files_only: filesOnly };
        if (attemptNumber !== undefined) updates = { ...updates, attempt_number: attemptNumber };
        await models.upload_processing.update(updates, {
          where: {
            params: JSON.stringify(params),
            query: JSON.stringify(query),
            path: folderPath,
          },
        });
        fastify.log.info(`Updated processing for ${folderPath}`);
      } catch (err) {
        throw new InternalError('updateProcessing', err);
      }
    }
  );

  fastify.decorate('removeProcessing', async (params, query, folderPath) => {
    try {
      await models.upload_processing.destroy({
        where: {
          params: JSON.stringify(params),
          query: JSON.stringify(query),
          path: folderPath,
        },
      });
      fastify.log.info(`Removed processing for ${folderPath}`);
    } catch (err) {
      throw new InternalError('removeProcessing', err);
    }
  });

  fastify.decorate(
    'resumeProcessing',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          // get the folder of the zip last, to make sure the folder containing the zip finished processing
          const remaining = await models.upload_processing.findAll({
            order: [['zip_source', 'ASC']],
            raw: true,
          });
          const resumeTimestamp = new Date().getTime();
          if (remaining && remaining.length && remaining.length > 0) {
            fastify.log.info(`Resuming unfinished Processing at ${resumeTimestamp}`);

            const tmpFolders = [];
            const deletedTmpFolders = [];
            const zipFiles = [];
            // populate zip files to ignore
            const reqs = [];
            const users = [];
            for (let i = 0; i < remaining.length; i += 1) {
              if (remaining[i].zip_source !== '') zipFiles.push(remaining[i].zip_source);
              if (!users.includes(remaining[i].creator)) {
                const fakeReq = {
                  epadAuth: { username: remaining[i].creator },
                  params: JSON.parse(remaining[i].params),
                };
                reqs.push(fakeReq);
                users.push(remaining[i].creator);
                new EpadNotification(
                  fakeReq,
                  'Resuming unfinished upload/scan folder processing',
                  `Project ${fakeReq.params.project}`,
                  false
                ).notify(fastify);
              }
            }
            for (let i = 0; i < remaining.length; i += 1) {
              // TODO sending just username, it has no project role, can it fail?
              const epadAuth = { username: remaining[i].creator };
              const tmpFolder = remaining[i].path.split('/')[2];
              if (
                !deletedTmpFolders.includes(tmpFolder) &&
                fs.existsSync(path.join('/tmp', tmpFolder))
              ) {
                if (!tmpFolders.includes(tmpFolder)) tmpFolders.push(tmpFolder);
                // eslint-disable-next-line no-await-in-loop
                await fastify.updateProcessing(
                  JSON.parse(remaining[i].params),
                  JSON.parse(remaining[i].query),
                  remaining[i].path,
                  remaining[i].files_only,
                  remaining[i].attempt_number + 1,
                  epadAuth
                );

                // eslint-disable-next-line no-await-in-loop
                await fastify.processFolder(
                  remaining[i].path,
                  JSON.parse(remaining[i].params),
                  JSON.parse(remaining[i].query),
                  epadAuth,
                  remaining[i].files_only,
                  zipFiles
                );
              } else {
                fastify.log.warn(
                  `Cannot resume processing ${remaining[i].path} as ${tmpFolder} is deleted`
                );
                deletedTmpFolders.push(tmpFolder);
                // eslint-disable-next-line no-await-in-loop
                await fastify.removeProcessing(
                  JSON.parse(remaining[i].params),
                  JSON.parse(remaining[i].query),
                  remaining[i].path
                );
              }
            }
            for (let i = 0; i < tmpFolders.length; i += 1)
              fs.remove(path.join('/tmp', tmpFolders[i]), (error) => {
                if (error) fastify.log.warn(`Remove processing deletion error ${error.message}`);
                fastify.log.info(`${tmpFolders[i]} deleted`);
              });
            await fastify.pollDWStudies();
            for (let i = 0; i < reqs.length; i += 1) {
              new EpadNotification(
                reqs[i],
                'Finished upload/scan folder processing',
                `Project ${reqs[i].params.project}`,
                true
              ).notify(fastify);
            }
            fastify.log.info(
              `Finished resuming Processing at ${new Date().getTime()} started at ${resumeTimestamp}`
            );
          }
          resolve();
        } catch (err) {
          reject(new InternalError('resumeProcessing', err));
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
          if (config.env !== 'test') {
            await fastify.checkAndMigrateVersion();
            // schedule calculating statistics at 1 am at night
            schedule.scheduleJob('stats', '0 1 * * *', 'America/Los_Angeles', () => {
              const random = Math.random() * 1800 + 1;
              setTimeout(() => {
                fastify.log.info(`Calculating and sending statistics at ${new Date()}`);
                try {
                  fastify.calcStats();
                } catch (err) {
                  fastify.log.error(`Could not send stats. Error: ${err.message}`);
                }
              }, random * 1000);
            });
            if (config.pollDW) {
              setInterval(async () => {
                await fastify.pollDWStudies();
              }, config.pollDW * 60000);
            }
            if (!config.noResume) fastify.resumeProcessing();
          }
          resolve();
        } catch (err) {
          reject(new InternalError('afterDBReady', err));
        }
      })
  );

  fastify.decorate(
    'setSignificanceInternal',
    (project, subject, study, series, significanceOrder, username) =>
      new Promise((resolve, reject) => {
        if (significanceOrder === 0) {
          // delete the tuple
          models.project_subject_study_series_significance
            .destroy({
              where: {
                study_id: study,
                subject_id: subject,
                project_id: project,
                series_uid: series,
              },
            })
            .then(() => resolve('Significance deleted successfully'))
            .catch((err) => reject(new InternalError('Deleting significance', err)));
        } else {
          fastify
            .upsert(
              models.project_subject_study_series_significance,
              {
                study_id: study,
                subject_id: subject,
                project_id: project,
                series_uid: series,
                significance_order: significanceOrder,
                updatetime: Date.now(),
              },
              {
                study_id: study,
                subject_id: subject,
                project_id: project,
                series_uid: series,
              },
              username
            )
            .then(() => resolve('Significance updated successfully'))
            .catch((err) => reject(new InternalError('Updating significance', err)));
        }
      })
  );

  fastify.decorate('setSignificantSeries', (request, reply) => {
    // set significance of series
    // body should be an array of objects which has seriesUID and significanceOrder atributes
    // ex. [{seriesUID: '1.2.3.45643634567.5656.787', significanceOrder:1}, {seriesUID: '1.2.3.45643634567.3555.787', significanceOrder:2}]
    if (!Array.isArray(request.body))
      reply.send(
        new BadRequestError(
          'Assigning significance to the series',
          new Error('Request body should be an array')
        )
      );
    else {
      const validData = request.body.filter(
        (series) => series.seriesUID && series.significanceOrder !== undefined
      );
      if (validData.length !== request.body.length) {
        reply.send(
          new BadRequestError(
            'Assigning significance to the series',
            new Error('Each item should have seriesUID and significanceOrder')
          )
        );
        return;
      }
    }

    const promises = [];
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

    Promise.all(promises).then((result) => {
      const ids = [];
      let missingData = false;
      // result[i] can be null when subject is not created before, just tests
      for (let i = 0; i < result.length; i += 1)
        // eslint-disable-next-line no-unused-expressions
        result[i] ? ids.push(result[i].dataValues.id) : (missingData = true);
      if (missingData || ids.length !== result.length) {
        reply.send(
          new InternalError('Assigning significance to the series', new Error('Missing data'))
        );
      } else if (request.body !== undefined) {
        // set significance of series
        // body should be an array of objects which has seriesUID and significanceOrder atributes
        // ex. [{seriesUID: '1.2.3.45643634567.5656.787', significanceOrder:1}, {seriesUID: '1.2.3.45643634567.3555.787', significanceOrder:2}]
        if (!Array.isArray(request.body))
          reply.send(
            new BadRequestError(
              'Assigning significance to the series',
              new Error('Request body should be an array')
            )
          );
        const seriesPromises = [];
        const errors = [];
        request.body.forEach((series) => {
          seriesPromises.push(
            fastify
              .setSignificanceInternal(
                ids[0],
                ids[1],
                ids[2],
                series.seriesUID,
                series.significanceOrder,
                request.epadAuth.username
              )
              .catch((err) => {
                fastify.log.warn(
                  `Could not set series significance for series ${series.seriesUID}. Error: ${err.message}`
                );
                errors.push(series.seriesUID);
              })
          );
        });

        Promise.all(seriesPromises).then(() => {
          if (errors.length === 0) {
            reply.code(200).send('Significance orders set successfully');
          } else
            reply.code(200).send(`Significance orders couldn't be updated for ${' '.join(errors)}`);
        });
      }
    });
  });

  fastify.decorate('getSignificantSeries', (request, reply) => {
    fastify
      .getSignificantSeriesInternal(
        request.params.project,
        request.params.subject,
        request.params.study,
        true
      )
      .then((res) => reply.code(200).send(res))
      .catch((err) => {
        reply.send(err);
      });
  });

  fastify.decorate(
    'getSignificantSeriesInternal',
    (project, subject, study, array = false) =>
      new Promise(async (resolve, reject) => {
        try {
          // ignore project id if we have it missing so that polling calls and such works
          const projectID = project
            ? (
                await models.project.findOne({
                  where: { projectid: project },
                  attributes: ['id'],
                })
              ).dataValues.id
            : undefined;

          // we do not really need subject id, study uid is supposed to be unique
          // ignore if we have it missing so that projects/:p/series calls and such works
          const subjectID = subject
            ? (
                await models.subject.findOne({
                  where: { subjectuid: subject },
                  attributes: ['id'],
                })
              ).dataValues.id
            : undefined;

          const studyRec = study
            ? await models.study.findOne({
                where: { studyuid: study },
                attributes: ['id'],
              })
            : undefined;
          const studyID = studyRec ? studyRec.dataValues.id : undefined;
          if (!studyID) {
            reject(new ResourceNotFoundError('Study', study));
          } else {
            const qry = { study_id: studyID };
            if (subjectID) qry.subject_id = subjectID;
            if (projectID) qry.project_id = projectID;
            const significantSeries = await models.project_subject_study_series_significance.findAll(
              {
                where: qry,
                raw: true,
                attributes: [
                  'project_id',
                  'subject_id',
                  'study_id',
                  'series_uid',
                  'significance_order',
                ],
                order: [['significance_order', 'ASC']],
              }
            );
            if (array) {
              const significantSeriesArray = [];
              for (let i = 0; i < significantSeries.length; i += 1) {
                significantSeriesArray.push({
                  seriesUID: significantSeries[i].series_uid,
                  significanceOrder: significantSeries[i].significance_order,
                });
              }
              resolve(significantSeriesArray);
            } else {
              const significantSeriesMap = {};
              for (let i = 0; i < significantSeries.length; i += 1) {
                significantSeriesMap[significantSeries[i].series_uid] =
                  significantSeries[i].significance_order;
              }
              resolve(significantSeriesMap);
            }
          }
        } catch (err) {
          reject(new InternalError('Getting significant series', err));
        }
      })
  );

  fastify.decorate('copySignificantSeries', async (studyUID, toProjectUID, fromProjectUID) => {
    try {
      // if I'm copying to lite, and from is empty, don't do anything
      if (toProjectUID === 'lite' && !fromProjectUID) {
        fastify.log.warn(
          `From project is not given and to project is lite. Don't know where to copy from. Not doing anything to avoid duplication`
        );
        return;
      }
      const studyID = (
        await models.study.findOne({
          where: { studyuid: studyUID },
          attributes: ['id'],
        })
      ).dataValues.id;

      const toProjectID = (
        await models.project.findOne({
          where: { projectid: toProjectUID },
          attributes: ['id'],
        })
      ).dataValues.id;

      // copy from project lite (main teaching project) by default
      const fromProjectID = (
        await models.project.findOne({
          where: { projectid: fromProjectUID || 'lite' },
          attributes: ['id'],
        })
      ).dataValues.id;

      const qry = { study_id: studyID, project_id: fromProjectID };
      const significantSeries = await models.project_subject_study_series_significance.findAll({
        where: qry,
        raw: true,
      });
      significantSeries.map((item) => {
        // eslint-disable-next-line no-param-reassign
        item.project_id = toProjectID;
        // eslint-disable-next-line no-param-reassign
        delete item.id;
        return item;
      });

      // delete the existing significant series in the toProject to avoid duplication
      await models.project_subject_study_series_significance.destroy({
        where: { project_id: toProjectID },
      });
      await models.project_subject_study_series_significance.bulkCreate(significantSeries);
    } catch (err) {
      throw new InternalError('Copying significant series', err);
    }
  });

  fastify.decorate('version0_4_0', () => fastify.addProjectIDToAims());

  fastify.decorate(
    'checkAndMigrateVersion',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const { version } = await fastify.getVersionInternal();
          if (appVersion === '0.4.0' && version !== 'v0.4.0') await fastify.version0_4_0();
          await fastify.updateVersionInternal(version);
          resolve();
        } catch (err) {
          reject(new InternalError('Check and Migrate DB version', err));
        }
      })
  );
  fastify.decorate(
    'getVersionInternal',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const dbVersionTuple = await models.dbversion.findOne({
            raw: true,
            order: [['date', 'DESC']],
            limit: 1,
          });
          if (dbVersionTuple) resolve(dbVersionTuple);
          resolve({});
        } catch (err) {
          reject(new InternalError('Get db version', err));
        }
      })
  );
  fastify.decorate(
    'updateVersionInternal',
    (dbVersion, branch) =>
      new Promise(async (resolve, reject) => {
        try {
          if (!config.versionAudit && dbVersion)
            await models.dbversion.update(
              { version: `v${appVersion}`, ...(branch ? { branch } : {}), date: Date.now() },
              {
                where: {
                  version: dbVersion,
                },
              }
            );
          else {
            await models.dbversion.create({
              version: `v${appVersion}`,
              ...(branch ? { branch } : {}),
              date: Date.now(),
            });
          }

          resolve();
        } catch (err) {
          reject(new InternalError('Update db version', err));
        }
      })
  );
  fastify.decorate('updateVersion', async (request, reply) => {
    if (request.hostname.startsWith('localhost')) {
      try {
        if (request.body.version !== appVersion)
          reply.send(
            new InternalError(
              'Update version',
              new Error(
                `The version sent ${request.body.version} does not match app version in package.json ${appVersion}`
              )
            )
          );
        else {
          const { version } = await fastify.getVersionInternal();
          await fastify.updateVersionInternal(version, request.body.branch);
          reply.code(200).send('DB Version updated');
        }
      } catch (err) {
        reply.send(new InternalError('Update version', err));
      }
    } else reply.send(new InternalError('Update version', new Error('Only allowed in localhost')));
  });

  fastify.decorate('getVersion', async (request, reply) => {
    try {
      const dbVersion = await fastify.getVersionInternal();
      reply.code(200).send(dbVersion);
    } catch (err) {
      reply.send(new InternalError('Get version', err));
    }
  });
  // need to add hook for close to remove the db if test;
  fastify.decorate(
    'closeDB',
    (instance) =>
      new Promise(async (resolve, reject) => {
        try {
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
          resolve();
        } catch (err) {
          reject(new InternalError('close', err));
        }
      })
  );

  fastify.after(async () => {
    try {
      await fastify.initMariaDB();
      done();
    } catch (err) {
      fastify.log.error(`Cannot connect to mariadb (err:${err.message}), shutting down the server`);
      fastify.close();
    }
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(epaddb);
