const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('Template Tests', () => {
  it('templates should be empty', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result).to.be.a('array');
        expect(res.body.ResultSet.Result.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('template save should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/templates')
      .send(jsonBuffer)
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('templates should have one entity', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result).to.be.a('array');
        expect(res.body.ResultSet.Result.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('returned template should be ROI Only', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.ResultSet.Result[0].Template.codeMeaning).to.be.eql('ROI Only');
        expect(res.body.ResultSet.Result[0].Template.codeValue).to.be.eql('ROI');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
