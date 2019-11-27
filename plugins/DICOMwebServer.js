/* eslint-disable array-callback-return */
const fp = require('fastify-plugin');
const Axios = require('axios');
const _ = require('underscore');
const btoa = require('btoa');
const config = require('../config/index');
const { InternalError, ResourceNotFoundError } = require('../utils/EpadErrors');

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
        fastify.log.warn('Waiting for dicomweb server');
        setTimeout(fastify.initDicomWeb, 3000);
      } else throw err;
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
                  reject(new InternalError('Retrieving studies with access token', err));
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
                reject(new InternalError('Retrieving studies with basic auth', err));
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
                reject(new InternalError('Retrieving studies without authorization', err));
              });
          }
        } catch (err) {
          reject(new InternalError('Error connecting to DICOMweb server', err));
        }
      })
  );
  // add accessor methods with decorate
  fastify.decorate(
    'saveDicomsInternal',
    (data, boundary) =>
      new Promise((resolve, reject) => {
        try {
          const postHeader = {
            // TODO this headers attribute should be required. gives 'Request body larger than maxBodyLength limit' error
            // maybe related to cors. header is not populated properly with header anyway
            // headers: {
            ...header.headers,
            ...{
              'Content-Type': `multipart/related; type=application/dicom; boundary=${boundary}`,
              maxContentLength: Buffer.byteLength(data) + 1,
            },
            // },
          };
          this.request
            .post('/studies', data, postHeader)
            .then(() => {
              fastify.log.info('Dicoms sent to dicomweb with success');
              resolve();
            })
            .catch(error => {
              reject(new InternalError('Sending dicoms to dicomweb stow', error));
            });
        } catch (err) {
          reject(new InternalError('Preparing header and sending dicoms to dicomweb stow', err));
        }
      })
  );

  fastify.decorate(
    'deleteStudyDicomsInternal',
    params =>
      new Promise((resolve, reject) => {
        this.request
          .delete(`/studies/${params.study}`)
          .then(() => {
            fastify.log.info(`Study ${params.study} deletion request sent successfully`);
            resolve();
          })
          .catch(error => {
            reject(new InternalError(`Deleting study ${params.study}`, error));
          });
      })
  );

  fastify.decorate(
    'deleteSeriesDicomsInternal',
    params =>
      new Promise((resolve, reject) => {
        this.request
          .delete(`/studies/${params.study}/series/${params.series}`)
          .then(() => {
            fastify.log.info(`Series ${params.series} deletion request sent successfully`);
            resolve();
          })
          .catch(error => {
            reject(new InternalError(`Deleting series ${params.series}`, error));
          });
      })
  );
  fastify.decorate('getPatients', (request, reply) => {
    fastify
      .getPatientsInternal(request.params, undefined, request.epadAuth)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'getPatientsInternal',
    (params, filter, epadAuth) =>
      new Promise((resolve, reject) => {
        try {
          // make studies cal and aims call
          const studies = this.request.get('/studies', header);
          const aims = fastify.getAimsInternal(
            'summary',
            { subject: '', study: '', series: '' },
            undefined,
            epadAuth
          );
          Promise.all([studies, aims])
            .then(async values => {
              // handle success
              // filter the results if patient id filter is given
              const { filteredStudies, filteredAims } = await fastify.filter(
                values[0].data,
                values[1],
                filter,
                '00100020',
                'subjectID'
              );
              // populate an aim counts map containing each subject
              const aimsCountMap = {};
              _.chain(filteredAims)
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
              const result = _.chain(filteredStudies)
                .groupBy(value => {
                  return value['00100020'].Value[0];
                })
                .map(value => {
                  // combine the modalities in each study to create patient modatities list
                  const modalities = _.reduce(
                    value,
                    (modalitiesCombined, val) => {
                      val['00080061'].Value.forEach(modality => {
                        if (!modalitiesCombined.includes(modality))
                          modalitiesCombined.push(modality);
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
                    projectID: params.project ? params.project : projectID,
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
              resolve(result);
            })
            .catch(error => {
              reject(new InternalError('Retrieving Studies', error));
            });
        } catch (err) {
          reject(new InternalError('Populating Patients', err));
        }
      })
  );

  fastify.decorate(
    'filter',
    (studies, aims, filter, tag, aimField) =>
      new Promise((resolve, reject) => {
        try {
          let filteredStudies = studies;
          let filteredAims = aims;
          if (filter) {
            filteredStudies = _.filter(filteredStudies, obj => filter.includes(obj[tag].Value[0]));
            filteredAims = _.filter(filteredAims, obj => filter.includes(obj[aimField]));
          }
          resolve({ filteredStudies, filteredAims });
        } catch (err) {
          reject(new InternalError('Filtering aims', err));
        }
      })
  );

  fastify.decorate('getPatientStudy', (request, reply) => {
    fastify
      .getPatientStudiesInternal(request.params, [request.params.study], request.epadAuth)
      .then(result => {
        if (result.length === 1) reply.code(200).send(result[0]);
        else {
          reply.send(new ResourceNotFoundError('Study', request.params.study));
        }
      })
      .catch(err => reply.send(err));
  });

  fastify.decorate('getPatientStudies', (request, reply) => {
    fastify
      .getPatientStudiesInternal(request.params, undefined, request.epadAuth)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'getPatientStudiesInternal',
    (params, filter, epadAuth) =>
      new Promise((resolve, reject) => {
        try {
          const studies = this.request.get('/studies', header);
          // get aims for a specific patient
          const aims = fastify.getAimsInternal(
            'summary',
            {
              subject: params.subject ? params.subject : '',
              study: '',
              series: '',
            },
            undefined,
            epadAuth
          );

          Promise.all([studies, aims])
            .then(async values => {
              // handle success
              // filter the results if patient id filter is given
              // eslint-disable-next-line prefer-const
              let { filteredStudies, filteredAims } = await fastify.filter(
                values[0].data,
                values[1],
                filter,
                '0020000D',
                'studyUID'
              );
              // populate an aim counts map containing each study
              const aimsCountMap = {};
              _.chain(filteredAims)
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
              // filter by patient id
              if (params.subject)
                filteredStudies = _.filter(
                  filteredStudies,
                  obj => obj['00100020'].Value[0] === params.subject
                );

              // get the patients's studies and map each study to epadlite study object
              const result = _.map(filteredStudies, value => {
                return {
                  projectID: params.project ? params.project : projectID,
                  patientID: value['00100020'].Value[0],
                  patientName: value['00100010'].Value ? value['00100010'].Value[0].Alphabetic : '',
                  studyUID: value['0020000D'].Value[0],
                  insertDate: value['00080020'].Value ? value['00080020'].Value[0] : '', // study date
                  firstSeriesUID: '', // TODO
                  firstSeriesDateAcquired: '', // TODO
                  physicianName: '', // TODO
                  referringPhysicianName: value['00080090'].Value
                    ? value['00080090'].Value[0].Alphabetic
                    : '',
                  birthdate: value['00100030'].Value ? value['00100030'].Value[0] : '',
                  sex: value['00100040'].Value ? value['00100040'].Value[0] : '',
                  studyDescription:
                    value['00081030'] && value['00081030'].Value ? value['00081030'].Value[0] : '',
                  studyAccessionNumber: value['00080050'].Value ? value['00080050'].Value[0] : '',
                  examTypes: value['00080061'].Value ? value['00080061'].Value : [],
                  numberOfImages: value['00201208'].Value ? value['00201208'].Value[0] : '',
                  numberOfSeries: value['00201206'].Value ? value['00201206'].Value[0] : '',
                  numberOfAnnotations: aimsCountMap[value['0020000D'].Value[0]]
                    ? aimsCountMap[value['0020000D'].Value[0]]
                    : 0,
                  createdTime: '', // no date in studies call
                  // extra for flexview
                  studyID: value['00200010'].Value ? value['00200010'].Value[0] : '',
                  studyDate: value['00080020'].Value ? value['00080020'].Value[0] : '',
                  studyTime: value['00080030'].Value ? value['00080030'].Value[0] : '',
                };
              });

              resolve(result);
            })
            .catch(error => {
              reject(new InternalError('Retrieving studies for populating patient studies', error));
            });
        } catch (err) {
          reject(new InternalError('Populating patient studies', err));
        }
      })
  );

  fastify.decorate('getStudySeries', (request, reply) => {
    fastify
      .getStudySeriesInternal(request.params, request.query, request.epadAuth)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'getStudySeriesInternal',
    (params, query, epadAuth, noStats) =>
      new Promise((resolve, reject) => {
        try {
          const promisses = [];
          promisses.push(this.request.get(`/studies/${params.study}/series`, header));
          // get aims for a specific study
          if (noStats === undefined || noStats === false)
            promisses.push(
              fastify.getAimsInternal(
                'summary',
                {
                  subject: params.subject,
                  study: params.study,
                  series: '',
                },
                undefined,
                epadAuth
              )
            );

          Promise.all(promisses)
            .then(values => {
              // handle success
              // populate an aim counts map containing each series
              const aimsCountMap = {};
              if (noStats === undefined || noStats === false) {
                _.chain(values[1])
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
              }
              // handle success
              // map each series to epadlite series object
              let filtered = values[0].data;
              if (query.filterDSO === 'true')
                filtered = _.filter(values[0].data, obj => obj['00080060'].Value[0] !== 'SEG');
              const result = _.map(filtered, value => {
                return {
                  projectID: params.project ? params.project : projectID,
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
                  seriesDate: value['00080021'] ? value['00080021'].Value[0] : '',
                  seriesDescription:
                    value['0008103E'] && value['0008103E'].Value ? value['0008103E'].Value[0] : '',
                  examType: value['00080060'].Value ? value['00080060'].Value[0] : '',
                  bodyPart: '', // TODO
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
                  isDSO: value['00080060'].Value && value['00080060'].Value[0] === 'SEG',
                  isNonDicomSeries: false, // TODO
                  seriesNo:
                    value['00200011'] && value['00200011'].Value ? value['00200011'].Value[0] : '',
                };
              });
              resolve(result);
            })
            .catch(error => {
              reject(new InternalError(`Error retrieving study's (${params.study}) series`, error));
            });
        } catch (err) {
          reject(new InternalError(`Error populating study's (${params.study}) series`, err));
        }
      })
  );

  fastify.decorate('getSeriesImages', (request, reply) => {
    fastify
      .getSeriesImagesInternal(request.params, request.query)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'getSeriesImagesInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .get(`/studies/${params.study}/series/${params.series}/instances`, header)
            .then(response => {
              // handle success
              // map each instance to epadlite image object
              const result = _.chain(response.data)
                .map(value => {
                  return {
                    projectID: params.project ? params.project : projectID,
                    patientID:
                      value['00100020'] && value['00100020'].Value
                        ? value['00100020'].Value[0]
                        : '',
                    studyUID: value['0020000D'].Value ? value['0020000D'].Value[0] : '',
                    seriesUID: value['0020000E'].Value ? value['0020000E'].Value[0] : '',
                    imageUID: value['00080018'].Value ? value['00080018'].Value[0] : '',
                    classUID:
                      value['00080016'] && value['00080016'].Value
                        ? value['00080016'].Value[0]
                        : '',
                    insertDate: '', // no date in studies call
                    imageDate: '', // TODO
                    sliceLocation: '', // TODO
                    instanceNumber: Number(
                      value['00200013'] && value['00200013'].Value
                        ? value['00200013'].Value[0]
                        : '1'
                    ),
                    losslessImage: '', // TODO
                    lossyImage: `/studies/${params.study}/series/${params.series}/instances/${
                      value['00080018'].Value[0]
                    }`,
                    dicomElements: '', // TODO
                    defaultDICOMElements: '', // TODO
                    numberOfFrames: 0, // TODO
                    isDSO: false, // TODO value['00080060'].Value && value['00080060'].Value[0] === 'SEG',
                    multiFrameImage: false, // TODO
                    isFlaggedImage: '', // TODO
                    rescaleIntercept: '', // TODO
                    rescaleSlope: '', // TODO
                    sliceOrder: '', // TODO
                  };
                })
                .sortBy('instanceNumber')
                .value();

              resolve(result);
            })
            .catch(error => {
              reject(
                new InternalError(`Error retrieving series's (${params.series}) instances`, error)
              );
            });
        } catch (err) {
          reject(new InternalError(`Error populating series's (${params.series}) instances`, err));
        }
      })
  );

  fastify.decorate('getPatient', (request, reply) => {
    fastify
      .getPatientsInternal(request.params, [request.params.subject], request.epadAuth)
      .then(result => {
        if (result.length === 1) reply.code(200).send(result[0]);
        else {
          reply.send(new ResourceNotFoundError('Subject', request.params.subject));
        }
      })
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.log.info(`Using DICOMwebServer: ${config.dicomWebConfig.baseUrl}`);

  fastify.after(async () => {
    try {
      await fastify.initDicomWeb();
    } catch (err) {
      // do not turn off the server if in test mode. shouldn't come here in development anyway
      if (config.env !== 'test') {
        fastify.log.error(
          `Cannot connect to DICOMwebServer (err:${err.message}), shutting down the server`
        );
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
