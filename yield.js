if (typeof(_) === "undefined") {
	_ = require("lodash");
}

var exp;
if (typeof(module) == "undefined") { module = {}; } 
module.exports = exp = {
	gen: makeGenerators,
	log: null,
	isGeneratorFunction: isGeneratorFunction,
	isGeneratorObject: isGeneratorObject
}



var GeneratorFunction = Object.getPrototypeOf(function*() {});
GeneratorFunction.run = function run(cb) {
	runItemAsAsync(this(), cb || Function.prototype);
	return this;
};
var GeneratorObject = Object.getPrototypeOf(Object.getPrototypeOf((function*(){})()));
GeneratorObject.run = function run(cb) {
	runItemAsAsync(this, cb || Function.prototype);
	return this;
};

// Needed in node 0.11.2
// var oldNext = GeneratorObject.next;
// GeneratorObject.next = function(arguments) {
// 	if (arguments.length > 0)
// 		return this.send.apply(this, arguments);
// 	return oldNext.apply(this, arguments);
// }


var _filter = _.filter;
var _reject = _.reject;
var _map = _.map;
var _forEach = _.forEach;
var _invoke = _.invoke;
var _every = _.every;
var _some = _.some;

function* ssleep(timeout) {
	return function(cb) {
		console.log("Sleeping for", timeout);
		setTimeout(function() {
			console.log("Finished sleeping for", timeout);
			cb(null, "timeout " + timeout + " completed");
		}, timeout);
	}
}


function genMap(collection, generatorCallback, thisArg) {
	if (!isGeneratorFunction(generatorCallback)) {
		return _map.apply(this, arguments);
	}
	// Wait for collection
	// For each item in collection
	return _map(collection, function(item) {
		return generatorCallback(item);
	});
}

_.mixin({
	"toGenerators": makeGenerators,
	"map": genMap
});

//var log = function() { exp.log && exp.log.apply(this, arguments); }
var log = function() { 
	if (arguments.length == 0) {
		console.log()
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
}

// TODO: Handle deep objects and possibly return values
function makeGenerators(objOrMethod, thisScope) {
	log("makeGenerators");
	if (_.isFunction(objOrMethod)) {
		log("Gen for function, returning generator")
		return function*() {
			var args = arguments;
			log("gen generator called with", args);
			return function(cb) {
				args = _.toArray(args);
				log("gen function called with", args);
				args.push(cb);
				return objOrMethod.apply(thisScope, args);
			}
		}
	}
	else if (_.isObject(objOrMethod)) {
		var copy = _.clone(objOrMethod);
		_.each(_.functions(objOrMethod), function(fnName) {
			copy[fnName] = makeGenerators(objOrMethod[fnName], objOrMethod)
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

function AggregateError() {

}

function runParallel(args) {

	log("Running in parallel", args);
	return function(cb) {
		var left = args.length;
		errors = [];
		results = [];
		for (var i = 0; i < args.length; i++) {
			// TODO: Don't allow same callback to be called twice
			var funnel = function(err, res) {
				log("Parallel call returned with", arguments);
				if (err) errors.push(err);
				results.push(res);
				left--;
				if (left === 0) {
					if (errors.length === 1) {
						cb(errors[0]);
					}
					if (errors.length > 0) {
						var error = new Error("Multiple errors captured in parallel run. See the errors property");
						error.errors = errors;
						error.stack = _(errors).pick("stack").join("\n\n");
						cb(error);
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

function runGeneratorAsAsync(genFunc, cb, genObj, err, results /*...*/) {

	// TODO: Stop usinng bind, unite next calls, remove err/results parameter
	
	if (!genFunc.id) {
		genFunc.id = _.uniqueId("gen");
		log("Running", genFunc.id, genFunc)
	}
	if (err) {
		log("Error found in return value", err);
		try {
			genObj = genFunc.throw.apply(genFunc, [err]);
		}
		catch(e) {
			log("Running callback error handler")
			cb(e);
			return;
		}
	}
	else {
		// Start generator function
		log("starting generator ");
		var args = results;
		if (arguments.length > 5) {
			args = _.toArray(arguments).slice(4)
		}
		try {	
 			genObj = genFunc.next(args);
			log("generator first sync block completed");
		}
		catch(e) {
			log("Running callback error handler 2")
			cb(e);
			return;
		}
 	}
	
	if (!genObj.done) {
		cb = _.bind(runGeneratorAsAsync, null, genFunc, cb, genObj)
	}
	else if (!genObj.value) {
		// log("Exiting finished gen");
		cb();
		return;
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
			// log("Return from  async function", arguments, "done", it.done)
			cb.apply(this, arguments);
		});
	}
	else if (isDeferred(item)) {
		log("running deferred")
		item.then(function(result) {
			var newArguments = Array.prototype.unshift.call(arguments, null);
			// log("newArguments", newArguments)
			cb.apply(this, arguments);
		}, function(e) {
			cb(e);
		});
	}
	else if (_.isArray(item)) {
		runParallel(item)(cb);
	}
	else {
		log(Object.prototype.toString.call(item));
		log(Object.getPrototypeOf(item));
		throw new Error("Unknown object yielded")
	}
}