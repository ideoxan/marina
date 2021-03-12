<h1 align="center">marina</h1>
<h6 align="center">The virtual sandbox environment that powers Ideoxan lessons.</h6>

## About
Marina is the Websocket server used to create [Docker](https://www.docker.com/) containers that are tailored for specific purposes. For instance, if a user had logged onto [Ideoxan](https://ideoxan.com/) and started on a lesson about Node.js. Then the server would send a request internally to the MarinaWS server to create a new container with Node.js installed by default. The Marina websocket server would authenticate the request, build the specific image associated with the lesson, spawn a new container with said image, and then provide a websocket service that connects directly with the terminal. The goals for this project are...
- To have a quick hot start time
- Be able to spin up and break down containers within seconds upon user request
- Have a light but powerful sandbox for each user
- Ensure all security practices are kept in mind when sending over code to be executed from a foreign environment

### How it Works
Marina leverages the command line (via [exec](https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback)) and the Docker API (*coming soon*) to create these virtual environments. Dockerfiles use base images such as the `node` image, the `ubuntu-20.04` image, and various others so that essential items (like the bash command line, git, etc.) are all included and readily available for use. Images are cached automatically to ensure that build times are minimal for fresh images or new users. After approximately 60 minutes of inactivity, docker instances are scrubbed and removed. Since code is automatically uploaded to Ideoxan's database, there is no need to save the docker filesystem or any other content not needed for the lesson. If a user comes back to request a container within those 60 minutes, the docker is simply powered on. If not, then all the code is just re-downloaded into the main directory.

### Addressing Concerns

#### Possible Exploits
To prevent any possible attack vectors, root access is removed from the start. A default, powerless user (by the name of none other than "user") is added and the root privileges of the root user are removed. This takes out a large portion of the attack surface only leaving a few possible ways for users to obtain root access. Containers are always up to date with the latest versions of images to ensure that in the event of a lack of there being a massive security issue found in an image and a lack of maintenance on the project, that the issue can be resolved automatically with minimal human intervention (if any is needed at all). Even in the event that a user does obtain root access of a container, there is very little damage that can be done to anything that exists outside of the container. Of course, Docker should always stay updated to the latest version to ensure that if any vulnerabilities were to present themselves in a container allowing privileged access of the "outside environment" that they can be patched as quickly as possible. 
#### Running Applications
Hypothetically, a application could be run from within the container. However, the user would have to stay active the entire time to ensure that the application was running. For instance, let's say there is a user that wants to run a server. To do so, they would have to stay active in the editor (which would be hard to do via automation, even with things like AHK) for the entire time. If they did not, then their container would be forcibly closed. There is **no** grace shutdown period allotted to containers. Anything and everything will be killed once the user fails to be active after a certain time. Data will persist, yes, but only the data. No process will be running in the background when the user exits. If you are looking for something like that, then I suggest you check out [replit](https://repl.it/) or [Heroku](https://www.heroku.com/) which can be used for actual server hosting.
#### Server Load
Since both the [Ideoxan server](https://github.com/ideoxan/ideoxan) and Marina are hosted on the same ~~measly~~ server (at least for now), there is a concern about the possible load that Marina could incur on the server, or vice versa. This is why each container is limited in the amount of resources they can use. The current limits are hard coded at:
- 32 MB RAM (allowing for 60 instances on a 4GB server with 2GB reserved for the server instance)
- 1% of all CPUs (allowing for 75 instances with 25% reserved for the server instance)

The Marina instance was stress tested on a virtual environment with similar specs and was able to handle around 50 or so concurrent connections (each with a mean latency of around 29ms) before eventually throwing OOM (out of memory) error. These connections are planned to be handled dynamically so that only a certain number of instances can be created.


## Contributing
See our [contributing guidelines](https://github.com/ideoxan/contributing) for more help.

## License and Community
While this repository as a whole is licensed under the [Server-Side Public License (SSPL)](LICENSE), keep in mind that this does not mean that *all* content is under said license. Certain documents and media included or referenced to may be licensed differently, restricted/copyrighted, or may not be licensed at all.

This project is maintained and governed in accordance with the project's official [Code of Conduct](https://github.com/ideoxan/contributing/blob/main/CODE_OF_CONDUCT.md). Agreement to its terms and conditions, along with [Ideoxan's Official Terms of Service](https://ideoxan.com/tos), [Ideoxan's Privacy Policy](https://ideoxan.com/privacy) and the included [license (SSPL)](LICENSE) is *required* to contribute to this organization's project.
