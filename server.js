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

const port = process.env.port || '8080';
const host = process.env.host || '0.0.0.0';
// Run the server!
fastify.listen(port, host);

module.exports = fastify;
