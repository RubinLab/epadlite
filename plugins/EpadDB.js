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
  const ProjectUser = fastify.orm.import(`${__dirname}/../models/project_user`);
  const User = fastify.orm.import(`${__dirname}/../models/user`);

  User.belongsToMany(Project, {
    through: 'project_user',
    as: 'projects',
    foreignKey: 'user_id',
  });

  Project.belongsToMany(User, {
    through: 'project_user',
    as: 'users',
    foreignKey: 'project_id',
  });

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

  fastify.decorate('createWorklist', async (request, reply) => {
    let userId;
    try {
      // find user id
      userId = await User.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }
    Worklist.create({
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

  fastify.decorate('updateWorklist', async (request, reply) => {
    let userId;
    try {
      // find user id
      userId = await User.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }
    Worklist.update(
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
      userId = await User.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }

    Worklist.findAll({
      where: {
        user_id: userId,
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
      userId = await User.findOne({
        where: { username: request.params.user },
        attributes: ['id'],
      });
      userId = userId.dataValues.id;
    } catch (err) {
      console.log(err);
    }
    Worklist.destroy({
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
        for (let i = 0; i < projectSubjects.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const projectSubjectStudies = await ProjectSubjectStudy.findAll({
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
          const projectSubjectStudyIds = [];
          if (projectSubjectStudies) {
            for (let i = 0; i < projectSubjectStudies.length; i += 1) {
              // eslint-disable-next-line no-await-in-loop
              const existingStudyCount = await ProjectSubjectStudy.count({
                where: { proj_subj_id: projectSubjectStudies[i].proj_subj_id },
              });
              if (existingStudyCount === 1) projSubjIds.push(projectSubjectStudies[i].proj_subj_id);
              projectSubjectStudyIds.push(projectSubjectStudies[i].id);
            }
            numDeleted += await ProjectSubjectStudy.destroy({
              where: { id: projectSubjectStudyIds },
            });
            await ProjectSubject.destroy({
              where: { id: projSubjIds },
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

  fastify.decorate('createUser', (request, reply) => {
    User.create({
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
              let projectId = await Project.findOne({
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
              queries.push(ProjectUser.create(entry));
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
        await ProjectUser.destroy({ where: { project_id: projectId, user_id: userId } });
        reply.code(200).send(`update sucessful`);
      } else {
        result = await ProjectUser.findOrCreate({
          where: { project_id: projectId, user_id: userId },
          defaults: { ...rowsUpdated, creator: request.body.updatedBy },
        });
        // check if new entry created
        // if not created, get the id and update the relation
        if (result[1]) {
          reply.code(200).send(`new relation created  sucessfully on update`);
        } else {
          await ProjectUser.update(rowsUpdated, { where: { id: result[0].dataValues.id } });
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
        let userId = await User.findOne({ where: { username }, attributes: ['id'] });
        userId = userId.dataValues.id;
        // find project id
        let projectId = await Project.findOne({ where: { projectid }, attributes: ['id'] });
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
    User.findAll({
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
    try {
      const user = await User.findAll({
        where: {
          username: request.params.user,
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
        reply.code(200).send(obj);
      } else {
        reply.code(404).send(`No user as ${request.params.user}`);
      }
    } catch (err) {
      console.log(err.message);
      reply.code(503).send(err.message);
    }
  });

  fastify.decorate('deleteUser', async (request, reply) => {
    User.destroy({
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
