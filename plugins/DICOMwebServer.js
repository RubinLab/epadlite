/* eslint-disable array-callback-return */
const fp = require('fastify-plugin');
const Axios = require('axios');
const _ = require('underscore');
const btoa = require('btoa');
const AsyncPolling = require('async-polling');
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

  fastify.decorate(
    'generateAim',
    imageMetadata =>
      new Promise((resolve, reject) => {
        try {
          const aimImageData = {
            aim: {
              studyInstanceUid: imageMetadata['0020000D'].Value[0],
              typeCode: [
                {
                  code: 'SEG',
                  codeSystemName: 'SEG Only',
                  'iso:displayName': {
                    'xmlns:iso': 'uri:iso.org:21090',
                    value: 'SEG Only',
                  },
                },
              ],
              name: 'ePAD DSO',
              comment: '',
            },
            study: {
              startTime: imageMetadata['00080030'].Value[0], // ?
              instanceUid: imageMetadata['0020000D'].Value[0],
              startDate: imageMetadata['00080020'].Value[0], // ?
              // accessionNumber: imageMetadata['00080050'].Value[0], //not there
            },
            series: {
              // instanceUid: imageMetadata['0020000d'].Value[0]'x0020000e',
              // modality: imageMetadata['0020000d'].Value[0]'x00080060',
            },
            image: {
              // sopClassUid: imageMetadata['0020000d'].Value[0]'x00080016',
              // sopInstanceUid: imageMetadata['0020000d'].Value[0]'x00080018',
            },
            segmentation: {
              // referencedSopInstanceUid: imageMetadata['0020000d'].Value[0]'x00080018',
              seriesInstanceUid: imageMetadata['0020000E'].Value[0],
              studyInstanceUid: imageMetadata['0020000D'].Value[0],
              sopInstanceUid: imageMetadata['00080018'].Value[0],
            },
            equipment: {
              // manufacturerName: imageMetadata['00080070'].Value[0], // we need the actual image
              // manufacturerModelName: imageMetadata['00081090'].Value[0],
              // softwareVersion: imageMetadata['00181020'].Value[0],
            },
            user: {
              loginName: 'epad',
              name: 'ePad',
            },
            person: {
              sex: imageMetadata['00100040'].Value[0],
              name: imageMetadata['00100010'].Value[0],
              patientId: imageMetadata['00100020'].Value[0],
              birthDate: imageMetadata['00100030'].Value[0],
            },
          };
          console.log(aimImageData);
          resolve();
        } catch (err) {
          fastify.log.info(`Error generating segmentation aim. Error: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getFirstImage',
    params =>
      new Promise((resolve, reject) => {
        fastify
          .getSeriesImagesMetadataInternal(params)
          .then(result => {
            if (result.length > 0) resolve(result[0]);
            reject(new Error(`Error retrieving first image metadata in series ${params.series}`));
          })
          .catch(err => {
            fastify.log.info(`Error retrieving first image metadata. Error: ${err.message}`);
            reject(new Error(`Error retrieving first image  metadata in series ${params.series}`));
          });
      })
  );

  fastify.decorate(
    'checkDSOSeriesforAim',
    dsoSeries =>
      new Promise(async (resolve, reject) => {
        try {
          // check if the dso series has an aim. checkaaim returns true if the aim already exists
          const seriesExists = await fastify.checkAim(dsoSeries['0020000E'].Value[0]);
          if (!seriesExists) {
            // get image first and do the same checks for dsoimageuid
            const params = {
              subject: dsoSeries['00100020'].Value[0],
              study: dsoSeries['0020000D'].Value[0],
              series: dsoSeries['0020000E'].Value[0],
            };
            const image = await fastify.getFirstImage(params);
            const imgExists = await fastify.checkAim(image['00080018'].Value[0]);
            if (!imgExists) {
              // console.log(image);
              console.log(`we need to generate segmentation aim for ${image['00080018'].Value[0]}`);
              await fastify.generateAim(image);
            }
          }
          resolve();
        } catch (err) {
          fastify.log.info(`Error in checking and generating DSO aim. Error: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate('scanStudy4DSOSeries', (subjectid, studyuid) => {
    fastify.log.info(
      `Scanning study ${studyuid} for DSO series and triggering aim creation if no aim present for DSO`
    );
    const params = {
      subject: subjectid,
      study: studyuid,
    };
    fastify
      .getStudySeriesInternal(params, { filterDSO: false }, true)
      .then(
        fastify.log.info(
          `Scanned study ${studyuid} for DSO series and triggering aim creation if no aim present for DSO`
        )
      )
      .catch(err =>
        fastify.log.info(
          `Error scanning series of study ${studyuid} for DSO aim check: ${err.message}`
        )
      );
  });

  fastify.decorate('scanDB4DSOSeries', () => {
    fastify.log.info(
      `Scanning db for DSO series and triggering aim creation if no aim present for DSO`
    );
    // get studies
    this.request
      .get('/studies', header)
      .then(studies => {
        studies.data.forEach(study => {
          if (study['00080061'].Value.includes('SEG'))
            fastify.scanStudy4DSOSeries(study['00100020'].Value[0], study['0020000D'].Value[0]);
        });
      })
      .catch(error => {
        // TODO handle error
        fastify.log.info(`Error scanning studies for DSO aim check: ${error.message}`);
      });
  });

  fastify.decorate('getStudySeries', (request, reply) => {
    fastify
      .getStudySeriesInternal(request.params, request.query, false)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.code(503).send(err.message));
  });

  fastify.decorate(
    'getStudySeriesInternal',
    (params, query, checkDSOAim) =>
      new Promise((resolve, reject) => {
        try {
          const series = this.request.get(`/studies/${params.study}/series`, header);
          // get aims for a specific study
          const aims = fastify.getAims('summary', {
            subject: params.subject,
            study: params.study,
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

              // check if dso series have the aim
              if (checkDSOAim === true) {
                const dsoSeries = _.filter(filtered, obj => obj['00080060'].Value[0] === 'SEG');
                if (dsoSeries.length > 0) _.each(dsoSeries, fastify.checkDSOSeriesforAim);
              }

              if (query.filterDSO === 'true')
                filtered = _.filter(filtered, obj => obj['00080060'].Value[0] !== 'SEG');
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
                  isDSO: value['00080060'].Value[0] === 'SEG',
                  isNonDicomSeries: false, // TODO
                  seriesNo:
                    value['00200011'] && value['00200011'].Value ? value['00200011'].Value[0] : '',
                };
              });
              resolve({ ResultSet: { Result: result, totalRecords: result.length } });
            })
            .catch(error => {
              // handle error
              fastify.log.info(
                `Error retrieving study's (${params.study}) series: ${error.message}`
              );
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error populating study's (${params.study}) series: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate(
    'getSeriesImagesMetadataInternal',
    params =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .get(`/studies/${params.study}/series/${params.series}/metadata`, header)
            .then(response => {
              resolve(response.data);
            })
            .catch(error => {
              // handle error
              fastify.log.info(
                `Error retrieving series's (${params.series}) metadata: ${error.message}`
              );
              reject(error);
            });
        } catch (err) {
          fastify.log.info(`Error populating series's (${params.series}) metadata: ${err.message}`);
          reject(err);
        }
      })
  );

  fastify.decorate('getSeriesImages', (request, reply) => {
    fastify
      .getSeriesImagesInternal(request.params)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.code(503).send(err.message));
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
                  lossyImage: `/studies/${params.study}/series/${params.series}/instances/${
                    value['00080018'].Value[0]
                  }`,
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

              resolve({ ResultSet: { Result: result, totalRecords: result.length } });
            })
            .catch(error => {
              // handle error
              fastify.log.info(
                `Error retrieving series's (${params.series}) instances: ${error.message}`
              );
              reject(error);
            });
        } catch (err) {
          fastify.log.info(
            `Error populating series's (${params.series}) instances: ${err.message}`
          );
          reject(err);
        }
      })
  );

  fastify.log.info(`Using DICOMwebServer: ${config.dicomWebConfig.baseUrl}`);

  fastify.after(async () => {
    try {
      await fastify.initDicomWeb();
      AsyncPolling(end => {
        fastify.scanDB4DSOSeries();
        end();
      }, 10000).run();
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
