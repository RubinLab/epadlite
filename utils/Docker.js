/* eslint-disable no-console */
//  const { Docker } = require('node-docker-api');
//  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
//  const { Docker } = require('dockerode');

class DockerService {
  constructor() {
    // eslint-disable-next-line global-require
    const Docker = require('dockerode');
    this.counter = 0;
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
  }

  // eslint-disable-next-line no-unused-vars
  // createVolume(_name) {
  //   this.docker
  //     .createVolume({ Name: 'testvolume' })
  //     .then(() => {
  //       //  console.log('volume created');
  //     })
  //     .catch(() => {
  //       //  console.log('error happened while creating volume');
  //     });
  // }

  stopContainer(containerId) {
    return new Promise((resolve, reject) => {
      try {
        console.log('docker is working on stopping container', containerId);
        // eslint-disable-next-line func-names
        this.docker.getContainer(containerId).stop(() => {
          console.log('container stopped  : ', containerId);
          resolve('stopped');
        });
      } catch (err) {
        console.log('error happened while stopping container  : ', containerId);
        reject(err);
      }
    });
  }

  createContainer(imageId, containerNameToGive, params) {
    let tmpContainer;
    const paramsDocker = [...params.paramsDocker];
    const dockerFoldersToBind = [...params.dockerFoldersToBind];
    console.log('params list used in container : ', paramsDocker);
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log(
      '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ mapping these dockerFoldersToBind : ',
      dockerFoldersToBind
    );
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    return (
      this.docker
        .createContainer({
          Image: imageId,
          name: containerNameToGive,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: paramsDocker,
          //  Cmd: ['/bin/bash', '-c', 'tail -f /var/log/dmesg'],
          OpenStdin: false,
          StdinOnce: false,
          HostConfig: {
           Binds: ['/home/epad/thick_test_v4/pluginData/admin/2/dicoms:/Code_Deploy_CWT/Data_v1'],
          },
        })
        // eslint-disable-next-line func-names
        .then(function(container) {
          console.log('created container : ', container);
          tmpContainer = container;
          // eslint-disable-next-line func-names
          tmpContainer.inspect(function(err, data) {
            if (err) {
              //  console.log(err);
              console.log('error happened while inspecting plugin container : ', err);
            }
            if (data) {
              console.log('inspect result for plugin container: ', data);
            }
          });
          return tmpContainer.start();
        })
        // eslint-disable-next-line func-names
        .then(function() {
          console.log('waiting for plugin to finish processing for container :', tmpContainer);
          // eslint-disable-next-line func-names
          tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function(err, stream) {
            stream.pipe(process.stdout);
          });

          return tmpContainer.wait();
        })
        // eslint-disable-next-line func-names
        .then(function() {
          console.log('plugin container is done processing. Removing the container', tmpContainer);
          return tmpContainer.remove();
        })
        // eslint-disable-next-line func-names
        .catch(function(err) {
          console.log('error while creating container : ', err);
          return err;
        })
    );
  }

  listContainers() {
    const contianerList = [];
    return this.docker
      .listContainers({ all: true })
      .then(containers => {
        // eslint-disable-next-line no-unused-vars
        containers.forEach(container => {
          const contObj = {
            id: container.Id,
            names: container.Names,
            state: container.State,
            status: container.Status,
            mounts: container.Mount,
          };
          contianerList.push(contObj);
        });
        return contianerList;
      })
      .catch(error => {
        return new Error('Something went wrong while getting docker container list', error);
      });
  }

  listImages() {
    const imageList = [];
    return this.docker
      .listImages({ all: true })
      .then(images => {
        images.forEach(image => {
          const imageObject = {
            id: image.Id,
            RepoTags: image.RepoTags,
          };
          imageList.push(imageObject);
        });
        return imageList;
      })
      .catch(error => {
        console.log('Something went wrong while getting docker image list');
        return new Error('Something went wrong while getting docker image list', error);
      });
  }

  //  does not follow image pulling process
  pullImage(img) {
    return this.docker
      .pull(img)
      .then(() => {
        console.log('pulling image succeed : ', img);
      })
      .catch(() => {
        console.log('error happened while pulling the image', img);
      });
  }

  pullImageA(img) {
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line func-names
        this.docker.pull(img, function(err, stream) {
          if (err) {
            reject(err);
          } else {
            let counter = 0;
            const infoWord = ` image: ${img} pulling `;
            let showInfo = '';
            stream.on('data', () => {
              if (counter === 0) {
                process.stdout.write(`${infoWord}\r`);
                counter += 1;
              } else if (counter >= 1 && counter < 10) {
                // eslint-disable-next-line operator-assignment
                showInfo = `${showInfo}.`;
                // eslint-disable-next-line prefer-template
                process.stdout.write(infoWord + showInfo + '\r');
                //  process.stdout.write('\r');
                counter += 1;
              } else {
                counter = 0;
                // eslint-disable-next-line prettier/prettier
                process.stdout.write(
                  // eslint-disable-next-line prefer-template
                  infoWord + '               \r'
                );
                showInfo = '';
              }
            });
            stream.on('end', () => {
              console.log('pulling image succeed : ', img);
              resolve('finished pulling');
            });
          }
        });
      } catch (err) {
        resolve(err);
      }
    });
  }

  checkContainerExistance(containerName) {
    return new Promise((resolve, reject) => {
      const container = this.docker.getContainer(containerName);
      console.log('error happened while checking container presence : ');
      // eslint-disable-next-line prefer-destructuring
      // query API for container info
      // eslint-disable-next-line func-names
      container.inspect(function(err, data) {
        if (err) {
          //  console.log(err);
          console.log('error happened while checking container presence : ');
          reject(err);
        }
        if (data) {
          console.log('checking container presence succeed: ', containerName);
          resolve(data);
        }
      });
    });
  }

  deleteContainer(containerName) {
    return new Promise((resolve, reject) => {
      try {
        const container = this.docker.getContainer(containerName);
        container.remove();
        console.log('deleting container succeed : ', containerName);
        resolve('success');
      } catch (err) {
        console.log('error happened while deleting container  : ', containerName);
        reject(err);
      }
    });
  }
}

module.exports = DockerService;
