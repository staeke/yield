var _ = require("lodash");


var exp;
module.exports = exp = {
	gen: makeGenerators,
	log: null 
}

var log = function() { exp.log && exp.log.apply(this, arguments); }

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

function isGenerator(obj) {
	return obj instanceof GeneratorFunction;
}

function isNodeStyleAsyncFunction(fn) {
	return _.isFunction(fn) && fn.length === 1;
}

function isDeferred(obj) {
	return obj && obj.then && obj.then instanceof Function;
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
					if (errors.length > 0) {
						cb(errors); //TODO: new Error(errors)
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

	if (!genFunc.id) {
		genFunc.id = _.uniqueId("gen");
		log("Running", genFunc.id)
	}
	try {
		if (genObj) {
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
				//log("send arguments", results);
				log("send")
				genObj = genFunc.send.apply(genFunc, _.toArray(arguments).slice(4));
				log("send completed")
			}
		}
		else {
			// Start generator function
			log("starting generator ");
	 		genObj = genFunc.next();
			log("generator first sync block completed");
	 	}
	 	//log("next/send completed");
 	}
 	catch (e) {
 		log("Error received", e.stack);
 		log("Throwing back into", genFunc);
 		genFunc.throw(e);
 		return;
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
	if (isGenerator(item)) {
		log("running generator", item);
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