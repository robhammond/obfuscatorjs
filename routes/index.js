var express = require('express');
var router = express.Router();

var exec = require('child_process').exec;

var MongoClient = require('mongodb').MongoClient,
    assert = require('assert');
var mongo_url = 'mongodb://localhost:27017/obfuscator';
const util = require('util');
const crypto = require('crypto');
const secret = 'fjdklsanfiadwniln';

router.get('/', function(req, res, next) {
    res.render('index', {
        title: 'RandomSurferDude'
    });
});

// system command to start script
router.get('/on', function(req, res, next) {
	function puts(error, stdout, stderr) { console.log(stdout) }
	exec("node ./bin/obfuscate.js", puts);
	// exec("pwd", puts);
	
    res.redirect('/');
});

// system command to stop script
router.get('/off', function(req, res, next) {
	function puts(error, stdout, stderr) { console.log(stdout) }
	// To be implemented
    res.redirect('/');
});

// return status of script in JSON
router.get('/status', function(req, res, next) {
	// to be implemented
    res.redirect('/');
});

// view seed sites
router.get('/view-sites', function(req, res, next) {
    var urls;
    MongoClient.connect(mongo_url, function(err, db) {

        // Create a collection we want to drop later
        var col = db.collection('urls');

        // Peform a simple find and return all the documents
        col.find().toArray(function(err, docs) {
            assert.equal(null, err);
            // console.log(docs);
            urls = docs;

            res.render('view_sites', {
                title: 'View Sites',
                urls: urls
            });

            db.close();
        });
    });

});

// view crawl logs
router.get('/logs', function(req, res, next) {
    var urls;
    MongoClient.connect(mongo_url, function(err, db) {
        var col = db.collection('logs');

        // Peform a simple find and return all the documents
        col.find().sort({last_visited : -1}).toArray(function(err, docs) {
            assert.equal(null, err);
            // console.log(docs);
            urls = docs;

            res.render('logs', {
                title: 'Logs',
                urls: urls
            });

            db.close();
        });
    });

});

// add new site(s)
router.get('/add-site', function(req, res, next) {
    res.render('add_site', {
        title: 'Add site'
    });
});

// handle form
router.post('/add-site', function(req, res, next) {
    console.log(req.body.urls);

    var urls_arr = req.body.urls.split("\n");
    var urls = [];
    for (var i = 0; i < urls_arr.length; i++) {
    	var date = new Date(Date.now()).toISOString();
        var url_id = crypto.createHmac('sha256', secret).update(urls_arr[i]).digest('hex');
        urls.push({
            _id: url_id,
            url: urls_arr[i],
            added: date
        });
    }

    MongoClient.connect(mongo_url, function(err, db) {
        var col = db.collection('urls');
        col.insertMany(urls).then(function(r) {
            // console.log(urls.length, r.insertedCount);
            db.close();
        }).catch((err) => {
            console.error(err.message);
        });
    });

    res.redirect('/view-sites');
});

// page for test crawling
router.get('/test', function(req, res, next) {
    res.render('test', {
        title: 'Test page'
    });
});

module.exports = router;