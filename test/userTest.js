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
describe('User Tests', () => {
  it('user should have 1 admin user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(1);
        expect(res.body.ResultSet.Result[0].username).to.be.eql('admin');

        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should create a new user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .send({
        username: 'test@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'test@gmail.com',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('user should have 2 users', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result.length).to.be.eql(2);
        expect(res.body.ResultSet.Result[1].username).to.be.eql('test@gmail.com');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
