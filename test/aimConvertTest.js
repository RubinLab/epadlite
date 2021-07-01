const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');
// eslint-disable-next-line no-global-assign
window = {};
const { fixAimControlledTerms } = require('aimapi');

chai.use(chaiHttp);
const { expect } = chai;

describe.only('Aim Convert Tests', () => {
  it('should convert aim to dicomsr ', (done) => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/bidirectional_recist.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/aim2dicomsr`)
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then((res) => {
        fs.writeFileSync('file.dcm', Buffer.from(res.body));
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('should convert dicomsr to aim from aim', (done) => {
    let jsonBuffer = JSON.parse(fs.readFileSync('test/data/bidirectional_recist.json'));
    // for comparing with the resulting aim we need to compare it to the fixed aim
    jsonBuffer = fixAimControlledTerms(jsonBuffer);
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/dicomsr2aim`)
      .attach('files', 'test/data/sr/bidirectional_sr.dcm', 'bidirectional_sr.dcm')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        // check the aim that was created
        // I need to assert field by field as there are UIDs that are generated from scratch on every conversion
        // TODO returns array for now as I implemented dicomsr2aim to accept multipart and get multiple files
        expect(res.body[0].ImageAnnotationCollection.studyInstanceUid.root).to.equal(
          jsonBuffer.ImageAnnotationCollection.studyInstanceUid.root
        );
        // TODO fix test data?
        expect(res.body[0].ImageAnnotationCollection.seriesInstanceUid.root).to.equal(
          jsonBuffer.ImageAnnotationCollection.seriesInstanceUid.root
        );
        // TODO not in dicomsr
        // expect(res.body[0].ImageAnnotationCollection.accessionNumber.value).to.equal('');
        // TODO
        // expect(res.body[0].ImageAnnotationCollection.dateTime.value).to.equal(
        //   jsonBuffer.ImageAnnotationCollection.dateTime.value
        // );
        expect(res.body[0].ImageAnnotationCollection.user.name.value).to.equal(
          jsonBuffer.ImageAnnotationCollection.user.name.value
        );
        expect(res.body[0].ImageAnnotationCollection.user.loginName.value).to.equal(
          jsonBuffer.ImageAnnotationCollection.user.loginName.value
        );

        // dicomsr has no meaningful data for this TODO fix it
        // expect(res.body[0].ImageAnnotationCollection.equipment.manufacturerName.value).to.equal(
        //   'Unspecified'
        // );
        // expect(
        //   res.body[0].ImageAnnotationCollection.equipment.manufacturerModelName.value
        // ).to.equal('Unspecified');
        // expect(res.body[0].ImageAnnotationCollection.equipment.softwareVersion.value).to.equal('0');
        expect(res.body[0].ImageAnnotationCollection.person.name.value).to.equal(
          jsonBuffer.ImageAnnotationCollection.person.name.value
        );
        expect(res.body[0].ImageAnnotationCollection.person.id.value).to.equal(
          jsonBuffer.ImageAnnotationCollection.person.id.value
        );
        expect(res.body[0].ImageAnnotationCollection.person.birthDate.value).to.equal(
          jsonBuffer.ImageAnnotationCollection.person.birthDate.value
        );
        expect(res.body[0].ImageAnnotationCollection.person.sex.value).to.equal(
          jsonBuffer.ImageAnnotationCollection.person.sex.value
        );
        // TODO update the test dicom sr?
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .trackingUniqueIdentifier.root
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .trackingUniqueIdentifier.root
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].comment.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].comment.value
        );
        // TODO
        // expect(
        //   res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].dateTime.value
        // ).to.equal(
        //   jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].dateTime.value
        // );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root
        );
        // TODO not available in sr
        // expect(
        //   res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
        //     .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startDate.value
        // ).to.equal('');
        // expect(
        //   res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
        //     .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.startTime.value
        // ).to.equal('');
        // expect(
        //   res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
        //     .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.accessionNumber.value
        // ).to.equal('');

        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .instanceUid.root
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .instanceUid.root
        );

        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries.modality
            .code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries.modality
            .code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .imageCollection.Image[0].sopClassUid.root
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .imageCollection.Image[0].sopClassUid.root
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .imageCollection.Image[0].sopInstanceUid.root
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.imageSeries
            .imageCollection.Image[0].sopInstanceUid.root
        );
        // qualitative evaluations
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingPhysicalEntityCollection.ImagingPhysicalEntity[0].typeCode[0].code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingPhysicalEntityCollection.ImagingPhysicalEntity[0].typeCode[0].code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingPhysicalEntityCollection.ImagingPhysicalEntity[0].label.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingPhysicalEntityCollection.ImagingPhysicalEntity[0].label.value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0].typeCode[0].code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0].typeCode[0].code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0].label.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0].label.value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .typeCode[0].code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .typeCode[0].code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0].label
            .value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0].label
            .value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .characteristicQuantificationCollection.CharacteristicQuantification[0].label.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .characteristicQuantificationCollection.CharacteristicQuantification[0].label.value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .characteristicQuantificationCollection.CharacteristicQuantification[0].value.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .characteristicQuantificationCollection.CharacteristicQuantification[0].value.value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .characteristicQuantificationCollection.CharacteristicQuantification[0].valueLabel.value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[0]
            .characteristicQuantificationCollection.CharacteristicQuantification[0].valueLabel.value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[1]
            .typeCode[0].code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[1]
            .typeCode[0].code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[1].label
            .value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[1].label
            .value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[2]
            .typeCode[0].code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[2]
            .typeCode[0].code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[2].label
            .value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[2].label
            .value
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[3]
            .typeCode[0].code
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[3]
            .typeCode[0].code
        );
        expect(
          res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[3].label
            .value
        ).to.equal(
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
            .imagingObservationEntityCollection.ImagingObservationEntity[0]
            .imagingObservationCharacteristicCollection.ImagingObservationCharacteristic[3].label
            .value
        );
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('should convert freehand aim to dicomsr ', (done) => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/sr/freehand.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/aim2dicomsr`)
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then((res) => {
        fs.writeFileSync('file.dcm', Buffer.from(res.body));
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('should convert freehand dicomsr to aim from aim', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/dicomsr2aim`)
      .attach('files', 'test/data/sr/freehand.dcm', 'freehand.dcm')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        // TODO check components one by one
        console.log('aim', res.body);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
});
