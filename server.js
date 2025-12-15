/* eslint-disable global-require */
const fs = require('fs-extra');
const path = require('path');
const config = require('./config/index');

function buildServer(opts = {}) {
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
        : undefined,
    ...opts, // 👈 allows test overrides
  });

  // -----------------------------
  // Content-type parser
  // -----------------------------
  fastify.addContentTypeParser('*', (_, payload, done) => {
    const data = [];
    payload.on('data', (chunk) => {
      data.push(chunk);
    });
    payload.on('end', () => {
      done(null, Buffer.concat(data));
    });
  });

  // -----------------------------
  // Schemas
  // -----------------------------
  fastify.addSchema(require('./config/schemas/epadlite_patients_output_schema.json'));
  fastify.addSchema(require('./config/schemas/epadlite_studies_output_schema.json'));
  fastify.addSchema(require('./config/schemas/epadlite_series_output_schema.json'));
  fastify.addSchema(require('./config/schemas/epadlite_images_output_schema.json'));
  fastify.addSchema(require('./config/schemas/epad_users_output_schema.json'));

  // -----------------------------
  // Plugins
  // -----------------------------
  fastify.register(require('@fastify/cors'), {
    origin: config.corsOrigin,
  });

  fastify.register(require('./plugins/CouchDB'), {
    url: `${config.dbServer}:${config.dbPort}`,
  });

  fastify.register(require('./plugins/DICOMwebServer'), {
    url: `${config.dicomWebServer}`,
  });

  fastify.register(require('./plugins/Other'));
  fastify.register(require('./plugins/Reporting'));
  fastify.register(require('./plugins/EpadDB'));
  fastify.register(require('./plugins/Ontology'));

  // -----------------------------
  // Swagger
  // -----------------------------
  const port = process.env.port || '8080';
  const host = process.env.host || '0.0.0.0';

  const documentationPath =
    config.prefix && config.prefix !== '' ? `/${config.prefix}/documentation` : '/documentation';

  fastify.register(require('@fastify/swagger'), {
    routePrefix: documentationPath,
    exposeRoute: true,
    swagger: {
      info: {
        title: 'ePAD REST API',
        description: 'REST API Enpoints for ePad>4.0 or lite',
        version: '1.0.0',
      },
      tags: [
        { name: 'project', description: 'Project related end-points' },
        { name: 'subject', description: 'Subject related end-points' },
        { name: 'study', description: 'Study related end-points' },
        { name: 'series', description: 'Series related end-points' },
        { name: 'aim', description: 'Aim related end-points' },
        { name: 'template', description: 'Template related end-points' },
        { name: 'worklist', description: 'Worklist related end-points' },
        { name: 'user', description: 'User related end-points' },
        { name: 'images', description: 'Image related end-points' },
        { name: 'ontology', description: 'lexicon related end-points' },
        { name: 'register', description: 'server registration related end-points' },
      ],
      externalDocs: {
        url: 'https://swagger.io',
        description: 'Find more info here',
      },
      host: `${host}:${port}`,
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });

  // -----------------------------
  // Routes
  // -----------------------------
  const routes = [
    'worklist',
    'template',
    'aim',
    'dicomweb',
    'user',
    'other',
    'project',
    'projectTemplate',
    'projectAim',
    'projectDicomweb',
    'ontology',
    'register',
    'plugin',
  ];

  // eslint-disable-next-line no-restricted-syntax
  for (const route of routes) {
    // eslint-disable-next-line import/no-dynamic-require
    fastify.register(require(`./routes/${route}`), {
      prefix: config.prefix,
    });
  }

  // -----------------------------
  // Optional email
  // -----------------------------
  if (config.notificationEmail) {
    fastify.register(require('fastify-nodemailer'), {
      pool: true,
      host: config.notificationEmail.host,
      port: config.notificationEmail.port,
      secure: config.notificationEmail.isTls,
      auth: config.notificationEmail.auth,
    });
  }

  // -----------------------------
  // Static files
  // -----------------------------
  const downloadFolder = path.join(__dirname, '/download');
  if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);

  fastify.register(require('@fastify/static'), {
    root: downloadFolder,
    prefix: config.prefix ? `/${config.prefix}/download/` : '/download/',
  });

  // -----------------------------
  // Graceful shutdown
  // -----------------------------
  fastify.addHook('onClose', async (instance) => {
    instance.log.info('Server closing');

    if (typeof instance.closeDB === 'function') {
      await instance.closeDB(instance);
    }

    if (typeof instance.closeCouchDB === 'function') {
      await instance.closeCouchDB(instance);
    }
  });

  fastify.ready((err) => {
    if (err) throw err;
    fastify.swagger();
  });

  return fastify;
}

module.exports = buildServer;
