const chai = require('chai');
const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

describe('Ontology Tests', () => {
  before(async () => {
    try {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/ontology')
        .send({
          codemeaning: 'testcodemeaning1',
          referenceuid: 'testcodevalue1',
          referencename: 'plugin1',
          referencetype: 'p',
          creator: 'admin',
        })
        .set('Authorization', 'apikey 1111');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/ontology')
        .send({
          codemeaning: 'testcodemeaning2',
          referenceuid: 'testcodevalue2',
          referencename: 'plugin2',
          referencetype: 'p',
          creator: 'admin',
        })
        .set('Authorization', 'apikey 1111');
    } catch (err) {
      console.log(`Ontology Tests before error: ${err.message}`);
    }
  });
  after(async () => {
    try {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/ontology/99EPAD_1')
        .query({ username: 'admin' })
        .set('Authorization', 'apikey 1111');
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/ontology/99EPAD_2')
        .query({ username: 'admin' })
        .set('Authorization', 'apikey 1111');
    } catch (err) {
      console.log(`Ontology Tests after error: ${err.message}`);
    }
  });
  it('should have 2 lexicon data', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/ontology')
      .auth('admin', 'admin')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('no apikey provided, should return 401', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/ontology')
      .send({
        codemeaning: 'testcodemeaningx',
        referenceuid: 'testcodevaluex',
        referencename: 'pluginx',
        referencetype: 'p',
        creator: 'admin',
      })
      .then((res) => {
        expect(res.statusCode).to.equal(401);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('wrong apikey provided, should return 401', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/ontology')
      .send({
        codemeaning: 'testcodemeaningx',
        referenceuid: 'testcodevaluex',
        referencename: 'pluginx',
        referencetype: 'p',
        creator: 'admin',
      })
      .set('Authorization', 'apikey 2222')
      .then((res) => {
        expect(res.statusCode).to.equal(401);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('duplicate entry for lexicon , should return 409 (conflict)', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/ontology')
      .send({
        codemeaning: 'testcodemeaning2',
        referenceuid: 'testcodevalue2',
        referencename: 'plugin2',
        referencetype: 'p',
        creator: 'admin',
      })
      .set('Authorization', 'apikey 1111')
      .then((res) => {
        expect(res.statusCode).to.equal(409);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('get lexion object for a given codevalue , should return 200 and return body size must be 1', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/ontology?codevalue=99EPAD_1')
      .send()
      .set('Authorization', 'apikey 1111')
      .then((res) => {
        console.log('get lex obj', res.body);
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('updated lexion object for a given codevalue , should return 200', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/ontology/99EPAD_1')
      .send({
        codemeaning: 'testcodemeaningUpdated',
        codevalue: '99EPAD_1',
        description: 'testdescriptionUpdated',
        schemadesignator: 'schemadesigupdated',
        schemaversion: 'vupdated',
        referenceuid: 'testcodevalue1Updatedefuid',
        referencename: 'testplugin1updated',
        referencetype: 't',
      })
      .set('Authorization', 'apikey 1111')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('verify updated lexion object for a given codevalue (99EPAD_1) , should return 200 and the updated lexicon object ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/ontology?codevalue=99EPAD_1')
      .send()
      .set('Authorization', 'apikey 1111')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        const updatedLexicon = res.body.pop();
        expect(updatedLexicon.codemeaning).to.be.eql('testcodemeaningUpdated');
        expect(updatedLexicon.codevalue).to.be.eql('99EPAD_1');
        expect(updatedLexicon.description).to.be.eql('testdescriptionUpdated');
        expect(updatedLexicon.schemadesignator).to.be.eql('schemadesigupdated');
        expect(updatedLexicon.schemaversion).to.be.eql('vupdated');
        expect(updatedLexicon.referenceuid).to.be.eql('testcodevalue1Updatedefuid');
        expect(updatedLexicon.referencename).to.be.eql('testplugin1updated');
        expect(updatedLexicon.referencetype).to.be.eql('t');

        done();
      })
      .catch((e) => {
        done(e);
      });
  });
});
