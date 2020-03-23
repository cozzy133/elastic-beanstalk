// Include the cluster module
var cluster = require('cluster');

// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    // Listen for terminating workers
    cluster.on('exit', function (worker) {

        // Replace the terminated workers
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();

    });

// Code to run if we're in a worker process
} else {
    var AWS = require('aws-sdk');
    var express = require('express');
    var bodyParser = require('body-parser');

	var awsIot = require('aws-iot-device-sdk');

    var string = "";

	//
	// Replace the values of '<YourUniqueClientIdentifier>' and '<YourCustomEndpoint>'
	// with a unique client identifier and custom host endpoint provided in AWS IoT.
	// NOTE: client identifiers must be unique within your AWS account; if a client attempts 
	// to connect with a client identifier which is already in use, the existing 
	// connection will be terminated.
	//
	var device = awsIot.device({
	   keyPath: '099c078118-private.pem.key',
	  certPath: '099c078118-certificate.pem.crt',
	    caPath: 'AmazonRootCA1.pem',
	  clientId: "laptopID",
	      host: "a12ez8atbtwwyu-ats.iot.us-east-1.amazonaws.com"
	});

	//
	// Device is an instance returned by mqtt.Client(), see mqtt.js for full
	// documentation.
	//
	device
	  .on('connect', function() {
	    console.log('connect');
	    device.subscribe('topic_1');
	    device.publish('topic_2', JSON.stringify({ test_data: 1}));
	  });

	device
	  .on('message', function(topic, payload) {
        string = payload.toString();
	    console.log('message', topic, payload.toString());
	  });

    AWS.config.region = process.env.REGION

    var sns = new AWS.SNS();
    var ddb = new AWS.DynamoDB();

    var ddbTable =  process.env.STARTUP_SIGNUP_TABLE;
    var snsTopic =  process.env.NEW_SIGNUP_TOPIC;
    var app = express();

    app.set('view engine', 'ejs');
    app.set('views', __dirname + '/views');
    app.use(bodyParser.urlencoded({extended:false}));

    app.get('/', function(req, res) {
        res.render('index', {
            value: string,
            static_path: 'static',
            theme: process.env.THEME || 'united',
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    });

    app.get('/blog', function(req, res) {
        res.render('index1', {
            static_path: 'static',
            theme: process.env.THEME || 'flatly',
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    });

    app.get('/about', function(req, res) {
        res.render('index2', {
            static_path: 'static',
            theme: process.env.THEME || 'flatly',
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    });

    app.get('/press', function(req, res) {
        res.render('index3', {
            static_path: 'static',
            theme: process.env.THEME || 'flatly',
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    });

    app.post('/signup', function(req, res) {
        var item = {
            'email': {'S': req.body.email},
            'name': {'S': req.body.name},
            'preview': {'S': req.body.previewAccess},
            'theme': {'S': req.body.theme}
        };

        ddb.putItem({
            'TableName': ddbTable,
            'Item': item,
            'Expected': { email: { Exists: false } }        
        }, function(err, data) {
            if (err) {
                var returnStatus = 500;

                if (err.code === 'ConditionalCheckFailedException') {
                    returnStatus = 409;
                }

                res.status(returnStatus).end();
                console.log('DDB Error: ' + err);
            } else {
                device.publish('topic_2', JSON.stringify({'Message': 'Name: ' + req.body.name + "\r\nEmail: " + 						req.body.email 
                                        + "\r\nPreviewAccess: " + req.body.previewAccess 
                                        + "\r\nTheme: " + req.body.theme,
                    'Subject': 'New user sign up!!!',
                    'TopicArn': snsTopic}));
                sns.publish({
                    'Message': 'Name: ' + req.body.name + "\r\nEmail: " + req.body.email 
                                        + "\r\nPreviewAccess: " + req.body.previewAccess 
                                        + "\r\nTheme: " + req.body.theme,
                    'Subject': 'New user sign up!!!',
                    'TopicArn': snsTopic
                }, function(err, data) {
                    if (err) {
                        res.status(500).end();
                        console.log('SNS Error: ' + err);
                    } else {
                        res.status(201).end();
                    }
                });            
            }
        });
    });

    var port = process.env.PORT || 3000;

    var server = app.listen(port, function () {
        console.log('Server running at http://127.0.0.1:' + port + '/');
    });
}
