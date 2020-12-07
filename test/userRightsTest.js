const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('User Rights Tests', () => {
  before(async () => {
    // create users
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testAdmin@gmail.com',
        firstname: 'testAdmin',
        lastname: 'testAdmin',
        email: 'testAdmin@gmail.com',
        admin: true,
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testOwner@gmail.com',
        firstname: 'testOwner',
        lastname: 'testOwner',
        email: 'testOwner@gmail.com',
        permissions: 'CreateProject,CreateWorklist',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testMember@gmail.com',
        firstname: 'testMember',
        lastname: 'testMember',
        email: 'testMember@gmail.com',
        permissions: 'CreateUser',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testCollaborator@gmail.com',
        firstname: 'testCollaborator',
        lastname: 'testCollaborator',
        email: 'testCollaborator@gmail.com',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testCreator@gmail.com',
        firstname: 'testCreator',
        lastname: 'testCreator',
        email: 'testCreator@gmail.com',
      });
    // create project
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'testRights1',
        projectName: 'testRights1',
        projectDescription: 'testRights1',
        defaultTemplate: 'ROI',
        type: 'private',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'testRights2',
        projectName: 'testRights2',
        projectDescription: 'testRights2',
        defaultTemplate: 'ROI',
        type: 'private',
      });
    // define user access to project
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights1/users/testOwner@gmail.com')
      .query({ username: 'admin' })
      .send({ role: 'Owner' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights1/users/testMember@gmail.com')
      .query({ username: 'admin' })
      .send({ role: 'Member' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights1/users/testCollaborator@gmail.com')
      .query({ username: 'admin' })
      .send({ role: 'Collaborator' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights2/users/testCollaborator@gmail.com')
      .query({ username: 'admin' })
      .send({ role: 'Collaborator' });
  });
  after(async () => {
    // delete projects
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/testRights1')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/testRights2')
      .query({ username: 'admin' });
    // delete users
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testAdmin@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testOwner@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testMember@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testCollaborator@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testCreator@gmail.com')
      .query({ username: 'admin' });
  });
  describe('Project Access Tests', () => {
    it('should get 2 projects for testCollaborator user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 1 project for testOwner user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 1 project for testMember user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should successfully create a new project with testOwner user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'testOwner@gmail.com' })
        .send({
          projectId: 'testRights3',
          projectName: 'testRights3',
          projectDescription: 'testRights3',
          defaultTemplate: 'ROI',
          type: 'private',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail creating a new project with testMember user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'testMember@gmail.com' })
        .send({
          projectId: 'testRights4',
          projectName: 'testRights4',
          projectDescription: 'testRights4',
          defaultTemplate: 'ROI',
          type: 'private',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail deleting testRights3 project with testMember user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights3')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should successfully delete testRights3 project with testOwner user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights3')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Aim Access Tests', () => {
    before(async () => {
      // create aims for all 4 users
      try {
        const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
        const aimName =
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value;
        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testAdmin@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testAdmin_${aimName}`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135453';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testAdmin@gmail.com' });

        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testOwner@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testOwner_${aimName}`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135454';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testOwner@gmail.com' });

        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testMember@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testMember_${aimName}`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135455';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testMember@gmail.com' });

        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testCollaborator@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testCollaborator_${aimName}`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135456';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testCollaborator@gmail.com' });
      } catch (err) {
        console.log(`Aim Access Tests setup error: ${err.message}`);
      }
    });
    after(async () => {});
    it('should get 4 aims for testAdmin user in testRights1 project', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(4);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 4 aims for testOwner user in testRights1 project', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(4);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 4 aims for testMember user in testRights1 project', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(4);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get 1 aims for testCollaborator user in testRights1 project', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.rows.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in editing own aim for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get own aim with new name for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in editing testowner"s aim for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get testowner"s aim with new name for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in editing testmember"s aim for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get testmember"s aim with new name for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in editing testcollaborator"s aim for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get testcollaborator"s aim with new name for admin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should succeed in editing own aim for testcollaborator ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'collaborator_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
            .query({ username: 'testCollaborator@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should get testcollaborator"s aim with new name for testCollaborator ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('collaborator_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail getting testAdmin's aim for testCollaborator `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail in editing testAdmin's aim for testcollaborator assuming somehow it got the aim `, (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testAdmin@gmail.com';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
        'collaborator_edited';
      jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
        '2.25.3526547897685764352413254324135453';

      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testCollaborator@gmail.com' })
        .send(jsonBuffer)
        .then((resPut) => {
          expect(resPut.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail getting testOwner's aim for testCollaborator `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail in editing testOwner's aim for testcollaborator assuming somehow it got the aim `, (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testOwner@gmail.com';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
        'collaborator_edited';
      jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
        '2.25.3526547897685764352413254324135454';

      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testCollaborator@gmail.com' })
        .send(jsonBuffer)
        .then((resPut) => {
          expect(resPut.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail getting testMember's aim for testCollaborator `, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail in editing testMember's aim for testcollaborator assuming somehow it got the aim `, (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testMember@gmail.com';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
        'collaborator_edited';
      jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
        '2.25.3526547897685764352413254324135455';

      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testCollaborator@gmail.com' })
        .send(jsonBuffer)
        .then((resPut) => {
          expect(resPut.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should succeed in editing testAdmin's aim for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'owner_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
            .query({ username: 'testOwner@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should get testAdmin's aim with new name for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('owner_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should succeed in editing own aim for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'owner_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
            .query({ username: 'testOwner@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should get own aim with new name for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('owner_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should succeed in editing testMember's aim for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'owner_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
            .query({ username: 'testOwner@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should get testMember's aim with new name for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('owner_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should succeed in editing testCollaborator's aim for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'owner_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
            .query({ username: 'testOwner@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should get testCollaborator's aim with new name for testOwner`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('owner_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail in editing testAdmin's aim for testmember`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'member_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
            .query({ username: 'testMember@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(403);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail in editing testOwner's aim for testmember`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'member_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
            .query({ username: 'testMember@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(403);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should succeed in editing own aim for testmember`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'member_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
            .query({ username: 'testMember@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should get own aim with new name for testmember`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('member_edited');
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it(`should fail in editing testCollaborator's aim for testmember`, (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'member_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
            .query({ username: 'testMember@gmail.com' })
            .send(res.body)
            .then((resPut) => {
              expect(resPut.statusCode).to.equal(403);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('User Create Tests', () => {
    it('should succeed in creating new user for testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'testAdmin@gmail.com' })
        .send({
          username: 'testuser1@gmail.com',
          firstname: 'testuser1',
          lastname: 'testuser1',
          email: 'testuser1@gmail.com',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return testuser1 user with 0 project and no permission', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/users/testuser1@gmail.com')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.username).to.be.eql('testuser1@gmail.com');
          expect(res.body.projects.length).to.be.eql(0);
          expect(res.body.projectToRole.length).to.be.eql(0);
          expect(res.body.permissions).to.be.eql(['']);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail creating new user for testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'testOwner@gmail.com' })
        .send({
          username: 'testuser2@gmail.com',
          firstname: 'testuser2',
          lastname: 'testuser2',
          email: 'testuser2@gmail.com',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in creating new user for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'testMember@gmail.com' })
        .send({
          username: 'testuser3@gmail.com',
          firstname: 'testuser3',
          lastname: 'testuser3',
          email: 'testuser3@gmail.com',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return testuser3 user with 0 project and no permission', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/users/testuser3@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.username).to.be.eql('testuser3@gmail.com');
          expect(res.body.projects.length).to.be.eql(0);
          expect(res.body.projectToRole.length).to.be.eql(0);
          expect(res.body.permissions).to.be.eql(['']);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in creating another user for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'testMember@gmail.com' })
        .send({
          username: 'testuser4@gmail.com',
          firstname: 'testuser4',
          lastname: 'testuser4',
          email: 'testuser4@gmail.com',
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return testuser4 user with 0 project and no permission', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/users/testuser4@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.username).to.be.eql('testuser4@gmail.com');
          expect(res.body.projects.length).to.be.eql(0);
          expect(res.body.projectToRole.length).to.be.eql(0);
          expect(res.body.permissions).to.be.eql(['']);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in updating testuser3 for testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/users/testuser3@gmail.com')
        .query({ username: 'testOwner@gmail.com' })
        .send({ permissions: 'CreateProject' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail deleting testuser3 with testOwner user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testuser3@gmail.com')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in updating testuser3 for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/users/testuser3@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .send({ permissions: 'CreateProject' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return testuser3 user with 0 project and 1 permission for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/users/testuser3@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.username).to.be.eql('testuser3@gmail.com');
          expect(res.body.projects.length).to.be.eql(0);
          expect(res.body.projectToRole.length).to.be.eql(0);
          expect(res.body.permissions).to.be.eql(['CreateProject']);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should successfully delete testuser3 with testMember user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testuser3@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in updating testuser4 for testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/users/testuser4@gmail.com')
        .query({ username: 'testAdmin@gmail.com' })
        .send({ permissions: 'CreateProject,CreateUser' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return testuser4 user with 0 project and 2 permission2', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/users/testuser4@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.username).to.be.eql('testuser4@gmail.com');
          expect(res.body.projects.length).to.be.eql(0);
          expect(res.body.projectToRole.length).to.be.eql(0);
          expect(res.body.permissions).to.be.eql(['CreateProject', 'CreateUser']);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should successfully delete testuser4 with testAdmin user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testuser4@gmail.com')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail deleting testuser1 with testMember user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testuser1@gmail.com')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should successfully delete testuser1 with testAdmin user', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testuser1@gmail.com')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Worklist Create Tests', () => {
    it('should succeed in creating new worklist for testOwner by testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists')
        .query({ username: 'testAdmin@gmail.com' })
        .send({
          name: 'testWorklistOwner',
          worklistId: 'testWorklistOwner',
          description: 'testdesc',
          duedate: '2019-12-01',
          assignees: ['testOwner@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting worklist for testOwner by testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/worklists/testWorklistOwner')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting worklist for testOwner by testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/worklists/testWorklistOwner')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in creating new worklist for testCollaborator by testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists')
        .query({ username: 'testMember@gmail.com' })
        .send({
          name: 'testWorklistMember',
          worklistId: 'testWorklistMember',
          description: 'testdesc',
          duedate: '2019-12-01',
          assignees: ['testCollaborator@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in creating new worklist for testMember by testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists')
        .query({ username: 'testOwner@gmail.com' })
        .send({
          name: 'testWorklistMember1',
          worklistId: 'testWorklistMember1',
          description: 'testdesc',
          duedate: '2019-12-01',
          assignees: ['testMember@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in creating another worklist for testMember by testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists')
        .query({ username: 'testOwner@gmail.com' })
        .send({
          name: 'testWorklistMember2',
          worklistId: 'testWorklistMember2',
          description: 'testdesc',
          duedate: '2019-12-01',
          assignees: ['testMember@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in updating worklist testWorklistMember2 for testMember by testCollaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/worklists/testWorklistMember2')
        .query({ username: 'testCollaborator@gmail.com' })
        .send({
          name: 'testWorklistMember2',
          worklistId: 'testWorklistMember2',
          description: 'testdesc_edited',
          duedate: '2019-12-01',
          assignees: ['testMember@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting worklist testWorklistMember2 for testMember by testCollaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/worklists/testWorklistMember2')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in updating worklist testWorklistMember2 for testMember by testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/worklists/testWorklistMember2')
        .query({ username: 'testOwner@gmail.com' })
        .send({
          name: 'testWorklistMember2',
          worklistId: 'testWorklistMember2',
          description: 'testdesc_edited',
          duedate: '2019-12-01',
          assignees: ['testMember@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in updating worklist testWorklistMember2 for testMember by testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/worklists/testWorklistMember2')
        .query({ username: 'testAdmin@gmail.com' })
        .send({
          name: 'testWorklistMember2',
          worklistId: 'testWorklistMember2',
          description: 'testdesc_edited2',
          duedate: '2019-12-01',
          assignees: ['testMember@gmail.com'],
        })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting worklist testWorklistMember1 for testMember by testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/worklists/testWorklistMember1')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting worklist testWorklistMember2 for testMember by testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/worklists/testWorklistMember2')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('File Access Tests', () => {
    it('should succeed uploading jpg file in project testRights1 as testMember ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testRights1/files')
        .attach('files', 'test/data/08240122.JPG', '08240122.JPG')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in putting jpg file to project testRights2 with filename retrieval and delete should be successful for testCollaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/files')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put(`/projects/testRights2/files/${res.body[0].name}`)
            .query({ username: 'testCollaborator@gmail.com' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file in project testRights1 for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/files')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 file in project testRights1 for testCollaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/files')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting jpg file from project testRights1 with filename retrieval and delete should be successful for testCollaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/files')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testRights1/files/${res.body[0].name}`)
            .query({ username: 'testCollaborator@gmail.com' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(403);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from project testRights1 with filename retrieval and delete should be successful for testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/files')
        .query({ username: 'testOwner@gmail.com' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testRights1/files/${res.body[0].name}`)
            .query({ username: 'testOwner@gmail.com' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting jpg file from system with filename retrieval and delete should be successful for testOwner', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights2/files')
        .query({ username: 'testCollaborator@gmail.com', all: true })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testRights2/files/${res.body[0].name}`)
            .query({ username: 'testCollaborator@gmail.com' })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(403);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting jpg file from system with filename retrieval and delete should be successful for testAdmin', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights2/files')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .delete(`/projects/testRights2/files/${res.body[0].name}`)
            .query({ username: 'testAdmin@gmail.com', all: true })
            .then((resDel) => {
              expect(resDel.statusCode).to.equal(200);
              done();
            })
            .catch((e) => {
              done(e);
            });
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Template Access Tests', () => {
    it('should succeed in saving template to project by testMember ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testRights1/templates')
        .send(jsonBuffer)
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in adding template to project testRights2 by testCollaborator ', (done) => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roiOnlyTemplate.json'));
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testRights2/templates/2.25.121060836007636801627558943005335')
        .send(jsonBuffer)
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 template in project testRights1 for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/templates')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 template in project testRights1 for testCollaborator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/templates')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting template file from project testRights1 with uid for testCollaborator', (done) => {
      chai

        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((resDel) => {
          expect(resDel.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting template file from project testRights1 with uid for testMember', (done) => {
      chai

        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'testMember@gmail.com' })
        .then((resDel) => {
          expect(resDel.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting template file from project testRights1 with uid for testOwner', (done) => {
      chai

        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'testOwner@gmail.com' })
        .then((resDel) => {
          expect(resDel.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting template file from system with uid for testOwner', (done) => {
      chai

        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'testOwner@gmail.com', all: true })
        .then((resDel) => {
          expect(resDel.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting template file from system with uid for testAdmin', (done) => {
      chai

        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/templates/2.25.121060836007636801627558943005335')
        .query({ username: 'testAdmin@gmail.com', all: true })
        .then((resDel) => {
          expect(resDel.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
  describe('Subject Access Tests', () => {
    it('should succeed adding patient 3 to project testRights1 by testMember ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testRights1/subjects/3')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed adding patient 3 to project testRights2 by testCollaborator ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testRights2/subjects/3')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 subject in project testRights1 for testMember', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/subjects')
        .query({ username: 'testMember@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should return 1 subject in project testRights1 for testCollabotator', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/subjects')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting of patient 3 from project testRights1 by testCollaborator ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/subjects/3')
        .query({ username: 'testCollaborator@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should fail in deleting of patient 3 from system using all=true by testOwner ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights1/subjects/3')
        .query({ username: 'testOwner@gmail.com', all: true })
        .then((res) => {
          expect(res.statusCode).to.equal(403);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
    it('should succeed in deleting of patient 3 from project testRights2 by testAdmin ', (done) => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights2/subjects/3')
        .query({ username: 'testAdmin@gmail.com' })
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
});
