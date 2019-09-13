const chai = require('chai');

const chaiHttp = require('chai-http');

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
describe('Worklist Tests', () => {
  before(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .send({
        username: 'test3@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'test3@gmail.com',
      });
  });
  after(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/test3@gmail.com');
  });
  it('worklists should have 0 worklists', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/test3@gmail.com/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should create a new worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users/test3@gmail.com/worklists')
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
  it('worklists should have 1 worklists ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/test3@gmail.com/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should update the new worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/users/test3@gmail.com/worklists/testCreate')
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
      .get('/users/test3@gmail.com/worklists')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(1);
        expect(res.body.ResultSet.Result[0].name).to.be.eql('testUpdated2');
        expect(res.body.ResultSet.Result[0].description).to.be.eql('testdescUpdated');
        expect(res.body.ResultSet.Result[0].dueDate).to.be.eql('2019-12-31');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
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
      .delete('/users/test3@gmail.com/worklists/testCreate')
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
      .get('/users/test3@gmail.com/worklists')
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
