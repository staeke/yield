if (typeof require !== "undefined") {
	var Y = require("../yyield");
	var $ = require("jquery-deferred");
	var _ = require("lodash");
}

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

asyncTest("map lodash override", function*() {
	var mapped = yield _([5,1,3]).map(function*(ms) {
		// To make it "difficult" we will make them not return in order
		return Y.sleep(ms);
	});
	deepEqual(mapped, [5,1,3], "Equal");
});

asyncTest("filter lodash override test with even numbers returning not in order", function*() {
	var arr = [0,3,2,1];
	var filtered = yield _(arr).filter(function*(ms){
		// Just making them return not in order
		var same = yield Y.sleep(ms);
		// Return even
		return same % 2 == 0;
	});
	deepEqual(filtered, [0,2], "Filtered only contains even ");
})

asyncTest("reject lodash override test with even numbers returning not in order", function*() {
	var arr = [0,3,2,1];
	var filtered = yield _(arr).filter(function*(ms){
		// Just making them return not in order
		var same = yield Y.sleep(ms);
		// Return even
		return same % 2 !== 0;
	});
	deepEqual(filtered, [3,1], "Rejected only contains odd");
})

asyncTest("lodash map with generators can return boolean false values", function*() {
	var arr = [false, false];
	var mapped = yield _(arr).map(function*(a) { return a; });
	deepEqual(mapped, [false,false], "Mapped only contains false");
});

asyncTest("thisArg works in lodash map", function*() {
	var arr = [1];
	var thisArg = { x: "test" }
	var res = yield _.map([arr], function*(i) {
		equal(this.x, "test");
	}, thisArg);
});

asyncTest("thisArg works in lodash filter", function*() {
	var arr = [1];
	var thisArg = { x: "test" }
	yield _.filter([arr], function*(i) {
		equal(this.x, "test");
	}, thisArg);
});

asyncTest("thisArg works in lodash filter", function*() {
	var arr = [1];
	var thisArg = { x: "test" }
	yield _.filter([arr], function*(i) {
		equal(this.x, "test");
	}, thisArg);
});

asyncTest("thisArg works in lodash each", function*() {
	var arr = [1];
	var thisArg = { x: "test" }
	yield _.each([arr], function*(i) {
		equal(this.x, "test");
	}, thisArg);
});

asyncTest("thisArg works in generator", function*() {
	var thisArg = {x:"test"};
	var gen = function*() {
		equal(this, thisArg);
	}
	yield gen.call(thisArg);
});

asyncTest("run apply generator", function*() {
	var thisArg = {x:"test"};
	var args = [1];
	var gen = function*() {
		deepEqual(_.toArray(arguments), args);
		equal(this, thisArg);
	}
	yield gen.apply(thisArg, args).run();
});

asyncTest("lodash bind works with generators", function*() {
	var gen = function*() {
		equal(this, "test");
	};
	yield _.bind(gen, "test");
});

asyncTest("lodash bindAll works with generators", function*() {
	var a = {
		gen: function*() {
			deepEqual(this, a, "'this' scope right");
		}
	}
	_.bindAll(a);
	var f = a.gen;
	yield f();
});

asyncTest("lodash bindAll works with named generators", function*() {
	var a = {
		genBound: function*() {
			deepEqual(this, a, "'this' scope right");
		},
		genNotBound: function*() {
			notDeepEqual(this, a, "'this' not object when not bound")
		}
	}
	_.bindAll(a, "genBound");
	var gb = a.genBound;
	yield gb();
	var gnb = a.genNotBound;
	yield gnb();
});