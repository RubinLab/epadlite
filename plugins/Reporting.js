/* eslint-disable no-async-promise-executor */
const fp = require('fastify-plugin');
const _ = require('lodash');

const { InternalError } = require('../utils/EpadErrors');
const EpadNotification = require('../utils/EpadNotification');
const { renderTable } = require('../utils/recist');
const config = require('../config/index');

async function reporting(fastify) {
  fastify.decorate('numOfLongitudinalHeaderCols', 2);

  fastify.decorate('checkForShapes', (markupEntityArray, shapes) => {
    // first normalize the shapes to handle different versions of the shape names
    const normShapes = [];
    shapes.forEach((shape) => {
      switch (shape.toLowerCase()) {
        case 'line':
        case 'multipoint':
          normShapes.push('multipoint');
          break;
        case 'arrow':
          normShapes.push('multipoint#arrow');
          break;
        case 'poly':
        case 'polygon':
        case 'polyline':
          normShapes.push('polyline');
          break;
        case 'spline':
          normShapes.push('spline');
          break;
        case 'circle':
          normShapes.push('circle');
          break;
        case 'point':
          normShapes.push('point');
          break;
        case 'normal':
        case 'ellipse':
          normShapes.push('ellipse');
          break;
        default:
          break;
      }
    });
    for (let i = 0; i < markupEntityArray.length; i += 1) {
      for (let j = 0; j < normShapes.length; j += 1) {
        const normShape = normShapes[j].toLowerCase().split('#');
        // lineStyle can be Arrow
        // filter line should see if multipoint and no linestyle (or not arrow)
        if (
          markupEntityArray[i][`xsi:type`].toLowerCase().includes(normShape[0]) &&
          ((normShape.length === 1 && !markupEntityArray[i].lineStyle) ||
            (markupEntityArray[i].lineStyle &&
              normShape.length > 1 &&
              markupEntityArray[i].lineStyle.toLowerCase() === normShape[1]))
        )
          return true;
      }
    }
    return false;
  });

  fastify.decorate('formJsonObj', (value, code) => {
    let obj = value ? { value } : { value: '' };
    if (code) obj = { ...obj, code };
    return obj;
  });

  fastify.decorate('fillColumn', (row, column, aimRefValue, aimRefCode) => {
    if (column in row) {
      try {
        // eslint-disable-next-line no-param-reassign
        row[column] = fastify.formJsonObj(aimRefValue, aimRefCode);
      } catch (err) {
        fastify.log.warn(`The value for ${column} couldn't be retrieved ${err.message}`);
      }
    }
  });

  fastify.decorate('fillTable', (aimJSONs, template, columns, shapesIn) => {
    try {
      // TODO handle multiple templates (decided not to do it for now)
      const shapes = typeof shapesIn === 'string' ? shapesIn.split(',') : shapesIn;
      const table = [];
      const rowTemplate = {};
      // make sure they are lower case and has value
      for (let i = 0; i < columns.length; i += 1) {
        rowTemplate[columns[i].toLowerCase()] = '';
      }
      if (aimJSONs.length === 0) return table;
      for (let i = 0; i < aimJSONs.length; i += 1) {
        const row = { ...rowTemplate };
        // check the template

        // I already filter it in db but just in case
        if (
          template &&
          aimJSONs[
            i
          ].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code.toLowerCase() !==
            template.toLowerCase()
        ) {
          fastify.log.debug(
            `Aim template is ${aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code} was looking for ${template}`
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        row.template = fastify.formJsonObj(
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0][
            `iso:displayName`
          ].value,
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code
        );

        // check shapes
        if (
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .markupEntityCollection &&
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .markupEntityCollection.MarkupEntity
        ) {
          const markupShapes = aimJSONs[
            i
          ].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection.MarkupEntity.map(
            (me) => me[`xsi:type`]
          );

          // check if the shapes should be filter and if the aim matches the filter
          if (shapes && shapes.length > 0) {
            if (
              !fastify.checkForShapes(
                aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .markupEntityCollection.MarkupEntity,
                shapes
              )
            ) {
              fastify.log.warn(
                `Aim shape is ${JSON.stringify(markupShapes)} was looking for ${JSON.stringify(
                  shapes
                )}`
              );
              // eslint-disable-next-line no-continue
              continue;
            }
          }

          // put shape in values
          row.shapes = fastify.formJsonObj(markupShapes);
        }

        // get generic fields
        fastify.fillColumn(
          row,
          'studydate',
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startDate.value
        );

        fastify.fillColumn(
          row,
          'name',
          aimJSONs[
            i
          ].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split('~')[0]
        );

        fastify.fillColumn(
          row,
          'studyuid',
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root
        );

        fastify.fillColumn(
          row,
          'seriesuid',
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .instanceUid.root
        );

        fastify.fillColumn(
          row,
          'modality',
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries.modality[
            `iso:displayName`
          ].value,
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries.modality
            .code
        );

        fastify.fillColumn(
          row,
          'aimuid',
          aimJSONs[i].ImageAnnotationCollection.uniqueIdentifier.root
        );

        if (
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .trackingUniqueIdentifier
        )
          fastify.fillColumn(
            row,
            'trackinguniqueidentifier',
            aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .trackingUniqueIdentifier.root
          );

        // observation entities
        if (
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection
        ) {
          const ioes =
            aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .imagingObservationEntityCollection.ImagingObservationEntity;
          ioes.forEach((ioe) => {
            // imagingObservationEntity can have both imagingObservationEntityCharacteristic and imagingPhysicalEntityCharacteristic
            if (ioe.label.value.toLowerCase() in row) {
              row[ioe.label.value.toLowerCase()] = fastify.formJsonObj(
                ioe.typeCode[0][`iso:displayName`].value,
                ioe.typeCode[0].code
              );
            }
            if (ioe.imagingObservationCharacteristicCollection) {
              const iocs =
                ioe.imagingObservationCharacteristicCollection.ImagingObservationCharacteristic;
              iocs.forEach((ioc) => {
                if (ioc.label.value.toLowerCase() in row) {
                  if (
                    ioc.characteristicQuantificationCollection &&
                    ioc.characteristicQuantificationCollection.CharacteristicQuantification.length >
                      0
                  ) {
                    const iocq =
                      ioc.characteristicQuantificationCollection.CharacteristicQuantification[0];
                    row[ioc.label.value.toLowerCase()] = fastify.formJsonObj(
                      iocq.value.value,
                      ioc.typeCode[0].code
                    );
                  } else {
                    row[ioc.label.value.toLowerCase()] = fastify.formJsonObj(
                      ioc.typeCode[0][`iso:displayName`].value,
                      ioc.typeCode[0].code
                    );
                  }
                }
              });
            }
            let ipcs = [];
            if (ioe.imagingPhysicalEntityCharacteristicCollection) {
              ipcs =
                ioe.imagingPhysicalEntityCharacteristicCollection
                  .ImagingPhysicalEntityCharacteristic;
              ipcs.forEach((ipc) => {
                if (ipc.label.value.toLowerCase() in row) {
                  row[ipc.label.value.toLowerCase()] = fastify.formJsonObj(
                    ipc.typeCode[0][`iso:displayName`].value,
                    ipc.typeCode[0].code
                  );
                }
              });
            }
          });
        }

        // physical entities
        if (
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingPhysicalEntityCollection
        ) {
          let ipes = [];
          if (
            Array.isArray(
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .imagingPhysicalEntityCollection.ImagingPhysicalEntity
            )
          ) {
            ipes =
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .imagingPhysicalEntityCollection.ImagingPhysicalEntity;
          } else {
            ipes.push(
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .imagingPhysicalEntityCollection.ImagingPhysicalEntity
            );
          }
          ipes.forEach((ipe) => {
            if (ipe.label.value.toLowerCase() in row) {
              row[ipe.label.value.toLowerCase()] = fastify.formJsonObj(
                ipe.typeCode[0][`iso:displayName`].value,
                ipe.typeCode[0].code
              );
            }
            if (ipe.imagingPhysicalEntityCharacteristicCollection) {
              const ipcs =
                ipe.imagingPhysicalEntityCharacteristicCollection
                  .ImagingPhysicalEntityCharacteristic;
              ipcs.forEach((ipc) => {
                if (ipc.label.value.toLowerCase() in row) {
                  row[ipc.label.value.toLowerCase()] = fastify.formJsonObj(
                    ipc.typeCode[0][`iso:displayName`].value,
                    ipc.typeCode[0].code
                  );
                }
              });
            }
          });
        }

        // TODO test look through questions
        if (
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .questionCollection
        ) {
          let qs = [];
          if (
            Array.isArray(
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .questionCollection.Question
            )
          ) {
            qs =
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .questionCollection.Question;
          } else {
            qs.push(
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .questionCollection.Question
            );
          }
          qs.forEach((q) => {
            if (q.question.value.toLowerCase() in row) {
              row[q.question.value.toLowerCase()] = fastify.formJsonObj(q.answer.value);
            }
          });
        }

        // calculations
        let hasCalcs = false;
        if ('allcalc' in row) row.allcalc = {};
        if (
          aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .calculationEntityCollection
        ) {
          let calcs = [];
          if (
            Array.isArray(
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .calculationEntityCollection.CalculationEntity
            )
          ) {
            calcs =
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .calculationEntityCollection.CalculationEntity;
          } else {
            calcs.push(
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                .calculationEntityCollection.CalculationEntity
            );
          }
          // eslint-disable-next-line no-loop-func
          calcs.forEach((calc) => {
            // if it is a very old annotation and the line length is saved as LineLength handle that
            if (
              (calc.description.value.toLowerCase() in row ||
                ('length' in row && calc.description.value.toLowerCase() === 'linelength') ||
                'allcalc' in row) &&
              calc.calculationResultCollection &&
              calc.calculationResultCollection.CalculationResult[0]
            ) {
              const calcResult = calc.calculationResultCollection.CalculationResult[0];
              if (calcResult['xsi:type'] === 'CompactCalculationResult') {
                let { value } = calcResult.value;
                if (value == null || value.trim() === '') value = '0';
                if (calcResult.unitOfMeasure.value === 'mm') value = `${parseFloat(value) / 10}`;
                if ('allcalc' in row) {
                  // get the last type to support attenuation coefficient/mean and also for suv
                  row.allcalc[calc.description.value.toLowerCase()] = fastify.formJsonObj(
                    value,
                    calc.typeCode[calc.typeCode.length - 1].code
                  );
                }

                if ('length' in row && calc.description.value.toLowerCase() === 'linelength')
                  row.length = fastify.formJsonObj(value, 'RID39123');
                else if (calc.description.value.toLowerCase() in row) {
                  // get the last type to support attenuation coefficient/mean and also for suv
                  row[calc.description.value.toLowerCase()] = fastify.formJsonObj(
                    value,
                    calc.typeCode[calc.typeCode.length - 1].code
                  );
                }
                hasCalcs = true;
              } else if (calcResult['xsi:type'] === 'ExtendedCalculationResult') {
                let { value } = calcResult.calculationDataCollection.CalculationData[0].value;
                if (value == null || value.trim() === '') value = '0';
                if (calcResult.unitOfMeasure.value === 'mm') value = `${parseFloat(value) / 10}`;
                if ('allcalc' in row) {
                  // get the last type to support attenuation coefficient/mean and also for suv
                  row.allcalc[calc.description.value.toLowerCase()] = fastify.formJsonObj(
                    value,
                    calc.typeCode[calc.typeCode.length - 1].code
                  );
                }

                if ('length' in row && calc.description.value.toLowerCase() === 'linelength')
                  row.length = fastify.formJsonObj(value, 'RID39123');
                else if (calc.description.value.toLowerCase() in row) {
                  // get the last type to support attenuation coefficient/mean and also for suv
                  row[calc.description.value.toLowerCase()] = fastify.formJsonObj(
                    value,
                    calc.typeCode[calc.typeCode.length - 1].code
                  );
                }
                hasCalcs = true;
              }
            }
          });
        }
        if (hasCalcs) {
          // row is ready, see if the aim have multiple users
          // if multiple users duplicate the row for each user
          const users = fastify.getAuthorUsernames(aimJSONs[i]);

          users.forEach((user) => {
            const newRow = { ...row };
            fastify.fillColumn(newRow, 'username', user);
            table.push(newRow);
          });
        }
      }
      return table;
    } catch (err) {
      fastify.log.error(
        `Error during filling table for ${template}, ${columns}, ${shapesIn} and ${aimJSONs.length}. Error: ${err.message}`
      );
      console.log(err);
    }
    return [];
  });

  fastify.decorate('getRecist', (aimJSONs, request, collab, epadAuth) => {
    try {
      const table = fastify.fillTable(aimJSONs, 'RECIST', [
        'Name',
        'StudyDate',
        'Lesion',
        'Type',
        'Location',
        'Length',
        'StudyUID',
        'SeriesUID',
        'AimUID',
        'LongAxis',
        'ShortAxis',
        'Modality',
        'Trial',
        'Trial Arm',
        'Trial CaseID',
        'TrackingUniqueIdentifier',
        'Username',
      ]);
      const tableV2 = fastify.fillTable(aimJSONs, 'RECIST_v2', [
        'Name',
        'StudyDate',
        'Timepoint',
        'Type',
        'Lesion Status',
        'Location',
        'Length',
        'StudyUID',
        'SeriesUID',
        'AimUID',
        'LongAxis',
        'ShortAxis',
        'Modality',
        'Trial',
        'Trial Arm',
        'Trial CaseID',
        'TrackingUniqueIdentifier',
        'Username',
      ]);

      const lesions = table.concat(tableV2);
      const targetTypes = ['target', 'target lesion', 'resolved lesion'];
      const users = {};

      // first pass fill in the lesion names and study dates (x and y axis of the table)
      for (let i = 0; i < lesions.length; i += 1) {
        // check if the user is a collaborator
        // if so only get his/her username, ignore the rest
        const username = lesions[i].username.value;
        if (collab && username !== epadAuth.username) {
          fastify.log.warn(
            `Ignoring ${username}'s annotations for collaborator ${epadAuth.username}`
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        if (!users[username]) {
          users[username] = {
            tLesionNames: [],
            studyDates: [],
            ntLesionNames: [],
            ntNewLesionStudyDates: [],
            tTrackingUIDs: [],
            ntTrackingUIDs: [],
            lesions: [],
            lesionWTrackingUIDCount: 0,
          };
        }
        const lesionName = lesions[i].name.value.toLowerCase();
        const studyDate = lesions[i].studydate.value;
        const trackingUID = lesions[i].trackinguniqueidentifier
          ? lesions[i].trackinguniqueidentifier.value
          : undefined;
        const type = lesions[i].type.value.toLowerCase();
        if (!users[username].studyDates.includes(studyDate))
          users[username].studyDates.push(studyDate);
        if (targetTypes.includes(type.toLowerCase())) {
          if (!users[username].tLesionNames.includes(lesionName))
            users[username].tLesionNames.push(lesionName);
          if (trackingUID && !users[username].tTrackingUIDs.includes(trackingUID))
            users[username].tTrackingUIDs.push(trackingUID);
        } else {
          if (!users[username].ntLesionNames.includes(lesionName))
            users[username].ntLesionNames.push(lesionName);
          if (trackingUID && !users[username].ntTrackingUIDs.includes(trackingUID))
            users[username].ntTrackingUIDs.push(trackingUID);
        }
        users[username].lesions.push(lesions[i]);
        if (trackingUID) {
          users[username].lesionWTrackingUIDCount += 1;
        }
      }
      const rrUsers = {};
      const usernames = Object.keys(users);
      for (let u = 0; u < usernames.length; u += 1) {
        // sort lists
        users[usernames[u]].tLesionNames.sort();
        users[usernames[u]].studyDates.sort();
        users[usernames[u]].ntLesionNames.sort();

        let mode = 'name';
        let tIndex = users[usernames[u]].tLesionNames;
        let ntIndex = users[usernames[u]].ntLesionNames;
        if (
          users[usernames[u]].lesionWTrackingUIDCount === users[usernames[u]].lesions.length &&
          users[usernames[u]].lesions.length > 0
        ) {
          fastify.log.info('We have tracking UIDs for all lesions using tracking UIDs');
          mode = 'trackingUID';
          tIndex = users[usernames[u]].tTrackingUIDs;
          ntIndex = users[usernames[u]].ntTrackingUIDs;
        }

        if (
          users[usernames[u]].tLesionNames.length > 0 &&
          users[usernames[u]].studyDates.length > 0
        ) {
          // fill in the table for target lesions
          const target = fastify.fillReportTable(
            tIndex,
            users[usernames[u]].studyDates,
            users[usernames[u]].lesions,
            targetTypes,
            mode
          );
          // fill in the table for non-target lesions
          const nonTargetTypes = ['non-target', 'nontarget', 'non-cancer lesion', 'new lesion'];

          const nonTarget = fastify.fillReportTable(
            ntIndex,
            users[usernames[u]].studyDates,
            users[usernames[u]].lesions,
            nonTargetTypes,
            mode
          );

          if ((target.errors.length > 0 || nonTarget.errors.length > 0) && request)
            new EpadNotification(
              request,
              'Report generated with errors',
              new Error(target.errors.concat(nonTarget.errors).join('.')),
              false
            ).notify(fastify);
          for (let i = 0; i < nonTarget.table.length; i += 1) {
            for (let j = 0; j < users[usernames[u]].studyDates.length; j += 1) {
              if (
                nonTarget.table[i][j + 3] != null &&
                nonTarget.table[i][j + 3].trim().toLowerCase() === 'new lesion' &&
                !users[usernames[u]].ntNewLesionStudyDates.includes(
                  users[usernames[u]].studyDates[j]
                )
              ) {
                users[usernames[u]].ntNewLesionStudyDates.push(users[usernames[u]].studyDates[j]);
              }
            }
          }

          const isThereNewLesion = [];
          if (users[usernames[u]].ntNewLesionStudyDates.length > 0) {
            for (let i = 0; i < users[usernames[u]].ntNewLesionStudyDates.length; i += 1)
              isThereNewLesion[
                users[usernames[u]].studyDates.indexOf(users[usernames[u]].ntNewLesionStudyDates[i])
              ] = true;
          }

          // calculate the sums first
          const tSums = fastify.calcSums(target.table, target.timepoints);
          // calculate the rrs
          const tRRBaseline = fastify.calcRRBaseline(tSums, target.timepoints);
          const tRRMin = fastify.calcRRMin(tSums, target.timepoints);
          // starting from version 1 we are using baseline instead of rrmin unless config.RCFromRRMin is set to true
          const responseCats = fastify.calcResponseCat(
            config.RCFromRRMin ? tRRMin : tRRBaseline,
            target.timepoints,
            isThereNewLesion,
            tSums
          );
          // check for the reappear. we just have reappear in nontarget right now
          // if the previous was CR, and there is a reappear it is PD
          for (let i = 0; i < responseCats.length; i += 1) {
            if (
              responseCats[i] != null &&
              responseCats[i].toUpperCase() === 'CR' &&
              i < responseCats.length - 1 &&
              users[usernames[u]].ntLesionNames.length > 0
            ) {
              // this is cr, find the next timepoint
              // stop looking if the timepoint is greater than +1
              for (let k = i + 1; k < target.timepoints.length; k += 1) {
                if (target.timepoints[k] === target.timepoints[i] + 1) {
                  // see for all the nontarget lesions
                  for (let j = 0; j < nonTarget.table.length; j += 1) {
                    if (
                      nonTarget.table[j][k] != null &&
                      nonTarget.table[j][k].toLowerCase().includes('reappeared')
                    )
                      responseCats[k] = 'PD';
                  }
                } else if (target.timepoints[k] > target.timepoints[i] + 1) {
                  break;
                }
              }
            }
          }

          if (
            users[usernames[u]].ntLesionNames.length > 0 &&
            users[usernames[u]].studyDates.length > 0
          ) {
            const rr = {
              tLesionNames: users[usernames[u]].tLesionNames,
              studyDates: users[usernames[u]].studyDates,
              tTable: target.table,
              tSums: fastify.cleanArray(tSums),
              tRRBaseline: fastify.cleanArray(tRRBaseline),
              tRRMin: fastify.cleanArray(tRRMin),
              tResponseCats: fastify.cleanArray(responseCats),
              tUIDs: target.UIDs,
              tErrors: target.errors,
              stTimepoints: target.timepoints,
              tTimepoints: fastify.cleanConsecutives(target.timepoints),
              ntLesionNames: users[usernames[u]].ntLesionNames,
              ntTable: nonTarget.table,
              ntUIDs: nonTarget.UIDs,
              ntErrors: nonTarget.errors,
            };
            rrUsers[usernames[u]] = rr;
          } else {
            const rr = {
              tLesionNames: users[usernames[u]].tLesionNames,
              studyDates: users[usernames[u]].studyDates,
              tTable: target.table,
              tSums: fastify.cleanArray(tSums),
              tRRBaseline: fastify.cleanArray(tRRBaseline),
              tRRMin: fastify.cleanArray(tRRMin),
              tResponseCats: fastify.cleanArray(responseCats),
              tUIDs: target.UIDs,
              tErrors: target.errors,
              stTimepoints: target.timepoints,
              tTimepoints: fastify.cleanConsecutives(target.timepoints),
            };
            rrUsers[usernames[u]] = rr;
          }
        }
      }
      if (Object.keys(rrUsers).length > 0) return rrUsers;
      fastify.log.info(`no target lesion in table ${table}`);

      return null;
    } catch (err) {
      fastify.log.error(
        `Error generating recist report for ${aimJSONs.length} Error: ${err.message}`
      );
    }
    return null;
  });

  /**
   * calculate sums of lesion dimensions for each timepoint
   * @param table
   * @param timepoints. timepoints should start from 0 and be continuous but timepoint can repeat(they need to be adjacent)
   * @return it will return the sums for each timepoint. if the timepoint is listed twice. it will have the same amount twice
   */
  fastify.decorate('calcSums', (table, timepoints, metric) => {
    const sums = [];
    for (let i = 0; i < timepoints.length; i += 1) sums.push(0.0);
    const numOfHeaderCols = metric && metric !== 'RECIST' ? fastify.numOfLongitudinalHeaderCols : 3;
    for (let k = 0; k < table[0].length - numOfHeaderCols; k += 1) {
      sums[k] = 0.0;
      fastify.log.debug(`k is ${k}`);
      let j = k;
      for (j = k; j < table[0].length - numOfHeaderCols; j += 1) {
        fastify.log.debug(`j is ${j}`);
        if (timepoints[j] === timepoints[k]) {
          if (j !== k) sums[j] = null;

          for (let i = 0; i < table.length; i += 1) {
            let cell = table[i][j + numOfHeaderCols];
            if (metric) {
              cell = cell[metric] ? cell[metric].value : 'NaN';
            }
            const cellValue = Number.parseFloat(cell);
            if (!Number.isNaN(cellValue)) {
              sums[k] += cellValue;
            } else {
              fastify.log.debug(`Couldn't convert to double value=${cell}`);
            }
          }
        } else {
          // break if you see any other timepoint and skip the columns already calculated
          break;
        }
      }
      k = j - 1;
      fastify.log.debug(`jumping to ${k + 1}`);
    }
    for (let i = 0; i < sums.length; i += 1) fastify.log.debug(`sum ${i} ${sums[i]}`);
    return sums;
  });

  /**
   * calculate response rates in reference to baseline (first)
   * @param sums
   * @return
   */
  fastify.decorate('calcRRBaseline', (sums, timepoints, abs = false) => {
    let baseline = sums[0];
    const rrBaseline = [];
    const rrBaselineAbs = [];
    for (let i = 0; i < timepoints.length; i += 1) rrBaseline.push(0.0);
    for (let i = 0; i < sums.length; i += 1) {
      if (sums[i] != null) {
        if (timepoints[i] != null && timepoints[i] === 0) {
          baseline = sums[i];
          fastify.log.debug(`baseline changed. New baseline is:${i}`);
        }
        if (baseline === 0) {
          fastify.log.debug('baseline is 0. returning 999999.9 for rr');
          rrBaseline[i] = 999999.9;
          rrBaselineAbs[i] = 0;
        } else {
          rrBaseline[i] = ((sums[i] - baseline) * 100.0) / baseline;
          rrBaselineAbs[i] = sums[i] - baseline;
        }
      }
    }
    if (abs) return { rr: rrBaseline, rrAbs: rrBaselineAbs };
    return rrBaseline;
  });

  /**
   * calculate response rates in reference to the current baseline and current min.
   * at the baseline min=baseline=0
   * till I reach min use baseline as the reference after that use min
   * CORRECTION: rr from min should use min only after it starts increasing
   * it also handles multiple baselines and gets the latest
   * needs timepoints for that
   * @param sums
   * @param timepoints
   * @return
   */
  fastify.decorate('calcRRMin', (sums, timepoints, abs = false) => {
    let min = sums[0];
    fastify.log.debug(`Min is ${min}`);
    const rr = [];
    const rrAbs = [];
    for (let i = 0; i < timepoints.length; i += 1) rr.push(0.0);
    for (let i = 0; i < sums.length; i += 1) {
      if (sums[i] != null) {
        if (timepoints[i] != null && timepoints[i] === 0) {
          min = sums[i];
          fastify.log.debug(`Min changed. New baseline.min is:${min}`);
        }
        if (min === 0) {
          fastify.log.debug('min is 0. returning 999999.9 for rr');
          rr[i] = 999999.9;
          rrAbs[i] = 0;
        } else {
          rr[i] = ((sums[i] - min) * 100.0) / min;
          rrAbs[i] = sums[i] - min;
        }
        if (sums[i] < min) {
          let j = 1;
          // skip nulls
          while (i + j < sums.length && sums[i + j] == null) {
            j += 1;
          }
          if (i + j < sums.length && sums[i + j] != null && sums[i + j] > sums[i]) {
            min = sums[i];
            fastify.log.debug(`Min changed. Smaller rr. min is:${min}`);
          }
        }
      }
    }
    if (abs) return { rr, rrAbs };
    return rr;
  });

  /**
   * calculates the response categories using rr array, timepoints and isThereNewLesion boolean array
   * if isThereNewLesion is null it won't handle the PD properly
   * @param rr
   * @param timepoints
   * @param isThereNewLesion
   * @return
   */
  fastify.decorate('calcResponseCat', (rr, timepoints, isThereNewLesion, sums) => {
    const responseCats = [];
    for (let i = 0; i < rr.length; i += 1) {
      if (rr[i] != null) {
        if (i === 0 || (timepoints[i] != null && timepoints[i] === 0)) {
          responseCats.push('BL');
        } else if (
          rr[i] >= 20 ||
          (isThereNewLesion != null && isThereNewLesion[i] != null && isThereNewLesion[i] === true)
        ) {
          responseCats.push('PD'); // progressive
        } else if (sums[i] === 0) {
          responseCats.push('CR'); // complete response
        } else if (rr[i] <= -30) {
          responseCats.push('PR'); // partial response
        } else {
          responseCats.push('SD'); // stable disease
        }
      }
    }
    return responseCats;
  });

  fastify.decorate('cleanArray', (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += 1)
      if (arr[i] !== undefined && arr[i] != null) {
        out.push(arr[i]);
      }
    return out;
  });

  fastify.decorate('cleanConsecutives', (arr) => {
    if (!arr) return null;
    const out = [];
    for (let i = 0; i < arr.length; i += 1)
      if (i === 0 || (i > 0 && arr[i] !== arr[i - 1])) {
        out.push(arr[i]);
      }
    return out;
  });

  fastify.decorate(
    'getLongitudinal',
    async (aims, template, shapes, request, metric = true, html = false, collab, epadAuth) => {
      try {
        const lesions = fastify.fillTable(
          aims,
          template,
          [
            'Name',
            'StudyDate',
            'StudyUID',
            'SeriesUID',
            'AimUID',
            'AllCalc',
            'Timepoint',
            'Lesion',
            'Modality',
            'Location',
            'Template',
            'Shapes',
            'TrackingUniqueIdentifier',
            'Username',
          ],
          shapes
        );
        if (lesions.length === 0) return null;
        // get targets
        const users = {};
        // first pass fill in the lesion names and study dates (x and y axis of the table)
        for (let i = 0; i < lesions.length; i += 1) {
          // check if the user is a collaborator
          // if so only get his/her username, ignore the rest
          const username = lesions[i].username.value;
          if (collab && username !== epadAuth.username) {
            fastify.log.warn(
              `Ignoring ${username}'s annotations for collaborator ${epadAuth.username}`
            );
            // eslint-disable-next-line no-continue
            continue;
          }

          if (!users[username]) {
            users[username] = {
              tLesionNames: [],
              studyDates: [],
              lesions: [],
              tTrackingUIDs: [],
              lesionWTrackingUIDCount: 0,
            };
          }
          const lesionName = lesions[i].name.value.toLowerCase();
          const studyDate = lesions[i].studydate.value;
          const trackingUID = lesions[i].trackinguniqueidentifier
            ? lesions[i].trackinguniqueidentifier.value
            : undefined;
          if (!users[username].studyDates.includes(studyDate))
            users[username].studyDates.push(studyDate);
          if (!users[username].tLesionNames.includes(lesionName))
            users[username].tLesionNames.push(lesionName);
          if (trackingUID && !users[username].tTrackingUIDs.includes(trackingUID))
            users[username].tTrackingUIDs.push(trackingUID);
          if (trackingUID) {
            users[username].lesionWTrackingUIDCount += 1;
          }
          users[username].lesions.push(lesions[i]);
        }
        let rrUsers = {};
        const usernames = Object.keys(users);
        for (let u = 0; u < usernames.length; u += 1) {
          // sort lists
          users[usernames[u]].tLesionNames.sort();
          users[usernames[u]].studyDates.sort();

          const mode = 'name';
          const tIndex = users[usernames[u]].tLesionNames;
          // ignoring tracking uids for longitudinal. as it's not common to use select baseline for non-recist lesions and we put tracking uids on every annotation which messes up reports
          // if (
          //   users[usernames[u]].lesionWTrackingUIDCount === users[usernames[u]].lesions.length &&
          //   users[usernames[u]].lesions.length > 0
          // ) {
          //   fastify.log.info('We have tracking UIDs for all lesions using tracking UIDs');
          //   mode = 'trackingUID';
          //   tIndex = users[usernames[u]].tTrackingUIDs;
          // }
          if (
            users[usernames[u]].tLesionNames.length > 0 &&
            users[usernames[u]].studyDates.length > 0
          ) {
            // fill in the table for target lesions
            const { table, UIDs, timepoints, errors } = fastify.fillReportTable(
              tIndex,
              users[usernames[u]].studyDates,
              users[usernames[u]].lesions,
              undefined, // no type filtering
              mode,
              fastify.numOfLongitudinalHeaderCols,
              metric,
              false
            );

            if (errors.length > 0 && request)
              new EpadNotification(
                request,
                'Report generated with errors',
                new Error(errors.join('.')),
                false
              ).notify(fastify);

            const rr = {
              tLesionNames: tIndex,
              studyDates: users[usernames[u]].studyDates,
              tTable: table,
              tUIDs: UIDs,
              stTimepoints: timepoints,
              tTimepoints: fastify.cleanConsecutives(timepoints),
              tErrors: errors,
            };
            rrUsers[usernames[u]] = rr;
          }
        }
        if (Object.keys(rrUsers).length > 0) {
          // if there is metric and no data for a lesion (for that metric or none) on all timepoints. ignore that lesion
          if (metric && metric !== true) rrUsers = fastify.removeNALesions(rrUsers, metric);
          if (!html) return rrUsers;
          // let filter = 'report=Longitudinal';
          let loadFilter = metric !== true ? `metric=${metric}` : '';
          if (template != null) loadFilter += `&templatecode=${template}`;
          const htmlText = await renderTable(
            1,
            request.params.subject,
            request.params.project,
            'Longitudinal',
            rrUsers[request.query.user],
            fastify.numOfLongitudinalHeaderCols,
            [],
            loadFilter,
            1,
            false
          );
          return htmlText;
        }
        fastify.log.info(`no target lesion in table ${lesions}`);
        return null;
      } catch (err) {
        fastify.log.error(
          `Error generating longitudinal report for ${aims.length} Error: ${err.message}`
        );
      }
      return null;
    }
  );

  fastify.decorate('removeNALesions', (rrUsers, metric) => {
    try {
      // for each user
      const users = Object.keys(rrUsers);
      for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
        const rowsToDelete = [];
        // get tTable
        for (let i = 0; i < rrUsers[users[userIndex]].tTable.length; i += 1) {
          let numOfVals = 0;
          for (
            let j = fastify.numOfLongitudinalHeaderCols;
            j < rrUsers[users[userIndex]].tTable[i].length;
            j += 1
          ) {
            if (
              rrUsers[users[userIndex]].tTable[i][j] &&
              rrUsers[users[userIndex]].tTable[i][j] !== {} &&
              rrUsers[users[userIndex]].tTable[i][j][metric]
            )
              numOfVals += 1;
          }
          // if empty after 2 to the end, we  should remove row
          if (numOfVals === 0) {
            rowsToDelete.push(i);
          }
        }
        for (let k = rowsToDelete.length - 1; k >= 0; k -= 1) {
          // remove from tTable
          rrUsers[users[userIndex]].tTable.splice(rowsToDelete[k], 1);
          // remove from tLesionNames
          rrUsers[users[userIndex]].tLesionNames.splice(rowsToDelete[k], 1);
          // remove from tUIDs
          rrUsers[users[userIndex]].tUIDs.splice(rowsToDelete[k], 1);
        }
      }
    } catch (err) {
      fastify.log.error(`Error removing all NA lesions Error: ${err.message}`);
      throw err;
    }
    return rrUsers;
  });

  fastify.decorate('getLesionIndex', (index, mode, lesion) => {
    switch (mode) {
      case 'trackingUID':
        return index.indexOf(lesion.trackinguniqueidentifier.value);
      default:
        // + name
        return index.indexOf(lesion.name.value.toLowerCase());
    }
  });

  // default is recist with numOfHeaderCols = 3, allCalc = false, nonTarget = true
  // index will be lesionNames and mode will be name by default
  fastify.decorate(
    'fillReportTable',
    (
      index,
      studyDates,
      lesions,
      type,
      mode = 'name',
      numOfHeaderCols = 3,
      allCalc = false,
      nonTarget = true
    ) => {
      try {
        const table = [];
        const row = [];
        for (let i = 0; i < studyDates.length + numOfHeaderCols; i += 1) row.push(null);
        const uidRow = [];
        for (let i = 0; i < studyDates.length; i += 1) uidRow.push(null);

        index.forEach(() => table.push([...row]));

        const UIDs = [];
        index.forEach(() => UIDs.push([...uidRow]));
        const timepoints = [];
        for (let i = 0; i < studyDates.length; i += 1) timepoints.push(null);
        const errors = [];
        let baselineIndex = 0;
        // get the values to the table
        for (let i = 0; i < lesions.length; i += 1) {
          const lesionName = lesions[i].name.value.toLowerCase();
          const studyDate = lesions[i].studydate.value;
          const aimType =
            type && lesions[i].type.value ? lesions[i].type.value.toLowerCase() : 'target'; // just put target if we are not filtering for aimtype
          const location = lesions[i].location.value ? lesions[i].location.value.toLowerCase() : '';
          const statusObject = lesions[i]['lesion status'];
          let aimStatus = null;
          if (statusObject) aimStatus = statusObject.value;

          if (type && !type.includes(aimType.toLowerCase())) {
            // eslint-disable-next-line no-continue
            continue;
          }
          const lesionIndex = fastify.getLesionIndex(index, mode, lesions[i]);
          if (table[lesionIndex][0] !== null && table[lesionIndex][0] !== lesionName) {
            fastify.log.warn(
              `Lesion name at ${studyDate} is different from the same lesion on a different date. The existing one is: ${table[lesionIndex][0]} whereas this is: ${lesionName}`
            );
            errors.push(
              `Lesion name at ${studyDate} is different from the same lesion on a different date. The existing one is: ${table[lesionIndex][0]} whereas this is: ${lesionName}`
            );
          }
          table[lesionIndex][0] = lesionName;

          // check if exists and if different and put warnings.
          // changes anyhow
          let nextCol = 1;
          // hence recist
          if (numOfHeaderCols > 2) {
            if (
              table[lesionIndex][nextCol] != null &&
              table[lesionIndex][nextCol].toLowerCase() !== aimType
            ) {
              fastify.log.warn(
                `Type at date ${studyDate} is different from the same lesion on a different date. The existing one is: ${table[lesionIndex][nextCol]} whereas this is: ${aimType}`
              );
              errors.push(
                `Type at date ${studyDate} is different from the same lesion on a different date. The existing one is: ${table[lesionIndex][nextCol]} whereas this is: ${aimType}`
              );
            }
            table[lesionIndex][nextCol] = aimType;
            nextCol += 1;
          }

          if (
            table[lesionIndex][nextCol] != null &&
            table[lesionIndex][nextCol].toLowerCase() !== location
          ) {
            fastify.log.warn(
              `Location at date ${studyDate} is different from the same lesion on a different date. The existing one is:${table[lesionIndex][nextCol]} whereas this is:${location}`
            );
            errors.push(
              `Location at date ${studyDate} is different from the same lesion on a different date. The existing one is:${table[lesionIndex][nextCol]} whereas this is:${location}`
            );
          }
          table[lesionIndex][nextCol] = location;
          // get the lesion and get the timepoint. if it is integer put that otherwise calculate using study dates
          const tpObj = lesions[i].timepoint ? lesions[i].timepoint : lesions[i].lesion;
          const lesionTimepoint = tpObj && tpObj.value ? tpObj.value : '';
          let timepoint = parseInt(lesionTimepoint, 10);
          if (Number.isNaN(timepoint)) {
            fastify.log.debug(`Trying to get timepoint from text ${lesionTimepoint}`);
            if (lesionTimepoint.toLowerCase().includes('baseline')) {
              timepoint = 0;
            } else {
              timepoint = studyDates.indexOf(studyDate) - baselineIndex;
            }
          }
          if (timepoint === 0) baselineIndex = studyDates.indexOf(studyDate);
          if (
            timepoints[studyDates.indexOf(studyDate)] !== null &&
            timepoints[studyDates.indexOf(studyDate)] !== timepoint
          ) {
            // TODO How to handle timepoint changes? I currently override with the latest for now
            fastify.log.warn(
              `why is the timepoint ${timepoint} different from the already existing ${
                timepoints[studyDates.indexOf(studyDate)]
              } ${studyDate} timepoints =${JSON.stringify(
                timepoints
              )} studydates = ${JSON.stringify(studyDates)}`
            );
            errors.push(
              `${lesionName} timepoint conflict on ${studyDate}, found ${timepoint} but was ${
                timepoints[studyDates.indexOf(studyDate)]
              } before`
            );
          }
          // eslint-disable-next-line no-param-reassign
          timepoints[studyDates.indexOf(studyDate)] = timepoint;

          if (table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols])
            errors.push(
              `${lesionName} at T${studyDates.indexOf(studyDate)} on ${studyDate} preexists`
            );
          // check if it is the nontarget table and fill in with text instead of values
          if (allCalc) {
            if (lesions[i].allcalc || lesions[i][allCalc])
              table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] =
                allCalc !== true ? { [allCalc]: lesions[i].allcalc[allCalc] } : lesions[i].allcalc; // if allCalc is a defined but not true than metric is sent to filter
          } else if (type.includes('nontarget')) {
            if (aimStatus != null && aimStatus !== '') {
              table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] = aimStatus;
            } else {
              let status = '';
              if (aimType === 'resolved lesion' || aimType === 'new lesion') status = aimType;
              else status = 'present lesion';

              table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] = status;
            }
          } else if (!aimType.includes('resolved lesion')) {
            // get length and put it in table
            // if there are longaxis and shortaxis
            // use short if it is lymph, use long otherwise
            // if there is just length use that
            let length = '';
            const { longaxis } = lesions[i];
            const { shortaxis } = lesions[i];
            if (
              longaxis &&
              longaxis.value &&
              longaxis.value !== '' &&
              shortaxis &&
              shortaxis.value &&
              shortaxis.value !== ''
            ) {
              if (location.includes('lymph')) length = shortaxis.value;
              else length = longaxis.value;
            } else {
              length = lesions[i].length.value;
            }
            table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] = length;
          } else table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] = '0';

          if (UIDs != null) {
            const studyUID = lesions[i].studyuid.value;
            const seriesUID = lesions[i].seriesuid.value;
            const aimUID = lesions[i].aimuid.value;
            let modality = lesions[i].modality.code;
            if (modality === '99EPADM0') modality = lesions[i].modality.value;
            const additionalFields = {};
            if (allCalc) {
              additionalFields.templateCode = lesions[i].template.code;
              additionalFields.templateName = lesions[i].template.value;
              if (lesions[i].shapes) additionalFields.shapes = lesions[i].shapes.value.join(',');
            }
            // put as a UID cell object
            UIDs[lesionIndex][studyDates.indexOf(studyDate)] = {
              studyUID,
              seriesUID,
              aimUID,
              timepoint,
              type: aimType,
              location,
              modality,
              ...additionalFields,
            };
          }
        }
        // I need to do this after the table is populated
        if (nonTarget && type.includes('nontarget')) {
          for (let i = 0; i < table.length; i += 1) {
            for (let j = 0; j < studyDates.length; j += 1) {
              // if this is new lesion mark all following consecutive new lesions as present
              if (
                table[i][j + numOfHeaderCols] != null &&
                table[i][j + 3].trim().toLowerCase() === 'new lesion'
              ) {
                for (let k = j + 1; k < studyDates.length; k += 1) {
                  if (
                    table[i][k + numOfHeaderCols] != null &&
                    table[i][k + numOfHeaderCols].trim().toLowerCase() === 'new lesion'
                  ) {
                    table[i][k + numOfHeaderCols] = 'present lesion';
                  } else if (
                    table[i][k + numOfHeaderCols] != null &&
                    table[i][k + numOfHeaderCols].trim().toLowerCase() === 'resolved lesion'
                  ) {
                    break;
                  }
                }
              }

              if (
                table[i][j + numOfHeaderCols] != null &&
                table[i][j + numOfHeaderCols].trim().toLowerCase() === 'resolved lesion'
              ) {
                if (
                  j < studyDates.length - 1 &&
                  table[i][j + numOfHeaderCols + 1] != null &&
                  table[i][j + numOfHeaderCols + 1].trim().toLowerCase() === 'present lesion'
                ) {
                  table[i][j + numOfHeaderCols + 1] = 'reappeared lesion';
                }
              }
            }
          }
        }
        return { table, UIDs, timepoints, errors };
      } catch (err) {
        fastify.log.error(
          `Error during filling report table for ${index} and ${studyDates} Error: ${err.message}`
        );
        throw err;
      }
    }
  );

  fastify.decorate('generateRow', (index, timepoint, patientInfo, report) => {
    const row = { ...patientInfo };
    row.ID = index;
    row.PRE_POST_TREATMT = timepoint;
    const timepointMap = { PRE: '0B', ON: '1F', POST: '2F' };
    row.LONG_DIAM =
      report[`2_${timepointMap[timepoint]}_Longest Diameter`] ||
      report[`1_${timepointMap[timepoint]}_Longest Diameter`];
    row.VOL =
      report[`2_${timepointMap[timepoint]}_Volume`] ||
      report[`1_${timepointMap[timepoint]}_Volume`];
    row.SER_MEDIAN =
      report[`2_${timepointMap[timepoint]}_SER Median`] ||
      report[`1_${timepointMap[timepoint]}_SER Median`];
    row.SER_MAX =
      report[`2_${timepointMap[timepoint]}_SER Max`] ||
      report[`1_${timepointMap[timepoint]}_SER Max`];
    row.ADC_MEDIAN =
      report[`2_${timepointMap[timepoint]}_ADC Median`] ||
      report[`1_${timepointMap[timepoint]}_ADC Median`];
    row.ADC_MAX =
      report[`2_${timepointMap[timepoint]}_ADC Max`] ||
      report[`1_${timepointMap[timepoint]}_ADC Max`];
    row.IMG_STUDY_ID =
      report[`2_${timepointMap[timepoint]}_Study UID`] ||
      report[`1_${timepointMap[timepoint]}_Study UID`];
    return row;
  });

  fastify.decorate('getMiracclExport', async (request, reply) => {
    try {
      // const fillSeriesDescriptions = {['ACRIN'] : {ADC: 'DWI', SER: 'CROPPED'}, ['BCM', 'HCI'] : {ADC: 'T1W', SER: 'T1W'}}
      const waterfall = await fastify.getWaterfallProject(
        request.query.project,
        request.query.type || 'BASELINE',
        request.epadAuth,
        request.query.metric || 'Export (beta)',
        request.query.exportCalcs ||
          JSON.parse(
            '[{"field":"ser_original_shape_maximum2ddiameterslice","header":"Longest Diameter"},{"field":"ser_original_shape_voxelvolume","header":"Volume"},{"field":"ser_original_firstorder_median","header":"SER Median"},{"field":"ser_original_firstorder_maximum","header":"SER Max"},{"field":"adc_original_firstorder_median","header":"ADC Median"},{"field":"adc_original_firstorder_maximum","header":"ADC Max"}]'
          )
      );
      console.log('waterfall', waterfall);
      let index = 1;
      let data = [];
      const header = [
        'ID',
        'PATIENT_ID',
        'PRE_POST_TREATMT',
        'LONG_DIAM',
        'VOL',
        'SER_MEDIAN',
        'SER_MAX',
        'ADC_MEDIAN',
        'ADC_MAX',
        'IMG_STUDY_ID',
        'IMG_SERIES_ID_SER',
        'IMG_SERIES_ID_ADC',
        'EPAD_NAME',
      ];
      // sanity check if not overriden by ignoreEmpty query param. just checked longest diameter!! check from exportcalcs maybe?
      if (
        !request.query.ignoreEmpty &&
        (waterfall.waterfallExport.length < 0 ||
          !waterfall.waterfallExport[0].patId ||
          !(
            waterfall.waterfallExport[0][`1_0B_Longest Diameter`] ||
            waterfall.waterfallExport[0][`2_0B_Longest Diameter`]
          ))
      )
        reply.send(
          new InternalError(
            'Generating MIRACCL export',
            new Error('Waterfall report cannot be generated with all the required calculations')
          )
        );
      for (let i = 0; i < waterfall.waterfallExport.length; i += 1) {
        const patientInfo = {};
        // GENERAL
        patientInfo.PATIENT_ID = waterfall.waterfallExport[i].patId;
        patientInfo.EPAD_NAME = waterfall.waterfallExport[i].patId;

        // PRE
        const preRow = fastify.generateRow(index, 'PRE', patientInfo, waterfall.waterfallExport[i]);
        data.push(preRow);
        index += 1;

        // ON
        const onRow = fastify.generateRow(index, 'ON', patientInfo, waterfall.waterfallExport[i]);
        data.push(onRow);
        index += 1;

        // POST
        const postRow = fastify.generateRow(
          index,
          'POST',
          patientInfo,
          waterfall.waterfallExport[i]
        );
        data.push(postRow);
        index += 1;
      }
      // get the series uids if the series names are passed
      if (request.query.seriesDescriptions)
        data = fastify.addSeriesUIDs(request.query.seriesDescriptions, data);
      // fastify.writeCsv(header, data, reply);
      reply.send({ header, data });
    } catch (err) {
      console.log(err);
      reply.send(new InternalError('Generating export for miraccl', err));
    }
  });

  // ----  waterfall --------
  fastify.decorate(
    'getWaterfallProject',
    async (projectID, type, epadAuth, metric, exportCalcs) => {
      try {
        // const subjects = await fastify.getSubjectUIDsFromProject(projectID);
        const subjects = await fastify.getSubjectUIDsFromAimsInProject(projectID);
        return await fastify.getWaterfall(
          subjects,
          projectID,
          undefined,
          type,
          epadAuth,
          metric,
          undefined,
          undefined,
          exportCalcs
        );
      } catch (err) {
        fastify.log.error(
          `Error generating waterfall report for project ${projectID} Error: ${err.message}`
        );
      }
      return [];
    }
  );

  fastify.decorate('addHeader', (headers, headerKeys, key, label) => {
    if (!headerKeys.includes(key)) {
      headers.push({ label, key });
      headerKeys.push(key);
    }
  });

  fastify.decorate('colorLookup', (responseCat) => {
    switch (responseCat) {
      case 'PD':
        return '#cd6679'; // red
      case 'CR':
        return '#9ec57c'; // green
      case 'PR':
        return '#045a8d'; // blue
      default:
        // SD
        return '#5a5289'; // purple
    }
  });
  /**
   * get the waterfall report filtering with template, metric and shapes
   * @param subjectsIn comma separated string of subject uids or subjectuids array
   * @param projectID
   * @param subjProjPairsIn  {subjectID:..., projectID:...} object pairs
   * @param type BASELINE (default) or MIN
   * @param epadAuth
   * @param metric ADLA or RECIST (default)
   * @param template
   * @param shapes comma seperated list of shapes or shapes array
   * @return
   */
  fastify.decorate(
    'getWaterfall',
    (
      subjectsIn,
      projectID,
      subjProjPairsIn,
      type,
      epadAuth,
      metric = 'RECIST',
      template,
      shapes,
      exportCalcs
    ) =>
      new Promise(async (resolve, reject) => {
        try {
          // special report cases
          if (metric === 'ADLA') {
            // eslint-disable-next-line no-param-reassign
            metric = 'standard deviation';
            // eslint-disable-next-line no-param-reassign
            shapes = 'line';
          }
          const waterfallData = [];
          const subjProjPairs = subjProjPairsIn || [];

          const waterfallExport = [];
          const mainHeaders = [];
          const lesionHeaders = [];
          const errorHeaders = [];
          const headerKeys = []; // so that we don't have to go through object arrays
          if (subjProjPairs.length === 0 && subjectsIn && projectID) {
            const subjects = subjectsIn || [];
            for (let i = 0; i < subjects.length; i += 1) {
              subjProjPairs.push({ projectID, subjectID: subjects[i] });
            }
          }
          for (let i = 0; i < subjProjPairs.length; i += 1) {
            const params = {
              project: subjProjPairs[i].projectID,
              subject: subjProjPairs[i].subjectID,
            };
            // disable db read for export

            const dbRec = !exportCalcs
              ? // eslint-disable-next-line no-await-in-loop
                await fastify.getReportFromDB(
                  params,
                  metric === 'RECIST' ? 'RECIST' : 'LONGITUDINAL',
                  epadAuth,
                  type,
                  metric,
                  template,
                  shapes
                )
              : { bestResponse: null, responseCat: null };
            // TODO if null, write the prepared report back to the db for the next time
            if (dbRec && dbRec.bestResponse !== null && dbRec.responseCat !== null) {
              fastify.log.info(
                `Using DB record for subject ${subjProjPairs[i].subjectID} project ${subjProjPairs[i].projectID}`
              );
              waterfallData.push({
                name: subjProjPairs[i].subjectID,
                y: dbRec.bestResponse,
                rc: dbRec.responseCat,
                color: fastify.colorLookup(dbRec.responseCat),
                project: subjProjPairs[i].projectID,
              });
            } else {
              // eslint-disable-next-line no-await-in-loop
              const aimsRes = await fastify.getAimsInternal(
                'json',
                params,
                undefined,
                epadAuth,
                undefined,
                undefined,
                true
              );
              fastify.log.info(
                `${aimsRes.rows.length} aims found for ${subjProjPairs[i].subjectID}`
              );
              const collab = fastify.isCollaborator(params.project, epadAuth);
              if (!exportCalcs) {
                const report =
                  metric === 'RECIST'
                    ? fastify.getRecist(aimsRes.rows, undefined, collab, epadAuth)
                    : // eslint-disable-next-line no-await-in-loop
                      await fastify.getLongitudinal(
                        aimsRes.rows,
                        template,
                        shapes,
                        undefined,
                        metric,
                        false,
                        collab,
                        epadAuth
                      );
                if (report == null) {
                  fastify.log.warn(
                    `Couldn't retrieve report for patient ${subjProjPairs[i].subjectID}`
                  );
                  // eslint-disable-next-line no-continue
                  continue;
                }

                // check if the report is a precompute report and save to db if so
                // eslint-disable-next-line no-await-in-loop
                const projectId = await fastify.findProjectIdInternal(subjProjPairs[i].projectID);
                // eslint-disable-next-line no-await-in-loop
                const subjectId = await fastify.findSubjectIdInternal(subjProjPairs[i].subjectID);
                // eslint-disable-next-line no-await-in-loop
                await fastify.savePrecomputeReports(
                  projectId,
                  subjectId,
                  report,
                  metric === 'RECIST' ? 'RECIST' : 'LONGITUDINAL',
                  metric,
                  template,
                  shapes,
                  epadAuth
                );
                const rc = fastify.getResponseCategory(report, type, metric);
                waterfallData.push({
                  name: subjProjPairs[i].subjectID,
                  y: fastify.getBestResponse(report, type, metric),
                  rc,
                  color: fastify.colorLookup(rc),
                  project: subjProjPairs[i].projectID,
                });
              } else {
                let recistRequired = false;
                let longitudinalRequired = false;
                for (let valNum = 0; valNum < exportCalcs.length; valNum += 1) {
                  if (exportCalcs[valNum].field === 'recist') recistRequired = true;
                  else longitudinalRequired = true;
                }
                const recistReport = recistRequired
                  ? fastify.getRecist(aimsRes.rows, undefined, collab, epadAuth)
                  : undefined;
                const longitudinalReport = longitudinalRequired
                  ? // eslint-disable-next-line no-await-in-loop
                    await fastify.getLongitudinal(
                      aimsRes.rows,
                      template,
                      shapes,
                      undefined,
                      undefined,
                      false,
                      collab,
                      epadAuth
                    )
                  : undefined;
                const report = longitudinalReport || recistReport;
                // if both merge
                if (recistRequired || longitudinalRequired) {
                  // eslint-disable-next-line no-restricted-syntax
                  for (const [reader, readerReport] of Object.entries(longitudinalReport)) {
                    for (
                      let lesionNum = 0;
                      lesionNum < readerReport.tTable.length;
                      lesionNum += 1
                    ) {
                      for (
                        let timepoint = 0;
                        timepoint < readerReport.studyDates.length;
                        timepoint += 1
                      ) {
                        if (
                          readerReport.tTable[lesionNum] &&
                          recistReport &&
                          recistReport[reader] &&
                          recistReport[reader].tTable[lesionNum] &&
                          readerReport.tTable[lesionNum][0] ===
                            recistReport[reader].tTable[lesionNum][0]
                        ) {
                          if (!readerReport.tTable[lesionNum][timepoint + 2])
                            readerReport.tTable[lesionNum][timepoint + 2] = {};
                          readerReport.tTable[lesionNum][timepoint + 2].recist = {
                            value: recistReport[reader].tTable[lesionNum][timepoint + 3],
                          };
                        } else
                          fastify.log.warn(
                            'different lesions',
                            readerReport.tTable[lesionNum][0],
                            recistReport &&
                              recistReport[reader] &&
                              recistReport[reader].tTable[lesionNum] &&
                              recistReport[reader].tTable[lesionNum][0]
                              ? recistReport[reader].tTable[lesionNum][0]
                              : 'not found'
                          );
                      }
                    }
                  }
                }
                // eslint-disable-next-line no-restricted-syntax
                for (const [reader, readerReport] of Object.entries(report)) {
                  const sums = {};
                  const rrs = {};
                  const rrAbss = {};
                  const responseCats = {};
                  const row = { patId: subjProjPairs[i].subjectID, reader };
                  fastify.addHeader(mainHeaders, headerKeys, 'patId', 'Patient ID');
                  fastify.addHeader(mainHeaders, headerKeys, 'reader', 'Reader Name');
                  // dates
                  for (
                    let timepoint = 0;
                    timepoint < readerReport.studyDates.length;
                    timepoint += 1
                  ) {
                    if (readerReport.stTimepoints[timepoint] === 0) {
                      row[`${timepoint}BDate`] = readerReport.studyDates[timepoint];

                      fastify.addHeader(
                        mainHeaders,
                        headerKeys,
                        `${timepoint}BDate`,
                        `${timepoint ? 'New ' : ''}Baseline Date`
                      );
                    } else {
                      row[`${timepoint}FDate`] = readerReport.studyDates[timepoint];
                      fastify.addHeader(
                        mainHeaders,
                        headerKeys,
                        `${timepoint}FDate`,
                        `Follow-up ${readerReport.stTimepoints[timepoint]} Date`
                      );
                    }
                  }
                  // lesion values
                  for (
                    let lesionNum = 0;
                    lesionNum < readerReport.tLesionNames.length;
                    lesionNum += 1
                  ) {
                    // eslint-disable-next-line prefer-destructuring
                    row[`${lesionNum + 1}Name`] = readerReport.tTable[lesionNum][0];
                    fastify.addHeader(
                      lesionHeaders,
                      headerKeys,
                      `${lesionNum + 1}Name`,
                      `Lesion ${lesionNum + 1} Name`
                    );
                    // eslint-disable-next-line prefer-destructuring
                    row[`${lesionNum + 1}Location`] = readerReport.tTable[lesionNum][1];
                    fastify.addHeader(
                      lesionHeaders,
                      headerKeys,
                      `${lesionNum + 1}Location`,
                      `Lesion ${lesionNum + 1} Location`
                    );
                    for (
                      let timepoint = 0;
                      timepoint < readerReport.studyDates.length;
                      timepoint += 1
                    ) {
                      // add studyuids to the export
                      if (readerReport.stTimepoints[timepoint] === 0) {
                        row[`${lesionNum + 1}_${timepoint}B_Study UID`] =
                          readerReport.tUIDs[lesionNum][timepoint].studyUID;
                        fastify.addHeader(
                          lesionHeaders,
                          headerKeys,
                          `${lesionNum + 1}_${timepoint}B_Study UID}`,
                          `Lesion ${lesionNum + 1} ${timepoint ? 'New ' : ''}Baseline Study UID`
                        );
                      } else {
                        row[`${lesionNum + 1}_${timepoint}F_Study UID`] =
                          readerReport.tUIDs[lesionNum][timepoint].studyUID;
                        fastify.addHeader(
                          lesionHeaders,
                          headerKeys,
                          `${lesionNum + 1}_${timepoint}F_Study UID}`,
                          `Lesion ${lesionNum + 1} Follow-up ${timepoint} Study UID`
                        );
                      }

                      for (let valNum = 0; valNum < exportCalcs.length; valNum += 1) {
                        if (readerReport.stTimepoints[timepoint] === 0) {
                          row[`${lesionNum + 1}_${timepoint}B_${exportCalcs[valNum].header}`] =
                            readerReport.tTable[lesionNum][timepoint + 2] &&
                            readerReport.tTable[lesionNum][timepoint + 2][exportCalcs[valNum].field]
                              ? readerReport.tTable[lesionNum][timepoint + 2][
                                  exportCalcs[valNum].field
                                ].value
                              : undefined;

                          fastify.addHeader(
                            lesionHeaders,
                            headerKeys,
                            `${lesionNum + 1}_${timepoint}B_${exportCalcs[valNum].header}`,
                            `Lesion ${lesionNum + 1} ${timepoint ? 'New ' : ''}Baseline ${
                              exportCalcs[valNum].header
                            }`
                          );
                        } else {
                          row[`${lesionNum + 1}_${timepoint}F_${exportCalcs[valNum].header}`] =
                            readerReport.tTable[lesionNum][timepoint + 2] &&
                            readerReport.tTable[lesionNum][timepoint + 2][exportCalcs[valNum].field]
                              ? readerReport.tTable[lesionNum][timepoint + 2][
                                  exportCalcs[valNum].field
                                ].value
                              : undefined;
                          fastify.addHeader(
                            lesionHeaders,
                            headerKeys,
                            `${lesionNum + 1}_${timepoint}F_${exportCalcs[valNum].header}`,
                            `Lesion ${lesionNum + 1} Follow-up ${timepoint} ${
                              exportCalcs[valNum].header
                            }`
                          );
                        }
                        if (!sums[exportCalcs[valNum].field]) sums[exportCalcs[valNum].field] = {};
                        if (!sums[exportCalcs[valNum].field][timepoint])
                          sums[exportCalcs[valNum].field][timepoint] = 0;
                        sums[exportCalcs[valNum].field][timepoint] +=
                          readerReport.tTable[lesionNum][timepoint + 2] &&
                          readerReport.tTable[lesionNum][timepoint + 2][
                            exportCalcs[valNum].field
                          ] &&
                          readerReport.tTable[lesionNum][timepoint + 2][exportCalcs[valNum].field]
                            .value != null
                            ? parseFloat(
                                readerReport.tTable[lesionNum][timepoint + 2][
                                  exportCalcs[valNum].field
                                ].value
                              )
                            : 0;
                      }
                    }
                  }
                  // sums
                  // eslint-disable-next-line no-restricted-syntax
                  for (const [exportCalc, sumMap] of Object.entries(sums)) {
                    const sumsArray = [];
                    for (
                      let timepoint = 0;
                      timepoint < readerReport.studyDates.length;
                      timepoint += 1
                    )
                      sumsArray.push(sumMap[timepoint]);
                    const { rr, rrAbs } = config.RCFromRRMin
                      ? fastify.calcRRMin(sumsArray, readerReport.stTimepoints, true)
                      : fastify.calcRRBaseline(sumsArray, readerReport.stTimepoints, true);
                    rrs[exportCalc] = rr;
                    rrAbss[exportCalc] = rrAbs;
                    if (recistReport && recistReport[reader] && exportCalc === 'recist') {
                      responseCats[exportCalc] = recistReport[reader].tResponseCats;
                    } else {
                      // starting from version 1 we are using baseline instead of rrmin unless config.RCFromRRMin is set to true
                      const rc = fastify.calcResponseCat(
                        rr,
                        readerReport.stTimepoints,
                        [], // TODO isThereNewLesion,
                        sumsArray
                      );
                      responseCats[exportCalc] = rc;
                    }
                  }
                  for (let valNum = 0; valNum < exportCalcs.length; valNum += 1) {
                    for (
                      let timepoint = 1;
                      timepoint < readerReport.studyDates.length;
                      timepoint += 1
                    ) {
                      row[`Sum${timepoint}_${exportCalcs[valNum].field}`] =
                        sums[exportCalcs[valNum].field][timepoint];
                      fastify.addHeader(
                        mainHeaders,
                        headerKeys,
                        `Sum${timepoint}_${exportCalcs[valNum].field}`,
                        `Sum ${timepoint} ${exportCalcs[valNum].field}`
                      );
                      row[`AC_${timepoint}_${exportCalcs[valNum].field}`] =
                        rrAbss[exportCalcs[valNum].field][timepoint];
                      fastify.addHeader(
                        mainHeaders,
                        headerKeys,
                        `AC_${timepoint}_${exportCalcs[valNum].field}`,
                        `Absolute value Change ${timepoint} ${exportCalcs[valNum].header} from baseline`
                      );
                      row[`PC_${timepoint}_${exportCalcs[valNum].field}`] =
                        rrs[exportCalcs[valNum].field][timepoint];
                      fastify.addHeader(
                        mainHeaders,
                        headerKeys,
                        `PC_${timepoint}_${exportCalcs[valNum].field}`,
                        `Percent Change ${timepoint} ${exportCalcs[valNum].header} from baseline`
                      );
                      row[`RC_${timepoint}_${exportCalcs[valNum].field}`] =
                        responseCats[exportCalcs[valNum].field][timepoint];
                      fastify.addHeader(
                        mainHeaders,
                        headerKeys,
                        `RC_${timepoint}_${exportCalcs[valNum].field}`,
                        `RECIST 1.1 ${timepoint} ${exportCalcs[valNum].header}`
                      );
                    }
                  }
                  row.recistErrors =
                    recistReport && recistReport[reader] && recistReport[reader].tErrors
                      ? recistReport[reader].tErrors.join('. ')
                      : '';
                  fastify.addHeader(errorHeaders, headerKeys, `recistErrors`, `Recist Errors`);
                  row.otherErrors = readerReport.tErrors.join('. ');
                  fastify.addHeader(errorHeaders, headerKeys, `otherErrors`, `Other Errors`);
                  waterfallExport.push(row);
                }
              }
            }
          }
          const waterfallHeaders = mainHeaders.concat(lesionHeaders).concat(errorHeaders);
          if (!exportCalcs) resolve({ series: _.sortBy(waterfallData, 'y').reverse() });
          else resolve({ waterfallExport, waterfallHeaders });
        } catch (err) {
          fastify.log.error(
            `Error generating waterfall report for subjectUIDs ${JSON.stringify(
              subjectsIn
            )} project ${projectID} subjProjPairs ${JSON.stringify(subjProjPairsIn)} Error: ${
              err.message
            }`
          );
          console.log(err);
          reject(err);
        }
      })
  );

  fastify.decorate('getBestResponseVal', (rr) => {
    if (config.bestResponse) {
      // old method, calculates the best response
      const min = Math.min(...rr);
      if (min === 0 && rr.length > 1) return rr[1];
      return min;
    }
    // new/default method, gets the last response
    if (rr.length > 0) return rr[rr.length - 1];
    // default, should never get here
    return 0;
  });

  fastify.decorate('getBestResponse', (reportMultiUser, type, metric) => {
    try {
      // TODO how to support multiple readers in waterfall getting the first report for now
      const report =
        Object.keys(reportMultiUser).length > 0
          ? reportMultiUser[Object.keys(reportMultiUser)[0]]
          : reportMultiUser;
      let rr;
      switch (type) {
        case 'MIN':
          rr = report.tRRMin;
          if (!rr) {
            const sums = fastify.calcSums(report.tTable, report.stTimepoints, metric);
            rr = fastify.calcRRMin(sums, report.stTimepoints);
          }
          break;
        default:
          // BASELINE
          rr = report.tRRBaseline;
          if (!rr) {
            const sums = fastify.calcSums(report.tTable, report.stTimepoints, metric);
            rr = fastify.calcRRBaseline(sums, report.stTimepoints);
          }
          break;
      }

      return fastify.getBestResponseVal(rr);
    } catch (err) {
      fastify.log.error(
        `Error generating best response for report ${JSON.stringify(
          reportMultiUser
        )} metric ${metric} and type ${type} Error: ${err.message}`
      );
    }
    return NaN;
  });

  fastify.decorate('getResponseCategory', (reportMultiUser, type, metric) => {
    try {
      // TODO how to support multiple readers in waterfall getting the first report for now
      const report =
        Object.keys(reportMultiUser).length > 0
          ? reportMultiUser[Object.keys(reportMultiUser)[0]]
          : reportMultiUser;
      let rr = report.tRRMin;
      let responseCats = report.tResponseCats;
      if (!rr || !responseCats) {
        const sums = fastify.calcSums(report.tTable, report.stTimepoints, metric);
        if (config.RCFromRRMin) rr = fastify.calcRRMin(sums, report.stTimepoints);
        else rr = fastify.calcRRBaseline(sums, report.stTimepoints);

        responseCats = fastify.calcResponseCat(
          rr,
          report.stTimepoints,
          [], // TODO isThereNewLesion,
          sums
        );
      }

      if (config.bestResponse) {
        // old method, calculates the best response
        const min = Math.min(...rr);
        if (min === 0 && responseCats.length > 1) return responseCats[1];

        for (let i = rr.length - 1; i >= 0; i -= 1) {
          if (rr[i] === min) return responseCats[i];
        }
      }
      // new/default method, gets the last response
      if (responseCats.length > 0) return responseCats[responseCats.length - 1];
      return null;
    } catch (err) {
      fastify.log.error(
        `Error generating best response for report ${JSON.stringify(
          reportMultiUser
        )} metric ${metric} and type ${type} Error: ${err.message}`
      );
    }
    return 'NA';
  });

  // type is composite of report, metric, template and shapes (template and shape is just for ADLA, is there a better way?)
  fastify.decorate(
    'getReportType',
    (report, metric, template, shapes) =>
      `${report.toLowerCase()}${metric && metric !== 'RECIST' ? '_' : ''}${
        metric && metric !== 'RECIST' ? metric : ''
      }${template ? '_' : ''}${template || ''}${shapes ? '_' : ''}${
        shapes ? JSON.stringify(shapes) : ''
      }`
  );

  fastify.decorate('getWaterfallReport', async (request, reply) => {
    try {
      let result;
      if (request.body.pairs || request.body.subjectUIDs)
        result = await fastify.getWaterfall(
          request.body.subjectUIDs,
          request.body.projectID,
          request.body.pairs,
          request.query.type,
          request.epadAuth,
          request.query.metric,
          request.query.templates,
          request.query.shapes,
          request.query.exportCalcs ? JSON.parse(request.query.exportCalcs) : undefined
        );
      else if (request.body.projectID) {
        result = await fastify.getWaterfallProject(
          request.body.projectID,
          request.query.type,
          request.epadAuth,
          request.query.metric,
          request.query.exportCalcs ? JSON.parse(request.query.exportCalcs) : undefined
        );
      }
      reply.send(result);
    } catch (err) {
      reply.send(new InternalError(`Getting waterfall report ${request.body}`, err));
    }
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(reporting);
