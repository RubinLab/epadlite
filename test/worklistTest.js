const chai = require('chai');

const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

describe('Worklist Tests', () => {
  before(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .send({
        username: 'testCreator@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'testCreator@gmail.com',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .send({
        username: 'testAssignee@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'testAssignee@gmail.com',
      });
  });
  after(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testCreator@gmail.com');
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('testAssignee@gmail.com');
  });
  it('worklists should have 0 worklists assigned to the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/testAssignee@gmail.com/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 0 worklists created by the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should create a new worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/worklists?username=testCreator@gmail.com')
      .send({
        worklistName: 'test',
        worklistId: 'testCreate',
        description: 'testdesc',
        dueDate: '2019-12-01',
        username: 'admin',
        assignees: ['testAssignee@gmail.com'],
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 1 worklist assigned to the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 1 worklist created by the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should update the new worklists fields', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/worklists/testCreate?username=testCreator@gmail.com')
      .send({
        name: 'testUpdated2',
        description: 'testdescUpdated',
        duedate: '2019-12-31',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('The new worklist should be updated with worklist field data', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0].name).to.be.eql('testUpdated2');
        expect(res.body[0].description).to.be.eql('testdescUpdated');
        expect(res.body[0].dueDate).to.be.eql('2019-12-31');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it("should update the new worklist's assignee", done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/worklists/testCreate?username=testCreator@gmail.com')
      .send({
        user: 'testAssignee@gmail.com',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  // it('The new worklist should be updated with the new assignee data', done => {
  //   chai
  //     .request(`http://${process.env.host}:${process.env.port}`)
  //     .get('/users/testAdmin@gmail.com/worklists?username=testCreator@gmail.com')
  //     .then(res => {
  //       expect(res.statusCode).to.equal(200);
  //       expect(res.body.length).to.be.eql(1);
  //       done();
  //     })
  //     .catch(e => {
  //       done(e);
  //     });
  // });
  // it('should create a link between a worklist and a study', done => {
  //   chai
  //     .request(`http://${process.env.host}:${process.env.port}`)
  //     .post('/users/1/worklists/2/projects/1/subjects')
  //     .send({
  //       studyId: '1',
  //     })
  //     .then(res => {
  //       expect(res.statusCode).to.equal(200);
  //       done();
  //     })
  //     .catch(e => {
  //       done(e);
  //     });
  // });
  it('should delete the worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/worklists/testCreate?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 0 worklists', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
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
