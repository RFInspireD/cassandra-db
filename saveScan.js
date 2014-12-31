

var express = require("express");
var cassandra = require('cassandra-driver');
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.json());

var db = new cassandra.Client({ contactPoints: ['172.31.9.36'], keyspace: 'rfid' });
db.connect(function (err) {
    if (err)
        console.log('Failed to connect');
	else
	    console.log('Connected to db');
});

var util = require('util');

var BUCKET_1 = 10000;

function Scan(data) {
	
	this.sensorId = null;
	this.tagId = null;
	this.bucket_ts = null;
	
	function getSensorId(err, result) {
        if (err) {
			console.log(err);
			return false;
		}
		console.log(result.rows[0]);
		if (result.rows[0] != null) {
			this.sensorId = result.rows[0].sensor_id;
			checkTagId();
		} else { 
			this.sensorId = cassandra.types.uuid();
			var params = [sensorId, data.mac];
			console.log("Got uuid: " + this.sensorId);
			db.execute("INSERT INTO sensor (sensor_id, mac) VALUES (?, ?)", params, checkTagId);
		}
		console.log("Sensor Id: " + this.sensorId);
		return true;		
	}
	
	function checkTagId(error) {
		console.log("epc: " + data.epc);
		db.execute('SELECT * FROM tag WHERE tag_id = ?;', [ data.epc ], getTagId);
	}
	
	function getTagId(error, result) {
		if (error) {
			console.log(error);
			return;
		}
		if (result.rows[0] == null) {
			this.tagId = data.epc;
			db.execute("INSERT INTO tag (tag_id) VALUES (?)", [this.tagId], checkReadBucket);
		} else {
			checkReadBucket();
		}
	}
	
	function checkReadBucket(error) {
		db.execute("SELECT * FROM read_buckets WHERE sensor_id= ? LIMIT 1;", [ this.sensorId ], setReadBucket);
	}
	
	function setReadBucket(error, result) {
	    if (error) {
		    console.log(error);
			return;
		}
		console.log("Timestamp: " + data.timestamp);
		if (result.rows[0] == null) {
		    this.bucket_ts = parseInt(data.timestamp, 10);
			db.execute("INSERT INTO read_buckets (sensor_id, bucket_ts, bucket_size) VALUES (?,?,?);", [this.sensorId, this.bucket_ts, BUCKET_1], {prepare: true}, setReadTimeline);
		} else {
		    this.bucket_ts = result.rows[0].bucket_ts;
			setReadTimeline();
			//db.execute("UPDATE read_buckets SET bucket_size = bucket_size + 1 WHERE sensor_id = ? AND bucket_ts = ? ", [this.sensorId, this.bucket_ts], setReadTimeline);
		}

	}
	
	function setReadTimeline(error) {
		if (error) {
		    console.log(error);
			return;
		}
		console.log("Bucket ts: " + this.bucket_ts);
		console.log("Bucket ts int: " + this.bucket_ts.getTime());
		
		db.execute("INSERT INTO read_timeline (sensor_id,bucket_ts,event_time,read) VALUES (?,?,?,?)", 
		           [this.sensorId, this.bucket_ts, parseInt(data.timestamp, 10), JSON.stringify(data)], {prepare: true}, function(err) {
				      if (err)
					     console.log(err);
				   });
		
	}
	
	function perform() {
		db.execute('SELECT sensor_id FROM sensor WHERE mac = ?;', [ data.mac ], getSensorId);
	}
	
	this.perform = perform;
}

app.post('/scan', function (req, res) {

	var scan = new Scan(req.body);
	scan.perform();
	res.writeHead(200, {"Content-Type": "text/plain"});
	res.end("OK");
});




app.listen(8080);

