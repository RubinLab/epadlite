const fp = require('fastify-plugin');
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

let initialized = false;

module.exports = fp(async (fastify, opts) => {
  if (initialized) {
    console.log('Initalized already');
    return;
  }
  console.log('Initalizing');
  initialized = true;

  const { config } = opts;

  const sequelizeConfig = {
    dialect: 'mariadb',
    database: config.thickDb.name,
    host: config.thickDb.host,
    port: config.thickDb.port,
    username: config.thickDb.user,
    password: config.thickDb.pass,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    define: { timestamps: false },
    logging: config.thickDb.logger === true || config.thickDb.logger === 'true',
  };
  let sequelize = null;

  if (config.env === 'test') {
    try {
      sequelizeConfig.database = '';
      sequelize = new Sequelize(sequelizeConfig);
      await sequelize.query(`CREATE DATABASE ${config.thickDb.name};`);
      sequelizeConfig.database = config.thickDb.name;
      sequelize = new Sequelize(sequelizeConfig);
    } catch (testDBErr) {
      console.log('errrrrtest', testDBErr);
    }
  } else {
    sequelize = new Sequelize(sequelizeConfig);
  }
  console.log('MariaDB plugin start');
  await sequelize.authenticate();
  console.log('MariaDB connected');
  fastify.decorate('orm', sequelize);
  const models = {};
  // Load Models
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

  fastify.decorate('models', models);
  //   await sequelize.sync();
  await fastify.orm.sync();
  console.log('Synced', models);
  // eslint-disable-next-line no-proto
  //   console.log(Object.getOwnPropertyNames(fastify.models.project.__proto__));

  if (config.env === 'test') {
    try {
      await fastify.orm.query(
        `INSERT IGNORE INTO user(username, firstname, lastname, email, admin, createdtime, updatetime) VALUES('admin', 'admin', 'admin', 'admin@gmail.com', true, ${Date.now()}, ${Date.now()})`
      );
    } catch (userCreateErr) {
      console.log('Creating admin user in testdb', userCreateErr);
    }
    try {
      await fastify.orm.query(
        `INSERT IGNORE INTO registeredapps(apikey,name, email, organization, emailvalidationcode, ontologyname, hostname, epadtype, creator, createdtime, updatetime) VALUES('1111','testname','testemail','testorganization','testvalid', 'testontologyname', 'testontologyhost', 't', 'test', ${Date.now()}, ${Date.now()})`
      );
    } catch (apikeyerror) {
      console.log('Creating apikey  in testdb', apikeyerror);
    }
  }
  fastify.log.info('Connected to MariaDB');
});
