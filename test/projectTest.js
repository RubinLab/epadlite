const chai = require('chai');

const chaiHttp = require('chai-http');
const fs = require('fs');
const nock = require('nock');
const deepEqualInAnyOrder = require('deep-equal-in-any-order');
const studiesResponse = require('./data/studiesResponse.json');
const studiesResponse3 = require('./data/studiesResponse3.json');
const studiesResponse7 = require('./data/studiesResponse7.json');
const seriesResponse = require('./data/seriesResponse.json');
const seriesResponse7 = require('./data/seriesResponse7.json');
const miracclSeriesResponsePre = require('./data/miracclSeriesResponsePre.json');
const miracclSeriesResponseOn = require('./data/miracclSeriesResponseOn.json');
const miracclSeriesResponsePost = require('./data/miracclSeriesResponsePost.json');
const osirixImageMetadataResponse = require('./data/osirix_image_metadata.json');

const config = require('../config/index');

chai.use(chaiHttp);
chai.use(deepEqualInAnyOrder);
const { expect } = chai;

let server;
before(async () => {
  process.env.host = '0.0.0.0';
  process.env.port = 5987;
  server = require('../server'); // eslint-disable-line
  await server.ready();
});
after(() => {
  server.close();
});
beforeEach(() => {
  const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
  const segBuffer = fs.readFileSync('test/data/testseg.dcm');
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?StudyInstanceUID=0023.2015.09.28.3&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, studiesResponse3);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?StudyInstanceUID=56547547373&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, [{}]);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?limit=100&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, studiesResponse);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?PatientID=3&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, studiesResponse3);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?PatientID=7&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, studiesResponse7);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?PatientID=4&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, [{}]);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/0023.2015.09.28.3/series?includefield=SeriesDescription`
    )
    .reply(200, seriesResponse);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.2.752.24.7.19011385.453825/series?includefield=SeriesDescription`
    )
    .reply(200, seriesResponse7);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.wadoSubPath}/?requestType=WADO&studyUID=1.2.752.24.7.19011385.453825&seriesUID=1.3.6.1.4.1.5962.99.1.3988.9480.1511522532838.2.3.1.1000&objectUID=1.3.6.1.4.1.5962.99.1.3988.9480.1511522532838.2.1.1.1000.1`
    )
    .reply(200, segBuffer);
  nock(config.dicomWebConfig.baseUrl)
    .matchHeader('content-length', '133095')
    .matchHeader('content-type', (val) =>
      val.includes('multipart/related; type=application/dicom;')
    )
    .post(`${config.dicomWebConfig.qidoSubPath}/studies`)
    .reply(200);
  nock(config.dicomWebConfig.baseUrl)
    .delete(`${config.dicomWebConfig.qidoSubPath}/studies/0023.2015.09.28.3`)
    .reply(200);
  nock(config.dicomWebConfig.baseUrl)
    .delete(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.2.752.24.7.19011385.453825/series/1.3.6.1.4.1.5962.99.1.3988.9480.1511522532838.2.3.1.1000`
    )
    .reply(200);
  nock(config.dicomWebConfig.baseUrl)
    .delete(`${config.dicomWebConfig.qidoSubPath}/studies/1.2.752.24.7.19011385.453825`)
    .reply(200);

  nock(config.statsEpad)
    .put('/epad/statistics/')
    .query(
      (query) =>
        query.numOfUsers === '1' &&
        query.numOfProjects === '3' &&
        query.numOfPatients === '2' &&
        query.numOfStudies === '2' &&
        query.numOfSeries === '6' &&
        query.numOfAims === '0' &&
        query.numOfDSOs === '2' &&
        query.numOfWorkLists === '0' &&
        query.numOfFiles === '0' &&
        query.numOfPlugins === '0' &&
        query.numOfTemplates === '1' &&
        query.host.endsWith('0.0.0.0:5987')
    )
    .reply(200);

  nock(config.statsEpad)
    .put('/epad/statistics/')
    .query(
      (query) =>
        query.numOfUsers === '1' &&
        query.numOfProjects === '3' &&
        query.numOfPatients === '2' &&
        query.numOfStudies === '2' &&
        query.numOfSeries === '6' &&
        query.numOfAims === '4' &&
        query.numOfDSOs === '2' &&
        query.numOfWorkLists === '0' &&
        query.numOfFiles === '0' &&
        query.numOfPlugins === '0' &&
        query.numOfTemplates === '0' &&
        query.host.endsWith('0.0.0.0:5987')
    )
    .reply(200);

  nock(config.statsEpad)
    .put(
      '/epad/statistics/usertf',
      (body) => body.length === 0 || (body[0].userId === 1 && body[0].numOfTF === 1)
    )
    .query((query) => query.host.endsWith('0.0.0.0:5987'))
    .reply(200);

  nock(config.statsEpad)
    .put(
      '/epad/statistics/templates/',
      (body) => JSON.stringify(body) === JSON.stringify(jsonBuffer)
    )
    .query(
      (query) =>
        query.templateCode === 'ROI' &&
        query.templateName === 'ROIOnly' &&
        query.authors === 'amsnyder' &&
        query.version === '2.0' &&
        query.templateLevelType === 'Image' &&
        query.templateDescription === 'Template used for collecting only ROIs' &&
        query.numOfAims === '0' &&
        query.host.endsWith('0.0.0.0:5987')
    )
    .reply(200);

  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies?StudyInstanceUID=1.2.752.24.7.19011385.453825&includefield=StudyDescription&includefield=00201206&includefield=00201208&includefield=00080061`
    )
    .reply(200, studiesResponse7);
  nock(config.dicomWebConfig.baseUrl)
    .delete(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.2.752.24.7.19011385.453825/series/2.25.792642314397553683275682748104452083500`
    )
    .reply(200);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.2.752.24.7.19011385.453825/series/2.25.792642314397553683275682748104452083500`
    )
    .reply(200, fs.readFileSync(`${__dirname}/data/segSeriesResponseBinary`, null), {
      'content-type':
        'multipart/related; type=application/dicom; boundary=5ffa277a-004f-3afb-8f88-5c23262e83bb',
      'content-length': '36767',
    });
  nock(config.dicomWebConfig.baseUrl)
    .matchHeader('content-length', '36819')
    .matchHeader('content-type', (val) => val.includes('application/x-www-form-urlencoded'))
    .post(`${config.dicomWebConfig.qidoSubPath}/studies`)
    .reply(200);

  // nock request that needs to be called more than once needs to be persisted, otherwise we get no matching nock
  nock(config.dicomWebConfig.baseUrl)
    .persist()
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.3.6.1.4.1.14519.5.2.1.7695.4164.232867709256560213489962898887/series?includefield=SeriesDescription`
    )
    .reply(200, miracclSeriesResponsePre);

  nock(config.dicomWebConfig.baseUrl)
    .persist()
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.3.6.1.4.1.14519.5.2.1.7695.4164.273794066502136913191366109101/series?includefield=SeriesDescription`
    )
    .reply(200, miracclSeriesResponseOn);
  nock(config.dicomWebConfig.baseUrl)
    .persist()
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.3.6.1.4.1.14519.5.2.1.7695.4164.297906865092698577172413829097/series?includefield=SeriesDescription`
    )
    .reply(200, miracclSeriesResponsePost);
  nock(config.dicomWebConfig.baseUrl)
    .get(
      `${config.dicomWebConfig.qidoSubPath}/studies/1.2.276.0.7230010.3.1.4.0.14358.1629778242.895414/series/1.2.276.0.7230010.3.1.4.0.14358.1629778242.895413/instances/1.2.276.0.7230010.3.1.4.0.14358.1629778242.895416/metadata`
    )
    .reply(200, osirixImageMetadataResponse);
});

describe('Project Tests', () => {
  it('projects should have no projects ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('project create should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'test',
        projectName: 'test',
        projectDescription: 'testdesc',
        defaultTemplate: 'ROI',
        type: 'private',
      })
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('should fail creating lite project ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'lite',
        projectName: 'lite',
        projectDescription: 'liteDesc',
        defaultTemplate: 'ROI',
        type: 'private',
      })
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(400);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('should fail updating lite project ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/lite?projectName=test1')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(400);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('projects should have 1 project with loginnames admin', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0].loginNames).to.include('admin');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('project update should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test?projectName=test1')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('projectname should be updated ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.pop().name).to.be.eql('test1');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('project update with multiple fields should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test?projectName=testupdated&description=testupdated&type=Public')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('multiple project fields should be updated ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        const lastEntry = res.body.pop();
        expect(lastEntry.name).to.be.eql('testupdated');
        expect(lastEntry.description).to.be.eql('testupdated');
        expect(lastEntry.type).to.be.eql('Public');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('project endpoint should return the updated project ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        const lastEntry = res.body;
        expect(lastEntry.name).to.be.eql('testupdated');
        expect(lastEntry.description).to.be.eql('testupdated');
        expect(lastEntry.type).to.be.eql('Public');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('project delete should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/test')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('projects should have no projects ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  describe('Project Template Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testtemplate',
          projectName: 'testtemplate',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testtemplate2',
          projectName: 'testtemplate2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testtemplate3',
          projectName: 'testtemplate3',
          projectDescription: 'test3desc',
          defaultTemplate: '',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate3')
        .query({ username: 'admin' });
      // delete the project created inside tests
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplatedefault')
        .query({ username: 'admin' });
    });

    it('project testtemplate should have no template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project template save should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testtemplate/templates')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should trigger statistics calculation and sending ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/epad/statistics/calc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should get statistics ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/epads/stats/')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            numOfUsers: 1,
            numOfProjects: 3,
            numOfPatients: 2,
            numOfStudies: 2,
            numOfSeries: 6,
            numOfAims: 0,
            numOfDSOs: 2,
            numOfPacs: 0,
            numOfAutoQueries: 0,
            numOfWorkLists: 0,
            numOfFiles: 0,
            numOfTemplates: 1,
            numOfPlugins: 0,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should create new project with ROI template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testtemplatedefault',
          projectName: 'testtemplatedefault',
          projectDescription: 'testtemplatedefaultdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testtemplatedefault should have ROI template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplatedefault/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate3 should have no templates ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate3/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project update of testtemplate3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testtemplate3?defaultTemplate=ROI')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate3 should have ROI template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate3/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate should have 1 template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate should have ROI Only', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate should have template with uid 2.25.121060836007636801627558943005335', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.uid).to.be.eql(
            '2.25.121060836007636801627558943005335'
          );
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project template put to project testtemplate2 as disabled should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put(
          '/projects/testtemplate2/templates/2.25.121060836007636801627558943005335?enable=false'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate2 should have ROI Only', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate2 should have ROI Only as disabled', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].enabled).to.be.eql(false);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project template put to project testtemplate2 as enabled should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testtemplate2/templates/2.25.121060836007636801627558943005335?enable=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate2 should have ROI Only as enabled', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].enabled).to.be.eql(true);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project template delete from testtemplate should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate should have no template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate should have no default template ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.defaulttemplate).to.be.eql(null);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testtemplate2 should still have ROI Only', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('ROI template should still be in the db', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.a('array');
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('template delete with uid 2.25.121060836007636801627558943005335 from system should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate2/templates/2.25.121060836007636801627558943005335?all=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('templates should be empty', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.a('array');
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });

  // subjects tests
  describe('Project Subject Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testsubject',
          projectName: 'testsubject',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testsubject2',
          projectName: 'testsubject2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testsubject3',
          projectName: 'testsubject3',
          projectDescription: 'test3desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      // subject tests require nonassigned and all projects to be present
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: config.unassignedProjectID,
          projectName: config.unassignedProjectID,
          projectDescription: config.unassignedProjectID,
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: config.XNATUploadProjectID,
          projectName: config.XNATUploadProjectID,
          projectDescription: config.XNATUploadProjectID,
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject3')
        .query({ username: 'admin' });
      // delete nonassinged and all
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.unassignedProjectID}`)
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.XNATUploadProjectID}`)
        .query({ username: 'admin' });
    });
    it('project testsubject should have no subjects ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`project ${config.unassignedProjectID} should have 2 subject `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.unassignedProjectID}/subjects`)
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
    it('project subject add of patient 3 to project testsubject should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`project ${config.unassignedProjectID} should have 1 subject `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.unassignedProjectID}/subjects`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`project ${config.XNATUploadProjectID} should have 1 subject `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.XNATUploadProjectID}/subjects`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project subject add of patient 3 to project testsubject2 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject2/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project subject add of patient 3 to project testsubject3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject3/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject should have 1 subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testsubject should have subject 3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
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
    it('project testsubject should have study 0023.2015.09.28.3 of subject 3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects/3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('subject retrieval with project subject endpoint should return subject 3 from  project testsubject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects/3')
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

    it('subject retrieval with project subject endpoint should get 404 for subject 7 from  project testsubject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects/7')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project subject deletion of patient 3 from ${config.XNATUploadProjectID} project should fail without all=true `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.XNATUploadProjectID}/subjects/3`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project subject deletion of patient 3 from testsubject project should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject should have no subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject2 should have 1 subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject2/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject3 should have 1 subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject3 should have 1 subject with correct values ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].subjectName).to.be.eql('Phantom');
          expect(res.body[0].subjectID).to.be.eql('3');
          expect(res.body[0].projectID).to.be.eql('testsubject3');
          expect(res.body[0].displaySubjectID).to.be.eql('3');
          expect(res.body[0].numberOfStudies).to.be.eql(1);
          expect(res.body[0].examTypes).to.be.eql(['MR', 'SEG']);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject3 should have 1 subject with aim count 0 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].numberOfAnnotations).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('aim save to project testtestsubject3 aim should be successful ', (done) => {
      // this is just fake data, I took the sample aim and changed patient
      // TODO put meaningful data
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim_fake.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubject3/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim update to project testtestsubject3 aim via aimfiles interface should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject3/aimfiles/2.25.211702350959705566747388843359605362')
        .attach('files', 'test/data/roi_sample_aim_fake.json', 'roi_sample_aim_fake.json')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject3 should have 1 subject with aim count 1 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].numberOfAnnotations).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('aim returned for testsubject3 testaim with uid 2.25.211702350959705566747388843359605362 should be correct', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim_fake.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/aims/2.25.211702350959705566747388843359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('aims returned for project testsubject3 should have one aim and it should be correct', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim_fake.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.eql([jsonBuffer]);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project aim deletion of aim 2.25.211702350959705566747388843359605362 from testsubject3 project should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject3/aims/2.25.211702350959705566747388843359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject3 should have 1 subject with aim count 0 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].numberOfAnnotations).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project subject deletion of patient 3 of system using testsubject3 project should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject3/subjects/3?all=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`${config.unassignedProjectID} should have two subjects`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.unassignedProjectID}/subjects`)
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

    it(`project subject deletion of patient 3 from ${config.unassignedProjectID} project without all=true should fail `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.unassignedProjectID}/subjects/3`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project subject deletion of patient 3 from ${config.unassignedProjectID} project using all=true should be successful `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.unassignedProjectID}/subjects/3?all=true`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project subject add of patient 3 to project testsubject3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject3/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project subject deletion of patient 3 from ${config.XNATUploadProjectID} project using all=true should be successful `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.XNATUploadProjectID}/subjects/3?all=true`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject should have no subject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject2 should have no subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject2/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testsubject3 should have no subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  // study tests
  describe('Project Study Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'teststudy',
          projectName: 'teststudy',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'teststudy2',
          projectName: 'teststudy2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'teststudy3',
          projectName: 'teststudy3',
          projectDescription: 'test3desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      // study tests require nonassigned and all projects to be present
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: config.unassignedProjectID,
          projectName: config.unassignedProjectID,
          projectDescription: config.unassignedProjectID,
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: config.XNATUploadProjectID,
          projectName: config.XNATUploadProjectID,
          projectDescription: config.XNATUploadProjectID,
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy3')
        .query({ username: 'admin' });
      // delete nonassinged and all
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.unassignedProjectID}`)
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.XNATUploadProjectID}`)
        .query({ username: 'admin' });
    });
    it('project teststudy should have no subjects ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project ${config.unassignedProjectID} subject 3 should have 1 study `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.unassignedProjectID}/subjects/3/studies`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project study add of study 0023.2015.09.28.3 to project teststudy should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project ${config.unassignedProjectID} subject 3 should have no studies `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.unassignedProjectID}/subjects/3/studies`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project ${config.XNATUploadProjectID} subject 3 should have 1 study `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.XNATUploadProjectID}/subjects/3/studies`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project study add of study 0023.2015.09.28.3 to project teststudy2 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy2/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project study add of study 0023.2015.09.28.3 to project teststudy3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy3/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 1 subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project teststudy should have subject 3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
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
    it('project teststudy should have 1 study and it should be 0023.2015.09.28.3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].referringPhysicianName).to.be.eql('');
          expect(res.body[0].birthdate).to.be.eql('2014-12-12');
          expect(res.body[0].sex).to.be.eql('M');
          expect(res.body[0].studyDescription).to.be.eql('Made up study desc');
          expect(res.body[0].studyAccessionNumber).to.be.eql('Made up accession');
          expect(res.body[0].numberOfImages).to.be.eql(1);
          expect(res.body[0].numberOfSeries).to.be.eql(1);
          expect(res.body[0].numberOfAnnotations).to.be.eql(0);
          expect(res.body[0].studyID).to.be.eql('3');
          expect(res.body[0].studyDate).to.be.eql('2015-09-28');
          expect(res.body[0].studyTime).to.be.eql('17:04:37');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 2 series including DSO', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should set significant series for study 0023.2015.09.28.3 to project teststudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3/significantSeries')
        .query({ username: 'admin' })
        .send([{ seriesUID: '0023.2015.09.28.3.3590', significanceOrder: 1 }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 2 series including DSO and one should be marked as significant by project only', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].significanceOrder).to.be.eql(1);
          expect(res.body[1]).to.not.have.property('significanceOrder');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 2 series including DSO and one should be marked as significant by project and study', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].significanceOrder).to.be.eql(1);
          expect(res.body[1]).to.not.have.property('significanceOrder');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 1 significant series by project, subject and study', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3/significantseries')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].seriesUID).to.be.eql('0023.2015.09.28.3.3590');
          expect(res.body[0].significanceOrder).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 1 significant series by project and study', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/studies/0023.2015.09.28.3/significantseries')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].seriesUID).to.be.eql('0023.2015.09.28.3.3590');
          expect(res.body[0].significanceOrder).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should clear significant series for study 0023.2015.09.28.3 to project teststudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3/significantSeries')
        .query({ username: 'admin' })
        .send([{ seriesUID: '0023.2015.09.28.3.3590', significanceOrder: 0 }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 2 series including DSO and none should be marked as significant by project only', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0]).to.not.have.property('significanceOrder');
          expect(res.body[1]).to.not.have.property('significanceOrder');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have 1 nonDSO series and it should be 0023.2015.09.28.3.3590', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/series?filterDSO=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].seriesUID).to.be.eql('0023.2015.09.28.3.3590');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have study 0023.2015.09.28.3 of subject 3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project study endpoint should return study entity for project teststudy, study 0023.2015.09.28.3 of subject 3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3')
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

    it('project study endpoint should return 404 for made up study 56547547373', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies/56547547373')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project study deletion of patient 3 study 0023.2015.09.28.3 from teststudy project should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have no subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy2 should have 1 subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy2/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy3 should have 1 subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project study deletion of patient 3 study 0023.2015.09.28.3 of system should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy3/subjects/3/studies/0023.2015.09.28.3?all=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`${config.unassignedProjectID} should have two subjects`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(`/projects/${config.unassignedProjectID}/subjects`)
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

    it(`project study deletion of patient 3 study 0023.2015.09.28.3 from ${config.unassignedProjectID} project without all=true should fail `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.unassignedProjectID}/subjects/3/studies/0023.2015.09.28.3`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project study deletion of patient 3 study 0023.2015.09.28.3 from ${config.unassignedProjectID} project using all=true should be successful `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(
          `/projects/${config.unassignedProjectID}/subjects/3/studies/0023.2015.09.28.3?all=true`
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project study add of study 0023.2015.09.28.3 to project teststudy3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy3/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project study deletion of patient 3 study 0023.2015.09.28.3 from ${config.XNATUploadProjectID} project without all=true should fail `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/projects/${config.XNATUploadProjectID}/subjects/3/studies/0023.2015.09.28.3`)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it(`project study deletion of patient 3 study 0023.2015.09.28.3 from ${config.XNATUploadProjectID} project using all=true should be successful `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(
          `/projects/${config.XNATUploadProjectID}/subjects/3/studies/0023.2015.09.28.3?all=true`
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy should have no subject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy2 should have no subject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy2/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project teststudy3 should have no subject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy3/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project Aim Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testaim',
          projectName: 'testaim',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testaim2',
          projectName: 'testaim2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testaim3',
          projectName: 'testaim3',
          projectDescription: 'test3desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim3')
        .query({ username: 'admin' });
    });
    it('project testaim should have no aims ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('fail saving aim to project all ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(`/projects/${config.XNATUploadProjectID}/aims`)
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('fail saving aim to project unassigned ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(`/projects/${config.unassignedProjectID}/aims`)
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim save to project testaim should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim should have one aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.a('array');
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for project testaim with uid 2.25.211702350959705565754863799143359605362 should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for project testaim with uid 2.25.211702350959705565754863799143359605362 should be correct', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aims returned for project testaim should have one aim and it should be correct', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.eql([jsonBuffer]);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testaim2 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim2/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testaim3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim3/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim endpoint should return aim for project testaim2, aim 2.25.211702350959705565754863799143359605362', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ImageAnnotationCollection.uniqueIdentifier.root).to.be.eql(
            '2.25.211702350959705565754863799143359605362'
          );
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project aim endpoint should return 404 for made up aimuid ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims/56547547373')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116 in project testaim should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 of patient 13116 in project testaim should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 with field series_uid', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
        )
        .query({ username: 'admin', field: 'series_uid', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            '1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313': 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 with field image_uid', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
        )
        .query({ username: 'admin', field: 'image_uid', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            '1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184625010': 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 with field subject_uid', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
        )
        .query({ username: 'admin', field: 'subject_uid', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            13116: 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
        )
        .query({ username: 'admin', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            '1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313': 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for subject 13116 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/subjects/13116/aims')
        .query({ username: 'admin', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            '1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110': 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
        )
        .query({ username: 'admin', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            '1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184625010': 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('return correct aim counts for project testaim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin', format: 'count' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            13116: 1,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for patient 13116 in project testaim should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/subjects/13116/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116 with aimuid in project testaim should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims/2.25.211702350959705565754863799143359605362'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 of patient 13116 with aimuid in project testaim should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims/2.25.211702350959705565754863799143359605362'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for patient 13116 with aimuid in project testaim should be Lesion1', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/subjects/13116/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim update with changing the name to Lesion2 and markup change should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      const nameSplit = jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
        '~'
      );
      nameSplit[0] = 'Lesion2';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = nameSplit.join(
        '~'
      );
      // change shape
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection.MarkupEntity[0].twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate[0].x.value = 100;
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection.MarkupEntity[0].twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate[0].y.value = 100;
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put(`/projects/testaim/aims/${jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root}`)
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);

          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // get changes test
    it('aim changes should have shape change', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims/changes?rawData=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.data[0].name).to.be.eql('Lesion2');
          expect(res.body.data[0].changes).to.be.eql(
            'Current shape: [(100 100;179.48764044943823 201.34831460674158)] Old shape: [(112.7550561797753 222.05842696629216;179.48764044943823 201.34831460674158)]'
          );
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('aim returned for project testaim should be Lesion2 now', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim deletion of aim 2.25.211702350959705565754863799143359605362 from testaim project should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // TODO delete from project only changes??

    it('project testaim should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim2 should have 1 aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim3 should have 1 aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project aim deletion of aim 2.25.211702350959705565754863799143359605362 of system should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim3/aims/2.25.211702350959705565754863799143359605362?all=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // get changes test
    it('aim changes should have deletion change', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims/changes?rawData=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.data[0].name).to.be.eql('Lesion2');
          expect(res.body.data[0].changes).to.be.eql('Deleted');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim2 should have no aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    // set up again
    it('aim save to project testaim should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim should have one aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.a('array');
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testaim2 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim2/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testaim3 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim3/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim2 should have 1 aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim3 should have 1 aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete aim 2.25.211702350959705565754863799143359605362 of system in bulk', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim3/aims/delete?all=true')
        .query({ username: 'admin' })
        .send(['2.25.211702350959705565754863799143359605362'])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim should have no aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim2 should have no aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no aim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project study add of study 0023.2015.09.28.3 to project testaim should be successful for set up ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // set up again with fake aim
    it('aim save to project testaim should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim_fake.json'));
      // make it a teaching file to test the copy
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode[0].code =
        config.teachingTemplate;
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // add significant series to testaim
    it('should set significant series for study 0023.2015.09.28.3 to project testaim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim/subjects/3/studies/0023.2015.09.28.3/significantSeries')
        .query({ username: 'admin' })
        .send([{ seriesUID: '0023.2015.09.28.3.3590', significanceOrder: 1 }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim should have 2 series with significant order set', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].significanceOrder).to.be.eql(1);
          expect(res.body[1]).to.not.have.property('significanceOrder');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no studies ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no aims ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should copy 2.25.211702350959705566747388843359605362 to testaim3 project (adding the study to project too', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim3/fromprojects/testaim/aims/copy')
        .query({ username: 'admin' })
        .send(['2.25.211702350959705566747388843359605362'])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have 1 study ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // should have significant series
    it('project testaim3 should have 2 series with significance order copied', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].significanceOrder).to.be.eql(1);
          expect(res.body[1]).to.not.have.property('significanceOrder');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('project testaim3 should have 1 aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete aim 2.25.211702350959705566747388843359605362 of system in bulk', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim3/aims/delete?all=true')
        .query({ username: 'admin' })
        .send(['2.25.211702350959705566747388843359605362'])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim2 should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should not have aim 2.25.211702350959705566747388843359605362 but should have another', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          expect(res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root).to.be.not.eql(
            '2.25.211702350959705566747388843359605362'
          );
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .post('/projects/testaim3/aims/delete?all=true')
            .query({ username: 'admin' })
            .send([res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root])
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('delete study from testaim3 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim3/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no studies ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    // set up again with seg aim
    it('aim save to project testaim should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/seg_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no studies ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no aims ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should copy 2.25.595281743701167154152556092956228240212 to testaim3 project (adding the study to project too)', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim3/aims/copy')
        .query({ username: 'admin' })
        .send(['2.25.595281743701167154152556092956228240212'])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have 1 study ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].studyUID).to.be.eql('1.2.752.24.7.19011385.453825');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have 1 aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          // add the nock to delete the copy segmentation
          nock(config.dicomWebConfig.baseUrl)
            .delete(
              `${config.dicomWebConfig.qidoSubPath}/studies/1.2.752.24.7.19011385.453825/series/${res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].segmentationEntityCollection.SegmentationEntity[0].seriesInstanceUid.root}`
            )
            .reply(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete aim 2.25.595281743701167154152556092956228240212 of system in bulk', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim3/aims/delete?all=true')
        .query({ username: 'admin' })
        .send(['2.25.595281743701167154152556092956228240212'])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim2 should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should not have aim 2.25.595281743701167154152556092956228240212 but should have another', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          expect(res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root).to.be.not.eql(
            '2.25.595281743701167154152556092956228240212'
          );
          // new aim should have different segmentation instance and series uids
          const segEntity =
            res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
              .segmentationEntityCollection;
          const segSeriesUID = segEntity.SegmentationEntity[0].seriesInstanceUid.root;
          const segInctanceUID = segEntity.SegmentationEntity[0].sopInstanceUid.root;
          expect(segSeriesUID).to.be.not.eql('2.25.792642314397553683275682748104452083500');
          expect(segInctanceUID).to.be.not.eql('2.25.675293953039606357330419073585346644464');

          // the DSO object should be the same size?
          // nock send size verification actually does this!

          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .post('/projects/testaim3/aims/delete?all=true')
            .query({ username: 'admin' })
            .send([res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root])
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no aim ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('delete study from testaim3 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim3/subjects/7/studies/1.2.752.24.7.19011385.453825')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have no studies ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    // add a teaching file in lite and a regular aim
    it('Teaching aim save to project testaim should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/teaching_aim2.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('Roi aim save to project testaim should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim should have 2 aims ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(2);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    // add a teaching file in another project
    it('Teaching aim save to project testaim3 should be successful ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/teaching_aim2.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim3/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testaim3 should have 1 aims ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should trigger statistics calculation and sending ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          console.log('projectsss', res.body);
        });
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/epad/statistics/calc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should get statistics ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/epads/stats/')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql({
            numOfUsers: 1,
            numOfProjects: 3,
            numOfPatients: 2,
            numOfStudies: 2,
            numOfSeries: 6,
            numOfAims: 4,
            numOfDSOs: 2,
            numOfPacs: 0,
            numOfAutoQueries: 0,
            numOfWorkLists: 0,
            numOfFiles: 0,
            numOfTemplates: 0,
            numOfPlugins: 0,
          });
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should get user TF statistics ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/epads/stats/usertf')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql([
            {
              userId: 1,
              numOfTF: 1,
              templateCode: '99EPAD_947',
              year: 2024,
              month: 5,
            },
          ]);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project File Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfile',
          projectName: 'testfile',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfile2',
          projectName: 'testfile2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfile3',
          projectName: 'testfile3',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfile')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfile2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfile3')
        .query({ username: 'admin' });
    });
    it('project testfile should have no files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('unknown extension file upload should fail ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfile/files')
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testfile should still have no files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('jpg file upload should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfile/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testfile should have 1 file ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfile2 project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfile2/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfile3 project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfile3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get json with filename (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfile/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should download file with filename (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfile/files/${res.body[0].name}`)
            .query({ format: 'stream', username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('jpg file delete with filename retrieval and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfile/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testfile should have no files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testfile2 should have 1 file ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile2/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('jpg file delete from system with filename retrieval from testfile2 and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile2/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfile2/files/${res.body[0].name}`)
            .query({ all: 'true' })
            .query({ username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testfile2 should have no files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile2/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testfile3 should have no files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project File Subject Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilesubject',
          projectName: 'testfilesubject',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilesubject2',
          projectName: 'testfilesubject2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilesubject3',
          projectName: 'testfilesubject3',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilesubject4',
          projectName: 'testfilesubject4',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfilesubject/subjects/3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfilesubject2/subjects/3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfilesubject3/subjects/3')
        .query({ username: 'admin' });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject4')
        .query({ username: 'admin' });
    });
    it('should return no files for subject 3 in project testfilesubject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail uploading unknown extension file to subject 3 in project testfilesubject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilesubject/subjects/3/files')
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should still return no files for subject 3 in project testfilesubject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail uploading jpg file to subject 7 nonexistent in project testfilesubject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilesubject/subjects/7/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to subject 3 in project testfilesubject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilesubject/subjects/3/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for subject 3 in project testfilesubject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfilesubject2 project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfilesubject2/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfilesubject3 project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfilesubject3/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail with 400 adding add file to testfilesubject4 project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfilesubject4/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(400);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get json with filename (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfilesubject/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should download file with filename (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfilesubject/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .query({ format: 'stream' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testfilesubject with filename retrieval and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfilesubject/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3 in project testfilesubject ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for subject 3 in project testfilesubject2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject2/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from system with filename retrieval from testfilesubject2 and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject2/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfilesubject2/subjects/3/files/${res.body[0].name}`)
            .query({ all: 'true', username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3 in project testfilesubject2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject2/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3 in project testfilesubject3 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject3/subjects/3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project File Study Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilestudy',
          projectName: 'testfilestudy',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilestudy2',
          projectName: 'testfilestudy2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilestudy3',
          projectName: 'testfilestudy3',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfilestudy4',
          projectName: 'testfilestudy4',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfilestudy/subjects/3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfilestudy2/subjects/3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfilestudy3/subjects/3')
        .query({ username: 'admin' });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilestudy')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilestudy2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilestudy3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilestudy4')
        .query({ username: 'admin' });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3 in project testfilestudy', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail uploading unknown extension file to subject 3, study 0023.2015.09.28.3 in project testfilestudy', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should still return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail uploading jpg file to subject 7, study 64363473737.86569494 nonexistent in project testfilestudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilestudy/subjects/7/studies/64363473737.86569494/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to subject 3, study 0023.2015.09.28.3  in project testfilestudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, study 0023.2015.09.28.3  in project testfilestudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfilestudy2 project, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfilestudy3 project, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfilestudy3/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail adding add file to testfilestudy4, study 0023.2015.09.28.3  project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfilestudy4/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(400);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get json with filename, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should download file with filename, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ format: 'stream', username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testfilestudy, study 0023.2015.09.28.3  with filename retrieval and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, study 0023.2015.09.28.3  in project testfilestudy2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file of study 0023.2015.09.28.3 from system with filename retrieval from testfilestudy2 and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files/${res.body[0].name}`
            )
            .query({ all: 'true', username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy3 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy3/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project File Series Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfileseries',
          projectName: 'testfileseries',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfileseries2',
          projectName: 'testfileseries2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfileseries3',
          projectName: 'testfileseries3',
          projectDescription: 'test3desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testfileseries4',
          projectName: 'testfileseries4',
          projectDescription: 'test4desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfileseries/subjects/3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfileseries2/subjects/3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testfileseries3/subjects/3')
        .query({ username: 'admin' });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfileseries')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfileseries2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfileseries3')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfileseries4')
        .query({ username: 'admin' });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590 in project testfileseries', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail uploading unknown extension file to subject 3, series 0023.2015.09.28.3.3590 in project testfileseries', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should still return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail uploading jpg file to subject 7, study 64363473737.86569494 nonexistent in project testfileseries ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfileseries/subjects/7/studies/64363473737.86569494/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfileseries2 project, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add file to testfileseries3 project, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfileseries3/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail adding add file to testfileseries4, series 0023.2015.09.28.3.3590  project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfileseries4/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(400);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get json with filename, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should download file with filename, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ format: 'stream', username: 'admin' })
            .then((resGet) => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testfileseries, series 0023.2015.09.28.3.3590  with filename retrieval and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file of series 0023.2015.09.28.3.3590 from system with filename retrieval from testfileseries2 and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${res.body[0].name}`
            )
            .query({ all: 'true', username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries3 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries3/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project Association Tests', () => {
    it('should create testassoc project ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testassoc',
          projectName: 'testassoc',
          projectDescription: 'testassocdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        })
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should return no files for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no templates for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no aims for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should upload jpg file to testassoc project ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should save ROI template to testassoc project', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc/templates')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should save sample aim save to project testassoc', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add subject 3 to project testassoc', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testassoc/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should return 1 file for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 template for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('1 template for system should have testassoc project in projects in summary format', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].projects).to.include('testassoc');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 aim for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should return 1 file for project testassoc ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 template for project testassoc  ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 aim for project testassoc  ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 subject for project testassoc  ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should create testassoc2 project ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testassoc2',
          projectName: 'testassoc2',
          projectDescription: 'testassoc2desc',
          defaultTemplate: '', // giving default template automatically adds the template to the project
          type: 'private',
        })
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail creating testassoc2 project again ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testassoc2',
          projectName: 'testassoc2',
          projectDescription: 'testassoc2desc',
          defaultTemplate: '', // giving default template automatically adds the template to the project
          type: 'private',
        })
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testassoc2 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testassoc2/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim endpoint should return aim 2.25.211702350959705565754863799143359605362 for project testassoc ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          expect(res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root).to.be.eql(
            '2.25.211702350959705565754863799143359605362'
          );
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim endpoint should return aim 2.25.211702350959705565754863799143359605362 for project testassoc2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          expect(res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root).to.be.eql(
            '2.25.211702350959705565754863799143359605362'
          );
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete project testassoc', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testassoc')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim endpoint should return no aim for project testassoc ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project aim endpoint should return aim 2.25.211702350959705565754863799143359605362 for project testassoc2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc2/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          expect(res.body.rows[0].ImageAnnotationCollection.uniqueIdentifier.root).to.be.eql(
            '2.25.211702350959705565754863799143359605362'
          );
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should create testassoc3 project ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testassoc3',
          projectName: 'testassoc3',
          projectDescription: 'testassoc3desc',
          defaultTemplate: 'ROI',
          type: 'private',
        })
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to project testassoc2 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc2/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add first file to testassoc2 project (filename retrieval is done via get all) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc2/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testassoc3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to project testassoc2 second time ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc2/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to project testassoc2 third time ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc2/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project testassoc2 should have 3 files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc2/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(3);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete project testassoc2', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testassoc2')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('jpg file delete from system with filename retrieval from testassoc3 and delete should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc3/files')
        .query({ username: 'admin' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testassoc3/files/${res.body[0].name}`)
            .query({ all: 'true', username: 'admin' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no files for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no templates for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no aims for system ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/aims')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete project testassoc3', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testassoc3')
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
  describe('Project Nondicom Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testsubjectnondicom',
          projectName: 'testsubjectnondicom',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubjectnondicom')
        .query({ username: 'admin' });
    });
    it('project testsubjectnondicom should have no subjects ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project subject add of patient 3 to project testsubject should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubjectnondicom/subjects/3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail adding nondicom patient 3 to project testsubjectnondicom ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '3', name: 'testnondicom' })
        .then((res) => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed adding nondicom patient 4 to project testsubjectnondicom ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '4', name: 'testnondicom' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail adding nondicom patient 4 to project testsubjectnondicom again with 409', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '4', name: 'testnondicom' })
        .then((res) => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 2 subjects ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects')
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
    it('should fail adding nondicom patient 4 to project testsubjectnondicom again ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '4', name: 'testnondicom' })
        .then((res) => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project study add of study 0023.2015.09.28.3 to project testsubjectnondicom should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubjectnondicom/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project study add of nondicom study 4315541363646543 ABC to project testsubjectnondicom patient 4 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .send({ studyUid: '4315541363646543', studyDesc: 'ABC' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 1 study for patient 4 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail trying to add same nondicom study 4315541363646543 ABC to project testsubjectnondicom patient 4 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .send({ studyUid: '4315541363646543', studyDesc: 'ABC' })
        .then((res) => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project study add of nondicom study 5647545377 ABC2 to project testsubjectnondicom patient 4 should be successful ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .send({ studyUid: '5647545377', studyDesc: 'ABC2' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 2 studies for patient 4 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects/4/studies')
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
    it('should succeed to adding nondicom series 14356765342 DESC to study 4315541363646543 to project testsubjectnondicom patient 4 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies/4315541363646543/series')
        .query({ username: 'admin' })
        .send({ seriesUid: '14356765342', description: 'DESC' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return one nondicom series 14356765342 DESC for project testsubjectnondicom ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects/4/studies/4315541363646543/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should set significant series for study 4315541363646543 to project testsubjectnondicom ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubjectnondicom/subjects/4/studies/4315541363646543/significantSeries')
        .query({ username: 'admin' })
        .send([{ seriesUID: '14356765342', significanceOrder: 1 }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should return one nondicom series 14356765342 DESC for project testsubjectnondicom and should be significant ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects/4/studies/4315541363646543/series')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].significanceOrder).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete nondicom series 14356765342 from project testsubjectnondicom patient 4 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(
          '/projects/testsubjectnondicom/subjects/4/studies/4315541363646543/series/14356765342'
        )
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed to adding nondicom series 6457327373 DESC2 to study 4315541363646543 to project testsubjectnondicom patient 4 ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies/4315541363646543/series')
        .query({ username: 'admin' })
        .send({ seriesUid: '6457327373', description: 'DESC2' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete nondicom study 4315541363646543 from project testsubjectnondicom patient 4 including the series', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubjectnondicom/subjects/4/studies/4315541363646543')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 nondicom studies for patient 4 and it should be 5647545377 from project testsubjectnondicom ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].studyUID).to.be.eql('5647545377');
          expect(res.body[0].studyDescription).to.be.eql('ABC2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete nondicom patient 4 from project testsubjectnondicom including study ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubjectnondicom/subjects/4')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return no patients from project testsubjectnondicom ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].subjectID).to.be.eql('3');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Project Reporting Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'reporting',
          projectName: 'reportingName',
          projectDescription: 'reporting desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/reporting')
        .query({ username: 'admin' });
    });
    // just adding 7 like a nondicom to not messup other tests
    // and to make sure it exists in the project for the waterfallproject tests
    it('should fail adding subject 7 to project reporting like nondicom', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/reporting/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '7', name: 'fake7' })
        .then((res) => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should add subject 7 to project reporting', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/reporting/subjects/7')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should save 12 aims', (done) => {
      fs.readdir('test/data/recist_annotations', async (err, files) => {
        if (err) {
          throw new Error(`Reading directory test/data/recist_annotations`, err);
        } else {
          for (let i = 0; i < files.length; i += 1) {
            const jsonBuffer = JSON.parse(
              fs.readFileSync(`test/data/recist_annotations/${files[i]}`)
            );
            // eslint-disable-next-line no-await-in-loop
            await chai
              .request(`http://${process.env.host}:${process.env.port}`)
              .post('/projects/reporting/aims')
              .send(jsonBuffer)
              .query({ username: 'admin' });
          }

          done();
        }
      });
    });

    it('project reporting should have 12 aims', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/aims_summary.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/aims?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.a('array');
          expect(res.body.rows.length).to.be.eql(12);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('subject 7 should have 12 aims', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/aims_summary.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/subjects/7/aims?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.a('array');
          expect(res.body.rows.length).to.be.eql(12);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct recist report', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/patient7_recist.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/subjects/7/aims?report=RECIST')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct longitudinal report', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/patient7_longitudinal.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/subjects/7/aims?report=Longitudinal')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct ADLA report', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/patient7_adla.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/subjects/7/aims?report=Longitudinal&shapes=line')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct longitudinal_ref list', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/longitudinal_ref_7.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/subjects/7/aims?longitudinal_ref=true')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct RECIST waterfall report for project', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/waterfall_recist_project.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/reports/waterfall?type=BASELINE&metric=RECIST')
        .query({ username: 'admin' })
        .send({ projectID: 'reporting' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct ADLA waterfall report for project', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/waterfall_adla_project.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/reports/waterfall?type=BASELINE&metric=ADLA')
        .query({ username: 'admin' })
        .send({ projectID: 'reporting' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should return correct RECIST waterfall report for subject selection with subjectuids', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/waterfall_recist_project.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/reports/waterfall?type=BASELINE&metric=RECIST')
        .query({ username: 'admin' })
        .send({ projectID: 'reporting', subjectUIDs: ['7'] })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct ADLA waterfall report subject selection with subjectuids', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/waterfall_adla_project.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/reports/waterfall?type=BASELINE&metric=ADLA')
        .query({ username: 'admin' })
        .send({ projectID: 'reporting', subjectUIDs: ['7'] })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should return correct RECIST waterfall report for subject projects pairs selection', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/waterfall_recist_project.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/reports/waterfall?type=BASELINE&metric=RECIST')
        .query({ username: 'admin' })
        .send({ pairs: [{ subjectID: '7', projectID: 'reporting' }] })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct ADLA waterfall report for subject projects pairs selection', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/waterfall_adla_project.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/reports/waterfall?type=BASELINE&metric=ADLA')
        .query({ username: 'admin' })
        .send({ pairs: [{ subjectID: '7', projectID: 'reporting' }] })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail getting  recist report without subject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/aims?report=RECIST')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail getting longitudinal report without subject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/aims?report=Longitudinal')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail getting ADLA report without subject', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/aims?report=Longitudinal&shapes=line')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return return correct output for search with project and template query', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/search_proj_temp.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/search?project=reporting&template=RECIST')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(12);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return return correct output for search with project and template query using manual query', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/search_proj_temp.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/search?query=(project:reporting AND template_code:RECIST)')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(12);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return return correct output for search with project and template query using manual query in body', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/search_proj_temp.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({ query: 'project:reporting AND template_code:RECIST' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(12);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return return correct output for search with anatomy query', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/search_liver.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/search?project=reporting&template=RECIST&anatomy=liver')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(8);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return return correct output for search with anatomy query with astericks', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/search_liver.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/search?project=reporting&template=RECIST&anatomy=li*')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(8);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return return correct output for search with observation baseline query', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/search_baseline.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/search?project=reporting&template=RECIST&observation=baseline')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(3);
          expect(res.body.rows).to.deep.equalInAnyOrder(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete 3 patient 7 aims in bulk', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/reporting/aims/delete')
        .query({ username: 'admin' })
        .send([
          '2.85495.2279281.808.5508624424.662687190.8934.465874.35523583.20',
          '4975004754.4572554.6718.264148.6.63395139.53807.424263432.33.539',
          '86914783.343.864898894.3193.1972571178.8116451.8.47.51974.839236',
          '6995867818.12.602.3091148.128221.6.31295599.28498.595039688.8001',
        ])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return correct recist report after lesion 3 is deleted', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync(`test/data/patient7_recist_nolesion3.json`));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/subjects/7/aims?report=RECIST')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should delete rest of the patient 7 aims in bulk', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/reporting/aims/delete')
        .query({ username: 'admin' })
        .send([
          '2224336.8.38839452.4571.71.99844.112.927612841.501915.4782790673',
          '62986.5481880579.8.8819901.636975.623478550.4642.63.692.96325285',
          '2290364.9180630344.21.222.76372.594588.5.11013629.6167.473172295',
          '3.1726.2461110115.7711979.252439673.81.50939.120.728862.42696093',
          '86102.67.297.709077.17647152.9.7172497.220820098.7510.5797255882',
          '3758329.97307.274.199339097.696573.77029782.8552223412.99.3106.5',
          '460094.49039853.9919683716.21820.3563633.409.8.813686790.89.4569',
          '873.7800.829623.4888153.52382582.440801281.6.64.81507.2700669455',
        ])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('project reporting should have no aims', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/reporting/aims?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.a('array');
          expect(res.body.rows.length).to.be.eql(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });

  describe('Project Delete on No Aim Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'studydelnoaim',
          projectName: 'studydelnoaim',
          projectDescription: 'studydelnoaim desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      process.env.DELETE_NO_AIM_STUDY = true;
      config.deleteNoAimStudy = true;
    });
    after(async () => {
      process.env.DELETE_NO_AIM_STUDY = false;
      config.deleteNoAimStudy = false;
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/studydelnoaim')
        .query({ username: 'admin' });
    });
    it('add subject 3, study 0023.2015.09.28.3 to project studydelnoaim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/studydelnoaim/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('save fake aim to project studydelnoaim ', (done) => {
      // this is just fake data, I took the sample aim and changed patient
      // TODO put meaningful data
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim_fake.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/studydelnoaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('get studies of project studydelnoaim', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/studydelnoaim/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.equal(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('delete aim 2.25.211702350959705566747388843359605362 of system in bulk', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/studydelnoaim/aims/delete?all=true')
        .query({ username: 'admin' })
        .send(['2.25.211702350959705566747388843359605362'])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('get studies of project studydelnoaim again with no study', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/studydelnoaim/studies')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.equal(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });

  describe('Project Export Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'miraccl',
          projectName: 'miraccl',
          projectDescription: 'miraccl',
          defaultTemplate: 'ROI',
          type: 'private',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/miraccl')
        .query({ username: 'admin' });
    });

    it('should save 12 aims', (done) => {
      fs.readdir('test/data/ispy_annotations', async (err, files) => {
        if (err) {
          throw new Error(`Reading directory test/data/ispy_annotations`, err);
        } else {
          for (let i = 0; i < files.length; i += 1) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await chai
                .request(`http://${process.env.host}:${process.env.port}`)
                .post('/projects/miraccl/aimfiles')
                .attach('file', `test/data/ispy_annotations/${files[i]}`, `${files[i]}`, {
                  stream: true,
                })
                .query({ username: 'admin' });
            } catch (err2) {
              console.log(
                'Error in aim save for miraccl export test',
                err2,
                'File with error',
                files[i]
              );
            }
          }
          done();
        }
      });
    });

    // the ones without measurements are ignored as they are seg only annotations and segmentations are not uploaded
    it('Project miraccl should have 12 aims', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/miraccl/aims?format=summary')
        .query({ username: 'admin' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows).to.be.a('array');
          expect(res.body.rows.length).to.be.eql(12);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('get miraccl export ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/miracclexport.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/miracclexport')
        .query({ username: 'admin' })
        .send({ projectID: 'miraccl' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('get miraccl export for single patient with subjectUIDs', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/miracclexport.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/miracclexport')
        .query({ username: 'admin' })
        .send({ projectID: 'miraccl', subjectUIDs: ['ACRIN-6698-138027'] })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('get miraccl export for single patient with pairs', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/miracclexport.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/miracclexport')
        .query({ username: 'admin' })
        .send({ pairs: [{ projectID: 'miraccl', subjectID: 'ACRIN-6698-138027' }] })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.eql(jsonBuffer);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
});
