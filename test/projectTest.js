const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

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

describe('Project Tests', () => {
  it('projects should have 2 (all, unassigned) ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project create should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post(
        '/projects?projectName=test&projectId=test&projectDescription=testdesc&defaultTemplate=ROI&type=private'
      )
      .send()
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('projects should have 3 projects ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(3);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('project template save should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/test/templates')
      .send(jsonBuffer)
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('project test should have 1 template ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/templates')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('project test should have ROI Only', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/test/templates')
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
});
