const fp = require('fastify-plugin');
const fs = require('fs-extra');
const unzip = require('unzip-stream');
const toArrayBuffer = require('to-array-buffer');
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');
const atob = require('atob');

const config = require('../config/index');

// I need to import this after config as it uses config values
// eslint-disable-next-line import/order
const keycloak = require('keycloak-backend')({
  realm: config.authConfig.realm, // required for verify
  'auth-server-url': config.authConfig.authServerUrl, // required for verify
  client_id: config.authConfig.clientId,
  client_secret: config.authConfig.clientSecret,
});

const EpadNotification = require('../utils/EpadNotification');

const { InternalError, ResourceNotFoundError } = require('../utils/EpadErrors');

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
          .then(() => {
            let datasets = [];
            const filePromisses = [];
            filenames.forEach(filename => {
              filePromisses.push(fastify.processFile(dir, filename, datasets));
            });
            fastify.log.info('Files copy completed. sending response');
            reply.code(200).send();
            Promise.all(filePromisses)
              .then(() => {
                // see if it was a dicom
                if (datasets.length > 0) {
                  // fastify.log.info(`writing dicom folder ${filename}`);
                  const { data, boundary } = dcmjs.utilities.message.multipartEncode(datasets);
                  fastify.saveDicoms(data, boundary).then(() => {
                    fastify.log.info('Upload completed');
                    datasets = [];
                    // reply.code(200).send();
                    fs.remove(dir, error => {
                      if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                      fastify.log.info(`${dir} deleted`);
                    });
                  });
                } else {
                  fastify.log.info('Upload completed');
                  // reply.code(200).send();
                  fs.remove(dir, error => {
                    if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                    fastify.log.info(`${dir} deleted`);
                  });
                }
                new EpadNotification(request, 'Upload Completed', filenames).notify(fastify);
              })
              .catch(filesErr => {
                fastify.log.info(filesErr.message);
                reply.code(500).send(new InternalError('Upload Error', filesErr));
                fs.remove(dir, error => {
                  if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                  fastify.log.info(`${dir} deleted`);
                });
              });
          })
          .catch(fileSaveErr => {
            fastify.log.info(fileSaveErr.message);
            reply.code(500).send(new InternalError('Upload Error', fileSaveErr));
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

  fastify.decorate('getNotifications', (request, reply) => {
    reply.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    // reply.res.write('id: 1\n');
    // reply.res.write('data: some text\n\n');
    fastify.addConnectedUser(request, reply);
    request.req.on('close', () => {
      fastify.deleteDisconnectedUser(request);
    }); // <- Remove this client when he disconnects
  });

  fastify.decorate('getInfoFromRequest', request => {
    const reqInfo = {};
    reqInfo.method = request.req.method;
    const methodText = { GET: 'GET', POST: 'CREATE', PUT: 'UPDATE', DELETE: 'DELETE' };
    reqInfo.methodText = methodText[request.req.method];
    const urlParts = request.req.url.split('/');
    const levels = {
      projects: 'project',
      subjects: 'subject',
      studies: 'study',
      series: 'series',
      images: 'image',
      aims: 'aim',
      files: 'file',
      templates: 'template',
    };
    if (levels[urlParts[urlParts.length - 1]]) {
      reqInfo.level = urlParts[urlParts.length - 1];
    } else if (levels[urlParts[urlParts.length - 2]]) {
      reqInfo.level = levels[urlParts[urlParts.length - 2]];
      reqInfo.object = urlParts[urlParts.length - 1];
    } else reqInfo.level = request.req.url;
    console.log(request.req.url, reqInfo);
    return reqInfo;
  });

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
          const verifyToken = await keycloak.jwt.verify(token);
          if (verifyToken.isExpired()) {
            res.code(401).send({
              message: 'Token is expired',
            });
          }
        } catch (e) {
          fastify.log.info(e);
          res.code(401).send({
            message: e.message,
          });
        }
      }
    } else if (authHeader.startsWith('Basic ')) {
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
            res.code(401).send({
              message: 'Authentication unsuccessful',
            });
          }
        } catch (err) {
          res.code(401).send({
            message: `Authentication error ${err.message}`,
          });
        }
      }
    } else {
      res.code(401).send({
        message: 'Bearer token does not exist',
      });
    }
  });
  fastify.decorate('messageId', 0);
  fastify.decorate('connectedUsers', {});
  fastify.decorate('sse', (messageJson, username = 'nouser') => {
    fastify.connectedUsers[username].write(`id: ${fastify.messageId}\n`);
    // eslint-disable-next-line no-param-reassign
    fastify.messageId += 1;
    fastify.connectedUsers[username].write(`data: ${JSON.stringify(messageJson)}\n\n`);
  });
  fastify.decorate(
    'addConnectedUser',
    // eslint-disable-next-line no-return-assign
    (req, res) => {
      console.log(`adding ${req.query && req.query.username ? req.query.username : 'nouser'}`);
      // eslint-disable-next-line no-param-reassign
      fastify.connectedUsers[req.query && req.query.username ? req.query.username : 'nouser'] =
        res.res;
    }
  );
  fastify.decorate(
    'deleteDisconnectedUser',
    // eslint-disable-next-line no-return-assign
    req => {
      console.log(`deleting ${req.query && req.query.username ? req.query.username : 'nouser'}`);
      // eslint-disable-next-line no-param-reassign
      delete fastify.connectedUsers[
        req.query && req.query.username ? req.query.username : 'nouser'
      ];
      console.log(fastify.connectedUsers);
    }
  );

  fastify.decorate('auth', async (req, res) => {
    if (config.auth && config.auth !== 'none') {
      // if auth has been given in config, verify authentication
      fastify.log.info('Request needs to be authenticated, checking the authorization header');
      const authHeader = req.headers['x-access-token'] || req.headers.authorization;
      if (authHeader) {
        await fastify.authCheck(authHeader, res);
      } else {
        res.code(401).send({
          message: 'Authentication info does not exist or conform with the server',
        });
      }
      try {
        if (config.mode === 'thick') await fastify.epadThickRightsCheck(authHeader, res);
        // TODO lite?
      } catch (err) {
        res.code(401).send(err);
      }
    }
  });

  fastify.decorate(
    'hasAccessToProject',
    request =>
      new Promise((resolve, reject) => {
        try {
          console.log(`Checking hasAccessToProject for url: ${request.req.url}`);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      })
  );
  fastify.decorate(
    'hasCreatePermission',
    (request, level) =>
      new Promise((resolve, reject) => {
        try {
          console.log(`Checking hasCreatePermission for url: ${request.req.url} level:${level}`);
          if (['user', 'connection', 'query'].includes(level)) resolve(true);
          else resolve(false);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'isOwnerOfProject',
    request =>
      new Promise((resolve, reject) => {
        try {
          console.log(`Checking isOwnerOfProject for url: ${request.req.url}`);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      })
  );

  fastify.decorate(
    'isCreatorOfObject',
    (request, level, object) =>
      new Promise((resolve, reject) => {
        try {
          console.log(
            `Checking isCreatorOfObject for url: ${request.req.url} level:${level} object:${object}`
          );
          resolve(true);
        } catch (err) {
          reject(err);
        }
      })
  );
  fastify.decorate('isProjectRoute', request => request.req.url.startsWith('/projects/'));

  fastify.decorate('epadThickRightsCheck', async (request, reply) => {
    const reqInfo = fastify.getInfoFromRequest(request);
    // check if user type is admin

    // if not admin
    // check the method and call specific rights check
    if (fastify.isProjectRoute(request)) {
      switch (request.req.method) {
        case 'GET': // check project access (projectToRole). filtering should be done in the methods
          if (!fastify.hasAccessToProject(request))
            reply.code(401).send('User has no access to project');
          break;
        case 'PUT': // check permissions
          if (
            !fastify.hasAccessToProject(request) ||
            !fastify.isOwnerOfProject(request) ||
            !fastify.isCreatorOfObject(request, reqInfo.level, reqInfo.object)
          )
            reply.code(401).send('User has no access to project and/or resource');
          break;
        case 'POST':
          if (
            !fastify.hasAccessToProject(request) ||
            (reqInfo.level === 'project' && !fastify.hasCreatePermission(request, reqInfo.level))
          )
            reply.code(401).send('User has no access to project and/or to create');
          break;
        case 'DELETE': // check if owner
          if (
            (fastify.isProjectRoute(request) && !fastify.hasAccessToProject(request)) ||
            !fastify.isOwnerOfProject(request) ||
            !fastify.isCreatorOfObject(request, reqInfo.level, reqInfo.object)
          )
            reply.code(401).send('User has no access to project and/or resource');
          break;
        default:
          break;
      }
    } else {
      switch (request.req.method) {
        case 'GET': // filtering should be done in the methods
          break;
        case 'PUT': // check permissions
          if (!fastify.isCreatorOfObject(request))
            reply.code(401).send('User has no access to resource');
          break;
        case 'POST':
          if (!fastify.hasCreatePermission(request, reqInfo.level))
            reply.code(401).send('User has no access to create');
          break;
        case 'DELETE': // check if owner
          if (!fastify.isCreatorOfObject(request))
            reply.code(401).send('User has no access to resource');
          break;
        default:
          break;
      }
    }
  });

  fastify.addHook('onError', (request, reply, error, done) => {
    if (error instanceof ResourceNotFoundError) reply.code(404);
    else if (error instanceof InternalError) reply.code(500);
    new EpadNotification(request, fastify.getInfoFromRequest(request), error).notify(fastify);
    done();
  });

  fastify.decorate('responseWrapper', (request, reply, payload, done) => {
    if (request.req.method === 'PUT') {
      new EpadNotification(request, fastify.getInfoFromRequest(request), 'Put successful').notify(
        fastify
      );
    }
    done(null, payload);
  });
  // add authentication prehandler, all requests need to be authenticated
  fastify.addHook('preHandler', fastify.auth);

  fastify.addHook('onSend', fastify.responseWrapper);
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(other);
