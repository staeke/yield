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
		noConflict: typeof(Y) !== "undefined" && Y,
		PARALLEL_ERRORS_THROW: 0,
		PARALLEL_ERRORS_WAIT: 1,
		parallelErrorsDefault: 0,
		onOrphanCompletion: onOrhpanCompletion,

		sleep: function* sleep(timeout) {
			return function(cb) {
				if (timeout <= 0) {
					cb(null, timeout);
					return;
				}
				setTimeout(function() {
					cb(null, timeout);
				}, timeout);
			}
		}
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
			if (err && !cb && !deferreds) {
				throw err;
			}
		});
		if (deferreds) {
			deferreds[1].fail(function(e) { console.error(e.stack || e); } )
			return deferreds[1];
		}
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
		var _each = _.each;
		var _invoke = _.invoke;
		var _every = _.every;
		var _some = _.some;

		var mapThenFuncOverride = function(origFunc) {
			return function(collection, generatorCallback, thisArg) {
				if (!isGeneratorFunction(generatorCallback)) {
					return origFunc(collection, generatorCallback, thisArg);
				}
				return function*() {
					var mapped = yield _map(collection, generatorCallback, thisArg);
					return origFunc(collection, function(val, index) {
						return mapped[index];
					}, thisArg);
				};
			}
		}

		var genFilter = mapThenFuncOverride(_filter);
		var genReject = mapThenFuncOverride(_reject);

		var genEach = function(collection, generatorCallback, thisArg) {
			if (!isGeneratorFunction(generatorCallback)) {
				return _each(collection, generatorCallback, thisArg);
			}
			return function*(){
				var index = -1,
						length = collection.length;

				while (++index < length) {
					if ((yield generatorCallback.call(thisArg, collection[index], index, collection)) === false) {
						break;
					}
				}
			};
		}

		_.mixin({
			"toGenerators": makeGenerators,
			"each": genEach,
			"forEach": genEach,
			"filter": genFilter,
			"select": genFilter,
			"reject": genReject
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
		return obj.then && obj.then instanceof Function;
	}

	function isSuccessFailureChainer(item) {
		return item.success && _.isFunction(item.success) &&
				((item.error && _.isFunction(item.error)) ||
				(item.failure && _.isFunction(item.failure)));
	};

	function onOrhpanCompletion(err, result) {
		if (err) {
			console.error("Orphan completion with error. If this is expected, consider changing the Y.parallelErrorsDefault to Y.PARALLEL_ERRORS_WAIT.", err.stack || err);
		}
	}

	function AggregateError(errors) {
		this.message = "Multiple errors captured in parallel run. See the errors property";
		this.errors = errors;
		this.stack = _(errors).pick("stack").join("\n\n");
	}
	AggregateError.prototype = Error.prototype;

	function runParallel(args, waitMode) {
		waitMode = waitMode || exp.parallelErrorsDefault;

		return function(cb) {
			if (args.length < 1) {
				cb(null);
				return;
			}
			var left = [];
			errors = [];
			results = [];
			left = _.range(args.length);
			var returned = false;
			_(args).each(function(arg, i) {
				log("Running parallel", i);
				var funnel = function(err, res) {
					log("Returned from parallel", i);
					if (returned) {
						exp.onOrphanCompletion && exp.onOrphanCompletion(err, res);
						return;
					}
					var index = left.indexOf(i);
					if (index < 0) {
						var e2 = new Error("Parallel async block returned twice. See the result and error properties.")
						e2.error = err;
						e2.result = res;
						errors.push(e2);
					}
					else {
						left.splice(index, 1);
						if (err) {
							errors.push(err);
						}
						else {
							results[i] = res;
						}
					}

					if (left.length === 0 || (errors.length > 0 && waitMode === exp.PARALLEL_ERRORS_THROW)) {
						log("Completing parallel", i);
						returned = true;
						if (errors.length === 1) {
							cb(errors[0]);
						}
						if (errors.length > 0) {
							cb(new AggregateError(errors));
						}
						else {
							cb(null, _.toArray(results).valueOf());
						}
					}
				}
				runItemAsAsync(arg, funnel);
			});
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
		else if (typeof genObj.value === "undefined") {
			return cb();
		}

		runItemAsAsync(genObj.value, cb, false, genObj.done);
	}

	function isAsyncRunnable(item, isVal) {
		var ok = isGeneratorFunction(item) ||
				isGeneratorObject(item) ||
				isNodeStyleAsyncFunction(item) ||
				isPromise(item) ||
				isSuccessFailureChainer(item);
		if (ok) { return true; }
		var val = item.valueOf();
		if (val !== item && !isVal) {
			return isAsyncRunnable(val, true);
		}
		return false;
	}

	function runItemAsAsync(item, cb, isVal, isValueOk) {

		if (typeof item !== "undefined" && item !== null) {
			if (isGeneratorFunction(item)) {
				log("Running generator function");
				runGeneratorAsAsync(item(), cb);
			}
			else if (isGeneratorObject(item)) {
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
			else if (_.isArray(item) && _every(item, isAsyncRunnable)) {
				log("Running parallel array");
				runParallel(item)(cb);
			}
			else if (isSuccessFailureChainer(item)) {
				(item.error || item.failure)(cb);
				item.success(function(result) { cb(null, result); })
			}
			else {
				var val = item.valueOf();
				if (val && val !== item && !isVal) {
					return runItemAsAsync(val, cb, true, isValueOk);
				}
				if (isValueOk) {
					cb(null, item);
					return;
				}
			}
			return;
		}

		if (isValueOk) {
			cb(null, item);
			return;
		}

		log("Unsupported yield type for object", item);
		var type = Object.prototype.toString.call(item);
		var e = new Error("Value yielded from generator that is not asynchronously runnable: " + type);
		cb(e);
		console.error(e.stack);
	}
	return exp;
})();
