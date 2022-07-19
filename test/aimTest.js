const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('System AIM Tests', () => {
  it('aims should be empty for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.rows).to.be.a('array');
        expect(res.body.rows.length).to.be.eql(0);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aims should be empty for fake values patient 11111, study 2222222, series 3333333 ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/11111/studies/2222222/series/3333333/aims')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.rows).to.be.a('array');
        expect(res.body.rows.length).to.be.eql(0);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim save should be successful ', (done) => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/aims')
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aims should be have one aim for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.rows).to.be.a('array');
        expect(res.body.rows.length).to.be.eql(1);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aims should be have no aim for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.11111111111111 of patient 13116', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.11111111111111/aims?format=summary'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.rows).to.be.a('array');
        expect(res.body.rows.length).to.be.eql(0);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim returned for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116 should be Lesion1', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(
          res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
            '~'
          )[0]
        ).to.be.eql('Lesion1');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim returned with uid 2.25.211702350959705565754863799143359605362 should be Lesion1', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/aims/2.25.211702350959705565754863799143359605362')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
            '~'
          )[0]
        ).to.be.eql('Lesion1');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim update with changing the name to Lesion2 should be successful ', (done) => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
    const nameSplit = jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
      '~'
    );
    nameSplit[0] = 'Lesion2';
    jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = nameSplit.join(
      '~'
    );
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/aims/${jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root}`)
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim returned for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116 should be Lesion2', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(
          res.body.rows[0].ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
            '~'
          )[0]
        ).to.be.eql('Lesion2');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim returned for patient 13116 with aimuid should be Lesion2', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/13116/aims/2.25.211702350959705565754863799143359605362')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value.split(
            '~'
          )[0]
        ).to.be.eql('Lesion2');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('it should get zip file for downloading all aims', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/aims')
      .query({ format: 'stream', username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=annotations.zip');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('it should get zip file for downloading aims for the subject 13116', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/subjects/13116/aims')
      .query({ format: 'stream', username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=annotations.zip');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('it should get zip file for downloading aims for the study 1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/aims'
      )
      .query({ format: 'stream', username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=annotations.zip');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('it should get zip file for downloading aims for the series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
      )
      .query({ format: 'stream', username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=annotations.zip');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it("it should fail getting zip file for downloading aims ['2.25.211702350959705565754863799143359605362'] with no query params", (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/aims/download')
      .send(['2.25.211702350959705565754863799143359605362'])
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(400);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it("it should fail getting zip file for downloading aims ['2.25.211702350959705565754863799143359605362'] with all query params as false", (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/aims/download?summary=false&aim=false&seg=false')
      .send(['2.25.211702350959705565754863799143359605362'])
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(500);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it("it should get zip file for downloading aims ['2.25.211702350959705565754863799143359605362'] with query params summary=true&aim=true", (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/aims/download?summary=true&aim=true')
      .send(['2.25.211702350959705565754863799143359605362'])
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=annotations.zip');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim delete with uid 2.25.211702350959705565754863799143359605362 should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/aims/2.25.211702350959705565754863799143359605362')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aims should be empty for series 1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313 of patient 13116', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get(
        '/subjects/13116/studies/1.3.12.2.1107.5.8.2.484849.837749.68675556.20031107184420110/series/1.3.12.2.1107.5.8.2.484849.837749.68675556.2003110718442012313/aims'
      )
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.rows).to.be.a('array');
        expect(res.body.rows.length).to.be.eql(0);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('seg aim save should be successful ', (done) => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/testsegaim.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/aims')
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it("it should get zip file for downloading aims ['2.25.279022005483174190474579775643265129014'] with only query param seg=true", (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/aims/download?seg=true')
      .send(['2.25.279022005483174190474579775643265129014'])
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        expect(res).to.have.header('Content-Disposition', 'attachment; filename=annotations.zip');
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  it('aim delete with uid 2.25.279022005483174190474579775643265129014 should be successful ', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/aims/2.25.279022005483174190474579775643265129014')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });

  describe('Aim Search Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testaim',
          projectName: 'testaimName',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'testaim2',
          projectName: 'testaim2Name',
          projectDescription: 'test2desc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'admin' })
        .send({
          username: 'otheruser',
          firstname: 'testCollaborator',
          lastname: 'testCollaborator',
          email: 'testCollaborator@gmail.com',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testaim/users/otheruser')
        .query({ username: 'admin' })
        .send({ role: 'Collaborator' });

      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/teaching_aim1.json'));
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim/aims')
        .send(jsonBuffer)
        .query({ username: 'otheruser' });

      const jsonBuffer2 = JSON.parse(fs.readFileSync('test/data/teaching_aim2.json'));
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testaim2/aims')
        .send(jsonBuffer2)
        .query({ username: 'admin' });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testaim2')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/otheruser')
        .query({ username: 'admin' });
    });

    it('search with subspecialty and modality ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({ fields: { subSpecialty: ['Body Imaging'], modality: ['MR', 'CT'] } })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          expect(res.body.rows[0].projectID).to.equal('testaim');
          expect(res.body.rows[0].projectName).to.equal('testaimName');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with diagnosis only ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            diagnosis: ['abdominal fat necrosis sign', 'interstitial fibrosis', 'pneumonia'],
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          expect(res.body.rows[1].name).to.equal('teaching file2');

          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with diagnosis and anatomy on mycases only ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            diagnosis: ['abdominal fat necrosis sign', 'interstitial fibrosis', 'pneumonia'],
            anatomy: ['lung'],
            myCases: true,
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file2');

          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with diagnosis on mycases only ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            diagnosis: ['abdominal fat necrosis sign', 'interstitial fibrosis', 'pneumonia'],
            myCases: true,
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file2');

          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with diagnosis on mycases = false ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            diagnosis: ['abdominal fat necrosis sign', 'interstitial fibrosis', 'pneumonia'],
            myCases: false,
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          expect(res.body.rows[1].name).to.equal('teaching file2');

          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with diagnosis on no mycases  ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            diagnosis: ['abdominal fat necrosis sign', 'interstitial fibrosis', 'pneumonia'],
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          expect(res.body.rows[1].name).to.equal('teaching file2');

          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with anatomy on mycases only and teaching files ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: { anatomy: ['lung'], myCases: true, teachingFiles: true },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('no mycases  ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: { myCases: false },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          expect(res.body.rows[1].name).to.equal('teaching file2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality on mycases only and teaching files and query ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: { modality: ['CT'], myCases: true, teachingFiles: true, query: 'lung' },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality on mycases only, teaching files, query and project (testaim2) ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT'],
            myCases: true,
            teachingFiles: true,
            query: 'lung',
            project: 'testaim2',
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality on mycases only, teaching files, query and project (testaim) with no result', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT'],
            myCases: true,
            teachingFiles: true,
            query: 'lung',
            project: 'testaim',
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality on mycases only, teaching files (false), query and project ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT'],
            myCases: true,
            teachingFiles: false,
            query: 'lung',
            project: 'testaim2',
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality for the collaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'otheruser' })
        .send({
          fields: {
            modality: ['CT'],
          },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('search with modality and filter ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT'],
          },
          filter: { name: 'teaching file2' },
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with filter and DESC sort', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          filter: { name: 'teaching file' },
          sort: ['-name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          expect(res.body.rows[1].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with filter and DESC projectName sort', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          filter: { name: 'teaching file' },
          sort: ['-projectName'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          expect(res.body.rows[1].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality and filter and DESC sort', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT'],
          },
          filter: { name: 'Teaching' },
          sort: ['-name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          expect(res.body.rows[1].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality and filter with modality and ASC sort', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT', 'MR'],
          },
          filter: { modality: 'CT' },
          sort: ['name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          expect(res.body.rows[1].name).to.equal('teaching file2');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality and filter with modality and DESC sort project', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT', 'MR'],
          },
          filter: { modality: 'CT' },
          sort: ['-project'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          expect(res.body.rows[1].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('filter with projectName', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          filter: { projectName: 'testaim' },
          sort: ['-name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          expect(res.body.rows[1].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with projectName', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: { projectName: 'testaim' },
          sort: ['-name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(2);
          expect(res.body.rows[0].name).to.equal('teaching file2');
          expect(res.body.rows[1].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality and filter with accession number starts with', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT', 'MR'],
          },
          filter: { accessionNumber: '18' },
          sort: ['name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(1);
          expect(res.body.rows[0].name).to.equal('teaching file1');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('search with modality and filter with accession number starts with should not return anything for mid word filter', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/search')
        .query({ username: 'admin' })
        .send({
          fields: {
            modality: ['CT', 'MR'],
          },
          filter: { accessionNumber: '27' },
          sort: ['name'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.total_rows).to.equal(0);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
});
