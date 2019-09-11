/* eslint-disable no-underscore-dangle */
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const archiver = require('archiver');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const dateFormatter = require('date-format');
const _ = require('underscore');
const config = require('../config/index');
const viewsjs = require('../config/views');

async function couchdb(fastify, options) {
  fastify.decorate('init', async () => {
    try {
      await fastify.couch.db.list();
      fastify.log.info('Connected to couchdb server');
      return fastify.checkAndCreateDb();
    } catch (err) {
      if (config.env !== 'test') {
        fastify.log.info('Waiting for couchdb server');
        setTimeout(fastify.init, 3000);
      } else throw Error('No connection');
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
          // try and get the design document
          try {
            viewDoc = await dicomDB.get('_design/instances');
          } catch (e) {
            fastify.log.info('View document not found! Creating new one');
          }
          const keys = Object.keys(viewsjs.views);
          const values = Object.values(viewsjs.views);
          // update the views
          for (let i = 0; i < keys.length; i += 1) {
            viewDoc.views[keys[i]] = values[i];
          }
          // insert the updated/created design document
          await dicomDB.insert(viewDoc, '_design/instances', insertErr => {
            if (insertErr) {
              fastify.log.info(`Error updating the design document ${insertErr.message}`);
              reject(insertErr);
            } else {
              fastify.log.info('Design document updated successfully ');
              resolve();
            }
          });
        } catch (err) {
          fastify.log.info(`Error connecting to couchdb: ${err.message}`);
          reject(err);
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
      ipes.forEach(ipe => {
        header.push({ id: ipe.label.value.toLowerCase(), title: ipe.label.value });
        if (ipe.imagingPhysicalEntityCharacteristicCollection) {
          const ipcs =
            ipe.imagingPhysicalEntityCharacteristicCollection.ImagingPhysicalEntityCharacteristic;
          ipcs.forEach(ipc => {
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
      ioes.forEach(ioe => {
        // imagingObservationEntity can have both imagingObservationEntityCharacteristic and imagingPhysicalEntityCharacteristic
        header.push({ id: ioe.label.value.toLowerCase(), title: ioe.label.value });
        if (ioe.imagingObservationEntityCharacteristicCollection) {
          const iocs =
            ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic;
          iocs.forEach(ioc => {
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
          ipcs.forEach(ipc => {
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
      ipes.forEach(ipe => {
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

          ipcs.forEach(ipc => {
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
      ioes.forEach(ioe => {
        // imagingObservationEntity can have both imagingObservationEntityCharacteristic and imagingPhysicalEntityCharacteristic
        row[ioe.label.value.toLowerCase()] = ioe.typeCode[0]['iso:displayName'].value;
        if (ioe.imagingObservationEntityCharacteristicCollection) {
          let iocs = [];
          if (
            Array.isArray(
              ioe.imagingObservationEntityCharacteristicCollection
                .ImagingObservationEntityCharacteristic
            )
          ) {
            iocs = ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic;
          } else {
            iocs.push(
              ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic
            );
          }
          iocs.forEach(ioc => {
            row[ioc.label.value.toLowerCase()] = ioc.typeCode[0]['iso:displayName'].value;
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
          ipcs.forEach(ipc => {
            row[ipc.label.value.toLowerCase()] = ipc.typeCode[0]['iso:displayName'].value;
          });
        }
      });
    }
    return row;
  });

  fastify.decorate(
    'downloadAims',
    async (params, aims) =>
      new Promise((resolve, reject) => {
        const timestamp = new Date().getTime();
        const dir = `tmp_${timestamp}`;
        // have a boolean just to avoid filesystem check for empty annotations directory
        let isThereDataToWrite = false;

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
          fs.mkdirSync(`${dir}/annotations`);
          // create the header base
          let header = [
            // Date_Created	Patient_Name	Patient_ID	Reviewer	Name Comment	Points	Study_UID	Series_UID	Image_UID
            { id: 'date', title: 'Date_Created' },
            { id: 'patientName', title: 'Patient_Name' },
            { id: 'patientId', title: 'Patient_ID' },
            { id: 'reviewer', title: 'Reviewer' },
            { id: 'name', title: 'Name' },
            { id: 'comment', title: 'Comment' },
            { id: 'userComment', title: 'User_Comment' },
            { id: 'points', title: 'Points' },
            { id: 'studyUid', title: 'Study_UID' },
            { id: 'seriedUid', title: 'Series_UID' },
            { id: 'imageUid', title: 'Image_UID' },
          ];

          const data = [];
          aims.forEach(aim => {
            if (params.summary && params.summary.toLowerCase() === 'true') {
              const imageAnnotations =
                aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation;

              imageAnnotations.forEach(imageAnnotation => {
                const commentSplit = imageAnnotation.comment.value.split('~~');
                const points = [];
                if (imageAnnotation.markupEntityCollection) {
                  imageAnnotation.markupEntityCollection.MarkupEntity[0].twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate.forEach(
                    coor => {
                      points.push(`(${coor.x.value} ${coor.y.value})`);
                    }
                  );
                }

                header = fastify.getOtherHeaders(imageAnnotation, header);

                // add values common to all annotations
                let row = {
                  date: dateFormatter.asString(
                    dateFormatter.ISO8601_FORMAT,
                    dateFormatter.parse('yyyyMMddhhmmssSSS', `${imageAnnotation.dateTime.value}000`)
                  ),
                  patientName: aim.ImageAnnotationCollection.person.name.value,
                  patientId: aim.ImageAnnotationCollection.person.id.value,
                  reviewer: aim.ImageAnnotationCollection.user.name.value,
                  name: imageAnnotation.name.value.split('~')[0],
                  comment: commentSplit[0],
                  userComment: commentSplit.length > 1 ? commentSplit[1] : '',
                  points: `[${points}]`,
                  studyUid:
                    imageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity[0]
                      .imageStudy.instanceUid.root,
                  seriedUid:
                    imageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity[0]
                      .imageStudy.imageSeries.instanceUid.root,
                  imageUid:
                    imageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity[0]
                      .imageStudy.imageSeries.imageCollection.Image[0].sopInstanceUid.root,
                };

                row = fastify.getOtherData(imageAnnotation, row);
                data.push(row);
              });
            }
            if (params.aim && params.aim.toLowerCase() === 'true') {
              fs.writeFileSync(
                `${dir}/annotations/${aim.ImageAnnotationCollection.uniqueIdentifier.root}.json`,
                JSON.stringify(aim)
              );
              isThereDataToWrite = true;
            }
          });
          if (params.summary && params.summary.toLowerCase() === 'true') {
            // create the csv writer and write the summary
            const csvWriter = createCsvWriter({
              path: `${dir}/annotations/summary.csv`,
              header,
            });
            csvWriter
              .writeRecords(data)
              .then(() => fastify.log.info('The summary CSV file was written successfully'));
            isThereDataToWrite = true;
          }
          if (isThereDataToWrite) {
            // create a file to stream archive data to.
            const output = fs.createWriteStream(`${dir}/annotations.zip`);
            const archive = archiver('zip', {
              zlib: { level: 9 }, // Sets the compression level.
            });
            // create the archive
            archive
              .directory(`${dir}/annotations`, false)
              .on('error', err => reject(err))
              .pipe(output);

            output.on('close', () => {
              fastify.log.info(`Created zip in ${dir}`);
              const readStream = fs.createReadStream(`${dir}/annotations.zip`);
              // delete tmp folder after the file is sent
              readStream.once('end', () => {
                readStream.destroy(); // make sure stream closed, not close if download aborted.
                fs.remove(dir, error => {
                  if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                  else fastify.log.info(`${dir} deleted`);
                });
              });
              resolve(readStream);
            });
            archive.finalize();
          } else {
            fs.remove(dir, error => {
              if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
              else fastify.log.info(`${dir} deleted`);
            });
            reject(new Error('No files to write!'));
          }
        }
      })
  );

  // add accessor methods with decorate
  fastify.decorate(
    'getAimsInternal',
    (format, params, filter) =>
      new Promise(async (resolve, reject) => {
        try {
          // make sure there is value in all three
          // only the last ove should have \u9999 at the end
          const myParams = params;
          let isFiltered = false;
          if (!params.series) {
            myParams.series = '';
            myParams.seriesEnd = '{}';
            if (!params.study) {
              myParams.study = '';
              myParams.studyEnd = '{}';
              if (!params.subject) {
                myParams.subject = '';
                myParams.subjectEnd = '{}';
              } else {
                myParams.subject = params.subject;
                myParams.subjectEnd = `${params.subject}\u9999`;
                isFiltered = true;
              }
            } else {
              myParams.studyEnd = `${params.study}\u9999`;
              myParams.subjectEnd = params.subject;
              isFiltered = true;
            }
          } else {
            myParams.seriesEnd = `${params.series}\u9999`;
            myParams.studyEnd = params.study;
            myParams.subjectEnd = params.subject;
            isFiltered = true;
          }
          let filterOptions = {};
          if (isFiltered) {
            filterOptions = {
              startkey: [myParams.subject, myParams.study, myParams.series, ''],
              endkey: [myParams.subjectEnd, myParams.studyEnd, myParams.seriesEnd, '{}'],
              reduce: true,
              group_level: 5,
            };
          } else {
            filterOptions = {
              reduce: true,
              group_level: 5,
            };
          }
          // define which view to use according to the parameter format
          // default is json
          let view = 'aims_json';
          if (format) {
            if (format === 'json') view = 'aims_json';
            else if (format === 'summary') view = 'aims_summary';
          }
          const db = fastify.couch.db.use(config.db);
          db.view('instances', view, filterOptions, async (error, body) => {
            if (!error) {
              const filteredRows = await fastify.filterAims(body.rows, filter, format);
              const res = [];
              if (format === 'summary') {
                for (let i = 0; i < filteredRows.length; i += 1)
                  // get the actual instance object (tags only)
                  res.push(filteredRows[i].key[4]);
                resolve({ ResultSet: { Result: res } });
              } else if (format === 'stream') {
                for (let i = 0; i < filteredRows.length; i += 1)
                  // get the actual instance object (tags only)
                  // the first 3 keys are patient, study, series, image
                  res.push(filteredRows[i].key[4]);

                // download aims only
                fastify
                  .downloadAims({ aim: 'true' }, res)
                  .then(result => resolve(result))
                  .catch(err => reject(err));
              } else {
                // the default is json! The old APIs were XML, no XML in epadlite
                for (let i = 0; i < filteredRows.length; i += 1)
                  // get the actual instance object (tags only)
                  // the first 3 keys are patient, study, series, image
                  res.push(filteredRows[i].key[4]);
                resolve(res);
              }
            } else {
              // TODO Proper error reporting implementation required
              fastify.log.info(`Error in get series aims: ${error}`);
              reject(error);
            }
          });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'filterAims',
    (aimsRows, filter, format) =>
      new Promise((resolve, reject) => {
        try {
          let filteredRows = aimsRows;
          if (filter) {
            const keyNum = 4; // view dependent
            if (format && format === 'summary') {
              filteredRows = _.filter(filteredRows, obj => filter.includes(obj.key[keyNum].aimID));
            } else {
              filteredRows = _.filter(filteredRows, obj =>
                filter.includes(obj.key[keyNum].ImageAnnotationCollection.uniqueIdentifier.root)
              );
            }
          }
          resolve(filteredRows);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getAims', (request, reply) => {
    fastify
      .getAimsInternal(request.query.format, request.params)
      .then(result => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
        }
        reply.code(200).send(result);
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('getAimsFromUIDs', (request, reply) => {
    try {
      if (Object.keys(request.query).length === 0) {
        reply.code(400).send("Query params shouldn't be empty");
      } else {
        const db = fastify.couch.db.use(config.db);
        const res = [];
        db.fetch({ keys: request.body }).then(data => {
          data.rows.forEach(item => {
            // if not found it returns the record with no doc, error: 'not_found'
            if ('doc' in item) res.push(item.doc.aim);
          });
          reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
          fastify
            .downloadAims(request.query, res)
            .then(result => reply.code(200).send(result))
            .catch(err => reply.code(503).send(err.message));
        });
      }
    } catch (err) {
      reply.code(503).send(err);
    }
  });

  fastify.decorate('saveAim', (request, reply) => {
    // get the uid from the json and check if it is same with param, then put as id in couch document
    if (
      request.params.aimuid &&
      request.params.aimuid !== request.body.ImageAnnotationCollection.uniqueIdentifier.root
    ) {
      fastify.log.info(
        'Conflicting aimuids: the uid sent in the url should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root'
      );
      reply
        .code(503)
        .send(
          'Conflicting aimuids: the uid sent in the url should be the same with imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root'
        );
    }
    fastify
      .saveAimInternal(request.body)
      .then(() => {
        reply.code(200).send('Saving successful');
      })
      .catch(err => {
        // TODO Proper error reporting implementation required
        fastify.log.info(`Error in save: ${err}`);
        reply.code(503).send(`Saving error: ${err}`);
      });
  });

  fastify.decorate(
    'saveAimInternal',
    aim =>
      new Promise((resolve, reject) => {
        const couchDoc = {
          _id: aim.ImageAnnotationCollection.uniqueIdentifier.root,
          aim,
        };
        const db = fastify.couch.db.use(config.db);
        db.get(couchDoc._id, (error, existing) => {
          if (!error) {
            couchDoc._rev = existing._rev;
            fastify.log.info(`Updating document for aimuid ${couchDoc._id}`);
          }

          db.insert(couchDoc, couchDoc._id)
            .then(() => {
              resolve('Saving successful');
            })
            .catch(err => {
              // TODO Proper error reporting implementation required
              reject(err);
            });
        });
      })
  );
  fastify.decorate(
    'deleteAimInternal',
    aimuid =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.get(aimuid, (error, existing) => {
          if (error) {
            fastify.log.info(`No document for aimuid ${aimuid}`);
            reject(error);
          }

          db.destroy(aimuid, existing._rev)
            .then(() => {
              resolve();
            })
            .catch(err => {
              // TODO Proper error reporting implementation required
              fastify.log.info(`Error in delete: ${err}`);
              reject(err);
            });
        });
      })
  );

  fastify.decorate('deleteAim', (request, reply) => {
    fastify
      .deleteAimInternal(request.params.aimuid)
      .then(() => reply.code(200).send('Deletion successful'))
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate(
    'deleteAimsInternal',
    params =>
      new Promise((resolve, reject) => {
        fastify
          .getAimsInternal('summary', params)
          .then(result => {
            const aimPromisses = [];
            result.ResultSet.Result.forEach(aim =>
              aimPromisses.push(fastify.deleteAimInternal(aim.aimID))
            );
            Promise.all(aimPromisses)
              .then(() => resolve())
              .catch(deleteErr => reject(deleteErr));
          })
          .catch(err => reject(err));
      })
  );

  // template accessors
  fastify.decorate('getTemplates', (request, reply) => {
    fastify
      .getTemplatesInternal(request.query)
      .then(result => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=templates.zip`);
        }
        reply.code(200).send(result);
      })
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate(
    'getTemplatesInternal',
    query =>
      new Promise(async (resolve, reject) => {
        try {
          let type = 'image';
          let format = 'json';
          // eslint-disable-next-line prefer-destructuring
          if (query.type) type = query.type.toLowerCase();
          if (query.format) format = query.format.toLowerCase();
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
              startkey: [type, '', ''],
              endkey: [`${type}\u9999`, '{}', '{}'],
              reduce: true,
              group_level: 3,
            },
            (error, body) => {
              if (!error) {
                const res = [];

                if (format === 'summary') {
                  body.rows.forEach(template => {
                    res.push(template.key[2]);
                  });
                  resolve({ ResultSet: { Result: res } });
                } else if (format === 'stream') {
                  body.rows.forEach(template => {
                    res.push(template.key[2]);
                  });
                  fastify
                    .downloadTemplates(res)
                    .then(result => resolve(result))
                    .catch(err => reject(err));
                } else {
                  // the default is json! The old APIs were XML, no XML in epadlite
                  body.rows.forEach(template => {
                    res.push(template.key[2]);
                  });
                  resolve(res);
                }
              } else {
                // TODO Proper error reporting implementation required
                fastify.log.info(`Error in get templates: ${error}`);
                reject(error);
              }
            }
          );
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('saveTemplate', (request, reply) => {
    // get the uid from the json and check if it is same with param, then put as id in couch document
    if (request.params.uid && request.params.uid !== request.body.TemplateContainer.uid) {
      fastify.log.info(
        'Conflicting uids: the uid sent in the url should be the same with request.body.Template.uid'
      );
      reply
        .code(503)
        .send(
          'Conflicting uids: the uid sent in the url should be the same with request.body.Template.uid'
        );
    }
    fastify
      .saveTemplateInternal(request.body)
      .then(() => {
        reply.code(200).send('Saving successful');
      })
      .catch(err => {
        // TODO Proper error reporting implementation required
        fastify.log.info(`Error in save: ${err}`);
        reply.code(503).send(`Saving error: ${err}`);
      });
  });

  fastify.decorate(
    'saveTemplateInternal',
    template =>
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
              resolve('Saving successful');
            })
            .catch(err => {
              // TODO Proper error reporting implementation required
              reject(err);
            });
        });
      })
  );

  fastify.decorate(
    'deleteTemplateInternal',
    params =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.get(params.uid, (error, existing) => {
          if (error) {
            fastify.log.info(`No document for uid ${params.uid}`);
            reject(new Error(`No document for uid ${params.uid}`));
          }

          db.destroy(params.uid, existing._rev)
            .then(() => {
              resolve();
            })
            .catch(err => {
              // TODO Proper error reporting implementation required
              fastify.log.info(`Error in delete: ${err}`);
              reject(err);
            });
        });
      })
  );

  fastify.decorate(
    'downloadTemplates',
    async templates =>
      new Promise((resolve, reject) => {
        const timestamp = new Date().getTime();
        const dir = `tmp_${timestamp}`;
        // have a boolean just to avoid filesystem check for empty annotations directory
        let isThereDataToWrite = false;

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
          fs.mkdirSync(`${dir}/templates`);

          templates.forEach(template => {
            fs.writeFileSync(
              `${dir}/templates/${template.TemplateContainer.Template[0].codeValue}_${
                template.TemplateContainer.uid
              }.json`,
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
            .on('error', err => reject(err))
            .pipe(output);

          output.on('close', () => {
            fastify.log.info(`Created zip in ${dir}`);
            const readStream = fs.createReadStream(`${dir}/templates.zip`);
            // delete tmp folder after the file is sent
            readStream.once('end', () => {
              readStream.destroy(); // make sure stream closed, not close if download aborted.
              fs.remove(dir, error => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
            });
            resolve(readStream);
          });
          archive.finalize();
        } else {
          fs.remove(dir, error => {
            if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
            else fastify.log.info(`${dir} deleted`);
          });
          reject(new Error('No files to write!'));
        }
      })
  );

  fastify.decorate('getTemplatesFromUIDs', (request, reply) => {
    try {
      const db = fastify.couch.db.use(config.db);
      const res = [];
      db.fetch({ keys: request.body }).then(data => {
        data.rows.forEach(item => {
          // if not found it returns the record with no doc, error: 'not_found'
          if ('doc' in item) res.push(item.doc.template);
        });
        reply.header('Content-Disposition', `attachment; filename=templates.zip`);
        fastify
          .downloadTemplates(res)
          .then(result => reply.code(200).send(result))
          .catch(err => reply.code(503).send(err.message));
      });
    } catch (err) {
      reply.code(503).send(err);
    }
  });

  fastify.decorate('getSummaryFromTemplate', docTemplate => {
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

  fastify.decorate(
    'getTemplatesFromUIDsInternal',
    (query, ids) =>
      new Promise(async (resolve, reject) => {
        try {
          let format = 'json';
          if (query.format) format = query.format.toLowerCase();

          const db = fastify.couch.db.use(config.db);
          const res = [];
          db.fetch({ keys: ids }).then(data => {
            if (format === 'summary') {
              data.rows.forEach(item => {
                const summary = fastify.getSummaryFromTemplate(item.doc.template);
                res.push(summary);
              });
              resolve({ ResultSet: { Result: res } });
            } else if (format === 'stream') {
              data.rows.forEach(item => {
                if ('doc' in item) res.push(item.doc.template);
              });
              fastify
                .downloadTemplates(res)
                .then(result => resolve(result))
                .catch(err => reject(err));
            } else {
              // the default is json! The old APIs were XML, no XML in epadlite
              data.rows.forEach(item => {
                if ('doc' in item) res.push(item.doc.template);
              });
              resolve(res);
            }
          });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getAim', (request, reply) => {
    fastify
      .getAimsInternal(request.query.format, request.params, [request.params.aimuid])
      .then(result => {
        if (request.query.format === 'stream') {
          reply.header('Content-Disposition', `attachment; filename=annotations.zip`);
        }
        if (result.length === 1) reply.code(200).send(result[0]);
        else {
          reply.code(404).send(`Aim ${request.params.aimuid} not found`);
        }
      })
      .catch(err => reply.code(503).send(err));
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
              resolve('Saving successful');
            })
            .catch(err => {
              // TODO Proper error reporting implementation required
              reject(err);
            });
        });
      })
  );

  fastify.decorate(
    'getFilesFromUIDsInternal',
    (query, ids) =>
      new Promise(async (resolve, reject) => {
        try {
          let format = 'json';
          if (query.format) format = query.format.toLowerCase();

          const db = fastify.couch.db.use(config.db);
          const res = [];
          if (format === 'json') {
            db.fetch({ keys: ids }).then(data => {
              data.rows.forEach(item => {
                if ('doc' in item) res.push(item.doc.fileInfo);
              });
              resolve(res);
            });
          } else if (format === 'stream') {
            fastify
              .downloadFiles(ids)
              .then(result => resolve(result))
              .catch(err => reject(err));
          }
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'downloadFiles',
    async ids =>
      new Promise((resolve, reject) => {
        const timestamp = new Date().getTime();
        const dir = `tmp_${timestamp}`;
        // have a boolean just to avoid filesystem check for empty annotations directory
        let isThereDataToWrite = false;

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
          fs.mkdirSync(`${dir}/files`);

          const db = fastify.couch.db.use(config.db);
          for (let i = 0; i < ids.length; i += 1) {
            const filename = ids[i].split('_')[0];
            db.attachment
              .getAsStream(ids[i], filename)
              .pipe(fs.createWriteStream(`${dir}/files/${filename}`));
            isThereDataToWrite = true;
          }
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
            .on('error', err => reject(err))
            .pipe(output);

          output.on('close', () => {
            fastify.log.info(`Created zip in ${dir}`);
            const readStream = fs.createReadStream(`${dir}/templates.zip`);
            // delete tmp folder after the file is sent
            readStream.once('end', () => {
              readStream.destroy(); // make sure stream closed, not close if download aborted.
              fs.remove(dir, error => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
            });
            resolve(readStream);
          });
          archive.finalize();
        } else {
          fs.remove(dir, error => {
            if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
            else fastify.log.info(`${dir} deleted`);
          });
          reject(new Error('No files to write!'));
        }
      })
  );
  fastify.decorate(
    'deleteFileInternal',
    params =>
      new Promise((resolve, reject) => {
        const db = fastify.couch.db.use(config.db);
        db.get(params.filename, (error, existing) => {
          if (error) {
            fastify.log.info(`No document for uid ${params.uid}`);
            reject(new Error(`No document for uid ${params.uid}`));
          }

          db.destroy(params.filename, existing._rev)
            .then(() => {
              resolve();
            })
            .catch(err => {
              // TODO Proper error reporting implementation required
              fastify.log.info(`Error in delete: ${err}`);
              reject(err);
            });
        });
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
      fastify.log.info(`Cannot connect to couchdb (err:${err}), shutting down the server`);
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
          fastify.log.info(`Cannot destroy test database (err:${err})`);
        }
        done();
      }
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(couchdb);
