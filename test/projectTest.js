const chai = require('chai');

const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

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
});
