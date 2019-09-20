const fs = require('fs-extra');
const path = require('path');
// eslint-disable-next-line import/order
const config = require('./config/index');
// Require the framework and instantiate it
const fastify = require('fastify')({
  logger: config.logger || false,
  https:
    config.https === true &&
    fs.existsSync(path.join(__dirname, 'tls.key')) &&
    fs.existsSync(path.join(__dirname, 'tls.crt'))
      ? {
          key: fs.readFileSync(path.join(__dirname, 'tls.key')),
          cert: fs.readFileSync(path.join(__dirname, 'tls.crt')),
        }
      : '',
});

const atob = require('atob');

// I need to import this after config as it uses config values
const keycloak = require('keycloak-backend')({
  realm: config.authConfig.realm, // required for verify
  'auth-server-url': config.authConfig.authServerUrl, // required for verify
  client_id: config.authConfig.clientId,
  client_secret: config.authConfig.clientSecret,
});

fastify.addContentTypeParser('*', (req, done) => {
  let data = [];
  req.on('data', chunk => {
    data.push(chunk);
  });
  req.on('end', () => {
    data = Buffer.concat(data);
    done(null, data);
  });
});

// require schema jsons
const epadlitePatientsSchema = require('./config/schemas/epadlite_patients_output_schema.json');
const epadliteStudiesSchema = require('./config/schemas/epadlite_studies_output_schema.json');
const epadliteSeriesSchema = require('./config/schemas/epadlite_series_output_schema.json');
const epadliteImagesSchema = require('./config/schemas/epadlite_images_output_schema.json');

// // add schemas to fastify to use by id
fastify.addSchema(epadlitePatientsSchema);
fastify.addSchema(epadliteStudiesSchema);
fastify.addSchema(epadliteSeriesSchema);
fastify.addSchema(epadliteImagesSchema);

// enable cors
fastify.register(require('fastify-cors'), {
  origin: '*',
});

// register CouchDB plugin we created
fastify.register(require('./plugins/CouchDB'), {
  url: `${config.dbServer}:${config.dbPort}`,
});

// register DICOMwebServer plugin we created
fastify.register(require('./plugins/DICOMwebServer'), {
  url: `${config.dicomWebServer}`,
});

// register Other plugin we created
fastify.register(require('./plugins/Other'));

// register routes
// this should be done after CouchDB plugin to be able to use the accessor methods
fastify.register(require('./routes/aim'), { prefix: '/projects/lite' }); // eslint-disable-line global-require
fastify.register(require('./routes/template')); // eslint-disable-line global-require
fastify.register(require('./routes/dicomweb'), { prefix: '/projects/lite' }); // eslint-disable-line global-require
fastify.register(require('./routes/other'), { prefix: '/projects/lite' }); // eslint-disable-line global-require

// authCheck routine checks if there is a bearer token or encoded basic authentication
// info in the authorization header and does the authentication or verification of token
// in keycloak
const authCheck = async (authHeader, res) => {
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
};

fastify.decorate('connectedUsers', {});
fastify.decorate('sse', (messageJson, username = 'nouser') => {
  fastify.connectedUsers[username].write('id: 3\n');
  fastify.connectedUsers[username].write(`data: ${JSON.stringify(messageJson)}\n\n`);
});
fastify.decorate(
  'addConnectedUser',
  // eslint-disable-next-line no-return-assign
  (req, res) => {
    console.log(`adding ${req.query && req.query.username ? req.query.username : 'nouser'}`);
    fastify.connectedUsers[req.query && req.query.username ? req.query.username : 'nouser'] =
      res.res;
  }
);

fastify.decorate('auth', async (req, res) => {
  if (config.auth && config.auth !== 'none') {
    // if auth has been given in config, verify authentication
    fastify.log.info('Request needs to be authenticated, checking the authorization header');
    const authHeader = req.headers['x-access-token'] || req.headers.authorization;
    if (authHeader) {
      await authCheck(authHeader, res);
    } else {
      res.code(401).send({
        message: 'Authentication info does not exist or conform with the server',
      });
    }
  }
});

// add authentication prehandler, all requests need to be authenticated
fastify.addHook('preHandler', fastify.auth);

const port = process.env.port || '8080';
const host = process.env.host || '0.0.0.0';
// Run the server!
fastify.listen(port, host);

module.exports = fastify;
