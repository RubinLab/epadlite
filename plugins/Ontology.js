/* eslint-disable no-async-promise-executor */
const { Sequelize, Op } = require('sequelize');
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');

const { InternalError } = require('../utils/EpadErrors');

async function Ontology(fastify, options, done) {
  // const models = {};
  const { models } = fastify;

  fastify.decorate('initOntologyModels', async () => {
    const filenames = fs.readdirSync(`${__dirname}/../models`);
    for (let i = 0; i < filenames.length; i += 1) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      models[filenames[i].replace(/\.[^/.]+$/, '')] = require(path.join(
        __dirname,
        '/../models',
        filenames[i]
      ))(fastify.orm, Sequelize.DataTypes);
    }
  });

  fastify.decorate(
    'validateApiKeyInternal',
    async (request) =>
      new Promise(async (resolve, reject) => {
        try {
          let configApiKey = null;

          if (Object.prototype.hasOwnProperty.call(request.raw, 'headers')) {
            if (Object.prototype.hasOwnProperty.call(request.raw.headers, 'authorization')) {
              // eslint-disable-next-line prefer-destructuring
              configApiKey = request.raw.headers.authorization.split(' ')[1];
            }
          }

          if (configApiKey) {
            fastify.log.info('acess token received verifiying the validity');

            const apikeyreturn = await fastify.getApiKeyForClientInternal(configApiKey);
            if (apikeyreturn === null || apikeyreturn.dataValues.apikey !== configApiKey) {
              reject(new Error('no vaid api key'));
            }

            fastify.log.info('you have a valid api key');
            if (request.query.user) {
              const epadAuth = await fastify.fillUserInfo(request.query.user);
              resolve(epadAuth);
            } else {
              resolve(undefined);
            }
          } else {
            reject(new Error('no api key provided'));
          }
        } catch (err) {
          throw new InternalError(`error happened while validating api key`, err);
        }
      })
  );

  fastify.decorate('getApiKeyForClientInternal', (clientOntologyApiKeyParam) => {
    const clientOntologyApiKey = clientOntologyApiKeyParam;
    return new Promise(async (resolve, reject) => {
      try {
        const apikeyReturn = await models.registeredapps.findOne({
          where: { apikey: clientOntologyApiKey },
        });
        resolve(apikeyReturn);
      } catch (err) {
        reject(new InternalError(`error happened while getting api key for the client`, err));
      }
    });
  });

  fastify.decorate('addToArryOntologyInternal', (typeparam, itemobjparam, arrayobj) => {
    let type = {};
    const obj = {};
    if (typeof itemobjparam !== 'undefined') {
      type = {
        [Op.like]: `%${itemobjparam}%`,
      };
      obj.typeparam = type;
      arrayobj.push({ obj });
    }
  });

  fastify.decorate(
    'getOntologyAllInternal',
    async (requestObject) =>
      new Promise(async (resolve, reject) => {
        const result = [];
        let whereString = {};
        const itemArray = [];
        try {
          fastify.log.info('get all', requestObject);
          let {
            codevalue: CODE_VALUE,
            codemeaning: CODE_MEANING,
            description,
            schemaversion: SCHEMA_VERSION,
            referenceuid,
            referencename,
            referencetype,
          } = requestObject;
          if (typeof CODE_VALUE !== 'undefined') {
            CODE_VALUE = {
              [Op.like]: `%${CODE_VALUE}%`,
            };
            itemArray.push({ CODE_VALUE });
          }
          if (typeof CODE_MEANING !== 'undefined') {
            CODE_MEANING = {
              [Op.like]: `%${CODE_MEANING}%`,
            };
            itemArray.push({ CODE_MEANING });
          }
          if (typeof description !== 'undefined') {
            description = {
              [Op.like]: `%${description}%`,
            };
            itemArray.push({ description });
          }
          if (typeof SCHEMA_VERSION !== 'undefined') {
            SCHEMA_VERSION = {
              [Op.like]: `%${SCHEMA_VERSION}%`,
            };
            itemArray.push({ SCHEMA_VERSION });
          }

          if (typeof referenceuid !== 'undefined') {
            referenceuid = {
              [Op.like]: `%${referenceuid}%`,
            };
            itemArray.push({ referenceuid });
          }
          if (typeof referencename !== 'undefined') {
            referencename = {
              [Op.like]: `%${referencename}%`,
            };
            itemArray.push({ referencename });
          }
          if (typeof referencetype !== 'undefined') {
            referencetype = {
              [Op.like]: `%${referencetype}%`,
            };
            itemArray.push({ referencetype });
          }

          if (itemArray.length === 1) {
            whereString = { where: { ...itemArray[0] } };
          } else {
            whereString = { where: { [Op.and]: [...itemArray] } };
          }

          const lexicon = await models.lexicon.findAll(whereString);

          for (let i = 0; i < lexicon.length; i += 1) {
            const lexiconObj = {
              id: lexicon[i].dataValues.ID,
              codemeaning: lexicon[i].dataValues.CODE_MEANING,
              codevalue: lexicon[i].dataValues.CODE_VALUE,
              description: lexicon[i].dataValues.description,
              createdtime: lexicon[i].dataValues.createdtime,
              updatetime: lexicon[i].dataValues.updatetime,
              schemadesignator: lexicon[i].dataValues.SCHEMA_DESIGNATOR,
              schemaversion: lexicon[i].dataValues.SCHEMA_VERSION,
              referenceuid: lexicon[i].dataValues.referenceuid,
              referencename: lexicon[i].dataValues.referencename,
              referencetype: lexicon[i].dataValues.referencetype,
              indexno: lexicon[i].dataValues.indexno,
              creator: lexicon[i].dataValues.creator,
            };
            result.push(lexiconObj);
          }
          resolve(result);
        } catch (err) {
          reject(
            new InternalError(`error happened in ternal phase while getting all lexicon rows`, err)
          );
        }
      })
  );

  fastify.decorate('checkDuplicateCodemeaningInternal', (codemeaningParam) => {
    const ReqObj = { CODE_MEANING: codemeaningParam };
    return new Promise((resolve, reject) => {
      fastify
        .getOntologyAllInternal(ReqObj)
        .then((resultObj) => {
          for (let i = 0; i < resultObj.length; i += 1) {
            if (resultObj[i].codemeaning.toUpperCase() === codemeaningParam.toUpperCase()) {
              resolve({ code: 409, lexiconObj: resultObj[i] });
            }
          }
          resolve({ code: 200 });
        })
        .catch((err) =>
          reject(
            new InternalError(`error happened while checking the duplicate of codemeaning`, err)
          )
        );
    });
  });

  fastify.decorate('getOntologyAll', (request, reply) => {
    const ReqObj = request.query;

    fastify
      .getOntologyAllInternal(ReqObj)
      .then((resultObj) => {
        reply.code(200).send(resultObj);
      })
      .catch((err) =>
        reply
          .code(500)
          .send(new InternalError(`error happened while getting all lexicon rows`, err))
      );
  });

  fastify.decorate('getOntologyTermByCodeValue', async (request, reply) => {
    const { codevalue: CODE_VALUE } = request.params;
    try {
      const lexiconObj = await models.lexicon.findOne({
        where: { CODE_VALUE },
      });
      reply.code(200).send(lexiconObj);
    } catch (err) {
      reply.code(500).send(new InternalError(`error happened while getting lexicon term `, err));
    }
  });

  fastify.decorate(
    'generateCodeValueInternal',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          const retVal = await models.lexicon.findAll({
            limit: 1,
            order: [['indexno', 'DESC']],
          });

          if (retVal.length > 0) {
            resolve(retVal[0].dataValues.indexno);
          } else {
            resolve(0);
          }
        } catch (err) {
          reject(
            new InternalError(
              `error happened while generating a codevalue for a new lexicon entry  `,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'insertOntologyItemInternal',
    async (lexiconObj) =>
      // this function need to call remote ontology server if no valid ontology apikey
      new Promise(async (resolve, reject) => {
        let returnObj = null;
        try {
          returnObj = await fastify.checkDuplicateCodemeaningInternal(lexiconObj.codemeaning);
        } catch (err) {
          reject(new InternalError(`error happened while checking codemenaing existance`, err));
        }
        if (returnObj.code === 200) {
          try {
            const nextindex = (await fastify.generateCodeValueInternal()) + 1;
            const {
              codemeaning: CODE_MEANING,
              description,
              schemadesignator: SCHEMA_DESIGNATOR,
              schemaversion: SCHEMA_VERSION,
              referenceuid,
              referencename,
              referencetype,
              creator,
            } = lexiconObj;

            const retVal = await models.lexicon.create({
              CODE_MEANING,
              CODE_VALUE: `99EPAD_${nextindex}`,
              description,
              SCHEMA_DESIGNATOR,
              SCHEMA_VERSION,
              referenceuid,
              referencename,
              referencetype,
              indexno: nextindex,
              creator,
              createdtime: Date.now(),
              updatetime: Date.now(),
            });

            const resultInJson = {
              id: retVal.ID,
              codevalue: retVal.CODE_VALUE,
              codemeaning: retVal.CODE_MEANING,
              schemadesignator: retVal.SCHEMA_DESIGNATOR,
              indexno: retVal.indexno,
              referenceuid,
              referencename,
              referencetype,
              creator,
            };
            resolve(resultInJson);
          } catch (err) {
            reject(new InternalError(`error happened while insterting lexicon object`, err));
          }
        } else {
          reject(returnObj);
        }
      })
  );

  // fastify.decorate('insertOntologyItem', async (request, reply) => {
  //   let resultObj = null;
  //   console.log('request', request.raw.socket.parser.incoming.url);
  //   console.log('request', request.raw.socket.parser.incoming.method);
  //   console.log('request', request.raw.socket.parser.incoming.hostname);
  //   console.log('request body', request.body);
  //   // Axios.get(`epadbuildlite.stanford.edu/ontology/`, {
  //   //   headers: { Authorization: `apikey token=${config.API_KEY}` },
  //   // });
  //   // const request = Axios.create({baseURL: config.statsEpad,});
  //   // await request.put(encodeURI(epadUrl));
  //   try {
  //     await fastify.validateApiKeyInternal(request);
  //     resultObj = await fastify.checkDuplicateCodemeaningInternal(request.body.codemeaning);
  //   } catch (err) {
  //     if (err instanceof Error) {
  //       reply
  //         .code(500)
  //         .send(new InternalError(`you need to register. you don't have a valid api key`, err));
  //     } else {
  //       reply
  //         .code(500)
  //         .send(new InternalError(`error happened while checking codemenaing existance`, err));
  //     }
  //   }
  //   if (resultObj.code === 200) {
  //     try {
  //       const nextindex = (await fastify.generateCodeValueInternal()) + 1;
  //       const {
  //         codemeaning: CODE_MEANING,
  //         description,
  //         schemadesignator: SCHEMA_DESIGNATOR,
  //         schemaversion: SCHEMA_VERSION,
  //         referenceuid,
  //         referencename,
  //         referencetype,
  //         creator,
  //       } = request.body;

  //       const retVal = await models.lexicon.create({
  //         CODE_MEANING,
  //         CODE_VALUE: `99EPAD_${nextindex}`,
  //         description,
  //         SCHEMA_DESIGNATOR,
  //         SCHEMA_VERSION,
  //         referenceuid,
  //         referencename,
  //         referencetype,
  //         indexno: nextindex,
  //         creator,
  //         createdtime: Date.now(),
  //         updatetime: Date.now(),
  //       });
  //       const resultInJson = {
  //         id: retVal.dataValues.ID,
  //         codevalue: retVal.dataValues.CODE_VALUE,
  //         codemeaning: retVal.dataValues.CODE_MEANING,
  //         schemadesignator: retVal.dataValues.SCHEMA_DESIGNATOR,
  //         indexno: retVal.dataValues.indexno,
  //       };
  //       reply.code(200).send(resultInJson);
  //     } catch (err) {
  //       reply
  //         .code(500)
  //         .send(new InternalError(`error happened while insterting lexicon object`, err));
  //     }
  //   } else {
  //     reply.code(resultObj.code).send(resultObj.lexiconObj);
  //   }
  // });

  fastify.decorate('insertOntologyItem', async (request, reply) => {
    let resultObj = null;
    try {
      await fastify.validateApiKeyInternal(request);
      resultObj = await fastify.insertOntologyItemInternal(request.body);
      reply.code(200).send(resultObj);
    } catch (err) {
      if (err instanceof InternalError) {
        reply
          .code(500)
          .send(new InternalError(`error happened while insterting lexicon object`, err));
      } else if (err instanceof Error) {
        reply.code(401).send(new Error(`you need to register. you don't have a valid api key`));
      } else {
        reply.code(err.code).send(err.lexiconObj);
      }
    }
  });

  fastify.decorate('updateOntologyItem', async (request, reply) => {
    try {
      await fastify.validateApiKeyInternal(request);
      const { codevalue: codevalueprm } = request.params;
      const {
        codemeaning: CODE_MEANING,
        codevalue: CODE_VALUE,
        description,
        schemadesignator: SCHEMA_DESIGNATOR,
        schemaversion: SCHEMA_VERSION,
        referenceuid,
        referencename,
        referencetype,
      } = request.body;
      models.lexicon.update(
        {
          CODE_MEANING,
          CODE_VALUE,
          description,
          SCHEMA_DESIGNATOR,
          SCHEMA_VERSION,
          referenceuid,
          referencename,
          referencetype,
          updatetime: Date.now(),
        },
        {
          where: {
            CODE_VALUE: codevalueprm,
          },
        }
      );
      reply.code(200).send('lexcion object updated succesfully');
    } catch (err) {
      if (err instanceof Error) {
        reply
          .code(401)
          .send(new InternalError(`you need to register. you don't have a valid api key`, err));
      } else {
        reply
          .code(500)
          .send(new InternalError(`error happened while updating lexicon object`, err));
      }
    }
  });

  fastify.decorate('deleteOntologyItem', async (request, reply) => {
    try {
      await fastify.validateApiKeyInternal(request);
      const { codevalue: CODE_VALUE } = request.params;
      models.lexicon.destroy({
        where: {
          CODE_VALUE,
        },
      });
      reply.code(200).send('lexcion object deleted succesfully');
    } catch (err) {
      if (err instanceof Error) {
        reply
          .code(401)
          .send(new InternalError(`you need to register. you don't have a valid api key`, err));
      } else {
        reply
          .code(500)
          .send(new InternalError(`error happened while deleting lexicon object`, err));
      }
    }
  });

  fastify.after(async () => {
    try {
      // await fastify.initOntologyModels();
      done();
    } catch (err) {
      fastify.log.error('error happened while initiating ontology models', err);
    }
  });
}

module.exports = fp(Ontology);
