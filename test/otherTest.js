const chai = require('chai');
const chaiHttp = require('chai-http');
// const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('Other Tests', () => {
  it('dcm upload should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/sample.dcm', 'sample.dcm')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aim json upload should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/recist_fake.json', 'recist_fake.json')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('simple zip upload with one aim and one dcm should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/simple.zip', 'simple.zip')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('simple zip upload with just 2 aims should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/aims.zip', 'aims.zip')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('zip upload with folder of 60 dcms should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/dcms.zip', 'dcms.zip')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('complex zip upload with folder, file and zip should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/complex.zip', 'complex.zip')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
