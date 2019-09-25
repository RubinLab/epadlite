const fp = require('fastify-plugin');
const fs = require('fs-extra');
const unzip = require('unzip-stream');
const toArrayBuffer = require('to-array-buffer');
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');
const config = require('../config/index');

async function other(fastify) {
  // eslint-disable-next-line global-require
  fastify.register(require('fastify-multipart'));
  fastify.decorate('saveFile', (request, reply) => {
    const timestamp = new Date().getTime();
    const dir = `/tmp/tmp_${timestamp}`;
    const filenames = [];
    const fileSavePromisses = [];
    function done(err) {
      if (err) {
        fastify.log.info(err.message);
        reply.code(503).send(err.message);
      } else {
        Promise.all(fileSavePromisses)
          .then(async () => {
            let datasets = [];
            let studies = new Set();
            if (config.env !== 'test') {
              fastify.log.info('Files copy completed. sending response');
              reply.code(200).send();
            }
            try {
              for (let i = 0; i < filenames.length; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await fastify.processFile(
                  dir,
                  filenames[i],
                  datasets,
                  request.params,
                  request.query,
                  studies
                );
              }
              // see if it was a dicom
              if (datasets.length > 0) {
                if (config.mode === 'thick')
                  await fastify.addProjectReferences(request.params, request.query, studies);
                // fastify.log.info(`writing dicom folder ${filename}`);
                const { data, boundary } = dcmjs.utilities.message.multipartEncode(datasets);
                fastify.saveDicoms(data, boundary).then(() => {
                  fastify.log.info('Upload completed');
                  datasets = [];
                  studies = new Set();
                  // test should wait for the upload to actually finish to send the response.
                  // sending the reply early is to handle very large files and to avoid browser repeating the request
                  if (config.env === 'test') reply.code(200).send();
                  fs.remove(dir, error => {
                    if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                    fastify.log.info(`${dir} deleted`);
                  });
                });
              } else {
                fastify.log.info('Upload completed');
                // test should wait for the upload to actually finish to send the response.
                // sending the reply early is to handle very large files and to avoid browser repeating the request
                if (config.env === 'test') reply.code(200).send();

                fs.remove(dir, error => {
                  if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                  else fastify.log.info(`${dir} deleted`);
                });
              }
            } catch (filesErr) {
              fastify.log.info(filesErr);
              reply.code(503).send(filesErr.message);
              fs.remove(dir, error => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
            }
          })
          .catch(fileSaveErr => {
            fastify.log.info(fileSaveErr);
            reply.code(503).send(fileSaveErr.message);
            fs.remove(dir, error => {
              if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
              else fastify.log.info(`${dir} deleted`);
            });
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
  fastify.decorate(
    'addProjectReferences',
    (params, query, studies) =>
      new Promise(async (resolve, reject) => {
        try {
          // eslint-disable-next-line no-restricted-syntax
          for (const study of studies) {
            const combinedParams = {
              project: params.project, // should only get project id from params
              ...JSON.parse(study),
            };
            // eslint-disable-next-line no-await-in-loop
            await fastify.addPatientStudyToProjectInternal(combinedParams, query);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getDicomInfo', arrayBuffer => {
    const dicomTags = dcmjs.data.DicomMessage.readFile(arrayBuffer);
    return JSON.stringify({
      subject:
        dicomTags.dict['00100020'] && dicomTags.dict['00100020'].Value
          ? dicomTags.dict['00100020'].Value[0]
          : '',
      study:
        dicomTags.dict['0020000D'] && dicomTags.dict['0020000D'].Value
          ? dicomTags.dict['0020000D'].Value[0]
          : '',
      // seriesUID:
      //   dicomTags.dict['0020000E'] && dicomTags.dict['0020000E'].Value
      //     ? dicomTags.dict['0020000E'].Value[0]
      //     : '',
      // imageUID:
      //   dicomTags.dict['00080018'] && dicomTags.dict['00080018'].Value
      //     ? dicomTags.dict['00080018'].Value[0]
      //     : '',
    });
  });

  fastify.decorate(
    'processZip',
    (dir, filename, params, query) =>
      new Promise((resolve, reject) => {
        const zipTimestamp = new Date().getTime();
        const zipDir = `${dir}/tmp_${zipTimestamp}`;
        try {
          fs.mkdirSync(zipDir);
        } catch (errMkdir) {
          fastify.log.info(`Couldn't create ${zipDir}: ${errMkdir.message}`);
        }
        fastify.log.info(`Extracting ${dir}/${filename} to ${zipDir}`);
        fs.createReadStream(`${dir}/${filename}`)
          .pipe(unzip.Extract({ path: `${zipDir}` }))
          .on('close', () => {
            fastify.log.info('Extracted zip ', `${zipDir}`);
            fastify
              .processFolder(`${zipDir}`, params, query)
              .then(() => resolve())
              .catch(err => reject(err));
          })
          .on('error', error => {
            fastify.log.info(`Extract error ${error}`);
            reject(error);
          });
      })
  );

  fastify.decorate(
    'processFolder',
    (zipDir, params, query) =>
      new Promise((resolve, reject) => {
        fastify.log.info(`Processing folder ${zipDir}`);
        const datasets = [];
        const studies = new Set();
        fs.readdir(zipDir, async (err, files) => {
          if (err) {
            fastify.log.info(`Unable to scan directory: ${err}`);
            reject(err);
          }
          const promisses = [];
          for (let i = 0; i < files.length; i += 1) {
            if (files[i] !== '__MACOSX')
              if (fs.statSync(`${zipDir}/${files[i]}`).isDirectory() === true)
                // eslint-disable-next-line no-await-in-loop
                await fastify.processFolder(`${zipDir}/${files[i]}`, params, query);
              else
                promisses.push(
                  fastify.processFile(zipDir, files[i], datasets, params, query, studies)
                );
          }
          Promise.all(promisses)
            .then(async () => {
              if (datasets.length > 0) {
                if (config.mode === 'thick')
                  await fastify.addProjectReferences(params, query, studies);
                fastify.log.info(`Writing ${datasets.length} dicoms in folder ${zipDir}`);
                const { data, boundary } = dcmjs.utilities.message.multipartEncode(datasets);
                fastify.log.info(
                  `Sending ${Buffer.byteLength(data)} bytes of data to dicom web server for saving`
                );
                fastify
                  .saveDicoms(data, boundary)
                  .then(() => resolve())
                  .catch(error => reject(error));
              } else {
                resolve();
              }
            })
            .catch(err2 => {
              fastify.log.info(`Error in save : ${err2}`);
              reject(err2);
            });
        });
      })
  );

  fastify.decorate(
    'processFile',
    (dir, filename, datasets, params, query, studies) =>
      new Promise((resolve, reject) => {
        try {
          let buffer = [];
          const readableStream = fs.createReadStream(`${dir}/${filename}`);
          readableStream.on('data', chunk => {
            buffer.push(chunk);
          });
          readableStream.on('error', readErr => {
            fastify.log.info(`Error in save when reading file ${dir}/${filename}: ${readErr}`);
            reject(readErr);
          });
          readableStream.on('close', () => {
            readableStream.destroy();
          });
          readableStream.on('end', () => {
            buffer = Buffer.concat(buffer);
            fastify.log.info(`Finished reading ${dir}/${filename} ${buffer.length}`);
            if (filename.endsWith('dcm') && !filename.startsWith('__MACOSX')) {
              const arrayBuffer = toArrayBuffer(buffer);
              studies.add(fastify.getDicomInfo(arrayBuffer));
              datasets.push(arrayBuffer);
              resolve();
            } else if (filename.endsWith('json') && !filename.startsWith('__MACOSX')) {
              const jsonBuffer = JSON.parse(buffer.toString());
              if ('TemplateContainer' in jsonBuffer) {
                // is it a template?
                fastify
                  .saveTemplateInternal(jsonBuffer)
                  .then(() => {
                    fastify.log.info(`Saving successful for ${filename}`);
                    resolve();
                  })
                  .catch(err => {
                    fastify.log.info(`Error in save for ${filename}: ${err}`);
                    reject(err);
                  });
              } else {
                fastify
                  .saveAimInternal(jsonBuffer)
                  .then(() => {
                    fastify.log.info(`Saving successful for ${filename}`);
                    resolve();
                  })
                  .catch(err => {
                    fastify.log.info(`Error in save for ${filename}: ${err}`);
                    reject(err);
                  });
              }
            } else if (filename.endsWith('zip') && !filename.startsWith('__MACOSX')) {
              fastify
                .processZip(dir, filename, params, query)
                .then(() => resolve())
                .catch(err => reject(err));
            } else if (fastify.checkFileType(filename))
              fastify
                .saveOtherFileToProjectInternal(
                  filename,
                  params,
                  query,
                  buffer,
                  Buffer.byteLength(buffer)
                )
                .then(() => resolve())
                .catch(err => reject(err));
            else reject(new Error('Unsupported filetype'));
          });
        } catch (err) {
          fastify.log.info(err.message);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'saveOtherFileToProjectInternal',
    (filename, params, query, buffer, length) =>
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
          // add link to db if thick
          if (config.mode === 'thick') {
            await fastify.putOtherFileToProjectInternal(fileInfo.name, params, query);
            // add to couchdb only if successful
            await fastify.saveOtherFileInternal(filename, fileInfo, buffer);
          } else {
            // add to couchdb
            await fastify.saveOtherFileInternal(filename, fileInfo, buffer);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate('getExtension', filename => {
    return filename.substr(filename.lastIndexOf('.') + 1).toLowerCase();
  });

  fastify.decorate('checkFileType', filename => {
    return config.validExt.includes(fastify.getExtension(filename));
  });

  fastify.decorate('deleteSubject', (request, reply) => {
    fastify
      .deleteSubjectInternal(request.params)
      .then(result => {
        reply.code(200).send(result);
      })
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.decorate(
    'deleteSubjectInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          const promisses = [];
          fastify
            .getPatientStudiesInternal(params)
            .then(result => {
              result.forEach(study => {
                promisses.push(
                  fastify.deleteStudyDicomsInternal({
                    subject: params.subject,
                    study: study.studyUID,
                  })
                );
              });
              promisses.push(fastify.deleteAimsInternal(params));
              Promise.all(promisses)
                .then(() => {
                  fastify.log.info('Success');
                  resolve('Success');
                })
                .catch(error => {
                  fastify.log.info(`Error in deleting ${error.message}`);
                  reject(error);
                });
            })
            .catch(getError => {
              fastify.log.info(`Error in deleting ${getError.message}`);
              reject(getError);
            });
        } catch (err) {
          fastify.log.info(`Error deleting: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate('deleteStudy', (request, reply) => {
    fastify
      .deleteStudyInternal(request.params)
      .then(result => {
        reply.code(200).send(result);
      })
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.decorate(
    'deleteStudyInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          // delete study in dicomweb and annotations
          Promise.all([
            fastify.deleteStudyDicomsInternal(params),
            fastify.deleteAimsInternal(params),
          ])
            .then(() => {
              resolve();
            })
            .catch(error => {
              fastify.log.info(`Error in deleting ${error.message}`);
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error deleting: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate('deleteSeries', (request, reply) => {
    try {
      // delete study in dicomweb and annotations
      Promise.all([
        fastify.deleteSeriesDicomsInternal(request.params),
        fastify.deleteAimsInternal(request.params),
      ])
        .then(() => {
          fastify.log.info('Success');
          reply.code(200).send();
        })
        .catch(error => {
          fastify.log.info(`Error in deleting ${error.message}`);
          reply.code(503).send(error.message);
        });
    } catch (err) {
      fastify.log.info(`Error deleting: ${err.message}`);
      reply.code(503).send(err.message);
    }
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(other);
