/* eslint-disable no-underscore-dangle */
const fp = require('fastify-plugin');
const config = require('../config/index');
const viewsjs = require('../config/views');

async function couchdb(fastify, options) {
  // Update the views in couchdb with the ones defined in the code
  fastify.decorate(
    'checkAndCreateDb',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const databases = await fastify.couch.db.list();
          // check if the db exists
          if (databases.indexOf(config.db) < 0) {
            await fastify.couch.db.create(config.db);
          }
          const dicomDB = fastify.couch.db.use(config.db);
          // define an empty design document
          let viewDoc = {};
          viewDoc.views = {};
          // try and get the design document
          try {
            viewDoc = await dicomDB.get('_design/instances');
          } catch (e) {
            fastify.log.info('View document not found! Creating new one');
          }
          const keys = Object.keys(viewsjs.views);
          const values = Object.values(viewsjs.views);
          // update the views
          for (let i = 0; i < keys.length; i += 1) {
            viewDoc.views[keys[i]] = values[i];
          }
          // insert the updated/created design document
          await dicomDB.insert(viewDoc, '_design/instances', insertErr => {
            if (insertErr) {
              fastify.log.info(`Error updating the design document ${insertErr.message}`);
              reject(insertErr);
            } else {
              fastify.log.info('Design document updated successfully ');
              resolve();
            }
          });
        } catch (err) {
          fastify.log.info(`Error connecting to couchdb: ${err.message}`);
          reject(err);
        }
      })
  );

  // add accessor methods with decorate
  fastify.decorate(
    'getAims',
    (format, params) =>
      new Promise(async (resolve, reject) => {
        try {
          // define which view to use according to the parameter format
          // default is json
          let view = 'aims_json';
          if (format) {
            if (format === 'json') view = 'aims_json';
            else if (format === 'summary') view = 'aims_summary';
          }
          const db = fastify.couch.db.use(config.db);
          db.view(
            'instances',
            view,
            {
              startkey: [params.subject, params.study, params.series, ''],
              endkey: [
                `${params.subject}\u9999`,
                `${params.study}\u9999`,
                `${params.series}\u9999`,
                '{}',
              ],
              reduce: true,
              group_level: 5,
            },
            (error, body) => {
              if (!error) {
                const res = [];

                if (view === 'aims_summary') {
                  body.rows.forEach(instance => {
                    // get the actual instance object (tags only)
                    res.push(instance.key[4]);
                  });
                  resolve({ ResultSet: { Result: res } });
                } else {
                  // the default is json! The old APIs were XML, no XML in epadlite
                  body.rows.forEach(instance => {
                    // get the actual instance object (tags only)
                    // the first 3 keys are patient, study, series, image
                    res.push(instance.key[4].imageAnnotations.ImageAnnotationCollection);
                  });
                  resolve({ imageAnnotations: { ImageAnnotationCollection: res } });
                }
              } else {
                // TODO Proper error reporting implementation required
                fastify.log.info(`Error in get series aims: ${error}`);
                reject(error);
              }
            }
          );
        } catch (err) {
          reject(err);
        }
      })
  );

  // add accessor methods with decorate
  fastify.decorate('getSeriesAims', (request, reply) => {
    fastify
      .getAims(request.query.format, request.params)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.code(503).send(err));
  });

  fastify.decorate('saveAim', (request, reply) => {
    // get the uid from the json and put as id in couch document
    const couchDoc = {
      _id: request.body.imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root,
      aim: request.body,
    };
    const db = fastify.couch.db.use(config.db);
    db.insert(couchDoc, couchDoc._id)
      .then(() => {
        reply.code(200).send('success');
      })
      .catch(err => {
        // TODO Proper error reporting implementation required
        fastify.log.info(`Error in save: ${err}`);
        reply.code(503).send('error');
      });
  });

  // template accessors
  fastify.decorate('getTemplates', (request, reply) => {
    try {
      const db = fastify.couch.db.use(config.db);
      db.view(
        'instances',
        'templates',
        {
          reduce: true,
          group_level: 2,
        },
        (error, body) => {
          if (!error) {
            const res = [];

            body.rows.forEach(template => {
              res.push(template.key[1]);
            });
            reply.code(200).send({ ResultSet: { Result: res } });
          } else {
            // TODO Proper error reporting implementation required
            fastify.log.info(`Error in get templates: ${error}`);
            reply.code(503).send(error);
          }
        }
      );
    } catch (err) {
      reply.code(503).send(err);
    }
  });

  fastify.decorate('saveTemplate', (request, reply) => {
    // get the uid from the json and put as id in couch document
    const couchDoc = {
      _id: request.body.Template.uid,
      template: request.body,
    };
    const db = fastify.couch.db.use(config.db);
    db.insert(couchDoc, couchDoc._id)
      .then(() => {
        reply.code(200).send('success');
      })
      .catch(err => {
        // TODO Proper error reporting implementation required
        fastify.log.info(`Error in save: ${err}`);
        reply.code(503).send('error');
      });
  });

  fastify.log.info(`Using db: ${config.db}`);
  // register couchdb
  // disables eslint check as I want this module to be standalone to be (un)pluggable
  // eslint-disable-next-line global-require
  fastify.register(require('fastify-couchdb'), {
    // eslint-disable-line global-require
    url: options.url,
  });
  fastify.after(async () => {
    try {
      await fastify.checkAndCreateDb();
    } catch (err) {
      fastify.log.info(`Cannot connect to couchdb (err:${err}), shutting down the server`);
      fastify.close();
    }
    // need to add hook for close to remove the db if test;
    fastify.addHook('onClose', async (instance, done) => {
      if (config.env === 'test') {
        try {
          // if it is test remove the database
          await instance.couch.db.destroy(config.db);
          fastify.log.info('Destroying test database');
        } catch (err) {
          fastify.log.info(`Cannot destroy test database (err:${err})`);
        }
        done();
      }
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(couchdb);
