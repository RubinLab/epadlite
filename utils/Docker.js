class DockerService {
  constructor(varFs) {
    // eslint-disable-next-line global-require
    const Docker = require('dockerode');
    this.fs = varFs;
    this.counter = 0;
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
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

  getContainerLog(containerId) {
    let tmpContainer;
    let strm = null;
    return new Promise((resolve, reject) => {
      try {
        console.log('docker is working on getting log for container', containerId);
        // eslint-disable-next-line func-names
        tmpContainer = this.docker.getContainer(`epadplugin_${containerId}`);
        console.log('docker service getting log for ', `epadplugin_${containerId}`);
        // eslint-disable-next-line func-names
        tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function(err, stream) {
          console.log('docker catched stream and resolving');
          // stream.pipe(process.stdout);
          strm = stream;
          if (err) {
            reject(err);
          }

          resolve(stream);
        });
        console.log('strm : ', strm);
        // resolve(strm);
      } catch (err) {
        console.log('error happened while streaming the log   : ', containerId);
        reject(err);
      }
    });
  }

  inspectContainer(containerId) {
    // eslint-disable-next-line func-names
    return new Promise((resolve, reject) => {
      const containerTemp = this.docker.getContainer(containerId);
      // eslint-disable-next-line func-names
      containerTemp.inspect(function(err, data) {
        // console.log('container came back with inspection', data);
        if (err) {
          reject(err);
        }
        if (data) {
          resolve(data);
        }
        resolve('container inspection took too long');
      });
    });

    // query API for container info
    // eslint-disable-next-line func-names

    // return _this.dataObject;
  }

  createContainer(imageId, containerNameToGive, params, containerInfo, pluginDataRootPath) {
    let tmpContainer;
    // eslint-disable-next-line prefer-destructuring
    const fs = this.fs;
    const tempContainerInfo = containerInfo;
    const paramsDocker = [...params.paramsDocker];
    const dockerFoldersToBind = [...params.dockerFoldersToBind];
    // dockerFoldersToBind = ['/Users/cavit/pluginDevelop/pluginData/admin/5/logs:/logs'];

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
          console.log('created container : ', container.id);
          tmpContainer = container;
          // eslint-disable-next-line func-names
          tmpContainer.inspect(function(err, data) {
            if (err) {
              //  console.log(err);
              console.log('error happened while inspecting plugin container : ', err);
              return err;
            }
            if (data) {
              console.log('inspect result for plugin container: ', data.Name);
              return data.Name;
            }
            return 0;
            // return 'container took too long to create';
          });
          return tmpContainer.start();
        })
        // eslint-disable-next-line func-names
        .then(async function() {
          console.log('IMPORTANT !!!!!!!!!!!');
          console.log('IMPORTANT !!!!!!!!!!!');
          console.log('IMPORTANT !!!!!!!!!!!');
          console.log('IMPORTANT !!!!!!!!!!!');
          console.log('IMPORTANT !!!!!!!!!!!');
          console.log('IMPORTANT !!!!!!!!!!!');
          
          console.log(' docker will use this folder location to put logs in *****************', pluginDataRootPath);_
          const filename = `${pluginDataRootPath}/${tempContainerInfo.creator}/${
            tempContainerInfo.id
          }/logs`;
          console.log(
            'waiting for plugin to finish processing for container :',
            containerNameToGive
          );
          console.log('docker info path to look for log', filename);
          process.chdir(filename);
          console.log('currentPath = ', process.cwd());

          // eslint-disable-next-line func-names
          tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function(err, stream) {
            const strm = fs.createWriteStream(`${filename}/logfile.txt`);
            stream.pipe(strm);
          });
          const runRes = await tmpContainer.wait();
          console.log('waiting result', runRes);
          return runRes.StatusCode;
        })
        // eslint-disable-next-line func-names
        .then(async function(errcode) {
          // errcode is recevied when container finishes and exited with an error code > 0
          console.log(
            `${errcode} plugin container is done processing. Removing the container ${containerNameToGive}`
          );
          // // eslint-disable-next-line func-names
          const waitRes = await tmpContainer.remove();
          console.log(`wait response status ${waitRes}`);

          return waitRes;
        })
        // eslint-disable-next-line func-names
        .catch(function(err) {
          console.log('error in catch docker utils creating container phase: ', err);
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
      try {
        if (this.fs.existsSync('/var/run/docker.sock')) {
          console.error('var / run found');
        }
      } catch (err) {
        console.log('var run not found');
        console.error(err);
      }
      const container = this.docker.getContainer(containerName);

      // eslint-disable-next-line prefer-destructuring
      // query API for container info
      // eslint-disable-next-line func-names
      container.inspect(function(err, data) {
        if (err) {
          //  console.log(err);
          console.log('error happened while checking container presence : ', err);
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
