module.exports.views = {
  aims_summary: {
    map:
      "function(doc){if(doc.aim){empty='NA';subject=doc.aim.ImageAnnotationCollection.person;subjectID=empty;if(subject.id)subjectID=String(subject.id.value);imgref=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageReferenceEntityCollection.ImageReferenceEntity[0];studyUID=empty;if(imgref.imageStudy)studyUID=imgref.imageStudy.instanceUid.root;seriesUID=empty;if(imgref.imageStudy.imageSeries)seriesUID=imgref.imageStudy.imageSeries.instanceUid.root;instanceUID=empty;if(imgref.imageStudy.imageSeries.imageCollection.Image)instanceUID=imgref.imageStudy.imageSeries.imageCollection.Image[0].sopInstanceUid.root;var key={};key.aimID=empty;if(doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].uniqueIdentifier) " +
      'key.aimID=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].uniqueIdentifier.root;key.userName=empty;if(doc.aim.ImageAnnotationCollection.user) ' +
      'key.userName=doc.aim.ImageAnnotationCollection.user.loginName.value;key.subjectID=subjectID;key.studyUID=studyUID;key.seriesUID=seriesUID;key.imageUID=instanceUID;key.instanceOrFrameNumber=empty;key.name=empty;if(doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name) ' +
      "key.name=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split('~')[0];key.template=empty;if(doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode) " +
      'key.template=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code;key.date=empty;if(doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].dateTime) ' +
      'key.date=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].dateTime.value;key.patientName=empty;if(subject.name) ' +
      'key.patientName=subject.name.value;key.studyDate=empty;if(imgref.imageStudy) ' +
      'key.studyDate=imgref.imageStudy.startDate.value;key.comment=empty;if(doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].comment )' +
      "key.comment=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].comment.value.split('~')[0];key.templateType=empty;if(doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode )" +
      "key.templateType=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0]['iso:displayName'].value;key.color=empty;key.dsoFrameNo=empty;key.isDicomSR=empty;key.originalSubjectID=subjectID;emit([subjectID,studyUID,seriesUID,instanceUID,key],1)}} ",
    reduce: '_count()',
  },

  aims_json: {
    map:
      "function(doc){if(doc.aim){subject=doc.aim.ImageAnnotationCollection.person;subjectID='NA';if(subject.id)subjectID=String(subject.id.value);imgref=doc.aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageReferenceEntityCollection.ImageReferenceEntity[0];studyUID='NA';if(imgref.imageStudy)studyUID=imgref.imageStudy.instanceUid.root;seriesUID='NA';if(imgref.imageStudy.imageSeries)seriesUID=imgref.imageStudy.imageSeries.instanceUid.root;instanceUID='NA';if(imgref.imageStudy.imageSeries.imageCollection.Image)instanceUID=imgref.imageStudy.imageSeries.imageCollection.Image[0].sopInstanceUid.root;var i;emit([subjectID,studyUID,seriesUID,instanceUID,doc.aim],1)}} ",
    reduce: '_count()',
  },

  templates_json: {
    map:
      " function(doc) { if (doc.template) { type='image'; if (doc.template.TemplateContainer.Template[0].templateType) type=doc.template.TemplateContainer.Template[0].templateType.toLowerCase(); emit([type, doc.template.TemplateContainer.Template[0].codeValue, doc.template], 1)}} ",
    reduce: '_count()',
  },

  templates_summary: {
    map:
      " function(doc){if(doc.template){key={};key.containerUID=doc.template.TemplateContainer.uid;key.containerName=doc.template.TemplateContainer.name;key.containerDescription=doc.template.TemplateContainer.description;key.containerVersion=doc.template.TemplateContainer.version;key.containerAuthors=doc.template.TemplateContainer.authors;key.containerCreationDate=doc.template.TemplateContainer.creationDate;template={'type':'image'};if(doc.template.TemplateContainer.Template[0].templateType)template.type=doc.template.TemplateContainer.Template[0].templateType.toLowerCase();template.templateName=doc.template.TemplateContainer.Template[0].name;template.templateDescription=doc.template.TemplateContainer.Template[0].description;template.templateUID=doc.template.TemplateContainer.Template[0].uid;template.templateCodeValue=doc.template.TemplateContainer.Template[0].codeValue;template.templateCodeMeaning=doc.template.TemplateContainer.Template[0].codeMeaning;template.templateVersion=doc.template.TemplateContainer.Template[0].version;template.templateAuthors=doc.template.TemplateContainer.Template[0].authors;template.templateCreationDate=doc.template.TemplateContainer.Template[0].creationDate;key.Template=[template];emit([key.Template[0].type,key.Template[0].templateUID,key],1)}} ",
    reduce: '_count()',
  },
};
