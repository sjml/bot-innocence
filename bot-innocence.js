// thanks to Courtney Stanton and Darius Kazemi for sharing their code
//   for @101atron, on which this is heavily based.

var fs    = require('fs');
var url   = require('url');
var http  = require('http');
var twit  = require('twit');
var redis = require('redis');


var twitterClient = null;
var redisClient = null;

//connections
if (process.env.ON_HEROKU) {
  var credentials = {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  };
  twitterClient = new twit(credentials);

  var rtg = url.parse(process.env.REDISTOGO_URL);
  redisClient = redis.createClient(rtg.port, rtg.hostname);
  redisClient.auth(rtg.auth.split(":")[1]);
}
else {
  try {
    var credentials = JSON.parse(fs.readFileSync('credentials.json', 'ascii'));
    twitterClient = new twit(credentials);
  } 
  catch (err) {
    console.error("Error opening the credentials file:");
    console.log(err);
  }

  redisClient = redis.createClient();
}

//info for front page
var info = {};
info.Creator = "Shane Liesegang (@OptimistPanda)";
info.GitHub = "http://github.com/sjml/bot-innocence";
info.Description = "This is a centralized clearinghouse where bot creators can get an up-to-date list of trending topics they may wish to avoid. It can be updated by trusted Twitter accounts.";
info.HowItWorks = "The 'muted' list contains phrases to avoid, an expiration timestamp relative to the UNIX epoch, and the Twitter name of the person who requested the mute.";
info.HowToAdd = "If you're one of the trusted sources, tweet @BotInnocence saying 'mute [offending phrase]' and it will be muted for 48 hours."
info.AlternateURL = "You can get just the muted list (without this extra data) at /muted or /muted_with_data";

var trustedSources = ["@OptimistPanda", "@tinysubversions", "@BooDooPerson"];
var trustedLower = trustedSources.map(
  function(x) {
    return x.substring(1).toLowerCase();
  }
);

var mutedPhrases = []; // "where the magic happens"
var since_id = null; // what's the most recent tweet we've checked





function stringify(object) {
  return JSON.stringify(object, null, 2);
}


function getTime() {
  return Math.floor(Date.now() / 1000);
}


function checkForCommands() {
  if (since_id == null) {
    return; // don't run anything if values haven't been set yet
  }
  var needsPersistence = false;
  var params = {
    include_rts: false,
    since_id: since_id
  };
  twitterClient.get("statuses/mentions_timeline", params, 
    function (err, reply) {
      if (!err) {
        console.log("Checking " + reply.length + " tweets...");
        for (var i = reply.length - 1; i >= 0; i -= 1) {
          since_id = reply[i].id_str;
          console.log("\tTweet " + since_id);
          if (trustedLower.indexOf(reply[i].user.screen_name.toLowerCase()) < 0) {
            console.log("\t\tIgnoring tweet from " + reply[i].user.screen_name);
            continue;
          }
          var re = /mute\s+(.*)/i;
          var match = reply[i].text.match(re);
          if (match != null) {
            var toMute = match[1];
            mutePhrase(toMute, since_id, reply[i].user.screen_name);
            needsPersistence = true;
          }
        }
        redisClient.set("innocence:since_id", since_id);
      }
      else {
        console.error("Couldn't connect to the Twitters.");
        console.log(err);
      }

      // look for ones to expire
      console.log("Checking expiry...")
      var muteLength = mutedPhrases.length;
      var currentTimeStamp = getTime();
      mutedPhrases = mutedPhrases.filter(
        function(x) {
          return x[1] > currentTimeStamp;
        }
      );
      if (muteLength != mutedPhrases.length) {
        console.log("Trimmed list.");
        needsPersistence = true;
      }
      else {
        console.log("No expirations.");
      }

      if (needsPersistence) {
        redisClient.set("innocence:mute_list", stringify(mutedPhrases));
      }
      
      console.log("DONE with command check!");
    }
  );
}


function mutePhrase(phrase, requestingID, name) {
  var freshTime = getTime();
  var futureTime = freshTime + (60 * 60 * 24 * 2); // two days should do it, typically

  // let the world know what we've done
  var tweetString = "";

  var date = new Date(futureTime * 1000);
  var dateString = 
    date.getUTCMonth().toString() + "/" + 
    date.getUTCDate().toString() + 
    " at " + 
    date.getUTCHours().toString() + date.getUTCMinutes().toString() + " GMT";

  for (var i = mutedPhrases.length - 1; i >= 0; i--) {
    if (mutedPhrases[i][0] === phrase) {
      mutedPhrases[i][1] = futureTime;
      mutedPhrases[i][2] = "@" + name;
      tweetString = "Extending mute of " + phrase + " until " + dateString + ", per @" + name + ".";
    }
  }
  if (tweetString.length == 0) {
    mutedPhrases[mutedPhrases.length] = [phrase, futureTime, "@" + name];
    tweetString = "Muting " + phrase + " until " + dateString + ", per @" + name + ".";
  }

  twitterClient.post("statuses/update", 
    {
      status: tweetString, 
      in_reply_to_status_id: requestingID
    },
    function(err, data, response) {
      if (err) {
        console.error("Trouble tweeting!");
        console.log(response);
      }
    }
  );
}


function buildFullOutput(withTimes) {
  var fullOutput = {}
  fullOutput.info = info;
  fullOutput.trustedSources = trustedSources;
  fullOutput.muted = mutedPhrases;
  fullOutput.currentTimeStamp = getTime();

  return stringify(fullOutput);
}


function buildMutedOutput(withTimes) {
  if (withTimes == undefined) {
    withTimes = true;
  }
  if (withTimes) {
    var output = {};
    output.muted = mutedPhrases;
    output.currentTimeStamp = getTime();
    return stringify(output);
  }
  else {
    var output = mutedPhrases.map(
      function(x) {
        return x[0];
      }
    );
  }

  return stringify(output);
}


// get redis values
redisClient.exists("innocence:since_id", 
  function(existsErr, existsReply) {
    if (existsReply) {
      redisClient.get("innocence:since_id", 
        function(getErr, getReply) {
          if (getErr) {
            since_id = "-1";
            console.error(getErr);
          }
          else {
            since_id = getReply;
            console.log("since_id: " + since_id);
          }
        }
      );
    }
    else {
      console.log("No since_id found.");
      since_id = "-1";
      redisClient.set("innocence:since_id", "-1");
    }
  }
);

redisClient.exists("innocence:mute_list", 
  function(existsErr, existsReply) {
    if (existsReply) {
      redisClient.get("innocence:mute_list", 
        function(getErr, getReply) {
          if (getErr) {
            mutedPhrases = [];
            console.error(getErr);
          }
          else {
            mutedPhrases = JSON.parse(getReply);
            console.log("Loaded phrases: " + getReply);
          }
        }
      );
    }
    else {
      console.log("No mute_list found.");
      mutedPhrases = [];
      redisClient.set("innocence:mute_list", "[]");
    }
  }
);


// start web
var server = http.createServer(
  function (request, response) {
    if (request.url === "/") {
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(buildFullOutput());
    }
    else if (request.url === "/muted") {
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(buildMutedOutput(false));
    }
    else if (request.url === "/muted_with_data") {
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(buildMutedOutput());
    }
    else {
      var errObj = {
        justOneQuestion : "What are you doing here?",
      };
      response.writeHead(404, {"Content-Type" : "application/json"});
      response.end(stringify(errObj));
    }
  }
);
server.listen(process.env.PORT || 5000);

setTimeout(
  function() {
    console.log("Initial check...");
    checkForCommands();
    // begin periodic checks
    console.log("Setting up intervals.");
    setInterval(
      function() {
        console.log("INTERVAL TICK");
        try {
          checkForCommands();
        }
        catch (e) {
          console.log(e);
        }
      },
      1000 * 60 * 2 // checks every 2 minutes
    );
  },
  2000 // wait a few seconds for initial check, to get values from redis
);
