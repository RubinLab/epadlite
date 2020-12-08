/* eslint-disable no-async-promise-executor */
/* eslint-disable no-underscore-dangle */
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const archiver = require('archiver');
const atob = require('atob');
const path = require('path');
const config = require('../config/index');
const viewsjs = require('../config/views');
const {
  InternalError,
  ResourceNotFoundError,
  BadRequestError,
  UnauthenticatedError,
} = require('../utils/EpadErrors');
// const EpadNotification = require('../utils/EpadNotification');

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
    (downloadParams, aimsResult, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const offline = aimsResult.total_rows !== aimsResult.rows.length;
          const timestamp = new Date().getTime();
          const dir = `tmp_${timestamp}`;
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;

          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
            fs.mkdirSync(`${dir}/annotations`);

            isThereDataToWrite =
              (await fastify.prepAimDownload(
                `${dir}/annotations`,
                {},
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
                  resolve(`/download/annotations_${timestamp}.zip`);
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

  fastify.decorate('generateSearchQuery', (params, epadAuth, filter) => {
    // if new search indexes are added, it should be added here too
    const validQryParams = [
      'patient_name',
      'user',
      'creation_date',
      'creation_time',
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
    if (params.project) qryParts.push(`project:'${params.project}'`);
    if (params.subject) qryParts.push(`patient_id:'${params.subject}'`);
    if (params.study) qryParts.push(`study_uid:'${params.study}'`);
    if (params.series) qryParts.push(`series_uid:'${params.series}'`);
    if (fastify.isCollaborator(params.project, epadAuth))
      qryParts.push(`user:${epadAuth.username}`);
    if (filter) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, value] of Object.entries(filter)) {
        if (key === 'template') qryParts.push(`template_code:${value}`);
        else if (key === 'aims') qryParts.push(`(${value.join(' OR ')})`);
        else if (validQryParams.includes(key)) qryParts.push(`${key}:${value}`);
      }
    }
    if (qryParts.length === 0) return '*:*';
    return qryParts.join(' AND ');
  });

  fastify.decorate(
    'getAimsCouchInternal',
    (db, searchQry, format, bookmark) =>
      new Promise((resolve, reject) => {
        const dbFilter = { ...searchQry, bookmark };
        db.search('search', 'aimSearch', dbFilter, async (error, body) => {
          try {
            if (!error) {
              const resObj = { total_rows: body.total_rows, bookmark: body.bookmark };
              const res = [];
              if (format === 'summary') {
                for (let i = 0; i < body.rows.length; i += 1) {
                  // not putting project id. getprojectaims puts the project that was called from
                  res.push({
                    aimID: body.rows[i].id,
                    subjectID: body.rows[i].fields.patient_id,
                    studyUID: body.rows[i].fields.study_uid,
                    seriesUID: body.rows[i].fields.series_uid,
                    instanceUID: body.rows[i].fields.instance_uid,
                    instanceOrFrameNumber: 'NA',
                    name: body.rows[i].fields.name,
                    template: body.rows[i].fields.template_code,
                    date: `${body.rows[i].fields.creation_date}${body.rows[i].fields.creation_time}`,
                    patientName: body.rows[i].fields.patient_name,
                    studyDate: body.rows[i].fields.study_date,
                    comment: body.rows[i].fields.programmed_comment,
                    templateType: body.rows[i].fields.template_name,
                    color: 'NA',
                    dsoFrameNo: 'NA',
                    isDicomSR: 'NA',
                    originalSubjectID: body.rows[i].fields.patient_id,
                    userName: body.rows[i].fields.user,
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
    (format, params, filter, epadAuth, bookmark) =>
      new Promise((resolve, reject) => {
        try {
          if (config.auth && config.auth !== 'none' && epadAuth === undefined)
            reject(new UnauthenticatedError('No epadauth in request'));
          const db = fastify.couch.db.use(config.db);
          const qry = fastify.generateSearchQuery(params, epadAuth, filter);
          const dbFilter = { q: qry, sort: 'name<string>', limit: 200 };
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
                      .downloadAims({ aim: 'true' }, resObj, epadAuth)
                      .then((result) => {
                        fastify.log.info(`Zip file ready in ${result}`);
                        // // send notification and/or email with link
                        // new EpadNotification(
                        //   request,
                        //   'Download ready',
                        //   `${params.subject} ${params.study} ${params.series}`,
                        //   true
                        // ).notify(fastify);
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
                      })
                      .catch((err) => reject(err));
                    resolve({ total_rows: resObj.total_rows });
                  } else {
                    // download aims only
                    fastify
                      .downloadAims({ aim: 'true' }, resObj, epadAuth)
                      .then((result) => resolve(result))
                      .catch((err) => reject(err));
                  }
                } else {
                  resolve(resObj);
                }
              } catch (err2) {
                reject(new InternalError('Packing download or sending', err2));
              }
            })
            .catch((error) => reject(error));
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

  fastify.decorate('isCollaborator', (project, epadAuth) => {
    return (
      epadAuth &&
      epadAuth.projectToRole &&
      epadAuth.projectToRole.includes(`${project}:Collaborator`)
    );
  });

  fastify.decorate('getAims', async (request, reply) => {
    try {
      const result = await fastify.getAimsInternal(
        request.query.format,
        request.params,
        undefined,
        request.epadAuth,
        request.query.bookmark
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
        const attachments = fastify.extractAttachmentParts(aim);
        const db = fastify.couch.db.use(config.db);
        db.get(couchDoc._id, (error, existing) => {
          if (!error) {
            // for updating project
            if (typeof aim === 'string') {
              couchDoc.aim = existing.aim;
            }
            couchDoc._rev = existing._rev;
            if (existing.projects) {
              couchDoc.projects = existing.projects;
            }
            fastify.log.info(`Updating document for aimuid ${couchDoc._id}`);
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

          db.multipart
            .insert(couchDoc, attachments, couchDoc._id)
            .then(() => {
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
        db.get(aimuid, (error, existing) => {
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
              const params = {
                study: segEntity.SegmentationEntity[0].studyInstanceUid.root,
                series: segEntity.SegmentationEntity[0].seriesInstanceUid.root,
              };
              promisses.push(fastify.deleteSeriesDicomsInternal(params));
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

  // does not do project filtering! should only be used for deleting from system
  fastify.decorate('deleteAimsInternal', (params, epadAuth) => {
    return new Promise((resolve, reject) => {
      const aimUsers = {};
      // TODO delete in parts according to pagination
      fastify
        .getAimsInternal('summary', params, undefined, epadAuth)
        .then((result) => {
          const aimPromisses = [];
          result.rows.forEach((aim) => {
            aimUsers[aim.userName] = 'aim';
            aimPromisses.push(fastify.deleteAimInternal(aim.aimID));
          });
          Promise.all(aimPromisses)
            .then(async () => {
              const updateWorklistPromises = [];
              const { project, subject, study } = params;
              const aimUsersArr = Object.keys(aimUsers);
              // TODO this is system delete only, which means subject/study is deleted from system
              // do we need to update completeness at all?
              if (project && study) {
                fastify
                  .findProjectIdInternal(project)
                  .then((res) => {
                    aimUsersArr.forEach((userName) => {
                      updateWorklistPromises.push(
                        fastify.aimUpdateGateway(
                          res,
                          subject,
                          study,
                          userName,
                          epadAuth,
                          undefined,
                          params.project
                        )
                      );
                    });
                    Promise.all(updateWorklistPromises)
                      .then(() => resolve())
                      .catch((deleteErr) => reject(deleteErr));
                  })
                  .catch((projectFindErr) => reject(projectFindErr));
              } else {
                resolve();
              }
            })
            .catch((deleteErr) => reject(deleteErr));
        })
        .catch((err) => reject(err));
    });
  });

  // template accessors
  // fastify.decorate('getTemplates', (request, reply) => {
  //   fastify
  //     .getTemplatesInternal(request.query)
  //     .then(result => {
  //       if (request.query.format === 'stream') {
  //         reply.header('Content-Disposition', `attachment; filename=templates.zip`);
  //       }
  //       reply.code(200).send(result);
  //     })
  //     .catch(err => reply.send(err));
  // });

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
          const dir = `tmp_${timestamp}`;
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
    (query, ids, filter, subDir) =>
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
              .downloadFiles(filteredIds, subDir)
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
    'downloadFiles',
    (ids, subDir) =>
      new Promise((resolve, reject) => {
        try {
          let dir = '';
          if (subDir) dir = subDir;
          else {
            const timestamp = new Date().getTime();
            dir = `tmp_${timestamp}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
          }
          // have a boolean just to avoid filesystem check for empty annotations directory
          let isThereDataToWrite = false;

          if (!fs.existsSync(`${dir}/files`)) fs.mkdirSync(`${dir}/files`);

          const db = fastify.couch.db.use(config.db);
          for (let i = 0; i < ids.length; i += 1) {
            const filename = ids[i].split('__ePad__')[0];
            db.attachment
              .getAsStream(ids[i], filename)
              .pipe(fs.createWriteStream(`${dir}/files/${filename}`));
            isThereDataToWrite = true;
          }
          if (subDir) {
            if (!isThereDataToWrite) fs.rmdirSync(`${dir}/files`);
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
                fs.remove(dir, (error) => {
                  if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                  else fastify.log.info(`${dir} deleted`);
                });
              });
              resolve(readStream);
            });
            archive.finalize();
          } else {
            fs.remove(dir, (error) => {
              if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
              else fastify.log.info(`${dir} deleted`);
            });
            reject(new InternalError('Downloading files', new Error('No file in download')));
          }
        } catch (err) {
          reject(new InternalError('Downloading files', err));
        }
      })
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
                if ('doc' in item)
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

  fastify.decorate('getAimAuthorFromUID', async (aimUid) => {
    try {
      const db = fastify.couch.db.use(config.db);
      const doc = await db.get(aimUid);
      return doc.aim.ImageAnnotationCollection.user.loginName.value;
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
    // need to add hook for close to remove the db if test;
    fastify.addHook('onClose', async (instance, done) => {
      if (config.env === 'test') {
        try {
          // if it is test remove the database
          await instance.couch.db.destroy(config.db);
          fastify.log.info('Destroying test database');
        } catch (err) {
          fastify.log.error(`Cannot destroy test database (err:${err.message})`);
        }
        done();
      }
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(couchdb);
