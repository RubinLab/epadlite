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
    console.log('models ', models);
  });

  fastify.decorate('getAll', async (request, reply) => {
    const result = [];
    try {
      fastify.log.info('get all');

      const lexicon = await models.lexicon.findAll();
      for (let i = 0; i < lexicon.length; i += 1) {
        const lexiconObj = {
          ID: lexicon.dataValues.ID,
          CODE_MEANING: lexicon.dataValues.CODE_MEANING,
          CODE_VALUE: lexicon.dataValues.CODE_VALUE,
          description: lexicon.dataValues.description,
          createdtime: lexicon.dataValues.createdtime,
          updatetime: lexicon.dataValues.updatetime,
          SCHEMA_DESIGNATOR: lexicon.dataValues.SCHEMA_DESIGNATOR,
          SCHEMA_VERSION: lexicon.dataValues.SCHEMA_VERSION,
          creator: lexicon.dataValues.creator,
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
      reply.code(200).send(lexiconObj);
    } catch (err) {
      reply.code(500).send(new InternalError(`error happened while getting lexicon term `, err));
    }
  });

  fastify.decorate('searchTerm', async (request, reply) => {
    fastify.log.info('search term');
    const {
      CODE_VALUE,
      CODE_MEANING, // include
      description, // include
      // SCHEMA_DESIGNATOR, ihtiyac yok
      SCHEMA_VERSION,
      // creator,
    } = request.body;
    const result = [];
    try {
      const lexiconResult = await models.lexicon.findAll({
        where: {
          $or: [CODE_VALUE, CODE_MEANING, description, SCHEMA_DESIGNATOR, SCHEMA_VERSION, creator],
        },
      });
      for (let i = 0; i < lexiconResult.length; i += 1) {
        const lexiconObj = {
          ID: lexiconResult.dataValues.ID,
          CODE_MEANING: lexiconResult.dataValues.CODE_MEANING,
          CODE_VALUE: lexiconResult.dataValues.CODE_VALUE,
          description: lexiconResult.dataValues.description,
          createdtime: lexiconResult.dataValues.createdtime,
          updatetime: lexiconResult.dataValues.updatetime,
          SCHEMA_DESIGNATOR: lexiconResult.dataValues.SCHEMA_DESIGNATOR,
          SCHEMA_VERSION: lexiconResult.dataValues.SCHEMA_VERSION,
          creator: lexiconResult.dataValues.creator,
        };
        result.push(lexiconObj);
      }
      reply.code(200).send(result);
    } catch (err) {
      reply
        .code(500)
        .send(new InternalError(`error happened while searching lexicon object `, err));
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
      } = request.body;

      await models.lexicon.create({
        CODE_MEANING,
        CODE_VALUE,
        description,
        SCHEMA_DESIGNATOR,
        SCHEMA_VERSION,
        creator: request.epadAuth.username,
        createdtime: Date.now(),
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
      const lexiconid = request.body.ID;
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
            id: lexiconid,
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
