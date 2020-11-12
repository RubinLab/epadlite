const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');
const _ = require('lodash');
const Axios = require('axios');
const os = require('os');
const schedule = require('node-schedule-tz');
const archiver = require('archiver');
const toArrayBuffer = require('to-array-buffer');
const unzip = require('unzip-stream');
// eslint-disable-next-line no-global-assign
window = {};
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
          models.project_plugin.belongsTo(models.project, {
            as: 'projectpluginrowbyrow',
            foreignKey: 'project_id',
          });
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
            // if there is default template add that template to project
            await fastify.tryAddDefaultTemplateToProject(
              defaultTemplate,
              project,
              request.epadAuth
            );

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

  fastify.decorate(
    'tryAddDefaultTemplateToProject',
    (defaultTemplate, project, epadAuth) =>
      new Promise(async resolve => {
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
        .catch(err => {
          reply.send(new InternalError('Updating project', err));
        });
    }
  });

  fastify.decorate(
    'deleteRelationAndOrphanedCouchDocInternal',
    (dbProjectId, relationTable, uidField, projectId) =>
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

  fastify.decorate('getProjects', async (request, reply) => {
    try {
      const projects = await models.project.findAll({
        where: config.mode === 'lite' ? { projectid: 'lite' } : {},
        order: [['name', 'ASC']],
        include: ['users', { model: models.project_subject, required: false }],
      });

      // projects will be an array of all Project instances
      const result = [];
      for (let i = 0; i < projects.length; i += 1) {
        const project = projects[i];
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
          // subjectIDs:
          description: project.dataValues.description,
          loginNames: [],
          type: project.dataValues.type,
          defaultTemplate: project.dataValues.defaulttemplate,
        };

        project.dataValues.users.forEach(user => {
          obj.loginNames.push(user.username);
        });
        if (
          request.epadAuth.admin ||
          obj.loginNames.includes(request.epadAuth.username) ||
          obj.type.toLowerCase() === 'public'
        )
          result.push(obj);
      }
      reply.code(200).send(result);
    } catch (err) {
      reply.send(
        new InternalError(
          `Getting and filtering project list for user ${request.epadAuth.username}, isAdmin ${
            request.epadAuth.admin
          }`,
          err
        )
      );
    }
  });

  //  Plugin section

  fastify.decorate('getProjectsWithPkAsId', (request, reply) => {
    models.project
      .findAll({
        include: ['users'],
      })
      .then(projects => {
        const result = [];
        projects.forEach(project => {
          const obj = {
            id: project.id,
            name: project.name,
            projectid: project.projectid,
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
        reply
          .code(500)
          .send(
            new InternalError(
              `Getting and filtering project list for user ${request.epadAuth.username}, isAdmin ${
                request.epadAuth.admin
              }`,
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

  fastify.decorate('getPluginsForProject', async (request, reply) => {
    const paramProjectId = request.params.projectid;
    models.project
      .findOne({
        include: ['projectplugin'],
        where: { projectid: paramProjectId },
      })
      .then(plugins => {
        reply.code(200).send(plugins);
      })
      .catch(err => {
        reply.code(500).send(new InternalError('Getting plugin list for the project', err));
      });
  });
  fastify.decorate('getTemplatesDataFromDb', (request, reply) => {
    models.template
      .findAll()
      .then(templates => {
        reply.code(200).send(templates);
      })
      .catch(err => {
        reply.code(500).send(new InternalError('Getting templates from db', err));
      });
  });

  fastify.decorate('getContainerLog', async (request, reply) => {
    const { containerid } = request.params;
    fastify
      .getUserPluginDataPathInternal()
      .then(async pluginDataRootPath => {
        // eslint-disable-next-line no-param-reassign
        pluginDataRootPath = path.join(__dirname, `../pluginsDataFolder`);
        // const { creator } = request.body;
        const creator = await fastify.getObjectCreator('pluginqueue', containerid, '');
        // need to get the creator internally
        const dock = new DockerService(fs, fastify);

        dock
          .inspectContainer(`epadplugin_${containerid}`)
          .then(inspectResultObject => {
            fastify.log.info('inspect result object', inspectResultObject);
            // fastify.log.info('status : ', inspectResultObject.State.Status);
            fastify.log.info(
              `trying to read from the path : ${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
            );
            // replace back ${pluginDataRootPath} /Users/cavit/epadlite/epadlite/pluginsDataFolder
            //  if (inspectResultObject.State.Status === 'running') {
            fastify.log.info('status running so sending stream');
            reply.res.setHeader('Content-type', 'application/octet-stream');
            reply.res.setHeader('Access-Control-Allow-Origin', '*');
            reply.res.setHeader('connection', 'keep-alive');
            const rdsrtm = fs.createReadStream(
              `${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
            );
             // replace back ${pluginDataRootPath} /Users/cavit/epadlite/epadlite/pluginsDataFolder
            reply.send(rdsrtm);
            //  } else {
            //  reply.res.setHeader('Content-type', 'application/octet-stream');
            //  reply.res.setHeader('Access-Control-Allow-Origin', '*');
            //  reply.res.charset = 'UTF-8';
            fastify.log.info(
              `container not running but trying to find log file : ${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
            );
             // replace back ${pluginDataRootPath} /Users/cavit/epadlite/epadlite/pluginsDataFolder
            // if (fs.existsSync(`${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`)) {
            //   fastify.log.info('log file found ');
            //   const rdsrtm = fs.createReadStream(
            //     `${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
            //   );
            //   reply.send(rdsrtm);
            // }
            //  }
          })
          .catch(err => {
            reply.res.setHeader('Content-type', 'application/octet-stream');
            reply.res.setHeader('Access-Control-Allow-Origin', '*');
            // fastify.log.info(
            //   `trying to find log file : ${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
            // );
            reply.res.write('404');
            reply.res.end();
            fastify.log.info('err', err);
            // if (fs.existsSync(`${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`)) {
            //   fastify.log.info('log file found ');
            //   const rdsrtm = fs.createReadStream(
            //     `${pluginDataRootPath}/${creator}/${containerid}/logs/logfile.txt`
            //   );
            //   reply.send(rdsrtm);
            // } else {
            //   reply.res.write('404');
            //   reply.res.end();
            //   fastify.log.info('err', err);
            // }
          });
      })
      .catch(err => {
        reply
          .code(500)
          .send(
            new InternalError(
              `Error happened while trying ot get the log file for container: epadplugin_${containerid}`,
              err
            )
          );
        fastify.log.info('error on getting plugin fata path for log file ', err);
      });
  });

  fastify.decorate('getPluginsWithProject', (request, reply) => {
    models.plugin
      .findAll({
        include: ['pluginproject', 'plugintemplate', 'defaultparameters'],
        required: false,
      })
      .then(plugins => {
        const result = [];
        plugins.forEach(data => {
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

          data.dataValues.pluginproject.forEach(project => {
            const projectObj = {
              id: project.id,
              projectid: project.projectid,
              projectname: project.name,
            };

            pluginObj.projects.push(projectObj);
          });

          data.dataValues.plugintemplate.forEach(template => {
            const templateObj = {
              id: template.id,
              templateName: template.templateName,
            };

            pluginObj.templates.push(templateObj);
          });

          data.dataValues.defaultparameters.forEach(parameter => {
            const parameterObj = {
              id: parameter.id,
              plugin_id: parameter.plugin_id,
              name: parameter.name,
              format: parameter.format,
              prefix: parameter.prefix,
              inputbinding: parameter.inputBinding,
              default_value: parameter.default_value,
              type: parameter.type,
              description: parameter.description,
            };

            pluginObj.parameters.push(parameterObj);
          });
          //  if (request.epadAuth.admin || obj.loginNames.includes(request.epadAuth.username))
          // if (request.epadAuth.admin) {
          //   result.push(pluginObj);
          // }
          result.push(pluginObj);
        });

        reply.code(200).send(result);
      })
      .catch(err => {
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
      .then(pluginone => {
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

        pluginone.dataValues.pluginproject.forEach(project => {
          const projectObj = {
            id: project.id,
            projectid: project.projectid,
            projectname: project.name,
          };

          pluginObj.projects.push(projectObj);
        });

        pluginone.dataValues.plugintemplate.forEach(template => {
          const templateObj = {
            id: template.id,
            templateName: template.templateName,
          };

          pluginObj.templates.push(templateObj);
        });

        pluginone.dataValues.defaultparameters.forEach(parameter => {
          const parameterObj = {
            id: parameter.id,
            plugin_id: parameter.plugin_id,
            name: parameter.name,
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
      .catch(err => {
        reply.code(500).send(new InternalError(`getOnePlugin error `, err));
      });
  });

  fastify.decorate('updateProjectsForPlugin', (request, reply) => {
    const { pluginid } = request.params;
    const { projectsToRemove, projectsToAdd } = request.body;
    const dbPromisesForCreate = [];
    const formattedProjects = [];

    if (projectsToRemove && projectsToAdd) {
      models.project_plugin
        .destroy({
          where: {
            plugin_id: pluginid,
            project_id: projectsToRemove,
          },
        })
        .then(() => {
          projectsToAdd.forEach(projectid => {
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
              .then(allTProjectsForPlugin => {
                allTProjectsForPlugin.dataValues.pluginproject.forEach(project => {
                  const projectObj = {
                    id: project.id,
                    projectid: project.projectid,
                    projectname: project.name,
                  };
                  formattedProjects.push(projectObj);
                });
                reply.code(200).send(formattedProjects);
              })
              .catch(err => {
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
        .catch(err => {
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
          templatesToAdd.forEach(templateid => {
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
              .then(allTemplatesForPlugin => {
                allTemplatesForPlugin.dataValues.plugintemplate.forEach(template => {
                  const templateObj = {
                    id: template.id,
                    templateName: template.templateName,
                  };
                  formattedTemplates.push(templateObj);
                });
                reply.send(formattedTemplates);
              })
              .catch(err => {
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
        .catch(err => {
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

    //
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
      //  new UnauthorizedError('User has no access to project')
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
      //  new UnauthorizedError('User has no access to project')
      reply.send(new UnauthorizedError('User has no right to create plugin'));
    } else {
      // check if plugin_id exist
      models.plugin
        .findAll({
          where: { plugin_id: pluginform.plugin_id },
        })
        .then(result => {
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
                //  new UnauthorizedError('User has no access to project')
                reply.code(200).send('Plugin saved seccessfully');
              })
              .catch(err => {
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
        .catch(err => {
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
      .catch(err => {
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
      //  new UnauthorizedError('User has no access to project')
      reply.send(new UnauthorizedError('User has no right to add plugin default parameters'));
    } else {
      models.plugin_parameters
        .create({
          plugin_id: parameterform.plugindbid,
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
        .then(() => {
          reply.code(200).send('default parameters saved seccessfully');
        })
        .catch(err => {
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
        where: { plugin_id: plugindbid, creator: request.epadAuth.username },
      })
      .then(result => {
        result.forEach(parameter => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
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
      .catch(err => {
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
      //  new UnauthorizedError('User has no access to project')
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
        .catch(err => {
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
      //  new UnauthorizedError('User has no access to project')
      reply.send(new UnauthorizedError('User has no right to edit plugin default parameters'));
    } else {
      models.plugin_parameters
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
        .catch(err => {
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
      .then(result => {
        result.forEach(parameter => {
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
        reply.code(200).send(parameters);
      })
      .catch(err => {
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
      .then(inserteddata => {
        reply.code(200).send(inserteddata);
      })
      .catch(err => {
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
      .catch(err => {
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
      .catch(err => {
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
      .then(result => {
        result.forEach(parameter => {
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
      .catch(err => {
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
      .then(inserteddata => {
        reply.code(200).send(inserteddata);
      })
      .catch(err => {
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
      .catch(err => {
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
      .catch(err => {
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
    const dock = new DockerService(fs, fastify);
    const promisesArray = [];

    for (let cnt = 0; cnt < pluginIdToDelete.length; cnt += 1) {
      const containerName = `epadplugin_${pluginIdToDelete[cnt]}`;
      promisesArray.push(
        dock
          .checkContainerExistance(containerName)
          .then(resInspect => {
            fastify.log.info(
              'deleteFromPluginQueue inspect element result',
              resInspect.State.Status
            );
            if (resInspect.State.Status !== 'running') {
              idsToDelete.push(pluginIdToDelete[cnt]);
              fastify.log.info('deleteFromPluginQueue not running but container found');
              dock.deleteContainer(containerName).then(deleteReturn => {
                fastify.log.info('deleteFromPluginQueue delete container result :', deleteReturn);
              });
            }
          })
          .catch(err => {
            fastify.log.info('inspect element err', err.statusCode);
            if (err.statusCode === 404) {
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
        .then(tableData => {
          tableData.forEach(eachRow => {
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
          models.plugin_queue
            .destroy({
              where: {
                id: idsToDelete,
              },
            })
            .then(() => {
              reply.code(200).send(idsToDelete);
            })
            .catch(err => {
              reply
                .code(500)
                .send(
                  new InternalError(
                    'Something went wrong while deleting the process from queue',
                    err
                  )
                );
            });
        })
        .catch(err => {
          return new InternalError(
            'Something went wrong while getting all process to delete from queue',
            err
          );
        });
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
            starttime: '1970-01-01 00:00:01', //  added this
            endtime: '1970-01-01 00:00:01',
          })
        );
      }

      Promise.all(promisesCreateForEachAnnotation)
        .then(() => {
          reply
            .code(200)
            .send('plugin process added to the plugin queue for each selected annotation');
        })
        .catch(err => {
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
        .then(() => {
          reply.code(200).send('plugin process added to the plugin queue');
        })
        .catch(err => {
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

  fastify.decorate('getPluginsQueue', (request, reply) => {
    const result = [];
    models.plugin_queue
      .findAll({
        include: ['queueplugin', 'queueproject'],
        required: false,
      })
      .then(eachRowObj => {
        eachRowObj.forEach(data => {
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
      .catch(err => {
        reply.code(500).send(new InternalError(`getPluginsQueue error `, err));
      });
  });
  fastify.decorate('stopPluginsQueue', async (request, reply) => {
    const queueIds = [...request.body];
    fastify.log.info('queueIds', queueIds);
    const dock = new DockerService(fs, fastify);
    const containerLists = await dock.listContainers();
    let containerFound = false;
    reply.code(204).send();
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
        fastify.log.info('container name found  stopping : ', containerName);
        // eslint-disable-next-line no-await-in-loop
        const returnContainerStop = await dock.stopContainer(containerId);
        fastify.log.info('container stopped : ', returnContainerStop);
        // eslint-disable-next-line no-await-in-loop
        await fastify.updateStatusQueueProcessInternal(queuid, 'ended');
        new EpadNotification(
          request,
          `container: ${containerName} has ended processing`,
          'success',
          true
        ).notify(fastify);
      }
    }
    // reply.code(200).send('plugin stopped');
  });
  fastify.decorate('runPluginsQueue', async (request, reply) => {
    //  will receive a queue object which contains plugin id

    const queueIdsArrayToStart = request.body;
    const allStatus = ['added', 'ended', 'error', 'running'];
    try {
      reply.code(202).send(`runPluginsQueue called and retuened 202 inernal queue is started`);

      await models.plugin_queue
        .findAll({
          include: ['queueplugin', 'queueproject'],
          where: { id: queueIdsArrayToStart, status: allStatus },
        })
        .then(tableData => {
          tableData.forEach(data => {
            const result = [];
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

            const dock = new DockerService(fs, fastify);
            const containerName = `epadplugin_${pluginObj.id}`;
            dock
              .checkContainerExistance(containerName)
              .then(resInspect => {
                fastify.log.info('inspect element result', resInspect.State.Status);
                if (resInspect.State.Status !== 'running') {
                  fastify.log.info('container is not running : ', containerName);
                  dock.deleteContainer(containerName).then(deleteReturn => {
                    fastify.log.info('delete container result :', deleteReturn);
                    result.push(pluginObj);
                    fastify.runPluginsQueueInternal(result, request);
                  });
                }
              })
              .catch(err => {
                fastify.log.info('inspect element err', err.statusCode);
                if (err.statusCode === 404) {
                  result.push(pluginObj);
                  fastify.runPluginsQueueInternal(result, request);
                }
              });
          });
        });
    } catch (err) {
      // reply.send(new InternalError(' plugin queue error while starting', err));
      fastify.log.error(`runPluginsQueue error : ${err}`);
    }
  });
  //  internal functions
  fastify.decorate('getPluginProjectParametersInternal', (pluginid, projectid) => {
    const parameters = [];
    return models.plugin_projectparameters
      .findAll({
        where: { plugin_id: pluginid, project_id: projectid },
      })
      .then(result => {
        result.forEach(parameter => {
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
      .catch(err => {
        return new InternalError('error while getPluginProjectParametersInternal', err);
      });
  });
  fastify.decorate('getPluginDeafultParametersInternal', pluginid => {
    const parameters = [];
    return models.plugin_parameters
      .findAll({
        where: { plugin_id: pluginid },
      })
      .then(result => {
        result.forEach(parameter => {
          const parameterObj = {
            id: parameter.dataValues.id,
            plugin_id: parameter.dataValues.plugin_id,
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
      .catch(err => {
        return new InternalError('error while getPluginDeafultParametersInternal', err);
      });
  });
  fastify.decorate(
    'createPluginfoldersInternal',
    (pluginparams, userfolder, aims, projectid, projectdbid, processmultipleaims, request) => {
      return new Promise(async (resolve, reject) => {
        //  let aimsParamsProcessed = false;
        //  let dicomsParamsProcessed = false;
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

        fastify.log.info(
          '__________plugin params main  ***************_____________',
          tempPluginparams
        );
        for (let i = 0; i < tempPluginparams.length; i += 1) {
          fastify.log.info(
            '__________checking plugin params ***************_____________',
            tempPluginparams[i].format
          );
          // output folder
          if (tempPluginparams[i].format === 'OutputFolder') {
            try {
              fastify.log.info(
                '__________output folder found ***************_____________',
                tempPluginparams[i].format
              );
              const outputfolder = `${userfolder}${tempPluginparams[i].paramid}/`;
              fastify.log.info(outputfolder);
              if (!fs.existsSync(outputfolder)) {
                fs.mkdirSync(outputfolder, { recursive: true });
              }
            } catch (err) {
              fastify.log.info('__________output folder error ***************_____________', err);
              reject(err);
            }
          }
          // outputfolder end
          if (tempPluginparams[i].format === 'InputFolder') {
            fastify.log.info(
              '__________input folder found ***************_____________',
              tempPluginparams[i].format
            );
            fastify.log.info(
              '__________ tempPluginparams[i].paramid ***************_____________',
              tempPluginparams[i].paramid
            );
            fastify.log.info(
              '__________Object.keys(aims).length  ***************_____________',
              Object.keys(aims).length
            );
            fastify.log.info(
              '__________ typeof processmultipleaims***************_____________',
              typeof processmultipleaims
            );
            fastify.log.info(
              '__________ typeof processmultipleaims value ***************_____________',
              processmultipleaims
            );
            // get selected aims
            if (
              tempPluginparams[i].paramid === 'aims' &&
              Object.keys(aims).length > 0 &&
              typeof processmultipleaims !== 'object'
            ) {
              try {
                fastify.log.info(
                  '__________param id aim innnnnnnn nnnnnn nnnnn***************_____________',
                  tempPluginparams[i].format
                );
                // eslint-disable-next-line no-await-in-loop
                const source = await fastify.getAimsInternal(
                  'stream',
                  {},
                  { aims: Object.keys(aims) },
                  request.epadAuth
                );
                fastify.log.info(
                  '__________param id aim did wait aim download ? nnnnn***************_____________',
                  tempPluginparams[i].format
                );
                const inputfolder = `${userfolder}${tempPluginparams[i].paramid}/`;
                console.log('will write aims : ', inputfolder);
                if (!fs.existsSync(inputfolder)) {
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

                    fs.createReadStream(`${inputfolder}annotations.zip`)
                      .pipe(unzip.Extract({ path: `${inputfolder}` }))
                      .on('close', () => {
                        fastify.log.info(`${inputfolder}annotations.zip extracted`);
                        fs.remove(`${inputfolder}annotations.zip`, error => {
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
                      .on('error', error => {
                        reject(
                          new InternalError(`Extracting zip ${inputfolder}annotations.zip`, error)
                        );
                      });
                  })
                  // eslint-disable-next-line no-loop-func
                  .on('error', error => {
                    reject(new InternalError(`Copying zip ${inputfolder}annotations.zip`, error));
                  });
              } catch (err) {
                reject(err);
              }
            }
            // get dicoms
            if (tempPluginparams[i].paramid === 'dicoms') {
              const inputfolder = `${userfolder}${pluginparams[i].paramid}/`;
              fastify.log.info('creating dicoms in this folder', inputfolder);
              try {
                fastify.log.info(
                  '__________param id dicoms   nnnnn***************_____________',
                  tempPluginparams[i].paramid
                );
                if (!fs.existsSync(inputfolder)) {
                  fs.mkdirSync(inputfolder, { recursive: true });
                }
                // eslint-disable-next-line no-case-declarations

                if (typeof processmultipleaims !== 'object' && Object.keys(aims).length > 0) {
                  fastify.log.info(
                    '__________param id dicoms processmultipleaims not an object and  Object.keys(aims).length > 0 ***************_____________',
                    tempPluginparams[i].paramid
                  );
                  // aim level dicoms
                  const aimsKeysLength = Object.keys(aims).length;
                  const aimsKeys = Object.keys(aims);
                  for (let aimsCnt = 0; aimsCnt < aimsKeysLength; aimsCnt += 1) {
                    const aimNamedExtractFolder = `${inputfolder}${aimsKeys[aimsCnt]}`;
                    console.log('xxxx xxxx xxx x x x x x x x  ', aimNamedExtractFolder);
                    const writeStream = fs
                      .createWriteStream(`${inputfolder}/dicoms${aimsCnt}.zip`)
                      // eslint-disable-next-line func-names
                      .on('finish', function() {
                        fastify.log.info('dicom copy finished');
                        // unzip part
                        // added aims[aimsKeys[aimsCnt]] for the folder name we will use aim uid
                        fs.createReadStream(`${inputfolder}/dicoms${aimsCnt}.zip`)
                          .pipe(
                            unzip.Extract({
                              path: aimNamedExtractFolder,
                            })
                          )
                          .on('close', () => {
                            fastify.log.info(`${inputfolder}/dicoms${aimsCnt}.zip extracted`);
                            fs.remove(`${inputfolder}/dicoms${aimsCnt}.zip`, error => {
                              if (error) {
                                fastify.log.info(
                                  `${inputfolder}/dicoms${aimsCnt}.zip file deletion error ${
                                    error.message
                                  }`
                                );
                                reject(error);
                              } else {
                                fastify.log.info(`${inputfolder}/dicoms${aimsCnt}.zip deleted`);
                              }
                            });
                          })
                          .on('error', error => {
                            reject(
                              new InternalError(
                                `Extracting zip ${inputfolder}/dicoms${aimsCnt}.zip`,
                                error
                              )
                            );
                          });
                        // un zip part over
                      });
                    const eacAimhObj = aims[aimsKeys[aimsCnt]];
                    fastify.log.info('getting dicoms for aim ', eacAimhObj);
                    // eslint-disable-next-line no-await-in-loop
                    await fastify.prepDownload(
                      request.headers.origin,
                      {
                        project: projectid,
                        subject: eacAimhObj.subjectID,
                        study: eacAimhObj.studyUID,
                        series: eacAimhObj.seriesUID,
                      },
                      { format: 'stream', includeAims: 'false' },
                      request.epadAuth,
                      writeStream
                    );
                  }
                } else {
                  // project level dicoms
                  fastify.log.info('getting projects dicoms.........');
                  const writeStream = fs
                    .createWriteStream(`${inputfolder}/dicoms.zip`)
                    // eslint-disable-next-line func-names
                    .on('finish', function() {
                      fastify.log.info('dicom copy finished');
                      // unzip part
                      fs.createReadStream(`${inputfolder}/dicoms.zip`)
                        .pipe(unzip.Extract({ path: `${inputfolder}` }))
                        .on('close', () => {
                          fastify.log.info(`${inputfolder}/dicoms.zip extracted`);
                          fs.remove(`${inputfolder}/dicoms.zip`, error => {
                            if (error) {
                              fastify.log.info(
                                `${inputfolder}/dicoms.zip file deletion error ${error.message}`
                              );
                              reject(error);
                            } else {
                              fastify.log.info(`${inputfolder}/dicoms.zip deleted`);
                            }
                          });
                        })
                        .on('error', error => {
                          reject(
                            new InternalError(`Extracting zip ${inputfolder}dicoms.zip`, error)
                          );
                        });
                      // un zip part over
                    });
                  // eslint-disable-next-line no-await-in-loop
                  await fastify.prepDownload(
                    request.headers.origin,
                    { project: projectid },
                    { format: 'stream', includeAims: 'true' },
                    request.epadAuth,
                    writeStream,
                    {
                      project_id: projectdbid,
                    }
                  );
                }
              } catch (err) {
                reject(err);
              }
            }
          }
        }
        resolve(1);
      });
    }
  );
  fastify.decorate('getUserPluginDataPathInternal', async () => {
    const dock = new DockerService(fs, fastify);
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
  fastify.decorate('extractPluginParamtersInternal', (queueObject, request) => {
    return new Promise(async (resolve, reject) => {
      const parametertype = queueObject.plugin_parametertype;
      const pluginid = queueObject.plugin_id;
      const projectdbid = queueObject.project_id;
      const { projectid } = queueObject.project;
      // eslint-disable-next-line prefer-destructuring
      const processmultipleaims = queueObject.plugin.processmultipleaims;
      const runtimeParams = queueObject.runtime_params;
      const aims = queueObject.aim_uid;
      let paramsToSendToContainer = null;

      const pluginsDataFolder = path.join(
        __dirname,
        `../pluginsDataFolder/${queueObject.creator}/${queueObject.id}/`
      );
      if (!fs.existsSync(pluginsDataFolder)) {
        fs.mkdirSync(pluginsDataFolder, { recursive: true });
        // fs.chmodSync(`${pluginsDataFolder}`, '777', { recursive: true }, () => {
        //   fastify.log.info(`file rights changed by epad_lite for the folder ${pluginsDataFolder}`);
        // });
      }

      const dock = new DockerService(fs, fastify);
      const inspectResultContainerEpadLite = await dock.checkContainerExistance('epad_lite');
      const epadLiteBindPoints = inspectResultContainerEpadLite.HostConfig.Binds;
      let epadLitePwd = '';
      fastify.log.info('getting epad_lite bind points to reflect : ', epadLiteBindPoints);
      for (let cntPoints = 0; cntPoints < epadLiteBindPoints.length; cntPoints += 1) {
        if (epadLiteBindPoints[cntPoints].includes('pluginData')) {
          epadLitePwd = epadLiteBindPoints[cntPoints];
          break;
        }
      }
      const tmpLocalServerBindPoint = epadLitePwd.split(':')[0];
      const localServerBindPoint = `${tmpLocalServerBindPoint}/${queueObject.creator}/${
        queueObject.id
      }/`;

      const pluginsDataFolderlog = path.join(
        __dirname,
        `../pluginsDataFolder/${queueObject.creator}/${queueObject.id}/logs`
      );
      if (!fs.existsSync(`${pluginsDataFolderlog}`)) {
        fs.mkdirSync(`${pluginsDataFolderlog}`);
      }
      fastify.log.info('getting epad_lite bind points and pwd local : ', localServerBindPoint);
      if (parametertype === 'default') {
        try {
          paramsToSendToContainer = await fastify.getPluginDeafultParametersInternal(pluginid);
          console.log('plugin test : ', paramsToSendToContainer);

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
            serverfolder: localServerBindPoint,
            projectid,
            projectdbid,
          };
          console.log('plugin test localServerBindPoint: ', localServerBindPoint);
          resolve(returnObject);
        } catch (err) {
          reject(new InternalError('error while getting plugin default paraeters', err));
          //  reject(err);
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
            serverfolder: localServerBindPoint,
            projectid,
            projectdbid,
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
            serverfolder: localServerBindPoint,
            projectid,
            projectdbid,
          };
          resolve(returnObject);
        } catch (err) {
          reject(new InternalError('error while getting plugin runtime paraeters', err));
        }
      }
    });
  });

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
        .then(data => {
          return data;
        })
        .catch(err => {
          return new InternalError('error while updating queue process status for waiting', err);
        });
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
        .then(data => {
          return data;
        })
        .catch(err => {
          return new InternalError('error while updating queue process status for running', err);
        });
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
        .then(data => {
          return data;
        })
        .catch(err => {
          return new InternalError(
            'error while updating queue process status for ended or error',
            err
          );
        });
    }
    if (status === 'stopping') {
      fastify.log.info('db is writing stopping ', status);
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
        .then(data => {
          return data;
        })
        .catch(err => {
          return new InternalError('error while updating queue process status for stopping', err);
        });
    }
  });

  fastify.decorate('sortPluginParamsAndExtractWhatToMapInternal', async pluginParamsObj => {
    return new Promise(async (resolve, reject) => {
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

        // eslint-disable-next-line func-names
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
                `${tempLocalFolder}${tempPluginParams[i].paramid}:${
                  tempPluginParams[i].default_value
                }`
              );
            }
          }
          if (tempPluginParams[i].paramid === 'parameters') {
            if (tempPluginParams[i].prefix !== '') {
              onlyNameValues.push(tempPluginParams[i].prefix);
            }
            if (tempPluginParams[i].name !== '') {
              onlyNameValues.push(tempPluginParams[i].name);
            }
            if (tempPluginParams[i].default_value !== '') {
              onlyNameValues.push(tempPluginParams[i].default_value);
            }
          }
        }
        const returnObj = {
          paramsDocker: onlyNameValues,
          dockerFoldersToBind: foldersToBind,
        };

        return resolve(returnObj);
      } catch (err) {
        return reject(new InternalError('error sortPluginParamsAndExtractWhatToMapInternal', err));
        //  reject(err);
      }
    });
  });

  fastify.decorate('downloadPluginResult', (request, reply) => {
    const queueObject = request.body;
    const outputPath = `${queueObject.creator}/${queueObject.id}/output/`;
    const dest = path.join(__dirname, `../pluginsDataFolder/${outputPath}`);
    fastify.writeHead(`${queueObject.name}.output.zip`, reply.res, request.headers.origin);

    const archive = archiver('zip', {
      zlib: { level: 9 }, // Sets the compression level.
    });

    // eslint-disable-next-line func-names
    archive.on('error', function(err) {
      throw err;
    });

    archive.directory(dest, false);
    archive.finalize();
    archive.pipe(reply.res);
  });

  fastify.decorate('runPluginsQueueInternal', async (result, request) => {
    const pluginQueueList = [...result];

    for (let i = 0; i < pluginQueueList.length; i += 1) {
      const imageRepo = `${pluginQueueList[i].plugin.image_repo}:${
        pluginQueueList[i].plugin.image_tag
      }`;
      const queueId = pluginQueueList[i].id;
      // eslint-disable-next-line no-await-in-loop
      await fastify.updateStatusQueueProcessInternal(queueId, 'waiting');
      new EpadNotification(
        request,
        `ePad is preparing folder structure for plugin image: ${imageRepo} `,
        'success',
        true
      ).notify(fastify);
      fastify.log.info('running plugin for :', pluginQueueList[i]);

      // eslint-disable-next-line no-await-in-loop
      const pluginParameters = await fastify.extractPluginParamtersInternal(
        pluginQueueList[i],
        request
      );

      fastify.log.info('called image : ', imageRepo);
      const dock = new DockerService(fs, fastify);
      let checkImageExistOnHub = false;
      let checkImageExistLocal = false;
      try {
        fastify.log.info(' tryitn to pull first ', imageRepo);
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
          const userPluginRootPath = await fastify.getUserPluginDataPathInternal();

          let opreationresult = '';
          // eslint-disable-next-line no-await-in-loop
          const sortedParams = await fastify.sortPluginParamsAndExtractWhatToMapInternal(
            pluginParameters
          );

          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueId, 'running');
          // opreationresult = ` plugin image : ${imageRepo} is runing`;
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
            pluginQueueList[i],
            userPluginRootPath
          );

          fastify.log.info('opreationresult', JSON.stringify(opreationresult));

          // eslint-disable-next-line no-prototype-builtins
          if (opreationresult.hasOwnProperty('stack')) {
            fastify.log.info('error catched in upper level ', opreationresult.stack);
            // eslint-disable-next-line no-new
            throw new InternalError('', opreationresult);
          }
          // return new Error(opreationresult.Error);

          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueId, 'ended');
          opreationresult = ` plugin image : ${imageRepo} terminated the container process with success`;
          new EpadNotification(request, opreationresult, 'success', true).notify(fastify);
          fastify.log.info('plugin finished working', imageRepo);

          const checkFileExtension = fileName => {
            const nameArry = fileName.split('.');
            const ext = nameArry[nameArry.length - 1];
            if (ext === 'dcm') {
              return true;
            }
            return false;
          };

          //  upload the result from container to the series
          if (fs.existsSync(`${pluginParameters.serverfolder}output`)) {
            const fileArray = fs
              .readdirSync(`${pluginParameters.serverfolder}output`)
              // eslint-disable-next-line no-loop-func
              .map(fileName => {
                fastify.log.info('filename : ', fileName);
                return fileName;
              })
              .filter(checkFileExtension);
            fastify.log.info('file array : ', fileArray);
            //  eslint-disable-next-line no-await-in-loop
            const { success, errors } = await fastify.saveFiles(
              `${pluginParameters.serverfolder}output`,
              fileArray,
              { project: pluginParameters.projectid },
              {},
              request.epadAuth
            );
            fastify.log.info('project id :', pluginParameters.projectid);
            fastify.log.info('projectdb id :', pluginParameters.projectdbid);
            fastify.log.info('upload dir back error: ', errors);
            fastify.log.info('upload dir back success: ', success);
            //  end
          }
          return 'completed';
        } catch (err) {
          const operationresult = ` plugin image : ${imageRepo} terminated the container process with error`;
          // eslint-disable-next-line no-await-in-loop
          await fastify.updateStatusQueueProcessInternal(queueId, 'error');
          return new EpadNotification(request, operationresult, err, true).notify(fastify);
        }
      } else {
        // eslint-disable-next-line no-await-in-loop
        await fastify.updateStatusQueueProcessInternal(queueId, 'error');
        fastify.log.info('image not found ', imageRepo);
        return new EpadNotification(
          request,
          'error',
          new Error(`no image found check syntax "${imageRepo}" or change to a valid repo`),
          true
        ).notify(fastify);
      }
    }
    return true;
  });
  //  internal functions end
  //  plugins section end

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
          // TODO get it from db instead
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
          studyDate: list[i].dataValues.study.dataValues.studydate,
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

  fastify.decorate('getSubjectUIDsFromProject', async projectID => {
    try {
      const subjects = await models.subject.findAll({
        include: [
          {
            model: models.project_subject,
            include: [{ model: models.project, where: { projectid: projectID } }],
          },
        ],
      });
      return subjects.map(subject => {
        return subject.dataValues.subjectuid;
      });
    } catch (err) {
      fastify.log.error(
        `Couldn't retrieve list of subjectuids from project ${projectID} Error: ${err.message}`
      );
      return [];
    }
  });

  fastify.decorate('getSubjectUIDsFromAimsInProject', async projectID => {
    try {
      const projectAims = await models.project_aim.findAll({
        include: [
          {
            model: models.project,
            where: { projectid: projectID },
          },
        ],
        attributes: ['subject_uid'],
        group: ['subject_uid'],
      });
      return projectAims.map(subject => {
        return subject.dataValues.subject_uid;
      });
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
      .then(result => {
        reply.code(200).send(result);
        if (config.env !== 'test')
          new EpadNotification(request, 'Deleted subject', request.params.subject, true).notify(
            fastify
          );
      })
      .catch(err => reply.send(err));
  });
  fastify.decorate(
    'deleteSeriesAimProjectRels',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          await models.project_aim.destroy({
            where: { series_uid: params.series },
          });
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
            await models.project_aim.destroy({
              where: { subject_uid: subject.subjectuid },
            });
            // delete the subject
            await models.subject.destroy({
              where: { id: subject.id },
            });
          }
          await fastify.deleteSubjectInternal(params, epadAuth);
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
              await models.project_aim.destroy({
                where: { project_id: project.id, subject_uid: subject.subjectuid },
              });

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
                  await models.project_aim.destroy({
                    where: { subject_uid: subject.subjectuid },
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
    'getAimUidsForProjectFilter',
    (params, filter) =>
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
            let whereJSON = { project_id: project.id };
            if (params.subject) {
              whereJSON = { ...whereJSON, subject_uid: params.subject };
              if (params.study) {
                whereJSON = { ...whereJSON, study_uid: params.study };
                if (params.series) {
                  whereJSON = { ...whereJSON, series_uid: params.series };
                }
              }
            }
            if (filter) whereJSON = { ...whereJSON, ...filter };
            const aimUids = [];
            const projectAims = await models.project_aim.findAll({
              where: whereJSON,
            });
            // projects will be an array of Project instances with the specified name
            for (let i = 0; i < projectAims.length; i += 1) {
              aimUids.push(projectAims[i].aim_uid);
            }
            resolve(aimUids);
          }
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getFileUidsForProject',
    params =>
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

  fastify.decorate('getReportFromDB', async (params, report, bestResponseType) => {
    try {
      const projSubjReport = await models.project_subject_report.findOne({
        where: {
          '$subject.subjectuid$': params.subject,
          '$project.projectid$': params.project,
          type: report.toLowerCase(),
        },
        include: [{ model: models.project }, { model: models.subject }],
      });

      if (projSubjReport) {
        if (bestResponseType) {
          if (bestResponseType.toLowerCase() === 'min')
            return Number(projSubjReport.dataValues.best_response_min);
          if (bestResponseType.toLowerCase() === 'baseline')
            return Number(projSubjReport.dataValues.best_response_baseline);
          fastify.log.warn(`Unsupported bestResponseType ${bestResponseType}`);
          return null;
        }
        if (projSubjReport.dataValues.report) {
          return JSON.parse(projSubjReport.dataValues.report);
        }
      }
      return null;
    } catch (err) {
      throw new InternalError(
        `Getting report ${report} from params ${JSON.stringify(params)}`,
        err
      );
    }
  });

  fastify.decorate('getProjectAims', async (request, reply) => {
    try {
      let filter;
      if (request.query.format === 'returnTable' && request.query.templatecode) {
        filter = { template: request.query.templatecode };
      }
      let result;
      // check for saved reports
      if (request.query.report) {
        switch (request.query.report) {
          case 'RECIST':
            // should be one patient
            if (request.params.subject) {
              result = await fastify.getReportFromDB(request.params, request.query.report);
              if (result) {
                reply.code(200).send(result);
                return;
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
      result = await fastify.getAimsInternal(
        request.query.format,
        request.params,
        filter,
        request.epadAuth
      );
      if (request.query.report) {
        switch (request.query.report) {
          case 'RECIST':
            // should be one patient
            if (request.params.subject) result = fastify.getRecist(result);
            else {
              reply.send(new BadRequestError('Recist Report', new Error('Subject required')));
              return;
            }
            break;
          case 'Longitudinal':
            if (request.params.subject) result = fastify.getLongitudinal(result);
            else {
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
              result,
              request.query.templatecode,
              request.query.columns.split(','),
              request.query.shapes
            );
            break;
          case 'stream':
            reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
            break;
          case 'summary':
            result = result.map(obj => ({ ...obj, projectID: request.params.project }));
            break;
          default:
            if (request.query.longitudinal_ref) {
              const aimsByName = {};
              const aimsByTUID = {};
              let tUIDCount = 0;
              result.forEach(aim => {
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
                    .value < studyDate
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
                    ].aim.ImageAnnotationCollection.imaÎgeAnnotations.ImageAnnotation[0]
                      .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startDate
                      .value < studyDate
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
      if (result.length === 1) reply.code(200).send(result[0]);
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
          } else await fastify.saveAimInternal(aim, request.params.project);
          // TODO check if the aim is already associated with any project. warn and update the project_aim entries accordingly
        } else {
          // get aim to populate project_aim data

          [aim] = await fastify.getAimsInternal(
            'json',
            {}, // I do not need params, looking for a specific aim (not in this project)
            { aims: [aimUid] },
            request.epadAuth
          );
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
          let projectUid = '';
          if (typeof project === 'string') {
            projectId = await fastify.findProjectIdInternal(project);
            projectUid = project;
          } else {
            projectId = project.id;
            projectUid = project.dataValues.projectid;
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
          await fastify.aimUpdateGateway(
            projectId,
            subjectUid,
            studyUid,
            user,
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
    'aimUpdateGateway',
    (projectId, subjectUid, studyUid, user, epadAuth, transaction, projectUid) =>
      new Promise(async (resolve, reject) => {
        try {
          await fastify.updateWorklistCompleteness(
            projectId,
            subjectUid,
            studyUid,
            user,
            epadAuth,
            transaction
          );
          // give warning but do not fail if you cannot update the report (it fails if dicoms are not in db)
          try {
            await fastify.updateReports(projectId, projectUid, subjectUid, epadAuth, transaction);
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
    'getAndSaveRecist',
    (projectId, subject, result, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
          const recist = fastify.getRecist(result);
          if (recist && recist !== {}) {
            const bestResponseBaseline = recist.tRRBaseline ? Math.min(...recist.tRRBaseline) : 0;
            const bestResponseMin = recist.tRRMin ? Math.min(...recist.tRRMin) : 0;
            await fastify.upsert(
              models.project_subject_report,
              {
                project_id: projectId,
                subject_id: subject.id,
                type: 'recist',
                report: JSON.stringify(recist),
                best_response_baseline: bestResponseBaseline,
                best_response_min: bestResponseMin,
                updated: true,
                updatetime: Date.now(),
              },
              {
                project_id: projectId,
                subject_id: subject.id,
                type: 'recist',
              },
              epadAuth.username,
              transaction
            );
            fastify.log.info(`Recist report for ${subject.subjectuid} updated`);
            resolve('Recist got and saved');
          } else {
            fastify.log.info(
              `Recist report generation failed, deleting old report for ${
                subject.subjectuid
              } if exists`
            );
            await models.project_subject_report.destroy({
              where: {
                project_id: projectId,
                subject_id: subject.id,
                type: 'recist',
              },
            });
            reject(
              new InternalError(
                `Updating recist report for project ${projectId}, subject ${subject.subjectuid}`,
                new Error('Report not generated')
              )
            );
          }
        } catch (err) {
          reject(
            new InternalError(
              `Updating recist report for project ${projectId}, subject ${subject.subjectuid}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'updateReports',
    (projectId, projectUid, subjectUid, epadAuth, transaction) =>
      new Promise(async (resolve, reject) => {
        try {
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
            const result = await fastify.getAimsInternal(
              'json',
              { project: projectUid, subject: subjectUid },
              undefined,
              epadAuth
            );
            await fastify.getAndSaveRecist(projectId, subject, result, epadAuth, transaction);
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
          await fastify.aimUpdateGateway(
            args.project_id,
            args.subject_uid,
            args.study_uid,
            args.user,
            request.epadAuth,
            undefined,
            request.params.project
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
            } else {
              await fastify.saveAimInternal(request.params.aimuid, request.params.project, true);
              reply.code(200).send(`Aim not deleted from system as it exists in other project`);
            }
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
        let numDeleted;
        const qry =
          request.query.all && request.query.all === 'true'
            ? { aim_uid: request.body }
            : { project_id: project.id, aim_uid: request.body };
        if (request.body && Array.isArray(request.body)) {
          const args = await models.project_aim.findAll({
            where: qry,
            attributes: ['project_id', 'subject_uid', 'study_uid', 'user', 'aim_uid'],
            raw: true,
          });

          numDeleted = await models.project_aim.destroy({
            where: qry,
          });

          // if delete from all or it doesn't exist in any other project, delete from system
          try {
            if (request.query.all && request.query.all === 'true') {
              await fastify.deleteCouchDocsInternal(request.body);
              await fastify.aimUpdateGatewayInBulk(args, request.epadAuth, request.params.project);
              reply
                .code(200)
                .send(`Aims deleted from system and removed from ${numDeleted} projects`);
            } else {
              const leftovers = await models.project_aim.findAll({
                where: { aim_uid: request.body },
                attributes: ['project_id', 'subject_uid', 'study_uid', 'user', 'aim_uid'],
              });
              if (leftovers.length === 0) {
                await fastify.deleteCouchDocsInternal(request.body);
                await fastify.aimUpdateGatewayInBulk(
                  args,
                  request.epadAuth,
                  request.params.project
                );
                reply
                  .code(200)
                  .send(`Aims deleted from system as they didn't exist in any other project`);
              } else {
                for (let i = 0; i < leftovers.length; i += 1) {
                  // go one one by
                  // eslint-disable-next-line no-await-in-loop
                  await fastify.saveAimInternal(leftovers[i].aim_uid, request.params.project, true);
                  fastify.log.info(`Aim not deleted from system as it exists in other project`);
                }
                const deletedAims = request.body.filter(e => {
                  return !leftovers.includes(e);
                });
                await fastify.deleteCouchDocsInternal(deletedAims);
                await fastify.aimUpdateGatewayInBulk(
                  args,
                  request.epadAuth,
                  request.params.project
                );
                reply
                  .code(200)
                  .send(
                    `${
                      leftovers.length
                    } aims not deleted from system as they exist in other project`
                  );
              }
            }
          } catch (deleteErr) {
            reply.send(
              new InternalError(
                `Aims ${JSON.stringify(request.body)} deletion from system ${
                  request.params.project
                }`,
                deleteErr
              )
            );
          }
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

  fastify.decorate(
    'aimUpdateGatewayInBulk',
    (args, epadAuth, projectId) =>
      new Promise(async (resolve, reject) => {
        try {
          if (args) {
            for (let i = 0; i < args.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              await fastify.aimUpdateGateway(
                args[i].project_id,
                args[i].subject_uid,
                args[i].study_uid,
                args[i].user,
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
              referring_physician: studyInfo.referringPhysicianName
                ? studyInfo.referringPhysicianName
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
                    studyInfo,
                    projectSubject,
                    epadAuth
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

  fastify.decorate('add0s', val => {
    return val > 9 ? val : `0${val}`;
  });

  fastify.decorate('getFormattedDate', dateFromDB => {
    const dbDate = new Date(dateFromDB);
    const month = dbDate.getMonth() + 1;
    const date = dbDate.getDate();
    return `${dbDate.getFullYear()}${fastify.add0s(month)}${fastify.add0s(date)}`;
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
                      ] = fastify.getFormattedDate(dbDate);
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
                  params.project !== config.unassignedProjectID
                ) {
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
                        birthdate: nondicoms[i].subject.dataValues.dob,
                        sex: nondicoms[i].subject.dataValues.gender,
                        studyDescription: nondicoms[i].study.dataValues.description,
                        studyAccessionNumber: nondicoms[i].study.dataValues.accession_number,
                        examTypes: nondicoms[i].study.dataValues.exam_types
                          ? JSON.parse(nondicoms[i].study.dataValues.exam_types)
                          : [],
                        numberOfImages: nondicoms[i].study.dataValues.num_of_images,
                        numberOfSeries: nondicoms[i].study.dataValues.num_of_series,
                        numberOfAnnotations: 0,
                        createdTime: fastify.getFormattedDate(
                          new Date(nondicoms[i].study.dataValues.createdtime)
                        ),
                        // extra for flexview
                        studyID: nondicoms[i].study.dataValues.study_id,
                        studyDate: nondicoms[i].study.dataValues.studydate,
                        studyTime: nondicoms[i].study.dataValues.study_time,
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
            await fastify.deleteStudyInternal(params, epadAuth);
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
          resolve(numDeleted);
        } catch (err) {
          reject(new InternalError(`Study deletion from system ${params.study}`, err));
        }
      })
  );

  fastify.decorate('deletePatientStudyFromProject', async (request, reply) => {
    try {
      if (
        (request.params.project === config.XNATUploadProjectID ||
          request.params.project === config.unassignedProjectID) &&
        request.query.all !== 'true'
      ) {
        reply.send(
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
          reply.send(
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
          reply.send(
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
              reply.send(
                new BadRequestError(
                  'Delete study from project',
                  new ResourceNotFoundError('Project subject association', request.params.subject)
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
              if (config.env !== 'test')
                new EpadNotification(
                  request,
                  'Deleted study from system',
                  request.params.study,
                  true
                ).notify(fastify);
              reply
                .code(200)
                .send(`Study deleted from system and removed from ${numDeleted} projects`);
            }
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
                reply
                  .code(200)
                  .send(`Study deleted from system and removed from ${numDeleted} projects`);
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
                  if (config.env !== 'test')
                    new EpadNotification(
                      request,
                      `Deleted study from system as it didn't exist in any other project`,
                      request.params.study,
                      true
                    ).notify(fastify);
                  reply
                    .code(200)
                    .send(`Study deleted from system as it didn't exist in any other project`);
                } else {
                  if (config.env !== 'test')
                    new EpadNotification(
                      request,
                      'Deleted study',
                      request.params.study,
                      true
                    ).notify(fastify);
                  reply
                    .code(200)
                    .send(`Study not deleted from system as it exists in other project`);
                }
              }
            } catch (deleteErr) {
              reply.send(
                new InternalError(`Study ${request.params.study} deletion from system`, deleteErr)
              );
            }
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
        .prepDownload(
          request.headers.origin,
          request.params,
          request.query,
          request.epadAuth,
          reply
        )
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
        await fastify.prepDownload(
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
      .then(users => {
        const result = [];
        //  cavit
        //  fastify.log.info('users --------->', users);
        //  cavit
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
          //  cavit
          //  fastify.log.info(' after adding project to each user --->>', obj);
          //  cavit
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

  // updating username may affect the data in the tables below
  // eventlog, events, reviewer, user_flaggdimage, project_aim
  // updateUserInternal won't handle these tables
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
    'updateUserInWorklistCompleteness',
    (email, username) =>
      new Promise(async (resolve, reject) => {
        models.worklist_study_completeness
          .update({ assignee: username }, { where: { assignee: email } })
          .then(() => {
            resolve();
          })
          .catch(err => {
            reject(new InternalError(` Updating worklist_study_completeness ${username}`, err));
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
    (dataDir, params, query, epadAuth, retrieveSegs, fileUids) =>
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
            const aims = await fastify.getAimsInternal('json', params, undefined, epadAuth);
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
            const files = await fastify.getFilesFromUIDsInternal(
              { format: 'stream' },
              fileUids,
              params,
              dataDir
            );
            isThereDataToWrite = isThereDataToWrite || files;
          }
          resolve(isThereDataToWrite);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'prepStudyDownloadDir',
    (dataDir, params, query, epadAuth, fileUids) =>
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
              false,
              fileUids
            );
            isThereDataToWrite = isThereDataToWrite || isThereData;
          }
          const files = await fastify.getFilesFromUIDsInternal(
            { format: 'stream' },
            fileUids,
            { ...params, series: 'NA' },
            dataDir
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

  // it needs the node response object
  fastify.decorate(
    'prepDownload',
    async (reqOrigin, params, query, epadAuth, output, whereJSON, studyInfos, seriesInfos) =>
      new Promise(async (resolve, reject) => {
        try {
          // not handling all project intentionally. only download files for that project
          const fileUids = await fastify.getFileUidsForProject({ project: params.project });
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
                true,
                fileUids
              );
              if (!isThereData) fs.rmdirSync(dataDir);
              isThereDataToWrite = isThereDataToWrite || isThereData;
            } else if (params.study) {
              // download all series under study
              const isThereData = await fastify.prepStudyDownloadDir(
                dataDir,
                params,
                query,
                epadAuth,
                fileUids
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
                  // if there is wherejson, it can be project or subject(s) download
                  // if it is project download, one subject or multiple subjects I need to get files for that subjects
                  if (
                    params.subject ||
                    (whereJSON &&
                      (!whereJSON.subject_id || (whereJSON.subject_id && whereJSON.subject_id.$in)))
                  ) {
                    // eslint-disable-next-line no-await-in-loop
                    const files = await fastify.getFilesFromUIDsInternal(
                      { format: 'stream' },
                      fileUids,
                      { subject: subjectUid, study: 'NA', series: 'NA' },
                      `${dataDir}/Patient-${subjectUid}`
                    );

                    isThereDataToWrite = isThereDataToWrite || files;
                  }
                  studySubDir = `Patient-${subjectUid}/Study-${studyUid}`;
                }
                const studyDir = `${dataDir}/${studySubDir}`;
                fs.mkdirSync(studyDir);
                // eslint-disable-next-line no-await-in-loop
                const isThereData = await fastify.prepStudyDownloadDir(
                  studyDir,
                  { ...params, subject: subjectUid, study: studyUid },
                  query,
                  epadAuth,
                  fileUids
                );
                if (!isThereData) fs.rmdirSync(studyDir);
                else {
                  if (!headWritten) {
                    if (!isResponseJustStream) {
                      // start writing the head so that long requests do not fail
                      fastify.writeHead(dirName, res, reqOrigin);
                    }
                    // create the archive
                    archive
                      .on('error', err => reject(new InternalError('Archiving ', err)))
                      .pipe(res);
                    headWritten = true;
                  }
                  if (
                    params.subject ||
                    (whereJSON &&
                      (!whereJSON.subject_id || (whereJSON.subject_id && whereJSON.subject_id.$in)))
                  )
                    archive.directory(`${dataDir}/Patient-${subjectUid}`, `Patient-${subjectUid}`);
                  else archive.directory(`${studyDir}`, studySubDir);
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
                  false,
                  fileUids
                );
                isThereDataToWrite = isThereDataToWrite || isThereData;
              }
            }
            // check files
            // if it is study or series level it is already handled
            // only project files
            if (!params.study && !params.series && whereJSON && !whereJSON.subject_id) {
              const files = await fastify.getFilesFromUIDsInternal(
                { format: 'stream' },
                fileUids,
                { subject: 'NA', study: 'NA', series: 'NA' },
                dataDir
              );
              isThereDataToWrite = isThereDataToWrite || files;
              archive.directory(`${dataDir}/files`, 'files');
            }

            if (isThereDataToWrite) {
              if (!headWritten) {
                if (!isResponseJustStream) fastify.writeHead(dirName, res, reqOrigin);
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
        await fastify.prepDownload(
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
        let whereJSON = {
          subject_id: subject.id,
        };
        if (request.params.project !== config.XNATUploadProjectID)
          whereJSON = { ...whereJSON, project_id: project.id };
        await fastify.prepDownload(
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
          subject_id: { $in: subjectIds },
        };
        if (request.params.project !== config.XNATUploadProjectID)
          whereJSON = { ...whereJSON, project_id: project.id };

        await fastify.prepDownload(
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
        await fastify.prepDownload(
          request.headers.origin,
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
          request.headers.origin,
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
          const studySeries = await fastify.getStudySeriesInternal(
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
          });
          const aimProjects = projectAims.map(projectAim => {
            return {
              aim: projectAim.dataValues.aim_uid,
              project: projectAim.dataValues.project.dataValues.projectid,
            };
          });
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
          await fastify.orm.transaction(async t => {
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
            // cavit
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

            await fastify.orm.query(
              `ALTER TABLE plugin_queue
              MODIFY COLUMN status varchar(10) ;`,
              { transaction: t }
            );
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
              fs.remove(path.join('/tmp', tmpFolders[i]), error => {
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
                fastify.calcStats();
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

  fastify.decorate('version0_4_0', () => fastify.addProjectIDToAims());

  fastify.decorate(
    'checkAndMigrateVersion',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const dbVersionTuple = await models.dbversion.findOne({
            attributes: ['version'],
            raw: true,
          });
          const dbVersion = dbVersionTuple ? dbVersionTuple.version : undefined;
          if (appVersion === '0.4.0' && dbVersion !== 'v0.4.0') await fastify.version0_4_0();
          if (dbVersion) {
            await models.dbversion.update(
              { version: `v${appVersion}` },
              {
                where: {
                  version: dbVersion,
                },
              }
            );
          }
          resolve();
        } catch (err) {
          reject(new InternalError('afterDBReady', err));
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
