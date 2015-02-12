var http = require('http');

var server = http.createServer(function (request, response) {
  response.writeHead(200, {"Content-Type": "text/plain"});
  response.end("This will be some flavor of thing.\n");
});

server.listen(process.env.PORT || 5000);

console.log("Starting server...");