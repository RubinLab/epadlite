const fp = require('fastify-plugin');
// const { default: PQueue } = require('p-queue');
const axios = require('axios');
const _ = require('underscore');
// const { createOfflineAimSegmentation } = require('aimapi');
const config = require('../config/index');

// const EpadNotification = require('../utils/EpadNotification');

const {
  InternalError,
  // ResourceNotFoundError,
  // BadRequestError,
  // UnauthenticatedError,
  // UnauthorizedError,
  // ResourceAlreadyExistsError,
} = require('../utils/EpadErrors');

async function tcia(fastify) {
  let tciaRequest;
  fastify.decorate('initTCIA', () => {
    tciaRequest = axios.create({
      baseURL: config.TCIABase,
    });
  });

  fastify.decorate(
    'getTCIAPatientsFromCollectionInternal',
    params =>
      new Promise(async (resolve, reject) => {
        try {
          const urlPart = `query/getPatient?Collection=${params.collection}`;
          // query TCIA
          const tciaPatients = await tciaRequest.get(urlPart);
          // console.log(tciaPatients);
          const result = _.map(tciaPatients.data, value => {
            return {
              subjectName: value.PatientName,
              subjectID: value.PatientID,
              collection: value.Collection,
              insertUser: '', // no user in studies call
              xnatID: '', // no xnatID should remove
              insertDate: '', // no date in studies call
              uri: '', // no uri should remove
              displaySubjectID: value.PatientID,
              numberOfStudies: 0,
              numberOfAnnotations: 0,
              examTypes: [],
            };
          });
          resolve(result);
        } catch (err) {
          reject(new InternalError('Populating TCIA Patients', err));
        }
      })
  );

  fastify.decorate('getTCIAPatientsFromCollection', (request, reply) => {
    fastify
      .getTCIAPatientsFromCollectionInternal(request.params)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.after(async () => {
    try {
      await fastify.initTCIA();
    } catch (err) {
      fastify.log.error(`Cannot connect to tcia (err:${err})`);
    }
    // fastify.addHook('onClose', async (instance, done) => {
    //   if (config.env === 'test') {
    //     try {
    //       // if it is test remove the database
    //       await instance.couch.db.destroy(config.db);
    //       fastify.log.info('Destroying test database');
    //     } catch (err) {
    //       fastify.log.error(`Cannot destroy test database (err:${err.message})`);
    //     }
    //     done();
    //   }
    // });
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(tcia);
