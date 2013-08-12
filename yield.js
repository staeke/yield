var _ = require("lodash");

var exp;
module.exports = exp = {
	gen: makeGenerators,
	log: null 
}

var log = function() { exp.log && exp.log.apply(this, arguments); }

// TODO: Handle deep objects and possibly return values
function makeGenerators(objOrMethod, thisScope) {
	if (_.isFunction(objOrMethod)) {
		return function* () {
			var args = arguments;
			return function(cb) {
				args = _.toArray(args);
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
	else {
		throw new Error("Unsupported type for conversion to generator. Only shallow objects and methods supported. Got", objOrMethod);
	}
}

var Generator = Object.getPrototypeOf(function*() {});
Generator.run = function(cb) {
	runGeneratorAsAsync(this(), cb || Function.prototype);
}
function isGenerator(obj) {
	return obj instanceof Generator;
}

function isNodeStyleAsyncFunction(fn) {
	return _.isFunction(fn) && fn.length === 1;
}

function isDeferred(obj) {
	return obj && obj.then && obj.then instanceof Function;
}

function* parallel() {
	return asyncParallel(arguments);
}

function asyncParallel(args) {

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

function runGeneratorAsAsync(gen, cb, it, err, results /*...*/) {

	try {
		if (it) {
			if (err) {
				//log("Error found in return value", err);
				gen.throw(err);
				return;
			}
			else {
				//log("send arguments", results);
				//log("arguments", arguments);
				it = gen.send.apply(gen, _.toArray(arguments).slice(4));
			}
		}
		else {
			//log("calling next");
	 		it = gen.next();
	 	}
	 	//log("next/send completed");
 	}
 	catch (e) {
 		gen.throw(e);
 		return;
 	}
	
	if (!it.done) {
		cb = _.bind(runGeneratorAsAsync, null, gen, cb, it)
	}
	else if (!it.value) {
		// log("Exiting finished gen");
		cb();
		return;
	}

	runItemAsAsync(it.value, cb);
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
		asyncParallel(item)(cb);
	}
	else {
		log(Object.prototype.toString.call(item));
		log(Object.getPrototypeOf(item));
		throw new Error("Unknown object yielded")
	}
}