Yield = require("./yield");
var $ = require('jquery-deferred');

Yield.log = console.log;
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

(function* someInner() {

	// log("calling ssleep");
	// var a = yield ssleep(500);
	// log("returned from ssleep with", a);

	// log("Yielding twice");
	// a = ssleep(1000);
	// log("Yielding first time", yield a);
	// log("Yielding second time", yield a);

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
}).run(function(err, res) {
	log("Finished");
});