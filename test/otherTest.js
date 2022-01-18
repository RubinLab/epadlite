const chai = require('chai');
const chaiHttp = require('chai-http');
// const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('Other Tests', () => {
  it('set an api key ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/apikeys')
      .send({ appid: 'epad', apikey: 'aaaa-bbbbb-cccc-dddd', validIPs: ['127.0.0.1'] })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('get api key for epad ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/apikeys/epad')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.text).to.equal('aaaa-bbbbb-cccc-dddd');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('update api key with new ips ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/apikeys')
      .send({
        appid: 'epad',
        apikey: 'aaaa-bbbbb-cccc-dddd',
        validIPs: ['127.0.0.1', '1.2.3.4'],
      })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('get api key for epad again', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/apikeys/epad')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.text).to.equal('aaaa-bbbbb-cccc-dddd');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('update api key with new ips ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/apikeys')
      .send({
        appid: 'epad',
        apikey: 'aaaa-bbbbb-cccc-dddd',
        validIPs: ['1.2.3.4', '2.3.4.5'],
      })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('fail getting api key for epad ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/apikeys/epad')
      .then((res) => {
        expect(res.statusCode).to.equal(403);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  /* it('dcm upload should be successful ', done => {
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
  it('7 patient should have more than one studies ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/studies')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.be.above(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('deletion of patient 7 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .del('/projects/lite/subjects/7')
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
  it('template delete with uid 2.25.5886502342623758457547593170234 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/templates/2.25.5886502342623758457547593170234')
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

  it('1.2.752.24.7.19011385.484010 study should have 2 series ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/studies/1.2.752.24.7.19011385.484010/series')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.be.eql(2);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('deletion of series 1.2.840.113704.1.111.5068.1212776060.31 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .del(
        '/projects/lite/subjects/7/studies/1.2.752.24.7.19011385.484010/series/1.2.840.113704.1.111.5068.1212776060.31'
      )
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('1.2.752.24.7.19011385.484010 study should have 1 series ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/studies/1.2.752.24.7.19011385.484010/series')
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

  it('aims should contain no aim for patient 7 ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/aims')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('7 patient should have 2 studies ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/studies')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.a('array');
        expect(res.body.length).to.be.eql(2);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('deletion of study 1.2.752.24.7.19011385.514521 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .del('/projects/lite/subjects/7/studies/1.2.752.24.7.19011385.514521')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('7 patient should have 1 study ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/7/studies')
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
  */
});
