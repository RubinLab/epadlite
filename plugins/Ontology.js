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
    // console.log('models ', models);
  });

  fastify.decorate('addToArryOntologyInternal', (typeparam, itemobjparam, arrayobj) => {
    console.log('inner', typeparam);
    const itemobj = itemobjparam;
    let type = {};
    let obj = {};
    if (typeof itemobj !== 'undefined') {
      type = {
        [Op.like]: `%${itemobj}%`,
      };
      obj.typeparam = type;
      console.log('obj', obj);
      arrayobj.push({ obj });
    }
  });

  fastify.decorate('getAll', async (request, reply) => {
    const result = [];
    let whereString = {};
    const itemArray = [];
    try {
      fastify.log.info('get all', request.query);
      let { CODE_VALUE, CODE_MEANING, description, SCHEMA_VERSION } = request.query;
      if (typeof CODE_VALUE !== 'undefined') {
        CODE_VALUE = {
          [Op.like]: `%${CODE_VALUE}%`,
        };
        itemArray.push({ CODE_VALUE });
      }
      //  fastify.addToArryOntologyInternal('CODE_VALUE', CODE_VALUE, itemArray);
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

      if (itemArray.length === 1) {
        whereString = { where: { ...itemArray[0] } };
      } else {
        whereString = { where: { [Op.and]: [...itemArray] } };
      }

      const lexicon = await models.lexicon.findAll(whereString);

      for (let i = 0; i < lexicon.length; i += 1) {
        const lexiconObj = {
          ID: lexicon[i].dataValues.ID,
          CODE_MEANING: lexicon[i].dataValues.CODE_MEANING,
          CODE_VALUE: lexicon[i].dataValues.CODE_VALUE,
          description: lexicon[i].dataValues.description,
          createdtime: lexicon[i].dataValues.createdtime,
          updatetime: lexicon[i].dataValues.updatetime,
          SCHEMA_DESIGNATOR: lexicon[i].dataValues.SCHEMA_DESIGNATOR,
          SCHEMA_VERSION: lexicon[i].dataValues.SCHEMA_VERSION,
          creator: lexicon[i].dataValues.creator,
        };
        result.push(lexiconObj);
      }

      reply.code(200).send(result);
    } catch (err) {
      reply.code(500).send(new InternalError(`error happened while getting all lexicon rows`, err));
    }
  });

  fastify.decorate('getTerm', async (request, reply) => {
    fastify.log.info('get term');
    const { CODE_VALUE } = request.params.CODE_VALUE;
    try {
      const lexiconObj = await models.lexicon.findOne({
        where: { CODE_VALUE },
      });
      console.log('cavcav : ', lexiconObj);
      reply.code(200).send(lexiconObj);
    } catch (err) {
      reply.code(500).send(new InternalError(`error happened while getting lexicon term `, err));
    }
  });

  fastify.decorate('insertItem', async (request, reply) => {
    fastify.log.info('insert item');

    try {
      const {
        CODE_MEANING,
        CODE_VALUE,
        description,
        SCHEMA_DESIGNATOR,
        SCHEMA_VERSION,
        creator,
      } = request.body;

      await models.lexicon.create({
        CODE_MEANING,
        CODE_VALUE,
        description,
        SCHEMA_DESIGNATOR,
        SCHEMA_VERSION,
        //  creator: request.epadAuth.username,
        creator,
        createdtime: Date.now(),
        updatetime: Date.now(),
      });
      reply.code(200).send('lexcion object inserted succesfully');
    } catch (err) {
      reply
        .code(500)
        .send(new InternalError(`error happened while insterting lexicon object`, err));
    }
  });

  fastify.decorate('updateItem', (request, reply) => {
    fastify.log.info('update item');
    try {
      const {
        CODE_MEANING,
        CODE_VALUE,
        description,
        SCHEMA_DESIGNATOR,
        SCHEMA_VERSION,
      } = request.body;
      models.lexicon.update(
        {
          CODE_MEANING,
          CODE_VALUE,
          description,
          SCHEMA_DESIGNATOR,
          SCHEMA_VERSION,
          updatetime: Date.now(),
        },
        {
          where: {
            CODE_MEANING,
          },
        }
      );
      reply.code(200).send('lexcion object updated succesfully');
    } catch (err) {
      reply.code(500).send(new InternalError(`error happened while updating lexicon object`, err));
    }
  });

  fastify.ready(async () => {
    try {
      fastify.initOntologyModels();
    } catch (err) {
      fastify.log.error(`Cannot connect to mariadb (err:${err.message}), shutting down the server`);
    }
    // need to add hook for close to remove the db if test;
  });
}

module.exports = fp(Ontology);
