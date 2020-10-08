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
                .get('/studies?limit=1', header)
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
              .get('/studies?limit=1', header)
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
              .get('/studies?limit=1')
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

  fastify.decorate('purge', (request, reply) => {
    console.log('this is just a purge url');
    reply.code(200).send();
  });
  // add accessor methods with decorate
  fastify.decorate(
    'purgeWado',
    (studyUid, seriesUid, instanceUid) =>
      new Promise((resolve, reject) => {
        try {
          let url = fastify.getWadoPath(studyUid, seriesUid, instanceUid);
          url = `${config.authConfig.authServerUrl.replace('/keycloak', '/api/wado')}${url}`;
          console.log('url', url);
          Axios({
            method: 'purge',
            url,
          })
            .then(() => {
              console.log('purged');
            })
            .catch(err => {
              if (err.response.status !== 404) throw err;
              else console.log('not cahced');
            });
          // console.log('result', result);
          resolve();
        } catch (err) {
          reject(
            new InternalError(
              `Purging wado path for study ${studyUid} seriesUID ${seriesUid} objectUID ${instanceUid}`,
              err
            )
          );
        }
      })
  );

  fastify.decorate(
    'getWadoPath',
    (studyUid, seriesUid, instanceUid) =>
      `/?requestType=WADO&studyUID=${studyUid}&seriesUID=${seriesUid}&objectUID=${instanceUid}`
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
    (
      params,
      filter,
      epadAuth,
      noStats,
      tag = '00100020',
      aimField = 'subjectID',
      negateFilter = false
    ) =>
      new Promise((resolve, reject) => {
        try {
          // make studies call and aims call
          const limit = config.limitStudies ? `?limit=${config.limitStudies}` : '';
          const query = params.subject ? `?PatientID=${params.subject}` : limit;
          const promisses = [];
          promisses.push(this.request.get(`/studies${query}`, header));
          if (!noStats)
            if (params.project)
              promisses.push(
                fastify.filterProjectAims(
                  {
                    project: params.project,
                    subject: '',
                    study: '',
                    series: '',
                  },
                  { format: 'summary' },
                  epadAuth
                )
              );
            else promisses.push(fastify.getAimsInternal('summary', params, undefined, epadAuth));
          Promise.all(promisses)
            .then(async values => {
              // handle success
              // filter the results if patient id filter is given
              const { filteredStudies, filteredAims } = await fastify.filter(
                values[0].data,
                values[1],
                filter,
                tag,
                aimField,
                negateFilter
              );
              // populate an aim counts map containing each subject
              const aimsCountMap = {};
              if (!noStats)
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
                    subjectID: fastify.replaceNull(value[0]['00100020'].Value[0]),
                    projectID: params.project ? params.project : projectID,
                    insertUser: '', // no user in studies call
                    xnatID: '', // no xnatID should remove
                    insertDate: '', // no date in studies call
                    uri: '', // no uri should remove
                    displaySubjectID: fastify.replaceNull(value[0]['00100020'].Value[0]),
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
    (studies, aims, filter, tag, aimField, negateFilter) =>
      new Promise((resolve, reject) => {
        try {
          let filteredStudies = studies;
          let filteredAims = aims;
          if (filter) {
            filteredStudies = _.filter(
              filteredStudies,
              obj =>
                obj[tag] &&
                (negateFilter
                  ? !filter.includes(obj[tag].Value[0])
                  : filter.includes(obj[tag].Value[0]))
            );
            filteredAims = _.filter(
              filteredAims,
              obj =>
                obj[aimField] &&
                (negateFilter ? !filter.includes(obj[aimField]) : filter.includes(obj[aimField]))
            );
          }
          resolve({ filteredStudies, filteredAims });
        } catch (err) {
          reject(new InternalError('Filtering aims', err));
        }
      })
  );

  fastify.decorate('getPatientStudy', (request, reply) => {
    fastify
      .getPatientStudiesInternal(
        request.params,
        [request.params.study],
        request.epadAuth,
        request.query
      )
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
      .getPatientStudiesInternal(request.params, undefined, request.epadAuth, request.query)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'updateStudyCounts',
    (studyUid, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const studySeries = await fastify.getStudySeriesInternal(
            { study: studyUid },
            { format: 'summary', filterDSO: 'true' },
            epadAuth,
            true
          );
          const numberOfImages = _.reduce(
            studySeries,
            (imageCount, series) => {
              return imageCount + series.numberOfImages;
            },
            0
          );
          resolve({ numberOfSeries: studySeries.length, numberOfImages });
        } catch (err) {
          reject(new InternalError('Update study counts', err));
        }
      })
  );

  fastify.decorate('triggerPollDW', (request, reply) => {
    fastify.log.info(`Polling initiated by ${request.epadAuth.username}`);
    fastify
      .pollDWStudies()
      .then(() => reply.code(200).send('Polled dicomweb successfully'))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'pollDWStudies',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          fastify.log.info(`Polling dicomweb ${new Date()}`);
          // use admin username
          const epadAuth = { username: 'admin', admin: true };
          const updateStudyPromises = [];
          const values = await this.request.get(`/studies`, header);
          const studyUids = await fastify.getDBStudies();
          for (let i = 0; i < values.data.length; i += 1) {
            const value = values.data[i];
            const studyUid = value['0020000D'].Value[0];
            const { numberOfSeries, numberOfImages } =
              value['00080061'] &&
              value['00080061'].Value &&
              value['00080061'].Value.includes('SEG')
                ? // eslint-disable-next-line no-await-in-loop
                  await fastify.updateStudyCounts(value['0020000D'].Value[0])
                : {
                    numberOfSeries:
                      value['00201206'] && value['00201206'].Value
                        ? value['00201206'].Value[0]
                        : '',
                    numberOfImages:
                      value['00201208'] && value['00201208'].Value
                        ? value['00201208'].Value[0]
                        : '',
                  };
            let studyRec = {};
            // check if the study exists in epad
            if (studyUids.includes(studyUid)) {
              // if it does just update the exam_types, num_of_images, num_of_series
              studyRec = {
                exam_types: JSON.stringify(value['00080061'].Value ? value['00080061'].Value : []),
                num_of_images: numberOfImages,
                num_of_series: numberOfSeries,
                // so that we fix the old ones with no value
                referring_physician: value['00080090'].Value
                  ? value['00080090'].Value[0].Alphabetic
                  : '',
                accession_number: value['00080050'].Value ? value['00080050'].Value[0] : null,
                study_id: value['00200010'].Value ? value['00200010'].Value[0] : null,
                study_time: value['00080030'].Value ? value['00080030'].Value[0] : null,
              };
              updateStudyPromises.push(() => {
                return fastify.updateStudyDBRecord(studyUid, studyRec, epadAuth);
              });
            } else {
              // if it doesn't create study record and if not exists subject record
              try {
                const subjectInfo = {
                  subjectuid: fastify.replaceNull(value['00100020'].Value[0]),
                  name: value['00100010'].Value ? value['00100010'].Value[0].Alphabetic : '',
                  gender: value['00100040'].Value ? value['00100040'].Value[0] : '',
                  dob: value['00100030'].Value ? value['00100030'].Value[0] : null,
                };
                // eslint-disable-next-line no-await-in-loop
                const subject = await fastify.addSubjectToDBIfNotExistInternal(
                  subjectInfo,
                  epadAuth
                );
                studyRec = {
                  exam_types: JSON.stringify(
                    value['00080061'].Value ? value['00080061'].Value : []
                  ),
                  num_of_images: numberOfImages,
                  num_of_series: numberOfSeries,
                  studyuid: studyUid,
                  studydate: value['00080020'].Value ? value['00080020'].Value[0] : null,
                  description:
                    value['00081030'] && value['00081030'].Value ? value['00081030'].Value[0] : '',
                  referring_physician: value['00080090'].Value
                    ? value['00080090'].Value[0].Alphabetic
                    : '',
                  accession_number: value['00080050'].Value ? value['00080050'].Value[0] : null,
                  study_id: value['00200010'].Value ? value['00200010'].Value[0] : null,
                  study_time: value['00080030'].Value ? value['00080030'].Value[0] : null,
                  subject_id: subject.id,
                };
                updateStudyPromises.push(() => {
                  return fastify.updateStudyDBRecord(studyUid, studyRec, epadAuth);
                });
              } catch (err) {
                fastify.log.error(
                  `Could not create subject to add study ${studyUid} to epad. Error: ${err.message}`
                );
              }
            }
          }
          await fastify.pq.addAll(updateStudyPromises);
          fastify.log.info(`Finished Polling dicomweb ${new Date()}`);
          resolve();
        } catch (err) {
          reject(new InternalError('Polling patient studies', err));
        }
      })
  );

  fastify.decorate(
    'getPatientStudiesInternal',
    (
      params,
      filter,
      epadAuth,
      requestQuery,
      noStats = false,
      tag = '0020000D',
      aimField = 'studyUID',
      negateFilter = false,
      createdTimes
    ) =>
      new Promise((resolve, reject) => {
        try {
          const limit = config.limitStudies ? `?limit=${config.limitStudies}` : '';
          const query = params.subject ? `?PatientID=${params.subject}` : limit;
          const promisses = [];
          promisses.push(this.request.get(`/studies${query}`, header));
          // get aims for a specific patient
          if (!noStats) {
            if (params.project)
              promisses.push(
                fastify.filterProjectAims(
                  {
                    project: params.project,
                    subject: params.subject ? params.subject : '',
                    study: '',
                    series: '',
                  },
                  { format: 'summary' },
                  epadAuth
                )
              );
            else promisses.push(fastify.getAimsInternal('summary', params, undefined, epadAuth));
          }
          Promise.all(promisses)
            .then(async values => {
              // handle success
              // filter the results if patient id filter is given
              // eslint-disable-next-line prefer-const
              let { filteredStudies, filteredAims } = await fastify.filter(
                values[0].data,
                values[1],
                filter,
                tag,
                aimField,
                negateFilter
              );
              // populate an aim counts map containing each study
              const aimsCountMap = {};
              if (!noStats)
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

              if (
                filteredStudies.length === 0 ||
                (filteredStudies.length === 1 && Object.keys(filteredStudies[0]).length === 0)
              ) {
                resolve([]);
              } else {
                // get the patients's studies and map each study to epadlite study object
                const result = await Promise.all(
                  _.chain(filteredStudies)
                    .map(async value => {
                      // update examptypes in db
                      // TODO we need to make sure it doesn't come there on pollDW
                      if (value['0020000D'].Value && !config.pollDW)
                        await fastify.updateStudyExamType(
                          value['0020000D'].Value[0],
                          value['00080061'] && value['00080061'].Value
                            ? value['00080061'].Value
                            : [],
                          epadAuth
                        );

                      const { numberOfSeries, numberOfImages } =
                        requestQuery.filterDSO &&
                        requestQuery.filterDSO === 'true' &&
                        value['00080061'] &&
                        value['00080061'].Value &&
                        value['00080061'].Value.includes('SEG')
                          ? await fastify.updateStudyCounts(value['0020000D'].Value[0])
                          : {
                              numberOfSeries:
                                value['00201206'] && value['00201206'].Value
                                  ? value['00201206'].Value[0]
                                  : '',
                              numberOfImages:
                                value['00201208'] && value['00201208'].Value
                                  ? value['00201208'].Value[0]
                                  : '',
                            };

                      return {
                        projectID: params.project ? params.project : projectID,
                        patientID: fastify.replaceNull(value['00100020'].Value[0]),
                        patientName: value['00100010'].Value
                          ? value['00100010'].Value[0].Alphabetic
                          : '',
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
                          value['00081030'] && value['00081030'].Value
                            ? value['00081030'].Value[0]
                            : '',
                        studyAccessionNumber: value['00080050'].Value
                          ? value['00080050'].Value[0]
                          : '',
                        examTypes: value['00080061'].Value ? value['00080061'].Value : [],
                        numberOfImages,
                        numberOfSeries,
                        numberOfAnnotations: aimsCountMap[value['0020000D'].Value[0]]
                          ? aimsCountMap[value['0020000D'].Value[0]]
                          : 0,
                        createdTime:
                          createdTimes && createdTimes[value['0020000D'].Value[0]]
                            ? createdTimes[value['0020000D'].Value[0]]
                            : '',
                        // extra for flexview
                        studyID: value['00200010'].Value ? value['00200010'].Value[0] : '',
                        studyDate: value['00080020'].Value ? value['00080020'].Value[0] : '',
                        studyTime: value['00080030'].Value ? value['00080030'].Value[0] : '',
                      };
                    })
                    .sortBy('studyDescription')
                    .value()
                );
                resolve(result);
              }
            })
            .catch(error => {
              reject(new InternalError('Retrieving studies for populating patient studies', error));
            });
        } catch (err) {
          reject(new InternalError('Populating patient studies', err));
        }
      })
  );

  fastify.decorate('getAllStudySeries', (request, reply) => {
    fastify
      .getAllStudySeriesInternal(request.query, request.epadAuth)
      .then(result => reply.code(200).send(result))
      .catch(err => reply.send(err));
  });

  fastify.decorate(
    'getAllStudySeriesInternal',
    (query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const limit = config.limitStudies ? `?limit=${config.limitStudies}` : '';
          const studies = await this.request.get(`/studies${limit}`, header);
          const studyUids = _.map(studies.data, value => {
            return value['0020000D'].Value[0];
          });
          let result = [];
          for (let j = 0; j < studyUids.length; j += 1) {
            // eslint-disable-next-line no-await-in-loop
            const studySeries = await fastify.getStudySeriesInternal(
              { study: studyUids[j] },
              query,
              epadAuth,
              true
            );
            result = result.concat(studySeries);
          }

          resolve(result);
        } catch (err) {
          reject(new InternalError(`Getting all series`), err);
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
            if (params.project)
              promisses.push(
                fastify.filterProjectAims(
                  {
                    project: params.project,
                    subject: params.subject,
                    study: params.study,
                    series: '',
                  },
                  { format: 'summary' },
                  epadAuth
                )
              );
            else promisses.push(fastify.getAimsInternal('summary', params, undefined, epadAuth));

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
                    value['00100020'] && value['00100020'].Value
                      ? fastify.replaceNull(value['00100020'].Value[0])
                      : '',
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
            .then(async response => {
              // handle success
              // map each instance to epadlite image object
              const result = _.chain(response.data)
                .map(value => {
                  return {
                    projectID: params.project ? params.project : projectID,
                    patientID:
                      value['00100020'] && value['00100020'].Value
                        ? fastify.replaceNull(value['00100020'].Value[0])
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
                    // lossyImage: `/studies/${params.study}/series/${params.series}/instances/${
                    //   value['00080018'].Value[0]
                    // }`,
                    // send wado-uri instead of wado-rs
                    lossyImage: fastify.getWadoPath(
                      params.study,
                      params.series,
                      value['00080018'].Value[0]
                    ),
                    dicomElements: '', // TODO
                    defaultDICOMElements: '', // TODO
                    numberOfFrames:
                      value['00280008'] && value['00280008'].Value ? value['00280008'].Value[0] : 1,
                    isDSO:
                      value['00080060'] && value['00080060'].Value
                        ? value['00080060'].Value[0] === 'SEG'
                        : false,
                    multiFrameImage:
                      value['00280008'] && value['00280008'].Value
                        ? value['00280008'].Value[0] > 1
                        : false,
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

  fastify.decorate('getWado', (request, reply) => {
    fastify
      .getWadoInternal({
        study: request.query.studyUID,
        series: request.query.seriesUID,
        image: request.query.objectUID,
      })
      .then(result => {
        reply.headers(result.headers);
        reply.code(200).send(result.data);
      })
      .catch(err => reply.send(new InternalError('WADO', err)));
  });

  fastify.decorate('getWadoInternal', params => {
    return this.request.get(
      `/?requestType=WADO&studyUID=${params.study}&seriesUID=${params.series}&objectUID=${
        params.image
      }`,
      { ...header, responseType: 'stream' }
    );
  });

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
  // get tagvalue with a default
  fastify.decorate('getTagValue', (metadata, tag, defaultVal) => {
    if (metadata[tag] && metadata[tag].Value) {
      const tagValue = metadata[tag].Value[0];
      if (typeof tagValue === 'string') {
        return fastify.replaceNull(tagValue);
      }
      if (typeof tagValue === 'number') {
        return `${tagValue}`;
      }
      if (typeof tagValue === 'object' && !Array.isArray(tagValue)) {
        const values = Object.values(tagValue);
        return typeof values[0] === 'string' ? fastify.replaceNull(values[0]) : defaultVal;
      }
      return defaultVal;
    }
    return defaultVal;
  });

  // send a params obj with study, series, instance
  fastify.decorate(
    'getImageMetadata',
    params =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .get(
              `/studies/${params.study}/series/${params.series}/instances/${
                params.instance
              }/metadata`,
              header
            )
            .then(async response => {
              const metadata = response.data;
              const obj = {};
              obj.aim = {};
              obj.study = {};
              obj.series = {};
              obj.equipment = {};
              obj.person = {};
              obj.image = [];
              const { aim, study, series, equipment, person } = obj;

              aim.studyInstanceUid = fastify.getTagValue(metadata[0], '0020000D', '');
              study.startTime = fastify.getTagValue(metadata[0], '00080030', '');
              study.instanceUid = fastify.getTagValue(metadata[0], '0020000D', '');
              study.startDate = fastify.getTagValue(metadata[0], '00080020', '');
              study.accessionNumber = fastify.getTagValue(metadata[0], '00080050', '');
              series.instanceUid = fastify.getTagValue(metadata[0], '0020000E', '');
              series.modality = fastify.getTagValue(metadata[0], '00080060', '');
              series.number = fastify.getTagValue(metadata[0], '00200011', '');
              series.description = fastify.getTagValue(metadata[0], '0008103E', '');
              series.instanceNumber = fastify.getTagValue(metadata[0], '00200013', '');
              equipment.manufacturerName = fastify.getTagValue(metadata[0], '00080070', '');
              equipment.manufacturerModelName = fastify.getTagValue(metadata[0], '00081090', '');
              equipment.softwareVersion = fastify.getTagValue(metadata[0], '00181020', '');
              person.sex = fastify.getTagValue(metadata[0], '00100040', '');
              person.name = fastify.getTagValue(metadata[0], '00100010', '');
              person.patientId = fastify.getTagValue(metadata[0], '00100020', '');
              person.birthDate = fastify.getTagValue(metadata[0], '00100030', '');
              const sopClassUid = fastify.getTagValue(metadata[0], '00080016', '');
              const sopInstanceUid = fastify.getTagValue(metadata[0], '00080018', '');
              obj.image.push({ sopClassUid, sopInstanceUid });
              resolve(obj);
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
