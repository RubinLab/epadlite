const fp = require('fastify-plugin');
// const config = require('../config/index');
// const EpadNotification = require('../utils/EpadNotification');

// const {
//   InternalError,
//   ResourceNotFoundError,
//   BadRequestError,
//   UnauthenticatedError,
//   UnauthorizedError,
//   ResourceAlreadyExistsError,
// } = require('../utils/EpadErrors');

async function reporting(fastify) {
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
    let obj = { value };
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

  fastify.decorate('fillTable', (aimJSONs, template, columns, shapes) => {
    try {
      // const aimUids = await fastify.getAimUidsForProjectFilter(params, filter);
      // const aimJSONs = await fastify.getAimsInternal('json', params, aimUids, epadAuth);

      // TODO handle multiple templates

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
        if (template != null) {
          // I already filter it in db but just in case
          if (
            aimJSONs[
              i
            ].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code.toLowerCase() !==
            template.toLowerCase()
          ) {
            fastify.log.warn(
              `Aim template is ${
                aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .typeCode[0].code
              } was looking for ${template}`
            );
            // eslint-disable-next-line no-continue
            continue;
          }
          row.template = fastify.formJsonObj(
            aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0][
              `iso:displayName`
            ].value,
            aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0]
              .code
          );
        }

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
          if (shapes != null && shapes.length > 0) {
            if (
              !fastify.checkForShapes(
                aimJSONs[i].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                  .markupEntityCollection.MarkupEntity,
                shapes
              )
            ) {
              fastify.log.warning(
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
                // TODO handle getCharacteristicQuantificationCollection
                if (ioc.label.value.toLowerCase() in row) {
                  row[ioc.label.value.toLowerCase()] = fastify.formJsonObj(
                    ioc.typeCode[0][`iso:displayName`].value,
                    ioc.typeCode[0].code
                  );
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

        // TODO look through questions

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
              // TODO handle old aims ExtendedCalculationResult
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
      console.log(err);
    }
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(reporting);
