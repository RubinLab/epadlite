/* eslint-disable no-async-promise-executor */
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const unzip = require('unzip-stream');
const toArrayBuffer = require('to-array-buffer');
const { default: PQueue } = require('p-queue');
const path = require('path');
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');
const atob = require('atob');
const axios = require('axios');
const plist = require('plist');
const { createOfflineAimSegmentation, Aim } = require('aimapi');
const crypto = require('crypto');
const concat = require('concat-stream');
const ActiveDirectory = require('activedirectory2');
const config = require('../config/index');

let keycloak = null;
// I need to import this after config as it uses config values
if (config.auth !== 'external') {
  // eslint-disable-next-line import/order
  // eslint-disable-next-line global-require
  keycloak = require('keycloak-backend')({
    realm: config.authConfig.realm, // required for verify
    'auth-server-url': config.authConfig.authServerUrl, // required for verify
    client_id: config.authConfig.clientId,
    client_secret: config.authConfig.clientSecret,
  });
}
const EpadNotification = require('../utils/EpadNotification');

const {
  InternalError,
  ResourceNotFoundError,
  BadRequestError,
  UnauthenticatedError,
  UnauthorizedError,
  ResourceAlreadyExistsError,
} = require('../utils/EpadErrors');

async function other(fastify) {
  fastify.log.info(`Starting a promise queue with ${config.maxConcurrent} concurrent promisses`);
  const pq = new PQueue({ concurrency: config.maxConcurrent });
  // seperate promise queue for dicom sending to ensure sending one folder at a time
  const pqDicoms = new PQueue({ concurrency: 1 });
  fastify.decorate('pq', pq);
  fastify.decorate('pqDicoms', pqDicoms);
  // disable logs for now
  // let count = 0;
  // pq.on('active', () => {
  //   count += 1;
  //   // eslint-disable-next-line no-plusplus
  //   fastify.log.info(
  //     `P-queue working on item #${count}.  Size: ${pq.size}  Pending: ${pq.pending}`
  //   );
  // });
  // let countDicoms = 0;
  // pqDicoms.on('active', () => {
  //   countDicoms += 1;
  //   // eslint-disable-next-line no-plusplus
  //   fastify.log.info(
  //     `P-queue dicom working on item #${countDicoms}.  Size: ${pqDicoms.size}  Pending: ${
  //       pqDicoms.pending
  //     }`
  //   );
  // });
  // eslint-disable-next-line global-require
  fastify.register(require('@fastify/multipart'));
  fastify.decorate('getCombinedErrorText', (errors) => {
    let errMessagesText = null;
    if (errors.length > 0) {
      const errMessages = errors.reduce((all, item) => {
        all.push(item.message);
        return all;
      }, []);
      errMessagesText = errMessages.toString();
    }
    return errMessagesText;
  });
  fastify.decorate('saveAimFile', (request, reply) => {
    const fileSavePromises = [];
    function done(err) {
      if (err) {
        reply.send(new InternalError('Multipart aim file save', err));
      } else {
        Promise.all(fileSavePromises)
          .then((values) => {
            let numOfSuccess = 0;
            let errors = [];
            for (let i = 0; i < values.length; i += 1) {
              if (values[i].success) numOfSuccess += 1;
              errors = errors.concat(values[i].errors);
            }
            const errMessagesText = fastify.getCombinedErrorText(errors);

            if (numOfSuccess) {
              if (errMessagesText) {
                reply.send(
                  new InternalError('Aim file(s) saved with errors', new Error(errMessagesText))
                );
              } else reply.code(200).send('Aim file(s) saved');
            } else
              reply.send(
                new InternalError('None of the aims is saved', new Error(`errMessagesText`))
              );
          })
          .catch((fileSaveErr) => {
            reply.send(new InternalError('Aim file(s) save error', fileSaveErr));
          });
      }
    }
    function handler(field, file, filename) {
      fileSavePromises.push(
        new Promise((resolve) => {
          file.pipe(
            concat((buf) => {
              const jsonBuffer = JSON.parse(buf);
              fastify
                .saveAimJsonWithProjectRef(jsonBuffer, request.params, request.epadAuth, filename)
                .then((res) => {
                  resolve(res);
                })
                .catch((err) => {
                  // errors.push(new InternalError(`Saving aim ${filename}`, err));
                  resolve({ success: false, errors: [err] });
                });
            }),
            (err) => {
              if (err) {
                // errors.push(new InternalError(`Getting aim json from upload for ${filename}`, err));
                resolve({ success: false, errors: [err] });
              }
            }
          );
        })
      );
    }

    request.multipart(handler, done);
  });

  fastify.decorate('saveFile', (request, reply) => {
    const timestamp = new Date().getTime();
    const dir = `/tmp/tmp_${timestamp}`;
    const filenames = [];
    const fileSavePromisses = [];
    function done(err) {
      if (err) {
        reply.send(new InternalError('Multipart file save', err));
      } else {
        Promise.all(fileSavePromisses)
          .then(async () => {
            if (config.env !== 'test') {
              fastify.log.info('Files copy completed. sending response');
              reply.code(202).send('Files received succesfully, saving..');
            }
            try {
              const { success, errors } = await fastify.saveFiles(
                dir,
                filenames,
                request.params,
                request.query,
                request.epadAuth
              );
              fs.remove(dir, (error) => {
                if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                fastify.log.info(`${dir} deleted`);
              });
              // poll dicomweb to update the counts
              await fastify.pollDWStudies();
              const errMessagesText = fastify.getCombinedErrorText(errors);
              if (success) {
                if (errMessagesText) {
                  if (config.env === 'test')
                    reply.send(
                      new InternalError('Upload Completed with errors', new Error(errMessagesText))
                    );
                  else
                    new EpadNotification(
                      request,
                      'Upload Completed with errors',
                      new Error(errMessagesText),
                      true
                    ).notify(fastify);

                  // test should wait for the upload to actually finish to send the response.
                  // sending the reply early is to handle very large files and to avoid browser repeating the request
                } else if (config.env === 'test') reply.code(200).send();
                else {
                  fastify.log.info(`Upload Completed ${filenames}`);
                  new EpadNotification(request, 'Upload Completed', filenames, true).notify(
                    fastify
                  );
                }
              } else if (config.env === 'test') {
                reply.send(
                  new InternalError(
                    'Upload Failed as none of the files were uploaded successfully',
                    new Error(`${filenames.toString()}. ${errMessagesText}`)
                  )
                );
              } else {
                new EpadNotification(
                  request,
                  'Upload Failed as none of the files were uploaded successfully',
                  new Error(`${filenames.toString()}. ${errMessagesText}`),
                  true
                ).notify(fastify);
              }
            } catch (filesErr) {
              fs.remove(dir, (error) => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
              if (config.env === 'test') reply.send(new InternalError('Upload Error', filesErr));
              else
                new EpadNotification(
                  request,
                  'Upload files',
                  new InternalError('Upload Error', filesErr),
                  true
                ).notify(fastify);
            }
          })
          .catch((fileSaveErr) => {
            fs.remove(dir, (error) => {
              if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
              else fastify.log.info(`${dir} deleted`);
            });
            if (config.env === 'test') reply.send(new InternalError('Upload Error', fileSaveErr));
            else
              new EpadNotification(
                request,
                'Upload files',
                new InternalError('Upload Error', fileSaveErr),
                true
              ).notify(fastify);
          });
      }
    }
    function addFile(file, filename) {
      fileSavePromisses.push(
        new Promise((resolve) =>
          file.pipe(fs.createWriteStream(`${dir}/${filename}`)).on('finish', resolve)
        )
      );
      filenames.push(filename);
    }
    function handler(field, file, filename) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      addFile(file, filename);
    }

    request.multipart(handler, done);
  });

  fastify.decorate(
    'saveFiles',
    (dir, filenames, params, query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          let errors = [];
          let success = false;
          let datasets = [];
          let studies = new Set();
          await fastify.addProcessing(params, query, dir, true, 1, '', epadAuth);
          for (let i = 0; i < filenames.length; i += 1) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const fileResult = await fastify.processFile(
                dir,
                filenames[i],
                datasets,
                params,
                query,
                studies,
                epadAuth
              );
              if (fileResult && fileResult.errors && fileResult.errors.length > 0)
                errors = errors.concat(fileResult.errors);
              if (
                (fileResult && fileResult.errors && fileResult.errors.length === 0) ||
                (fileResult && fileResult.success && fileResult.success === true)
              )
                success = success || true;
            } catch (fileErr) {
              errors.push(fileErr);
            }
          }
          // see if it was a dicom
          if (datasets.length > 0) {
            await pqDicoms.add(() =>
              fastify.sendDicomsInternal(params, epadAuth, studies, datasets)
            );
            datasets = [];
            studies = new Set();
          }
          await fastify.removeProcessing(params, query, dir);
          resolve({ success, errors });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('chunkSize', 300);

  fastify.decorate(
    'sendDicomsInternal',
    (params, epadAuth, studies, datasets) =>
      new Promise(async (resolve, reject) => {
        try {
          await fastify.addProjectReferences(params, epadAuth, studies);
          fastify.log.info(`Writing ${datasets.length} dicoms`);
          const { data, boundary } = dcmjs.utilities.message.multipartEncode(datasets);
          fastify.log.info(
            `Sending ${Buffer.byteLength(data)} bytes of data to dicom web server for saving`
          );
          try {
            await fastify.saveDicomsInternal(data, boundary);
          } catch (err) {
            // if socket hang up wait a sec and try once more
            if (err.message.includes('socket hang up')) {
              fastify.log.warn('DICOMweb hang up the socker trying again');
              setTimeout(await fastify.saveDicomsInternal(data, boundary), 1000);
            } else {
              fastify.log.error(`Could not send to DICOMweb ${err.message}`);
              reject(err);
            }
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'addProjectReferences',
    (params, epadAuth, studies) =>
      new Promise(async (resolve, reject) => {
        try {
          // eslint-disable-next-line no-restricted-syntax
          for (const study of studies) {
            const studyJSON = JSON.parse(study);
            const combinedParams = {
              project: params.project, // should only get project id from params
              subject: studyJSON.subject,
              study: studyJSON.study,
            };
            // does not send query to check for segmentation dicoms (AIM)
            // this is called from upload and it already handles segmentation dicoms
            // eslint-disable-next-line no-await-in-loop
            await fastify.addPatientStudyToProjectInternal(combinedParams, epadAuth, studyJSON);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'saveAimJsonWithProjectRef',
    (aimJson, params, epadAuth, filename) =>
      new Promise(async (resolve, reject) => {
        try {
          fastify
            .saveAimInternal(aimJson, params.project)
            .then(async () => {
              try {
                await fastify.addProjectAimRelInternal(aimJson, params.project, epadAuth);
                if (filename) fastify.log.info(`Saving successful for ${filename}`);
                resolve({ success: true, errors: [] });
              } catch (errProject) {
                reject(errProject);
              }
            })
            .catch((err) => {
              reject(err);
            });
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getDicomInfo',
    (arrayBuffer, params, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const dicomTags = dcmjs.data.DicomMessage.readFile(arrayBuffer);
          const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomTags.dict);
          // eslint-disable-next-line no-underscore-dangle
          dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(dicomTags.meta);
          if (dataset.Modality === 'SEG') {
            const aimExist = await fastify.checkProjectSegAimExistence(
              dataset.SeriesInstanceUID,
              params.project
            );
            // create a segmentation aim if it doesn't exist
            if (!aimExist) {
              fastify.log.info(
                `A segmentation is uploaded with series UID ${dataset.SeriesInstanceUID} which doesn't have an aim, generating an aim with name ${dataset.SeriesDescription} `
              );
              const { aim } = createOfflineAimSegmentation(dataset, {
                loginName: epadAuth.username,
                name: `${epadAuth.firstname} ${epadAuth.lastname}`,
              });
              const aimJson = aim.getAimJSON();
              await fastify.saveAimJsonWithProjectRef(aimJson, params, epadAuth);
            }
          }

          await fastify.purgeWado(
            dicomTags.dict['0020000D'] && dicomTags.dict['0020000D'].Value
              ? dicomTags.dict['0020000D'].Value[0]
              : '',
            dicomTags.dict['0020000E'] && dicomTags.dict['0020000E'].Value
              ? dicomTags.dict['0020000E'].Value[0]
              : '',
            dicomTags.dict['00080018'] && dicomTags.dict['00080018'].Value
              ? dicomTags.dict['00080018'].Value[0]
              : ''
          );
          resolve(
            JSON.stringify({
              subject:
                dicomTags.dict['00100020'] && dicomTags.dict['00100020'].Value
                  ? dicomTags.dict['00100020'].Value[0]
                  : '',
              study:
                dicomTags.dict['0020000D'] && dicomTags.dict['0020000D'].Value
                  ? dicomTags.dict['0020000D'].Value[0]
                  : '',
              subjectName:
                dicomTags.dict['00100010'] && dicomTags.dict['00100010'].Value
                  ? dicomTags.dict['00100010'].Value[0]
                  : '',
              studyDesc:
                dicomTags.dict['00081030'] && dicomTags.dict['00081030'].Value
                  ? dicomTags.dict['00081030'].Value[0]
                  : '',
              insertDate:
                dicomTags.dict['00080020'] && dicomTags.dict['00080020'].Value
                  ? dicomTags.dict['00080020'].Value[0]
                  : '',
              birthdate:
                dicomTags.dict['00100030'] && dicomTags.dict['00100030'].Value
                  ? dicomTags.dict['00100030'].Value[0]
                  : '',
              sex:
                dicomTags.dict['00100040'] && dicomTags.dict['00100040'].Value
                  ? dicomTags.dict['00100040'].Value[0]
                  : '',
              studyAccessionNumber:
                dicomTags.dict['00080050'] && dicomTags.dict['00080050'].Value
                  ? dicomTags.dict['00080050'].Value[0]
                  : '',
              referringPhysicianName:
                dicomTags.dict['00080090'] && dicomTags.dict['00080090'].Value
                  ? dicomTags.dict['00080090'].Value[0]
                  : '',
              studyID:
                dicomTags.dict['00200010'] && dicomTags.dict['00200010'].Value
                  ? dicomTags.dict['00200010'].Value[0]
                  : '',
              studyTime:
                dicomTags.dict['00080030'] && dicomTags.dict['00080030'].Value
                  ? dicomTags.dict['00080030'].Value[0]
                  : '',
              // seriesUID:
              //   dicomTags.dict['0020000E'] && dicomTags.dict['0020000E'].Value
              //     ? dicomTags.dict['0020000E'].Value[0]
              //     : '',
              // imageUID:
              //   dicomTags.dict['00080018'] && dicomTags.dict['00080018'].Value
              //     ? dicomTags.dict['00080018'].Value[0]
              //     : '',
            })
          );
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'processZip',
    (dir, filename, params, query, epadAuth) =>
      new Promise((resolve, reject) => {
        const zipTimestamp = new Date().getTime();
        const zipDir = `${dir}/${filename}_${zipTimestamp}`;
        try {
          fs.mkdirSync(zipDir);
          fastify.log.info(`Extracting ${dir}/${filename} to ${zipDir}`);
          fs.createReadStream(`${dir}/${filename}`)
            .pipe(unzip.Extract({ path: `${zipDir}` }))
            .on('close', () => {
              fastify.log.info(`Extracted zip ${zipDir}`);
              // add extracted zip so we can skip
              fastify
                .addProcessing(params, query, zipDir, false, 1, path.join(dir, filename), epadAuth)
                .then(() => {
                  fastify
                    .processFolder(`${zipDir}`, params, query, epadAuth)
                    .then((result) => {
                      fastify.log.info(
                        `Finished processing ${filename} at ${new Date().getTime()} started at ${zipTimestamp}`
                      );
                      fs.remove(zipDir, (error) => {
                        if (error)
                          fastify.log.info(`Zip temp directory deletion error ${error.message}`);
                        else fastify.log.info(`${zipDir} deleted`);
                      });
                      resolve(result);
                    })
                    .catch((err) => reject(err));
                })
                .catch((errPrc) => reject(errPrc));
            })
            .on('error', (error) => {
              reject(new InternalError(`Extracting zip ${filename}`, error));
            });
        } catch (err) {
          reject(new InternalError(`Processing zip ${filename}`, err));
        }
      })
  );

  fastify.decorate('scanFolder', (request, reply) => {
    const scanTimestamp = new Date().getTime();
    const dataFolder = path.join(__dirname, '../data');
    if (!fs.existsSync(dataFolder))
      reply.send(
        new InternalError('Scanning data folder', new Error(`${dataFolder} does not exist`))
      );
    else {
      fastify.log.info(`Started scanning folder ${dataFolder}`);
      reply.send(`Started scanning ${dataFolder}`);
      fastify
        .addProcessing(request.params, request.query, dataFolder, false, 1, '', request.epadAuth)
        .then(() => {
          fastify
            .processFolder(dataFolder, request.params, {}, request.epadAuth)
            .then(async (result) => {
              // poll dicomweb to update the counts
              await fastify.pollDWStudies();
              fastify.log.info(
                `Finished processing ${dataFolder} at ${new Date().getTime()} with ${
                  result.success
                } started at ${scanTimestamp}`
              );
              new EpadNotification(request, 'Folder scan completed', dataFolder, true).notify(
                fastify
              );
            })
            .catch((err) => {
              fastify.log.warn(`Error processing ${dataFolder} Error: ${err.message}`);
              new EpadNotification(request, 'Folder scan failed', err, true).notify(fastify);
            });
        })
        .catch((errPrc) => {
          fastify.log.warn(`Error processing ${dataFolder} Error: ${errPrc.message}`);
          new EpadNotification(request, 'Folder scan failed', errPrc, true).notify(fastify);
        });
    }
  });

  fastify.decorate(
    'processFolder',
    (zipDir, params, query, epadAuth, filesOnly = false, zipFilesToIgnore = []) =>
      new Promise((resolve, reject) => {
        fastify.log.info(`Processing folder ${zipDir} filesonly: ${filesOnly}`);
        const datasets = [];
        // success variable is to check if there was at least one successful processing
        const result = { success: false, errors: [] };
        const studies = new Set();
        fs.readdir(zipDir, async (err, files) => {
          if (err) {
            reject(new InternalError(`Reading directory ${zipDir}`, err));
          } else {
            try {
              if (!filesOnly) {
                // keep track of processing
                for (let i = 0; i < files.length; i += 1) {
                  if (files[i] !== '__MACOSX')
                    if (fs.statSync(path.join(zipDir, files[i])).isDirectory() === true)
                      // eslint-disable-next-line no-await-in-loop
                      await fastify.addProcessing(
                        params,
                        query,
                        path.join(zipDir, files[i]),
                        false,
                        1,
                        '',
                        epadAuth
                      );
                }
                await fastify.updateProcessing(params, query, zipDir, true, undefined, epadAuth);
              }
              const promisses = [];
              for (let i = 0; i < files.length; i += 1) {
                if (files[i] !== '__MACOSX')
                  if (fs.statSync(`${zipDir}/${files[i]}`).isDirectory() === true)
                    try {
                      if (!filesOnly) {
                        // eslint-disable-next-line no-await-in-loop
                        const subdirResult = await fastify.processFolder(
                          path.join(zipDir, files[i]),
                          params,
                          query,
                          epadAuth
                        );
                        if (subdirResult && subdirResult.errors && subdirResult.errors.length > 0) {
                          result.errors = result.errors.concat(subdirResult.errors);
                        }
                        if (subdirResult && subdirResult.success) {
                          result.success = result.success || subdirResult.success;
                        }
                      }
                    } catch (folderErr) {
                      reject(folderErr);
                    }
                  else {
                    promisses.push(() =>
                      fastify
                        .processFile(
                          zipDir,
                          files[i],
                          datasets,
                          params,
                          query,
                          studies,
                          epadAuth,
                          zipFilesToIgnore
                        )
                        .catch((error) => {
                          result.errors.push(error);
                        })
                    );
                  }
              }
              pq.addAll(promisses).then(async (values) => {
                try {
                  for (let i = 0; i < values.length; i += 1) {
                    if (values[i] && values[i].success) {
                      // one success is enough
                      result.success = true;
                      // I cannot break because of errors accumulation, I am not sure about performance
                      // break;
                    }
                    if (values[i] && values[i].errors && values[i].errors.length > 0)
                      result.errors = result.errors.concat(values[i].errors);
                  }
                  if (datasets.length > 0) {
                    pqDicoms
                      .add(() => fastify.sendDicomsInternal(params, epadAuth, studies, datasets))
                      .then(async () => {
                        await fastify.removeProcessing(params, query, zipDir);
                        resolve(result);
                      })
                      .catch((error) => reject(error));
                  } else {
                    await fastify.removeProcessing(params, query, zipDir);
                    resolve(result);
                  }
                } catch (saveDicomErr) {
                  reject(saveDicomErr);
                }
              });
            } catch (errDir) {
              reject(errDir);
            }
          }
        });
      })
  );

  fastify.decorate(
    'processFile',
    (dir, filename, datasets, params, query, studies, epadAuth, zipFilesToIgnore = []) =>
      new Promise((resolve, reject) => {
        try {
          let buffer = [];
          const readableStream = fs.createReadStream(`${dir}/${filename}`);
          readableStream.on('data', (chunk) => {
            buffer.push(chunk);
          });
          readableStream.on('error', (readErr) => {
            fastify.log.error(`Error in save when reading file ${dir}/${filename}: ${readErr}`);
            reject(new InternalError(`Reading file ${dir}/${filename}`, readErr));
          });
          readableStream.on('close', () => {
            readableStream.destroy();
          });
          readableStream.on('end', async () => {
            buffer = Buffer.concat(buffer);
            // fastify.log.info(`Finished reading ${dir}/${filename}. Buffer length ${buffer.length}`);
            if (filename.endsWith('dcm') && !filename.startsWith('__MACOSX')) {
              try {
                const arrayBuffer = toArrayBuffer(buffer);
                const dicomInfo = await fastify.getDicomInfo(arrayBuffer, params, epadAuth);
                studies.add(dicomInfo);
                datasets.push(arrayBuffer);
                // TODO this doesn't work, should we chunk it during send again?
                // if (datasets.length >= fastify.chunkSize) {
                //   await pqDicoms.add(() => {
                //     return fastify.sendDicomsInternal(params, epadAuth, studies, datasets);
                //   });
                //   // eslint-disable-next-line no-param-reassign
                //   datasets = [];
                //   // eslint-disable-next-line no-param-reassign
                //   studies = new Set();
                // }
                resolve({ success: true, errors: [] });
              } catch (err) {
                reject(new InternalError(`Reading dicom file ${filename}`, err));
              }
            } else if (filename.endsWith('json') && !filename.startsWith('__MACOSX')) {
              const jsonBuffer = JSON.parse(buffer.toString());
              if ('TemplateContainer' in jsonBuffer) {
                // is it a template?
                fastify
                  .saveTemplateInternal(jsonBuffer)
                  .then(async () => {
                    try {
                      await fastify.addProjectTemplateRelInternal(
                        jsonBuffer.TemplateContainer.uid,
                        params.project,
                        query,
                        epadAuth
                      );
                      fastify.log.info(`Saving successful for ${filename}`);
                      resolve({ success: true, errors: [] });
                    } catch (errProject) {
                      reject(errProject);
                    }
                  })
                  .catch((err) => {
                    reject(err);
                  });
              } else if (
                (query.forceSave && query.forceSave === 'true') ||
                (jsonBuffer.ImageAnnotationCollection &&
                  jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .typeCode[0].code &&
                  jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                    .typeCode[0].code !== 'SEG')
              ) {
                // aim saving via upload, ignore SEG Only annotations
                fastify
                  .saveAimJsonWithProjectRef(jsonBuffer, params, epadAuth, filename)
                  .then((res) => {
                    try {
                      resolve(res);
                    } catch (errProject) {
                      reject(errProject);
                    }
                  })
                  .catch((err) => {
                    reject(err);
                  });
              } else {
                reject(new Error(`SEG Only aim upload not supported (${filename})`));
              }
            } else if (filename.endsWith('xml') && !filename.startsWith('__MACOSX')) {
              fastify
                .parseOsirix(`${dir}/${filename}`)
                .then((osirixObj) => {
                  const { filteredOsirix, nonSupported } = fastify.filterOsirixAnnotations(
                    osirixObj.Images
                  );
                  const keys = Object.keys(filteredOsirix);
                  const values = Object.values(filteredOsirix);
                  const { username } = epadAuth;
                  const promiseArr = [];
                  const result = { errors: [] };
                  values.forEach((annotation) => {
                    promiseArr.push(
                      fastify.getImageMetaDataforOsirix(annotation, username).catch((error) => {
                        result.errors.push(error);
                      })
                    );
                  });
                  Promise.all(promiseArr).then((seedDataArr) => {
                    if (result.errors.length === promiseArr.length) {
                      reject(new InternalError(`Can not find the image`, result.errors[0]));
                    } else {
                      seedDataArr.forEach((seedData, i) => {
                        if (seedData) {
                          filteredOsirix[keys[i]] = { ...values[i], seedData };
                        }
                      });
                      const aimJsons = fastify.createAimJsons(Object.values(filteredOsirix));
                      const aimsavePromises = [];
                      aimJsons.forEach((jsonBuffer) => {
                        aimsavePromises.push(
                          fastify
                            .saveAimJsonWithProjectRef(jsonBuffer, params, epadAuth, filename)
                            .catch((error) => {
                              result.errors.push(error);
                            })
                        );
                      });
                      Promise.all(aimsavePromises)
                        .then(() => {
                          try {
                            const uploadMsg = 'Upload Failed as ';
                            let errMessage = 'none of the files were uploaded successfully';
                            if (result.errors.length === promiseArr.length) {
                              reject(new InternalError(uploadMsg, new Error(errMessage)));
                            } else {
                              // eslint-disable-next-line no-lonely-if
                              if (nonSupported.length) {
                                errMessage = `Not supported shapes in: ${nonSupported.join(', ')}`;
                                const error = new InternalError(
                                  'Upload completed with errors',
                                  new Error(errMessage)
                                );
                                if (result.errors.length > 0) {
                                  fastify.log.info(`Saving successful`);
                                  resolve({ success: true, errors: [...result.errors, error] });
                                } else {
                                  fastify.log.info(`Saving successful`);
                                  resolve({ success: true, errors: [error] });
                                }
                              } else {
                                fastify.log.info(`Saving successful`);
                                resolve({ success: true, errors: result.errors });
                              }
                            }
                          } catch (errProject) {
                            reject(errProject);
                          }
                        })
                        .catch((err) => {
                          const uploadMsg = 'Upload Failed as ';
                          const errMessage = 'none of the files were uploaded successfully';
                          reject(new InternalError(uploadMsg + errMessage, err));
                        });
                    }
                  });
                })
                .catch(() => {
                  reject(
                    new BadRequestError(
                      'Uploading files',
                      new Error(`Unsupported filetype for file ${dir}/${filename}`)
                    )
                  );
                });
            } else if (
              filename.endsWith('zip') &&
              !filename.startsWith('__MACOSX') &&
              !zipFilesToIgnore.includes(path.join(dir, filename))
            ) {
              fastify
                .processZip(dir, filename, params, query, epadAuth)
                .then((result) => {
                  resolve(result);
                })
                .catch((err) => reject(err));
            } else if (fastify.checkFileType(filename) && filename !== '.DS_Store')
              // check .DS_Store just in case
              fastify
                .saveOtherFileToProjectInternal(
                  filename,
                  params,
                  query,
                  buffer,
                  Buffer.byteLength(buffer),
                  epadAuth
                )
                .then(() => {
                  resolve({ success: true, errors: [] });
                })
                .catch((err) => reject(err));
            else {
              // check to see if it is a dicom file with no dcm extension
              const ext = fastify.getExtension(filename);
              if (ext === '' || /^\d+$/.test(ext)) {
                try {
                  const arrayBuffer = toArrayBuffer(buffer);
                  const dicomInfo = await fastify.getDicomInfo(arrayBuffer, params, epadAuth);
                  studies.add(dicomInfo);
                  datasets.push(arrayBuffer);
                  // TODO this doesn't work, should we chunk it during send again?
                  // if (datasets.length >= fastify.chunkSize) {
                  //   await pqDicoms.add(() => {
                  //     return fastify.sendDicomsInternal(params, epadAuth, studies, datasets);
                  //   });
                  //   // eslint-disable-next-line no-param-reassign
                  //   datasets = [];
                  //   // eslint-disable-next-line no-param-reassign
                  //   studies = new Set();
                  // }
                  resolve({ success: true, errors: [] });
                } catch (err) {
                  reject(
                    new BadRequestError(
                      'Uploading files',
                      new Error(`Unsupported filetype for file ${dir}/${filename}`)
                    )
                  );
                }
              } else
                reject(
                  new BadRequestError(
                    'Uploading files',
                    new Error(`Unsupported filetype for file ${dir}/${filename}`)
                  )
                );
            }
          });
        } catch (err) {
          reject(new InternalError(`Processing file ${filename}`, err));
        }
      })
  );

  fastify.decorate('createAimJsons', (filteredOsirixArr) => {
    try {
      const aimJsons = [];
      filteredOsirixArr.forEach((el) => {
        const aim = new Aim(el.seedData, fastify.enumAimType.imageAnnotation);
        const markupsToSave = el.rois.map((roi) => fastify.formMarupksToSave(roi));
        fastify.createAimMarkups(aim, markupsToSave);
        const aimJson = JSON.parse(aim.getAim());
        aimJsons.push(aimJson);
      });
      return aimJsons;
    } catch (err) {
      return new InternalError('Creating aim jsons', err);
    }
  });

  fastify.decorate('enumAimType', {
    imageAnnotation: 1,
    seriesAnnotation: 2,
    studyAnnotation: 3,
  });

  fastify.decorate('formMarupksToSave', (roi) => {
    // eslint-disable-next-line camelcase
    const { SOPInstanceUID, Type, IndexInImage, Max, Mean, Min, Dev, LengthCm, AreaCm2 } = roi;
    const points = fastify.createPointsArrForOsirix(roi.Point_px);
    return {
      imageReferenceUid: SOPInstanceUID,
      markup: {
        max: Max,
        mean: Mean,
        min: Min,
        stdDev: Dev,
        points,
        LengthCm,
        AreaCm2,
      },
      shapeIndex: IndexInImage,
      type: Type,
    };
  });

  // if new supported objects are added filterOsirixAnnotations should be updated
  fastify.decorate('createAimMarkups', (aim, markupsToSave) => {
    markupsToSave.forEach((value) => {
      const { type, markup, shapeIndex, imageReferenceUid } = value;
      switch (type) {
        case 19:
          fastify.addPointToAim(aim, markup, shapeIndex, imageReferenceUid);
          break;
        case 5:
        case 14:
          fastify.addLineToAim(aim, markup, shapeIndex, imageReferenceUid);
          break;
        case 15:
        case 10:
        case 9:
        case 28:
        case 20:
        case 11:
        case 6:
          fastify.addPolygonToAim(aim, markup, shapeIndex, imageReferenceUid);
          break;
        default:
          break;
      }
    });
  });

  fastify.decorate('addPolygonToAim', (aim, polygon, shapeIndex, imageReferenceUid) => {
    const { points } = polygon;
    // eslint-disable-next-line no-unused-vars
    const markupId = aim.addMarkupEntity(
      'TwoDimensionPolyline',
      shapeIndex,
      points,
      imageReferenceUid,
      1
    );
    fastify.createCalcEntity(aim, markupId, polygon);
  });

  fastify.decorate('createCalcEntity', (aim, markupId, shape) => {
    const { AreaCm2, mean, stdDev, min, max, LengthCm } = shape;
    const unit = 'linear';

    if (mean) {
      const meanId = aim.createMeanCalcEntity({ mean, unit });
      aim.createImageAnnotationStatement(1, markupId, meanId);
    }

    if (stdDev) {
      const stdDevId = aim.createStdDevCalcEntity({ stdDev, unit });
      aim.createImageAnnotationStatement(1, markupId, stdDevId);
    }

    if (min) {
      const minId = aim.createMinCalcEntity({ min, unit });
      aim.createImageAnnotationStatement(1, markupId, minId);
    }

    if (max) {
      const maxId = aim.createMaxCalcEntity({ max, unit });
      aim.createImageAnnotationStatement(1, markupId, maxId);
    }

    if (LengthCm) {
      const lengthId = aim.createLengthCalcEntity({
        value: LengthCm,
        unit: 'cm',
      });
      aim.createImageAnnotationStatement(1, markupId, lengthId);
    }

    if (AreaCm2) {
      const areaId = aim.createAreaCalcEntity({ value: AreaCm2, unit: 'cm2' });
      aim.createImageAnnotationStatement(1, markupId, areaId);
    }
  });

  fastify.decorate('addPointToAim', (aim, point, shapeIndex, imageReferenceUid) => {
    const { points } = point;
    aim.addMarkupEntity('TwoDimensionPoint', shapeIndex, points, imageReferenceUid, 1);
  });

  fastify.decorate('addLineToAim', (aim, line, shapeIndex, imageReferenceUid) => {
    const { points } = line;
    const markupId = aim.addMarkupEntity(
      'TwoDimensionMultiPoint',
      shapeIndex,
      points,
      imageReferenceUid,
      1
    );

    fastify.createCalcEntity(aim, markupId, line);
  });

  fastify.decorate('createPointsArrForOsirix', (osirixCoordinates) => {
    const arr = osirixCoordinates.map((el) => {
      const coors = el.split(',');
      const x = coors[0].trim().substr(1);
      let y = coors[1].trim();
      y = y.substr(0, y.length - 1);
      return { x: parseFloat(x), y: parseFloat(y) };
    });
    return arr;
  });
  fastify.decorate(
    'parseOsirix',
    (docPath) =>
      new Promise((resolve, reject) => {
        try {
          const osirixObj = plist.parse(fs.readFileSync(docPath, 'utf8'));
          resolve(osirixObj);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getImageMetaDataforOsirix',
    (annotation, username) =>
      new Promise(async (resolve, reject) => {
        try {
          const { SOPInstanceUID, SeriesInstanceUID, StudyInstanceUID } = annotation.rois[0];
          const parameters = {
            instance: SOPInstanceUID,
            series: SeriesInstanceUID,
            study: StudyInstanceUID,
          };
          const seedData = await fastify.getImageMetadata(parameters);
          const answers = fastify.getTemplateAnswers(seedData, annotation.name, '');
          const merged = { ...seedData.aim, ...answers };
          seedData.aim = merged;
          seedData.user = { loginName: username, name: username };
          resolve(seedData);
        } catch (err) {
          reject(new InternalError(`Getting data from image`, err));
        }
      })
  );

  // eslint-disable-next-line consistent-return
  fastify.decorate('getTemplateAnswers', (metadata, annotationName, tempModality) => {
    if (metadata.series) {
      const { number, description, instanceNumber } = metadata.series;
      const seriesModality = metadata.series.modality;
      const comment = {
        value: `${seriesModality} / ${description} / ${instanceNumber} / ${number}`,
      };
      const modality = { value: tempModality };
      const name = { value: annotationName };
      const typeCode = [
        {
          code: 'ROI',
          codeSystemName: '99EPAD',
          'iso:displayName': { 'xmlns:iso': 'uri:iso.org:21090', value: 'ROI Only' },
        },
      ];
      return { comment, modality, name, typeCode };
    }
  });

  // if new supported objects are added createAimMarkups should be updated
  fastify.decorate('filterOsirixAnnotations', (imagesArr) => {
    const filteredOsirix = {};
    const nonSupported = [];
    const supportedTypes = [19, 5, 14, 15, 10, 9, 28, 20, 11, 6];
    imagesArr.forEach((img) => {
      img.ROIs.reduce((all, item) => {
        if (supportedTypes.includes(item.Type)) {
          const key = `${item.Name}${item.SeriesInstanceUID}`;
          if (all[key]) {
            all[key].rois.push(item);
          } else {
            // eslint-disable-next-line no-param-reassign
            all[key] = { name: item.Name, rois: [item] };
          }
        } else {
          nonSupported.push(item.Name);
        }
        return all;
      }, filteredOsirix);
    });
    return { filteredOsirix, nonSupported };
  });

  fastify.decorate(
    'saveOtherFileToProjectInternal',
    (filename, params, query, buffer, length, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const timestamp = new Date().getTime();
          // create fileInfo
          const fileInfo = {
            project_uid: params.project ? params.project : 'NA',
            subject_uid: params.subject ? params.subject : 'NA',
            study_uid: params.study ? params.study : 'NA',
            series_uid: params.series ? params.series : 'NA',
            name: `${filename}__ePad__${timestamp}`,
            filepath: 'couchdb',
            filetype: query.filetype ? query.filetype : '',
            length,
          };
          // add link to db
          await fastify.putOtherFileToProjectInternal(fileInfo.name, params, epadAuth);
          // add to couchdb only if successful
          await fastify.saveOtherFileInternal(filename, fileInfo, buffer);

          resolve();
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getExtension', (filename) => {
    const ext = path.extname(filename).replace('.', '');
    if (ext === '') return '';
    return ext.toLowerCase();
  });

  fastify.decorate('checkFileType', (filename) => {
    const ext = fastify.getExtension(filename);
    return ext !== '' && config.validExt.includes(fastify.getExtension(filename));
  });

  fastify.decorate('deleteSubject', (request, reply) => {
    fastify.log.info(`Deleting subject ${request.params.subject}`);
    if (config.env !== 'test') {
      fastify.log.info(
        `Subject ${request.params.subject} deletion request recieved, sending response`
      );
      reply
        .code(202)
        .send(`Subject ${request.params.subject} deletion request recieved. deleting..`);
    }
    if (!config.disableDICOMSend)
      fastify
        .deleteSubjectInternal(request.params, request.epadAuth)
        .then((result) => {
          if (config.env !== 'test')
            new EpadNotification(request, 'Deleted subject', request.params.subject, true).notify(
              fastify
            );
          else reply.code(200).send(result);
        })
        .catch((err) => {
          if (config.env !== 'test')
            new EpadNotification(
              request,
              'Delete subject failed',
              new Error(request.params.subject)
            ).notify(fastify);
          else reply.send(err);
        });
    else {
      fastify.log.err('DICOMSend disabled');
      reply.send(new InternalError('Subject delete from system', new Error('DICOMSend disabled')));
    }
  });

  fastify.decorate(
    'deleteSubjectInternal',
    (params, epadAuth) =>
      new Promise((resolve, reject) => {
        const promisses = [];
        fastify
          .getPatientStudiesInternal(params, undefined, epadAuth, {}, true)
          .then((result) => {
            if (!config.disableDICOMSend)
              result.forEach((study) => {
                promisses.push(() =>
                  fastify.deleteStudyDicomsInternal({
                    subject: params.subject,
                    study: study.studyUID,
                  })
                );
              });
            else fastify.log.info('DICOM Send disabled. Skipping subject DICOM delete');
            promisses.push(() => fastify.deleteAimsInternal(params, epadAuth, { all: 'true' }));
            pq.addAll(promisses)
              .then(() => {
                fastify.log.info(`Subject ${params.subject} deletion is initiated successfully`);
                resolve(`Subject ${params.subject} deletion is initiated successfully`);
              })
              .catch((error) => {
                reject(new InternalError(`Deleting subject ${params.subject}`, error));
              });
          })
          .catch((getError) => {
            reject(
              new InternalError(`Getting studies of ${params.subject} for deletion`, getError)
            );
          });
      })
  );

  fastify.decorate('deleteStudy', (request, reply) => {
    if (config.env !== 'test') {
      fastify.log.info(
        `Study ${request.params.study} of Subject ${request.params.subject} deletion request recieved, sending response`
      );
      reply.code(202).send(`Study ${request.params.study} deletion request recieved. deleting..`);
    }
    if (!config.disableDICOMSend)
      fastify
        .deleteStudyInternal(request.params, request.epadAuth)
        .then((result) => {
          if (config.env !== 'test')
            new EpadNotification(request, 'Deleted study', request.params.study, true).notify(
              fastify
            );
          else reply.code(200).send(result);
        })
        .catch((err) => {
          if (config.env !== 'test')
            new EpadNotification(
              request,
              'Delete study failed',
              new Error(request.params.subject)
            ).notify(fastify);
          else reply.send(err);
        });
    else {
      fastify.log.err('DICOMSend disabled');
      reply.send(new InternalError('Study delete from system', new Error('DICOMSend disabled')));
    }
  });

  fastify.decorate(
    'deleteStudyInternal',
    (params, epadAuth) =>
      new Promise((resolve, reject) => {
        // delete study in dicomweb and annotations
        const promisses = [];
        promisses.push(() => fastify.deleteStudyDicomsInternal(params));
        promisses.push(() => fastify.deleteAimsInternal(params, epadAuth, { all: 'true' }));
        pq.addAll(promisses)
          .then(() => {
            fastify.log.info(`Study ${params.study} deletion is initiated successfully`);
            resolve();
          })
          .catch((error) => {
            reject(error);
          });
      })
  );

  fastify.decorate('deleteSeries', (request, reply) => {
    try {
      // delete study in dicomweb and annotations
      const promisses = [];
      promisses.push(() =>
        fastify.deleteNonDicomSeriesInternal(request.params.series).catch((err) => {
          if (err.message !== 'No nondicom entity')
            fastify.log.warn(
              `Could not delete nondicom series. Error: ${err.message}. Trying dicom series delete`
            );
          return fastify.deleteSeriesDicomsInternal(request.params);
        })
      );
      promisses.push(() =>
        fastify.deleteSeriesAimProjectRels(request.params, request.epadAuth.username)
      );
      promisses.push(() =>
        fastify.deleteAimsInternal(request.params, request.epadAuth, { all: 'true' })
      );
      if (config.env !== 'test') {
        fastify.log.info(
          `Series ${request.params.series} of Subject ${request.params.subject} deletion request recieved, sending response`
        );
        reply.code(202).send(`Study ${request.params.study} deletion request recieved. deleting..`);
      }
      pq.addAll(promisses)
        .then(() => {
          fastify.log.info(`Series ${request.params.series} deletion is initiated successfully`);
          if (config.env !== 'test')
            new EpadNotification(request, 'Deleted series', request.params.series, true).notify(
              fastify
            );
          else
            reply
              .code(200)
              .send(`Series ${request.params.series} deletion is initiated successfully`);
        })
        .catch((error) => {
          reply.send(error);
        });
    } catch (err) {
      if (config.env !== 'test')
        new EpadNotification(
          request,
          'Delete series failed',
          new Error(request.params.subject)
        ).notify(fastify);
      else reply.send(err);
    }
  });

  fastify.decorate('getNotifications', (request, reply) => {
    try {
      // if there is corsorigin in config and it is not false then reflect request origin
      reply.raw.writeHead(200, {
        ...{
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
        // only put Access-Control-Allow-Origin if request has origin
        ...(config.corsOrigin && request.headers.origin
          ? { 'Access-Control-Allow-Origin': request.headers.origin }
          : {}),
      });
      const padding = new Array(2049);
      reply.raw.write(`:${padding.join(' ')}\n`); // 2kB padding for IE
      reply.raw.write('retry: 2000\n');
      fastify.addConnectedUser(request, reply);
      const id = setInterval(() => {
        // eslint-disable-next-line no-param-reassign
        fastify.messageId += 1;
        reply.raw.write(`id: ${fastify.messageId}\n`);
        reply.raw.write(`data: heartbeat\n\n`);
      }, 1000);
      request.raw.on('close', () => {
        clearInterval(id);
        fastify.deleteDisconnectedUser(request);
      }); // <- Remove this user when he disconnects
    } catch (err) {
      if (config.auth && config.auth !== 'none' && request.epadAuth === undefined)
        reply.send(new UnauthenticatedError('No epadauth in request'));
      else
        reply.send(
          new InternalError(`Adding user ${request.epadAuth.username} to notification list`, err)
        );
    }
  });

  fastify.decorate('getInfoFromRequest', (request) => {
    try {
      const reqInfo = {};
      reqInfo.method = request.raw.method;
      const methodText = { GET: 'GET', POST: 'CREATE', PUT: 'UPDATE', DELETE: 'DELETE' };
      reqInfo.methodText = methodText[request.raw.method];
      let cleanUrl = config.prefix
        ? request.raw.url.replace(`/${config.prefix}`, '')
        : request.raw.url;
      const queryStart = cleanUrl.indexOf('?');
      if (queryStart !== -1) cleanUrl = cleanUrl.substring(0, queryStart);
      const urlParts = cleanUrl.split('/');
      const levels = {
        projects: 'project',
        subjects: 'subject',
        studies: 'study',
        series: 'series',
        images: 'image',
        aims: 'aim',
        files: 'file',
        templates: 'template',
        users: 'user',
        worklists: 'worklist',
        ontology: 'ontology',
      };
      if (urlParts[urlParts.length - 1] === 'download') reqInfo.methodText = 'DOWNLOAD';
      if (levels[urlParts[urlParts.length - 1]]) {
        if (reqInfo.method === 'POST') reqInfo.level = levels[urlParts[urlParts.length - 1]];
        else reqInfo.level = urlParts[urlParts.length - 1];
      } else if (levels[urlParts[urlParts.length - 2]]) {
        reqInfo.level = levels[urlParts[urlParts.length - 2]];
        reqInfo.objectId = urlParts[urlParts.length - 1];
      } else reqInfo.level = request.raw.url;
      // eslint-disable-next-line prefer-destructuring
      if (urlParts[1] === 'projects' && urlParts.length > 1) reqInfo.project = urlParts[2];
      if (urlParts[1] === 'worklists') {
        reqInfo.level = 'worklist';
        // eslint-disable-next-line prefer-destructuring
        if (urlParts.length > 1) reqInfo.objectId = urlParts[2];
      }
      return reqInfo;
    } catch (err) {
      throw new InternalError('Getting request info from url', err);
    }
  });

  fastify.decorate('getUserInfo', (request, reply) => {
    const authHeader = request.headers['x-access-token'] || request.headers.authorization;
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      // Extract the token
      token = authHeader.slice(7, authHeader.length);
    }
    if (config.auth !== 'external') {
      reply.send(new InternalError('Not supported', new Error('Auth mode not external')));
    } else if (token === '') {
      reply.send(
        new InternalError(
          'Not supported',
          new Error('External mode userinfo only suported with bearer tokens')
        )
      );
    } else {
      fastify
        .getUserInfoInternal(token)
        .then((result) => {
          reply.code(200).send(result);
        })
        .catch((err) => {
          reply.send(err);
        });
    }
  });

  fastify.decorate(
    'getUserInfoInternal',
    (token) =>
      new Promise(async (resolve, reject) => {
        if (!config.authConfig.userinfoUrl)
          reject(
            new InternalError(
              'Retrieving userinfo from external',
              new Error('No userinfoUrl in config')
            )
          );
        try {
          const userinfoResponse = await axios.get(config.authConfig.userinfoUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (userinfoResponse.status === 200) resolve(userinfoResponse.data);
          else
            reject(
              new InternalError(
                'Retrieving userinfo from external',
                new Error(`External resource returned ${userinfoResponse.status}`)
              )
            );
        } catch (err) {
          reject(new InternalError('Retrieving userinfo from external', err));
        }
      })
  );

  // authCheck routine checks if there is a bearer token or encoded basic authentication
  // info in the authorization header and does the authentication or verification of token
  // in keycloak
  fastify.decorate('authCheck', async (authHeader, res) => {
    if (authHeader.startsWith('Bearer ')) {
      // Extract the token
      const token = authHeader.slice(7, authHeader.length);
      if (token) {
        // verify token online
        try {
          let username = '';
          let userInfo = {};
          if (config.auth !== 'external') {
            const verifyToken = await keycloak.jwt.verify(token);
            if (verifyToken.isExpired()) {
              res.send(new UnauthenticatedError('Token is expired'));
            } else {
              username = verifyToken.content.preferred_username || verifyToken.content.email;
              userInfo = verifyToken.content;
            }
          } else {
            // try getting userinfo from external auth server with userinfo endpoint
            const userinfo = await fastify.getUserInfoInternal(token);
            username = userinfo.preferred_username || userinfo.email;
            userInfo = userinfo;
          }
          if (username !== '' || userInfo !== '')
            return await fastify.fillUserInfo(username, userInfo);
          res.send(new UnauthenticatedError(`Username couldn't be retrieeved`));
        } catch (err) {
          res.send(
            new UnauthenticatedError(`Verifying token and getting userinfo: ${err.message}`)
          );
        }
      }
    } else if (authHeader.startsWith('Basic ')) {
      if (config.auth === 'external')
        res.send(
          new UnauthenticatedError(`Basic authentication not supported in external auth mode`)
        );
      else {
        // Extract the encoded part
        const authToken = authHeader.slice(6, authHeader.length);
        if (authToken) {
          // Decode and extract username and password
          const auth = atob(authToken);
          const [username, password] = auth.split(':');
          // put the username and password in keycloak object
          keycloak.accessToken.config.username = username;
          keycloak.accessToken.config.password = password;
          try {
            // see if we can authenticate
            // keycloak supports oidc, this is a workaround to support basic authentication
            const accessToken = await keycloak.accessToken.get();
            if (!accessToken) {
              res.send(new UnauthenticatedError('Authentication unsuccessful'));
            } else {
              return await fastify.fillUserInfo(username);
            }
          } catch (err) {
            res.send(
              new UnauthenticatedError(`Authenticating and getting user info: ${err.message}`)
            );
          }
        }
      }
    } else {
      res.send(new UnauthenticatedError('Bearer token does not exist'));
    }
    return undefined;
  });

  fastify.decorate(
    'fillUserInfo',
    (username, userInfo) =>
      new Promise(async (resolve, reject) => {
        const epadAuth = { username };
        try {
          let user = null;
          try {
            user = await fastify.getUserInternal({
              user: username,
            });
            if (!user.firstname && !user.email) throw Error('not filled');
          } catch (err) {
            // fallback get by email
            if ((!user || err.message === 'not filled') && userInfo) {
              user = await fastify.getUserInternal({
                user: userInfo.email,
              });
              // update user db record here
              const rowsUpdated = {
                username,
                firstname: userInfo.given_name || userInfo.givenName,
                lastname: userInfo.family_name || userInfo.surname,
                email: userInfo.email,
                updated_by: 'admin',
                updatetime: Date.now(),
              };
              await fastify.updateUserInternal(rowsUpdated, { user: userInfo.email });
              await fastify.updateUserInWorklistCompleteness(userInfo.email, username);
              user = await fastify.getUserInternal({
                user: username,
              });
            } else reject(err);
          }
          if (user) {
            epadAuth.permissions = user.permissions;
            epadAuth.projectToRole = user.projectToRole;
            epadAuth.admin = user.admin;
            // putting the email from db in epadAuth
            // TODO what if they change it just in keycloak
            epadAuth.email = user.email;
            epadAuth.firstname = userInfo ? userInfo.given_name : '';
            epadAuth.lastname = userInfo ? userInfo.family_name : '';
          }
        } catch (errUser) {
          reject(errUser);
        }
        resolve(epadAuth);
      })
  );

  fastify.decorate('messageId', 0);
  fastify.decorate('connectedUsers', {});
  fastify.decorate('sse', (messageJson, username = 'nouser') => {
    if (fastify.connectedUsers[username]) {
      fastify.connectedUsers[username].write(`id: ${fastify.messageId}\n`);
      // eslint-disable-next-line no-param-reassign
      fastify.messageId += 1;
      fastify.connectedUsers[username].write(`data: ${JSON.stringify(messageJson)}\n\n`);
      return true;
    }
    return false;
  });
  fastify.decorate(
    'addConnectedUser',
    // eslint-disable-next-line no-return-assign
    async (req, res) => {
      fastify.log.info(
        `Adding ${req.epadAuth && req.epadAuth.username ? req.epadAuth.username : 'nouser'}`
      );
      // eslint-disable-next-line no-param-reassign
      fastify.connectedUsers[
        req.epadAuth && req.epadAuth.username ? req.epadAuth.username : 'nouser'
      ] = res.raw;
      fastify.saveEventLog(
        req,
        {
          username: req.epadAuth.username ? req.epadAuth.username : 'nouser',
          function: 'User Logged In',
          params: req.hostname,
          createdtime: new Date(),
          error: false,
          refresh: false,
        },
        true
      );
      // send unsent notifications
      await fastify.getUnnotifiedEventLogs(req);
    }
  );
  fastify.decorate(
    'deleteDisconnectedUser',
    // eslint-disable-next-line no-return-assign
    (req) => {
      fastify.log.info(
        `Deleting ${req.epadAuth && req.epadAuth.username ? req.epadAuth.username : 'nouser'}`
      );
      // eslint-disable-next-line no-param-reassign
      delete fastify.connectedUsers[
        req.epadAuth && req.epadAuth.username ? req.epadAuth.username : 'nouser'
      ];
      fastify.log.info('Current users');
      fastify.log.info(fastify.connectedUsers);
      fastify.saveEventLog(
        req,
        {
          username: req.epadAuth.username ? req.epadAuth.username : 'nouser',
          function: 'User Logged Out',
          params: req.hostname,
          createdtime: new Date(),
          error: false,
          refresh: false,
        },
        true
      );
    }
  );

  fastify.decorate('auth', async (req, res) => {
    // ignore swagger routes
    if (
      config.auth &&
      config.auth !== 'none' &&
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/documentation`) &&
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/epads/stats`) &&
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/epad/statistics`) && // disabling auth for put is dangerous
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/download`) &&
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/ontology`) &&
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/decryptandgrantaccess?`) &&
      !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/apikeys`) &&
      !(
        req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/appVersion`) && req.method === 'POST'
      ) &&
      req.method !== 'OPTIONS'
    ) {
      // if auth has been given in config, verify authentication
      const authHeader = req.headers['x-access-token'] || req.headers.authorization;
      if (authHeader) {
        if (authHeader.startsWith('Bearer')) {
          req.epadAuth = await fastify.authCheck(authHeader, res);
        } else if (authHeader.startsWith('apikey')) {
          // apikey auth support
          // TODO should be https (&& req.protocol === 'https') it doesn't work because of nginx
          // TODO create user if not exists?
          req.epadAuth = await fastify.validateApiKeyInternal(req);
          if (!req.epadAuth && !req.raw.url.startsWith(`${fastify.getPrefixForRoute()}/wado`))
            res.send(
              new UnauthenticatedError(
                'Request should have user in the query for apikey authentication'
              )
            );
        } else {
          res.send(
            new UnauthenticatedError('Authentication header does not conform with the server')
          );
        }
      } else {
        res.send(
          new UnauthenticatedError('Authentication info does not exist or conform with the server')
        );
      }
    } else if ((config.env === 'test' || config.auth === 'none') && req.query.username) {
      // just see if the url has username. for testing purposes
      try {
        req.epadAuth = await fastify.fillUserInfo(req.query.username);
      } catch (err) {
        res.send(new UnauthenticatedError(`Cannot fill in epadAuth for test ${err.message}`));
      }
    }
    try {
      if (!req.raw.url.startsWith('/documentation') && req.method !== 'OPTIONS')
        await fastify.epadThickRightsCheck(req, res);
    } catch (err) {
      res.send(err);
    }
  });

  fastify.decorate('hasAccessToProject', (request, project) => {
    try {
      fastify.log.info(
        `Checking hasAccessToProject for url: ${request.raw.url} and project ${project}`
      );
      if (request.epadAuth && request.epadAuth.projectToRole) {
        for (let i = 0; i < request.epadAuth.projectToRole.length; i += 1) {
          if (request.epadAuth.projectToRole[i].match(`${project}:.*`)) {
            fastify.log.info(
              `Has right ${request.epadAuth.projectToRole[i].substring(
                project.length + 1,
                request.epadAuth.projectToRole[i].length
              )}`
            );
            return request.epadAuth.projectToRole[i].substring(
              project.length + 1,
              request.epadAuth.projectToRole[i].length
            );
          }
        }
      }
      return undefined;
    } catch (err) {
      if (config.auth && config.auth !== 'none' && request.epadAuth === undefined)
        throw new UnauthenticatedError('No epadauth in request');
      else
        throw new InternalError(
          `Checking access for ${request.epadAuth.username}, project ${project}`,
          err
        );
    }
  });

  fastify.decorate('hasCreatePermission', (request, level) => {
    try {
      fastify.log.info(`Checking hasCreatePermission for url: ${request.raw.url} level:${level}`);
      if (
        ['project', 'user', 'connection', 'query', 'worklist'].includes(level) && // do we need this check
        request.epadAuth &&
        request.epadAuth.permissions
      ) {
        for (let i = 0; i < request.epadAuth.permissions.length; i += 1) {
          if (request.epadAuth.permissions[i].toLowerCase() === `create${level.toLowerCase()}`)
            return true;
        }
        return false;
      }
      return true;
    } catch (err) {
      if (config.auth && config.auth !== 'none' && request.epadAuth === undefined)
        throw new UnauthenticatedError('No epadauth in request');
      else
        throw new InternalError(
          `Checking create permission for ${request.epadAuth.username}, level ${level}`,
          err
        );
    }
  });

  fastify.decorate('isOwnerOfProject', (request, project) => {
    try {
      fastify.log.info(`Checking isOwnerOfProject for url: ${request.raw.url}`);
      if (request.epadAuth && request.epadAuth.projectToRole.includes(`${project}:Owner`))
        return true;
      return false;
    } catch (err) {
      if (config.auth && config.auth !== 'none' && request.epadAuth === undefined)
        throw new UnauthenticatedError('No epadauth in request');
      else
        throw new InternalError(
          `Checking ownership for ${request.epadAuth.username}, project ${project}`,
          err
        );
    }
  });

  fastify.decorate('isCreatorOfObject', async (request, reqInfo) => {
    try {
      fastify.log.info(
        `Checking isCreatorOfObject for url: ${request.raw.url} level:${reqInfo.level} object:${reqInfo.objectId}`
      );
      const creator = await fastify.getObjectCreator(
        reqInfo.level,
        reqInfo.objectId,
        reqInfo.project
      );
      fastify.log.info('Creator is', creator);
      if (creator && request.epadAuth && creator === request.epadAuth.username) return true;
      // not a db item return true
      if (!creator) {
        if (reqInfo.level === 'aim') {
          try {
            const author = await fastify.getAimAuthorFromUID(reqInfo.objectId);
            fastify.log.info('Author is', author);
            if (author === request.epadAuth.username) return true;
            return false;
          } catch (err) {
            fastify.log.error(`Getting author from aim: ${err.message}`);
            return false;
          }
        }
        return false;
      }
      return false;
    } catch (err) {
      if (config.auth && config.auth !== 'none' && request.epadAuth === undefined)
        throw new UnauthenticatedError('No epadauth in request');
      else
        throw new InternalError(
          `Checking creatorship for ${request.epadAuth.username}, level ${reqInfo.level}, object ${reqInfo.objectId}`,
          err
        );
    }
  });

  fastify.decorate('getPrefixForRoute', () => {
    if (config.prefix && config.prefix !== '') return `/${config.prefix}`;
    return '';
  });

  fastify.decorate('isProjectRoute', (request) =>
    request.raw.url.startsWith(`${fastify.getPrefixForRoute()}/projects/`)
  );

  // remove null in patient id
  fastify.decorate('replaceNull', (text) => text.replace('\u0000', ''));

  fastify.decorate('epadThickRightsCheck', async (request, reply) => {
    try {
      const reqInfo = fastify.getInfoFromRequest(request);
      // check if user type is admin, if not admin
      if (!(request.epadAuth && request.epadAuth.admin && request.epadAuth.admin === true)) {
        if (fastify.isProjectRoute(request)) {
          // check the method and call specific rights check
          switch (request.raw.method) {
            case 'GET': // check project access (projectToRole). filtering should be done in the methods
              if (fastify.hasAccessToProject(request, reqInfo.project) === undefined) {
                // check if it is a public project
                const project = await fastify.getProjectInternal(reqInfo.project);
                if (!project || project.type.toLowerCase() !== 'public')
                  reply.send(new UnauthorizedError('User has no access to project'));
              }
              break;
            case 'PUT': // check permissions
              // not really a good way to check it but
              // 'file', 'template', 'subject', 'study' are just associacion levels
              if (
                fastify.hasAccessToProject(request, reqInfo.project) === undefined ||
                (['project', 'worklist', 'user', 'aim'].includes(reqInfo.level) &&
                  fastify.isOwnerOfProject(request, reqInfo.project) === false &&
                  (await fastify.isCreatorOfObject(request, reqInfo)) === false)
              )
                reply.send(new UnauthorizedError('User has no access to project and/or resource'));
              break;
            case 'POST':
              if (
                fastify.hasAccessToProject(request, reqInfo.project) === undefined ||
                (reqInfo.level === 'project' &&
                  !fastify.hasCreatePermission(request, reqInfo.level))
              )
                reply.send(new UnauthorizedError('User has no access to project and/or to create'));
              break;
            case 'DELETE': // check if owner
              if (
                fastify.isOwnerOfProject(request, reqInfo.project) === false &&
                (await fastify.isCreatorOfObject(request, reqInfo)) === false
              )
                reply.send(new UnauthorizedError('User has no access to project and/or resource'));
              break;
            default:
              break;
          }
        } else {
          switch (request.raw.method) {
            case 'GET': // filtering should be done in the methods
              break;
            case 'PUT': // check permissions
              if (
                !request.raw.url.startsWith(
                  config.prefix ? `/${config.prefix}/search` : '/search'
                ) &&
                !request.raw.url.startsWith('/plugins') && // cavit added to let normal user to add remove projects to the plugin
                !request.raw.url.startsWith(
                  config.prefix ? `/${config.prefix}/decrypt` : '/decrypt'
                ) &&
                reqInfo.level !== 'ontology' &&
                (await fastify.isCreatorOfObject(request, reqInfo)) === false &&
                !(
                  reqInfo.level === 'worklist' &&
                  (await fastify.isAssigneeOfWorklist(
                    reqInfo.objectId,
                    request.epadAuth.username
                  )) &&
                  (request.query.annotationStatus || request.query.annotationStatus === 0)
                )
              )
                reply.send(new UnauthorizedError('User has no access to resource'));
              break;
            case 'POST':
              if (
                !fastify.hasCreatePermission(request, reqInfo.level) &&
                !(
                  reqInfo.level === 'worklist' &&
                  request.body.assignees &&
                  request.body.assignees.length === 1 &&
                  request.body.assignees[0] === request.epadAuth.username
                )
              )
                reply.send(new UnauthorizedError('User has no access to create'));
              break;
            case 'DELETE': // check if owner
              if (
                reqInfo.level !== 'ontology' &&
                (await fastify.isCreatorOfObject(request, reqInfo)) === false
              )
                reply.send(new UnauthorizedError('User has no access to resource'));
              break;
            default:
              break;
          }
        }
      }
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.decorate(
    'createADUser',
    (username, projectID, epadAuth) =>
      new Promise(async (resolve, reject) => {
        const ad = new ActiveDirectory(config.ad);
        ad.findUser(username, async (adErr, adUser) => {
          try {
            if (adErr) reject(adErr);
            else if (!adUser) reject(new ResourceNotFoundError('AD User', username));
            else {
              await fastify.createUserInternal(
                {
                  username,
                  firstname: adUser.givenName,
                  lastname: adUser.sn,
                  email: adUser.mail,
                  enabled: true,
                  admin: false,
                  projects: [{ role: 'Member', project: projectID }],
                },
                { project: projectID },
                epadAuth
              );
              // create a private project by user id
              // should we have a shorter name?
              // get default template from config
              await fastify.createProjectInternal(
                `${adUser.givenName} ${adUser.sn}`,
                `prj_${username}`,
                `${adUser.givenName} ${adUser.sn}'s Private Folder`,
                config.defaultTemplate,
                'Private',
                epadAuth
              );

              // add teaching template to the project
              await fastify.addProjectTemplateRelInternal(
                config.teachingTemplateUID,
                `prj_${username}`,
                {},
                epadAuth
              );

              resolve('User successfully added with member right');
            }
          } catch (err) {
            fastify.log.error(`Create aduser error. ${err.message}`);
            reject(err);
          }
        });
      })
  );

  fastify.decorate('decryptAdd', async (request, reply) => {
    try {
      const obj = await fastify.decryptInternal(request.query.arg);
      const projectID = obj.projectID ? obj.projectID : 'lite';
      // if patientID and studyUID
      if (obj.patientID && obj.studyUID) {
        await fastify.addPatientStudyToProjectInternal(
          { project: projectID, subject: obj.patientID, study: obj.studyUID },
          request.epadAuth
        );
        reply.send({ ...obj, projectID });
      } else if (obj.accession) {
        // if accession
        const patientStudyPairs = await fastify.getPatientIDandStudyUIDsFromAccession(
          obj.accession
        );

        // send the first it there is
        if (patientStudyPairs.length > 0) {
          for (let i = 0; i < patientStudyPairs.length; i += 1)
            // eslint-disable-next-line no-await-in-loop
            await fastify.addPatientStudyToProjectInternal(
              {
                project: projectID,
                subject: patientStudyPairs[i].patientID,
                study: patientStudyPairs[i].studyUID,
              },
              request.epadAuth
            );
          reply.send({
            projectID,
            patientID: patientStudyPairs[0].patientID,
            studyUID: patientStudyPairs[0].studyUID,
          });
        } else
          reply.send(
            new BadRequestError(
              'Encrypted URL adding',
              new Error(`Couldn't get study from accession ${obj.accession}`)
            )
          );
      } else {
        // not supported
        reply.send(
          new BadRequestError(
            'Encrypted URL adding',
            new Error(`Supported parameters not found patientID and studyUID or accession`)
          )
        );
      }
    } catch (err) {
      reply.send(new InternalError(`Decrypt and add`, err));
    }
  });

  fastify.decorate('decryptInternal', async (encrypted) => {
    if (!config.secret) {
      throw new Error('No secret defined');
    } else {
      const encodeKey = crypto.createHash('sha256').update(config.secret, 'utf-8').digest();

      const binary = Buffer.from(encrypted, 'base64');
      const ivlen = binary.readInt32BE();
      const iv = binary.subarray(4, 4 + ivlen);
      const encoded = binary.subarray(4 + ivlen);
      const cipher = crypto.createDecipheriv('aes-256-cbc', encodeKey, iv);
      const decrypted = cipher.update(encoded, 'base64') + cipher.final();
      const items = decrypted.split('&');
      const obj = {};
      for (let i = 0; i < items.length; i += 1) {
        const keyValue = items[i].split('=');
        // eslint-disable-next-line prefer-destructuring
        obj[keyValue[0]] = keyValue[1];
      }
      obj.patientID = obj.patientID || obj.PatientID;

      // get the api key if there is
      const apiKey = await fastify.getApiKeyWithSecretInternal(config.secret);
      obj.API_KEY = apiKey;

      if (obj.expiry) {
        const expiryDate = new Date(obj.expiry * 1000);
        const now = new Date();
        if (now <= expiryDate) {
          return obj;
        }
        throw new Error('Time expired');
      }
      return obj;
    }
  });

  fastify.decorate('decrypt', async (request, reply) => {
    try {
      const obj = await fastify.decryptInternal(request.query.arg);
      obj.projectID = obj.projectID || 'lite';
      if (obj.user) {
        // check if user exists
        try {
          await fastify.getUserInternal({ user: obj.user });
        } catch (userErr) {
          try {
            // if not get user info and create user
            if (userErr instanceof ResourceNotFoundError && config.ad) {
              await fastify.createADUser(
                obj.user,
                obj.projectID,
                request.epadAuth || { username: obj.user }
              );
            }
          } catch (adErr) {
            fastify.log.error(`Error creating AD user ${adErr.message}`);
            // remove api key so we can do reqular authentication
            delete obj.API_KEY;
          }
        }
      }
      if (obj) {
        reply.code(200).send(obj);
      }
    } catch (err) {
      reply.send(new InternalError('Decrypt', err));
    }
  });

  /** Supports query and fields search
   * Uses both body and query
   * fields should be a dictionary and can have following keys
   * Sample
   *   fields: {
   *       subSpecialty: [],
   *       modality: [],
   *       diagnosis: [],
   *       anatomy: [],
   *       myCases: true,
   *       teachingFiles: true,
   *       query: '',
   *       project: '',
   *     };
   * filter should be a dictionary of column names to be filtered
   * Sample filter value
   *   filter: { name: 'Lesion' }
   *
   * filter should be an array of column names to be sorted by. - in the beginning of the fieldname represents descending sort
   * Sample sort value
   *   sort: ['-name']
   *
   * Possible values for filter and sort are: patientName, subjectID, accessionNumber, name, age, sex, modality,
   *       studyDate, anatomy, observation, date, templateType (template name), template, user, fullName,
   *       comment, project, projectName (uses project instead)
   * Following fields are handled differently for filter and sort: patientName, name, anatomy, observation, templateType and fullName
   * (patient_name, name, anatomy, observation, template_name and user_name in CouchDB)
   *
   * We created two indexes for each (for ex: patient_name and patient_name_sort). First (patient_name) is indexed using standard indexer (separates words)
   * and second (patient_name_sort) is indexed as keyword (which lets us do wildcard searchs and sort)
   *
   * In filter, the spaces are escaped and filters through both the regular index and sort specific index
   * The sample filter value below is added to the query as: (name:"Lesion\ 2" OR name_sort:Lesion\ 2*)
   * This lets us to be able to get anything which has Lesion and 2 inside as words (it won't match Lesion 256) and anything that starts with "Lesion 2"
   *
   * ePAD handles the selection of the correct index for sorting
   *
   */
  fastify.decorate('search', async (request, reply) => {
    try {
      const params = {};
      const queryObj = { ...request.query, ...request.body };
      if (queryObj.query) {
        if (queryObj.query.includes('project')) {
          const qryParts = queryObj.query.split(' ');
          for (let i = 0; i < qryParts.length; i += 1) {
            if (qryParts[i].startsWith('project')) {
              const projectId = qryParts[i].split(':')[1];
              if (!fastify.hasRoleInProject(projectId, request.epadAuth)) {
                reply.code(200).send({ total_rows: 0, rows: [] });
                return;
              }
              if (fastify.isCollaborator(projectId, request.epadAuth)) {
                queryObj.query += ` AND user:"${request.epadAuth.username}"`;
                break;
              }
            }
          }
        } else {
          // if there is no project filter get accessible projects and add to query
          const { collaboratorProjIds, aimAccessProjIds } = await fastify.getAccessibleProjects(
            request.epadAuth
          );
          let rightsFilter = '';
          if (collaboratorProjIds) {
            for (let i = 0; i < collaboratorProjIds.length; i += 1) {
              rightsFilter += `${rightsFilter === '' ? '' : ' OR '}(project:"${
                collaboratorProjIds[i]
              }" AND user:"${request.epadAuth.username}")`;
            }
          }
          if (aimAccessProjIds) {
            for (let i = 0; i < aimAccessProjIds.length; i += 1) {
              rightsFilter += `${rightsFilter === '' ? '' : ' OR '}(project:"${
                aimAccessProjIds[i]
              }")`;
            }
          }
          if (rightsFilter) queryObj.query += ` AND (${rightsFilter})`;
        }
      } else if (queryObj.fields || queryObj.filter) {
        queryObj.query = await fastify.createFieldsQuery(queryObj, request.epadAuth);
        // returns null if user has no rights to the project
        if (!queryObj.query) {
          reply.code(200).send({ total_rows: 0, rows: [] });
          return;
        }
        // make sure you return extra columns
      }
      // handle sort fieldnames with sort
      // use epad fieldnames in sort
      if (queryObj.sort)
        queryObj.sort = queryObj.sort.map((item) =>
          fastify.replaceSorts(fastify.getFieldName(item))
        );
      const result = await fastify.getAimsInternal(
        'summary',
        params,
        queryObj,
        request.epadAuth,
        request.query.bookmark
      );
      reply.code(200).send(result);
    } catch (err) {
      reply.send(new InternalError(`Search ${JSON.stringify(request.query)}`, err));
    }
  });

  fastify.decorate('createFieldsQuery', async (queryObj, epadAuth) => {
    const queryParts = [];
    if (queryObj.fields && queryObj.fields.query) {
      if (queryObj.fields.query.trim() !== '') {
        const qp = queryObj.fields.query.trim().split(' ');
        qp[qp.length - 1] = `"${qp[qp.length - 1]}*"`;
        queryParts.push(`"${qp.join(' ')}"`);
      }
    }
    // add filters
    if (queryObj.filter) {
      // name:"Lesion\ 2" OR name_sort:Lesion\ 2*
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, value] of Object.entries(queryObj.filter)) {
        const cleanedValue = value.trim().replaceAll(' ', '\\ ');
        // special filtering for projectName. we need to get the projectIds from mariadb first
        if (key === 'projectName') {
          // eslint-disable-next-line no-await-in-loop
          const rightsFilter = await fastify.getRightsFilter(queryObj, epadAuth);
          if (rightsFilter) queryParts.push(`(${rightsFilter})`);
        } else if (key === 'age') {
          // age is integer not string. maybe it should be string?
          queryParts.push(`(${fastify.getFieldName(key)}:${cleanedValue})`);
        } else if (key === 'studyDate' || key === 'date') {
          // replace -
          queryParts.push(
            `(${fastify.getFieldName(key)}:"${cleanedValue.replaceAll(
              '-',
              ''
            )}" OR ${fastify.getFieldName(key)}:"${cleanedValue.replaceAll(
              '-',
              ''
            )}*" OR ${fastify.getFieldName(key)}:${cleanedValue.replaceAll('-', '')}*)`
          );
        } else if (fastify.isSortExtra(fastify.getFieldName(key))) {
          queryParts.push(
            `(${fastify.getFieldName(key)}:"${cleanedValue}" OR ${fastify.getFieldName(
              key
            )}_sort:${cleanedValue}* OR ${fastify.getFieldName(
              key
            )}:"${cleanedValue}*" OR ${fastify.getFieldName(key)}:${cleanedValue}*)`
          );
        } else {
          queryParts.push(
            `(${fastify.getFieldName(key)}:"${cleanedValue}"  OR ${fastify.getFieldName(
              key
            )}:"${cleanedValue}*" OR ${fastify.getFieldName(key)}:${cleanedValue}*)`
          );
        }
      }
    }
    if (queryObj.fields) {
      // eslint-disable-next-line no-restricted-syntax
      for (const [key, value] of Object.entries(queryObj.fields)) {
        if (Array.isArray(value) && !(queryObj.filter && queryObj.filter[`${key}`]))
          queryParts.push(fastify.createPartFromArray(fastify.getFieldName(key), value));
      }
      if (queryObj.fields.myCases) {
        queryParts.push(`user:"${epadAuth.username}"`);
      }
      if (queryObj.fields.teachingFiles) {
        queryParts.push(`template_code:${config.teachingTemplate}`);
      }
    }
    if (queryObj.fields && queryObj.fields.project) {
      if (!fastify.hasRoleInProject(queryObj.fields.project, epadAuth)) {
        return null;
      }
      queryParts.push(`project:"${queryObj.fields.project}"`);
      if (fastify.isCollaborator(queryObj.fields.project, epadAuth) && !queryObj.fields.myCases) {
        queryParts.push(`user:"${epadAuth.username}"`);
      }
    } else if (!epadAuth.admin || (queryObj.fields && queryObj.fields.projectName)) {
      const rightsFilter = await fastify.getRightsFilter(queryObj, epadAuth);
      if (rightsFilter) queryParts.push(`(${rightsFilter})`);
    }
    return queryParts.length > 0 ? queryParts.join(' AND ') : '*:*';
  });

  fastify.decorate('getRightsFilter', async (queryObj, epadAuth) => {
    // handle different project rights
    // if there is no project filter get accessible projects and add to query
    // if there is projectName, do a like query to the db to get the ids first
    let projectName;
    if (queryObj.fields && queryObj.fields.projectName) projectName = queryObj.fields.projectName;
    // filter overrides fields
    if (queryObj.filter && queryObj.filter.projectName) projectName = queryObj.filter.projectName;
    const { collaboratorProjIds, aimAccessProjIds } = projectName
      ? await fastify.getAccessibleProjectIdsByName(projectName, epadAuth)
      : await fastify.getAccessibleProjects(epadAuth);
    let rightsFilter = '';
    if (collaboratorProjIds) {
      for (let i = 0; i < collaboratorProjIds.length; i += 1) {
        rightsFilter += `${rightsFilter === '' ? '' : ' OR '}(project:"${
          collaboratorProjIds[i]
        }" AND user:"${epadAuth.username}")`;
      }
    }
    if (aimAccessProjIds) {
      for (let i = 0; i < aimAccessProjIds.length; i += 1) {
        rightsFilter += `${rightsFilter === '' ? '' : ' OR '}(project:"${aimAccessProjIds[i]}")`;
      }
    }
    return rightsFilter;
  });

  // fields for filter and sort
  // CouchDB fields: patient_name, patient_id, accession_number, name, age, sex, modality, study_date, anatomy, observation, creation_date, template_name, template_code, user, user_name, comment, project
  // ePAD fields:      patientName, subjectID, accessionNumber, name, age, sex, modality, studyDate, anatomy, observation, date, templateType (template name), template, user, fullName, comment, project, projectName (additional, no couchdb)

  // Sorting fields: patient_name_sort, patient_id, accession_number, name_sort, age, sex, modality, study_date, anatomy_sort, observation_sort, creation_date, template_name_sort, template_code, user, user_name_sort, project, projectName (additional, no couchdb uses project instead)

  // Different sort fields only: patient_name_sort, name_sort, anatomy_sort, observation_sort, template_name_sort, user_name_sort

  const sortExtras = [
    'patient_name',
    'name',
    'anatomy',
    'observation',
    'template_name',
    'user_name',
  ];

  fastify.decorate('isSortExtra', (key) => sortExtras.includes(key));

  fastify.decorate('replaceSorts', (item) => {
    let sortItem = item;
    for (let i = 0; i < sortExtras.length; i += 1) {
      sortItem = sortItem.replace(sortExtras[i], `${sortExtras[i]}_sort`);
    }
    // replace projectName with project for now. sort with projectName is not supported (projectName is not in couchdb)
    sortItem = sortItem.replace('projectName', 'project');
    sortItem += '<string>';
    return sortItem;
  });

  fastify.decorate('getFieldName', (key) => {
    const columnNameMap = {
      subjectID: 'patient_id',
      patientName: 'patient_name',
      accessionNumber: 'accession_number',
      studyDate: 'study_date',
      date: 'creation_date',
      template: 'template_code',
      userName: 'user',
      projectID: 'project',
      templateType: 'template_name',
      fullName: 'user_name',
      age: 'patient_age',
      sex: 'patient_sex',
      birthDate: 'patient_birth_date',
    };
    if (columnNameMap[key]) return columnNameMap[key];
    return key;
  });

  fastify.decorate('createPartFromArray', (field, values) => {
    let fieldToSearch = field;
    if (Array.isArray(values)) {
      if (['subSpecialty', 'diagnosis'].includes(field)) fieldToSearch = 'observation';
      return `(${values.map((item) => `${fieldToSearch}:"${item}"`).join(' OR ')})`;
    }
    return '';
  });

  fastify.addHook('onError', (request, reply, error, done) => {
    if (error instanceof ResourceNotFoundError) reply.code(404);
    else if (error instanceof InternalError) reply.code(500);
    else if (error instanceof BadRequestError) reply.code(400);
    else if (error instanceof UnauthenticatedError) reply.code(401);
    else if (error instanceof UnauthorizedError) reply.code(403);
    else if (error instanceof ResourceAlreadyExistsError) reply.code(409);
    try {
      new EpadNotification(request, fastify.getInfoFromRequest(request), error).notify(fastify);
    } catch (err) {
      fastify.log.error(`Cannot notify user ${err.message}`);
    }
    done();
  });
  fastify.decorate('hostname', '');
  fastify.decorate('responseWrapper', (request, reply, done) => {
    // we have a successful request, lets get the hostname
    // getting the first one, is it better to get the last all the time?
    // eslint-disable-next-line no-param-reassign
    if (fastify.hostname === '') fastify.hostname = request.hostname;

    done();
  });

  // add authentication prehandler, all requests need to be authenticated
  fastify.addHook('preHandler', fastify.auth);

  fastify.addHook('onResponse', fastify.responseWrapper);
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(other);
