// obfuscate browser component
// uses chrome headless to mimic real browsing
// should accept arguments for site, useragent, screen size, 
var MongoClient = require('mongodb').MongoClient,
    assert = require('assert');
var mongo_url = 'mongodb://localhost:27017/obfuscator';
const util = require('util');
const crypto = require('crypto');
const secret = 'fjdklsanfiadwniln';

// mongo
// MongoClient.connect(mongo_url, function(err, db) {
//     assert.equal(null, err);
//     console.log("Connected successfully to server");
//     findDocuments(db, function() {
//         db.close();
//     });
// });

var url = 'http://localhost:3000/test'; // should be set over cli
// var url = 'https://www.theguardian.com/uk/'; // should be set over cli
var platform = 'desktop';  // should be set over cli

var screen_sizes = {
    iphone_6: "375,667",
    iphone_5: "320,568",
    mobile: "320,568", // just using iphone 5 for convenience
    desktop: "1366,768"
};

var user_agent = randUA(platform);
var screen_size = screen_sizes[platform];

const chrome = require('chrome-remote-interface');

function onPageLoad(Runtime) {
    // debug values
    const ua = "document.querySelector('#user-agent').textContent";
    const sc = "document.querySelector('#screen-size').textContent";
    // link(s)
    
    // choose a random link from the page - two ways, 2nd is much better, from: https://groups.google.com/a/chromium.org/forum/#!topic/headless-dev/hwOy1rgQGyU
    // const href = "[].slice.call(document.querySelectorAll('a'),0)[Math.floor(Math.random() * [].slice.call(document.querySelectorAll('a'),0).length)].href";
    var code = "(function() { var links = []; for (let a of document.querySelectorAll('a')) { if ((a.href != '')  && (a.href != window.location)) { links.push(a.href); } } var rand = links[Math.floor(Math.random() * links.length)]; return JSON.stringify({'link': rand}); }())";

    return Runtime.evaluate({
        expression: code
    }).then(result => {
        var link = JSON.parse(result.result.value).link;

        // console.log(util.inspect(link, false, null));
        return link;

    }).catch(err => {
        return launcher.kill().then(() => { // Kill Chrome if there's an error.
            throw err;
        }, console.error);
    });
}

const {
    ChromeLauncher
} = require('lighthouse/lighthouse-cli/chrome-launcher');

/**
 * Launches a debugging instance of Chrome on port 9222.
 * @param {boolean=} headless True (default) to launch Chrome in headless mode.
 *     Set to false to launch Chrome normally.
 * @return {Promise<ChromeLauncher>}
 */
function launchChrome(headless = true) {
    const launcher = new ChromeLauncher({
        port: 9222,
        autoSelectChrome: true, // False to manually select which Chrome install.
        additionalFlags: [
            '--window-size=412,732',
            '--disable-gpu',
            // '--remote-debugging-port=9222',
            '--user-agent=' + user_agent,
            headless ? '--headless' : ''

        ]
    });

    return launcher.run().then(() => launcher)
        .catch(err => {
            return launcher.kill().then(() => { // Kill Chrome if there's an error.
                throw err;
            }, console.error);
        });
}

launchChrome().then(launcher => {
    // chrome.Version().then(version => console.log(version['User-Agent']));


    chrome(protocol => {
        // Extract the parts of the DevTools protocol we need for the task.
        // See API docs: https://chromedevtools.github.io/devtools-protocol/
// console.log(`Chrome debugging port running on ${launcher.port}`);
        const {
            Page,
            // Network, 
            Runtime
        } = protocol;

        // First, need to enable the domains we're going to use.
        Promise.all([
            Page.enable(),
            // Network.enable(),
            Runtime.enable()
        ]).then(() => {
            

            console.log("Navigating to: " + url);

            // Page.navigate({
            // url: url
            // });
            // this logs all network requests
            // Network.requestWillBeSent(params => {
            //     console.log(params.request.url);
            //   });

            // Wait for window.onload before doing stuff.
            // Page.loadEventFired(() => {
            // onPageLoad(Runtime).then(result => {
            // console.log("getting first url: " + result);
            // randUrl1 = result;


            getPage(url);

            function getPage(pageUrl) {
                console.log("Fetching " + pageUrl);
                // need url validation somewhere

                Page.navigate({
                    url: pageUrl
                });
                insertUrl(pageUrl);

                Page.loadEventFired(() => {
                    onPageLoad(Runtime).then(result2 => {

                        // if we get bored of that site, let's go elsewhere
                        // if ([0,1][Math.floor(Math.random() * 2)] == 1) {
                            // var res = boredSurfer();
                            // console.log("bored : " + res);
                        // }
                        
                        // console.log("getting next url: " + result2);
                        getPage(result2);
                    }).catch((error) => {
                        console.log(error, 'Promise error');
                    });
                });
            }

            // don't get trapped in crawl loops, try another site
            function boredSurfer() {
                console.log("I'm bored");
                var url;
                MongoClient.connect(mongo_url, function(err, db) {

                    var col = db.collection('urls');

                    // choose a random record
                    col.aggregate([{
                        $sample : { size : 1 }
                    }]).toArray(function(err, docs) {
                        console.log("URL: " + docs[0].url);
                        return docs[0].url;
                        url = docs[0].url;
                        // return docs;
                    });
                    db.close();
                    return url;
                });

            }
            // sleep for a random amount of time
            function sleepySurfer() {
                console.log("I'm sleepy");

            }
            // protocol.close();
            // launcher.kill(); // Kill Chrome.
            // });
            // });
            // console.log(`Chrome debugging port running on ${launcher.pid}`);



        });

    }).on('error', err => {
        throw Error('Cannot connect to Chrome:' + err);
    });

});

function insertUrl(url) {
    var url_id = crypto.createHmac('sha256', secret).update(url).digest('hex');
    var date = new Date(Date.now()).toISOString();

    MongoClient.connect(mongo_url, function(err, db) {
        var col = db.collection('logs');
        col.updateOne(
            { _id : url_id },
            {
                $set : {
                    url : url,
                    last_visited : date
                },
                $inc : {
                    hits : 1
                }
            },
            {upsert : true}
        ).then(function(r) {
            db.close();
        }).catch((err) => {
            console.error(err.message);
        });
    });
}

function validateUrl(url) {
    if (url.match(/^https?:\/\//)) {
        return url;
    } else {
        return false;
    }
}

function randUA(type) {
    var desktop_user_agents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0',
        'Mozilla/5.0 (Windows NT 6.1; rv:24.0) Gecko/20100101 Firefox/24.0',
        'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.112 Safari/535.1',
        'Mozilla/5.0 (Windows NT 6.2; rv:30.0) Gecko/20100101 Firefox/30.0',
        'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.57 Safari/537.17',
        'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.114 Safari/537.36',
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1309.0 Safari/537.17",
        "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.15 (KHTML, like Gecko) Chrome/24.0.1295.0 Safari/537.15",
        "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.14 (KHTML, like Gecko) Chrome/24.0.1292.0 Safari/537.14",
        "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_4) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1290.1 Safari/537.13",
        "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.13 (KHTML, like Gecko) Chrome/24.0.1284.0 Safari/537.13",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_2) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.6 Safari/537.11",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.26 Safari/537.11",
        "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.17 Safari/537.11",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/537.4 (KHTML, like Gecko) Chrome/22.0.1229.94 Safari/537.4",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_0) AppleWebKit/537.4 (KHTML, like Gecko) Chrome/22.0.1229.79 Safari/537.4",
        "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.2 (KHTML, like Gecko) Chrome/22.0.1216.0 Safari/537.2",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/22.0.1207.1 Safari/537.1",
        "Mozilla/5.0 (X11; CrOS i686 2268.111.0) AppleWebKit/536.11 (KHTML, like Gecko) Chrome/20.0.1132.57 Safari/536.11",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.6 (KHTML, like Gecko) Chrome/20.0.1092.0 Safari/536.6",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.6 (KHTML, like Gecko) Chrome/20.0.1090.0 Safari/536.6",
        "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/19.77.34.5 Safari/537.1",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/536.5 (KHTML, like Gecko) Chrome/19.0.1084.9 Safari/536.5",
        "Mozilla/5.0 (Windows NT 6.0) AppleWebKit/536.5 (KHTML, like Gecko) Chrome/19.0.1084.36 Safari/536.5",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1063.0 Safari/536.3",
        "Mozilla/5.0 (Windows NT 5.1) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1063.0 Safari/536.3",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1063.0 Safari/536.3",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1062.0 Safari/536.3",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1062.0 Safari/536.3",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.1 Safari/536.3",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.1 Safari/536.3",
        "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.1 Safari/536.3",
        "Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.3 (KHTML, like Gecko) Chrome/19.0.1061.0 Safari/536.3",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.24 (KHTML, like Gecko) Chrome/19.0.1055.1 Safari/535.24",
        "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/535.24 (KHTML, like Gecko) Chrome/19.0.1055.1 Safari/535.24",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.24 (KHTML, like Gecko) Chrome/19.0.1055.1 Safari/535.24",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.22 (KHTML, like Gecko) Chrome/19.0.1047.0 Safari/535.22",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1042.0 Safari/535.21",
        "Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1041.0 Safari/535.21",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.20 (KHTML, like Gecko) Chrome/19.0.1036.7 Safari/535.20",
        "Mozilla/5.0 (Macintosh; AMD Mac OS X 10_8_2) AppleWebKit/535.22 (KHTML, like Gecko) Chrome/18.6.872",
        "Mozilla/5.0 (X11; CrOS i686 1660.57.0) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.46 Safari/535.19",
        "Mozilla/5.0 (Windows NT 6.0; WOW64) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.45 Safari/535.19",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.45 Safari/535.19",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.45 Safari/535.19"
    ];

    var iphone_user_agents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 8_0 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.0 Mobile/12A365 Safari/600.1.4',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 8_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.0 Mobile/12B411 Safari/600.1.4'
    ];
    if (type == 'mobile') {
        return iphone_user_agents[Math.floor(Math.random() * iphone_user_agents.length)];
    } else {
        return desktop_user_agents[Math.floor(Math.random() * desktop_user_agents.length)];
    }

}

process.on('SIGINT', function () {
    console.log("closed");
    // launchChrome.kill();
    process.exit (0);
});

// irregular privacy advocate