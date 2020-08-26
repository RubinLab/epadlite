const fp = require('fastify-plugin');
const _ = require('lodash');
// const config = require('../config/index');
// const EpadNotification = require('../utils/EpadNotification');

const {
  InternalError,
  //   ResourceNotFoundError,
  //   BadRequestError,
  //   UnauthenticatedError,
  //   UnauthorizedError,
  //   ResourceAlreadyExistsError,
} = require('../utils/EpadErrors');

async function reporting(fastify) {
  fastify.decorate('numOfLongitudinalHeaderCols', 2);

  fastify.decorate('checkForShapes', (markupEntityArray, shapes) => {
    // first normalize the shapes to handle different versions of the shape names
    const normShapes = [];
    shapes.forEach(shape => {
      switch (shape.toLowerCase()) {
        case 'line':
        case 'multipoint':
          normShapes.push('multipoint');
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
        if (markupEntityArray[i][`xsi:type`].toLowerCase().includes(normShapes[j].toLowerCase()))
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
      // const aimUids = await fastify.getAimUidsForProjectFilter(params, filter);
      // const aimJSONs = await fastify.getAimsInternal('json', params, aimUids, epadAuth);

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
            `Aim template is ${
              aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0]
                .code
            } was looking for ${template}`
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
            me => {
              return me[`xsi:type`];
            }
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
          ioes.forEach(ioe => {
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
              iocs.forEach(ioc => {
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
              ipcs.forEach(ipc => {
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
          ipes.forEach(ipe => {
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
              ipcs.forEach(ipc => {
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
          qs.forEach(q => {
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
          calcs.forEach(calc => {
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
        if (hasCalcs) table.push(row);
      }
      return table;
    } catch (err) {
      fastify.log.error(
        `Error during filling table for ${template}, ${columns}, ${shapesIn} and ${
          aimJSONs.length
        }. Error: ${err.message}`
      );
    }
    return [];
  });

  fastify.decorate('getRecist', aimJSONs => {
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
      ]);

      const lesions = table.concat(tableV2);
      const tLesionNames = [];
      const studyDates = [];
      const ntLesionNames = [];
      const targetTypes = ['target', 'target lesion', 'resolved lesion'];
      const ntNewLesionStudyDates = [];
      const tTrackingUIDs = [];
      const ntTrackingUIDs = [];
      let lesionWTrackingUIDCount = 0;
      // first pass fill in the lesion names and study dates (x and y axis of the table)
      for (let i = 0; i < lesions.length; i += 1) {
        const lesionName = lesions[i].name.value.toLowerCase();
        const studyDate = lesions[i].studydate.value;
        const trackingUID = lesions[i].trackinguniqueidentifier
          ? lesions[i].trackinguniqueidentifier.value
          : undefined;
        const type = lesions[i].type.value.toLowerCase();
        if (!studyDates.includes(studyDate)) studyDates.push(studyDate);
        if (targetTypes.includes(type.toLowerCase())) {
          if (!tLesionNames.includes(lesionName)) tLesionNames.push(lesionName);
          if (trackingUID && !tTrackingUIDs.includes(trackingUID)) tTrackingUIDs.push(trackingUID);
        } else {
          // will not work with the new version, but should keep for the old version
          if (type.toLowerCase() === 'new lesion' && !ntNewLesionStudyDates.includes(studyDate)) {
            ntNewLesionStudyDates.push(studyDate);
          }
          if (!ntLesionNames.includes(lesionName)) ntLesionNames.push(lesionName);
          if (trackingUID && !ntTrackingUIDs.includes(trackingUID))
            ntTrackingUIDs.push(trackingUID);
        }
        if (trackingUID) {
          lesionWTrackingUIDCount += 1;
        }
      }
      // sort lists
      tLesionNames.sort();
      studyDates.sort();
      ntLesionNames.sort();

      let mode = 'name';
      let tIndex = tLesionNames;
      let ntIndex = ntLesionNames;
      if (lesionWTrackingUIDCount === lesions.length && lesions.length > 0) {
        fastify.log.info('We have tracking UIDs for all lesions using tracking UIDs');
        mode = 'trackingUID';
        tIndex = tTrackingUIDs;
        ntIndex = ntTrackingUIDs;
      }
      if (tLesionNames.length > 0 && studyDates.length > 0) {
        // fill in the table for target lesions
        const target = fastify.fillReportTable(tIndex, studyDates, lesions, targetTypes, mode);
        // fill in the table for non-target lesions
        const nonTargetTypes = ['non-target', 'nontarget', 'non-cancer lesion', 'new lesion'];

        const nonTarget = fastify.fillReportTable(
          ntIndex,
          studyDates,
          lesions,
          nonTargetTypes,
          mode
        );
        for (let i = 0; i < nonTarget.table.length; i += 1) {
          for (let j = 0; j < studyDates.length; j += 1) {
            if (
              nonTarget.table[i][j + 3] != null &&
              nonTarget.table[i][j + 3].trim().toLowerCase() === 'new lesion' &&
              !ntNewLesionStudyDates.includes(studyDates[j])
            ) {
              ntNewLesionStudyDates.push(studyDates[j]);
            }
          }
        }

        const isThereNewLesion = [];
        if (ntNewLesionStudyDates.length > 0) {
          for (let i = 0; i < ntNewLesionStudyDates.length; i += 1)
            isThereNewLesion[studyDates.indexOf(ntNewLesionStudyDates[i])] = true;
        }

        // calculate the sums first
        const tSums = fastify.calcSums(target.table, target.timepoints);
        // calculate the rrs
        const tRRBaseline = fastify.calcRRBaseline(tSums, target.timepoints);
        const tRRMin = fastify.calcRRMin(tSums, target.timepoints);
        // use rrmin not baseline
        const responseCats = fastify.calcResponseCat(
          tRRMin,
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
            ntLesionNames.length > 0
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

        if (ntLesionNames.length > 0 && studyDates.length > 0) {
          const rr = {
            tLesionNames,
            studyDates,
            tTable: target.table,
            tSums: fastify.cleanArray(tSums),
            tRRBaseline: fastify.cleanArray(tRRBaseline),
            tRRMin: fastify.cleanArray(tRRMin),
            tResponseCats: fastify.cleanArray(responseCats),
            tUIDs: target.UIDs,
            stTimepoints: target.timepoints,
            tTimepoints: fastify.cleanConsecutives(target.timepoints),
            ntLesionNames,
            ntTable: nonTarget.table,
            ntUIDs: nonTarget.UIDs,
          };
          return rr;
        }
        const rr = {
          tLesionNames,
          studyDates,
          tTable: target.table,
          tSums: fastify.cleanArray(tSums),
          tRRBaseline: fastify.cleanArray(tRRBaseline),
          tRRMin: fastify.cleanArray(tRRMin),
          tResponseCats: fastify.cleanArray(responseCats),
          tUIDs: target.UIDs,
          stTimepoints: target.timepoints,
          tTimepoints: fastify.cleanConsecutives(target.timepoints),
        };
        return rr;
      }
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
  fastify.decorate('calcRRBaseline', (sums, timepoints) => {
    let baseline = sums[0];
    const rrBaseline = [];
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
        } else rrBaseline[i] = ((sums[i] - baseline) * 100.0) / baseline;
      }
    }
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
  fastify.decorate('calcRRMin', (sums, timepoints) => {
    let min = sums[0];
    fastify.log.debug(`Min is ${min}`);
    const rr = [];
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
        } else rr[i] = ((sums[i] - min) * 100.0) / min;
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

  fastify.decorate('cleanArray', arr => {
    const out = [];
    for (let i = 0; i < arr.length; i += 1)
      if (arr[i] !== undefined && arr[i] != null) {
        out.push(arr[i]);
      }
    return out;
  });

  fastify.decorate('cleanConsecutives', arr => {
    if (!arr) return null;
    const out = [];
    for (let i = 0; i < arr.length; i += 1)
      if (i === 0 || (i > 0 && arr[i] !== arr[i - 1])) {
        out.push(arr[i]);
      }
    return out;
  });

  fastify.decorate('getLongitudinal', (aims, template, shapes) => {
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
        ],
        shapes
      );
      if (lesions.length === 0) return null;

      // get targets
      const tLesionNames = [];
      const studyDates = [];

      // first pass fill in the lesion names and study dates (x and y axis of the table)
      for (let i = 0; i < lesions.length; i += 1) {
        const lesionName = lesions[i].name.value.toLowerCase();
        const studyDate = lesions[i].studydate.value;
        if (!studyDates.includes(studyDate)) studyDates.push(studyDate);
        if (!tLesionNames.includes(lesionName)) tLesionNames.push(lesionName);
      }
      // sort lists
      tLesionNames.sort();
      studyDates.sort();

      if (tLesionNames.length > 0 && studyDates.length > 0) {
        // fill in the table for target lesions
        const { table, UIDs, timepoints } = fastify.fillReportTable(
          tLesionNames,
          studyDates,
          lesions,
          undefined, // no type filtering
          'name', // no tracking UID for now
          fastify.numOfLongitudinalHeaderCols,
          true,
          false
        );

        const rr = {
          tLesionNames,
          studyDates,
          tTable: table,
          tUIDs: UIDs,
          stTimepoints: timepoints,
          tTimepoints: fastify.cleanConsecutives(timepoints),
        };
        return rr;
      }
      fastify.log.info(`no target lesion in table ${lesions}`);
      return null;
    } catch (err) {
      fastify.log.error(
        `Error generating longitudinal report for ${aims.length} Error: ${err.message}`
      );
    }
    return null;
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
        for (let i = 0; i < studyDates.length + numOfHeaderCols; i += 1) row.push('');
        const uidRow = [];
        for (let i = 0; i < studyDates.length; i += 1) uidRow.push('');

        index.forEach(() => table.push([...row]));

        const UIDs = [];
        index.forEach(() => UIDs.push([...uidRow]));
        const timepoints = [];
        for (let i = 0; i < studyDates.length; i += 1) timepoints.push(null);

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
          if (
            table[lesionIndex][0] !== null &&
            table[lesionIndex][0] !== '' &&
            table[lesionIndex][0] !== lesionName
          ) {
            fastify.log.warn(
              `Lesion name at ${studyDate} is different from the same lesion on a different date. The existing one is: ${
                table[lesionIndex][0]
              } whereas this is: ${lesionName}`
            );
            table[lesionIndex][0] = lesionName;
          }
          // check if exists and if different and put warnings.
          // changes anyhow
          let nextCol = 1;
          // hence recist
          if (numOfHeaderCols > 2) {
            if (
              table[lesionIndex][nextCol] != null &&
              table[lesionIndex][nextCol] !== '' &&
              table[lesionIndex][nextCol].toLowerCase() !== aimType
            )
              fastify.log.warn(
                `Type at date ${studyDate} is different from the same lesion on a different date. The existing one is: ${
                  table[lesionIndex][nextCol]
                } whereas this is: ${aimType}`
              );
            table[lesionIndex][nextCol] = aimType;
            nextCol += 1;
          }

          if (
            table[lesionIndex][nextCol] != null &&
            table[lesionIndex][nextCol] !== '' &&
            table[lesionIndex][nextCol].toLowerCase() !== location
          )
            fastify.log.warn(
              `Location at date ${studyDate} is different from the same lesion on a different date. The existing one is:${
                table[lesionIndex][nextCol]
              } whereas this is:${location}`
            );
          table[lesionIndex][nextCol] = location;
          // get the lesion and get the timepoint. if it is integer put that otherwise calculate using study dates
          const tpObj = lesions[i].timepoint ? lesions[i].timepoint : lesions[i].lesion;
          const lesionTimepoint = tpObj && tpObj.value ? tpObj.value : '0';
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
          }
          // eslint-disable-next-line no-param-reassign
          timepoints[studyDates.indexOf(studyDate)] = timepoint;
          // check if it is the nontarget table and fill in with text instead of values
          if (allCalc) {
            if (lesions[i].allcalc)
              table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] =
                lesions[i].allcalc;
          } else if (type.includes('nontarget')) {
            if (aimStatus != null && aimStatus !== '') {
              table[lesionIndex][studyDates.indexOf(studyDate) + numOfHeaderCols] = aimStatus;
            } else {
              let status = '';
              if (aimType.equals('resolved lesion') || aimType.equals('new lesion'))
                status = aimType;
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

        return { table, UIDs, timepoints };
      } catch (err) {
        fastify.log.error(
          `Error during filling report table for ${index} and ${studyDates} Error: ${err.message}`
        );
      }
      return { table: [], UIDs: [] };
    }
  );

  // ----  waterfall --------
  fastify.decorate('getWaterfallProject', async (projectID, type, epadAuth, metric) => {
    try {
      // const subjects = await fastify.getSubjectUIDsFromProject(projectID);
      const subjects = await fastify.getSubjectUIDsFromAimsInProject(projectID);
      return await fastify.getWaterfall(subjects, projectID, undefined, type, epadAuth, metric);
    } catch (err) {
      fastify.log.error(
        `Error generating waterfall report for project ${projectID} Error: ${err.message}`
      );
    }
    return [];
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
    (subjectsIn, projectID, subjProjPairsIn, type, epadAuth, metric = 'RECIST', template, shapes) =>
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
            // eslint-disable-next-line no-await-in-loop
            const bestResponse = await fastify.getReportFromDB(params, metric, type);
            if (bestResponse !== null) {
              waterfallData.push({
                name: subjProjPairs[i].subjectID,
                y: bestResponse,
                project: subjProjPairs[i].projectID,
              });
            } else {
              // eslint-disable-next-line no-await-in-loop
              const aims = await fastify.filterProjectAims(params, {}, epadAuth);
              fastify.log.info(`${aims.length} aims found for ${subjProjPairs[i].subjectID}`);

              const report =
                metric === 'RECIST'
                  ? fastify.getRecist(aims)
                  : fastify.getLongitudinal(aims, template, shapes);
              if (report == null) {
                fastify.log.warn(
                  `Couldn't retrieve report for patient ${subjProjPairs[i].subjectID}`
                );
                // eslint-disable-next-line no-continue
                continue;
              }
              waterfallData.push({
                name: subjProjPairs[i].subjectID,
                y: fastify.getBestResponse(report, type, metric),
                project: subjProjPairs[i].projectID,
              });
            }
          }
          resolve({ series: _.sortBy(waterfallData, 'y').reverse() });
        } catch (err) {
          fastify.log.error(
            `Error generating waterfall report for subjectUIDs ${JSON.stringify(
              subjectsIn
            )} project ${projectID} subjProjPairs ${JSON.stringify(subjProjPairsIn)} Error: ${
              err.message
            }`
          );
          reject(err);
        }
      })
  );

  fastify.decorate('getBestResponse', (report, type, metric) => {
    try {
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

      const min = Math.min(...rr);
      if (min === 0 && rr.length > 1) return rr[1];
      return min;
    } catch (err) {
      fastify.log.error(
        `Error generating best response for report ${JSON.stringify(
          report
        )} metric ${metric} and type ${type} Error: ${err.message}`
      );
    }
    return NaN;
  });
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
          request.query.shapes
        );
      else if (request.body.projectID) {
        result = await fastify.getWaterfallProject(
          request.body.projectID,
          request.query.type,
          request.epadAuth,
          request.query.metric
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
