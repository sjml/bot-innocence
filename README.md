# The Bot Innocence Project
A lot of bot programs use Twitter trending topics as sources for their creations. [SimGenerator](http://twitter.com/SimGenerator), for example, occasionally uses them to create amusing hypothetical games. 

<a href="https://twitter.com/SimGenerator/status/511439289050484737"><img src="https://raw.githubusercontent.com/sjml/bot-innocence/master/pics/drake.png"/></a>

Sometimes, though, a trending topic is something that you really don't want bots to be playing with. School shootings, violent deaths, hate crimes, etc. That's where this comes in. 

It runs [on Heroku](http://bot-innocence.herokuapp.com/) and does nothing but publish a few JSON files for easy consumption into algorithms. An example in Python:

```py
import json
import urllib

# using whatever Twitter library you like, get a list of trending topics
trends = getTrendingTopics() 

# pull the latest list of muted topics
innResponse = urllib.urlopen("http://bot-innocence.herokuapp.com/muted")

# make sure it responded correctly
if innResponse.getcode() == 200:
    # load it from JSON into a Python list
    mutedTopics = json.loads(innResponse.read())

    # filter the trends list; only allow topics that aren't muted
    trends = filter(lambda x: x not in mutedTopics, trends)
```

## What To Do With the List
The list of muted topics is just data, and botmakers can do whatever they want to with it. Above is a simple example for how to keep it out of new content, but you may also wish to consider looking at recent output and deleting anything that's been muted (in case something was made before the mute list could be updated.)

## How the List Is Made
A few Twitter accounts are listed as trustworthy, and when they tweet [@BotInnocence](http://twitter.com/BotInnocence) with the phrase "mute [offending topic]," it will be added to the list for 48 hours. 

I'd like to avoid this list of trusted people getting too large, but I'm certainly willing to add to it if there are good candidates. 

## Reasons
My personal view: I don't mind "controversial" tweets, but I do mind ones that are purely in poor taste. So, for example, when Darren Wilson was not indicted, I was deleting tweets from SimGenerator that were based on variations of Michael Brown's name, but I did not remove this one: 

<a href="https://twitter.com/SimGenerator/status/537093330837209088"><img src="https://raw.githubusercontent.com/sjml/bot-innocence/master/pics/ferguson.png"/></a>

Other bot-makers may disagree -- this is why each muted topic is tagged with the person who requested the mute (or, if it's been extended from the default 48 hours, whoever requested the extension). I like this approach rather than trying to come up with a broader tagging system, since it better reflects the subjective and personal nature of the list. 
