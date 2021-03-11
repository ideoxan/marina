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
