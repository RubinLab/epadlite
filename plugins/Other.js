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
                await fastify.saveDicoms(data, boundary);
                datasets = [];
                studies = new Set();
              }
              fastify.log.info('Upload completed');
              fs.remove(dir, error => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                fastify.log.info(`${dir} deleted`);
              });
              new EpadNotification(request, 'Upload Completed', filenames).notify(fastify);
              // test should wait for the upload to actually finish to send the response.
              // sending the reply early is to handle very large files and to avoid browser repeating the request
              if (config.env === 'test') reply.code(200).send();
            } catch (filesErr) {
              fastify.log.info(filesErr);
              reply.code(500).send(new InternalError('Upload Error', filesErr));
              fs.remove(dir, error => {
                if (error) fastify.log.info(`Temp directory deletion error ${error.message}`);
                else fastify.log.info(`${dir} deleted`);
              });
            }
          })
          .catch(fileSaveErr => {
            fastify.log.info(fileSaveErr.message);
            reply.code(500).send(new InternalError('Upload Error', fileSaveErr));
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
              result.ResultSet.Result.forEach(study => {
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
    };
    if (levels[urlParts[urlParts.length - 1]]) {
      if (reqInfo.method === 'POST') reqInfo.level = levels[urlParts[urlParts.length - 1]];
      else reqInfo.level = urlParts[urlParts.length - 1];
    } else if (levels[urlParts[urlParts.length - 2]]) {
      reqInfo.level = levels[urlParts[urlParts.length - 2]];
      reqInfo.objectId = urlParts[urlParts.length - 1];
    } else reqInfo.level = request.req.url;
    // eslint-disable-next-line prefer-destructuring
    if (urlParts[0] === 'projects' && urlParts.length > 1) reqInfo.project = urlParts[1];
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
          } else {
            return await fastify.fillUserInfo(verifyToken.content.preferred_username);
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
          } else {
            return await fastify.fillUserInfo(username);
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
    return undefined;
  });
  fastify.decorate(
    'fillUserInfo',
    async username =>
      new Promise(async (resolve, reject) => {
        const epadAuth = { username };
        if (config.mode === 'thick') {
          try {
            const user = await fastify.getUserInternal({
              user: username,
            });
            console.log('user');
            console.log(user);
            epadAuth.permissions = user.permissions;
            epadAuth.projectToRole = user.projectToRole;
            epadAuth.admin = user.admin;
          } catch (errUser) {
            console.log('user error', errUser.message);
            reject(errUser);
          }
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
    }
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
    } else if (config.env === 'test' && req.query.username) {
      // just see if the url has username. for testing purposes
      try {
        req.epadAuth = await fastify.fillUserInfo(req.query.username);
      } catch (err) {
        res.code(401).send(err.message);
      }
    }
    try {
      if (config.mode === 'thick') await fastify.epadThickRightsCheck(req, res);
      // TODO lite?
    } catch (err) {
      res.code(401).send(err);
    }
  });

  fastify.decorate('hasAccessToProject', (request, project) => {
    try {
      console.log(`Checking hasAccessToProject for url: ${request.req.url}`);

      if (request.epadAuth && request.epadAuth.projectToRole) {
        for (let i = 0; i < request.epadAuth.projectToRole.length; i += 1) {
          if (`${project}:.*`.match(request.epadAuth.projectToRole[i])) {
            console.log(
              `has right ${request.epadAuth.projectToRole[i].substring(
                project.length,
                request.epadAuth.projectToRole[i].length - 1
              )}`
            );
            return request.epadAuth.projectToRole[i].substring(
              project.length,
              request.epadAuth.projectToRole[i].length - 1
            );
          }
        }
      }
    } catch (err) {
      console.log(err.message);
    }
    return undefined;
  });
  fastify.decorate('hasCreatePermission', (request, level) => {
    try {
      console.log(`Checking hasCreatePermission for url: ${request.req.url} level:${level}`);
      if (
        ['project', 'user', 'connection', 'query'].includes(level) && // do we need this check
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
      console.log(err.message);
    }
    return false;
  });

  fastify.decorate('isOwnerOfProject', (request, project) => {
    try {
      console.log(`Checking isOwnerOfProject for url: ${request.req.url}`);
      if (request.epadAuth && request.epadAuth.projectToRole.includes(`${project}:Owner`))
        return true;
    } catch (err) {
      console.log(err.message);
    }
    return false;
  });

  fastify.decorate('isCreatorOfObject', async (request, reqInfo) => {
    try {
      console.log(
        `Checking isCreatorOfObject for url: ${request.req.url} level:${reqInfo.level} object:${
          reqInfo.objectId
        }`
      );
      const creator = await fastify.getObjectCreator(reqInfo.level, reqInfo.objectId);
      console.log('creator', creator);
      if (creator && creator === request.epadAuth.username) return true;
      // not a db item return true
      if (!creator) {
        if (reqInfo.level === 'aim') {
          const author = await fastify.getAimAuthorFromUID(reqInfo.objectId);
          if (author === request.epadAuth.username) return true;
          return false;
        }
        return false;
      }
      return false;
    } catch (err) {
      console.log(err.message);
      return false;
    }
  });
  fastify.decorate('isProjectRoute', request => request.req.url.startsWith('/projects/'));

  fastify.decorate('epadThickRightsCheck', async (request, reply) => {
    const reqInfo = fastify.getInfoFromRequest(request);
    console.log('thick', reqInfo, request.epadAuth);
    // check if user type is admin, if not admin
    if (!(request.epadAuth && request.epadAuth.admin && request.epadAuth.admin === true)) {
      if (fastify.isProjectRoute(request)) {
        // check the method and call specific rights check
        switch (request.req.method) {
          case 'GET': // check project access (projectToRole). filtering should be done in the methods
            if (fastify.hasAccessToProject(request) === undefined)
              reply.code(401).send('User has no access to project');
            break;
          case 'PUT': // check permissions
            if (
              fastify.hasAccessToProject(request) === undefined &&
              fastify.isOwnerOfProject(request, reqInfo.project) === false &&
              (await fastify.isCreatorOfObject(request, reqInfo)) === false
            )
              reply.code(401).send('User has no access to project and/or resource');
            break;
          case 'POST':
            if (
              fastify.hasAccessToProject(request) === undefined &&
              (reqInfo.level === 'project' && !fastify.hasCreatePermission(request, reqInfo.level))
            )
              reply.code(401).send('User has no access to project and/or to create');
            break;
          case 'DELETE': // check if owner
            if (
              fastify.hasAccessToProject(request) === undefined &&
              fastify.isOwnerOfProject(request, reqInfo.project) === false &&
              (await fastify.isCreatorOfObject(request, reqInfo)) === false
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
            if (await !fastify.isCreatorOfObject(request, reqInfo))
              reply.code(401).send('User has no access to resource');
            break;
          case 'POST':
            if (!fastify.hasCreatePermission(request, reqInfo.level))
              reply.code(401).send('User has no access to create');
            break;
          case 'DELETE': // check if owner
            if (await !fastify.isCreatorOfObject(request, reqInfo))
              reply.code(401).send('User has no access to resource');
            break;
          default:
            break;
        }
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
