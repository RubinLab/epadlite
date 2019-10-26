const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe('Worklist Tests', () => {
  before(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testCreator@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'testCreator@gmail.com',
        permissions: 'CreateWorklist',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testAssignee@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'testAssignee@gmail.com',
      });
  });
  after(async () => {
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testCreator@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testAssignee@gmail.com')
      .query({ username: 'admin' });
  });
  it('worklists should have 0 worklists created by the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should create a new worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/worklists?username=testCreator@gmail.com')
      .send({
        worklistName: 'test',
        worklistId: 'testCreate',
        description: 'testdesc',
        dueDate: '2019-12-01',
        assignees: ['testAssignee@gmail.com'],
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 0 worklists created by the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 1 worklist assigned to the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/testAssignee@gmail.com/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should fail creating a new worklist for unknown user with 401', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/worklists')
      .query({ username: 'aaaa' })
      .send({
        name: 'test2',
        worklistid: 'testCreate2',
        description: 'testdesc2',
        duedate: '2019-12-01',
      })
      .then(res => {
        expect(res.statusCode).to.equal(401);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 1 worklist created by the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should update the new worklists fields', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/worklists/testCreate?username=testCreator@gmail.com')
      .send({
        name: 'testUpdated2',
        description: 'testdescUpdated',
        duedate: '2019-12-31',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('The new worklist should be updated with worklist field data', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        expect(res.body[0].name).to.be.eql('testUpdated2');
        expect(res.body[0].description).to.be.eql('testdescUpdated');
        expect(res.body[0].dueDate).to.be.eql('2019-12-31');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it("should update the new worklist's assignee", done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/worklists/testCreate?username=testCreator@gmail.com')
      .send({
        user: 'testAssignee@gmail.com',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  // it('The new worklist should be updated with the new assignee data', done => {
  //   chai
  //     .request(`http://${process.env.host}:${process.env.port}`)
  //     .get('/users/testAdmin@gmail.com/worklists?username=testCreator@gmail.com')
  //     .then(res => {
  //       expect(res.statusCode).to.equal(200);
  //       expect(res.body.length).to.be.eql(1);
  //       done();
  //     })
  //     .catch(e => {
  //       done(e);
  //     });
  // });
  // it('should create a link between a worklist and a study', done => {
  //   chai
  //     .request(`http://${process.env.host}:${process.env.port}`)
  //     .post('/users/1/worklists/2/projects/1/subjects')
  //     .send({
  //       studyId: '1',
  //     })
  //     .query({ username: 'admin' })
  // .then(res => {
  //       expect(res.statusCode).to.equal(200);
  //       done();
  //     })
  //     .catch(e => {
  //       done(e);
  //     });
  // });
  it('should delete the worklist', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/worklists/testCreate?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('worklists should have 0 worklists', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/worklists?username=testCreator@gmail.com')
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  describe('Worklist Progress Tests', () => {
    before(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'admin' })
        .send({
          username: 'testProgressUser1@gmail.com',
          firstname: 'user1Name',
          lastname: 'user1Surname',
          email: 'testProgressUser1@gmail.com',
          permissions: 'CreateWorklist,CreateProject',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/users')
        .query({ username: 'admin' })
        .send({
          username: 'testProgressUser2@gmail.com',
          firstname: 'user2Name',
          lastname: 'user2Surname',
          email: 'testProgressUser2@gmail.com',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists?username=testProgressUser1@gmail.com')
        .send({
          worklistName: 'testProgressW',
          worklistId: 'testProgressW',
          description: 'testdesc',
          dueDate: '2019-12-01',
          assignees: ['testProgressUser1@gmail.com', 'testProgressUser2@gmail.com'],
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects?username=testProgressUser1@gmail.com')
        .send({
          projectId: 'testProgressP',
          projectName: 'testProgressP',
          projectDescription: 'testdesc',
          defaultTemplate: 'ROI',
          type: 'private',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testProgressP/users/testProgressUser2@gmail.com')
        .query({ username: 'testProgressUser1@gmail.com' })
        .send({ role: 'Member' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .put('/projects/testProgressP/subjects/3/studies/0023.2015.09.28.3')
        .query({ username: 'admin' });
    });
    after(async () => {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testProgressUser1@gmail.com')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/users/testProgressUser2@gmail.com')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/worklists/testProgressW')
        .query({ username: 'admin' });
      // TODO fails to delete
      // await chai
      //   .request(`http://${process.env.host}:${process.env.port}`)
      //   .delete('/projects/testProgressP')
      //   .query({ username: 'admin' });
    });
    it('should requirement to the worklist ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists/testProgressW/requirements')
        .send({
          level: 'study',
          template: 'any',
          numOfAims: 2,
          required: true,
        })
        .query({ username: 'testProgressUser1@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should requirement to the worklist ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/worklists/testProgressW/requirements')
        .send({
          level: 'series',
          template: 'ROI',
          numOfAims: 1,
          required: true,
        })
        .query({ username: 'testProgressUser1@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail adding study to the worklist with no study desc', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(
          '/worklists/testProgressW/projects/testProgressP/subjects/3/studies/0023.2015.09.28.3'
        )
        .query({ username: 'testProgressUser1@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(400);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should add study to the worklist', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post(
          '/worklists/testProgressW/projects/testProgressP/subjects/3/studies/0023.2015.09.28.3'
        )
        .query({ username: 'testProgressUser1@gmail.com' })
        .send({ studyDesc: 'fake study desc', subjectName: 'fake subject name' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim save to project testProgressP by testProgressUser1 should be successful ', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testProgressUser1@gmail.com';
      // fake the study and patient to match nock
      jsonBuffer.ImageAnnotationCollection.person.id.value = '3';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root =
        '0023.2015.09.28.3';
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testProgressP/aims')
        .send(jsonBuffer)
        .query({ username: 'testProgressUser1@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get worklist progress for worklist testProgressW', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/worklists/testProgressW/progress')
        .query({ username: 'testProgressUser1@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          expect(res.body[0].assignee).to.be.eql('testProgressUser1@gmail.com');
          expect(res.body[0].assignee_name).to.be.eql('user1Name user1Surname');
          expect(res.body[0].subject_uid).to.be.eql('3');
          expect(res.body[0].subject_name).to.be.eql('fake subject name');
          expect(res.body[0].study_uid).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].worklist_requirement_id).to.be.eql(1);
          expect(res.body[0].worklist_requirement_desc).to.be.eql('2:any:study');
          expect(res.body[0].completeness).to.be.eql(50);
          expect(res.body[1].assignee).to.be.eql('testProgressUser1@gmail.com');
          expect(res.body[1].assignee_name).to.be.eql('user1Name user1Surname');
          expect(res.body[1].subject_uid).to.be.eql('3');
          expect(res.body[1].subject_name).to.be.eql('fake subject name');
          expect(res.body[1].study_uid).to.be.eql('0023.2015.09.28.3');
          expect(res.body[1].worklist_requirement_id).to.be.eql(2);
          expect(res.body[1].worklist_requirement_desc).to.be.eql('1:ROI:series');
          expect(res.body[1].completeness).to.be.eql(100);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim save to project testProgressP by testProgressUser2 should be successful ', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
        '2.25.3526547897685764352413254324135412';
      jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testProgressUser2@gmail.com';
      // fake the study and patient to match nock
      jsonBuffer.ImageAnnotationCollection.person.id.value = '3';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root =
        '0023.2015.09.28.3';
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testProgressP/aims')
        .send(jsonBuffer)
        .query({ username: 'testProgressUser2@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('aim save to project testProgressP by testProgressUser2 should be successful ', done => {
      const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
      jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
        '2.25.3526547897685764352413254324135413';
      jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testProgressUser2@gmail.com';
      // fake the study and patient to match nock
      jsonBuffer.ImageAnnotationCollection.person.id.value = '3';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageReferenceEntityCollection.ImageReferenceEntity[0].imageStudy.instanceUid.root =
        '0023.2015.09.28.3';
      jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].typeCode = [
        {
          code: 'SEG',
          codeSystemName: '99EPAD',
          'iso:displayName': {
            'xmlns:iso': 'uri:iso.org:21090',
            value: 'SEG Only',
          },
        },
      ];
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects/testProgressP/aims')
        .send(jsonBuffer)
        .query({ username: 'testProgressUser2@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get worklist progress for worklist testProgressW', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/worklists/testProgressW/progress')
        .query({ username: 'testProgressUser1@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(4);
          expect(res.body[0].assignee).to.be.eql('testProgressUser1@gmail.com');
          expect(res.body[0].assignee_name).to.be.eql('user1Name user1Surname');
          expect(res.body[0].subject_uid).to.be.eql('3');
          expect(res.body[0].subject_name).to.be.eql('fake subject name');
          expect(res.body[0].study_uid).to.be.eql('0023.2015.09.28.3');
          expect(res.body[0].worklist_requirement_id).to.be.eql(1);
          expect(res.body[0].worklist_requirement_desc).to.be.eql('2:any:study');
          expect(res.body[0].completeness).to.be.eql(50);
          expect(res.body[1].assignee).to.be.eql('testProgressUser1@gmail.com');
          expect(res.body[1].assignee_name).to.be.eql('user1Name user1Surname');
          expect(res.body[1].subject_uid).to.be.eql('3');
          expect(res.body[1].subject_name).to.be.eql('fake subject name');
          expect(res.body[1].study_uid).to.be.eql('0023.2015.09.28.3');
          expect(res.body[1].worklist_requirement_id).to.be.eql(2);
          expect(res.body[1].worklist_requirement_desc).to.be.eql('1:ROI:series');
          expect(res.body[1].completeness).to.be.eql(100);
          expect(res.body[2].assignee).to.be.eql('testProgressUser2@gmail.com');
          expect(res.body[2].assignee_name).to.be.eql('user2Name user2Surname');
          expect(res.body[2].subject_uid).to.be.eql('3');
          expect(res.body[2].subject_name).to.be.eql('fake subject name');
          expect(res.body[2].study_uid).to.be.eql('0023.2015.09.28.3');
          expect(res.body[2].worklist_requirement_id).to.be.eql(1);
          expect(res.body[2].worklist_requirement_desc).to.be.eql('2:any:study');
          expect(res.body[2].completeness).to.be.eql(100);
          expect(res.body[3].assignee).to.be.eql('testProgressUser2@gmail.com');
          expect(res.body[3].assignee_name).to.be.eql('user2Name user2Surname');
          expect(res.body[3].subject_uid).to.be.eql('3');
          expect(res.body[3].subject_name).to.be.eql('fake subject name');
          expect(res.body[3].study_uid).to.be.eql('0023.2015.09.28.3');
          expect(res.body[3].worklist_requirement_id).to.be.eql(2);
          expect(res.body[3].worklist_requirement_desc).to.be.eql('1:ROI:series');
          expect(res.body[3].completeness).to.be.eql(100);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
