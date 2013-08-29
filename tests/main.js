var Y = require("../yyield");
var $ = require("jquery-deferred");
var _ = require("lodash");

// Setup logging
Y.log = function() {
	if (arguments.length === 0) {
		console.log();
	}
	else if (arguments.length == 1) {
		console.log(arguments[0]);
	}
	else if (arguments.length == 2) {
		console.log(arguments[0], arguments[1]);
	}
	else if (arguments.length == 3) {
		console.log(arguments[0], arguments[1], arguments[2]);
	}
	else if (arguments.length == 4) {
		console.log(arguments[0], arguments[1], arguments[2], arguments[3]);
	}
	else {
		console.log("MULTIPLE");
	}
};

// Utility function used in testing
var runCount = 0;
function* sleep(timeout) {
	return function(cb) {
		runCount++;
		if (timeout <= 0) {
			cb(null, timeout);
			return;
		}
		setTimeout(function() {
			cb(null, timeout);
		}, timeout);
	}
}

function asyncSleep(timeout, cb) {
	setTimeout(function() { cb(); } , timeout)
}

function thrower(msg, cb) {
	cb(new Error(msg));
}

var oldAsyncTest = asyncTest;
asyncTest = function genAwareAsyncTest(name, testFunc) {
	if (!Y.isGeneratorFunction(testFunc)) {
		oldAsyncTest.apply(this, arguments);
		return;
	}
	oldAsyncTest(name, function() {
		(function*() {
			yield testFunc();
			start();
		}).run();
	})
};

var oldThrows = throws;
throws = function genAwareThrows(throwingFunc, descOrTypeOrMessage, message) {
	if (!Y.isGeneratorFunction(throwingFunc)) {
		oldThrows.apply(this, arguments);
		return;
	}
	oldThrows(function() {
		(function*() {
			yield throwingFunc();
			start();
		}).run();
	}, descOrTypeOrMessage, message);
}
	
// TEST
// 	- empty return in generator
//  - errors in all scenarios

asyncTest("sync 0 second sleep via generators", function*() {
	yield sleep(0);
	ok(true, "Completed synchronously")
});

asyncTest("Yielding on same generator object twice", function*() {
	runCount = 0;
	var timeout = 1;
	var a = sleep(timeout);
	var b = yield a;
	var c = yield a;
	equal(b, c, "result 1");
	equal(c, timeout , "result 2");
	equal(runCount, 1, "Just one call");
});

asyncTest("Yielding twice concurrently", function*() {
	runCount = 0;
	var timeout = 1;
	var a = sleep(timeout);
	var res = yield [a,a];
	equal(res[0], timeout, "res[0]");
	equal(res[1], timeout, "res[1]");
	equal(runCount, 1, "Just one call");
});

asyncTest("Empty return should be ok", function*() {
	yield (function*() {
		yield a = sleep(1);
		return;
	})();
	ok(true, "Empty return worked fine");
});

asyncTest("jQuery deferred", function*() {
	var returnValue = "returned";
	var ret = yield $.Deferred(function(deferred) { 
		setTimeout(function() { 
			deferred.resolve(returnValue) 
		}, 1);
	});
	equal(ret, returnValue, "Right return value from jQuery");
});

asyncTest("Undefined variable use should result in ReferenceError", function*() {
	try {
		var ret = yield (function*() { NOT_EXISTING(); })()
		ok(false, "No error thrown");
	}
	catch(e) {
		console.log("We caught it", e.stack);
		ok(true, "Exception thrown");
		ok(e instanceof ReferenceError, "e instanceof ReferenceError");
		start();
	}
});

asyncTest("Make sure we get ReferenceError in callback to generator", function*() {
	(function*() {
		var ret = yield (function*() { NOT_EXISTING(); })()
		ok(false, "Function did not throw");
	}).run(function(e, results) {
		ok(e instanceof ReferenceError, "e instanceof ReferenceError");
		start();
	});
});

asyncTest("Multiple results from async function", function*(){
	var a = yield function(cb) {
		cb(null, 1, 2);
	};
	ok(a instanceof Array, "a instanceof Array");
	equal(a.length, 2, "length === 2")
	equal(a[0], 1);
	equal(a[1], 2); 
});

asyncTest("Multiple results from deferred", function*(){
	var a = yield $.Deferred(function(d) {
		d.resolve(1, 2);
	});
	ok(a instanceof Array, "a instanceof Array");
	equal(a.length, 2, "length === 2")
	equal(a[0], 1);
	equal(a[1], 2); 
});

asyncTest("Undefined variable use should result in ReferenceError in Deferred", function*() {
	try {
		yield $.Deferred(function(d) { d.reject(new Error()); });
		ok(false, "Exception not thrown");
	}
	catch(e) {
		ok(true, "Exception thrown");
		ok(e instanceof Error, "e instanceof Error");
		start();
	}
});

asyncTest("Parallel wait for errors should result in error array", function*() {
	try {
		Y.parallelErrorsDefault = Y.PARALLEL_ERRORS_WAIT;
		var op = (function*() { throw new Error(); })();
		yield [op, op];
		ok(false, "Exception not thrown");
	}
	catch(e) {
		ok(true, "Exception thrown");
		ok(e instanceof Error, "e instanceof Error");
		ok(e instanceof Y.AggregateError, "e instanceof AggregateError");
		equal(e.errors.length, 2, "length === 2");
		start();
	}
});

asyncTest("Parallel errors without wait should result in orphan callback being called and one error", function*() {
	var defs = [$.Deferred(), $.Deferred()];
	$.when(defs).then(function() {
		start();
	});
	try {
		Y.parallelErrorsDefault = Y.PARALLEL_ERRORS_THROW;
		Y.onOrphanCompletion = function() {
			ok(true, "orphanCompletion called");
			defs[0].resolve();
		}
		var op = (function*() { throw new Error(); })();
		yield [op, op];
		ok(false, "Exception not thrown");
	}
	catch(e) {
		ok(true, "Exception thrown");
		ok(e instanceof Error, "e instanceof Error");
		defs[1].resolve();
	}
});

asyncTest("Ðeferred promise chaining", function() {
	(function*() { return function(cb) { cb(null, "res"); } })
		.run()
		.then(function(res) {
			equal(res, "res");
			start();
		});
});

asyncTest("Waiting for returned by run", function*() {
	var captured;
	yield (function*(){ captured = "res"; }).run();
	equal(captured, "res");
});

asyncTest("Running generator function (non-invoked)", function*() {
  var res = yield function*() { return function(cb) { cb(null, "res"); } }
  equal(res, "res");
});

var SuccessErrorMock = function() {
	var cbErr, cbRet;
	return {
		error: function(cb) { cbErr = cb; },
		success: function(cb) { cbRet = cb; },
		resolve: function(ret) { cbRet(ret); },
		reject: function(e) { cbErr(e); }
	}
}

asyncTest("Yielding Success/error chainer, success", function*() {
	var mock = SuccessErrorMock();
	setTimeout(function() { mock.resolve("res"); }, 1);
	var a = yield mock;
	equal(a, "res");
});

asyncTest("Yielding Success/error chainer, error", function*() {
	var mock = SuccessErrorMock();
	setTimeout(function() { mock.reject(new Error()); }, 1);
	try {
		var a = yield mock;
		ok(false, "No exception thrown");
	}
	catch(e) {
		ok(e instanceof Error, "Error thrown");
	}
});

asyncTest("Yielding Success/error chainer, failure method", function*() {
	var mock = SuccessErrorMock();
	mock.failure = mock.error;
	delete mock.error;
	setTimeout(function() { mock.reject(new Error()); }, 1);
	try {
		var a = yield mock;
		ok(false, "No exception thrown");
	}
	catch(e) {
		ok(e instanceof Error, "Error thrown");
	}
});

asyncTest("Foreach lodash override", function*() {
	var arr = [1,2,3];
	yield (_(arr).each(function*(item, i) {
		equal(arr[i], item, "Item equal at " + i);
	}));
});

// Check error type
//asyncTest("Foreach lodash override", funct  ion*() {
//	var arr = [1,2,3];
//	yield _(arr).each(function*(item, i) {
//		equal(arr[i], item, "Item equal at " + i);
//	});
//});

// TODO: Test yielding on same thing for other things than generators
// TODO: Testing sync error for promise