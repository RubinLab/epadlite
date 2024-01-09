/* eslint-disable no-async-promise-executor */
/* eslint-disable no-underscore-dangle */
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const archiver = require('archiver');
const atob = require('atob');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');
const toArrayBuffer = require('to-array-buffer');
const config = require('../config/index');
const viewsjs = require('../config/views');
const {
  InternalError,
  ResourceNotFoundError,
  BadRequestError,
  UnauthenticatedError,
} = require('../utils/EpadErrors');
const EpadNotification = require('../utils/EpadNotification');

async function couchdb(fastify, options) {
  fastify.decorate('init', async () => {
    try {
      await fastify.couch.db.list();
      fastify.log.info('Connected to couchdb server');
      return fastify.checkAndCreateDb();
    } catch (err) {
      if (config.env !== 'test') {
        fastify.log.warn('Waiting for couchdb server');
        setTimeout(fastify.init, 3000);
      } else throw new InternalError('No connection to couchdb', err);
    }
    return null;
  });

  // Update the views in couchdb with the ones defined in the code
  fastify.decorate(
    'checkAndCreateDb',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const databases = await fastify.couch.db.list();
          // check if the db exists
          if (databases.indexOf(config.db) < 0) {
            await fastify.couch.db.create(config.db);
          }
          const dicomDB = fastify.couch.db.use(config.db);
          // define an empty design document
          let viewDoc = {};
          viewDoc.views = {};
          let searchDoc = {};
          searchDoc.indexes = {};
          // try and get the design document
          try {
            viewDoc = await dicomDB.get('_design/instances');
          } catch (e) {
            fastify.log.info('View document not found! Creating new one');
          }
          try {
            searchDoc = await dicomDB.get('_design/search');
          } catch (e) {
            fastify.log.info('Search document not found! Creating new one');
          }
          const keys = Object.keys(viewsjs.views);
          const values = Object.values(viewsjs.views);
          // clear views inside couch
          viewDoc.views = {};
          // update the views
          for (let i = 0; i < keys.length; i += 1) {
            viewDoc.views[keys[i]] = values[i];
          }
          searchDoc.indexes.aimSearch = viewsjs.searchIndexes.aimSearch;
          // insert the updated/created design document
          await dicomDB.insert(viewDoc, '_design/instances', (insertErr) => {
            if (insertErr) {
              fastify.log.error(`Error updating the design document ${insertErr.message}`);
              reject(new InternalError('Error updating couchdb design document', insertErr));
            } else {
              fastify.log.info('Design document updated successfully ');
              resolve();
            }
          });
          await dicomDB.insert(searchDoc, '_design/search', (insertErr) => {
            if (insertErr) {
              fastify.log.error(`Error updating the search design document ${insertErr.message}`);
              reject(new InternalError('Error updating search design document', insertErr));
            } else {
              fastify.log.info('Search design document updated successfully ');
              resolve();
            }
          });
        } catch (err) {
          fastify.log.error(`Error connecting to couchdb: ${err.message}`);
          reject(new InternalError('Error connecting to couchdb', err));
        }
      })
  );

  fastify.decorate('getOtherHeaders', (imageAnnotation, header) => {
    // very clumsy, long code, but traverses once
    // Imaging observation, imaging physical entity
    if (imageAnnotation.imagingPhysicalEntityCollection) {
      let ipes = [];
      if (Array.isArray(imageAnnotation.imagingPhysicalEntityCollection.ImagingPhysicalEntity)) {
        ipes = imageAnnotation.imagingPhysicalEntityCollection.ImagingPhysicalEntity;
      } else {
        ipes.push(imageAnnotation.imagingPhysicalEntityCollection.ImagingPhysicalEntity);
      }
      ipes.forEach((ipe) => {
        header.push({ id: ipe.label.value.toLowerCase(), title: ipe.label.value });
        if (ipe.imagingPhysicalEntityCharacteristicCollection) {
          const ipcs =
            ipe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic;
          ipcs.forEach((ipc) => {
            header.push({
              id: ipc.label.value.toLowerCase(),
              title: ipc.label.value,
            });
          });
        }
      });
    }

    if (imageAnnotation.imagingObservationEntityCollection) {
      const ioes = imageAnnotation.imagingObservationEntityCollection.ImagingObservationEntity;
      ioes.forEach((ioe) => {
        // imagingObservationEntity can have both ImagingObservationCharacteristic and imagingPhysicalEntityCharacteristic
        header.push({ id: ioe.label.value.toLowerCase(), title: ioe.label.value });
        if (ioe.imagingObservationCharacteristicCollection) {
          const iocs =
            ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic;
          iocs.forEach((ioc) => {
            header.push({
              id: ioc.label.value.toLowerCase(),
              title: ioc.label.value,
            });
          });
        }
        let ipcs = [];
        if (ioe.imagingPhysicalEntityCharacteristicCollection) {
          ipcs =
            ioe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic;
          ipcs.forEach((ipc) => {
            header.push({
              id: ipc.label.value.toLowerCase(),
              title: ipc.label.value,
            });
          });
        }
      });
    }
    return header;
  });

  fastify.decorate('getOtherData', (imageAnnotation, rowIn) => {
    // very clumsy, long code, but traverses once
    const row = rowIn;
    // add imagingPhysicalEntitys
    if (imageAnnotation.imagingPhysicalEntityCollection) {
      let ipes = [];
      if (Array.isArray(imageAnnotation.imagingPhysicalEntityCollection.ImagingPhysicalEntity)) {
        ipes = imageAnnotation.imagingPhysicalEntityCollection.ImagingPhysicalEntity;
      } else {
        ipes.push(imageAnnotation.imagingPhysicalEntityCollection.ImagingPhysicalEntity);
      }
      ipes.forEach((ipe) => {
        row[ipe.label.value.toLowerCase()] = ipe.typeCode[0]['iso:displayName'].value;
        if (ipe.imagingPhysicalEntityCharacteristicCollection) {
          let ipcs = [];
          if (
            Array.isArray(
              ipe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic
            )
          ) {
            ipcs =
              ipe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic;
          } else {
            ipcs.push(
              ipe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic
            );
          }

          ipcs.forEach((ipc) => {
            row[ipc.label.value.toLowerCase()] = ipc.typeCode[0]['iso:displayName'].value;
          });
        }
      });
    }

    // add imagingObservationEntitys
    if (imageAnnotation.imagingObservationEntityCollection) {
      let ioes = [];
      if (
        Array.isArray(imageAnnotation.imagingObservationEntityCollection.ImagingObservationEntity)
      ) {
        ioes = imageAnnotation.imagingObservationEntityCollection.ImagingObservationEntity;
      } else {
        ioes.push(imageAnnotation.imagingObservationEntityCollection.ImagingObservationEntity);
      }
      ioes.forEach((ioe) => {
        // imagingObservationEntity can have both ImagingObservationCharacteristic and imagingPhysicalEntityCharacteristic
        row[ioe.label.value.toLowerCase()] = ioe.typeCode[0]['iso:displayName'].value;
        if (ioe.imagingObservationCharacteristicCollection) {
          let iocs = [];
          if (
            Array.isArray(
              ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic
            )
          ) {
            iocs = ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic;
          } else {
            iocs.push(
              ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic
            );
          }
          iocs.forEach((ioc) => {
            if (
              ioc.characteristicQuantificationCollection &&
              ioc.characteristicQuantificationCollection.CharacteristicQuantification.length > 0
            ) {
              const iocq =
                ioc.characteristicQuantificationCollection.CharacteristicQuantification[0];
              row[ioc.label.value.toLowerCase()] = iocq.valueLabel.value;
            } else {
              row[ioc.label.value.toLowerCase()] = ioc.typeCode[0][`iso:displayName`].value;
            }
          });
        }
        if (ioe.imagingPhysicalEntityCharacteristicCollection) {
          let ipcs = [];
          if (
            Array.isArray(
              ioe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic
            )
          ) {
            ipcs =
              ioe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic;
          } else {
            ipcs.push(
              ioe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic
            );
          }
          ipcs.forEach((ipc) => {
            row[ipc.label.value.toLowerCase()] = ipc.typeCode[0]['iso:displayName'].value;
          });
        }
      });
    }
    return row;
  });

  fastify.decorate('getCalculationHeaders', (imageAnnotation, header) => {
    // very clumsy, long code, but traverses once
    // Imaging observation, imaging physical entity
    if (imageAnnotation.calculationEntityCollection) {
      let calcs = [];
      if (Array.isArray(imageAnnotation.calculationEntityCollection.CalculationEntity)) {
        calcs = imageAnnotation.calculationEntityCollection.CalculationEntity;
      } else {
        calcs.push(imageAnnotation.calculationEntityCollection.CalculationEntity);
      }
      calcs.forEach((calc) => {
        header.push({ id: calc.description.value.toLowerCase(), title: calc.description.value });
      });
    }
    return header;
  });

  fastify.decorate('getCalculationData', (imageAnnotation, rowIn) => {
    // very clumsy, long code, but traverses once
    const row = rowIn;
    // add imagingPhysicalEntitys
    if (imageAnnotation.calculationEntityCollection) {
      let calcs = [];
      if (Array.isArray(imageAnnotation.calculationEntityCollection.CalculationEntity)) {
        calcs = imageAnnotation.calculationEntityCollection.CalculationEntity;
      } else {
        calcs.push(imageAnnotation.calculationEntityCollection.CalculationEntity);
      }
      calcs.forEach((calc) => {
        if (
          calc.calculationResultCollection &&
          calc.calculationResultCollection.CalculationResult[0]
        ) {
          const calcResult = calc.calculationResultCollection.CalculationResult[0];
          if (calcResult['xsi:type'] === 'CompactCalculationResult')
            row[
              calc.description.value.toLowerCase()
            ] = `${calcResult.value.value} ${calcResult.unitOfMeasure.value}`;
          else {
            // TODO handle old aims
          }
        }
      });
    }
    return row;
  });

  // returns stream if online (total_rows===aimsResult.rows.length)
  // zip file path otherwise
  fastify.decorate(
    'downloadAims',
    (downloadParams, aimsResult, epadAuth, params) =>
      new Promise(async (resolve, reject) => {
        try {
          const offline = aimsResult.total_rows !== aimsResult.rows.length;
          const timestamp = new Date().getTime();
          const dir = `/tmp/tmp_${timestamp}`;
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;

          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            fs.mkdirSync(`${dir}/annotations`);

            isThereDataToWrite =
              (await fastify.prepAimDownload(
                `${dir}/annotations`,
                params || {},
                epadAuth,
                downloadParams,
                aimsResult
              )) || isThereDataToWrite;
            if (isThereDataToWrite) {
              const downloadFolder = path.join(__dirname, '../download');
              if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);
              const zipFilePath = offline
                ? `${downloadFolder}/annotations_${timestamp}.zip`
                : `${dir}/annotations.zip`;
              // create a file to stream archive data to.
              const output = fs.createWriteStream(zipFilePath);
              const archive = archiver('zip', {
                zlib: { level: 9 }, // Sets the compression level.
              });
              // create the archive
              archive
                .directory(`${dir}/annotations`, false)
                .on('error', (err) => reject(new InternalError('Archiving aims', err)))
                .pipe(output);

              output.on('close', () => {
                fastify.log.info(`Created zip in ${zipFilePath}`);
                if (offline) {
                  fs.remove(dir, (error) => {
                    if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                    else fastify.log.info(`${dir} deleted`);
                  });
                  resolve(
                    `${
                      config.prefix ? `/${config.prefix}` : ''
                    }/download/annotations_${timestamp}.zip`
                  );
                } else {
                  const readStream = fs.createReadStream(`${dir}/annotations.zip`);
                  // delete tmp folder after the file is sent
                  readStream.once('end', () => {
                    readStream.destroy(); // make sure stream closed, not close if download aborted.
                    fs.remove(dir, (error) => {
                      if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                      else fastify.log.info(`${dir} deleted`);
                    });
                  });
                  resolve(readStream);
                }
              });
              archive.finalize();
            } else {
              fs.remove(dir, (error) => {
                if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
              reject(
                new InternalError('Downloading aims', new Error('No aim or summary in download'))
              );
            }
          }
        } catch (err) {
          reject(new InternalError('Downloading aims', err));
        }
      })
  );

  fastify.decorate('generateSearchQuery', async (params, epadAuth, filter) => {
    // if filter is query just use that do not generate
    if (filter && filter.query) {
      return filter.query;
    }
    // if new search indexes are added, it should be added here too
    const validQryParams = [
      'patient_name',
      'user',
      'creation_datetime',
      'unknown_creation_date',
      'name',
      'programmed_comment',
      'anatomy',
      'observation',
      'study_date',
      'modality',
      'instance_uid',
    ];
    const qryParts = [];
    // use ' for uids not other ones
    if (params.subject) qryParts.push(`patient_id:"${params.subject}"`);
    if (params.study) qryParts.push(`study_uid:"${params.study}"`);
    if (params.series) qryParts.push(`series_uid:"${params.series}"`);
    else if (params.series === '') qryParts.push(`series_uid:"noseries"`);
    if (fastify.isCollaborator(params.project, epadAuth))
      qryParts.push(`user:"${epadAuth.username}"`);
    if (filter) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, value] of Object.entries(filter)) {
        if (key === 'template') qryParts.push(`template_code:"${value}"`);
        else if (key === 'project') qryParts.push(`project:"${value}"`);
        else if (key === 'aims') qryParts.push(`(${value.join(' OR ')})`);
        else if (validQryParams.includes(key)) qryParts.push(`${key}:${value}`);
      }
    }
    if (params.project) {
      qryParts.push(`project:"${params.project}"`);
    }
    if (!epadAuth.admin) {
      const { collaboratorProjIds, aimAccessProjIds } = await fastify.getAccessibleProjects(
        epadAuth
      );
      if (!params.project) {
        // add collaborator filtering
        const projectFilter = [];
        if (aimAccessProjIds.length > 0)
          projectFilter.push(`project:("${aimAccessProjIds.join('" OR "')}")`);
        if (collaboratorProjIds.length > 0)
          projectFilter.push(
            `(project:"${collaboratorProjIds.join(
              `" AND user:"${epadAuth.username}") OR (project:"`
            )}" AND user:"${epadAuth.username}")`
          );
        if (projectFilter.length > 0) qryParts.push(`( ${projectFilter.join(' OR ')})`);
      }
    }
    if (qryParts.length === 0) return '*:*';
    return qryParts.join(' AND ');
  });

  fastify.decorate(
    'getAimsCouchInternal',
    (db, searchQry, format, bookmark) =>
      new Promise(async (resolve, reject) => {
        const projectNameMap = await fastify.getProjectNameMap();
        const dbFilter = { ...searchQry, bookmark };
        db.search('search', 'aimSearch', dbFilter, async (error, body) => {
          try {
            if (!error) {
              const resObj = { total_rows: body.total_rows, bookmark: body.bookmark };
              const res = [];
              if (format === 'summary') {
                for (let i = 0; i < body.rows.length; i += 1) {
                  // If there is a project in the query, just send that back.
                  // If there is no project in the search, body.rows[i].fields.project might return an array
                  //   and the projectName retrieval from the map would fail.
                  //   We are not handling that situation yet!
                  let projectId = body.rows[i].fields.project;
                  const regex = /(?:project:")(\w+)(?:")/gm;
                  const projectInQry = searchQry.q.match(regex);
                  if (projectInQry && projectInQry[0])
                    projectId = projectInQry[0].split(':')[1].replaceAll('"', '');
                  res.push({
                    aimID: body.rows[i].id,
                    subjectID: body.rows[i].fields.patient_id,
                    studyUID: body.rows[i].fields.study_uid,
                    seriesUID: body.rows[i].fields.series_uid,
                    instanceUID: body.rows[i].fields.instance_uid,
                    instanceOrFrameNumber: 'NA',
                    name: body.rows[i].fields.name,
                    template: body.rows[i].fields.template_code,
                    date: `${body.rows[i].fields.creation_datetime}`,
                    patientName: body.rows[i].fields.patient_name,
                    studyDate: body.rows[i].fields.study_date,
                    comment: body.rows[i].fields.programmed_comment,
                    userComment: body.rows[i].fields.comment,
                    templateType: body.rows[i].fields.template_name,
                    color: 'NA',
                    dsoFrameNo: 'NA',
                    isDicomSR: 'NA',
                    originalSubjectID: body.rows[i].fields.patient_id,
                    userName: Array.isArray(body.rows[i].fields.user)
                      ? body.rows[i].fields.user
                      : [body.rows[i].fields.user],
                    projectID: projectId,
                    projectName: projectNameMap[projectId],
                    modality: body.rows[i].fields.modality,
                    anatomy: body.rows[i].fields.anatomy,
                    observation: body.rows[i].fields.observation,
                    accessionNumber: body.rows[i].fields.accession_number,
                    birthDate: body.rows[i].fields.patient_birth_date,
                    age: body.rows[i].fields.patient_age,
                    sex: body.rows[i].fields.patient_sex,
                    fullName: body.rows[i].fields.user_name,
                    fullNameSorted: body.rows[i].fields.user_name_sorted,
                  });
                }
                resObj.rows = res;
                resolve(resObj);
              } else {
                for (let i = 0; i < body.rows.length; i += 1) {
                  // eslint-disable-next-line no-await-in-loop
                  const aim = await fastify.addAttachmentParts(
                    body.rows[i].doc.aim,
                    body.rows[i].doc._attachments
                  );
                  res.push(aim);
                }
                resObj.rows = res;
                resolve(resObj);
              }
            } else {
              reject(error);
            }
          } catch (err2) {
            reject(new InternalError('Get aims from couch', err2));
          }
        });
      })
  );

  // add accessor methods with decorate
  fastify.decorate(
    'getAimsInternal',
    (format, params, filter, epadAuth, bookmark, request, all = false) =>
      new Promise((resolve, reject) => {
        try {
          if (config.auth && config.auth !== 'none' && epadAuth === undefined)
            reject(new UnauthenticatedError('No epadauth in request'));
          // if there is a project and user has no role in project (public project)
          if (params.project && !fastify.hasRoleInProject(params.project, epadAuth))
            resolve({ total_rows: 0, rows: [] });
          else {
            const db = fastify.couch.db.use(config.db);
            fastify
              .generateSearchQuery(params, epadAuth, filter)
              .then((qry) => {
                const dbFilter = {
                  q: qry,
                  sort: (filter && filter.sort) || '-creation_datetime<string>',
                  limit: 200,
                };
                if (format !== 'summary') {
                  dbFilter.include_docs = true;
                  dbFilter.attachments = true;
                }
                fastify
                  .getAimsCouchInternal(db, dbFilter, format, bookmark)
                  .then((resObj) => {
                    try {
                      if (format === 'stream') {
                        if (resObj.total_rows !== resObj.rows.length) {
                          // get everything and send an email
                          fastify
                            .downloadAims(
                              { aim: 'true', summary: 'true' },
                              resObj,
                              epadAuth,
                              params
                            )
                            .then((result) => {
                              fastify.log.info(`Zip file ready in ${result}`);
                              // get the protocol and hostname from the request
                              const link = `${config.httpsLink ? 'https' : request.protocol}://${
                                request.hostname
                              }${result}`;
                              // send notification and/or email with link
                              if (request)
                                new EpadNotification(request, 'Download ready', link, false).notify(
                                  fastify
                                );
                              if (config.notificationEmail) {
                                fastify.nodemailer.sendMail(
                                  {
                                    from: config.notificationEmail.address,
                                    to: epadAuth.email,
                                    subject: 'ePAD - Download Ready',
                                    html: `Your ePAD download is ready and available <a href='http://${fastify.hostname}${result}'>here</a>. <br> Please download as soon as possible as the system will delete old files automatically. <br> ePAD Team`,
                                  },
                                  (err, info) => {
                                    if (err)
                                      fastify.log.error(
                                        `Download ready for ${result} but could not send email to ${epadAuth.email}. Error: ${err.message}`
                                      );
                                    else
                                      fastify.log.info(
                                        `Email accepted for ${JSON.stringify(info.accepted)}`
                                      );
                                  }
                                );
                              }
                            })
                            .catch((err) => reject(err));
                          resolve({ total_rows: resObj.total_rows });
                        } else {
                          // download aims only
                          fastify
                            .downloadAims({ aim: 'true' }, resObj, epadAuth, params)
                            .then((result) => resolve(result))
                            .catch((err) => reject(err));
                        }
                      } else {
                        fastify
                          .getAllAimPages(resObj, db, dbFilter, format, all)
                          .then((returnResObj) => resolve(returnResObj))
                          .catch((err) =>
                            fastify.log.error(
                              `Could not get all pages for aims. Error: ${err.message}`
                            )
                          );
                      }
                    } catch (err2) {
                      reject(new InternalError('Packing download or sending', err2));
                    }
                  })
                  .catch((error) => reject(error));
              })
              .catch((qryErr) => reject(qryErr));
          }
        } catch (err) {
          reject(new InternalError('Get aims', err));
        }
      })
  );

  fastify.decorate(
    'getAllAimPages',
    (resObj, db, dbFilter, format, all) =>
      new Promise(async (resolve, reject) => {
        try {
          const returnResObj = resObj;
          // get all batches
          let totalAimCount = resObj.rows.length;
          let newBookmark = resObj.bookmark;
          if (all && resObj.total_rows !== resObj.rows.length) {
            fastify.log.info(
              `Get requires time to get ${Math.ceil(
                resObj.total_rows / resObj.rows.length
              )} batches`
            );
            fastify.log.info('Got first batch');
            let i = 2;
            // get batches till we get all aims
            while (totalAimCount < resObj.total_rows) {
              // eslint-disable-next-line no-await-in-loop
              const newResult = await fastify.getAimsCouchInternal(
                db,
                dbFilter,
                format,
                newBookmark
              );
              newBookmark = newResult.bookmark;
              totalAimCount += newResult.rows.length;
              returnResObj.rows.push(...newResult.rows);

              fastify.log.info(`Got batch ${i}`);
              i += 1;
            }
          }
          fastify.log.info(`Resolving ${totalAimCount} aims`);
          resolve(returnResObj);
        } catch (err) {
          reject(new InternalError('Get aims', err));
        }
      })
  );
  // manipulates the input aim
  fastify.decorate('extractAttachmentParts', (aim) => {
    const attachments = [];
    // separate attachments
    if (
      aim.ImageAnnotationCollection &&
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection &&
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection
        .MarkupEntity &&
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection
        .MarkupEntity.length > 1
    ) {
      attachments.push({
        name: 'markupEntityCollection',
        data: Buffer.from(
          JSON.stringify(
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection
          )
        ),
        content_type: 'text/plain',
      });
      // eslint-disable-next-line no-param-reassign
      delete aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
        .markupEntityCollection;
    }
    // if calculations are more than 10 make both calculationEntityCollection and imageAnnotationStatementCollection attachments
    if (
      aim.ImageAnnotationCollection &&
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
        .calculationEntityCollection &&
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].calculationEntityCollection
        .CalculationEntity &&
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].calculationEntityCollection
        .CalculationEntity.length > 10
    ) {
      attachments.push({
        name: 'calculationEntityCollection',
        data: Buffer.from(
          JSON.stringify(
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .calculationEntityCollection
          )
        ),
        content_type: 'text/plain',
      });
      // eslint-disable-next-line no-param-reassign
      delete aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
        .calculationEntityCollection;
      if (
        aim.ImageAnnotationCollection &&
        aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
          .imageAnnotationStatementCollection
      ) {
        attachments.push({
          name: 'imageAnnotationStatementCollection',
          data: Buffer.from(
            JSON.stringify(
              aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .imageAnnotationStatementCollection
            )
          ),
          content_type: 'text/plain',
        });
        // eslint-disable-next-line no-param-reassign
        delete aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
          .imageAnnotationStatementCollection;
      }
    }
    return attachments;
  });

  fastify.decorate('addAttachmentParts', async (aimIn, attachments) => {
    const aim = aimIn;
    if (attachments) {
      const dicomDB = fastify.couch.db.use(config.db);
      if (
        aim.ImageAnnotationCollection &&
        aim.ImageAnnotationCollection.imageAnnotations &&
        aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation &&
        aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.length > 0
      ) {
        if (attachments.markupEntityCollection) {
          if (attachments.markupEntityCollection.data) {
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection = JSON.parse(
              atob(attachments.markupEntityCollection.data).toString()
            );
          } else {
            // retrieve attachment
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection = JSON.parse(
              await dicomDB.attachment.get(
                aim.ImageAnnotationCollection.uniqueIdentifier.root,
                'markupEntityCollection'
              )
            );
          }
        }
        if (attachments.calculationEntityCollection) {
          if (attachments.calculationEntityCollection.data) {
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].calculationEntityCollection = JSON.parse(
              atob(attachments.calculationEntityCollection.data).toString()
            );
          } else {
            // retrieve attachment
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].calculationEntityCollection = JSON.parse(
              await dicomDB.attachment.get(
                aim.ImageAnnotationCollection.uniqueIdentifier.root,
                'calculationEntityCollection'
              )
            );
          }
        }
        if (attachments.imageAnnotationStatementCollection) {
          if (attachments.imageAnnotationStatementCollection.data) {
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageAnnotationStatementCollection = JSON.parse(
              atob(attachments.imageAnnotationStatementCollection.data).toString()
            );
          } else {
            // retrieve attachment
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageAnnotationStatementCollection = JSON.parse(
              await dicomDB.attachment.get(
                aim.ImageAnnotationCollection.uniqueIdentifier.root,
                'imageAnnotationStatementCollection'
              )
            );
          }
        }
      }
    }
    return aim;
  });

  fastify.decorate(
    'isCollaborator',
    (project, epadAuth) =>
      epadAuth &&
      epadAuth.projectToRole &&
      epadAuth.projectToRole.includes(`${project}:Collaborator`)
  );

  fastify.decorate(
    'hasRoleInProject',
    (project, epadAuth) =>
      epadAuth &&
      (epadAuth.admin ||
        (epadAuth.projectToRole &&
          (epadAuth.projectToRole.includes(`${project}:Collaborator`) ||
            epadAuth.projectToRole.includes(`${project}:Member`) ||
            epadAuth.projectToRole.includes(`${project}:Owner`))))
  );

  fastify.decorate('getAims', async (request, reply) => {
    try {
      const result = await fastify.getAimsInternal(
        request.query.format,
        request.params,
        undefined,
        request.epadAuth,
        request.query.bookmark,
        request
      );
      if (request.query.format === 'stream') {
        reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
      }
      reply.code(200).send(result);
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.decorate(
    'getAimsFromUIDsInternal',
    (query, body) =>
      new Promise((resolve, reject) => {
        try {
          if (query.summary === undefined && query.aim === undefined && query.seg === undefined) {
            reject(
              new BadRequestError(
                'Getting aims with uids',
                new Error("Query params shouldn't be empty")
              )
            );
          } else {
            const db = fastify.couch.db.use(config.db);

            db.fetch({ keys: body }, { attachments: true }).then(async (data) => {
              const res = [];
              for (let i = 0; i < data.rows.length; i += 1) {
                // if not found it returns the record with no doc, error: 'not_found'
                if (data.rows[i].doc && data.rows[i].doc.aim) {
                  // eslint-disable-next-line no-await-in-loop
                  const aim = await fastify.addAttachmentParts(
                    data.rows[i].doc.aim,
                    data.rows[i].doc._attachments
                  );
                  res.push(aim);
                }
              }
              resolve(res);
            });
          }
        } catch (err) {
          reject(new InternalError('Getting aims with uids', err));
        }
      })
  );

  fastify.decorate('getAimsFromUIDs', (request, reply) => {
    fastify
      .getAimsFromUIDsInternal(request.query, request.body)
      .then((res) => {
        fastify
          .downloadAims(
            request.query,
            {
              total_rows: res.length,
              rows: res,
            },
            request.epadAuth
          )
          .then((result) => {
            reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
            reply.code(200).send(result);
          })
          .catch((err) => reply.send(err));
      })
      .catch((err) => reply.send(err));
  });

  fastify.decorate('copyAimsWithUIDs', (request, reply) => {
    // we are trying to copy aims, we need only the aims. no need to get query from user
    // will not copy the segmentation. will create another aim referencing to the same DSO
    fastify
      .getAimsFromUIDsInternal({ aim: true }, request.body)
      .then(async (res) => {
        const studyUIDs = [];
        for (let i = 0; i < res.length; i += 1) {
          const aim = res[i];
          const studyUID =
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root;
          const patientID = aim.ImageAnnotationCollection.person.id.value;
          const params = { project: request.params.project, subject: patientID, study: studyUID };
          // put the study in the project if it's not already been put
          if (!studyUIDs.includes(studyUID)) {
            // eslint-disable-next-line no-await-in-loop
            await fastify.addPatientStudyToProjectInternal(params, request.epadAuth);
            studyUIDs.push(studyUID);
            // copy significant series if teaching file
            if (
              aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code ===
              config.teachingTemplate
            ) {
              fastify.copySignificantSeries(
                studyUID,
                request.params.project,
                request.params.fromproject
              );
            }
          }
          // create a copy the aim with a new uid
          aim.ImageAnnotationCollection.uniqueIdentifier.root = fastify.generateUidInternal();
          aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].uniqueIdentifier.root = fastify.generateUidInternal();

          // if aim has a segmentation, create  copy of the segmentation and update the references in the aim
          const segEntity =
            aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .segmentationEntityCollection;
          // this is a segmentation aim
          if (segEntity) {
            const dsoParams = {
              project: request.params.project,
              subject: patientID,
              study: studyUID,
              series: segEntity.SegmentationEntity[0].seriesInstanceUid.root,
            };
            // eslint-disable-next-line no-await-in-loop
            const [segPart] = await fastify.getSeriesWadoMultipart(dsoParams);
            if (segPart) {
              const seg = dcmjs.data.DicomMessage.readFile(segPart);
              const seriesUID = fastify.generateUidInternal();
              const instanceUID = fastify.generateUidInternal();
              const ds = dcmjs.data.DicomMetaDictionary.naturalizeDataset(seg.dict);
              ds.SeriesInstanceUID = seriesUID;
              ds.SOPInstanceUID = instanceUID;
              ds.MediaStorageSOPInstanceUID = instanceUID;
              // save the updated DSO
              seg.dict = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(ds);
              const buffer = seg.write();
              const { data, boundary } = dcmjs.utilities.message.multipartEncode([
                toArrayBuffer(buffer),
              ]);
              // eslint-disable-next-line no-await-in-loop
              await fastify.saveDicomsInternal(data, boundary);
              // update the aim
              aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection.SegmentationEntity[0].seriesInstanceUid.root = seriesUID;
              aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection.SegmentationEntity[0].sopInstanceUid.root = instanceUID;
            }
          }
          // add the new aim to the project
          // eslint-disable-next-line no-await-in-loop
          await fastify.saveAimJsonWithProjectRef(aim, params, request.epadAuth);
        }
        reply
          .code(200)
          .send(
            `Copied aim uids ${request.body.join(',')} and added study uids ${studyUIDs.join(
              ','
            )} to project ${request.params.project}`
          );
      })
      .catch((err) => {
        reply.send(err);
      });
  });

  fastify.decorate('addWithAimsUIDsToWorklist', (request, reply) => {
    fastify
      .getAimsInternal('summary', {}, { aims: request.body }, request.epadAuth)
      .then(async (res) => {
        const studyUIDs = [];
        for (let i = 0; i < res.rows.length; i += 1) {
          const { studyUID, subjectID, projectID } = res.rows[i];
          // add the new aim to the project
          // eslint-disable-next-line no-await-in-loop
          await fastify.assignStudyToWorklistInternal(
            {},
            {
              subject: subjectID,
              study: studyUID,
              project: projectID,
              worklist: request.params.worklist,
            },
            request.epadAuth
          );
          studyUIDs.push(studyUID);
        }
        if (studyUIDs.length === 0)
          reply.send(
            new InternalError(
              'Adding studies to worklist using aimUIDs',
              new Error(`Couldn't retrieve aims for ${JSON.stringify(request.body)}`)
            )
          );
        else
          reply
            .code(200)
            .send(
              `Added aim uids ${request.body.join(',')} and study uids ${studyUIDs.join(
                ','
              )} to worklist ${request.params.worklist}`
            );
      })
      .catch((err) => {
        reply.send(err);
      });
  });

  fastify.decorate('saveAim', (request, reply) => {
    // get the uid from the json and check if it is same with param, then put as id in couch document
    if (
      request.params.aimuid &&
      request.params.aimuid !== request.body.ImageAnnotationCollection.uniqueIdentifier.root
    ) {
      reply.send(
        new BadRequestError(
          'Saving aim',
          new Error(
            `Conflicting aimuids: the uid sent in the url ${request.params.aimUid} should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root ${request.body.ImageAnnotationCollection.uniqueIdentifier.root}`
          )
        )
      );
    }
    fastify
      .saveAimInternal(request.body)
      .then(() => {
        reply.code(200).send('Saving successful');
      })
      .catch((err) => {
        reply.send(err);
      });
  });

  fastify.decorate(
    'getAimVersionChangesBulk',
    (aimuids) =>
      new Promise(async (resolve, reject) => {
        try {
          const db = fastify.couch.db.use(config.db);
          const header = [
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
            { id: 'dsoSeriesUid', title: 'DSO_Series_UID' },
            { id: 'studyUid', title: 'Study_UID' },
            { id: 'seriesUid', title: 'Series_UID' },
            { id: 'imageUid', title: 'Image_UID' },
            { id: 'changes', title: 'Markup_Changes' },
          ];
          const rows = [];
          const data = await db.fetch({ keys: aimuids }, { attachments: true });
          if (data.rows.length > 0) {
            for (let i = 0; i < data.rows.length; i += 1) {
              if (!data.rows[i].error) {
                let existing = data.rows[i].doc;
                if (data.rows[i].value && data.rows[i].value.deleted) {
                  // making two calls to couchdb, couldn't find another way to fill all
                  // if performance is an issue, we can get it from the db, but there won't be name, comment, etc.
                  // eslint-disable-next-line no-await-in-loop
                  const revisionsDoc = await db.get(data.rows[i].id, {
                    revs: true,
                    open_revs: 'all',
                  });
                  const prevRev = `${revisionsDoc[0].ok._revisions.start - 1}-${
                    revisionsDoc[0].ok._revisions.ids[1]
                  }`;
                  // eslint-disable-next-line no-await-in-loop
                  existing = await db.get(data.rows[i].id, { rev: prevRev });
                }
                let { aim } = existing;
                let prevAim;
                if (existing._attachments) {
                  const currentAttachments = {
                    markupEntityCollection: existing._attachments.markupEntityCollection,
                    calculationEntityCollection: existing._attachments.calculationEntityCollection,
                    imageAnnotationStatementCollection:
                      existing._attachments.imageAnnotationStatementCollection,
                  };
                  // eslint-disable-next-line no-await-in-loop
                  aim = await fastify.addAttachmentParts(existing.aim, currentAttachments);

                  if (existing._attachments.prevAim && !data.rows[i].value.deleted) {
                    const prevAimJson = JSON.parse(
                      atob(existing._attachments.prevAim.data).toString()
                    );
                    const prevAttachments = {
                      markupEntityCollection: existing._attachments.prevmarkupEntityCollection,
                      calculationEntityCollection:
                        existing._attachments.prevcalculationEntityCollection,
                      imageAnnotationStatementCollection:
                        existing._attachments.previmageAnnotationStatementCollection,
                    };
                    // eslint-disable-next-line no-await-in-loop
                    prevAim = await fastify.addAttachmentParts(prevAimJson, prevAttachments);
                  }
                }
                const imageAnnotations =
                  aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation;

                imageAnnotations.forEach((imageAnnotation) => {
                  // handle no comment
                  const commentSplit =
                    imageAnnotation.comment && imageAnnotation.comment.value
                      ? imageAnnotation.comment.value.split('~~')
                      : [''];
                  const aimDate = fastify.fixAimDate(imageAnnotation.dateTime.value);
                  const row = {
                    aimUid: aim.ImageAnnotationCollection.uniqueIdentifier.root,
                    date: aimDate.toString(),
                    patientName: aim.ImageAnnotationCollection.person.name.value,
                    patientId: aim.ImageAnnotationCollection.person.id.value,
                    reviewer: fastify.getAuthorUsernameString(aim),
                    reviewerNames: fastify.getAuthorNameString(aim),
                    name: imageAnnotation.name.value.split('~')[0],
                    comment: commentSplit[0],
                    userComment: commentSplit.length > 1 ? commentSplit[1] : '',
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
                    changes: data.rows[i].value.deleted
                      ? 'Deleted'
                      : fastify.getChanges(aim, prevAim),
                  };

                  rows.push(row);
                });
              }
            }
          }
          resolve({ header, data: rows });
        } catch (err) {
          reject(new InternalError('Exporting changes with uids', err));
        }
      })
  );

  fastify.decorate('getAimVersionChangesAimUIDs', (request, reply) => {
    fastify
      .getAimVersionChangesBulk(request.body)
      .then(({ header, data }) => {
        if (request.query.rawData === 'true') {
          reply.code(200).send({ header, data });
        } else {
          const filename = path.join('/tmp', `summary${new Date().getTime()}.csv`);
          const csvWriter = createCsvWriter({
            path: filename,
            header,
          });
          csvWriter.writeRecords(data).then(() => {
            fastify.log.info('The export CSV file was written successfully');
            const buffer = fs.readFileSync(filename);
            fs.remove(filename, (error) => {
              if (error) {
                fastify.log.info(`${filename} export csv file deletion error ${error.message}`);
              } else {
                fastify.log.info(`${filename} export csv deleted`);
              }
            });
            reply.header('Content-Disposition', `attachment; filename=changes.csv`);
            reply.code(200).send(buffer);
          });
        }
      })
      .catch((err) => reply.send(new InternalError('Export changes', err)));
  });

  fastify.decorate('getAimVersionChangesProject', (request, reply) => {
    const db = fastify.couch.db.use(config.db);
    // get the deleted aims first
    fastify.getDeletedAimsDB(request.params.project).then((dbAims) => {
      const deletedAims = dbAims.map((ae) => ae.dataValues.aim_uid);
      const dbFilter = {
        q: `project: ${request.params.project}`,
        deleted: true,
        sort: '-creation_datetime<string>',
        limit: 200,
      };
      db.search('search', 'aimSearch', dbFilter, (error, body) => {
        if (!error) {
          const aimuids = deletedAims;
          for (let i = 0; i < body.rows.length; i += 1) {
            aimuids.push(body.rows[i].id);
          }
          fastify
            .getAimVersionChangesBulk(aimuids)
            .then(({ header, data }) => {
              if (request.query.rawData === 'true') {
                reply.code(200).send({ header, data });
              } else {
                const filename = path.join('/tmp', `summary${new Date().getTime()}.csv`);
                const csvWriter = createCsvWriter({
                  path: filename,
                  header,
                });
                csvWriter.writeRecords(data).then(() => {
                  fastify.log.info('The export CSV file was written successfully');
                  const buffer = fs.readFileSync(filename);
                  fs.remove(filename, (err) => {
                    if (err) {
                      fastify.log.info(`${filename} export csv file deletion error ${err.message}`);
                    } else {
                      fastify.log.info(`${filename} export csv deleted`);
                    }
                  });
                  reply.header('Content-Disposition', `attachment; filename=changes.csv`);
                  reply.code(200).send(buffer);
                });
              }
            })
            .catch((err) => reply.send(new InternalError('Export changes', err)));
        } else {
          reply.send(new InternalError('Export changes', error));
        }
      });
    });
  });

  fastify.decorate('getMarkupText', (aim) => {
    const currentShapes = aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection.MarkupEntity.map(
      (mu) => {
        const coordinates = mu.twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate.map(
          (coor) => `${coor.x.value} ${coor.y.value}`
        );
        return `(${coordinates.join(';')})`;
      }
    );
    return `[${currentShapes.join('|')}]`;
  });

  fastify.decorate('getChanges', (currentAim, prevAim) => {
    try {
      if (!prevAim) return 'No change';
      return `Current shape: ${fastify.getMarkupText(
        currentAim
      )} Old shape: ${fastify.getMarkupText(prevAim)}`;
    } catch (err) {
      return err.message;
    }
  });

  fastify.decorate(
    'getAimVersions',
    (aimID) =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.fetch({ keys: [aimID] }, { attachments: true })
          .then(async (data) => {
            if (data.rows.length > 0 && !data.rows[0].error) {
              const existing = data.rows[0].doc;
              const currentAttachments = {
                markupEntityCollection: existing._attachments.markupEntityCollection,
                calculationEntityCollection: existing._attachments.calculationEntityCollection,
                imageAnnotationStatementCollection:
                  existing._attachments.imageAnnotationStatementCollection,
              };
              const currentAim = await fastify.addAttachmentParts(existing.aim, currentAttachments);
              let prevAim;
              if (existing._attachments.prevAim) {
                const prevAimJson = JSON.parse(atob(existing._attachments.prevAim.data).toString());
                const prevAttachments = {
                  markupEntityCollection: existing._attachments.prevmarkupEntityCollection,
                  calculationEntityCollection:
                    existing._attachments.prevcalculationEntityCollection,
                  imageAnnotationStatementCollection:
                    existing._attachments.previmageAnnotationStatementCollection,
                };
                prevAim = await fastify.addAttachmentParts(prevAimJson, prevAttachments);
              }
              resolve([currentAim, prevAim]);
            }
          })
          .catch((err) => reject(err));
      })
  );

  // if aim is string, it is aimuid and the call is being made to update the projects (it can be from delete which sends removeProject = true)
  fastify.decorate(
    'saveAimInternal',
    (aimIn, projectId, removeProject) =>
      new Promise((resolve, reject) => {
        const aim = aimIn;
        const couchDoc =
          typeof aim !== 'string'
            ? {
                _id: aim.ImageAnnotationCollection.uniqueIdentifier.root,
                aim,
              }
            : {
                _id: aim,
              };
        let attachments = typeof aim !== 'string' ? fastify.extractAttachmentParts(aim) : [];
        const db = fastify.couch.db.use(config.db);

        db.fetch({ keys: [couchDoc._id] }, { attachments: true }).then((data) => {
          if (data.rows.length > 0 && !data.rows[0].error && !data.rows[0].value.deleted) {
            const existing = data.rows[0].doc;
            // for updating project
            if (typeof aim === 'string') {
              couchDoc.aim = existing.aim;
            }
            couchDoc._rev = existing._rev;
            if (existing.projects) {
              couchDoc.projects = existing.projects;
            }
            fastify.log.info(`Updating document for aimuid ${couchDoc._id}`);
            // if the method was called with just aimuid use the attachments on couchdb
            if (existing._attachments && typeof aim === 'string' && attachments === [])
              attachments = existing._attachments;
            // auditLog is for aim changes, if input is just aimUID only project changes. no auditlog for now
            if (config.auditLog === true && existing.aim && typeof aim !== 'string') {
              // add the old version to the couchdoc
              // add old aim
              attachments.push({
                name: 'prevAim',
                data: Buffer.from(JSON.stringify(existing.aim)),
                content_type: 'text/plain',
              });
              // add old aim attachments
              if (existing._attachments) {
                Object.keys(existing._attachments).forEach((key) => {
                  if (!key.startsWith('prev') && existing._attachments[key].data) {
                    attachments.push({
                      name: `prev${key}`,
                      data: Buffer.from(atob(existing._attachments[key].data).toString()),
                      content_type: 'text/plain',
                    });
                  }
                });
              }
              // should we also add the older versions of the document?? (leaving for now)
            }
          }
          if (projectId) {
            if (removeProject) {
              if (couchDoc.projects) {
                couchDoc.projects = couchDoc.projects.filter((project) => project !== projectId);
              }
            } else if (couchDoc.projects) {
              if (!couchDoc.projects.includes(projectId)) couchDoc.projects.push(projectId);
            } else couchDoc.projects = [projectId];
          }
          if (attachments && attachments.length > 0)
            db.multipart
              .insert(couchDoc, attachments, couchDoc._id)
              .then(() => {
                // await fastify.getAimVersions(couchDoc._id);
                resolve(`Aim ${couchDoc._id} is saved successfully`);
              })
              .catch((err) => {
                reject(new InternalError(`Saving aim ${couchDoc._id} to couchdb`, err));
              });
          else
            db.insert(couchDoc, couchDoc._id)
              .then(() => {
                // await fastify.getAimVersions(couchDoc._id);
                resolve(`Aim ${couchDoc._id} is saved successfully`);
              })
              .catch((err) => {
                reject(new InternalError(`Saving aim ${couchDoc._id} to couchdb`, err));
              });
        });
      })
  );

  fastify.decorate(
    'addProjectIdsToAimsInternal',
    (aimsWithProjects) =>
      new Promise(async (resolve, reject) => {
        let editCount = 0;
        try {
          const db = fastify.couch.db.use(config.db);
          const aimsNotSaved = [];
          for (let i = 0; i < aimsWithProjects.length; i += 1) {
            try {
              let noChange = false;
              // eslint-disable-next-line no-await-in-loop
              const couchDoc = await db.get(aimsWithProjects[i].aim);
              if (couchDoc.projects) {
                if (!couchDoc.projects.includes(aimsWithProjects[i].project))
                  couchDoc.projects.push(aimsWithProjects[i].project);
                else noChange = true;
              }
              couchDoc.projects = [aimsWithProjects[i].project];

              fastify.log.info(
                `Adding project ${aimsWithProjects[i].project} to aimuid ${aimsWithProjects[i].aim}`
              );
              const attachments = fastify.extractAttachmentParts(couchDoc.aim);
              if (attachments && attachments.length > 0) {
                // eslint-disable-next-line no-await-in-loop
                await db.multipart.insert(couchDoc, attachments, aimsWithProjects[i].aim);
                fastify.log.info(
                  `Added project ${aimsWithProjects[i].project} to aimuid ${aimsWithProjects[i].aim} with attachments`
                );
              } else if (!noChange) {
                // eslint-disable-next-line no-await-in-loop
                await db.insert(couchDoc, aimsWithProjects[i].aim);
                fastify.log.info(
                  `Added project ${aimsWithProjects[i].project} to aimuid ${aimsWithProjects[i].aim}`
                );
              } else {
                fastify.log.info(`No update for aimuid ${aimsWithProjects[i].aim}`);
              }

              editCount += 1;
            } catch (err) {
              fastify.log.error(`Error in saving aim ${aimsWithProjects[i].aim} to couchdb`, err);
              aimsNotSaved.push(aimsWithProjects[i]);
            }
          }
          if (aimsNotSaved.length > 0)
            fastify.log.warn(
              `${aimsNotSaved.length} aims not saved ${JSON.stringify(aimsNotSaved)}`
            );
          fastify.log.info(`Edited ${editCount} aims`);
          resolve();
        } catch (err) {
          reject(
            new InternalError(
              `Failed adding project ids to aims. Edited ${editCount} of ${aimsWithProjects.length} in process`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'deleteAimInternal',
    (aimuid) =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.get(aimuid, async (error, existing) => {
          if (error || !existing) {
            reject(new ResourceNotFoundError('Aim', aimuid));
          }
          const promisses = [];
          if (existing.aim) {
            // check if it is a segmentation aim and delete dso
            const segEntity =
              existing.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .segmentationEntityCollection;
            // this is a segmentation aim
            if (segEntity) {
              // check if there are any other aims pointing to the DSO
              // do we need to if we will always have only one aim pointing to the seg? what if in another project
              // eslint-disable-next-line no-await-in-loop
              const existingAim = await fastify.checkProjectSegAimExistence(
                segEntity.SegmentationEntity[0].seriesInstanceUid.root,
                undefined,
                aimuid
              );
              if (!existingAim) {
                const params = {
                  study: segEntity.SegmentationEntity[0].studyInstanceUid.root,
                  series: segEntity.SegmentationEntity[0].seriesInstanceUid.root,
                };
                promisses.push(fastify.deleteSeriesDicomsInternal(params));
              } else
                fastify.log.warn(
                  `In aim system delete, Aim ${aimuid} refers to a segmentation with DSO Series UID ${segEntity.SegmentationEntity[0].seriesInstanceUid.root}. However, the DSO is referred by another aim ${existingAim}. It won't be deleted from the system`
                );
            }
          }

          promisses.push(db.destroy(aimuid, existing._rev));
          Promise.all(promisses)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              reject(new InternalError(`Deleting aim ${aimuid}`, err));
            });
        });
      })
  );

  fastify.decorate('deleteAim', (request, reply) => {
    fastify
      .deleteAimInternal(request.params.aimuid)
      .then(() => reply.code(200).send('Deletion successful'))
      .catch((err) => {
        if (err instanceof ResourceNotFoundError)
          reply.send(new BadRequestError('Deleting aim', err));
        else reply.send(err);
      });
  });

  fastify.decorate(
    'getTemplateInternal',
    (codeValue, format = 'json') =>
      new Promise((resolve, reject) => {
        try {
          let view = 'templates_json';
          if (format) {
            if (format === 'json') view = 'templates_json';
            else if (format === 'summary') view = 'templates_summary';
          }
          const db = fastify.couch.db.use(config.db);
          db.view(
            'instances',
            view,
            {
              startkey: [codeValue, '', ''],
              endkey: [`${codeValue}\u9999`, '{}', '{}'],
              reduce: true,
              group_level: 3,
            },
            (error, body) => {
              if (!error) {
                const res = [];
                if (body.rows.length > 1)
                  fastify.log.warn(
                    `Expecting one value but got ${body.rows.length}. Returning first`
                  );
                if (format === 'summary') {
                  body.rows.forEach((template) => {
                    res.push(template.key[2]);
                  });
                  resolve(res[0]);
                } else if (format === 'stream') {
                  body.rows.forEach((template) => {
                    res.push(template.key[2]);
                  });
                  fastify
                    .downloadTemplates(res)
                    .then((result) => resolve(result[0]))
                    .catch((err) => reject(err));
                } else {
                  // the default is json! The old APIs were XML, no XML in epadlite
                  body.rows.forEach((template) => {
                    res.push(template.key[2]);
                  });
                  resolve(res[0]);
                }
              } else {
                reject(new InternalError('Getting templates from couchdb', error));
              }
            }
          );
        } catch (err) {
          reject(new InternalError('Getting templates', err));
        }
      })
  );

  fastify.decorate(
    'getTemplatesInternal',
    (query) =>
      new Promise((resolve, reject) => {
        try {
          let type;
          let format = 'json';
          // eslint-disable-next-line prefer-destructuring
          if (query.type) type = query.type.toLowerCase();
          if (query.format) format = query.format.toLowerCase();
          let view = 'templates_json';
          if (format) {
            if (format === 'json') view = 'templates_json';
            else if (format === 'summary') view = 'templates_summary';
          }
          let filter = { reduce: true, group_level: 3 };
          if (type)
            filter = {
              ...filter,
              ...{ startkey: [type, '', ''], endkey: [`${type}\u9999`, '{}', '{}'] },
            };
          const db = fastify.couch.db.use(config.db);
          db.view('instances', view, filter, (error, body) => {
            if (!error) {
              const res = [];
              // lets filter only the emit values starting with template type (as view emits 2 for each doc)
              const validTempateTypes = ['image', 'series', 'study'];
              if (format === 'summary') {
                body.rows.forEach((template) => {
                  if (validTempateTypes.includes(template.key[0])) res.push(template.key[2]);
                });
                resolve(res);
              } else if (format === 'stream') {
                body.rows.forEach((template) => {
                  if (validTempateTypes.includes(template.key[0])) res.push(template.key[2]);
                });
                fastify
                  .downloadTemplates(res)
                  .then((result) => resolve(result))
                  .catch((err) => reject(err));
              } else {
                // the default is json! The old APIs were XML, no XML in epadlite
                body.rows.forEach((template) => {
                  if (validTempateTypes.includes(template.key[0])) res.push(template.key[2]);
                });
                resolve(res);
              }
            } else {
              reject(new InternalError('Getting templates from couchdb', error));
            }
          });
        } catch (err) {
          reject(new InternalError('Getting templates', err));
        }
      })
  );

  fastify.decorate('saveTemplate', (request, reply) => {
    // get the uid from the json and check if it is same with param, then put as id in couch document
    if (request.params.uid && request.params.uid !== request.body.TemplateContainer.uid) {
      reply.send(
        new BadRequestError(
          `Saving template`,
          new Error(
            `Conflicting uids: the uid sent in the url ${request.params.uid} should be the same with request.body.TemplateContainer.uid ${request.body.TemplateContainer.uid}`
          )
        )
      );
    } else {
      fastify
        .saveTemplateInternal(request.body)
        .then(() => {
          reply.code(200).send('Saving successful');
        })
        .catch((err) => {
          reply.send(err);
        });
    }
  });

  fastify.decorate(
    'saveTemplateInternal',
    (template) =>
      new Promise((resolve, reject) => {
        const couchDoc = {
          _id: template.TemplateContainer.uid,
          template,
        };
        const db = fastify.couch.db.use(config.db);
        db.get(couchDoc._id, (error, existing) => {
          if (!error) {
            couchDoc._rev = existing._rev;
            fastify.log.info(`Updating document for uid ${couchDoc._id}`);
          }

          db.insert(couchDoc, couchDoc._id)
            .then(() => {
              resolve(`Template ${couchDoc._id} is saved successfully`);
            })
            .catch((err) => {
              reject(new InternalError(`Saving template ${couchDoc._id} to couchdb`, err));
            });
        });
      })
  );

  fastify.decorate(
    'deleteTemplateInternal',
    (params) =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.get(params.uid, (error, existing) => {
          if (error) {
            reject(new ResourceNotFoundError('Template', params.uid));
          }

          db.destroy(params.uid, existing._rev)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              reject(new InternalError(`Deleting template ${params.uid}`, err));
            });
        });
      })
  );

  fastify.decorate(
    'downloadTemplates',
    (templates) =>
      new Promise((resolve, reject) => {
        try {
          const timestamp = new Date().getTime();
          const dir = `/tmp/tmp_${timestamp}`;
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;

          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            fs.mkdirSync(`${dir}/templates`);

            templates.forEach((template) => {
              fs.writeFileSync(
                `${dir}/templates/${template.TemplateContainer.Template[0].codeValue}_${template.TemplateContainer.uid}.json`,
                JSON.stringify(template)
              );
              isThereDataToWrite = true;
            });
          }
          if (isThereDataToWrite) {
            // create a file to stream archive data to.
            const output = fs.createWriteStream(`${dir}/templates.zip`);
            const archive = archiver('zip', {
              zlib: { level: 9 }, // Sets the compression level.
            });
            // create the archive
            archive
              .directory(`${dir}/templates`, false)
              .on('error', (err) => reject(new InternalError('Archiving templates', err)))
              .pipe(output);

            output.on('close', () => {
              fastify.log.info(`Created zip in ${dir}`);
              const readStream = fs.createReadStream(`${dir}/templates.zip`);
              // delete tmp folder after the file is sent
              readStream.once('end', () => {
                readStream.destroy(); // make sure stream closed, not close if download aborted.
                fs.remove(dir, (error) => {
                  if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                  else fastify.log.info(`${dir} deleted`);
                });
              });
              resolve(readStream);
            });
            archive.finalize();
          } else {
            fs.remove(dir, (error) => {
              if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
              else fastify.log.info(`${dir} deleted`);
            });
            reject(
              new InternalError('Downloading templates', new Error('No template in download'))
            );
          }
        } catch (err) {
          reject(new InternalError('Downloading templates', err));
        }
      })
  );

  fastify.decorate('getTemplatesFromUIDs', (request, reply) => {
    try {
      const db = fastify.couch.db.use(config.db);
      const res = [];
      db.fetch({ keys: request.body }).then((data) => {
        data.rows.forEach((item) => {
          // if not found it returns the record with no doc, error: 'not_found'
          if (item.doc) res.push(item.doc.template);
        });
        reply.header('Content-Disposition', `attachment; filename=templates.zip`);
        fastify
          .downloadTemplates(res)
          .then((result) => reply.code(200).send(result))
          .catch((err) => reply.send(err));
      });
    } catch (err) {
      reply.send(new InternalError('Getting templates with uids', err));
    }
  });

  fastify.decorate('getTemplate', (request, reply) => {
    try {
      const db = fastify.couch.db.use(config.db);
      db.get(request.params.uid).then((doc) => {
        reply.code(200).send(doc.template);
      });
    } catch (err) {
      reply.send(new InternalError('Getting templates with uids', err));
    }
  });

  fastify.decorate('getSummaryFromTemplate', (docTemplate) => {
    // this is basically what we have in the templates_summary view
    const summary = {};
    summary.containerUID = docTemplate.TemplateContainer.uid;
    summary.containerName = docTemplate.TemplateContainer.name;
    summary.containerDescription = docTemplate.TemplateContainer.description;
    summary.containerVersion = docTemplate.TemplateContainer.version;
    summary.containerAuthors = docTemplate.TemplateContainer.authors;
    summary.containerCreationDate = docTemplate.TemplateContainer.creationDate;
    const template = {
      type: 'image',
    };
    if (docTemplate.TemplateContainer.Template[0].templateType)
      template.type = docTemplate.TemplateContainer.Template[0].templateType.toLowerCase();
    template.templateName = docTemplate.TemplateContainer.Template[0].name;
    template.templateDescription = docTemplate.TemplateContainer.Template[0].description;
    template.templateUID = docTemplate.TemplateContainer.uid;
    template.templateCodeValue = docTemplate.TemplateContainer.Template[0].codeValue;
    template.templateCodeMeaning = docTemplate.TemplateContainer.Template[0].codeMeaning;
    template.templateVersion = docTemplate.TemplateContainer.Template[0].version;
    template.templateAuthors = docTemplate.TemplateContainer.Template[0].authors;
    template.templateCreationDate = docTemplate.TemplateContainer.Template[0].creationDate;
    summary.Template = [template];
    return summary;
  });

  // used to filter by project and handles the summary extraction itself
  fastify.decorate(
    'getTemplatesFromUIDsInternal',
    (query, ids) =>
      new Promise((resolve, reject) => {
        try {
          let format = 'json';
          if (query.format) format = query.format.toLowerCase();

          const db = fastify.couch.db.use(config.db);
          const res = [];
          db.fetch({ keys: ids }).then((data) => {
            if (format === 'summary') {
              data.rows.forEach((item) => {
                if (item.doc) {
                  const summary = fastify.getSummaryFromTemplate(item.doc.template);
                  res.push(summary);
                }
              });
              resolve(res);
            } else if (format === 'stream') {
              data.rows.forEach((item) => {
                if (item.doc) res.push(item.doc.template);
              });
              fastify
                .downloadTemplates(res)
                .then((result) => resolve(result))
                .catch((err) => reject(err));
            } else {
              // the default is json! The old APIs were XML, no XML in epadlite
              data.rows.forEach((item) => {
                if (item.doc) res.push(item.doc.template);
              });
              resolve(res);
            }
          });
        } catch (err) {
          reject(new InternalError('Getting templates with uids and summary extraction', err));
        }
      })
  );

  fastify.decorate('getAim', (request, reply) => {
    fastify
      .getAimsInternal(
        request.query.format,
        request.params,
        { aims: [request.params.aimuid] },
        request.epadAuth
      )
      .then((result) => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
        }
        if (result.rows.length === 1) reply.code(200).send(result.rows[0]);
        else {
          reply.send(new ResourceNotFoundError('Aim', request.params.aimuid));
        }
      })
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'saveOtherFileInternal',
    (filename, fileInfo, buffer) =>
      new Promise((resolve, reject) => {
        const couchDoc = {
          _id: fileInfo.name,
          fileInfo,
        };
        const fileAttach = {
          name: filename,
          data: buffer,
          content_type: '',
        };
        const db = fastify.couch.db.use(config.db);
        db.get(couchDoc._id, (error, existing) => {
          if (!error) {
            couchDoc._rev = existing._rev;
            fastify.log.info(`Updating document for file ${couchDoc._id}`);
          }

          db.multipart
            .insert(couchDoc, [fileAttach], couchDoc._id)
            .then(() => {
              resolve(`File ${filename} is saved successfully`);
            })
            .catch((err) => {
              reject(new InternalError('Saving file to couchdb', err));
            });
        });
      })
  );

  fastify.decorate(
    'filterFiles',
    (ids, filter) =>
      new Promise((resolve, reject) => {
        try {
          const db = fastify.couch.db.use(config.db);
          const filteredIds = [];
          db.fetch({ keys: ids }).then((data) => {
            data.rows.forEach((item) => {
              if (
                item &&
                item.doc &&
                item.doc.fileInfo &&
                (filter.subject === undefined ||
                  item.doc.fileInfo.subject_uid === filter.subject) &&
                (filter.study === undefined || item.doc.fileInfo.study_uid === filter.study) &&
                (filter.series === undefined || item.doc.fileInfo.series_uid === filter.series)
              )
                filteredIds.push(item.id);
            });
            resolve(filteredIds);
          });
        } catch (err) {
          reject(new InternalError('Filtering files', err));
        }
      })
  );

  fastify.decorate(
    'getFilesFromUIDsInternal',
    (query, ids, filter, subDir, archive) =>
      new Promise(async (resolve, reject) => {
        try {
          let format = 'json';
          if (query.format) format = query.format.toLowerCase();
          let filteredIds = ids;
          if (filter) filteredIds = await fastify.filterFiles(ids, filter);
          const db = fastify.couch.db.use(config.db);
          const res = [];
          if (format === 'json') {
            db.fetch({ keys: filteredIds }).then((data) => {
              data.rows.forEach((item) => {
                if ('doc' in item) res.push(item.doc.fileInfo);
              });
              resolve(res);
            });
          } else if (format === 'stream') {
            fastify
              .downloadFiles(filteredIds, subDir, archive)
              .then((result) => resolve(result))
              .catch((err) => reject(err));
          }
        } catch (err) {
          reject(new InternalError('Getting files with uids', err));
        }
      })
  );

  fastify.decorate('getFilter', (params, length = 5) => {
    const startKey = [];
    const endKey = [];
    let isFiltered = false;
    if (params.subject) {
      startKey.push(params.subject);
      endKey.push(params.subject);
      if (params.study) {
        startKey.push(params.study);
        endKey.push(params.study);
        if (params.series) {
          startKey.push(params.series);
          endKey.push(params.series);
        }
      }
      isFiltered = true;
    }

    for (let i = endKey.length; i < length; i += 1) endKey.push({});
    if (isFiltered) {
      return {
        startkey: startKey,
        endkey: endKey,
      };
    }

    return {};
  });

  fastify.decorate(
    'getFilesInternal',
    (query, params, subDir) =>
      new Promise((resolve, reject) => {
        try {
          let format = 'json';
          if (query.format) format = query.format.toLowerCase();
          const filter = fastify.getFilter(params);
          const view = 'files';
          const db = fastify.couch.db.use(config.db);
          db.view(
            'instances',
            view,
            {
              ...filter,
              reduce: true,
              group_level: 5,
            },
            (error, body) => {
              if (!error) {
                const res = [];
                if (format === 'stream') {
                  body.rows.forEach((file) => {
                    res.push(file.key[3]);
                  });
                  fastify
                    .downloadFiles(res, subDir)
                    .then((result) => resolve(result))
                    .catch((err) => reject(err));
                } else {
                  // the default is json! The old APIs were XML, no XML in epadlite
                  body.rows.forEach((file) => {
                    res.push(file.key[4]);
                  });
                  resolve(res);
                }
              } else {
                reject(new InternalError('Getting files from couchdb', error));
              }
            }
          );
        } catch (err) {
          reject(new InternalError('Getting files', err));
        }
      })
  );

  // TODO
  // fastify.decorate(
  //   'checkOrphanedInternal',
  //   ids =>
  //     new Promise(async (resolve, reject) => {
  //       try {
  //         const db = fastify.couch.db.use(config.db);
  //         db.fetch({ keys: ids }).then(data => {
  //           if (ids.length === data.rows.length) resolve([]);
  //           else {
  //             const notFound = ids;
  //             data.rows.forEach(item => {
  //               if ('doc' in item) ids.remove(item.id);
  //             });
  //             resolve(notFound);
  //           }
  //         });
  //       } catch (err) {
  //         reject(err);
  //       }
  //     })
  // );

  fastify.decorate(
    'streamToFile',
    (inputStream, filePath) =>
      new Promise((resolve, reject) => {
        const fileWriteStream = fs.createWriteStream(filePath);
        inputStream.pipe(fileWriteStream).on('finish', resolve).on('error', reject);
      })
  );

  fastify.decorate(
    'downloadFiles',
    (ids, subDir, archive) =>
      new Promise((resolve, reject) => {
        try {
          let dir = '';
          if (subDir) dir = subDir;
          else {
            // TODO delete the tmp directory when done
            const timestamp = new Date().getTime();
            dir = `/tmp/tmp_${timestamp}`;
            if (!archive && !fs.existsSync(dir)) fs.mkdirSync(dir);
          }
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;
          if (!archive && !fs.existsSync(`${dir}/files`)) fs.mkdirSync(`${dir}/files`);

          const db = fastify.couch.db.use(config.db);
          const fileSavePromises = [];
          for (let i = 0; i < ids.length; i += 1) {
            const filename = ids[i].split('__ePad__')[0];
            isThereDataToWrite = true;
            if (archive) {
              archive.append(db.attachment.getAsStream(ids[i], filename), {
                name: `${dir}/files/${filename}`,
              });
            } else {
              fileSavePromises.push(() =>
                fastify.streamToFile(
                  db.attachment.getAsStream(ids[i], filename),
                  `${dir}/files/${filename}`
                )
              );
            }
          }
          fastify.pq
            .addAll(fileSavePromises)
            .then(() => {
              fastify.resolveFiles(subDir, isThereDataToWrite, dir, resolve, reject, archive);
            })
            .catch((err) => reject(err));
        } catch (err) {
          reject(new InternalError('Downloading files', err));
        }
      })
  );

  fastify.decorate(
    'resolveFiles',
    (subDir, isThereDataToWrite, dir, resolve, reject, archiveIn) => {
      if (subDir) {
        if (!archiveIn && !isThereDataToWrite) fs.rmdirSync(`${dir}/files`);
        resolve(isThereDataToWrite);
      } else if (isThereDataToWrite) {
        // create a file to stream archive data to.
        const output = fs.createWriteStream(`${dir}/files.zip`);
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Sets the compression level.
        });
        // create the archive
        archive
          .directory(`${dir}/files`, false)
          .on('error', (err) => reject(new InternalError('Archiving files', err)))
          .pipe(output);

        output.on('close', () => {
          fastify.log.info(`Created zip in ${dir}`);
          const readStream = fs.createReadStream(`${dir}/files.zip`);
          // delete tmp folder after the file is sent
          readStream.once('end', () => {
            readStream.destroy(); // make sure stream closed, not close if download aborted.
            if (!archiveIn)
              fs.remove(dir, (error) => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
          });
          resolve(readStream);
        });
        archive.finalize();
      } else {
        if (!archiveIn)
          fs.remove(dir, (error) => {
            if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
            else fastify.log.info(`${dir} deleted`);
          });
        reject(new InternalError('Downloading files', new Error('No file in download')));
      }
    }
  );

  fastify.decorate(
    'deleteFileInternal',
    (params) =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.get(params.filename, (error, existing) => {
          if (error) {
            reject(new ResourceNotFoundError('File', params.filename));
          }

          db.destroy(params.filename, existing._rev)
            .then(() => {
              resolve();
            })
            .catch((err) => {
              reject(new InternalError('Deleting file from couchdb', err));
            });
        });
      })
  );

  fastify.decorate(
    'removeProjectFromCouchDocsInternal',
    (ids, projectId) =>
      new Promise(async (resolve, reject) => {
        const aimsNotUpdated = [];
        if (ids.length > 0) {
          for (let i = 0; i < ids.length; i += 1) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await fastify.saveAimInternal(ids[i], projectId, true);
            } catch (err) {
              fastify.log.warn(`Project ${projectId} can not be removed from aim ${ids[i]}`);
              aimsNotUpdated.push(ids[0]);
            }
          }
          // only reject if I couldn't update any
          if (ids.length === aimsNotUpdated.length)
            reject(
              new InternalError(`Deleting project ${projectId} from aims ${JSON.stringify(ids)}`)
            );
          fastify.log.warn(`${aimsNotUpdated.length} aims not updated`);
          resolve();
        } else resolve();
      })
  );

  fastify.decorate(
    'deleteCouchDocsInternal',
    (ids) =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        const docsToDelete = [];
        if (ids.length > 0)
          db.fetch({ keys: ids })
            .then((data) => {
              data.rows.forEach((item) => {
                if (item.doc)
                  docsToDelete.push({ _id: item.id, _rev: item.doc._rev, _deleted: true });
              });
              if (docsToDelete.length > 0)
                db.bulk({ docs: docsToDelete })
                  .then(() => resolve())
                  .catch((errBulk) =>
                    reject(new InternalError('Deleting couchdocs in bulk', errBulk))
                  );
              else resolve();
            })
            .catch((errFetch) =>
              reject(new InternalError('Getting couchdocs to delete', errFetch))
            );
        else resolve();
      })
  );

  fastify.decorate('getAuthorUsernames', (aim) =>
    // eslint-disable-next-line no-nested-ternary
    aim && aim.ImageAnnotationCollection.user
      ? Array.isArray(aim.ImageAnnotationCollection.user)
        ? aim.ImageAnnotationCollection.user.map((usr) => usr.loginName.value)
        : [aim.ImageAnnotationCollection.user.loginName.value]
      : []
  );

  fastify.decorate('getAuthorUsernameString', (aim) => fastify.getAuthorUsernames(aim).join(','));

  fastify.decorate('getAuthorNameString', (aim) =>
    // eslint-disable-next-line no-nested-ternary
    aim && aim.ImageAnnotationCollection.user
      ? Array.isArray(aim.ImageAnnotationCollection.user)
        ? aim.ImageAnnotationCollection.user
            .map((usr) => usr.name.value)
            .join(',')
            .replace(/\^/g, ' ')
        : aim.ImageAnnotationCollection.user.name.value.replace(/\^/g, ' ')
      : ''
  );

  fastify.decorate('getAimAuthorFromUID', async (aimUid) => {
    try {
      const db = fastify.couch.db.use(config.db);
      const doc = await db.get(aimUid);
      return fastify.getAuthorUsernames(doc.aim);
    } catch (err) {
      throw new InternalError('Getting author from aimuid', err);
    }
  });

  fastify.decorate('deleteTemplateFromSystem', async (request, reply) => {
    try {
      let numDeleted = 0;
      numDeleted = await fastify.deleteTemplateFromDB(request.params);
      await fastify.deleteTemplateInternal(request.params);
      reply.code(200).send(`Template deleted from system and removed from ${numDeleted} projects`);
    } catch (err) {
      reply.send(new InternalError(`Template ${request.params.uid} deletion from system`, err));
    }
  });

  // TODO filter for user??
  fastify.decorate('getFiles', (request, reply) => {
    try {
      fastify
        .getFilesInternal(request.query, request.params)
        .then((result) => {
          if (request.query.format === 'stream') {
            reply.header('Content-Disposition', `attachment; filename=files.zip`);
          }
          reply.code(200).send(result);
        })
        .catch((err) => reply.send(err));
    } catch (err) {
      reply.send(new InternalError('Getting system files', err));
    }
  });

  fastify.decorate('getFile', (request, reply) => {
    fastify
      .getFilesFromUIDsInternal(request.query, [request.params.filename])
      .then((result) => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=files.zip`);
          reply.code(200).send(result);
        } else if (result.length === 1) reply.code(200).send(result[0]);
        else {
          fastify.log.warn(`Was expecting to find 1 record, found ${result.length}`);
          reply.send(new ResourceNotFoundError('File', request.params.filename));
        }
      })
      .catch((err) => reply.send(err));
  });

  // gets users all aims
  fastify.decorate(
    'getUserAIMsInternal',
    (username, format) =>
      new Promise(async (resolve, reject) => {
        try {
          const db = fastify.couch.db.use(config.db);
          const dbFilter = {
            q: `user:${username}`,
            limit: 200,
          };
          const aimsResult = await fastify.getAimsCouchInternal(db, dbFilter, format);
          let aims = aimsResult.rows;
          let totalAimCount = aims.length;
          let { bookmark } = aimsResult;
          while (totalAimCount < aimsResult.total_rows) {
            // eslint-disable-next-line no-await-in-loop
            const newResult = await fastify.getAimsCouchInternal(db, dbFilter, format, bookmark);
            bookmark = newResult.bookmark;
            totalAimCount += newResult.rows.length;
            aims = aims.concat(newResult.rows);
          }
          resolve(aims);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'closeCouchDB',
    (instance) =>
      new Promise(async (resolve, reject) => {
        try {
          if (config.env === 'test') {
            try {
              // if it is test remove the database
              await instance.couch.db.destroy(config.db);
              fastify.log.info('Destroying test database');
            } catch (err) {
              fastify.log.error(`Cannot destroy test database (err:${err.message})`);
            }
          }
          resolve();
        } catch (err) {
          reject(new InternalError('close', err));
        }
      })
  );

  fastify.log.info(`Using db: ${config.db}`);
  // register couchdb
  // disables eslint check as I want this module to be standalone to be (un)pluggable
  // eslint-disable-next-line global-require
  fastify.register(require('fastify-couchdb'), {
    // eslint-disable-line global-require
    url: options.url,
  });
  fastify.after(async () => {
    try {
      await fastify.init();
    } catch (err) {
      fastify.log.error(`Cannot connect to couchdb (err:${err}), shutting down the server`);
      fastify.close();
    }
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(couchdb);
