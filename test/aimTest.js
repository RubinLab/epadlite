const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

// as these are outside any describe, they are global to all tests!
let server;
before(async () => {
  process.env.host = '0.0.0.0';
  process.env.port = 5987;
  server = require('../server'); // eslint-disable-line
  await server.ready();
});
after(() => {
  server.close();
});

describe('AIM Tests', () => {
  it('aims should be empty for series 1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352 of patient MRI-DIR-T2_3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/projects/lite/subjects/MRI-DIR-T2_3/studies/1.3.6.1.4.1.14519.5.2.1.1706.4996.267501199180251031414136865313/series/1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352/aims'
      )
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.imageAnnotations.ImageAnnotationCollection).to.be.a('array');
        expect(res.body.imageAnnotations.ImageAnnotationCollection.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aims should be empty for fake values patient 11111, study 2222222, series 3333333 ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/projects/lite/subjects/11111/studies/2222222/series/3333333/aims')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.imageAnnotations.ImageAnnotationCollection).to.be.a('array');
        expect(res.body.imageAnnotations.ImageAnnotationCollection.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aim save should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/recist_fake.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects/lite/aims')
      .send(jsonBuffer)
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aims should be have one aim for series 1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352 of patient MRI-DIR-T2_3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/projects/lite/subjects/MRI-DIR-T2_3/studies/1.3.6.1.4.1.14519.5.2.1.1706.4996.267501199180251031414136865313/series/1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352/aims'
      )
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.imageAnnotations.ImageAnnotationCollection).to.be.a('array');
        expect(res.body.imageAnnotations.ImageAnnotationCollection.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aim returned for series 1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352 of patient MRI-DIR-T2_3 should be Lesion2', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/projects/lite/subjects/MRI-DIR-T2_3/studies/1.3.6.1.4.1.14519.5.2.1.1706.4996.267501199180251031414136865313/series/1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352/aims'
      )
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(
          res.body.imageAnnotations.ImageAnnotationCollection[0].imageAnnotations.ImageAnnotation.name.value.split(
            '~'
          )[0]
        ).to.be.eql('Lesion2');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aim update with changing the name to Lesion3 should be successful ', done => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/recist_fake.json'));
    const nameSplit = jsonBuffer.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.name.value.split(
      '~'
    );
    nameSplit[0] = 'Lesion3';
    jsonBuffer.imageAnnotations.ImageAnnotationCollection.imageAnnotations.ImageAnnotation.name.value = nameSplit.join(
      '~'
    );
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(
        `/projects/lite/aims/${
          jsonBuffer.imageAnnotations.ImageAnnotationCollection.uniqueIdentifier.root
        }`
      )
      .send(jsonBuffer)
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aim returned for series 1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352 of patient MRI-DIR-T2_3 should be Lesion3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/projects/lite/subjects/MRI-DIR-T2_3/studies/1.3.6.1.4.1.14519.5.2.1.1706.4996.267501199180251031414136865313/series/1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352/aims'
      )
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(
          res.body.imageAnnotations.ImageAnnotationCollection[0].imageAnnotations.ImageAnnotation.name.value.split(
            '~'
          )[0]
        ).to.be.eql('Lesion3');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aim delete with uid 2.25.2222222222222222222222 should be successful ', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/lite/aims/2.25.2222222222222222222222')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('aims should be empty for series 1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352 of patient MRI-DIR-T2_3', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/projects/lite/subjects/MRI-DIR-T2_3/studies/1.3.6.1.4.1.14519.5.2.1.1706.4996.267501199180251031414136865313/series/1.3.6.1.4.1.14519.5.2.1.1706.4996.125234324154032773868316308352/aims'
      )
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.imageAnnotations.ImageAnnotationCollection).to.be.a('array');
        expect(res.body.imageAnnotations.ImageAnnotationCollection.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
