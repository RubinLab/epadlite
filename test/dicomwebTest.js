const chai = require('chai');

const chaiHttp = require('chai-http');
const nock = require('nock');
const studiesResponse = require('./data/studiesResponse.json');
const seriesResponse = require('./data/seriesResponse.json');
const config = require('../config/index');

chai.use(chaiHttp);
const { expect } = chai;

beforeEach(() => {
  nock(config.dicomWebConfig.baseUrl)
    .get('/studies')
    .reply(200, studiesResponse);
  nock(config.dicomWebConfig.baseUrl)
    .get('/studies/0023.2015.09.28.3/series')
    .reply(200, seriesResponse);
  nock(config.dicomWebConfig.baseUrl)
    .matchHeader('content-length', '133095')
    .matchHeader('content-type', val => val.includes('multipart/related; type=application/dicom;'))
    .post('/studies')
    .reply(200);
  nock(config.dicomWebConfig.baseUrl)
    .delete('/studies/0023.2015.09.28.3')
    .reply(200);
});

describe('Subject Tests', () => {
  it('we should have 1 subject in the system', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('the subject in the system should have subject id 3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].subjectID).to.be.eql('3');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('subject retrieval with subject id 3 should return subject 3 from  project testsubject', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/3')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.subjectID).to.be.eql('3');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('subject retrieval with subject id 7 should get 404  project', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/7')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(404);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('the study in the system should be 0023.2015.09.28.3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/studies')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('the study retrieval in the system with studyuid should return 0023.2015.09.28.3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/studies/0023.2015.09.28.3')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.studyUID).to.be.eql('0023.2015.09.28.3');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('subject deletion of patient 3 should return 200 ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/subjects/3')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
