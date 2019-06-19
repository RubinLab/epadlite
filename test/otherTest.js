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
      .attach('files', 'test/data/roi_sample_aim.json', 'roi_sample_aim.json')
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
  it('complex zip upload with template should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/files')
      .attach('files', 'test/data/complexwtemplate.zip', 'complexwtemplate.zip')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('templates should have one entity without filter (defaults to image)', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('returned template should be RECIST_v2', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].TemplateContainer.Template[0].name).to.be.eql('RECIST_v2');
        expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('RECIST_v2');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('template delete with uid 2.25.14127115639382804046523562737575775778671 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/templates/2.25.14127115639382804046523562737575775778671')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('aims should contain one aim for patient 7 ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/aims')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('aim delete with uid 2.25.66395494228425829356180910317656038541 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/lite/aims/2.25.66395494228425829356180910317656038541')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
