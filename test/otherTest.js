const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;
const appVersion = require('../package.json').version;

describe('Other Tests', () => {
  before(async () => {
    const jsonBuffer = JSON.parse(
      fs.readFileSync('test/data/99EPAD_947_2.25.182468981370271895711046628549377576999.json')
    );
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post(`/templates`)
      .send(jsonBuffer)
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'osirix',
        projectName: 'osirix',
        projectDescription: 'testdesc',
        defaultTemplate: 'ROI',
        type: 'private',
      });
  });
  after(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/templates/2.25.182468981370271895711046628549377576999')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/osirix')
      .query({ username: 'admin' });
  });

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
  it('get initial version ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/appVersion')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        // in test it is initially null
        expect(res.body.version).to.equal(undefined);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('fail updating version different version', (done) => {
    chai
      .request(`http://localhost:${process.env.port}`)
      .post('/appVersion')
      .send({
        version: '0.0.0',
        branch: 'madeUpBranch',
      })
      .then((res) => {
        expect(res.statusCode).to.equal(500);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('fail updating version not localhost', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/appVersion')
      .send({
        version: appVersion,
        branch: 'madeUpBranch',
      })
      .then((res) => {
        expect(res.statusCode).to.equal(500);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('update version with branch', (done) => {
    chai
      .request(`http://localhost:${process.env.port}`)
      .post('/appVersion')
      .send({
        version: appVersion,
        branch: 'madeUpBranch',
      })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('get updated version with branch', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/appVersion')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.version).to.equal(`v${appVersion}`);
        const timeNow = Date.now();
        // 1 min ago
        const timeBefore = timeNow - 1 * 60000;
        expect(Date.parse(res.body.date)).to.be.within(timeBefore, timeNow);
        expect(res.body.branch).to.equal('madeUpBranch');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('update version with no branch ', (done) => {
    chai
      .request(`http://localhost:${process.env.port}`)
      .post('/appVersion')
      .send({
        version: appVersion,
      })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('get updated version no branch ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/appVersion')
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.version).to.equal(`v${appVersion}`);
        const timeNow = Date.now();
        // 1 min ago
        const timeBefore = timeNow - 1 * 60000;
        expect(Date.parse(res.body.date)).to.be.within(timeBefore, timeNow);
        expect(res.body.branch).to.equal(null);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('csv upload should succeed ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/processCsv')
      .attach(
        'files',
        'test/data/All_TF_Cases_July_8_2022_NO_PHI.xlsx - All Specialties - NO PHI.csv'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('osirix upload should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/osirix/files')
      .attach('files', 'test/data/Original_pre.xml', 'Original_pre.xml')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('should return correct longitudinal report for the osirix aim', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/osirix/subjects/Mda-1784-Vehicle-M1-Pre/aims?report=Longitudinal')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.admin.tTable[0][2].mean.value).to.be.eql('2.3772264243937538');
        expect(res.body.admin.tTable[0][2].minimum.value).to.be.eql('0.48171499371528625');
        expect(res.body.admin.tTable[0][2].maximum.value).to.be.eql('4.751214981079102');
        expect(res.body.admin.tTable[0][2]['standard deviation'].value).to.be.eql(
          '0.9284077443041251'
        );
        expect(res.body.admin.tTable[0][2].length.value).to.be.eql('2.042970657348633');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  describe('Export Links Tests', () => {
    const aimUID = '2.25.211702350959705565754863799143359605362';
    const studyUID = '1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110';
    const subject = '13116';

    before(async () => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/aims')
        .send(jsonBuffer)
        .query({ username: 'admin' });
    });

    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete(`/aims/${aimUID}`)
        .query({ username: 'admin' });
    });

    it('should return 200 with JSON array when outputType=json', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: aimUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('array');
          expect(res.body).to.have.lengthOf(1);
          expect(res.body[0]).to.have.all.keys('study_desc', 'study_uid', 'comment', 'link');
          done();
        })
        .catch((e) => done(e));
    });

    it('should return correct study_uid and comment from AIM', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: aimUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].study_uid).to.equal(studyUID);
          expect(res.body[0].comment).to.equal('CT /  / 37 / 2');
          done();
        })
        .catch((e) => done(e));
    });

    it('should return empty study_desc when studyDesc is not set (default false)', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: aimUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].study_desc).to.equal('');
          done();
        })
        .catch((e) => done(e));
    });

    it('should return 200 with empty study_desc when studyDesc=true but DICOMweb unavailable', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', studyDesc: true, username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: aimUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0]).to.have.all.keys('study_desc', 'study_uid', 'comment', 'link');
          done();
        })
        .catch((e) => done(e));
    });

    it('should return an encrypted link containing the base URL', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: aimUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body[0].link).to.match(/^http:\/\/localhost:5987\?arg=/);
          done();
        })
        .catch((e) => done(e));
    });

    it('should return text output by default (no outputType param)', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: aimUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.text).to.be.a('string');
          expect(res.text).to.include(studyUID);
          expect(res.text).to.include('\t');
          done();
        })
        .catch((e) => done(e));
    });

    it('should return multiple entries for multiple pairs', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([
          { subject, study: studyUID, aimuid: aimUID },
          { subject, study: studyUID, aimuid: aimUID },
        ])
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.have.lengthOf(2);
          done();
        })
        .catch((e) => done(e));
    });

    it('should return 400 for body missing required fields', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([{ subject, study: studyUID }])
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch((e) => done(e));
    });

    it('should return 500 for an invalid aimuid', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/exportlinks')
        .query({ outputType: 'json', username: 'admin' })
        .send([{ subject, study: studyUID, aimuid: 'nonexistent-aim-uid' }])
        .then((res) => {
          expect(res.statusCode).to.equal(500);
          done();
        })
        .catch((e) => done(e));
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
