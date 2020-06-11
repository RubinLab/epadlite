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
const { createOfflineAimSegmentation } = require('aimapi');
// const Aim = require('aimapi');
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
  fastify.decorate('pq', pq);
  let count = 0;
  pq.on('active', () => {
    count += 1;
    // eslint-disable-next-line no-plusplus
    fastify.log.info(
      `P-queue working on item #${count}.  Size: ${pq.size}  Pending: ${pq.pending}`
    );
  });
  // eslint-disable-next-line global-require
  fastify.register(require('fastify-multipart'));

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
            let errors = [];
            let success = false;
            let datasets = [];
            let studies = new Set();
            if (config.env !== 'test') {
              fastify.log.info('Files copy completed. sending response');
              reply.code(202).send('Files received succesfully, saving..');
            }
            try {
              for (let i = 0; i < filenames.length; i += 1) {
                try {
                  // eslint-disable-next-line no-await-in-loop
                  const fileResult = await fastify.processFile(
                    dir,
                    filenames[i],
                    datasets,
                    request.params,
                    request.query,
                    studies,
                    request.epadAuth
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
                await fastify.sendDicomsInternal(
                  request.params,
                  request.epadAuth,
                  studies,
                  datasets
                );
                datasets = [];
                studies = new Set();
              }
              fs.remove(dir, error => {
                if (error) fastify.log.warn(`Temp directory deletion error ${error.message}`);
                fastify.log.info(`${dir} deleted`);
              });

              let errMessagesText = null;
              if (errors.length > 0) {
                const errMessages = errors.reduce((all, item) => {
                  all.push(item.message);
                  return all;
                }, []);
                errMessagesText = errMessages.toString();
              }

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
              fs.remove(dir, error => {
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
          .catch(fileSaveErr => {
            fs.remove(dir, error => {
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
        new Promise(resolve =>
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

  fastify.decorate('chunkSize', 500);

  fastify.decorate(
    'sendDicomsInternal',
    (params, epadAuth, studies, datasets) =>
      new Promise(async (resolve, reject) => {
        try {
          await fastify.addProjectReferences(params, epadAuth, studies);
          fastify.log.info(`Writing ${datasets.length} dicoms`);
          for (let i = 0; i < datasets.length; i += fastify.chunkSize) {
            const dataSetPart = datasets.slice(
              i,
              i + fastify.chunkSize > datasets.length ? datasets.length : i + fastify.chunkSize
            );
            const { data, boundary } = dcmjs.utilities.message.multipartEncode(dataSetPart);
            fastify.log.info(
              `Sending ${Buffer.byteLength(data)} bytes of data to dicom web server for saving`
            );
            // eslint-disable-next-line no-await-in-loop
            await fastify.saveDicomsInternal(data, boundary);
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
            .saveAimInternal(aimJson)
            .then(async () => {
              try {
                await fastify.addProjectAimRelInternal(aimJson, params.project, epadAuth);
                if (filename) fastify.log.info(`Saving successful for ${filename}`);
                resolve({ success: true, errors: [] });
              } catch (errProject) {
                reject(errProject);
              }
            })
            .catch(err => {
              reject(err);
            });
          resolve();
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
                `A segmentation is uploaded with series UID ${
                  dataset.SeriesInstanceUID
                } which doesn't have an aim, generating an aim with name ${
                  dataset.SeriesDescription
                } `
              );
              const { aim } = createOfflineAimSegmentation(dataset, {
                loginName: 'admin', // TODO assuming admin user
                name: 'Admin',
              });
              const aimJson = aim.getAimJSON();
              await fastify.saveAimJsonWithProjectRef(aimJson, params, epadAuth);
            }
          }
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
              fastify
                .processFolder(`${zipDir}`, params, query, epadAuth)
                .then(result => {
                  fastify.log.info(
                    `Finished processing ${filename} at ${new Date().getTime()} started at ${zipTimestamp}`
                  );
                  fs.remove(zipDir, error => {
                    if (error)
                      fastify.log.info(`Zip temp directory deletion error ${error.message}`);
                    else fastify.log.info(`${zipDir} deleted`);
                  });
                  resolve(result);
                })
                .catch(err => reject(err));
            })
            .on('error', error => {
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
        .processFolder(dataFolder, request.params, {}, request.epadAuth)
        .then(result => {
          fastify.log.info(
            `Finished processing ${dataFolder} at ${new Date().getTime()} with ${
              result.success
            } started at ${scanTimestamp}`
          );
          new EpadNotification(request, 'Folder scan completed', dataFolder, true).notify(fastify);
        })
        .catch(err => {
          fastify.log.warn(`Error processing ${dataFolder} Error: ${err.message}`);
          new EpadNotification(request, 'Folder scan failed', err, true).notify(fastify);
        });
    }
  });

  fastify.decorate(
    'processFolder',
    (zipDir, params, query, epadAuth) =>
      new Promise((resolve, reject) => {
        fastify.log.info(`Processing folder ${zipDir}`);
        const datasets = [];
        // success variable is to check if there was at least one successful processing
        const result = { success: false, errors: [] };
        const studies = new Set();
        fs.readdir(zipDir, async (err, files) => {
          if (err) {
            reject(new InternalError(`Reading directory ${zipDir}`, err));
          } else {
            try {
              const promisses = [];
              for (let i = 0; i < files.length; i += 1) {
                if (files[i] !== '__MACOSX')
                  if (fs.statSync(`${zipDir}/${files[i]}`).isDirectory() === true)
                    try {
                      // eslint-disable-next-line no-await-in-loop
                      const subdirResult = await fastify.processFolder(
                        `${zipDir}/${files[i]}`,
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
                    } catch (folderErr) {
                      reject(folderErr);
                    }
                  else
                    promisses.push(
                      fastify
                        .processFile(zipDir, files[i], datasets, params, query, studies, epadAuth)
                        // eslint-disable-next-line no-loop-func
                        .catch(error => {
                          result.errors.push(error);
                        })
                    );
              }
              Promise.all(promisses).then(async values => {
                try {
                  for (let i = 0; values.length; i += 1) {
                    if (
                      values[i] === undefined ||
                      (values[i].errors && values[i].errors.length === 0)
                    ) {
                      // one success is enough
                      result.success = result.success || true;
                      break;
                    }
                  }
                  if (datasets.length > 0) {
                    fastify
                      .sendDicomsInternal(params, epadAuth, studies, datasets)
                      .then(() => resolve(result))
                      .catch(error => reject(error));
                  } else {
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
    (dir, filename, datasets, params, query, studies, epadAuth) =>
      new Promise((resolve, reject) => {
        try {
          let buffer = [];
          const readableStream = fs.createReadStream(`${dir}/${filename}`);
          readableStream.on('data', chunk => {
            buffer.push(chunk);
          });
          readableStream.on('error', readErr => {
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
                  .catch(err => {
                    reject(err);
                  });
              } else {
                fastify
                  .saveAimJsonWithProjectRef(jsonBuffer, params, epadAuth, filename)
                  .then(res => {
                    try {
                      fastify.log.info(`Saving successful for ${filename}`);
                      resolve(res);
                    } catch (errProject) {
                      reject(errProject);
                    }
                  })
                  .catch(err => {
                    reject(err);
                  });
              }
            } else if (filename.endsWith('xml') && !filename.startsWith('__MACOSX')) {
              const osirixObj = fastify.parseOsirix(`${dir}/${filename}`);
              const { metadata, aimNames } = await fastify.getImageMetaDataforOsirix(osirixObj);
              const answers = fastify.getTemplateAnswers(Object.values(metadata), aimNames, '');
              const { username } = epadAuth;
              metadata.forEach((el, i) => {
                const merged = { ...el.aim, ...answers[i] };
                metadata[i].aim = merged;
                metadata[i].user = { loginName: username, name: username };
              });
              const imageRefrenceUID = osirixObj.SOPInstanceUID;
            } else if (filename.endsWith('zip') && !filename.startsWith('__MACOSX')) {
              fastify
                .processZip(dir, filename, params, query, epadAuth)
                .then(result => resolve(result))
                .catch(err => reject(err));
            } else if (fastify.checkFileType(filename))
              fastify
                .saveOtherFileToProjectInternal(
                  filename,
                  params,
                  query,
                  buffer,
                  Buffer.byteLength(buffer),
                  epadAuth
                )
                .then(() => resolve({ success: true, errors: [] }))
                .catch(err => reject(err));
            else {
              // check to see if it is a dicom file with no dcm extension
              try {
                const arrayBuffer = toArrayBuffer(buffer);
                studies.add(fastify.getDicomInfo(arrayBuffer));
                datasets.push(arrayBuffer);
                resolve({ success: true, errors: [] });
              } catch (err) {
                reject(
                  new BadRequestError(
                    'Uploading files',
                    new Error(`Unsupported filetype for file ${dir}/${filename}`)
                  )
                );
              }
            }
          });
        } catch (err) {
          reject(new InternalError(`Processing file ${filename}`, err));
        }
      })
  );
  fastify.decorate('getTemplateAnswers', (arr, namesArr, tempModality) => {
    try {
      const result = [];
      arr.forEach((el, i) => {
        const { number, description, instanceNumber } = el.series;
        const seriesModality = el.series.modality;
        const comment = {
          value: `${seriesModality} / ${description} / ${instanceNumber} / ${number}`,
        };
        const modality = { value: tempModality };
        const name = { value: namesArr[i] };
        const typeCode = [
          {
            code: 'ROI',
            codeSystemName: '99EPAD',
            'iso:displayName': { 'xmlns:iso': 'uri:iso.org:21090', value: 'ROI Only' },
          },
        ];
        result.push({ comment, modality, name, typeCode });
      });
      return result;
    } catch (err) {
      console.log(err);
    }
  });

  fastify.decorate('parseOsirix', docPath => {
    const osirixObj = plist.parse(fs.readFileSync(docPath, 'utf8'));
    return osirixObj;
  });

  fastify.decorate('getImageMetaDataforOsirix', async osirixObj => {
    try {
      const metadataArr = [];
      const aimNames = [];
      const images = osirixObj.Images;
      // handle no SOPInstanceUID means no image in the system
      images.forEach(obj => {
        obj.ROIs.forEach(annotation => {
          const parameters = {
            instance: annotation.SOPInstanceUID,
            series: annotation.SeriesInstanceUID,
            study: annotation.StudyInstanceUID,
          };
          metadataArr.push(fastify.getImageMetadata(parameters));
          aimNames.push(annotation.Name);
        });
      });
      const metadata = await Promise.all(metadataArr);
      return { metadata, aimNames };
    } catch (err) {
      return err;
    }
  });

  // gets data fields from dicom for an image
  fastify.decorate('getFieldsFromImageMetaData', () => {});

  fastify.decorate(
    'saveOtherFileToProjectInternal',
    (filename, params, query, buffer, length, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const timestamp = new Date().getTime();
          // create fileInfo
          const fileInfo = {
            subject_uid: params.subject ? params.subject : '',
            study_uid: params.study ? params.study : '',
            series_uid: params.series ? params.series : '',
            name: `${filename}_${timestamp}`,
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

  fastify.decorate('getExtension', filename => {
    if (filename.lastIndexOf('.') === -1) return '';
    return filename.substr(filename.lastIndexOf('.') + 1).toLowerCase();
  });

  fastify.decorate('checkFileType', filename => {
    return config.validExt.includes(fastify.getExtension(filename));
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
    fastify
      .deleteSubjectInternal(request.params, request.epadAuth)
      .then(result => {
        if (config.env !== 'test')
          new EpadNotification(request, 'Deleted subject', request.params.subject, true).notify(
            fastify
          );
        else reply.code(200).send(result);
      })
      .catch(err => {
        if (config.env !== 'test')
          new EpadNotification(
            request,
            'Delete subject failed',
            new Error(request.params.subject)
          ).notify(fastify);
        else reply.send(err);
      });
  });

  fastify.decorate(
    'deleteSubjectInternal',
    (params, epadAuth) =>
      new Promise((resolve, reject) => {
        const promisses = [];
        fastify
          .getPatientStudiesInternal(params, undefined, epadAuth, {}, true)
          .then(result => {
            result.forEach(study => {
              promisses.push(() => {
                return fastify.deleteStudyDicomsInternal({
                  subject: params.subject,
                  study: study.studyUID,
                });
              });
            });
            promisses.push(() => {
              return fastify.deleteAimsInternal(params, epadAuth);
            });
            pq.addAll(promisses)
              .then(() => {
                fastify.log.info(`Subject ${params.subject} deletion is initiated successfully`);
                resolve(`Subject ${params.subject} deletion is initiated successfully`);
              })
              .catch(error => {
                reject(new InternalError(`Deleting subject ${params.subject}`, error));
              });
          })
          .catch(getError => {
            reject(
              new InternalError(`Getting studies of ${params.subject} for deletion`, getError)
            );
          });
      })
  );

  fastify.decorate('deleteStudy', (request, reply) => {
    if (config.env !== 'test') {
      fastify.log.info(
        `Study ${request.params.study} of Subject ${
          request.params.subject
        } deletion request recieved, sending response`
      );
      reply.code(202).send(`Study ${request.params.study} deletion request recieved. deleting..`);
    }
    fastify
      .deleteStudyInternal(request.params, request.epadAuth)
      .then(result => {
        if (config.env !== 'test')
          new EpadNotification(request, 'Deleted study', request.params.study, true).notify(
            fastify
          );
        else reply.code(200).send(result);
      })
      .catch(err => {
        if (config.env !== 'test')
          new EpadNotification(
            request,
            'Delete study failed',
            new Error(request.params.subject)
          ).notify(fastify);
        else reply.send(err);
      });
  });

  fastify.decorate('deleteStudyInternal', (params, epadAuth) => {
    return new Promise((resolve, reject) => {
      // delete study in dicomweb and annotations
      const promisses = [];
      promisses.push(() => {
        return fastify.deleteStudyDicomsInternal(params);
      });
      promisses.push(() => {
        return fastify.deleteAimsInternal(params, epadAuth);
      });
      pq.addAll(promisses)
        .then(() => {
          fastify.log.info(`Study ${params.study} deletion is initiated successfully`);
          resolve();
        })
        .catch(error => {
          reject(error);
        });
    });
  });

  fastify.decorate('deleteSeries', (request, reply) => {
    try {
      // delete study in dicomweb and annotations
      const promisses = [];
      promisses.push(() => {
        return fastify.deleteSeriesDicomsInternal(request.params).catch(err => {
          fastify.log.warn(
            `Could not delete series from dicomweb with error: ${
              err.message
            }. Trying nondicom series delete`
          );
          return fastify.deleteNonDicomSeriesInternal(request.params.series);
        });
      });
      promisses.push(() => {
        return fastify.deleteAimsInternal(request.params, request.epadAuth);
      });
      if (config.env !== 'test') {
        fastify.log.info(
          `Series ${request.params.series} of Subject ${
            request.params.subject
          } deletion request recieved, sending response`
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
        .catch(error => {
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
      reply.res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      const padding = new Array(2049);
      reply.res.write(`:${padding.join(' ')}\n`); // 2kB padding for IE
      reply.res.write('retry: 2000\n');
      fastify.addConnectedUser(request, reply);
      const id = setInterval(() => {
        // eslint-disable-next-line no-param-reassign
        fastify.messageId += 1;
        reply.res.write(`id: ${fastify.messageId}\n`);
        reply.res.write(`data: heartbeat\n\n`);
      }, 1000);
      request.req.on('close', () => {
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

  fastify.decorate('getInfoFromRequest', request => {
    try {
      const reqInfo = {};
      reqInfo.method = request.req.method;
      const methodText = { GET: 'GET', POST: 'CREATE', PUT: 'UPDATE', DELETE: 'DELETE' };
      reqInfo.methodText = methodText[request.req.method];
      const queryStart = request.req.url.indexOf('?');
      let cleanUrl = request.req.url;
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
      };
      if (urlParts[urlParts.length - 1] === 'download') reqInfo.methodText = 'DOWNLOAD';
      if (levels[urlParts[urlParts.length - 1]]) {
        if (reqInfo.method === 'POST') reqInfo.level = levels[urlParts[urlParts.length - 1]];
        else reqInfo.level = urlParts[urlParts.length - 1];
      } else if (levels[urlParts[urlParts.length - 2]]) {
        reqInfo.level = levels[urlParts[urlParts.length - 2]];
        reqInfo.objectId = urlParts[urlParts.length - 1];
      } else reqInfo.level = request.req.url;
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
        .then(result => {
          reply.code(200).send(result);
        })
        .catch(err => {
          reply.send(err);
        });
    }
  });

  fastify.decorate(
    'getUserInfoInternal',
    token =>
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
              username = verifyToken.content.preferred_username;
              userInfo = verifyToken.content;
            }
          } else {
            // try getting userinfo from external auth server with userinfo endpoint
            const userinfo = await fastify.getUserInfoInternal(token);
            username = userinfo.preferred_username;
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
          } catch (err) {
            // fallback get by email
            if (!user && userInfo) {
              user = await fastify.getUserInternal({
                user: userInfo.email,
              });
              // update user db record here
              const rowsUpdated = {
                username,
                firstname: userInfo.given_name,
                lastname: userInfo.family_name,
                email: userInfo.email,
                updated_by: 'admin',
                updatetime: Date.now(),
              };
              await fastify.updateUserInternal(rowsUpdated, { user: userInfo.email });
              user = await fastify.getUserInternal({
                user: username,
              });
            } else reject(err);
          }
          if (user) {
            epadAuth.permissions = user.permissions;
            epadAuth.projectToRole = user.projectToRole;
            epadAuth.admin = user.admin;
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
      ] = res.res;
      // send unsent notifications
      await fastify.getUnnotifiedEventLogs(req);
    }
  );
  fastify.decorate(
    'deleteDisconnectedUser',
    // eslint-disable-next-line no-return-assign
    req => {
      fastify.log.info(
        `Deleting ${req.epadAuth && req.epadAuth.username ? req.epadAuth.username : 'nouser'}`
      );
      // eslint-disable-next-line no-param-reassign
      delete fastify.connectedUsers[
        req.epadAuth && req.epadAuth.username ? req.epadAuth.username : 'nouser'
      ];
      fastify.log.info('Current users');
      fastify.log.info(fastify.connectedUsers);
    }
  );

  fastify.decorate('auth', async (req, res) => {
    // ignore swagger routes
    if (
      config.auth &&
      config.auth !== 'none' &&
      !req.req.url.startsWith('/documentation') &&
      !req.req.url.startsWith('/epads/stats') &&
      !req.req.url.startsWith('/epad/statistics') // disabling auth for put is dangerous
    ) {
      // if auth has been given in config, verify authentication
      const authHeader = req.headers['x-access-token'] || req.headers.authorization;
      if (authHeader) {
        req.epadAuth = await fastify.authCheck(authHeader, res);
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
      if (!req.req.url.startsWith('/documentation')) await fastify.epadThickRightsCheck(req, res);
    } catch (err) {
      res.send(err);
    }
  });

  fastify.decorate('hasAccessToProject', (request, project) => {
    try {
      fastify.log.info(
        `Checking hasAccessToProject for url: ${request.req.url} and project ${project}`
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
      fastify.log.info(`Checking hasCreatePermission for url: ${request.req.url} level:${level}`);
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
      fastify.log.info(`Checking isOwnerOfProject for url: ${request.req.url}`);
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
        `Checking isCreatorOfObject for url: ${request.req.url} level:${reqInfo.level} object:${
          reqInfo.objectId
        }`
      );
      const creator = await fastify.getObjectCreator(reqInfo.level, reqInfo.objectId);
      fastify.log.info('Creator is', creator);
      if (creator && creator === request.epadAuth.username) return true;
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
          `Checking creatorship for ${request.epadAuth.username}, level ${reqInfo.level}, object ${
            reqInfo.objectId
          }`,
          err
        );
    }
  });

  fastify.decorate('isProjectRoute', request => request.req.url.startsWith('/projects/'));

  // remove null in patient id
  fastify.decorate('replaceNull', text => text.replace('\u0000', ''));

  fastify.decorate('epadThickRightsCheck', async (request, reply) => {
    try {
      const reqInfo = fastify.getInfoFromRequest(request);
      // check if user type is admin, if not admin
      if (!(request.epadAuth && request.epadAuth.admin && request.epadAuth.admin === true)) {
        if (fastify.isProjectRoute(request)) {
          // check the method and call specific rights check
          switch (request.req.method) {
            case 'GET': // check project access (projectToRole). filtering should be done in the methods
              if (fastify.hasAccessToProject(request, reqInfo.project) === undefined)
                reply.send(new UnauthorizedError('User has no access to project'));
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
          switch (request.req.method) {
            case 'GET': // filtering should be done in the methods
              break;
            case 'PUT': // check permissions
              if ((await fastify.isCreatorOfObject(request, reqInfo)) === false)
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
              if ((await fastify.isCreatorOfObject(request, reqInfo)) === false)
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

  fastify.decorate('responseWrapper', (request, reply, payload, done) => {
    // we have a successful request, lets get the hostname
    // getting the first one, is it better to get the last all the time?
    if (!fastify.hostname) fastify.decorate('hostname', request.req.hostname);

    done(null, payload);
  });

  // add authentication prehandler, all requests need to be authenticated
  fastify.addHook('preHandler', fastify.auth);

  fastify.addHook('onSend', fastify.responseWrapper);
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(other);
