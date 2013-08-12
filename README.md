## Preqrequisites.
- Install node js, minimum 0.11.2, i.e. experimental branch. NOTE: 0.10.x branch doesn't work yet.


## Usage
(function*() {
	// Here we run our async program
}).run();


## Ways of doing async - "yieldable things"
You can "yield" all sort of stuff to make life easier, e.g.:

### A normal async node function
function* sleep1second() {
	yield function(cb) { setTimeout(cb, 1000); } // Sleeps for one second
}

### Another generator
function* sleep(timeout) {
	yield function(cb) { setTimeout(cb, timeout); }
}

(function*() {
	yield sleep(1000);
}).run();

### You can always write "return" instead of the last example
The above example then becomes

function* sleep(timeout) {
	return function(cb) { setTimeout(cb, timeout); }
}

(function*() {
	return sleep(1000);
}).run();


### A jQuery Deferred
// Shared scope
var deferred = $.Deferred();

// Some other code
function onSomeEvent(res) {
	deferred.resolve(res)
}

// Our generator async program
(function*() {
	var res = yield deferred;
}).run();

### An array of something that is yieldable according to above
This then gets executed in parallel. Example:

// requires "npm install request-json"
var JsonClient = require('request-json').JsonClient;

function* fetchUrl(url) {
	return function(cb) {
		new JsonClient("http://localhost").get({ uri: url }, cb)
	};
}

// Our generator async program
(function*() {
	// This gets executed in parallel
	var todosAndEmails = yield [fetchUrl("/todos"), fetchUrl("/email")]
}).run();

### Yield on something multiple times (does memoization) to accomplish e.g. lazyness

// See fetchUrl in example above
var lazyTodos = fetchUrl("/todos");

function* getTodos() {
	// Will be fetched the first time getTodos is called, but only the first time
	return lazyTodos();
}