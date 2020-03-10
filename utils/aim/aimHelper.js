/* eslint-disable */
const Aim = require('./Aim.jsx');

const enumAimType = {
  imageAnnotation: 1,
  seriesAnnotation: 2,
  studyAnnotation: 3,
};

function getImageIdAnnotations(aims) {
  let imageIdSpecificMarkups = {};
  aims.forEach(aim => parseAim(aim, imageIdSpecificMarkups));
  return imageIdSpecificMarkups;
}

function parseAim(aim, imageIdSpecificMarkups) {
  var imageAnnotation = aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0];
  //check if the aim has markup
  if (imageAnnotation.markupEntityCollection) {
    var markupEntities = imageAnnotation.markupEntityCollection.MarkupEntity;
    markupEntities.forEach(markupEntity => {
      const { imageId, data } = getMarkup(markupEntity, aim);
      if (!imageIdSpecificMarkups[imageId]) imageIdSpecificMarkups[imageId] = [data];
      else imageIdSpecificMarkups[imageId].push(data);
    });
  }
  //check if it has segmentation
  if (imageAnnotation.segmentationEntityCollection) {
    var segmentationEntities = imageAnnotation.segmentationEntityCollection.SegmentationEntity;
    segmentationEntities.forEach(segmentationEntity => {
      const { imageId, data } = getSegmentation(segmentationEntity, aim);
      if (!imageIdSpecificMarkups[imageId]) imageIdSpecificMarkups[imageId] = [data];
      else imageIdSpecificMarkups[imageId].push(data);
    });
  }
}

function getMarkup(markupEntity, aim) {
  let imageId = markupEntity['imageReferenceUid']['root'];
  const frameNumber = markupEntity['referencedFrameNumber']['value'];
  // if (frameNumber > -1) imageId = imageId + "&frame=" + frameNumber; //if multiframe reconstruct the imageId
  imageId = imageId + '&frame=' + frameNumber;
  const markupUid = markupEntity['uniqueIdentifier']['root'];
  let calculations = [];
  try {
    calculations = getCalculationEntitiesOfMarkUp(aim, markupUid);
  } catch (error) {
    console.log('Can not get calculations', error);
  }
  const aimUid = aim.ImageAnnotationCollection['uniqueIdentifier']['root'];
  return {
    imageId,
    data: {
      markupType: markupEntity['xsi:type'],
      calculations,
      coordinates:
        markupEntity.twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate,
      markupUid,
      aimUid,
    },
  };
}

function getSegmentation(segmentationEntity, aim) {
  const imageId = segmentationEntity['referencedSopInstanceUid']['root'];
  const markupUid = segmentationEntity['uniqueIdentifier']['root'];
  const calculations = getCalculationEntitiesOfMarkUp(aim, markupUid);
  const aimUid = aim.ImageAnnotationCollection['uniqueIdentifier']['root'];
  return {
    imageId,
    data: {
      markupType: segmentationEntity['xsi:type'],
      calculations,
      markupUid,
      aimUid,
    },
  };
}

function getCalculationEntitiesOfMarkUp(aim, markupUid) {
  const imageAnnotationStatements = getImageAnnotationStatements(aim);
  let calculations = [];
  imageAnnotationStatements.forEach(statement => {
    if (statement.objectUniqueIdentifier.root === markupUid) {
      const calculationUid = statement.subjectUniqueIdentifier.root;
      const calculationEntities = getCalculationEntities(aim);
      calculationEntities.forEach(calculation => {
        if (calculation.uniqueIdentifier.root === calculationUid)
          calculations.push(parseCalculation(calculation));
      });
    }
  });
  return calculations;
}

function getImageAnnotationStatements(aim) {
  return aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
    .imageAnnotationStatementCollection.ImageAnnotationStatement;
}

function getCalculationEntities(aim) {
  return aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
    .calculationEntityCollection.CalculationEntity;
}

function parseCalculation(calculation) {
  var obj = {};
  const calcResult = calculation.calculationResultCollection.CalculationResult[0];
  if (calculation.calculationResultCollection.CalculationResult[0].calculationDataCollection) {
    const calcValue =
      calculation.calculationResultCollection.CalculationResult[0].calculationDataCollection
        .CalculationData[0];
    obj['value'] = calcValue['value']['value'];
  } else obj['value'] = calcResult['value']['value'];
  obj['type'] = calculation['description']['value'];
  obj['unit'] = calcResult['unitOfMeasure']['value'];
  return obj;
}

function getAimImageData(image) {
  var obj = {};
  obj.aim = {};
  obj.study = {};
  obj.series = {};
  obj.equipment = {};
  obj.person = {};
  obj.image = [];
  const { aim, study, series, equipment, person } = obj;

  aim.studyInstanceUid = image.data.string('x0020000d') || '';

  study.startTime = image.data.string('x00080030') || '';
  study.instanceUid = image.data.string('x0020000d') || '';
  study.startDate = image.data.string('x00080020') || '';
  study.accessionNumber = image.data.string('x00080050') || '';

  series.instanceUid = image.data.string('x0020000e') || '';
  series.modality = image.data.string('x00080060') || '';

  obj.image.push(getSingleImageData(image));

  equipment.manufacturerName = image.data.string('x00080070') || '';
  equipment.manufacturerModelName = image.data.string('x00081090') || '';
  equipment.softwareVersion = image.data.string('x00181020') || '';

  person.sex = image.data.string('x00100040') || '';
  person.name = image.data.string('x00100010') || '';
  person.patientId = image.data.string('x00100020') || '';
  person.birthDate = image.data.string('x00100030') || '';

  return obj;
}

function getSingleImageData(image) {
  return {
    sopClassUid: image.data.string('x00080016') || '',
    sopInstanceUid: image.data.string('x00080018') || '',
  };
}

function addSingleImageDataToAim(aim, image) {
  if (!aim.image) return;
  aim.image.push(getSingleImageData(image));
}

function createOfflineAimSegmentation(segmentation, userInfo) {
  // prapare the seed data and create aim
  const seedData = getAimImageDataFromSeg(segmentation); //aimhelper
  // admin/ upload user
  addUserToSeedData(seedData, userInfo);
  const aim = new Aim(seedData, enumAimType.imageAnnotation); // no this.updatedAimId.

  // let dataset = await getDatasetFromBlob(segmentation);

  // if update segmentation Uid should be same as the previous one
  console.log('Dataset series uid', segmentation);

  // fill the segmentation related aim parts
  const segEntityData = getSegmentationEntityData(segmentation, 0); // TODO 0 is not correct, referencedseries contains all
  // TODO fill in stats
  const segStats = {};
  addSegmentationToAim(aim, segEntityData, segStats);

  console.log('AIM in segmentation', aim);
  return { aim };
}

function addUserToSeedData(seedData, userInfo) {
  // this is ui specific, should be changed
  if (userInfo) {
    seedData.user = userInfo;
  } else {
    let obj = {};
    obj.loginName = sessionStorage.getItem('username');
    obj.name = sessionStorage.getItem('displayName');
    seedData.user = obj;
  }
}

function getDatasetFromBlob(segBlob, imageIdx) {
  return new Promise(resolve => {
    let segArrayBuffer;
    var fileReader = new FileReader();
    fileReader.onload = event => {
      segArrayBuffer = event.target.result;
      const dicomData = dcmjs.data.DicomMessage.readFile(segArrayBuffer);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
      dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(dicomData.meta);
      resolve(dataset);
    };
    fileReader.readAsArrayBuffer(segBlob);
  });
}

function addSegmentationToAim(aim, segEntityData, segStats) {
  const segId = aim.createSegmentationEntity(segEntityData);

  const { volume, min, max, mean, stdDev } = segStats;

  if (mean) {
    const meanId = aim.createMeanCalcEntity({ mean, unit: "[hnsf'U]" });
    aim.createImageAnnotationStatement(2, segId, meanId);
  }

  if (stdDev) {
    const stdDevId = aim.createStdDevCalcEntity({ stdDev, unit: "[hnsf'U]" });
    aim.createImageAnnotationStatement(2, segId, stdDevId);
  }

  if (min) {
    const minId = aim.createMinCalcEntity({ min, unit: "[hnsf'U]" });
    aim.createImageAnnotationStatement(2, segId, minId);
  }

  if (max) {
    const maxId = aim.createMaxCalcEntity({ max, unit: "[hnsf'U]" });
    aim.createImageAnnotationStatement(2, segId, maxId);
  }

  if (volume) {
    const volumeId = aim.createMaxCalcEntity({ volume, unit: 'mm3' });
    aim.createImageAnnotationStatement(2, segId, volumeId);
  }
}

function getSegmentationEntityData(dataset, imageIdx) {
  let obj = {};
  obj['referencedSopInstanceUid'] =
    dataset.ReferencedSeriesSequence.ReferencedInstanceSequence[imageIdx].ReferencedSOPInstanceUID;
  obj['seriesInstanceUid'] = dataset.SeriesInstanceUID;
  obj['studyInstanceUid'] = dataset.StudyInstanceUID;
  obj['sopClassUid'] = dataset.SOPClassUID;
  obj['sopInstanceUid'] = dataset.SOPInstanceUID;
  return obj;
}

function getAimImageDataFromSeg(image) {
  var obj = {};
  obj.aim = {};
  obj.study = {};
  obj.series = {};
  obj.equipment = {};
  obj.person = {};
  obj.image = [];
  const { aim, study, series, equipment, person } = obj;

  aim.studyInstanceUid = image.StudyInstanceUID || '';

  study.startTime = image.StudyTime || '';
  study.instanceUid = image.StudyInstanceUID || '';
  study.startDate = image.StudyDate || '';
  study.accessionNumber = image.AccessionNumber || '';

  series.instanceUid = image.ReferencedSeriesSequence.SeriesInstanceUID || '';
  series.modality = image.Modality || '';

  obj.image.push(getSingleImageDataFromSeg(image));

  equipment.manufacturerName = image.Manufacturer || '';
  equipment.manufacturerModelName = image.ManufacturerModelName || '';
  equipment.softwareVersion = image.SoftwareVersions || '';

  person.sex = image.PatientSex || '';
  person.name = image.PatientName || '';
  person.patientId = image.PatientID || '';
  person.birthDate = image.PatientBirthDate || '';

  return obj;
}
// TODO 0 is not correct, referencedseries contains all
function getSingleImageDataFromSeg(image) {
  return {
    sopClassUid:
      image.ReferencedSeriesSequence.ReferencedInstanceSequence[0].ReferencedSOPClassUID || '',
    sopInstanceUid:
      image.ReferencedSeriesSequence.ReferencedInstanceSequence[0].ReferencedSOPInstanceUID || '',
  };
}

module.exports = { createOfflineAimSegmentation };
