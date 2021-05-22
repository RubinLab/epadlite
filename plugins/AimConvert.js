/* eslint-disable no-underscore-dangle */
/* eslint-disable no-async-promise-executor */
const fp = require('fastify-plugin');
const concat = require('concat-stream');
const toArrayBuffer = require('to-array-buffer');

const { aim2dicomsr, dicomsr2aim } = require('aimapi');

async function aimconvert(fastify) {
  fastify.decorate('aim2sr', (request, reply) => {
    try {
      const aim = request.body;
      const reportBuffer = aim2dicomsr(aim);

      reply.send(reportBuffer);
    } catch (err) {
      console.log(err);
    }
    reply.send(null);
  });

  fastify.decorate('sr2aim', (request, reply) => {
    const fileSavePromises = [];
    function done(err) {
      if (err) {
        reply.send(new Error('Multipart dicomsr aim conversion', err));
      } else {
        Promise.all(fileSavePromises)
          .then((aims) => {
            for (let i = 0; i < aims.length; i += 1) {
              console.log('aim', i, aims[i]);
              // TODO log error if it couldn't convert
              if (aims[i] && aims[i].error) console.log('error', aims[i].filename, aims[i].error);
            }
            reply.send(aims);
          })
          .catch((fileSaveErr) => {
            reply.send(new Error('DICOM SR file(s)  aim conversion error', fileSaveErr));
          });
      }
    }
    function handler(_field, file, filename) {
      fileSavePromises.push(
        new Promise((resolve) => {
          file.pipe(
            concat((buf) => {
              const aim = dicomsr2aim(toArrayBuffer(buf));
              if (aim) resolve(aim);
              else resolve({ error: new Error('Could not generate aim'), filename });
            }),
            (err) => {
              if (err) {
                resolve({ error: err, filename });
              }
            }
          );
        })
      );
    }

    request.multipart(handler, done);
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(aimconvert);
