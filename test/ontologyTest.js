const chai = require('chai');

const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

describe('Ontology Tests', () => {
  before(async () => {
    try {
      console.log(`host info :http://${process.env.host}:8080`);
      await chai
        .request(`http://${process.env.host}:8080}`)
        .post('/ontology')
        .auth('admin', 'admin')
        // .query({ username: 'admin' })
        .send({
          codemeaning: 'testcodemeaning1',
          codevalue: 'testcodevalue1',
          creator: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:8080`)
        .post('/ontology')
        .auth('admin', 'admin')
        // .query({ username: 'admin' })
        .send({
          codemeaning: 'testcodemeaning2',
          codevalue: 'testcodevalue2',
          creator: 'admin',
        });
      // done();
    } catch (err) {
      // done(err);
      console.log(`Ontology Tests before error: ${err.message}`);
    }
  });
  after(async () => {
    try {
      await chai
        .request(`http://${process.env.host}:8080`)
        .delete('/ontology/testcodevalue1')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:8080`)
        .delete('/ontology/testcodevalue2')
        .query({ username: 'admin' });
    } catch (err) {
      console.log(`Ontology Tests after error: ${err.message}`);
    }
  });
  it('should have 2 lexicon data', done => {
    chai
      .request(`http://${process.env.host}:8080`)
      .get('/ontology')
      .auth('admin', 'admin')
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
});