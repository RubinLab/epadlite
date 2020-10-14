const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('Template Tests', () => {
  it('templates should be empty', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .query({ username: 'admin' })
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

  it('template save should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/templates')
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('templates should have one entity with image type filter', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates?type=image')
      .query({ username: 'admin' })
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

  it('templates should have one entity without filter (defaults to image)', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .query({ username: 'admin' })
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

  it('returned template should be ROI Only', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only');
        expect(res.body[0].TemplateContainer.Template[0].codeValue).to.be.eql('ROI');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('template update with changing the codeMeaning to ROI Only2 and type to study should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
    jsonBuffer.TemplateContainer.Template[0].codeMeaning = 'ROI Only2';
    jsonBuffer.TemplateContainer.Template[0].templateType = 'Study';
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/templates/${jsonBuffer.TemplateContainer.uid}`)
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('returned template codeMeaning should be ROI Only2 with study type filter', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates?type=study')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only2');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('templates should be empty with image filter', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates?type=image')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  // we do not have default anymore
  it('templates should return one template without filter and it should be ROI Only2', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0].TemplateContainer.Template[0].codeMeaning).to.be.eql('ROI Only2');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it("it should get zip file for downloading templates ['2.25.121060836007636801627558943005335'] ", done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/templates/download')
      .send(['2.25.121060836007636801627558943005335'])
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=templates.zip');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it("it should fail getting zip file for downloading templates ['2.25.56357357548684946873754'] ", done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/templates/download')
      .send(['2.25.56357357548684946873754'])
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(500);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=templates.zip');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('template delete with uid 2.25.121060836007636801627558943005335 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/templates/2.25.121060836007636801627558943005335')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('templates should be empty', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/templates')
      .query({ username: 'admin' })
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
});
