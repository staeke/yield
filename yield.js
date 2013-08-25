if (typeof(module) === "undefined") { module = {}; }
if (typeof(window) === "undefined") { window = {}; }

window.y = (function() {

var jQueryDeferred = typeof(window.jQuery) != "undefined" && window.jQuery.Deferred;
if (typeof(require) === "function") {
	// Node or requirejs
	var _ = require("lodash");
	try { var Q = require("q"); } catch(e) {}
}
else {
	// Browser, verify dependencies
	if (typeof(window._) === "undefined") {
		console.error("lodash.js or underscore.js not found. Please include either script dependency on your page.");
	}
	else {
		var _ = window._;
	}
}

var exp;

module.exports = exp = {
	gen: makeGenerators,
	log: null,
	isGeneratorFunction: isGeneratorFunction,
	isGeneratorObject: isGeneratorObject,
	AggregateError: AggregateError,
	noConflict: typeof(y) !== "undefined" && y
};

function getDeferred() {
	// Handle both Q deferreds and jQuery deferreds
	if(Q && Q.defer) {
		var deferred = new Q.defer();
		return [deferred, deferred.promise];
	}
	else if(jQueryDeferred) {
		var deferred = new jQueryDeferred();
		return [deferred, deferred];
	}
	
	return undefined;
}

var emptyGenFunc = function*() { yield null; };
var GeneratorFunction = Object.getPrototypeOf(emptyGenFunc);
GeneratorFunction.run = function run(cb) {
	return this().run(cb);
};
var GeneratorObject = Object.getPrototypeOf(Object.getPrototypeOf(emptyGenFunc()));
GeneratorObject.run = function run(cb) {
	var deferred = getDeferred();
	runGeneratorAsAsync(this, function(err, result) {
		console.log("Generator returned", arguments);
		if (cb) { cb(err, result) };
		if (err) {
		 	if (deferred) deferred[0].reject(err);
		}
		else {
			if (deferred) deferred[0].resolve(result);
		}
	});
	return deferred && deferred[1];
};

// Needed in node 0.11.2
if (GeneratorObject.send) {
	var oldNext = GeneratorObject.next;
	GeneratorObject.next = function() {
		if (arguments.length > 0)
			return this.send.apply(this, arguments);
		return oldNext.apply(this, arguments);
	};
}

// Lo-dash/underscore extensions
if (_) {
	var _filter = _.filter;
	var _reject = _.reject;
	var _map = _.map;
	var _forEach = _.forEach;
	var _invoke = _.invoke;
	var _every = _.every;
	var _some = _.some;

	var genMap = function(collection, generatorCallback, thisArg) {
		if (!isGeneratorFunction(generatorCallback)) {
			return _map.apply(this, arguments);
		}
		// Wait for collection
		// For each item in collection
		return _map(collection, function(item) {
			return generatorCallback(item);
		});
	};

	_.mixin({
		"toGenerators": makeGenerators,
		"map": genMap
	});
}

var log = function() { exp.log && exp.log.apply(this, arguments); }

// TODO: Handle deep objects and possibly return values
function makeGenerators(objOrMethod, thisScope) {
	if (_.isFunction(objOrMethod)) {
		return function*() {
			var args = arguments;
			return function(cb) {
				args = _.toArray(args);
				args.push(cb);
				return objOrMethod.apply(thisScope, args);
			};
		};
	}
	else if (_.isObject(objOrMethod)) {
		var copy = _.clone(objOrMethod);
		_.each(_.functions(objOrMethod), function(fnName) {
			copy[fnName] = makeGenerators(objOrMethod[fnName], objOrMethod);
		});
		return copy;
	}

	throw new Error("Unsupported object [" + objOrMethod + "] for conversion to generator. Only functions and function members of objects of type Object are supported. Received");
}

function isGeneratorObject(obj) {
	return obj instanceof GeneratorFunction;
}

function isGeneratorFunction(obj) {
	return Object.getPrototypeOf(obj) === GeneratorFunction;
}

function isNodeStyleAsyncFunction(fn) {
	return _.isFunction(fn) && fn.length === 1;
}

function isDeferred(obj) {
	return obj && obj.then && obj.then instanceof Function;
}

function AggregateError(errors) {
	this.message = "Multiple errors captured in parallel run. See the errors property";
	this.errors = errors;
	this.stack = _(errors).pick("stack").join("\n\n");
}
AggregateError.prototype = Error.prototype;

function runParallel(args) {

	return function(cb) {
		var left = args.length;
		errors = [];
		results = [];
		for (var i = 0; i < args.length; i++) {
			// TODO: Don't allow same callback to be called twice
			var funnel = function(err, res) {
				if (err) {
					errors.push(err);
				}
				else {
					results.push(res);
				}
				left--;
				if (left === 0) {
					if (errors.length === 1) {
						cb(errors[0]);
					}
					if (errors.length > 0) {
						cb(new AggregateError(errors));
					}
					else {
						cb(null, results);
					}
				}
			};
			log("Running parallel item as async", args[i]);
			runItemAsAsync(args[i], funnel);
		}
	}
}

function runGeneratorAsAsync(genFunc, cb, genObj, err, result) {

	// TODO: Stop usinng bind, remove err/result parameter
	
	try {
		if (err) {
			log("Error found in return value", err);
			genObj = genFunc.throw.apply(genFunc, [err]);
		}
		else {
			// Start generator function
			log("starting generator ");
 			genObj = genFunc.next(result);
			log("generator first sync block completed");
	 	}
 	}
	catch(e) {
		log("Running callback error handler")
		cb(e);
		return;
	}
	
	if (!genObj.done) {
		var finishedCb = cb;
		cb = function(err, result) {
			runGeneratorAsAsync(genFunc, finishedCb, genObj, err, result);
		}
	}
	else if (!genObj.value) {
		// log("Exiting finished gen");
		return cb();
	}

	runItemAsAsync(genObj.value, cb);
}

function runItemAsAsync(item, cb) {
	if (isGeneratorObject(item)) {
		log("running generator");
		if (item.__returnArguments) {
			log("found generator finished with", item.__returnArguments);
			cb.apply(this, item.__returnArguments);
		}
		else if (item.__completions) {
			log("found generator has started, waiting");
			item.__completions.push(cb);
		}
		else {
			log("item not started, starting");
			item.__completions = [];
			runGeneratorAsAsync(item, function(err, result) {
				// log(new Error().stack)
				// log("finished running generator", [err, result])
				item.__returnArguments = arguments;
				cb.apply(this, arguments);
				_(item.__completions).each(function(f){ 
					log("Running subscriber");
					f.apply(this, item.__returnArguments); 
				})
			});
		}
	} 
	else if (isNodeStyleAsyncFunction(item)) {
		//log("Starting async function", item)
		item (function(err, result) {
			if (arguments.length > 2) {
				result = _.toArray(arguments).slice(1);
			}
			cb.apply(this, arguments);
		});
	}
	else if (isDeferred(item)) { //TODO: Rename Deferred to promise
		log("running deferred")
		item.then(function(result) {
			if (arguments.length > 1) {
				result = _.toArray(arguments);
			}
			cb(null, result);
		}, function(e) {
			cb(e);
		});
	}
	else if (_.isArray(item)) {
		runParallel(item)(cb);
	}
	// TODO: Support .success/.error style
	// TODO: Support GeneratorFunction
	else {
		var type = Object.prototype.toString.call(item);
		throw new Error("Value yielded or returned from generator that is not asynchronously runnable: " + type);
	}
}
return exp;
})();
