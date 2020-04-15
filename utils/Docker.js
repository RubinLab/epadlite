//  const { Docker } = require('node-docker-api');
//  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const { Docker } = require('dockerode');

class DockerService {
  constructor() {
    //  const Docker = require('dockerode');
    this.counter = 0;
    //  this.tar = require('tar-fs');
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  getdockerObj() {
    return this.docker;
  }

  // eslint-disable-next-line no-unused-vars
  startContainer(containerId, _containerName) {
    //  console.log('container started dockerode');
    const container = this.docker.getContainer(containerId);
    return new Promise((resolve, reject) => {
      container.start((err, data) => {
        //  console.log('starting container ......');
        if (err) {
          reject(err);
        }
        if (data) {
          //  console.log('we call inspect promise');
          resolve(
            // eslint-disable-next-line no-shadow
            new Promise((resolve, reject) => {
              // eslint-disable-next-line func-names
              setTimeout(function() {
                container.inspect((cnterr, cntdata) => {
                  if (cntdata) {
                    resolve(data);
                  }
                  if (err) {
                    reject(cnterr);
                  }
                });
              }, 3000);
            })
          );
        }
      });
    });
    /*
    container.start(
      function(err, data) {
        console.log('------------ start :', data);
      },
      () => {
        container.inspect(function(err, data) {
          console.log('------------- inspect : ', data.State.Status);
        });
      }
    );
    */
  }

  // eslint-disable-next-line no-unused-vars
  createVolume(_name) {
    this.docker
      .createVolume({ Name: 'testvolume' })
      .then(() => {
        //  console.log('volume created');
      })
      .catch(() => {
        //  console.log('error happened while creating volume');
      });
  }
  // we change the one below
  // createContainer(imageId, containerNameToGive) {
  //   let auxContainer;

  //   return this.docker
  //     .createContainer({
  //       Image: imageId,
  //       name: containerNameToGive,
  //       AttachStdin: false,
  //       AttachStdout: true,
  //       AttachStderr: true,
  //       Tty: true,
  //       //Cmd: ['/bin/bash', '-c', 'tail -f /var/log/dmesg'],
  //       OpenStdin: false,
  //       StdinOnce: false,
  //       // HostConfig: {
  //       //   Binds: ['testvolume:/home'],
  //       // },
  //       // HostConfig: {
  //       //   Binds: ['/Users/cavit/epadlitev1/distribution/ePad/exampleContaienr/sharewcont:/stuff'],
  //       // },
  //     })
  //     .then(function(container) {
  //       auxContainer = container;
  //       return auxContainer.start();
  //     })
  //     .catch(function(err) {
  //       console.log(err);
  //     });
  // }
  // createContainer(imageId, containerNameToGive, contRemove) {
  //   return;
  //   this.docker.createContainer(
  //     {
  //       Image: imageId,
  //       // Cmd: ['/bin/ls', '/tmp/app'],
  //       // Volumes: {
  //       //   '/tmp/app': {},
  //       // },
  //     },
  //     function(err, container) {
  //       console.log('attaching to... ' + container.id);

  //       container.attach({ stream: true, stdout: true, stderr: true, tty: true }, function(
  //         err,
  //         stream
  //       ) {
  //         stream.pipe(process.stdout);

  //         console.log('starting... ' + container.id);

  //         container.start(
  //           // {
  //           //   Binds: [volume + ':/tmp/app'],
  //           // },
  //           function(err, data) {}
  //         );

  //         container.wait(function(err, data) {
  //           console.log('waiting end ... ' + container.id);
  //           console.log('data : ', data);
  //           contRemove(err, data);
  //           //container.remove(contRemove(err, data));
  //           // container.kill(function(err, data) {
  //           //   console.log('removing... ' + container.id);

  //           // });
  //         });
  //       });
  //     }
  //   );
  // }
  createContainer(imageId, containerNameToGive) {
    let auxContainer;
    return (
      this.docker
        .createContainer({
          Image: imageId,
          name: containerNameToGive,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          // Cmd: ['/bin/bash', '-c', 'tail -f /var/log/dmesg'],
          OpenStdin: false,
          StdinOnce: false,
          HostConfig: {
            Binds: ['testvolume:/home'],
          },
        })
        // eslint-disable-next-line func-names
        .then(function(container) {
          auxContainer = container;
          return auxContainer.start();
        })

        // eslint-disable-next-line func-names
        .then(function() {
          //  console.log('waitin for plugin container to finish processing');
          return auxContainer.wait();
        })
        // eslint-disable-next-line func-names
        .then(function() {
          //  console.log('plugin container is done processing. Removing the container');
          return auxContainer.remove();
        })
        // eslint-disable-next-line func-names
        .then(function() {
          //  console.log('plugin container removed successfully ');
          return 204;
        })
        // eslint-disable-next-line func-names
        .catch(function() {
          //  console.log(err);
        })
    );
  }

  listContainers() {
    return (
      this.docker
        .listContainers({ all: true })
        // Inspect
        .then(containers => {
          // eslint-disable-next-line no-unused-vars
          containers.forEach(container => {
            //  console.log('---------containers--------------', container);
            // console.log('id :', container.Id);
            // console.log('names :', container.Names);
            // console.log('image :', container.Image);
            // console.log('State :', container.State);
            // console.log('State ', container.Status);
            // console.log('Mounts :', container.Mounts);
          });
        })
        .catch(error => {
          throw new Error(error);
        })
    );
  }

  listImages() {
    const imageList = [];
    return this.docker
      .listContainers({ all: true })
      .then(images => {
        images.forEach(image => {
          //  console.log('images', image);
          const imageObject = {
            id: image.Id,
            names: image.Names,
            imagename: image.Image,
            imageid: image.ImageID,
            command: image.Command,
            state: image.State,
          };
          imageList.push(imageObject);
        });
        return imageList;
      })
      .catch(error => console.log(error));
  }

  pullImage(img) {
    return this.docker
      .pull(img)
      .then(() => {
        //  console.log('image pulled');
      })
      .catch(() => {
        //  console.log('error happened while pulling image');
      });
  }

  pullImageWc(img, cnt) {
    const self = this;
    this.docker.pull(img, (_err, stream) => {
      // eslint-disable-next-line no-use-before-define
      this.docker.modem.followProgress(stream, onFinished, onProgress);

      // eslint-disable-next-line no-unused-vars
      function onFinished(err, _output) {
        if (!err) {
          //  console.log('\nDone pulling.');
          self.createContainer(img, cnt);
        } else {
          //  console.log(err);
        }
      }
      // eslint-disable-next-line no-unused-vars
      function onProgress(_event) {}
    });
  }
  /*
  createContainer(containerImage, containerName) {
    this.docker.container
      .create({
        Image: containerImage,
        name: containerName,
      })
      .then(container => container.start())
      .then(console.log('container started'))
      // .then(container => container.stop())
      // .then(container => container.restart())
      // .then(container => container.delete({ force: true }))
      .catch(error => console.log(error));
  }

  startContainer(containerId, containerName) {}

  stopContainer(containerId, containerName) {}
  deleteContainer() {}

  listContainers() {
    this.docker.container
      .list()
      // Inspect
      .then(containers => {
        containers.forEach(container => {
          console.log(container.data.Image);
        });
      })
      .catch(error => console.log(error));
  }
  pullImage(imagerepository, imagetag) {
    this.docker.image
      .create({}, { fromImage: imagerepository, tag: imagetag })
      .then(stream => this.promisifyStream(stream))
      .then(() => this.docker.image.get(imageLocation).status())
      .then(image => image.history())
      .then(events => console.log(events))
      .catch(error => console.log(error));
  }

  listImages() {}
  deleteImage() {}
*/
}

module.exports = DockerService;
