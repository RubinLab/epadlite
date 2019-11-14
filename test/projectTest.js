const chai = require('chai');

const chaiHttp = require('chai-http');
const fs = require('fs');
const nock = require('nock');
const studiesResponse = require('./data/studiesResponse.json');
const seriesResponse = require('./data/seriesResponse.json');
const config = require('../config/index');

chai.use(chaiHttp);
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

describe('Project Tests', () => {
  it('projects should have no projects ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project create should be successful ', done => {
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
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('projects should have 1 project with loginnames admin', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0].loginNames).to.include('admin');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('project update should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test?projectName=test1')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('projectname should be updated ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.pop().name).to.be.eql('test1');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project update with multiple fields should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test?projectName=testupdated&description=testupdated&type=Public')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('multiple project fields should be updated ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        const lastEntry = res.body.pop();
        expect(lastEntry.name).to.be.eql('testupdated');
        expect(lastEntry.description).to.be.eql('testupdated');
        expect(lastEntry.type).to.be.eql('Public');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project endpoint should return the updated project ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        const lastEntry = res.body;
        expect(lastEntry.name).to.be.eql('testupdated');
        expect(lastEntry.description).to.be.eql('testupdated');
        expect(lastEntry.type).to.be.eql('Public');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project delete should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/test')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('projects should have no projects ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
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
    });

    it('project testtemplate should have no template ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project template save should be successful ', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testtemplate/templates')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate should have 1 template ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
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

    it('project testtemplate should have ROI Only', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate should have template with uid 2.25.121060836007636801627558943005335', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.uid).to.be.eql(
            '2.25.121060836007636801627558943005335'
          );
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project template put to project testtemplate2 as disabled should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put(
          '/projects/testtemplate2/templates/2.25.121060836007636801627558943005335?enable=false'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate2 should have ROI Only', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate2 should have ROI Only as disabled', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates?format=summary')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].enabled).to.be.eql(false);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project template put to project testtemplate2 as enabled should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testtemplate2/templates/2.25.121060836007636801627558943005335?enable=true')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate2 should have ROI Only as enabled', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates?format=summary')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].enabled).to.be.eql(true);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project template delete from testtemplate should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate should have no template ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testtemplate2 should still have ROI Only', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate2/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('ROI template should still be in the db', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.a('array');
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
          expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('template delete with uid 2.25.121060836007636801627558943005335 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate2/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('templates should be empty', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.a('array');
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
    });
    it('project testsubject should have no subjects ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project subject add of patient 3 to project testsubject should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject/subjects/3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project subject add of patient 3 to project testsubject2 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject2/subjects/3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project subject add of patient 3 to project testsubject3 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubject3/subjects/3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testsubject should have 1 subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
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
    it('project testsubject should have subject 3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
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
    it('project testsubject should have study 0023.2015.09.28.3 of subject 3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects/3/studies')
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

    it('subject retrieval with project subject endpoint should return subject 3 from  project testsubject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects/3')
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

    it('subject retrieval with project subject endpoint should get 404 for subject 7 from  project testsubject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects/7')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project subject deletion of patient 3 from testsubject project should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject/subjects/3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testsubject should have no subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testsubject2 should have 1 subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject2/subjects')
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

    it('project testsubject3 should have 1 subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
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

    it('project subject deletion of patient 3 of system should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject3/subjects/3?all=true')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testsubject should have no subject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testsubject2 should have no subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject2/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testsubject3 should have no subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject3/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
    });
    it('project teststudy should have no subjects ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project study add of study 0023.2015.09.28.3 to project teststudy should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project study add of study 0023.2015.09.28.3 to project teststudy2 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy2/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project study add of study 0023.2015.09.28.3 to project teststudy3 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/teststudy3/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy should have 1 subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
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
    it('project teststudy should have subject 3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
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
    it('project teststudy should have 1 study and it should be 0023.2015.09.28.3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/studies')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          expect(res.body[0].patientID).to.be.eql('3');
          expect(res.body[0].patientName).to.be.eql('Phantom');
          expect(res.body[0].studyUID).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].referringPhysicianName).to.be.eql('');
          expect(res.body[0].birthdate).to.be.eql('20141212');
          expect(res.body[0].sex).to.be.eql('M');
          expect(res.body[0].studyDescription).to.be.eql('Made up study desc');
          expect(res.body[0].studyAccessionNumber).to.be.eql('Made up accession');
          expect(res.body[0].numberOfImages).to.be.eql(1);
          expect(res.body[0].numberOfSeries).to.be.eql(1);
          expect(res.body[0].numberOfAnnotations).to.be.eql(0);
          expect(res.body[0].studyID).to.be.eql('3');
          expect(res.body[0].studyDate).to.be.eql('20150928');
          expect(res.body[0].studyTime).to.be.eql('170437');
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy should have study 0023.2015.09.28.3 of subject 3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies')
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
    it('project study endpoint should return study entity for project teststudy, study 0023.2015.09.28.3 of subject 3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3')
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

    it('project study endpoint should return 404 for made up study 56547547373', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects/3/studies/56547547373')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project study deletion of patient 3 study 0023.2015.09.28.3 from teststudy project should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy should have no subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy2 should have 1 subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy2/subjects')
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

    it('project teststudy3 should have 1 subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy3/subjects')
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

    it('project study deletion of patient 3 study 0023.2015.09.28.3 of system should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy3/subjects/3/studies/0023.2015.09.28.3?all=true')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy should have no subject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy2 should have no subject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy2/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project teststudy3 should have no subject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy3/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
    it('project testaim should have no aims ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim save to project testaim should be successful ', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testaim should have one aim', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.a('array');
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for project testaim with uid 2.25.211702350959705565754863799143359605362 should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testaim2 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim2/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project aim add of aim 2.25.211702350959705565754863799143359605362 to project testaim3 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim3/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project aim endpoint should return aim for project testaim2, aim 2.25.211702350959705565754863799143359605362', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ImageAnnotationCollection.uniqueIdentifier.root).to.be.eql(
            '2.25.211702350959705565754863799143359605362'
          );
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project aim endpoint should return 404 for made up aimuid ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims/56547547373')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116 in project testaim should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 of patient 13116 in project testaim should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for patient 13116 in project testaim should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/subjects/13116/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116 with aimuid in project testaim should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims/2.25.211702350959705565754863799143359605362'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110 of patient 13116 with aimuid in project testaim should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testaim/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims/2.25.211702350959705565754863799143359605362'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for patient 13116 with aimuid in project testaim should be Lesion1', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/subjects/13116/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion1');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim update with changing the name to Lesion2 should be successful ', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      const nameSplit = jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
        '~'
      );
      nameSplit[0] = 'Lesion2';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = nameSplit.join(
        '~'
      );
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put(`/projects/testaim/aims/${jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root}`)
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim returned for project testaim should be Lesion2 now', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
              '~'
            )[0]
          ).to.be.eql('Lesion2');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project aim deletion of aim 2.25.211702350959705565754863799143359605362 from testaim project should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim/aims/2.25.211702350959705565754863799143359605362')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testaim should have no aim ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testaim2 should have 1 aim ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
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

    it('project testaim3 should have 1 aim ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
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

    it('project aim deletion of aim 2.25.211702350959705565754863799143359605362 of system should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim/aims/2.25.211702350959705565754863799143359605362?all=true')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('project testaim2 should have no aim', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim2/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testaim3 should have no aim', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testaim3/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
    it('project testfile should have no files ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('unknown extension file upload should fail ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfile/files')
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testfile should still have no files ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('jpg file upload should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfile/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testfile should have 1 file ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
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
    it('should add file to testfile2 project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfile2/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add file to testfile3 project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfile3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get json with filename (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfile/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should download file with filename (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfile/files/${res.body[0].name}`)
            .query({ format: 'stream', username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('jpg file delete with filename retrieval and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfile/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testfile should have no files ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testfile2 should have 1 file ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile2/files')
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
    it('jpg file delete from system with filename retrieval from testfile2 and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile2/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfile2/files/${res.body[0].name}`)
            .query({ all: 'true' })
            .query({ username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testfile2 should have no files ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile2/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testfile3 should have no files ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfile3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
        .delete('/projects/testfilesubject');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject2');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject3');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testfilesubject4');
    });
    it('should return no files for subject 3 in project testfilesubject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail uploading unknown extension file to subject 3 in project testfilesubject', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilesubject/subjects/3/files')
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should still return no files for subject 3 in project testfilesubject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail uploading jpg file to subject 7 nonexistent in project testfilesubject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilesubject/subjects/7/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to subject 3 in project testfilesubject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilesubject/subjects/3/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for subject 3 in project testfilesubject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
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
    it('should add file to testfilesubject2 project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfilesubject2/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add file to testfilesubject3 project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfilesubject3/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail with 400 adding add file to testfilesubject4 project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testfilesubject4/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(400);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get json with filename (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfilesubject/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should download file with filename (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(`/projects/testfilesubject/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .query({ format: 'stream' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testfilesubject with filename retrieval and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfilesubject/subjects/3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3 in project testfilesubject ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for subject 3 in project testfilesubject2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject2/subjects/3/files')
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
    it('should succeed in deleting jpg file from system with filename retrieval from testfilesubject2 and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject2/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testfilesubject2/subjects/3/files/${res.body[0].name}`)
            .query({ all: 'true', username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3 in project testfilesubject2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject2/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3 in project testfilesubject3 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilesubject3/subjects/3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
    it('should return no files for subject 3, study 0023.2015.09.28.3 in project testfilestudy', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail uploading unknown extension file to subject 3, study 0023.2015.09.28.3 in project testfilestudy', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should still return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail uploading jpg file to subject 7, study 64363473737.86569494 nonexistent in project testfilestudy ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilestudy/subjects/7/studies/64363473737.86569494/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to subject 3, study 0023.2015.09.28.3  in project testfilestudy ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, study 0023.2015.09.28.3  in project testfilestudy ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
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
    it('should add file to testfilestudy2 project, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add file to testfilestudy3 project, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfilestudy3/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail adding add file to testfilestudy4, study 0023.2015.09.28.3  project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfilestudy4/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(400);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get json with filename, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should download file with filename, study 0023.2015.09.28.3  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ format: 'stream', username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testfilestudy, study 0023.2015.09.28.3  with filename retrieval and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, study 0023.2015.09.28.3  in project testfilestudy2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files')
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
    it('should succeed in deleting jpg file of study 0023.2015.09.28.3 from system with filename retrieval from testfilestudy2 and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files/${
                res.body[0].name
              }`
            )
            .query({ all: 'true', username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy2/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3, study 0023.2015.09.28.3  in project testfilestudy3 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testfilestudy3/subjects/3/studies/0023.2015.09.28.3/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
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
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590 in project testfileseries', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail uploading unknown extension file to subject 3, series 0023.2015.09.28.3.3590 in project testfileseries', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .attach('files', 'test/data/unknownextension.abc', 'test/data/unknownextension.abc')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.not.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should still return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail uploading jpg file to subject 7, study 64363473737.86569494 nonexistent in project testfileseries ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testfileseries/subjects/7/studies/64363473737.86569494/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
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
    it('should add file to testfileseries2 project, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add file to testfileseries3 project, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfileseries3/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail adding add file to testfileseries4, series 0023.2015.09.28.3.3590  project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(
              `/projects/testfileseries4/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(400);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get json with filename, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet.body.name).to.equal(res.body[0].name);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should download file with filename, series 0023.2015.09.28.3.3590  (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .get(
              `/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ format: 'stream', username: 'admin' })
            .then(resGet => {
              expect(resGet.statusCode).to.equal(200);
              expect(resGet).to.have.header(
                'Content-Disposition',
                'attachment; filename=files.zip'
              );
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testfileseries, series 0023.2015.09.28.3.3590  with filename retrieval and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
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
    it('should succeed in deleting jpg file of series 0023.2015.09.28.3.3590 from system with filename retrieval from testfileseries2 and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(
              `/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files/${
                res.body[0].name
              }`
            )
            .query({ all: 'true', username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries2/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for subject 3, series 0023.2015.09.28.3.3590  in project testfileseries3 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get(
          '/projects/testfileseries3/subjects/3/studies/0023.2015.09.28.3/series/0023.2015.09.28.3.3590/files'
        )
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
  describe('Project Association Tests', () => {
    it('should create testassoc project ', done => {
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('should return no files for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no templates for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no aims for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should upload jpg file to testassoc project ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should save ROI template to testassoc project', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc/templates')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should save sample aim save to project testassoc', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add subject 3 to project testassoc', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testassoc/subjects/3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('should return 1 file for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
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
    it('should return 1 template for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
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
    it('should return 1 aim for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/aims')
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

    it('should return 1 file for project testassoc ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/files')
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
    it('should return 1 template for project testassoc  ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/templates')
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
    it('should return 1 aim for project testassoc  ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/aims')
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
    it('should return 1 subject for project testassoc  ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc/subjects')
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
    it('should delete project testassoc', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testassoc')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should create testassoc2 project ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testassoc2',
          projectName: 'testassoc2',
          projectDescription: 'testassoc2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        })
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should create testassoc3 project ', done => {
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to project testassoc2 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc2/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add first file to testfile2 project (filename retrieval is done via get all) ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc2/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testassoc3/files/${res.body[0].name}`)
            .query({ username: 'admin' })
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to project testassoc2 second time ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc2/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed uploading jpg file to project testassoc2 third time ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testassoc2/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project testassoc2 should have 3 files ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc2/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(3);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should delete project testassoc2', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testassoc2')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return 1 file for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
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
    it('jpg file delete from system with filename retrieval from testassoc3 and delete should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testassoc3/files')
        .query({ username: 'admin' })
        .then(res => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testassoc3/files/${res.body[0].name}`)
            .query({ all: 'true', username: 'admin' })
            .then(resDel => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no files for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/files')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no templates for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/templates')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should return no aims for system ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/aims')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should delete project testassoc3', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testassoc3')
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
    it('project testsubjectnondicom should have no subjects ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project subject add of patient 3 to project testsubject should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubjectnondicom/subjects/3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail adding nondicom patient 3 to project testsubjectnondicom ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '3', subjectName: 'testnondicom' })
        .then(res => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed adding nondicom patient 4 to project testsubjectnondicom ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '4', subjectName: 'testnondicom' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 2 subjects ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail adding nondicom patient 4 to project testsubjectnondicom again ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects')
        .query({ username: 'admin' })
        .send({ subjectUid: '4', subjectName: 'testnondicom' })
        .then(res => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project study add of study 0023.2015.09.28.3 to project testsubjectnondicom should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testsubjectnondicom/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('project study add of nondicom study 4315541363646543 ABC to project testsubjectnondicom patient 4 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .send({ studyUid: '4315541363646543', studyDesc: 'ABC' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 1 study for patient 4 ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubjectnondicom/subjects/4/studies')
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
    it('should fail trying to add same nondicom study 4315541363646543 ABC to project testsubjectnondicom patient 4 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testsubjectnondicom/subjects/4/studies')
        .query({ username: 'admin' })
        .send({ studyUid: '4315541363646543', studyDesc: 'ABC' })
        .then(res => {
          expect(res.statusCode).to.equal(409);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
