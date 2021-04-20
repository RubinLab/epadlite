/* eslint-disable global-require */
const fs = require('fs-extra');
const path = require('path');
const config = require('./config/index');

// Require the framework and instantiate it
// eslint-disable-next-line import/order
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

fastify.addContentTypeParser('*', (_, payload, done) => {
  let data = [];
  payload.on('data', (chunk) => {
    data.push(chunk);
  });
  payload.on('end', () => {
    data = Buffer.concat(data);
    done(null, data);
  });
});

// require schema jsons
const epadlitePatientsSchema = require('./config/schemas/epadlite_patients_output_schema.json');
const epadliteStudiesSchema = require('./config/schemas/epadlite_studies_output_schema.json');
const epadliteSeriesSchema = require('./config/schemas/epadlite_series_output_schema.json');
const epadliteImagesSchema = require('./config/schemas/epadlite_images_output_schema.json');
const epadUsersSchema = require('./config/schemas/epad_users_output_schema.json');

// // add schemas to fastify to use by id
fastify.addSchema(epadlitePatientsSchema);
fastify.addSchema(epadliteStudiesSchema);
fastify.addSchema(epadliteSeriesSchema);
fastify.addSchema(epadliteImagesSchema);
fastify.addSchema(epadUsersSchema);
// enable cors
fastify.register(require('fastify-cors'), {
  origin: config.corsOrigin,
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

fastify.register(require('./plugins/Reporting'));

fastify.register(require('./plugins/Ontology'));

const port = process.env.port || '8080';
const host = process.env.host || '0.0.0.0';

const documentationPath =
  config.prefix && config.prefix !== '' ? `/${config.prefix}/documentation` : '/documentation';

fastify.register(
  // eslint-disable-next-line import/no-dynamic-require
  require('fastify-swagger'),
  {
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
  }
);

// register epaddb plugin we created
// eslint-disable-next-line global-require
fastify.register(require('./plugins/EpadDB'));
// register routes
// this should be done after CouchDB plugin to be able to use the accessor methods
// for both thick and lite
fastify.register(require('./routes/worklist'), { prefix: config.prefix }); // eslint-disable-line global-require

// adding generic routes for completion, in lite, they work the same as the projects/lite prefix
fastify.register(require('./routes/template'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/aim'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/dicomweb'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/user'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/other'), { prefix: config.prefix }); // eslint-disable-line global-require

fastify.register(require('./routes/project'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/projectTemplate'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/projectAim'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/projectDicomweb'), { prefix: config.prefix }); // eslint-disable-line global-require
fastify.register(require('./routes/ontology'), { prefix: config.prefix }); // eslint-disable-line global-require

if (config.mode === 'thick') {
  fastify.register(require('./routes/plugin'), { prefix: config.prefix }); // eslint-disable-line global-require
}
if (config.notificationEmail) {
  fastify.register(require('fastify-nodemailer'), {
    pool: true,
    host: config.notificationEmail.host,
    port: config.notificationEmail.port,
    secure: config.notificationEmail.isTls, // use TLS
    auth: config.notificationEmail.auth,
  });
}

if (config.rabbitmq) {
  fastify.register(require('fastify-amqp'), {
    protocol: config.rabbitmq.protocol,
    hostname: config.rabbitmq.hostname,
    port: config.rabbitmq.port,
    username: config.rabbitmq.username,
    password: config.rabbitmq.password,
    vhost: config.rabbitmq.vhost,
  });
}

// download folder required for static
const downloadFolder = path.join(__dirname, '/download');
if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);
fastify.register(require('fastify-static'), {
  root: path.join(__dirname, 'download'),
  prefix: '/download/',
});
// Run the server!
fastify.listen(port, host);

fastify.ready((err) => {
  if (err) throw err;
  fastify.consumeRabbitMQ();
  fastify.swagger();

  fastify.addHook('onClose', async (instance) => {
    await fastify.closeDB(instance);
    await fastify.closeCouchDB(instance);
  });
});

module.exports = fastify;
