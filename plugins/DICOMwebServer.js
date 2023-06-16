/* eslint-disable no-async-promise-executor */
/* eslint-disable array-callback-return */
const fp = require('fastify-plugin');
const Axios = require('axios');
const _ = require('underscore');
const btoa = require('btoa');
const dimse = require('dicom-dimse-native');
const https = require('https');
const fs = require('fs');
// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');
const config = require('../config/index');
const { InternalError, ResourceNotFoundError } = require('../utils/EpadErrors');

// I need to import this after config as it uses config values
// eslint-disable-next-line import/order
const keycloak = require('keycloak-backend')({
  realm: config.dicomWebConfig.realm, // required for verify
  keycloak_base_url: config.dicomWebConfig.authServerUrl, // required for verify
  client_id: config.dicomWebConfig.clientId,
  client_secret: config.dicomWebConfig.clientSecret,
  username: config.dicomWebConfig.username,
  password: config.dicomWebConfig.password,
  is_legacy_endpoint: config.dicomWebConfig.legacyEndpoint,
});

let accessToken = '';
let mainHeader = {};
let archiveHeader = {};
const projectID = 'lite';

async function dicomwebserver(fastify) {
  fastify.decorate('initDicomWeb', async () => {
    try {
      const connect = await fastify.connectDICOMweb();
      fastify.log.info('Connected to dicomweb server');
      return connect;
    } catch (err) {
      if (config.env !== 'test' || config.limitStudies) {
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
          let httpsAgent;
          try {
            const caFiles = [];
            if (config.trustPath) {
              const files = await fs.promises.readdir(config.trustPath);
              for (let i = 0; i < files.length; i += 1) {
                if (
                  files[i] !== '__MACOSX' &&
                  !fs.statSync(`${config.trustPath}/${files[i]}`).isDirectory() &&
                  (files[i].endsWith('cer') || files[i].endsWith('pem'))
                ) {
                  const file = fs.readFileSync(`${config.trustPath}/${files[i]}`);
                  caFiles.push(file);
                }
              }
              httpsAgent = new https.Agent({ ca: caFiles });
            }
          } catch (err) {
            fastify.log.error(`Error adding Root certificates to trust. Error: ${err.message}`);
          }
          // see if we can authenticate
          if (config.dicomWebConfig) {
            if (config.dicomWebConfig.authServerUrl) {
              accessToken = await keycloak.accessToken.get();
              if (accessToken) {
                mainHeader = {
                  headers: {
                    authorization: `Bearer ${accessToken}`,
                  },
                };
              }
            } else if (config.dicomWebConfig.username) {
              const encoded = btoa(
                `${config.dicomWebConfig.username}:${config.dicomWebConfig.password}`
              );
              mainHeader = {
                headers: {
                  authorization: `Basic ${encoded}`,
                },
              };
            }
            this.request = Axios.create({
              baseURL: config.dicomWebConfig.baseUrl,
              headers: {
                ...mainHeader.headers,
                ...(config.dicomWebConfig.requireJSONHeader ? { accept: 'application/json' } : {}),
              },
              httpsAgent,
            });
            this.request
              .get(`${config.dicomWebConfig.qidoSubPath}/studies?limit=1`)
              .then(async () => {
                if (!config.archiveDicomWebConfig) resolve();
                if (config.archiveDicomWebConfig.authServerUrl) {
                  accessToken = await keycloak.accessToken.get();
                  if (accessToken) {
                    archiveHeader = {
                      headers: {
                        authorization: `Bearer ${accessToken}`,
                      },
                    };
                  }
                } else if (config.archiveDicomWebConfig.username) {
                  const encoded = btoa(
                    `${config.archiveDicomWebConfig.username}:${config.archiveDicomWebConfig.password}`
                  );
                  archiveHeader = {
                    headers: {
                      authorization: `Basic ${encoded}`,
                    },
                  };
                }
                this.archiveRequest = Axios.create({
                  baseURL: config.archiveDicomWebConfig.baseUrl,
                  headers: {
                    ...archiveHeader.headers,
                    ...(config.archiveDicomWebConfig.requireJSONHeader
                      ? { accept: 'application/json' }
                      : {}),
                  },
                  httpsAgent,
                });
                this.archiveRequest
                  .get(`${config.archiveDicomWebConfig.qidoSubPath}/studies?limit=1`)
                  .then(() => {
                    resolve();
                  })
                  .catch((err) => {
                    reject(
                      new InternalError(
                        `Retrieving studies from archive pacs ${JSON.stringify(
                          archiveHeader.headers
                        )}`,
                        err
                      )
                    );
                  });
              })
              .catch((err) => {
                reject(
                  new InternalError(
                    `Retrieving studies from main pacs ${JSON.stringify(mainHeader.headers)}`,
                    err
                  )
                );
              });
          }
        } catch (err) {
          reject(new InternalError('Error connecting to DICOMweb server', err));
        }
      })
  );

  // add accessor methods with decorate
  fastify.decorate(
    'purgeWado',
    (studyUid, seriesUid, instanceUid) =>
      new Promise((resolve, reject) => {
        try {
          // just purging for regular pacs, as that is the one I can upload to
          let url = fastify.getWadoPath(studyUid, seriesUid, instanceUid, 'pacs');
          url = `${config.authConfig.authServerUrl.replace('/keycloak', '/api/wado')}${url}`;
          Axios({
            method: 'purge',
            url,
          })
            .then(() => {
              fastify.log.info(`Purged ${url}`);
            })
            .catch((err) => {
              if (err.response.status !== 404 && err.response.status !== 412)
                reject(
                  new InternalError(
                    `Purging wado path for study ${studyUid} seriesUID ${seriesUid} objectUID ${instanceUid}`,
                    err
                  )
                );
              else fastify.log.info(`Url ${url} not cached`);
            });
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

  fastify.decorate('getWadoPath', (studyUid, seriesUid, instanceUid, source) =>
    config.wadoType && config.wadoType === 'RS'
      ? `/${source}/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}` // add source to support multiple sources
      : `/${source}/?requestType=WADO&studyUID=${studyUid}&seriesUID=${seriesUid}&objectUID=${instanceUid}`
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
            ...mainHeader.headers,
            ...{
              'Content-Type': `multipart/related; type=application/dicom; boundary=${boundary}`,
              maxContentLength: Buffer.byteLength(data) + 1,
              maxBodyLength: Buffer.byteLength(data) + 1,
            },
            // },
          };
          if (config.disableDICOMSend) {
            fastify.log.err('DICOMSend disabled');
            resolve();
          } else {
            this.request
              .post(`${config.dicomWebConfig.qidoSubPath}/studies`, data, postHeader)
              .then(() => {
                fastify.log.info('Dicoms sent to dicomweb with success');
                resolve();
              })
              .catch((error) => {
                reject(new InternalError('Sending dicoms to dicomweb stow', error));
              });
          }
        } catch (err) {
          reject(new InternalError('Preparing header and sending dicoms to dicomweb stow', err));
        }
      })
  );

  fastify.decorate(
    'deleteStudyDicomsInternal',
    (params) =>
      new Promise((resolve, reject) => {
        this.request
          .delete(`${config.dicomWebConfig.qidoSubPath}/studies/${params.study}`)
          .then(() => {
            fastify.log.info(`Study ${params.study} deletion request sent successfully`);
            resolve();
          })
          .catch((error) => {
            reject(new InternalError(`Deleting study ${params.study}`, error));
          });
      })
  );

  fastify.decorate(
    'deleteSeriesDicomsInternal',
    (params) =>
      new Promise((resolve, reject) => {
        this.request
          .delete(
            `${config.dicomWebConfig.qidoSubPath}/studies/${params.study}/series/${params.series}`
          )
          .then(() => {
            fastify.log.info(`Series ${params.series} deletion request sent successfully`);
            resolve();
          })
          .catch((error) => {
            reject(new InternalError(`Deleting series ${params.series}`, error));
          });
      })
  );
  fastify.decorate('getPatients', (request, reply) => {
    fastify
      .getPatientsInternal(request.params, undefined, request.epadAuth)
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
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
          promisses.push(
            this.request.get(
              `${config.dicomWebConfig.qidoSubPath}/studies${query}${
                query ? '&' : '?'
              }includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`,
              mainHeader
            )
          );
          if (!noStats)
            promisses.push(
              fastify.getProjectAimCountMap({ project: params.project }, epadAuth, 'subject_uid')
            );
          Promise.all(promisses)
            .then(async (values) => {
              // handle success
              // filter the results if patient id filter is given
              const { filteredStudies } = await fastify.filter(
                values[0].data,
                [],
                filter,
                tag,
                aimField,
                negateFilter
              );
              const aimsCountMap = values[1] ? values[1] : [];
              // populate the subjects data by grouping the studies by patient id
              // and map each subject to epadlite subject object
              const result = _.chain(filteredStudies)
                .groupBy((value) => value['00100020'].Value[0])
                .map((value) => {
                  // combine the modalities in each study to create patient modatities list
                  const modalities = _.reduce(
                    value,
                    (modalitiesCombined, val) => {
                      if (val['00080061'] && val['00080061'].Value)
                        val['00080061'].Value.forEach((modality) => {
                          if (!modalitiesCombined.includes(modality))
                            modalitiesCombined.push(modality);
                        });
                      return modalitiesCombined;
                    },
                    []
                  );
                  // cumulate the number of studies
                  const numberOfStudies = _.reduce(value, (memo) => memo + 1, 0);
                  return {
                    subjectName:
                      value[0]['00100010'] && value[0]['00100010'].Value
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
            .catch((error) => {
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
              (obj) =>
                obj[tag] &&
                (negateFilter
                  ? !filter.includes(obj[tag].Value[0])
                  : filter.includes(obj[tag].Value[0]))
            );
            filteredAims = _.filter(
              filteredAims,
              (obj) =>
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
      .then((result) => {
        if (result.length === 1) reply.code(200).send(result[0]);
        else {
          reply.send(new ResourceNotFoundError('Study', request.params.study));
        }
      })
      .catch((err) => reply.send(err));
  });

  fastify.decorate('getPatientStudies', (request, reply) => {
    fastify
      .getPatientStudiesInternal(request.params, undefined, request.epadAuth, request.query)
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'updateStudyCounts',
    (studyUid, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const studySeries = await fastify.getSeriesDicomOrNotInternal(
            { study: studyUid },
            { format: 'summary', filterDSO: 'true' },
            epadAuth,
            true
          );
          const numberOfImages = _.reduce(
            studySeries,
            (imageCount, series) => imageCount + series.numberOfImages,
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
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'pollDWStudies',
    () =>
      new Promise(async (resolve, reject) => {
        try {
          if (!config.pollDW) {
            fastify.log.info('Polling is not supported! Skipping..');
            resolve('Polling is not supported!');
            return;
          }
          fastify.log.info(`Polling dicomweb ${new Date()}`);
          // use admin username
          const epadAuth = { username: 'admin', admin: true };
          const updateStudyPromises = [];
          const values = await this.request.get(
            `${config.dicomWebConfig.qidoSubPath}/studies?${
              config.limitStudies ? `limit=${config.limitStudies}&` : ''
            }includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`,
            mainHeader
          );
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
              updateStudyPromises.push(() =>
                fastify.updateStudyDBRecord(studyUid, studyRec, epadAuth)
              );
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
                updateStudyPromises.push(() =>
                  fastify.updateStudyDBRecord(studyUid, studyRec, epadAuth)
                );
              } catch (err) {
                fastify.log.error(
                  `Could not create subject to add study ${studyUid} to epad. Error: ${err.message}`
                );
              }
            }
          }
          await fastify.pq.addAll(updateStudyPromises);
          fastify.log.info(`Finished Polling dicomweb ${new Date()}`);
          resolve('Polled dicomweb successfully');
        } catch (err) {
          reject(new InternalError('Polling patient studies', err));
        }
      })
  );

  fastify.decorate(
    'getPatientIDandStudyUIDsFromAccession',
    (accessionNumber) =>
      new Promise((resolve, reject) => {
        const query = `AccessionNumber=${accessionNumber}`;
        this.request
          .get(`${config.dicomWebConfig.qidoSubPath}/studies?${query}`, mainHeader)
          .then((res) => {
            const patientStudyPairs = res.data.map((value) => ({
              patientID: fastify.replaceNull(value['00100020'].Value[0]),
              studyUID: value['0020000D'].Value[0],
            }));
            resolve(patientStudyPairs);
          })
          .catch((err) => reject(new InternalError('Retrieving studies with accession', err)));
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
          const promisses = [];
          let qryIncludes =
            '&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061';
          const limit = config.limitStudies ? `?limit=${config.limitStudies}` : '';
          let query = limit;
          if (filter && config.pullStudyIds) {
            let studyUidsStr = filter.join(',');
            const maxLength = 2048 - qryIncludes.length - '?StudyInstanceUID='.length;
            while (studyUidsStr.length > maxLength) {
              for (let j = maxLength; j > 0; j -= 1) {
                if (studyUidsStr[j] === ',') {
                  promisses.push(
                    this.request.get(
                      `${
                        config.dicomWebConfig.qidoSubPath
                      }/studies?StudyInstanceUID=${studyUidsStr.substring(0, j)}${qryIncludes}`,
                      mainHeader
                    )
                  );
                  studyUidsStr = studyUidsStr.substring(j + 1);
                  break;
                }
              }
            }
            if (studyUidsStr.length > 0) {
              promisses.push(
                this.request.get(
                  `${config.dicomWebConfig.qidoSubPath}/studies?StudyInstanceUID=${studyUidsStr}${qryIncludes}`,
                  mainHeader
                )
              );
            }
          } else {
            // if there is a study or patient filter ignore the limit
            if (params.study) query = `?StudyInstanceUID=${params.study}`;
            else if (params.subject) query = `?PatientID=${params.subject}`;

            // if there is nothing in the query (getting everything, for migration for example) change the & at the start to ?
            if (query.length === 0) qryIncludes = `?${qryIncludes.substring(1)}`;
            promisses.push(
              this.request.get(
                `${config.dicomWebConfig.qidoSubPath}/studies${query}${qryIncludes}`,
                mainHeader
              )
            );
          }
          if (promisses.length === 0) {
            resolve([]);
            return;
          }
          // get aims for a specific patient
          if (!noStats)
            promisses.push(
              fastify.getProjectAimCountMap(
                {
                  project: params.project,
                  subject: params.subject,
                },
                epadAuth,
                'study_uid'
              )
            );

          Promise.all(promisses)
            .then(async (values) => {
              let studies = values[0].data;
              for (let i = 1; i < (!noStats ? values.length - 1 : values.length); i += 1) {
                studies = studies.concat(values[i].data);
              }
              // handle success
              // filter the results if patient id filter is given
              // eslint-disable-next-line prefer-const
              let { filteredStudies } = config.pullStudyIds
                ? { filteredStudies: studies }
                : await fastify.filter(studies, [], filter, tag, aimField, negateFilter);
              // populate an aim counts map containing each study
              const aimsCountMap = !noStats ? values[values.length - 1] : [];

              if (
                filteredStudies.length === 0 ||
                (filteredStudies.length === 1 && Object.keys(filteredStudies[0]).length === 0)
              ) {
                resolve([]);
              } else {
                // get the patients's studies and map each study to epadlite study object
                const result = await Promise.all(
                  _.chain(filteredStudies)
                    .map(async (value) => {
                      // update examptypes in db
                      // TODO we need to make sure it doesn't come there on pollDW
                      if (!config.pollDW && value['0020000D'] && value['0020000D'].Value)
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
                        patientName:
                          value['00100010'] && value['00100010'].Value
                            ? value['00100010'].Value[0].Alphabetic
                            : '',
                        studyUID: value['0020000D'].Value[0],
                        insertDate:
                          value['00080020'] && value['00080020'].Value
                            ? fastify.getFormattedDate(value['00080020'].Value[0])
                            : '', // study date
                        firstSeriesUID: '', // TODO
                        firstSeriesDateAcquired: '', // TODO
                        physicianName: '', // TODO
                        referringPhysicianName:
                          value['00080090'] && value['00080090'].Value
                            ? value['00080090'].Value[0].Alphabetic
                            : '',
                        birthdate:
                          value['00100030'] && value['00100030'].Value
                            ? fastify.getFormattedDate(value['00100030'].Value[0])
                            : '',
                        sex:
                          value['00100040'] && value['00100040'].Value
                            ? value['00100040'].Value[0]
                            : '',
                        studyDescription:
                          value['00081030'] && value['00081030'].Value
                            ? value['00081030'].Value[0]
                            : '',
                        studyAccessionNumber:
                          value['00080050'] && value['00080050'].Value
                            ? value['00080050'].Value[0]
                            : '',
                        examTypes:
                          value['00080061'] && value['00080061'].Value
                            ? value['00080061'].Value
                            : [],
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
                        studyID:
                          value['00200010'] && value['00200010'].Value
                            ? value['00200010'].Value[0]
                            : '',
                        studyDate:
                          value['00080020'] && value['00080020'].Value
                            ? fastify.getFormattedDate(value['00080020'].Value[0])
                            : '',
                        studyTime:
                          value['00080030'] && value['00080030'].Value
                            ? fastify.getFormattedTime(value['00080030'].Value[0])
                            : '',
                      };
                    })
                    .sortBy('studyDate')
                    .value()
                );
                resolve(result);
              }
            })
            .catch((error) => {
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
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'getAllStudySeriesInternal',
    (query, epadAuth) =>
      new Promise(async (resolve, reject) => {
        try {
          const limit = config.limitStudies ? `?limit=${config.limitStudies}&` : '?';
          const studies = await this.request.get(
            `${config.dicomWebConfig.qidoSubPath}/studies${limit}includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`,
            mainHeader
          );
          const studyUids = _.map(studies.data, (value) => value['0020000D'].Value[0]);
          let result = [];
          for (let j = 0; j < studyUids.length; j += 1) {
            // eslint-disable-next-line no-await-in-loop
            const studySeries = await fastify.getSeriesDicomOrNotInternal(
              { study: studyUids[j] },
              query,
              epadAuth,
              true
            );
            result = result.concat(studySeries);
          }
          // order by series number
          result = _.sortBy(result, 'seriesNo');
          resolve(result);
        } catch (err) {
          reject(new InternalError(`Getting all series`, err));
        }
      })
  );

  fastify.decorate('getStudySeries', (request, reply) => {
    fastify
      .getSeriesDicomOrNotInternal(request.params, request.query, request.epadAuth)
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  fastify.decorate(
    'promisifyDIMSE',
    (dimseConf, studyUID) =>
      new Promise((resolve) => {
        dimse.findScu(
          JSON.stringify({
            source: {
              aet: 'FINDSCU',
              ip: dimseConf.sourceIp || '127.0.0.1',
              port: '9999',
            },
            target: {
              aet: dimseConf.aet,
              ip: dimseConf.ip,
              port: dimseConf.port,
            },
            tags: [
              {
                key: '0020000D',
                value: studyUID,
              },
              {
                key: '00080052',
                value: 'SERIES',
              },
              {
                key: '00080021',
                value: '',
              },
              {
                key: '0008103E',
                value: '',
              },
              {
                key: '0020000E',
                value: '',
              },
              {
                key: '00080060',
                value: '',
              },
              {
                key: '00080050',
                value: '',
              },
              {
                key: '00201209',
                value: '',
              },
              {
                key: '00201209',
                value: '',
              },
              {
                key: '00200011',
                value: '',
              },
            ],
          }),
          (result) => {
            resolve(result);
          }
        );
      })
  );

  fastify.decorate(
    'getStudySeriesDIMSE',
    (studyUID) =>
      new Promise((resolve, reject) => {
        const dimsePromises = [
          fastify.promisifyDIMSE(config.dimse, studyUID),
          fastify.promisifyDIMSE(config.archiveDimse, studyUID),
        ];
        Promise.all(dimsePromises).then((results) => {
          try {
            // use vna if there is a successfull result from vna
            // it means the study is already archived
            // we assume the series data does not change once it is archived
            const containerJSONs = results
              .map((item) => JSON.parse(item))
              .filter((item) => item.code === 0 && item.container) // sanity check for success in retrieval
              .map((item) => JSON.parse(item.container)); // convert container to JSON
            // get Sectra by default
            let res = containerJSONs[0];
            // check if the return value has series descriptions
            // if it has no series description in the first 3 (to cover series with no description), we need to get the descriptions from vna
            if (
              ((res.length > 0 && !res[0]['0008103E']) ||
                (res.length > 1 && !res[1]['0008103E']) ||
                (res.length > 2 && !res[2]['0008103E'])) &&
              containerJSONs[1]
            ) {
              // get a map of series descriptions from VNA
              const map = containerJSONs[1].reduce((result, item) => {
                if (
                  item['0020000E'] &&
                  item['0020000E'].Value &&
                  item['0020000E'].Value[0] &&
                  item['0008103E']
                )
                  // eslint-disable-next-line no-param-reassign
                  result[item['0020000E'].Value[0]] = item['0008103E'];
                return result;
              }, {});
              // fill in the series descriptions retrieved from Sectra
              res = res.map((item) => {
                if (item['0020000E'] && item['0020000E'].Value && item['0020000E'].Value[0])
                  // eslint-disable-next-line no-param-reassign
                  item['0008103E'] = map[item['0020000E'].Value[0]];
                return item;
              });
            }
            resolve({ data: res });
          } catch (err) {
            reject(err);
          }
        });
      })
  );

  fastify.decorate(
    'getStudySeriesInternal',
    (params, query, epadAuth, noStats) =>
      new Promise((resolve, reject) => {
        try {
          const promisses = [];
          if (config.dimse) promisses.push(fastify.getStudySeriesDIMSE(params.study));
          else
            promisses.push(
              this.request.get(
                `${config.dicomWebConfig.qidoSubPath}/studies/${params.study}/series?includefield=SeriesDescription`,
                mainHeader
              )
            );
          promisses.push(
            fastify
              .getSignificantSeriesInternal(params.project, params.subject, params.study)
              .catch((err) => {
                fastify.log.warn(
                  `Could not get significant series for dicom ${params.study}. Error: ${err.message}`
                );
                return [];
              })
          );
          // get aims for a specific study
          if (!noStats)
            promisses.push(
              fastify.getProjectAimCountMap(
                {
                  project: params.project,
                  subject: params.subject,
                  study: params.study,
                },
                epadAuth,
                'series_uid'
              )
            );
          Promise.all(promisses)
            .then((values) => {
              // handle success
              // populate an aim counts map containing each series
              const aimsCountMap = values[2] ? values[2] : [];
              const seriesSignificanceMap = values[1];
              // map each series to epadlite series object
              let filtered = values[0].data;
              if (query.filterDSO === 'true')
                filtered = _.filter(
                  filtered,
                  (obj) =>
                    !(obj['00080060'] && obj['00080060'].Value && obj['00080060'].Value[0]) ||
                    obj['00080060'].Value[0] !== 'SEG'
                );
              const result = _.map(filtered, (value) => ({
                projectID: params.project ? params.project : projectID,
                // TODO put in dicomweb but what if other dicomweb is used
                patientID:
                  value['00100020'] && value['00100020'].Value
                    ? fastify.replaceNull(value['00100020'].Value[0])
                    : params.subject,
                // TODO
                patientName:
                  value['00100010'] && value['00100010'].Value
                    ? value['00100010'].Value[0].Alphabetic
                    : '',
                studyUID:
                  value['0020000D'] && value['0020000D'].Value
                    ? value['0020000D'].Value[0]
                    : params.study,
                seriesUID: value['0020000E'].Value[0],
                seriesDate:
                  value['00080021'] && value['00080021'].Value && value['00080021'].Value[0]
                    ? value['00080021'].Value[0]
                    : '',
                seriesDescription:
                  value['0008103E'] && value['0008103E'].Value && value['0008103E'].Value[0]
                    ? value['0008103E'].Value[0]
                    : '',
                examType:
                  value['00080060'] && value['00080060'].Value ? value['00080060'].Value[0] : '',
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
                isDSO:
                  (value['00080060'] &&
                    value['00080060'].Value &&
                    value['00080060'].Value[0] === 'SEG') ||
                  false,
                isNonDicomSeries: false, // TODO
                seriesNo:
                  // eslint-disable-next-line no-nested-ternary
                  value['00200011'] &&
                  value['00200011'].Value &&
                  value['00200011'].Value[0] &&
                  Number.isInteger(value['00200011'].Value[0])
                    ? Number(value['00200011'].Value[0])
                    : value['00200011'] && value['00200011'].Value && value['00200011'].Value[0]
                    ? value['00200011'].Value[0]
                    : 0,
                significanceOrder: seriesSignificanceMap[value['0020000E'].Value[0]]
                  ? seriesSignificanceMap[value['0020000E'].Value[0]]
                  : undefined,
              }));
              resolve(result);
            })
            .catch((error) => {
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
      .then((result) => reply.code(200).send(result))
      .catch((err) => reply.send(err));
  });

  // regular/first source is pacs
  // vna is archive
  fastify.decorate(
    'queryQIDO',
    (subPath) =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .get(`${config.dicomWebConfig.qidoSubPath}${subPath}`, mainHeader)
            .then((response) => {
              if (response.status === 200) resolve({ source: 'pacs', response });
              else if (this.archiveRequest) {
                this.archiveRequest
                  .get(`${config.archiveDicomWebConfig.qidoSubPath}${subPath}`, archiveHeader)
                  .then((archiveResponse) =>
                    resolve({ source: 'archive', response: archiveResponse })
                  );
              } else {
                // if there is no archive available just return what we have
                resolve({ source: 'pacs', response });
              }
            });
        } catch (err) {
          reject(
            new InternalError(`Error querying request for subpath (${subPath}) for images`, err)
          );
        }
      })
  );

  // TODO! query input param not used
  fastify.decorate(
    'getSeriesImagesInternal',
    (params) =>
      new Promise((resolve, reject) => {
        try {
          // Get sectra, then vna with qidoSubPath
          fastify
            .queryQIDO(
              `/studies/${params.study}/series/${params.series}/instances?includefield=00280008`
            )
            .then(async (res) => {
              // handle success
              // map each instance to epadlite image object
              // get everything that's not PR
              const result = _.chain(res.response.data)
                .filter(
                  (value) =>
                    !(
                      value['00080060'] &&
                      value['00080060'].Value &&
                      value['00080060'].Value[0] &&
                      value['00080060'].Value[0] === 'PR'
                    )
                )
                .map((value) => ({
                  projectID: params.project ? params.project : projectID,
                  patientID:
                    value['00100020'] && value['00100020'].Value
                      ? fastify.replaceNull(value['00100020'].Value[0])
                      : params.subject,
                  studyUID:
                    value['0020000D'] && value['0020000D'].Value
                      ? value['0020000D'].Value[0]
                      : params.study,
                  seriesUID:
                    value['0020000E'] && value['0020000E'].Value
                      ? value['0020000E'].Value[0]
                      : params.series,
                  imageUID:
                    value['00080018'] && value['00080018'].Value ? value['00080018'].Value[0] : '',
                  classUID:
                    value['00080016'] && value['00080016'].Value ? value['00080016'].Value[0] : '',
                  insertDate: '', // no date in studies call
                  imageDate: '', // TODO
                  sliceLocation: '', // TODO
                  instanceNumber: Number(
                    value['00200013'] && value['00200013'].Value ? value['00200013'].Value[0] : '1'
                  ),
                  losslessImage: '', // TODO
                  // lossyImage: `${config.dicomWebConfig.qidoSubPath}/studies/${params.study}/series/${params.series}/instances/${
                  //   value['00080018'].Value[0]
                  // }`,
                  // send wado-uri instead of wado-rs
                  // Send the source when generating url
                  lossyImage: fastify.getWadoPath(
                    params.study,
                    params.series,
                    value['00080018'].Value[0],
                    res.source
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
                }))
                .sortBy('instanceNumber')
                .value();
              resolve(result);
            })
            .catch((error) => {
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
    // Define request according to params.source
    fastify
      .getWadoInternal({
        study: request.query.studyUID,
        series: request.query.seriesUID,
        image: request.query.objectUID,
        source: request.params.source,
      })
      .then((result) => {
        reply.headers(result.headers);
        reply.code(200).send(result.data);
      })
      .catch((err) => reply.send(new InternalError('WADO', err)));
  });

  fastify.decorate('getWadoRS', (request, reply) => {
    try {
      // Define request according to params.source
      (request.params.source === 'archive' && this.archiveRequest
        ? this.archiveRequest.get(
            `${config.archiveDicomWebConfig.wadoSubPath}/studies/${request.params.study}/series/${
              request.params.series
            }/instances/${request.params.instance}${
              request.params.frame ? `/frames/${request.params.frame}` : ''
            }`,
            {
              responseType: 'stream',
              ...(config.archiveDicomWebConfig.requireJSONHeader
                ? { headers: { accept: '*/*' } }
                : {}),
            }
          )
        : this.request.get(
            `${config.dicomWebConfig.wadoSubPath}/studies/${request.params.study}/series/${
              request.params.series
            }/instances/${request.params.instance}${
              request.params.frame ? `/frames/${request.params.frame}` : ''
            }`,
            {
              responseType: 'stream',
              ...(config.archiveDicomWebConfig.requireJSONHeader
                ? { headers: { accept: '*/*' } }
                : {}),
            }
          )
      )
        .then((result) => {
          reply.headers(result.headers);
          reply.code(200).send(result.data);
        })
        .catch((err) => reply.send(new InternalError('WADORS', err)));
    } catch (err) {
      reply.send(new InternalError('WADORS', err));
    }
  });

  fastify.decorate('getWadoRSMetadata', async (request, reply) => {
    try {
      this.request
        .get(
          `${config.dicomWebConfig.qidoSubPath}/studies/${request.params.study}/series/${request.params.series}/instances/${request.params.instance}/metadata`,
          mainHeader
        )
        .then((response) => {
          console.log('metadata', response.data);
          reply.send(response.data);
        })
        .catch((err) => {
          console.log(err);
          reply.send(err);
        });
    } catch (err) {
      reply.send(new InternalError('WADO', err));
    }
  });

  // TODO I added WADO just for keeping support, not sure if headers are an issue like in WADORS
  fastify.decorate('getWadoInternal', (params) =>
    params.source === 'archive' && this.archiveRequest
      ? this.archiveRequest.get(
          `${config.archiveDicomWebConfig.wadoSubPath}/?requestType=WADO&studyUID=${params.study}&seriesUID=${params.series}&objectUID=${params.image}`,
          { ...archiveHeader, responseType: 'stream' }
        )
      : this.request.get(
          `${config.dicomWebConfig.wadoSubPath}/?requestType=WADO&studyUID=${params.study}&seriesUID=${params.series}&objectUID=${params.image}`,
          { ...mainHeader, responseType: 'stream' }
        )
  );

  fastify.decorate('getPatient', (request, reply) => {
    fastify
      .getPatientsInternal(request.params, [request.params.subject], request.epadAuth)
      .then((result) => {
        if (result.length === 1) reply.code(200).send(result[0]);
        else {
          reply.send(new ResourceNotFoundError('Subject', request.params.subject));
        }
      })
      .catch((err) => reply.code(503).send(err.message));
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
    (params) =>
      new Promise((resolve, reject) => {
        try {
          this.request
            .get(
              `/studies/${params.study}/series/${params.series}/instances/${params.instance}/metadata`,
              mainHeader
            )
            .then(async (response) => {
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
            .catch((error) => {
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
    fastify.addHook('onClose', (_instance, done) => {
      if (config.env === 'test') {
        // TODO logout from dicomwebserver
        done();
      }
    });
  });
}
// expose as plugin so the module using it can access the decorated methods
module.exports = fp(dicomwebserver);
