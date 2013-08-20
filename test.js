var _y = require("./yield");
var $ = require('jquery-deferred');

var runner = require("qunit");
runner.run({
    code : "./yield.js",
    tests : "./tests/main.js"
});

_y.log = console.log;
var log = console.log;

function* ssleep(timeout) {
	return function(cb) {
		console.log("Sleeping for", timeout);
		setTimeout(function() {
			console.log("Finished sleeping for", timeout);
			cb(null, "timeout " + timeout + " completed");
		}, timeout);
	}
}

function asyncSleep(timeout, cb) {
	log("Called", arguments);
	setTimeout(function() { cb(null); } , timeout)
}

function thrower(msg, cb) {
	cb(new Error(msg));
}

// TEST
// 	- empty return in generator
//  - errors in all scenarios

(function*() {

	(function*() {
	    var a = yield ssleep(100)
	    console.log("inner finished", a);
	}).run();
	return;

	console.log("Map parallel wait")
	yield _([1000,2000,3000]).map(function*(timeout) {
		yield ssleep(timeout);
	});

	try {
		var t = yield _y.gen(thrower)("Err 1");
	} catch(e) {
		log("Caught error", e.stack);
	}

	var t2 = yield _y.gen(thrower)("Err 2");

	var x = ssleep(100).run();
	var y = ssleep(200).run();
	log ("Waiting");
	yield y;
	log ("y completed");
	yield x;
	log ("x completed")

	log("Waiting for gen on functioncompleted");
	yield x;
	yield _y.gen(asyncSleep)(100);

	log("Waiting for gen on object");
	var gened = _y.gen({ a: asyncSleep, b: asyncSleep });
	var res = yield [ gened.a(100), gened.b(200)];

	log("calling ssleep");
	var a = yield ssleep(500);
	log("returned from ssleep with", a);

	log("Yielding twice");
	a = ssleep(1000);
	log("Yielding first time", yield a);
	log("Yielding second time", yield a);

	log("Yielding twice concurrently");
	a = ssleep(100);
	log("Concurrently 2 returned", yield [a,a])


	a = ssleep(100);
	var b = ssleep(200);
	var rets = yield [a, b];
	log("Parallel returned ", rets);

	var ret = yield $.Deferred(function(deferred) { setTimeout(function() { deferred.resolve("ret") } , 500)} );
	log("Deferred returned ", ret)

	// //yield 0;
	// //yield 1;
	// //yield 2;
	a = yield function(cb) { setTimeout(function() { cb(null, "!!VALUE!!")} , 500); }
	log("Got", a, "back from yield");
	log("start 200");
	
	return function(cb) { setTimeout(cb, 200); }
})
// .run(function(err, res) {
// 	log("Finished with", [err, res]);
// });