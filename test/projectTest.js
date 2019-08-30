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
  await server.orm.authenticate();
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
  // console.log()
  it('projects should have 2 (all, unassigned) ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
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
      .send({
        projectId: 'test',
        projectName: 'test',
        projectDescription: 'testdesc',
        defaultTemplate: 'ROI',
        type: 'private',
        userName: 'admin',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('projects should have 3 projects ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(3);
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
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('projects should have 2 projects ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
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
        .send({
          projectId: 'testtemplate',
          projectName: 'testtemplate',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testtemplate2',
          projectName: 'testtemplate2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate2');
    });

    it('project testtemplate should have no template ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testtemplate/templates')
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

    it('project template put to project testtemplate2 should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testtemplate2/templates/2.25.121060836007636801627558943005335')
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

    it('project template delete from testtemplate should be successful ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testtemplate/templates/2.25.121060836007636801627558943005335')
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
        .send({
          projectId: 'testsubject',
          projectName: 'testsubject',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testsubject2',
          projectName: 'testsubject2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'testsubject3',
          projectName: 'testsubject3',
          projectDescription: 'test3desc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject2');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testsubject3');
    });
    it('project testsubject should have no subjects ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testsubject/subjects')
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(1);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result[0].subjectID).to.be.eql('3');
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(1);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(1);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .send({
          projectId: 'teststudy',
          projectName: 'teststudy',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'teststudy2',
          projectName: 'teststudy2',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .send({
          projectId: 'teststudy3',
          projectName: 'teststudy3',
          projectDescription: 'test3desc',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy2');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/teststudy3');
    });
    it('project teststudy should have no subjects ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/teststudy/subjects')
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(1);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result[0].subjectID).to.be.eql('3');
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result[0].studyUID).to.be.eql('0023.2015.09.28.3');
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(1);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(1);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
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
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.ResultSet.Result.length).to.be.eql(0);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
