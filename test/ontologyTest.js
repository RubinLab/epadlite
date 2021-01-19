const chai = require('chai');

const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

describe('Ontology Tests', () => {
  before(async () => {
    try {
      console.log(`host info :http://${process.env.host}:${process.env.port}`);
      await chai
        .request(`http://${process.env.host}:${process.env.port}}`)
        .post('/ontology')
        .query({ username: 'admin' })
        .send({
          codemeaning: 'testcodemeaning1',
          referenceuid: 'testcodevalue1',
          referencename: 'plugin',
          referencetype: 'plugin',
          creator: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/ontology')
        .query({ username: 'admin' })
        .send({
          codemeaning: 'testcodemeaning2',
          referenceuid: 'testcodevalue2',
          referencename: 'plugin2',
          referencetype: 'plugin2',
          creator: 'admin',
        });
    } catch (err) {
      console.log(`Ontology Tests before error: ${err.message}`);
    }
  });
  after(async () => {
    try {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/ontology/999EPAD1')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/ontology/999EPAD2')
        .query({ username: 'admin' });
    } catch (err) {
      console.log(`Ontology Tests after error: ${err.message}`);
    }
  });
  it('should have 2 lexicon data', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
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
