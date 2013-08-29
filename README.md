# Y-yield
Y-yield is a way to get back to the wonderful land of reliable exceptions and easy to follow asynchronous code using Javascript. Any caveats? Well, it requires the use of upcoming standard ECMAScript 6, so it's anything but mainstream at the moment. However, chances are that the standard is going to be approved during 2013 and then it will only be a matter of time before all browsers (ehm..) have implemented the feature. The new standard gives us syntactical goodies such as "function*" and "yield". But, you may ask yourself, what does it provide? Why yield?

#### The basic idea
ECMAScript 6 introduces something called generators. They look like this:
``` javascript
function* myGenerator() {
	yield "SomeValue";
	yield "SomeOtherValue";
}

var a = myGenerator();
var value = a.next(); // first line in myGenerator executes, returns "SomeValue"
var otherValue = a.next(); // second line in myGenerator executes, returns "SomeValue"
```
Ok...that looks pretty much like Python/Scala/C#/whatever. What does that bring in terms of asynchronous code? Well, the idea is that if we can write our code as a generator generating different asynchronous pieces of code, we can use the built-in wrapping/unwrapping of function bodies and try/catch statements to make our life easier. We could write something like

``` javascript
function* fetchUrl() {
    ...
}

function* getTodos(extra) {
	try {
        var todosTask = fetchUrl("/todos");
        var emailTask = fetchUrl("/todos");

        // Wait for the two parallel tasks to finish
        var todosAndEmail = yield [todosTask, emailTask];
        console.log("All fetched", todos, email);
	}
	catch (e) {
	    console.error("Oops...something went wrong", e);
	}
}
```
Note that the generators return objects that we have to "yield" to see the result for. If you get that, you get what it's about.


And to just make the "why yield" answer a little clearer:
* Ever used an async library and just get lost. Where did that call go? No reply, no error, no nothing. Rescue is under way.
* We can use try/catch again. You've read the posts about avoiding those pesky keywords in asynchronous code (i.e. all code) as you can't rely on them being called. But hey, remember that convenient idea of wrapping a bunch of calls in try/catch and handling a lot of different errors in a grouped way for a piece of code. Perhaps being able to send an error back or outputting to some log. Sure, there are solutions in old callback land such as [node domains](http://nodejs.org/api/domain.html), load balancing workers, and it may be a good idea to die rather than to do stupid things. But, being pragmatic, it's pretty nifty to be able to actually catch all errors within a block of code and decide for yourself.
* Ever felt a little bad about cluttering your objects, parameters and classes with callbacks here and there. Get ready for cleaner code.
* Ever written some asynchronous code and made a mistake in the error handler? Maybe you forgot to add one? Maybe your colleague did? Maybe you typed it incorrectly and now your application has just not returned from a call in quite some time. Console is just blank. :(
- There are all kind of libraries to make asynchronous coding easier. Among the most popular are [async](https://github.com/caolan/async) in node, [jQuery Deferred](http://api.jquery.com/category/deferred-object/) and [Q](https://github.com/kriskowal/q). But there are oh so many ways different libraries handle this. jQuery use its own deferreds and node uses the passing of a function with one callback function. [Sequalize](http://sequelizejs.com/), a MySQL ORM, uses a notion of chaining success and error callbacks. And still other libraries use an option parameter with a success/error callback. For anyone coding javascript, especially in node, it's evident that these conversions take time, are error prone and leave an uneasy feeling of possibly missing something. And even if we don't consider errors, it's often pretty darn hard to follow what's happening, especially if there's a bit of conditional asynchronous extra calls.
* Asyncronous stack traces? It is pretty saddening to just see that EventEmitter in your stack trace, right? With that said, there are node packages to make it easier such as [trycatch](https://github.com/CrabDude/trycatch).
* ECMAScript is in a way catching up with this. Async handling has been major recent lanaguage features in languages such as C#, F#, Scala,

So let's try it out!
If you want to look at more examples, please have a look at the [tests](https://github.com/staeke/yield/blob/master/tests/main.js).

## Prerequisites.
#### For node
1. Install node js, minimum 0.11.2, but preferred 0.11.4, i.e. experimental branch. NOTE: 0.10.x branch does NOT work yet.
2. Remember to run with "node --harmony"  !
3. In your scripts, use: var Y = require("yyield");

#### In Chrome
1. Install Chrome canary from https://www.google.com/intl/en/chrome/browser/canary.html
2. In Chrome canary, go to the address chrome://flags/. Find "Enable Experimental JavaScript" and click "Enable" for that feature. Restart Chrome.
3. First, include [underscore.js](https://github.com/jashkenas/underscore) or [lodash.js](https://github.com/lodash/lodash)
4. After that script include, include yyield. AMD is not implemented yet. Please use either
	*  ``` html
	<script src="yyield.js"></script>
```

	* ...or require("yyield") with [RequireJS](http://requirejs.org/) and r.js
5. Now Y-yield is accessible through window.Y. If something else was previuosly attached you can reach it at window.Y.noConflict

#### What about IE/Firefox/Opera/Safari/PhantomJS/etc?
I will add supprt and tests as those browsers support generators. At present, they don't


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
var Y = require("yield");
var lib = require("somelib")
var genlib = Y.gen(lib);
var genObj = Y.gen(new lib.SomeClass());
var genFunc = Y.gen(lib.someFunction);

(function*() {
	var a = yield genlib.someFunction(...);
	var b = yield genObj.someInstanceFunction(...);
	var c = yield genFunc(...);
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
#### The Y-yield generators work fine with promises such as Q.defer and jQuery.Deferred
By using promises based asynchornous flows, you are able to chain calls with multiple calls to .then() in e.g. Q or jQuery. You can mix this with calls to done/fail to create way to accomplish asynchronous data flows. 

Read more about Q at https://github.com/kriskowal/q
Read more about jQuery deferreds at http://api.jquery.com/jQuery.Deferred/

Here's an example using jQuery Deferred (namely the quite common return object form $.ajax/getJSON)
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

Y also integrates with these by returning promises from the run method. Note that promises are only returned if you're running in node or requirejs (by using Q) or if you're running in a browser and jQuery exists. Y-yield does not require that Q or jQuery are installed and will work fine without them - only run will not return anything. Here's an example where we use Y-yield to chain on a then function:
``` javascript
// See fetchUrl in example above

(function* () {
	return fetchUrl("/todos");
}).run()
  .then(function(err, result) {
  	console.log("Here are the todos", result)
  });
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
	var emails = fetchUrl("/emails").run();

	// Finally wait for todos and e-mails. If we hadn't called next above, these calls would "kick it all off"
	var todosResult = yield todos;
	var emailsResult = yield emails;

	// Do something with todos and emails here...
}

```

#### Using lo-dash (underscore) functional paradigms

Y-yield overrides a couple of underscore/lodash functions to make them generator aware so that you can use them with generators. Currently - the following functions are supported:

* each/forEach - runs sequentially [lodash docs](http://lodash.com/docs#forEach)/[underscore docs](http://lodash.com/docs#forEach)
* map - runs in parallel [lodash docs](http://lodash.com/docs#map)/[underscore docs](http://lodash.com/docs#map)
* filter/select - [lodash docs](http://lodash.com/docs#filter)/[underscore docs](http://lodash.com/docs#filter)
* reject - runs in parallel - [lodash docs](http://lodash.com/docs#reject)/[underscore docs](http://lodash.com/docs#filter)

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

