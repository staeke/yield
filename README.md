## Preqrequisites.
- Install node js, minimum 0.11.2, i.e. experimental branch. NOTE: 0.10.x branch doesn't work yet.
- Remember to run with "node --harmony"  !


## Usage
``` javascript
(function*() {
	// Here we run our async program
}).run();
```

## Ways of doing async - "yieldable things"
You can "yield" all sort of stuff to make life easier, e.g.:

#### A normal async node function
``` javascript
function* sleep(timeout) {
	yield function(cb) { setTimeout(function() { cb(null); } , timeout); }
}
```

#### Another generator
``` javascript
function* sleep(timeout) {
	yield function(cb) { setTimeout(function() { cb(null); } , timeout); }
}

(function*() {
	yield sleep(1000);
}).run();
```

#### You can always write "return" instead of yield as the last statement
The above example then becomes

``` javascript
function* sleep(timeout) {
	return function(cb) { setTimeout(function() { cb(null); } , timeout); }
}

(function*() {
	return sleep(1000);
}).run();
```

#### A converted object or function
You can convert objects or functions by using the exported "gen" function. This assumes that all functions have the format

``` javascript
function(..., cb)
```

...where cb is a callback on the form callback(error, [resultArguments])

Some examples:

``` javascript
var y = require("yield");
var lib = require("somelib")
var genlib = y.gen(lib);
var genObj = y.gen(new lib.SomeClass());
var genFunc = y.gen(lib.someFunction);

(function*() {
	var x = yield genlib.someFunction(...);
	var y = yield genObj.someInstanceFunction(...);
	var z = yield genFunc(...);
}).run();
```

Note that when converting an object, "this scope" is preserved. It is not when you convert a single function. Also - conversions are shallow (just one level of functions) and return values are not converted. Thus - if you require a library which exports a class that you construct, by using 

``` javascript
var myClassInstance = new lib.MyClass();
```

...then you also have to convert the myClassInstance to use generators, by using

``` javascript
var genMyClassinstance = require("yield").gen(myClassInstance);
```

#### A jQuery Deferred (this specific code only runs in browsers)
``` javascript
(function*() {
	try {
		var newTodos = yield $.getJSON("/todos/new");
		alert(newTodos.length + " new todos found.");
	}
	catch(e) {
		console.error(e.stack);
	}
}
}).run();
```

#### An array of something that is yieldable according to above
This then gets executed in parallel. Example:

``` javascript
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
```

#### Yield on something multiple times (does memoization) to accomplish e.g. lazyness

``` javascript
// See fetchUrl in example above
var lazyTodos = fetchUrl("/todos");

function* getTodos() {
	// Will be fetched the first time getTodos is called, but only the first time
	return lazyTodos();
}
```

#### Start something without waiting directly for it

``` javascript
// See fetchUrl in example above


function* getTodos() {
	// By calling "run" on the iterator, we fire it off directly. Here we fetch both todos and emails
	var todos = fetchUrl("/todos").run();
	var email = fetchUrl("/todos").run();

	// Finally wait for todos and e-mails. If we hadn't called next above, these calls would "kick it all off"
	var todosResult = yield todosWithExtra;
	var emailsResult = yield emailsWithExtra;

	// Do something with todos here...
}

```

#### Using lo-dash (underscore) functional paradigms

``` javascript
// See fetchUrl in example above


function* getTodos() {
	// By calling "next" on the iterator, we fire it off directly. Here we fetch both todos and emails
	var todos = fetchUrl("/todos").run(); // Calling built-in ".next()" would work just fine too
	var email = fetchUrl("/todos").run(); // Calling built-in ".next()" would work just fine too

	// Set up a handler "in the future". This will be called once todos has arrived
	var todosWithExtra = _(todos).map(function*(todo) {
		var extra = yield fetchUrl("/todos/" + todo.id + "/extra")
		return _(todo).extend(extra);
	});

	// Set up a handler "in the future". This will be called once email has arrived
	var emailsWithExtra = _(todos).map(function*(email) {
		var extra = yield fetchUrl("/emails/" + todo.id + "/extra")
		return _(email).extend(extra);
	});

	// Finally wait for todos and e-mails. If we hadn't called run above, the yield calls below calls would "kick it all off"
	var todosResult = yield todosWithExtra;
	var emailsResult = yield emailsWithExtra;

	// Do something with todos here...
}

```

#### The yield generators work fine with promises such as Q.defer and jQuery.Deferred

By using promises based asynchornous flows, you are able to chain calls with multiple calls to .then() in e.g. Q or jQuery. You can mix this with calls to done/fail to create way to accomplish asynchronous data flows. Yield integrates with these by returning promises from the run method. Note that promises are only returned if you're running in node or requirejs (by using Q) or if you're running in a browser and jQuery exists. Yield does not require that Q or jQuery are installed and will work fine without them - only run will not return anything.

Read more about Q at https://github.com/kriskowal/q
Read more about jQuery deferreds at http://api.jquery.com/jQuery.Deferred/

``` javascript
// See fetchUrl in example above

(function* () {
	return fetchUrl("/todos");
}).run()
  .then(function(err, result) {
  	console.log("Here are the todos", result)
  });
```