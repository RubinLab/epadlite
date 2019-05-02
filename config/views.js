module.exports.views = {
  aims_summary: {
    map:
      "function(doc){if(doc.aim){empty='NA';subject=doc.aim.imageAnnotations.ImageAnnotationCollection.person;subjectID=empty;if(subject.id)subjectID=String(subject.id.value);imgref=doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity;studyUID=empty;if(imgref.imageStudy)studyUID=imgref.imageStudy.instanceUid.root;seriesUID=empty;if(imgref.imageStudy.imageSeries)seriesUID=imgref.imageStudy.imageSeries.instanceUid.root;instanceUID=empty;if(imgref.imageStudy.imageSeries.imageCollection.Image)instanceUID=imgref.imageStudy.imageSeries.imageCollection.Image.sopInstanceUid.root;var key={};key.aimID=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.uniqueIdentifier) " +
      'key.aimID=doc.aim.imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root;key.userName=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.user) ' +
      'key.userName=doc.aim.imageAnnotations.ImageAnnotationCollection.user.loginName.value;key.subjectID=subjectID;key.studyUID=studyUID;key.seriesUID=seriesUID;key.imageUID=instanceUID;key.instanceOrFrameNumber=empty;key.name=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.name) ' +
      "key.name=doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.name.value.split('~')[0];key.template=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.typeCode) " +
      'key.template=doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.typeCode.code;key.date=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.dateTime) ' +
      'key.date=doc.aim.imageAnnotations.ImageAnnotationCollection.dateTime.value;key.patientName=empty;if(subject.name) ' +
      'key.patientName=subject.name.value;key.studyDate=empty;if(imgref.imageStudy) ' +
      'key.studyDate=imgref.imageStudy.startDate.value;key.comment=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.comment )' +
      "key.comment=doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.comment.value.split('~')[0];key.templateType=empty;if(doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.typeCode )" +
      "key.templateType=doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.typeCode['iso:displayName'].value;key.color=empty;key.dsoFrameNo=empty;key.isDicomSR=empty;key.originalSubjectID=subjectID;emit([subjectID,studyUID,seriesUID,instanceUID,key],1)}} ",
    reduce: '_count()',
  },

  aims_json: {
    map:
      "function(doc){if(doc.aim){subject=doc.aim.imageAnnotations.ImageAnnotationCollection.person;subjectID='NA';if(subject.id)subjectID=String(subject.id.value);imgref=doc.aim.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.imageReferenceEntityCollection.ImageReferenceEntity;studyUID='NA';if(imgref.imageStudy)studyUID=imgref.imageStudy.instanceUid.root;seriesUID='NA';if(imgref.imageStudy.imageSeries)seriesUID=imgref.imageStudy.imageSeries.instanceUid.root;instanceUID='NA';if(imgref.imageStudy.imageSeries.imageCollection.Image)instanceUID=imgref.imageStudy.imageSeries.imageCollection.Image.sopInstanceUid.root;var i;emit([subjectID,studyUID,seriesUID,instanceUID,doc.aim],1)}} ",
    reduce: '_count()',
  },

  templates: {
    map:
      ' function(doc) { if (doc.template) { emit([doc.template.Template.codeValue, doc.template], 1)}} ',
    reduce: '_count()',
  },
};
