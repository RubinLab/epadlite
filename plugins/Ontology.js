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
      console.log('get all : ', lexicon);
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
      SCHEMA_VERSION,
    } = request.body;
    const result = [];
    try {
      const lexiconResult = await models.lexicon.findAll({
        where: {
          $or: [
            { $like: CODE_VALUE },
            { $like: CODE_MEANING },
            { $like: description },
            { $like: SCHEMA_VERSION },
          ],
        },
      });
      for (let i = 0; i < lexiconResult.length; i += 1) {
        const lexiconObj = {
          ID: lexiconResult[i].dataValues.ID,
          CODE_MEANING: lexiconResult[i].dataValues.CODE_MEANING,
          CODE_VALUE: lexiconResult[i].dataValues.CODE_VALUE,
          description: lexiconResult[i].dataValues.description,
          createdtime: lexiconResult[i].dataValues.createdtime,
          updatetime: lexiconResult[i].dataValues.updatetime,
          SCHEMA_DESIGNATOR: lexiconResult[i].dataValues.SCHEMA_DESIGNATOR,
          SCHEMA_VERSION: lexiconResult[i].dataValues.SCHEMA_VERSION,
          creator: lexiconResult[i].dataValues.creator,
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
