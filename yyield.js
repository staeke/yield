// Some globals, depending if running in node or browser
if (typeof(module) === "undefined") { module = {}; }
if (typeof(window) === "undefined") { window = {}; }

// Wrap everything in closure
window.Y = (function() {

// Requires, handling both optional and needed in both node and browser
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

// Export object
var exp;
module.exports = exp = {
  /**
   * Use y.gen() on an object or a single function. When used on an object, the this scope will be preserved. Use the second
   * parameter to include your own thisScope if needed for the single function case.
   * @return {Object}
   * @param {Object|Function} objOrMethod
   * @param {Object} thisScope
   */
	gen: makeGenerators,
  /**
   * Set the log property to have debug information from y sent to a function of your liking. This function will be called
   * with a variable number of arguments (1-5) where the first argument is always a string.
   */
	log: null,
  /**
   * This utility function provides a means to query if an object is an ECMAScript 6 Generator function. Returns true/false.
   */
	isGeneratorFunction: isGeneratorFunction,
  /**
   * This utility function provides a means to query if an object is an ECMAScript 6 Generator object, as returned
   * by a GeneratorFunction. Returns true/false.
   */
	isGeneratorObject: isGeneratorObject,
  /**
   * When yielding multiple object, such as yield [gen1, gen2] and there are multiple errors generated, these will be contained
   * in this class. AggregateError supports the property errors which is an array containing the different error objects, and
   * an overriden stack property.
   */
	AggregateError: AggregateError,
  /**
   * To avoid conflicts, the noConflict export provides a way to reach what the window.Y variable pointed to before inclusion
   * of the y script in a browser situation.
   */
	noConflict: typeof(Y) !== "undefined" && Y
};
var log = function() { exp.log && exp.log.apply(this, arguments); }

function getPromise() {
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
	var deferreds = getPromise();
	runGeneratorAsAsync(this, function(err, result) {
		if (cb) { cb(err, result) };
		if (err) {
		 	if (deferreds) deferreds[0].reject(err);
		}
		else {
			if (deferreds) deferreds[0].resolve(result);
		}
	});
	deferreds[1].fail(function(e) { console.error(e.stack || e); } )
	return deferreds && deferreds[1];
};

// Compatibility fix - needed in node 0.11.2
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
			return _map(collection, generatorCallback, thisArg);
		}
		// Wait for collection
		// For each item in collection
		return _map(collection, function(item) {
			return generatorCallback(item);
		});
	};

	var genForEach = function(collection, generatorCallback, thisArg) {
		if (!isGeneratorFunction(generatorCallback)) {
			return _forEach(collection, generatorCallback, thisArg);
		}
		return (function*(){
			var index = -1,
					length = collection.length;

			while (++index < length) {
				if ((yield generatorCallback(collection[index], index, collection)) === false) {
					break;
				}
			}
		})();
	}

	_.mixin({
		"toGenerators": makeGenerators,
		"map": genMap,
		"forEach": genForEach,
		"each": genForEach
	});
}

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
	return obj.prototype && Object.getPrototypeOf(obj) === GeneratorFunction;
}

function isNodeStyleAsyncFunction(fn) {
	return _.isFunction(fn) && fn.length === 1;
}

function isPromise(obj) {
	return obj && obj.then && obj.then instanceof Function;
}

function isSuccessFailureChainer(item) {
	return item.success && _.isFunction(item.success) &&
			((item.error && _.isFunction(item.error)) ||
			(item.failure && _.isFunction(item.failure)));
};

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
			runItemAsAsync(args[i], funnel);
		}
	}
}

function runGeneratorAsAsync(genFunc, cb, genObj, err, result) {
	try {
		if (err) {
			genObj = genFunc.throw.apply(genFunc, [err]);
		}
		else {
 			genObj = genFunc.next(result);
	 	}
 	}
	catch(e) {
		return cb(e);
	}

	if (!genObj.done) {
		var finishedCb = cb;
		cb = function(err, result) {
			runGeneratorAsAsync(genFunc, finishedCb, genObj, err, result);
		}
	}
	else if (!genObj.value) {
		return cb();
	}

	runItemAsAsync(genObj.value, cb);
}

function runItemAsAsync(item, cb, isVal) {

	if (isGeneratorObject(item)) {
		if (item.__returnArguments) {
			log("Using cached return value of already completed generator", item.__returnArguments);
			cb.apply(this, item.__returnArguments);
		}
		else if (item.__completions) {
			log("Waiting for already started generator");
			item.__completions.push(cb);
		}
		else {
			log("Starting yielded generator");
			item.__completions = [];
			runGeneratorAsAsync(item, function(err, result) {
				item.__returnArguments = arguments;
				cb.apply(this, arguments);
				_(item.__completions).each(function(f) {
					log("Completing wait for generator with", item.__returnArguments);
					f.apply(this, item.__returnArguments);
				});
			});
		}
	}
	else if (isNodeStyleAsyncFunction(item)) {
    log("Running yielded node style async function");
		item (function(err, result) {
			if (arguments.length > 2) {
				result = _.toArray(arguments).slice(1);
			}
			cb(err, result);
		});
	}
	else if (isPromise(item)) {
    log("Running promise");
		item.then(function(result) {
			if (arguments.length > 1) {
				result = _.toArray(arguments);
			}
			cb(null, result);
		}, cb);
	}
	else if (_.isArray(item)) {
		log("Running parallel array");
		runParallel(item)(cb);
	}
	else if (isGeneratorFunction(item)) {
		log("Running generator function");
		runGeneratorAsAsync(item(), cb);
	}
	else if (isSuccessFailureChainer(item)) {
		(item.error || item.failure)(cb);
		item.success(function(result) { cb(null, result); })
	}
	else {
		var val = item.valueOf();
		if (val && val !== item && !isVal) {
			return runItemAsAsync(val, cb, true);
		}
		log("Unsupported yield type for object", item);
		var type = Object.prototype.toString.call(item);
		throw new Error("Value yielded or returned from generator that is not asynchronously runnable: " + type);
	}
}
return exp;
})();
