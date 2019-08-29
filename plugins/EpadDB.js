const fp = require('fastify-plugin');
// const Sequelize = require('sequelize');

async function epaddb(fastify) {
  const Project = fastify.orm.import(`${__dirname}/../models/project`);
  const Worklist = fastify.orm.import(`${__dirname}/../models/worklist`);
  const WorklistStudy = fastify.orm.import(`${__dirname}/../models/worklist_study`);
  Worklist.hasMany(WorklistStudy, { foreignKey: 'worklist_id' });
  const ProjectTemplate = fastify.orm.import(`${__dirname}/../models/project_template`);
  const ProjectSubject = fastify.orm.import(`${__dirname}/../models/project_subject`);
  const ProjectSubjectStudy = fastify.orm.import(`${__dirname}/../models/project_subject_study`);

  fastify.decorate('initMariaDB', async () => {
    // Test connection
    fastify.orm
      .authenticate()
      .then(() => {
        fastify.orm
          .sync()
          .then(() => {
            fastify.log.info('db sync successful!');
          })
          .catch(err => console.log(err));
        fastify.log.info('Connection to mariadb has been established successfully.');
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
        projectid: request.params.project,
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
        projectid: request.params.project,
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
      user_id: request.params.user,
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

  fastify.decorate('updateWorklist', (request, reply) => {
    Worklist.update(
      { ...request.body, updatetime: Date.now(), updated_by: request.body.username },
      {
        where: {
          user_id: request.params.user,
          worklistid: request.params.worklist,
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
        user_id: request.params.user,
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
        user_id: request.params.user,
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
      const project = await Project.findOne({ where: { projectid: request.params.project } });

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
      const project = await Project.findOne({ where: { projectid: request.params.project } });
      const templateUids = [];
      ProjectTemplate.findAll({ where: { project_id: project.id } }).then(projectTemplates => {
        // projects will be an array of Project instances with the specified name
        projectTemplates.forEach(projectTemplate =>
          templateUids.push(projectTemplate.template_uid)
        );
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
      const project = await Project.findOne({ where: { projectid: request.params.project } });

      const numDeleted = await ProjectTemplate.destroy({
        where: { project_id: project.id, template_uid: templateUid },
      });
      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const deletednum = await ProjectTemplate.destroy({
            where: { template_uid: templateUid },
          });
          await fastify.deleteTemplateInternal(request.params);
          reply
            .code(200)
            .send(
              `Template deleted from system and removed from ${deletednum + numDeleted} projects`
            );
        } else {
          const count = await ProjectTemplate.count({ where: { template_uid: templateUid } });
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
      const numDeleted = await ProjectTemplate.destroy({
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
      const project = await Project.findOne({ where: { projectid: request.params.project } });
      await ProjectSubject.create({
        project_id: project.id,
        subject_uid: subject,
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

  fastify.decorate('getPatientsFromProject', async (request, reply) => {
    try {
      const project = await Project.findOne({ where: { projectid: request.params.project } });
      const subjectUids = [];
      const projectSubjects = await ProjectSubject.findAll({ where: { project_id: project.id } });
      if (projectSubjects)
        // projects will be an array of Project instances with the specified name
        projectSubjects.forEach(projectSubject => subjectUids.push(projectSubject.subject_uid));
      const result = await fastify.getPatientsInternal(subjectUids);
      reply.code(200).send(result);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('deleteSubjectFromProject', async (request, reply) => {
    try {
      const subjectUid = request.params.subject;
      const project = await Project.findOne({ where: { projectid: request.params.project } });

      const numDeleted = await ProjectSubject.destroy({
        where: { project_id: project.id, subject_uid: subjectUid },
      });
      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const deletednum = await ProjectSubject.destroy({
            where: { subject_uid: subjectUid },
          });
          await fastify.deleteSubjectInternal(request.params);
          reply
            .code(200)
            .send(
              `Subject deleted from system and removed from ${deletednum + numDeleted} projects`
            );
        } else {
          const count = await ProjectSubject.count({ where: { subject_uid: subjectUid } });
          if (count === 0) {
            await fastify.deleteSubjectInternal(request.params);
            reply
              .code(200)
              .send(`Subject deleted from system as it didn't exist in any other project`);
          } else
            reply.code(200).send(`Subject not deleted from system as it exists in other project`);
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

  // from CouchDB
  // fastify.decorate('getSeriesAimsFromProject', async (request, reply) => {
  //   const project = await Project.findOne({ where: { projectid: request.params.project } });
  //     const aimUids = [];
  //     const projectSubjects = await ProjectSubject.findAll({ where: { project_id: project.id } });
  //     if (projectSubjects)
  //       // projects will be an array of Project instances with the specified name
  //       projectSubjects.forEach(projectSubject => subjectUids.push(projectSubject.subject_uid));
  //     const result = await fastify.getPatientsInternal(subjectUids);
  //     reply.code(200).send(result);
  //   fastify
  //     .getAims(request.query.format, request.params)
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
  //     .getAims(request.query.format, request.params)
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
  //     .getAims(request.query.format, request.params)
  //     .then(result => {
  //       if (request.query.format === 'stream') {
  //         reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
  //       }
  //       reply.code(200).send(result);
  //     })
  //     .catch(err => reply.code(503).send(err));
  // });

  // fastify.decorate('getProjectAims', (request, reply) => {
  //   fastify
  //     .getAims(request.query.format, request.params)
  //     .then(result => {
  //       if (request.query.format === 'stream') {
  //         reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
  //       }
  //       reply.code(200).send(result);
  //     })
  //     .catch(err => reply.code(503).send(err));
  // });

  // fastify.decorate('saveAim', (request, reply) => {
  //   // get the uid from the json and check if it is same with param, then put as id in couch document
  //   if (
  //     request.params.aimuid &&
  //     request.params.aimuid !== request.body.ImageAnnotationCollection.uniqueIdentifier.root
  //   ) {
  //     fastify.log.info(
  //       'Conflicting aimuids: the uid sent in the url should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root'
  //     );
  //     reply
  //       .code(503)
  //       .send(
  //         'Conflicting aimuids: the uid sent in the url should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root'
  //       );
  //   }
  //   fastify
  //     .saveAimInternal(request.body)
  //     .then(() => {
  //       reply.code(200).send('Saving successful');
  //     })
  //     .catch(err => {
  //       // TODO Proper error reporting implementation required
  //       fastify.log.info(`Error in save: ${err}`);
  //       reply.code(503).send(`Saving error: ${err}`);
  //     });
  // });

  // fastify.decorate('deleteAim', (request, reply) => {
  //   fastify
  //     .deleteAimInternal(request.params.aimuid)
  //     .then(() => reply.code(200).send('Deletion successful'))
  //     .catch(err => reply.code(503).send(err));
  // });

  // from DicomwebServer
  // fastify.decorate('getPatientStudies', (request, reply) => {
  //   fastify
  //     .getPatientStudiesInternal(request.params)
  //     .then(result => reply.code(200).send(result))
  //     .catch(err => reply.code(503).send(err.message));
  // });
  fastify.decorate('addPatientStudyToProject', async (request, reply) => {
    try {
      const project = await Project.findOne({ where: { projectid: request.params.project } });
      let projectSubject = await ProjectSubject.findOne({
        where: { project_id: project.id, subject_uid: request.params.subject },
      });
      if (!projectSubject)
        projectSubject = await ProjectSubject.create({
          project_id: project.id,
          subject_uid: request.params.subject,
          creator: request.query.username,
          updatetime: Date.now(),
        });
      await ProjectSubjectStudy.create({
        proj_subj_id: projectSubject.id,
        study_uid: request.params.study,
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

  fastify.decorate('getPatientStudiesFromProject', async (request, reply) => {
    try {
      const project = await Project.findOne({ where: { projectid: request.params.project } });
      const studyUids = [];
      const projectSubjects = await ProjectSubject.findAll({ where: { project_id: project.id } });
      if (projectSubjects)
        // projects will be an array of Project instances with the specified name
        projectSubjects.forEach(async projectSubject => {
          const projectSubjectStudies = await ProjectSubjectStudy.findAll({
            where: { proj_subj_id: projectSubject.id },
          });
          if (projectSubjectStudies)
            projectSubjectStudies.forEach(projectSubjectStudy =>
              studyUids.push(projectSubjectStudy.study_uid)
            );
        });
      console.log('studyUids', studyUids);
      const result = await fastify.getPatientStudiesInternal(request.params, studyUids);
      reply.code(200).send(result);
    } catch (err) {
      // TODO Proper error reporting implementation required
      console.log(`Error in get: ${err}`);
      reply.code(503).send(`Getting error: ${err}`);
    }
  });

  fastify.decorate('deletePatientStudyFromProject', async (request, reply) => {
    try {
      const project = await Project.findOne({ where: { projectid: request.params.project } });
      const projectSubject = await ProjectSubject.findOne({
        where: { project_id: project.id, subject_uid: request.params.subject },
      });
      let numDeleted = await ProjectSubjectStudy.destroy({
        where: { proj_subj_id: projectSubject.id, study_uid: request.params.study },
      });
      // see if there is any other study refering to this subject in ths project
      const studyCount = await ProjectSubjectStudy.count({
        where: { proj_subj_id: projectSubject.id },
      });
      if (studyCount === 0)
        await ProjectSubject.destroy({
          where: { id: projectSubject.id },
        });

      // if delete from all or it doesn't exist in any other project, delete from system
      try {
        if (request.query.all && request.query.all === 'true') {
          const projectSubjectStudies = await ProjectSubjectStudy.findAll({
            where: { study_uid: request.params.study },
          });
          const projSubjIds = [];
          if (projectSubjectStudies) {
            projectSubjectStudies.forEach(async projectSubjectStudy => {
              const existingStudyCount = await ProjectSubjectStudy.count({
                where: { proj_subj_id: projectSubjectStudy.proj_subj_id },
              });
              if (existingStudyCount < 2) projSubjIds.push(projectSubjectStudy.proj_subj_id);
            });
            projectSubjectStudies.forEach(async projectSubjectStudy => {
              numDeleted += await ProjectSubjectStudy.destroy({
                where: { id: projectSubjectStudy.id },
              });
            });
            projSubjIds.forEach(async projSubjId => {
              await ProjectSubject.destroy({
                where: { id: projSubjId },
              });
            });
          }
          await fastify.deleteStudyInternal(request.params);
          reply.code(200).send(`Study deleted from system and removed from ${numDeleted} projects`);
        } else {
          const count = await ProjectSubjectStudy.count({
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
