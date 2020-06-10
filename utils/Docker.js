//  const { Docker } = require('node-docker-api');
//  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
//  const { Docker } = require('dockerode');

class DockerService {
  constructor() {
    // eslint-disable-next-line global-require
    const Docker = require('dockerode');
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

  stopContainer(containerId) {
    return new Promise((resolve, reject) => {
      try {
        console.log('docker is working on stopping container', containerId);
        // eslint-disable-next-line func-names
        this.docker.getContainer(containerId).stop(() => {
          console.log('stopped returning : ');
          resolve('stopped');
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  createContainer(imageId, containerNameToGive, params) {
    let auxContainer;
    const paramsDocker = [...params.paramsDocker];
    const dockerFoldersToBind = [...params.dockerFoldersToBind];
    console.log('params from docker container side', paramsDocker);
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
            Binds: dockerFoldersToBind,
          },
        })
        // eslint-disable-next-line func-names
        .then(function(container) {
          auxContainer = container;
          return auxContainer.start();
        })
        // eslint-disable-next-line func-names
        .then(function() {
          console.log('waitin for plugin container to finish processing');
          return auxContainer.wait();
        })
        // eslint-disable-next-line func-names
        .then(function() {
          console.log('plugin container is done processing. Removing the container');
          return auxContainer.remove();
        })
        // eslint-disable-next-line func-names
        .catch(function(err) {
          console.log('start container error : ', err);
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
        return new Error(error);
      });
  }

  listImages() {
    const imageList = [];
    return this.docker
      .listImages({ all: true })
      .then(images => {
        images.forEach(image => {
          //  console.log('each image', image);
          const imageObject = {
            id: image.Id,
            RepoTags: image.RepoTags,
          };
          // const imageObject = {
          //   id: image.Id,
          //   names: image.Names,
          //   imagename: image.Image,
          //   imageid: image.ImageID,
          //   command: image.Command,
          //   state: image.State,
          // };
          imageList.push(imageObject);
        });
        return imageList;
      })
      .catch(error => console.log(error));
  }

  //  does not follow image pulling process
  pullImage(img) {
    return this.docker
      .pull(img)
      .then(() => {
        console.log('image pulled');
      })
      .catch(() => {
        console.log('error happened while pulling image');
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
            stream.on('data', info => console.log(info));
            stream.on('end', () => {
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
      // query API for container info
      // eslint-disable-next-line func-names
      container.inspect(function(err, data) {
        if (err) {
          //console.log(err);
          reject(err);
        }
        if (data) {
          //console.log(data);
          resolve(data);
        }
      });
    });
  }

  deleteContainer(containerName) {
    return new Promise((resolve, reject) => {
      try {
        const container = this.docker.getContainer(containerName);
        // query API for container info
        // eslint-disable-next-line func-names
        container.remove();
        resolve('success');
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = DockerService;
