const chai = require('chai');

const chaiHttp = require('chai-http');
const nock = require('nock');
const studiesResponse = require('./data/studiesResponse.json');
const seriesResponse = require('./data/seriesResponse.json');
const config = require('../config/index');

chai.use(chaiHttp);
const { expect } = chai;

beforeEach(() => {
  nock(config.dicomWebConfig.baseUrl).get('/studies').reply(200, studiesResponse);
  nock(config.dicomWebConfig.baseUrl)
    .get('/studies/0023.2015.09.28.3/series')
    .reply(200, seriesResponse);
  nock(config.dicomWebConfig.baseUrl)
    .matchHeader('content-length', '133095')
    .matchHeader('content-type', (val) =>
      val.includes('multipart/related; type=application/dicom;')
    )
    .post('/studies')
    .reply(200);
  nock(config.dicomWebConfig.baseUrl).delete('/studies/0023.2015.09.28.3').reply(200);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?PatientID=8&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, [{}]);
});

describe('Subject Tests', () => {
  it('we should have 2 subjects in the system', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('the subject in the system should have subject id 3', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].subjectID).to.be.eql('3');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('subject retrieval with subject id 3 should return subject 3 ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/3')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.subjectID).to.be.eql('3');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('subject retrieval with subject id 8 should get 404', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/8')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(404);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('the studies in the system should be 0023.2015.09.28.3 and 1.2.752.24.7.19011385.453825', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/studies')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
        expect(res.body[1].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('the study retrieval in the system with studyuid should return 0023.2015.09.28.3', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/studies/0023.2015.09.28.3')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.studyUID).to.be.eql('0023.2015.09.28.3');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('system should have 8 series and should be from patient 3 and patient 7', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/series')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(8);
        expect(res.body[0].patientID).to.be.eql('3');
        expect(res.body[0].patientName).to.be.eql('Phantom');
        expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
        expect(res.body[0].seriesUID).to.be.eql('0023.2015.09.28.3.3590');
        expect(res.body[1].patientID).to.be.eql('3');
        expect(res.body[1].patientName).to.be.eql('Phantom');
        expect(res.body[1].studyUID).to.be.eql('0023.2015.09.28.3');
        expect(res.body[1].seriesUID).to.be.eql('0023.2015.09.28.3.3590.111');
        expect(res.body[2].patientID).to.be.eql('7');
        expect(res.body[2].patientName).to.be.eql('7^3225^4503');
        expect(res.body[2].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        expect(res.body[2].seriesUID).to.be.eql('1.2.840.113704.1.111.424.1207240880.3');
        expect(res.body[3].patientID).to.be.eql('7');
        expect(res.body[3].patientName).to.be.eql('7^3225^4503');
        expect(res.body[3].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        expect(res.body[3].seriesUID).to.be.eql('1.2.840.113704.1.111.424.1207241028.7');
        expect(res.body[4].patientID).to.be.eql('7');
        expect(res.body[4].patientName).to.be.eql('7^3225^4503');
        expect(res.body[4].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        expect(res.body[4].seriesUID).to.be.eql('1.2.840.113704.1.111.424.1207241028.11');
        expect(res.body[5].patientID).to.be.eql('7');
        expect(res.body[5].patientName).to.be.eql('7^3225^4503');
        expect(res.body[5].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        expect(res.body[5].seriesUID).to.be.eql('1.2.840.113704.1.111.424.1207241028.15');
        expect(res.body[6].patientID).to.be.eql('7');
        expect(res.body[6].patientName).to.be.eql('7^3225^4503');
        expect(res.body[6].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        expect(res.body[6].seriesUID).to.be.eql('1.2.840.113704.1.111.424.1207241369.23');
        expect(res.body[7].patientID).to.be.eql('7');
        expect(res.body[7].patientName).to.be.eql('7^3225^4503');
        expect(res.body[7].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
        expect(res.body[7].seriesUID).to.be.eql('2.25.792642314397553683275682748104452083500');

        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('subject deletion of patient 3 should return 200 ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/subjects/3')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
});
