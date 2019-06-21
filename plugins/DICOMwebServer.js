/* eslint-disable array-callback-return */
const fp = require('fastify-plugin');
const Axios = require('axios');
const _ = require('underscore');
const btoa = require('btoa');
const config = require('../config/index');

// I need to import this after config as it uses config values
// eslint-disable-next-line import/order
const keycloak = require('keycloak-backend')({
  realm: config.dicomWebConfig.realm, // required for verify
  'auth-server-url': config.dicomWebConfig.authServerUrl, // required for verify
  client_id: config.dicomWebConfig.clientId,
  client_secret: config.dicomWebConfig.clientSecret,
  username: config.dicomWebConfig.username,
  password: config.dicomWebConfig.password,
});

let accessToken = '';
let header = {};
const projectID = 'lite';

async function dicomwebserver(fastify) {
  fastify.decorate('initDicomWeb', async () => {
    try {
      const connect = await fastify.connectDICOMweb();
      fastify.log.info('Connected to dicomweb server');
      return connect;
    } catch (err) {
      if (config.env !== 'test') {
        fastify.log.info('Waiting for dicomweb server');
        setTimeout(fastify.initDicomWeb, 3000);
      } else throw Error('No connection');
    }
    return null;
  });

  // connects to the DICOMweb server using the authentication method in config.dicomWebConfig
  // tests the connection with /studies endpoint after connection and rejects if unsuccessful
  fastify.decorate(
    'connectDICOMweb',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          // see if we can authenticate
          if (config.dicomWebConfig.authServerUrl) {
            accessToken = await keycloak.accessToken.get();
            if (accessToken) {
              header = {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              };
              this.request = Axios.create({
                baseURL: config.dicomWebConfig.baseUrl,
              });
              this.request
                .get('/studies', header)
                .then(() => {
                  resolve();
                })
                .catch(err => {
                  fastify.log.info(`Error retrieving studies with access token: ${err.message}`);
                  reject(err);
                });
            }
          } else if (config.dicomWebConfig.username) {
            this.request = Axios.create({
              baseURL: config.dicomWebConfig.baseUrl,
            });
            const encoded = btoa(
              `${config.dicomWebConfig.username}:${config.dicomWebConfig.password}`
            );
            header = {
              headers: {
                Authorization: `Basic ${encoded}`,
              },
            };
            this.request
              .get('/studies', header)
              .then(() => {
                resolve();
              })
              .catch(err => {
                fastify.log.info(`Error retrieving studies with basic auth: ${err.message}`);
                reject(err);
              });
          } else {
            this.request = Axios.create({
              baseURL: config.dicomWebConfig.baseUrl,
            });
            this.request
              .get('/studies')
              .then(() => {
                resolve();
              })
              .catch(err => {
                fastify.log.info(`Error retrieving studies without authorization: ${err.message}`);
                reject(err);
              });
          }
        } catch (err) {
          fastify.log.info(`Error connecting to DICOMweb server: ${err.message}`);
          reject(err);
        }
      })
  );
  // add accessor methods with decorate
  fastify.decorate(
    'saveDicoms',
    (data, boundary) =>
      new Promise((resolve, reject) => {
        try {
          const headers = {
            'Content-Type': `multipart/related; type=application/dicom; boundary=${boundary}`,
            maxContentLength: Buffer.byteLength(data) + 1,
          };
          this.request
            .post('/studies', data, headers)
            .then(() => {
              fastify.log.info('Success');
              resolve();
            })
            .catch(error => {
              fastify.log.info(`Error in saving dicoms ${error.message}`);
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error saving dicoms: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'deleteStudyDicomsInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .delete(`/studies/${params.study}`)
            .then(() => {
              fastify.log.info('Success');
              resolve();
            })
            .catch(error => {
              fastify.log.info(`Error in deleting dicoms ${error.message}`);
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error deleting dicoms: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'deleteSeriesDicomsInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .delete(`/studies/${params.study}/series/${params.series}`)
            .then(() => {
              fastify.log.info('Success');
              resolve();
            })
            .catch(error => {
              fastify.log.info(`Error in deleting dicoms ${error.message}`);
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error deleting dicoms: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate('getPatients', (request, reply) => {
    try {
      // make studies cal and aims call
      const studies = this.request.get('/studies', header);
      const aims = fastify.getAims('summary', { subject: '', study: '', series: '' });

      Promise.all([studies, aims])
        .then(values => {
          // handle success
          // populate an aim counts map containing each subject
          const aimsCountMap = {};
          _.chain(values[1].ResultSet.Result)
            .groupBy(value => {
              return value.subjectID;
            })
            .map(value => {
              const numberOfAims = _.reduce(
                value,
                memo => {
                  return memo + 1;
                },
                0
              );
              aimsCountMap[value[0].subjectID] = numberOfAims;
            })
            .value();
          // populate the subjects data by grouping the studies by patient id
          // and map each subject to epadlite subject object
          const result = _.chain(values[0].data)
            .groupBy(value => {
              return value['00100020'].Value[0];
            })
            .map(value => {
              // combine the modalities in each study to create patient modatities list
              const modalities = _.reduce(
                value,
                (modalitiesCombined, val) => {
                  val['00080061'].Value.forEach(modality => {
                    if (!modalitiesCombined.includes(modality)) modalitiesCombined.push(modality);
                  });
                  return modalitiesCombined;
                },
                []
              );
              // cumulate the number of studies
              const numberOfStudies = _.reduce(
                value,
                memo => {
                  return memo + 1;
                },
                0
              );
              return {
                subjectName: value[0]['00100010'].Value
                  ? value[0]['00100010'].Value[0].Alphabetic
                  : '',
                subjectID: value[0]['00100020'].Value[0],
                projectID,
                insertUser: '', // no user in studies call
                xnatID: '', // no xnatID should remove
                insertDate: '', // no date in studies call
                uri: '', // no uri should remove
                displaySubjectID: value[0]['00100020'].Value[0],
                numberOfStudies,
                numberOfAnnotations: aimsCountMap[value[0]['00100020'].Value[0]]
                  ? aimsCountMap[value[0]['00100020'].Value[0]]
                  : 0,
                examTypes: modalities,
              };
            })
            .value();
          reply.code(200).send({ ResultSet: { Result: result, totalRecords: result.length } });
        })
        .catch(error => {
          // TODO handle error
          fastify.log.info(`Error retrieving studies to populate patients: ${error.message}`);
          reply.code(503).send(error);
        });
    } catch (err) {
      fastify.log.info(`Error populating patients: ${err.message}`);
      reply.code(503).send(err);
    }
  });

  fastify.decorate('getPatientStudies', (request, reply) => {
    fastify
      .getPatientStudiesInternal(request.params)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.decorate(
    'getPatientStudiesInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          const studies = this.request.get('/studies', header);
          // get aims for a specific patient
          const aims = fastify.getAims('summary', {
            subject: params.subject,
            study: '',
            series: '',
          });

          Promise.all([studies, aims])
            .then(values => {
              // handle success
              // populate an aim counts map containing each study
              const aimsCountMap = {};
              _.chain(values[1].ResultSet.Result)
                .groupBy(value => {
                  return value.studyUID;
                })
                .map(value => {
                  const numberOfAims = _.reduce(
                    value,
                    memo => {
                      return memo + 1;
                    },
                    0
                  );
                  aimsCountMap[value[0].studyUID] = numberOfAims;
                })
                .value();
              // get the grouped data according to patient id
              const grouped = _.groupBy(values[0].data, value => {
                return value['00100020'].Value['0'];
              });
              // get the patients's studies and map each study to epadlite study object
              const result = _.map(grouped[params.subject], value => {
                return {
                  projectID,
                  patientID: value['00100020'].Value[0],
                  patientName: value['00100010'].Value ? value['00100010'].Value[0].Alphabetic : '',
                  studyUID: value['0020000D'].Value[0],
                  insertDate: value['00080020'].Value ? value['00080020'].Value[0] : '', // study date
                  firstSeriesUID: '', // TODO
                  firstSeriesDateAcquired: '', // TODO
                  physicianName: '', // TODO
                  birthdate: '', // TODO
                  sex: '', // TODO
                  studyDescription: value['00081030'].Value ? value['00081030'].Value[0] : '',
                  studyAccessionNumber: value['00080050'].Value ? value['00080050'].Value[0] : '',
                  examTypes: value['00080061'].Value ? value['00080061'].Value : [],
                  numberOfImages: value['00201208'].Value ? value['00201208'].Value[0] : '',
                  numberOfSeries: value['00201206'].Value ? value['00201206'].Value[0] : '',
                  numberOfAnnotations: aimsCountMap[value['0020000D'].Value[0]]
                    ? aimsCountMap[value['0020000D'].Value[0]]
                    : 0,
                  createdTime: '', // no date in studies call
                };
              });

              resolve({ ResultSet: { Result: result, totalRecords: result.length } });
            })
            .catch(error => {
              // handle error
              fastify.log.info(
                `Error retrieving studies for populating patient studies: ${error.message}`
              );
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error populating patient studies: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate('getStudySeries', (request, reply) => {
    try {
      const series = this.request.get(`/studies/${request.params.study}/series`, header);
      // get aims for a specific study
      const aims = fastify.getAims('summary', {
        subject: request.params.subject,
        study: request.params.study,
        series: '',
      });

      Promise.all([series, aims])
        .then(values => {
          // handle success
          // populate an aim counts map containing each series
          const aimsCountMap = {};
          _.chain(values[1].ResultSet.Result)
            .groupBy(value => {
              return value.seriesUID;
            })
            .map(value => {
              const numberOfAims = _.reduce(
                value,
                memo => {
                  return memo + 1;
                },
                0
              );
              aimsCountMap[value[0].seriesUID] = numberOfAims;
            })
            .value();
          // handle success
          // map each series to epadlite series object
          let filtered = values[0].data;
          if (request.query.filterDSO === 'true')
            filtered = _.filter(values[0].data, obj => obj['00080060'].Value[0] !== 'SEG');
          const result = _.map(filtered, value => {
            return {
              projectID,
              // TODO put in dicomweb but what if other dicomweb is used
              patientID:
                value['00100020'] && value['00100020'].Value ? value['00100020'].Value[0] : '',
              // TODO
              patientName:
                value['00100010'] && value['00100010'].Value
                  ? value['00100010'].Value[0].Alphabetic
                  : '',
              studyUID: value['0020000D'].Value[0],
              seriesUID: value['0020000E'].Value[0],
              // TODO
              seriesDate: value['00080021'] ? value['00080021'].Value[0] : '',
              seriesDescription:
                value['0008103E'] && value['0008103E'].Value ? value['0008103E'].Value[0] : '',
              examType: value['00080060'].Value ? value['00080060'].Value[0] : '',
              bodyPart: '', // TODO
              // TODO
              accessionNumber:
                value['00080050'] && value['00080050'].Value ? value['00080050'].Value[0] : '',
              numberOfImages:
                value['00201209'] && value['00201209'].Value ? value['00201209'].Value[0] : '',
              numberOfSeriesRelatedInstances:
                value['00201209'] && value['00201209'].Value ? value['00201209'].Value[0] : '',
              numberOfAnnotations: aimsCountMap[value['0020000E'].Value[0]]
                ? aimsCountMap[value['0020000E'].Value[0]]
                : 0,
              institution: '', // TODO
              stationName: '', // TODO
              department: '', // TODO
              createdTime: '', // TODO
              firstImageUIDInSeries: '', // TODO
              isDSO: false, // TODO
              isNonDicomSeries: false, // TODO
              seriesNo:
                value['00200011'] && value['00200011'].Value ? value['00200011'].Value[0] : '',
            };
          });
          reply.code(200).send({ ResultSet: { Result: result, totalRecords: result.length } });
        })
        .catch(error => {
          // handle error
          fastify.log.info(
            `Error retrieving study's (${request.params.study}) series: ${error.message}`
          );
          reply.code(503).send(error);
        });
    } catch (err) {
      fastify.log.info(`Error populating study's (${request.params.study}) series: ${err.message}`);
      reply.code(503).send(err);
    }
  });

  fastify.decorate('getSeriesImages', (request, reply) => {
    try {
      this.request
        .get(`/studies/${request.params.study}/series/${request.params.series}/instances`, header)
        .then(response => {
          // handle success
          // map each instance to epadlite image object
          const result = _.map(response.data, value => {
            return {
              projectID,
              patientID:
                value['00100020'] && value['00100020'].Value ? value['00100020'].Value[0] : '',
              studyUID: value['0020000D'].Value[0],
              seriesUID: value['0020000E'].Value[0],
              imageUID: value['00080018'].Value[0],
              classUID: value['00080016'].Value[0], // TODO
              insertDate: '', // no date in studies call
              imageDate: '', // TODO
              sliceLocation: '', // TODO
              instanceNumber: '', // TODO
              losslessImage: '', // TODO
              lossyImage: `/studies/${request.params.study}/series/${
                request.params.series
              }/instances/${value['00080018'].Value[0]}`,
              dicomElements: '', // TODO
              defaultDICOMElements: '', // TODO
              numberOfFrames: 0, // TODO
              isDSO: false, // TODO
              multiFrameImage: false, // TODO
              isFlaggedImage: '', // TODO
              rescaleIntercept: '', // TODO
              rescaleSlope: '', // TODO
              sliceOrder: '', // TODO
            };
          });

          reply.code(200).send({ ResultSet: { Result: result, totalRecords: result.length } });
        })
        .catch(error => {
          // handle error
          fastify.log.info(
            `Error retrieving series's (${request.params.series}) instances: ${error.message}`
          );
          reply.code(503).send(error);
        });
    } catch (err) {
      fastify.log.info(
        `Error populating series's (${request.params.series}) instances: ${err.message}`
      );
      reply.code(503).send(err);
    }
  });

  fastify.log.info(`Using DICOMwebServer: ${config.dicomWebConfig.baseUrl}`);

  fastify.after(async () => {
    try {
      await fastify.initDicomWeb();
    } catch (err) {
      // do not turn off the server if in test mode. shouldn't come here in development anyway
      if (config.env !== 'test') {
        fastify.log.info(`Cannot connect to DICOMwebServer (err:${err}), shutting down the server`);
        fastify.close();
      }
    }

    // need to add hook for close to remove the db if test;
    fastify.addHook('onClose', (instance, done) => {
      if (config.env === 'test') {
        // TODO logout from dicomwebserver
        done();
      }
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(dicomwebserver);
