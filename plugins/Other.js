const fp = require('fastify-plugin');
const fs = require('fs-extra');
const unzip = require('unzip-stream');
const toArrayBuffer = require('to-array-buffer');
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');

async function other(fastify) {
  // eslint-disable-next-line global-require
  fastify.register(require('fastify-multipart'));
  fastify.decorate('saveFile', (request, reply) => {
    const timestamp = new Date().getTime();
    const dir = `/tmp/tmp_${timestamp}`;
    const filenames = [];
    function done(err) {
      if (err) {
        fastify.log.info(err.message);
        reply.code(503).send(err.message);
      } else {
        const datasets = [];
        const filePromisses = [];
        filenames.forEach(filename => {
          filePromisses.push(fastify.processFile(dir, filename, datasets));
        });
        Promise.all(filePromisses)
          .then(() => {
            // see if it was a dicom
            if (datasets.length > 0) {
              // fastify.log.info(`writing dicom folder ${filename}`);
              const { data, boundary } = dcmjs.utilities.message.multipartEncode(datasets);
              fastify.saveDicoms(data, boundary).then(() => {
                fastify.log.info('Upload completed');
                reply.code(200).send();
                fs.remove(dir, error => {
                  if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                  fastify.log.info(`${dir} deleted`);
                });
              });
            } else {
              fastify.log.info('Upload completed');
              reply.code(200).send();
              fs.remove(dir, error => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                fastify.log.info(`${dir} deleted`);
              });
            }
          })
          .catch(filesErr => {
            fastify.log.info(filesErr);
            reply.code(503).send(filesErr.message);
            fs.remove(dir, error => {
              if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
              fastify.log.info(`${dir} deleted`);
            });
          });
      }
    }
    function handler(field, file, filename) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        file.pipe(fs.createWriteStream(`${dir}/${filename}`));
        filenames.push(filename);
      }
    }

    request.multipart(handler, done);
  });
  fastify.decorate(
    'processZip',
    (dir, filename) =>
      new Promise((resolve, reject) => {
        const zipTimestamp = new Date().getTime();
        const zipDir = `${dir}/tmp_${zipTimestamp}`;
        fs.mkdir(zipDir, errMkdir => {
          if (errMkdir) fastify.log.info(`Couldn't create ${zipDir}`);
          else {
            fastify.log.info(`Extracting ${dir}/${filename} to ${zipDir}`);
            fs.createReadStream(`${dir}/${filename}`)
              .pipe(unzip.Extract({ path: `${zipDir}` }))
              .on('close', () => {
                fastify.log.info('Extracted zip ', `${zipDir}`);
                fastify
                  .processFolder(`${zipDir}`)
                  .then(() => resolve())
                  .catch(err => reject(err));
              })
              .on('error', error => {
                fastify.log.info(`Extract error ${error}`);
                reject(error);
              });
          }
        });
      })
  );

  fastify.decorate(
    'processFolder',
    zipDir =>
      new Promise((resolve, reject) => {
        fastify.log.info(`Processing folder ${zipDir}`);
        const datasets = [];
        fs.readdir(zipDir, (err, files) => {
          if (err) {
            fastify.log.info(`Unable to scan directory: ${err}`);
            reject(err);
          }
          const promisses = [];
          for (let i = 0; i < files.length; i += 1) {
            if (files[i] !== '__MACOSX')
              if (fs.statSync(`${zipDir}/${files[i]}`).isDirectory() === true)
                promisses.push(fastify.processFolder(`${zipDir}/${files[i]}`));
              else promisses.push(fastify.processFile(zipDir, files[i], datasets));
          }
          Promise.all(promisses)
            .then(() => {
              if (datasets.length > 0) {
                fastify.log.info(`Writing ${datasets.length} dicoms in folder ${zipDir}`);
                const { data, boundary } = dcmjs.utilities.message.multipartEncode(datasets);
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
    (dir, filename, datasets) =>
      new Promise((resolve, reject) => {
        try {
          fs.readFile(`${dir}/${filename}`, (readErr, buffer) => {
            if (readErr) {
              fastify.log.info(`Error in save for ${filename}: ${readErr}`);
              reject(readErr);
            } else if (filename.endsWith('dcm') && !filename.startsWith('__MACOSX')) {
              datasets.push(toArrayBuffer(buffer));
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
                .processZip(dir, filename)
                .then(() => resolve())
                .catch(err => reject(err));
            } else {
              fastify.log.info(`Entry ${dir}/${filename} ignored`);
              resolve();
            }
          });
        } catch (err) {
          fastify.log.info(err.message);
          reject(err);
        }
      })
  );

  fastify.decorate('deleteSubject', (request, reply) => {
    try {
      const promisses = [];
      fastify
        .getPatientStudiesInternal(request.params)
        .then(result => {
          result.ResultSet.Result.forEach(study => {
            promisses.push(
              fastify.deleteStudyDicomsInternal({
                subject: request.params.subject,
                study: study.studyUID,
              })
            );
          });
          promisses.push(fastify.deleteAimsInternal(request.params));
          Promise.all(promisses)
            .then(() => {
              fastify.log.info('Success');
              reply.code(200).send();
            })
            .catch(error => {
              fastify.log.info(`Error in deleting ${error.message}`);
              reply.code(503).send(error.message);
            });
        })
        .catch(getError => {
          fastify.log.info(`Error in deleting ${getError.message}`);
          reply.code(503).send(getError.message);
        });
    } catch (err) {
      fastify.log.info(`Error deleting: ${err.message}`);
      reply.code(503).send(err.message);
    }
  });

  fastify.decorate('deleteStudy', (request, reply) => {
    try {
      // delete study in dicomweb and annotations
      Promise.all([
        fastify.deleteStudyDicomsInternal(request.params),
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
