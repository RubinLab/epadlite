const { Op } = require('sequelize');
const fp = require('fastify-plugin');
const fs = require('fs-extra');
const path = require('path');

const { InternalError } = require('../utils/EpadErrors');

async function Ontology(fastify) {
  const models = {};

  fastify.decorate('initOntologyModels', async () => {
    const filenames = fs.readdirSync(`${__dirname}/../models`);
    for (let i = 0; i < filenames.length; i += 1) {
      models[filenames[i].replace(/\.[^/.]+$/, '')] = fastify.orm.import(
        path.join(__dirname, '/../models', filenames[i])
      );
    }
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

  fastify.decorate('getOntologyAllInternal', async requestObject => {
    return new Promise(async (resolve, reject) => {
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
        reject(new InternalError(`error happened while getting all lexicon rows`, err));
      }
    });
  });

  fastify.decorate('getOntologyAll', (request, reply) => {
    const ReqObj = request.query;
    fastify
      .getOntologyAllInternal(ReqObj)
      .then(resultObj => {
        reply.code(200).send(resultObj);
      })
      .catch(err => reply.send(err));
  });

  fastify.decorate('getOntologyTermByCodeValue', async (request, reply) => {
    fastify.log.info('get term');
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

  fastify.decorate('generateCodeValueInternal', () => {
    return new Promise(async (resolve, reject) => {
      try {
        const retVal = await models.lexicon.findAll({
          limit: 1,
          order: [['indexno', 'DESC']],
        });
        resolve(retVal[0].dataValues.indexno);
      } catch (err) {
        reject(err);
      }
    });
  });

  fastify.decorate('insertOntologyItem', async (request, reply) => {
    const nextindex = (await fastify.generateCodeValueInternal()) + 1;
    try {
      const {
        codemeaning: CODE_MEANING,
        description,
        schemadesignator: SCHEMA_DESIGNATOR,
        schemaversion: SCHEMA_VERSION,
        referenceuid,
        referencename,
        referencetype,
        creator,
      } = request.body;

      const retVal = await models.lexicon.create({
        CODE_MEANING,
        CODE_VALUE: `999EPAD${nextindex}`,
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
        id: retVal.dataValues.ID,
        codevalue: retVal.dataValues.CODE_VALUE,
        codemeaning: retVal.dataValues.CODE_MEANING,
        schemadesignator: retVal.dataValues.SCHEMA_DESIGNATOR,
        indexno: retVal.dataValues.indexno,
      };
      console.log('returning value :', resultInJson);
      reply.code(200).send(resultInJson);
    } catch (err) {
      reply
        .code(500)
        .send(new InternalError(`error happened while insterting lexicon object`, err));
    }
  });

  fastify.decorate('updateOntologyItem', (request, reply) => {
    fastify.log.info('update item');
    try {
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
      reply.code(500).send(new InternalError(`error happened while updating lexicon object`, err));
    }
  });

  fastify.decorate('deleteOntologyItem', (request, reply) => {
    fastify.log.info('update item');
    try {
      const { codevalue: CODE_VALUE } = request.params;
      models.lexicon.destroy({
        where: {
          CODE_VALUE,
        },
      });
      reply.code(200).send('lexcion object deleted succesfully');
    } catch (err) {
      reply.code(500).send(new InternalError(`error happened while deleting lexicon object`, err));
    }
  });

  fastify.ready(async () => {
    try {
      fastify.initOntologyModels();
    } catch (err) {
      fastify.log.error('error happened while initiating ontology models', err);
    }
  });
}

module.exports = fp(Ontology);
