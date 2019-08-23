const chai = require('chai');

const chaiHttp = require('chai-http');
const fs = require('fs');

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
  it('project template save should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/test/templates')
      .send(jsonBuffer)
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

  it('project test should have 1 template ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
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

  it('project test should have ROI Only', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/templates')
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

  it('project test should have template with uid 2.25.121060836007636801627558943005335', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/templates')
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

  it('project template delete should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/test/templates/2.25.121060836007636801627558943005335')
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

  it('project test should have no template ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 2 worklists', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/1/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(2);
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

  it('should create a new worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users/1/worklists')
      .send({
        name: 'test',
        worklistid: 'testCreate',
        description: 'testdesc',
        duedate: '2019-12-01',
        username: 'admin',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('template delete with uid 2.25.121060836007636801627558943005335 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/templates/2.25.121060836007636801627558943005335')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('worklists should have 3 worklists ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/1/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(3);
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

  it('should update the new worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/users/1/worklists/testCreate')
      .send({
        name: 'testUpdated2',
        description: 'testdescUpdated',
        duedate: '2019-12-31',
        username: 'admin',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  // subjects tests
  it('project test should have no subjects ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/subjects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  // add sample data
  it('dcm upload should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/files')
      .attach('files', 'test/data/sample.dcm', 'sample.dcm')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('The new worklist should be updated with data', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/1/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(3);
        expect(res.body.ResultSet.Result[2].name).to.be.eql('testUpdated2');
        expect(res.body.ResultSet.Result[2].description).to.be.eql('testdescUpdated');
        expect(res.body.ResultSet.Result[2].dueDate).to.be.eql('2019-12-31');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project subject add of patient 3 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test/subjects/3')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should create a link between a worklist and a study', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users/1/worklists/2/projects/1/subjects')
      .send({
        studyId: '1',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project test should have 1 subject ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/subjects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project test should have subject 3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/subjects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result[0].subjectID).to.be.eql('3');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should delete the worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/1/worklists/testCreate')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project subject deletion of patient 3 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/test/subjects/3')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('worklists should have 2 worklists', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/1/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(2);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('project test should have no subject ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/subjects')
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
