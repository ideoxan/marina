<h1 align="center">marina</h1>
<h6 align="center">The virtual sandbox environment that powers Ideoxan lessons.</h6>

## About
Marina is the Websocket server used to create [Docker](https://www.docker.com/) containers that are tailored for specific purposes. For instance, if a user had logged onto [Ideoxan](https://ideoxan.com/) and started on a lesson about Node.js. Then the server would send a request internally to the MarinaWS server to create a new container with Node.js installed by default. The Marina websocket server would authenticate the request, build the specific image associated with the lesson, spawn a new container with said image, and then provide a websocket service that connects directly with the terminal. The goals for this project are...
- To have a quick hot start time
- Be able to spin up and break down containers within seconds upon user request
- Have a light but powerful sandbox for each user
- Ensure all security practices are kept in mind when sending over code to be executed from a foreign environment
