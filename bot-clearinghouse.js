// thanks to Darius Kazemi and Courtney Stanton for sharing their code
//   for @101atron, on which this is heavily based.

var fs = require('fs');
var http = require('http');
var Twit = require('twit');



var credentials;
try {
  credentials = JSON.parse(fs.readFileSync('credentials.json', 'ascii'));
} 
catch (err) {
  console.error("Error opening the credentials file:");
  console.log(err);
}

var T = new Twit(credentials);

var info = {};
info.Creator = "Shane Liesegang (@OptimistPanda)";
info.GitHub = "http://github.com/sjml/bot-innocence";
info.Description = "This is a centralized clearinghouse where bot creators can get an up-to-date list of potentially trending topics they may wish to avoid. It can be added to by trusted Twitter accounts.";
info.HowItWorks = "The 'muted' dictionary is an index of phrases to avoid and an expiration timestamp relative to the UNIX epoch.";
info.HowToAdd = "If you're one of the trusted sources, tweet @BotInnocence saying 'mute [offending phrase]' and it will be muted for 48 hours."
info.AlternateURL = "You can get just the muted list (without this extra data) at /muted";

var trustedSources = ["@OptimistPanda", "@tinysubversions", "@BooDooPerson"];
var trustedLower = trustedSources.map(
  function(x) {
    return x.substring(1).toLowerCase();
  }
);

function stringify(object) {
  return JSON.stringify(object, null, 2);
}

var mutedPhrases = []; //TODO: persist
var since_id = null; //TODO: persist

function checkForCommands() {
  var params = {include_rts: false};
  if (since_id != null) {
    params.since_id = since_id;
  }
  T.get('statuses/mentions_timeline', params, 
    function (err, reply) {
      for (var i = reply.length - 1; i >= 0; i -= 1) {
        since_id = reply[i].id;
        if (trustedLower.indexOf(reply[i].user.screen_name.toLowerCase()) < 0) {
          continue;
        }
        var re = /mute\s+(.*)/i;
        var match = reply[i].text.match(re);
        if (match != null) {
          var toMute = match[1];
          mutePhrase(toMute);
        }
      }
    }
  );

  var currentTimeStamp = getTime();
  mutedPhrases = mutedPhrases.filter(
    function(x) {
      return x[1] > currentTimeStamp;
    }
  );
}

function getTime() {
  return Math.floor(Date.now() / 1000);
}

function mutePhrase(phrase) {
  var freshTime = getTime();
  var futureTime = freshTime + (60 * 60 * 24 * 2); // two days should do it, typically
  // var futureTime = freshTime + (5); // 5 seconds for testing purposes
  for (var i = mutedPhrases.length - 1; i >= 0; i--) {
    if (mutedPhrases[i][0] === phrase) {
      mutedPhrases[i][1] = futureTime;
      return;
    }
  }
  mutedPhrases[mutedPhrases.length] = [phrase, futureTime];
}

function getMutedPhrases() { //TODO: persist
  return mutedPhrases;
}

function buildFullOutput() {
  var fullOutput = {}
  fullOutput.info = info;
  fullOutput.trustedSources = trustedSources;
  fullOutput.muted = getMutedPhrases();
  fullOutput.currentTimeStamp = getTime();

  return stringify(fullOutput);
}

function buildMutedOutput() {
  var output = {}
  output.muted = getMutedPhrases();
  output.currentTimeStamp = getTime();

  return stringify(output);
}






var server = http.createServer(
  function (request, response) {
    if (request.url === "/") {
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(buildFullOutput());
    }
    else if (request.url === "/muted") {
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(buildMutedOutput());
    }
    else {
      var errObj = {
        question : "What are you doing here?",
      };
      response.writeHead(404, {"Content-Type" : "application/json"});
      response.end(stringify(errObj));
    }
  }
);
server.listen(process.env.PORT || 5000);


checkForCommands();
setInterval(function() {
  try {
    checkForCommands();
  }
  catch (e) {
    console.log(e);
  }
}, 
1000 * 60 * 2); // checks every 2 minutes
