var TN = require('twitter-node').TwitterNode;
var sys = require('sys');
var http = require('http');
var events = require('events');
var URL = require('url');
var qs = require('querystring');
var atdb = require('./atdb');
var emitter = new events.EventEmitter();

// requires the 'twitter-node' plugin
var twit = new TN({
   user: process.env['AMZNTWEET_USER'],
   password: process.env['AMZNTWEETS_PASSWORD'],
   track: ['amzn']
});
var dbname = 'amazontweets';
var colname = 'tweets';
var db = atdb.new(dbname);
// list of 100 amazon links
var recent100 = [];

// parse the tweet for amzn urls and emit an amzn_url event to be parsed
// if an amzn url is found
function parseTweet(tweet) {
   var urls = tweet.entities.urls;
   for (var i = 0; i < urls.length; i++) {
      if(urls[i].url.match(/^http:\/\/amzn.to/)) {
         emitter.emit('amzn_tweet', {'url':urls[i].url, 'tweet':tweet});
         break;
      }
   }
}

twit.addListener('tweet', parseTweet).stream();

// return the image url for the product given the asin
function getImgUrl(asin) {
   return 'http://images.amazon.com/images/P/' + asin + '.01._MZZZZZZZ_.jpg';
}

// listen for amzn_url events and resolve the url to the full amazon link
// then push into the list of 100 amazon links
emitter.addListener('amzn_tweet', function(amzn_tweet) {
   var req_url = URL.parse(amzn_tweet['url']); 
   var tweet = amzn_tweet['tweet'];

   var req_opts = { host:req_url.host, method:'HEAD', path:req_url.pathname };
   var req = http.request(req_opts, function(res) {
      var amazon_url = res.headers.location;
      if (!amazon_url) return;
      var asin = getAsin(amazon_url);
      var domain = getDomain(amazon_url);
      // only add if we can find the asin which links to a product 
      // rather than some random amazon page
      if (asin) {
         var timestamp = new Date(Date.parse(tweet.created_at)).getTime();
         var img_url = getImgUrl(asin);
         var t = { 
            'tweet_id':tweet.id, 
            'username':tweet.user["screen_name"],
            'asin':asin, 
            'domain':domain,
            'img_url':img_url,
            'url':amazon_url,
            'timestamp':timestamp 
            };
         db.insert(colname, t);
         recent100.push(t);
         while (recent100.length > 100) {
            recent100.shift();
         }
      }
   });
   req.end();
});

// get the asin of the product from an amazon url
// returns null if it's not found or if the link isn't a product page
function getAsin(amazon_url) {
   if (!amazon_url) return null;
   var asin = amazon_url.match(/\/dp\/([a-zA-Z0-9]+)/);
   if (!asin)
      asin = amazon_url.match(/\/gp\/product\/([a-zA-Z0-9]+)/);
   if (asin) 
      return asin[1];
   return null;
}
// get the amazon top level domain e.g. .co.jp, .com, .de, etc
function getDomain(amazon_url) {
   if (!amazon_url) return null;
   var domain = amazon_url.match(/amazon(\.[^\/]+)/);
   if (domain) return domain[1];
   return null;
}

function makeJsonCallStr(callName, jsonstr) {
   return callName + '({"results":' + jsonstr  + '})';
}
// http server
http.createServer(function (req, res) {
      var querystr = qs.parse(URL.parse(req.url).query);
      var jsonCall = querystr['callback'] || 'jsonCallback';
      if (querystr['tophour']) {
         //top items domains in the past hour
         var n = querystr['tophour'];
         var end = new Date().getTime();
         var start = end - 60*60*1000;
         db.top(colname, n, start, end, function (results) {;
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end(makeJsonCallStr(jsonCall, JSON.stringify(results)));
            });
      } else if (querystr['callback']) {
         res.writeHead(200, {'Content-Type': 'text/plain'});
         res.end(makeJsonCallStr(jsonCall, JSON.stringify(recent100)));
      } else {
         res.writeHead(200, {'Content-Type': 'text/html'});
         res.write('<ol>');
         for (var i = 0; i < recent100.length; i++) {
            res.write('<li><a href="' + recent100[i]['url']+ '"><img src="' + recent100[i]['img_url'] + '" /></a></li>\n');
         }
         res.write('</ol>');
         res.end('\n');
      }
}).listen(17484, "localhost");
