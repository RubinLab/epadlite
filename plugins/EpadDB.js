const fp = require('fastify-plugin');

async function epaddb(fastify) {
  const Project = fastify.orm.import(`${__dirname}/../models/project`);
  const ProjectTemplate = fastify.orm.import(`${__dirname}/../models/project_template`);
  const ProjectSubject = fastify.orm.import(`${__dirname}/../models/project_subject`);

  fastify.decorate('initMariaDB', async () => {
    // Test connection
    fastify.orm
      .authenticate()
      .then(async () => {
        await fastify.orm.sync();
        console.log('Connection to mariadb has been established successfully.');
      })
      .catch(err => {
        console.error('Unable to connect to the database:', err);
      });
  });

  fastify.decorate('createProject', (request, reply) => {
    Project.create({
      name: request.query.projectName,
      projectid: request.query.projectId,
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

  fastify.decorate('saveTemplateToProject', async (request, reply) => {
    try {
      let templateUid = request.params.uid;
      if (request.body) {
        await fastify.saveTemplateInternal(request.body);
        templateUid = request.body.TemplateContainer.uid;
      }
      const project = await Project.findOne({ where: { projectid: request.params.projectId } });

      await ProjectTemplate.create({
        project_id: project.id,
        template_uid: templateUid,
        enabled: true,
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
      const project = await Project.findOne({ where: { projectid: request.params.projectId } });
      const templateUids = [];
      ProjectTemplate.findAll({ where: { project_id: project.id } }).then(projectTemplates => {
        // projects will be an array of Project instances with the specified name
        projectTemplates.forEach(projectTemplate =>
          templateUids.push(projectTemplate.template_uid)
        );
        console.log(templateUids);
        fastify
          .getTemplatesFromUIDsInternal(request.query, templateUids)
          .then(result => {
            if (request.query.format === 'stream') {
              reply.header('Content-Disposition', `attachment; filename=templates.zip`);
            }
            reply.code(200).send(result);
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
      const project = await Project.findOne({ where: { projectid: request.params.projectId } });

      const numDeleted = await ProjectTemplate.destroy({
        where: { project_id: project.id, template_uid: templateUid },
      });
      reply.code(200).send(`Deleted ${numDeleted} records`);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
  });

  fastify.decorate('addSubjectToProject', async (request, reply) => {
    try {
      const { subjectId } = request.params;
      const project = await Project.findOne({ where: { projectid: request.params.projectId } });
      await ProjectSubject.create({
        project_id: project.id,
        subject_uid: subjectId,
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

  fastify.decorate('getProjectSubjects', async (request, reply) => {
    try {
      const project = await Project.findOne({ where: { projectid: request.params.projectId } });
      const subjectUids = [];
      ProjectSubject.findAll({ where: { project_id: project.id } }).then(projectSubjects => {
        // projects will be an array of Project instances with the specified name
        projectSubjects.forEach(projectSubject => subjectUids.push(projectSubject.subject_uid));
      });
      console.log(subjectUids);
      fastify
        .getPatientsInternal(subjectUids)
        .then(result => reply.code(200).send(result))
        .catch(err => reply.code(503).send(err.message));
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in save: ${err}`);
      reply.code(503).send(`Saving error: ${err}`);
    }
  });

  fastify.decorate('deleteSubjectFromProject', async (request, reply) => {
    try {
      const subjectUid = request.params.subjectId;
      const project = await Project.findOne({ where: { projectid: request.params.projectId } });

      const numDeleted = await ProjectSubject.destroy({
        where: { project_id: project.id, subject_uid: subjectUid },
      });
      reply.code(200).send(`Deleted ${numDeleted} records`);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in delete: ${err}`);
      reply.code(503).send(`Deletion error: ${err}`);
    }
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
