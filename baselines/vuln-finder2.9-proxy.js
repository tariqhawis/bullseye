const vm = require("vm");
const process = require("process");
const exec = require("child_process");
const path = require("path");
const requireCache = require.cache;
const fs = require("fs");
//const { fuzzGenerator } = require('./utils.js')
PROTORULES = path.join(__dirname, "pPollution.yaml");
var BAD_JSON = {};
var funcBuffer = [];
var parsedObject = [];
var protoList = [];
var victim = {};
var someObj = {};
let rootModule;
// using victim

const pattern = [
  {
    sig: [JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [JSON.parse('{"__proto__":{"pollutedKey":123}}'), someObj],
  },
  {
    sig: [someObj, JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [JSON.parse('{"__proto__":{"pollutedKey":123}}'), JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [someObj, someObj, JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [someObj, someObj, someObj, JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [someObj, "__proto__.pollutedKey", 123],
  },
  {
    sig: [someObj, "__proto__[pollutedKey]", 123],
  },
  {
    sig: ["__proto__.pollutedKey", 123],
  },
  {
    sig: ["__proto__[pollutedKey]", 123],
  },
  {
    sig: [someObj, "__proto__", "pollutedKey", 123],
  },
  {
    sig: ["__proto__", "pollutedKey", 123],
  },
  {
    sig: [someObj, JSON.parse('{"__proto__":{"pollutedKey":123}}'), someObj],
  },
  {
    sig: [someObj, JSON.parse('{"__proto__":{"pollutedKey":123}}'), true],
  },
  {
    sig: [true, someObj, JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [someObj, true, JSON.parse('{"__proto__":{"pollutedKey":123}}')],
  },
  {
    sig: [true, someObj, JSON.parse('{"constructor":{"prototype":{"pollutedKey":123}}}')],
  },
  {
    sig: [someObj, JSON.parse('{"constructor":{"prototype":{"pollutedKey":123}}}')],
  },
  {
    sig: [JSON.parse('{"constructor":{"prototype":{"pollutedKey":123}}}')],
  },
  {
    sig: ["[__proto__]\\npollutedKey=123"],
  },
  {
    sig: [someObj, "constructor.prototype.pollutedKey", "123"],
  },
  {
    sig: ["__proto__.pollutedKey", someObj, "123"],
  },
  {
    sig: ["this.constructor.prototype.pollutedKey", someObj, "123"],
  },
  {
    sig: ["__proto__.pollutedKey", "123", someObj],
  },
  {
    sig: [someObj, "/__proto__/pollutedKey", "123"],
  },
  {
    sig: [someObj, "/__proto__/pollutedKey", "123", true],
  },
  {
    sig: ["__proto__.pollutedKey=123"],
  },
  {
    sig: ["__proto__:pollutedKey", "123"],
  },
  {
    sig: ["__proto__[pollutedKey]=123", someObj],
  },
  {
    sig: [someObj, "constructor/prototype/pollutedKey", "123", "/"],
  },
  {
    sig: ["__proto__", { pollutedKey: "123" }, someObj, true],
  },
  {
    sig: [{ "__proto__.pollutedKey": "123" }],
  },
  {
    sig: [{ "constructor.prototype.pollutedKey": "123" }],
  },
  {
    sig: [someObj, [["__proto__"], "pollutedKey"], "123"],
  },
  {
    sig: [[["__proto__"], "pollutedKey"], "123", someObj],
  },
  {
    sig: [someObj, [["__proto__"], "pollutedKey"], "123", true],
  },
  {
    sig: [someObj, ["__proto__", "pollutedKey"], "123"],
  },
  {
    sig: [someObj, ["constructor.prototype.pollutedKey"], "123"],
  },
  {
    sig: [["__proto__"], "pollutedKey", "123"],
  },
  {
    sig: [["__proto__.pollutedKey"], ["123"]],
  },
  {
    sig: [someObj, [["__proto__"], ["__proto__"], "pollutedKey"], "123"],
  },
  {
    sig: [["-constructor.prototype.pollutedKey", "123"]],
  },
  {
    sig: ["./proto_file"],
  },
  {
    sig: ["./constructer_file"],
  },
  {
    sig: [someObj, "__proto__.pollutedKey"],
  },
  {
    sig: [JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}')],
  },
  {
    sig: [JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}'), someObj],
  },
  {
    sig: [someObj, JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}')],
  },
  {
    sig: [null, JSON.parse('{"__proto__": {"pollutedKey": 123}}')],
  },
  {
    sig: [someObj, 123, JSON.parse('{"__proto__": {"pollutedKey": 123}}')],
  },
  {
    sig: [someObj, undefined, JSON.parse('{"__proto__": {"pollutedKey": 123}}')],
  },
  {
    sig: [[[["__proto__"], "pollutedKey"]], true, someObj],
  },
  {
    sig: [null, [["__proto__"], "pollutedKey"], "123"],
  },
  {
    sig: [null, [["__proto__"], "pollutedKey"], "123", false],
  },
  {
    sig: [someObj, "constructor", "prototype", "pollutedKey", "123"],
  },
  {
    sig: [true, "__proto__.pollutedKey", "123", someObj],
  },
  {
    sig: ["__proto__[pollutedKey]", JSON.parse('{"__proto__": {"pollutedKey": 123}}'), 456],
  },
  {
    sig: [
      "constructor.prototype.pollutedKey",
      JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": "456"}}}}'),
      "123",
    ],
  },
  {
    sig: [someObj, null, JSON.parse('{"constructor": {"prototype": {"pollutedKey": 123}}}')],
  },
  {
    sig: [null, true, JSON.parse('{"__proto__": {"pollutedKey": 123}}'), 789],
  },
  {
    sig: [JSON.parse('{"constructor": {"prototype": {"pollutedKey": 123}}}'), "constructor", ["__proto__"], true],
  },
  {
    sig: [
      true,
      someObj,
      "__proto__.pollutedKey",
      JSON.parse('{"constructor": {"prototype": {"pollutedKey": 123}}}'),
      false,
    ],
  },
  {
    sig: ["123", [["__proto__"], "pollutedKey"], JSON.parse('{"__proto__": {"pollutedKey": 123}}')],
  },
  {
    sig: [someObj, "__proto__"],
  },
  {
    sig: [JSON.parse('{"__proto__": {"pollutedKey": 123}}'), null, "pollutedKey"],
  },
  {
    sig: [JSON.parse('{"__proto__": {"pollutedKey": 123}}'), true, "__proto__.pollutedKey", someObj],
  },
];
//console.log('pkg: ' + process.argv[2]);
//exec.execSync('ls -la ', { stdio: 'inherit', encoding: 'utf-8' });

//const verbose = process.argv[4] == 'verbose' ? true : false;
let pkg = {};
if (process.argv[2]) {
  pkg = JSON.parse(process.argv[2]);
} else {
  pkg = {
    package_name: "object-path-set",
    version: "1.0.0",
    pkgPath: "/data/benchmark/benchmark-ss/object_path_set_lib",
    options: {
      verbose: true,
      sandbox: false,
    },
  };
}
const pkgName = pkg.package_name;
const depth = 5; // recursive exploration depth
const quiet = !pkg.options.verbose;
const sandbox = pkg.options.sandbox;

const originalDir = process.cwd();
const originalNodePath = process.env.NODE_PATH || "";

(async () => {
  let loc = 0;
  if (fs.existsSync("./cloc.txt")) loc = JSON.parse(fs.readFileSync("./cloc.txt", { encoding: "utf8" })).SUM["code"];
  //console.log(`pkgName: ${pkgName}`)
  //return loadWithFilePaths(pkgName);
  process.chdir(pkg.pkgPath);
  process.env.NODE_PATH = path.resolve(pkg.pkgPath, "node_modules") + path.delimiter + originalNodePath;
  require("module").Module._initPaths(); // Reinitialize module paths
  return [await importModule2(pkgName), loc];
  //return [require(pkgName), loc];
})()
  .then((lib) => {
    //console.log(`lib: ${JSON.stringify(lib)}`)
    rootModule = lib[0];
    //const testFiles = findTestFiles(pkgName, repo, argv[3])
    mainAnalysis(lib[0], pkgName, depth);
    //remove duplicates
    funcExploredNo =
      funcBuffer.length > 0
        ? funcBuffer.filter((obj, index, self) => index === self.findIndex((o) => o === obj)).length
        : 0;
    protoList.unshift(funcExploredNo);
    //protoList.unshift(funcBuffer.join(','))
    //protoList.unshift(testFiles.join(','))
    protoList.unshift(lib[1]);
    if (protoList.length > 0) {
      if (!quiet && !sandbox) console.log(JSON.stringify(protoList, null, 2));
      else console.log(`<JSON-OUTPUT>${JSON.stringify(protoList)}</JSON-OUTPUT>`);
    }
  })
  .catch((e) => {
    if (protoList.length > 0) {
      if (!quiet) console.log(JSON.stringify(protoList, null, 2));
      if (!sandbox) console.log(`<JSON-OUTPUT>${JSON.stringify(protoList)}</JSON-OUTPUT>`);
    }
  })
  .finally(() => {
    //fs.rmSync(path.join(__dirname, "tmp", `tempFunc_${process.pid}`), { recursive: true, force: true });
    process.exit(0);
  });

function mainAnalysis(lib, prefix, depth) {
  if (!quiet && !sandbox) console.log(`[+] Scanning ${prefix}...`);

  // If depth limit reached or object already explored, return
  if (depth == 0) return;
  if (parsedObject.indexOf(lib) !== -1) return;

  // Mark the object as explored
  parsedObject.push(lib);

  // Iterate over properties of the object
  for (const fnName of Object.keys(lib)) {
    //for (let fnName in lib) {
    if (
      fnName == "abort" ||
      fnName == "__proto__" ||
      +fnName == fnName ||
      fnName == "Skipped-Function" ||
      typeof lib[fnName] === "string"
    )
      continue;

    // Handle the property as a function or object
    if (Reflect.has(lib, fnName) && typeof lib[fnName] === "function") {
      //}
      mainAnalysis(lib[fnName], prefix + "." + fnName, depth - 1);
    }
    //}
  }
  // Handle the case when `lib` is a function
  try {
    if (typeof lib === "function") {
      // Check if the function is a class, in this case, scan each method.
      if (isClass(lib)) {
        console.log(` [-] Class ${lib.name}...`);
        let fuzzResult = {},
          modulePath,
          functionOffset;
        for (let method of Reflect.ownKeys(lib)) {
          if (typeof lib[method] === "function") {
            console.log(` [-] Method ${lib[method].name}...`);
            if (rootModule.name === lib[method].name && lib[method].default) fuzzResult.func = `${prefix}.default`;
            else fuzzResult.func = `${prefix}.${method}`;
            funcBuffer.push(fuzzResult.func);
            console.log(` [-] Scanning Class method ${fuzzResult.func}`);
            // Check for prototype pollution in the function
            for (const rule of pattern) {
              //console.log(pattern.indexOf(rule));
              fuzzResult.output = proxyFuzzy(lib[method], rule.sig);
              if (fuzzResult.output && fuzzResult.output[0]) {
                fuzzResult.pId = pattern.indexOf(rule);
                //modulePath = findFunctionPath(lib);
                //functionOffset = getFunctionOffset(lib[method], modulePath);
                if (!quiet)
                  console.log("Detected: ", `${fuzzResult.func}(${rule.sig[0]})`, "Payload Id: ", fuzzResult.pId);
                //var sinkInfo = sinkLineFinder(lib.name, lib, functionOffset);
                const detection = {
                  entryPoint: `${prefix}.${lib.name}.${method}`,
                  inputCase: rule.sig,
                  input_id: fuzzResult.pId,
                  sinkLocation: fuzzResult.output[1],
                };
                protoList.push(detection);
                console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                break;
              }
            }
            /*                         var inferResult = dynFuzzy(lib[method]);
                                                var tag = ((fuzzResult.input && inferResult) == null && (fuzzResult.input || inferResult) !== null) ?
                                                    (fuzzResult.input || inferResult) !== null ? 'fix' || 'infer'
                                                        : (fuzzResult.input && inferResult) !== null ? 'both'
                                                            : null : null; */
          }
        }
      } else {
        let fuzzResult = {},
          modulePath = null,
          functionOffset;
        funcBuffer.push(prefix);
        console.log(` [-] ${lib.name}...`);
        for (const rule of pattern) {
          //if (lib.name[0] === lib.name[0].toUpperCase())
          //fuzzResult.input = classFuzzy(rule.fnct, pkgName, lib);
          //console.log(pattern.indexOf(rule));
          fuzzResult.output = proxyFuzzy(lib, rule.sig);
          if (fuzzResult.output && fuzzResult.output[0]) {
            fuzzResult.pId = pattern.indexOf(rule);
            //modulePath = findFunctionPath(lib);
            //functionOffset = getFunctionOffset(lib, modulePath);
            if (!quiet) console.log("Detected: ", `${prefix}(${rule.sig[0]})`, "Payload Id: ", fuzzResult.pId);
            //var sinkInfo = sinkLineFinder(pkgName, lib, functionOffset);
            const detection = {
              entryPoint: prefix,
              inputCase: rule.sig,
              input_id: fuzzResult.pId,
              sinkLocation: fuzzResult.output[1],
            };
            protoList.push(detection);
            console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
            break;
          }
        }
        /*                 var inferResult = dynFuzzy(lib);
                                var tag = ((fuzzResult.input && inferResult) == null && (fuzzResult.input || inferResult) !== null) ?
                                    (fuzzResult.input || inferResult) !== null ? 'fix' || 'infer'
                                        : (fuzzResult.input && inferResult) !== null ? 'both'
                                            : null : null; */
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function isClass(classObj) {
  try {
    if (
      Reflect.getOwnPropertyDescriptor(classObj, "get") &&
      Reflect.getOwnPropertyDescriptor(classObj, "set") &&
      Reflect.getOwnPropertyDescriptor(classObj, "has") &&
      typeof Reflect.getOwnPropertyDescriptor(classObj, "get").value === "function" &&
      typeof Reflect.getOwnPropertyDescriptor(classObj, "set").value === "function" &&
      typeof Reflect.getOwnPropertyDescriptor(classObj, "has").value === "function"
    )
      return true;
  } catch (e) {
    //console.log(e)
  }
}

function proxyFuzzy(fn, inputCase) {
  const trackedProperty = "pollutedKey";
  var protoMonitor = { setProto: null, setProp: null };
  (someObj = {}), (victim = {});
  // Attempt #1: Fixed Fuzzy - Arteau's work
  try {
    // Function to set up a proxy on Object.prototype to detect prototype changes

    // Setup the proxy for Object.prototype before running functions
    //const sink = setupProxyForPrototype();
    //if (sink) console.log(sink)
    // First round: check property addition
    /*         let sinkLoc;
                setupProxyForPrototype((sink) => {
                    sinkLoc = sink
                }); */
    Object.setPrototypeOf(
      someObj,
      new Proxy(Object.prototype, {
        // get(obj, prop, receiver) {
        //   if (prop === "__proto__") {
        //     //throw new Error(`Access to property ${trackedProperty} detected`);
        //     //throw new Error('accessed');
        //     const error1 = new Error();
        //     const stackLines1 = error1.stack.split("\n");
        //     //protoMonitor.protoType = true;
        //     protoMonitor.setProto = stackLines1[2].trim();
        //    }  else if (prop === trackedProperty) {
        //             //throw new Error(`Access to property ${trackedProperty} detected`);
        //             //throw new Error('accessed');
        //             const error2 = new Error();
        //             const stackLines2 = error2.stack.split("\n");
        //             //protoMonitor.protoType = true;
        //             protoMonitor.setProp = stackLines2[2].trim();
        //         }
        //   return Reflect.get(obj, prop, receiver);
        // },
        set(obj, prop, value, receiver) {
          if (prop === "__proto__") {
            //throw new Error(`Access to property ${trackedProperty} detected`);
            //throw new Error('accessed');
            const error1 = new Error();
            const stackLines1 = error1.stack.split("\n");
            //protoMonitor.protoType = true;
            protoMonitor.setProto = stackLines1[2].trim();
          } else if (prop === trackedProperty) {
            //throw new Error(`Modification of property ${trackedProperty} detected`);
            //throw newError('modify');
            //protoMonitor.pollutedProp = true;
            const error2 = new Error();
            const stackLines2 = error2.stack.split("\n");
            protoMonitor.setProp = stackLines2[2].trim();
          }
          return Reflect.set(obj, prop, value, receiver);
        },
        // has(obj, prop) {
        //   if (prop === trackedProperty) {
        //     //throw new Error(`Access to property ${trackedProperty} detected`);
        //     //throw new Error('accessed');
        //   }
        //   return Reflect.has(obj, prop);
        // },
      })
    );
    // Create a proxy to wrap the target function
    const proxyFunction = new Proxy(fn, {
      apply: function (target, thisArg, argumentsList) {
        //console.log('Intercepted function call');
        return Reflect.apply(target, someObj, argumentsList);
        //return target.call(someObj, argumentsList[0])
      },
    });
    //const trappedFunction = withPropertyTrap(fn);
    if (!quiet)
      //Reflect.apply(null, trappedFunction);
      proxyFunction(...inputCase);
    else vmRun(proxyFunction, fn, inputCase);
    /*         if (protoMonitor.setProp) {
                    return protoMonitor;
                } */
    if (protoMonitor.setProp || protoMonitor.setProto) {
      return [true, protoMonitor];
    }
    if (pollutionFinder(victim, trackedProperty, true)) {
      //Reflect.deleteProperty(Object.prototype, trackedProperty)
      return [true, protoMonitor];
    }
    //verify()

    // Second round: check property Deletion
    /*         victim = {}
                vmRun(inputCase, trappedFunction, 'del');
                if (protoMonitor.setProp) {
                    return protoMonitor;
                }
                else
                    Reflect.deleteProperty(Object.prototype, 'pollutedKey') */
  } catch (e) {
    //console.log(`logs/run_jbx_${pkgLogName}-${process.pid}.log: `, e)
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-fixFuzzy-${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

function fixFuzzy2(inputCase, fn) {
  // Attempt #1: Fixed Fuzzy - Arteau's work
  victim = {};
  try {
    // First round: check property addition
    if (!quiet) {
      inputCase.call(null, fn);
      //const trace = new Error();
      //console.log(trace.stack);
    } else vmRun(inputCase, fn);
    //const result = inputCase.call(null, fn);
    if (
      pollutionFinder(victim, "pollutedKey") ||
      pollutionFinder(victim, "pollutedKey1") ||
      pollutionFinder(victim, "pollutedKey2")
    ) {
      Reflect.deleteProperty(Object.prototype, "pollutedKey");
      Reflect.deleteProperty(Object.prototype, "pollutedKey1");
      Reflect.deleteProperty(Object.prototype, "pollutedKey2");
      return true;
    }
    // Second round: check property Deletion
    victim = {};
    if (!quiet) {
      victim.__proto__.pollutedKey = "PP";
      inputCase.call(null, fn);
    } else vmRun(inputCase, fn, "del");
    if (!Reflect.has(victim, "pollutedKey")) {
      return true;
    } else Reflect.deleteProperty(Object.prototype, "pollutedKey");
  } catch (e) {
    //console.log(`logs/run_jbx_${pkgLogName}-${process.pid}.log: `, e.message)
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-fixFuzzy-${process.pid}.log`, e.message, { encoding: "utf8" });
  }
}

function vmRun(proxyFunction, fn, inputCase, action = "add", timeout = 100) {
  // Create a sandbox context for executing the function
  const sandbox = {
    fn, // the function to test
    inputCase, // the input cases
    proxyFunction,
  };
  let context, code, script;
  try {
    // Create a new VM context
    context = vm.createContext(sandbox);
    if (action === "del") context.__proto__.pollutedKey = "PP";

    // Function to execute the test function in the sandbox
    //code = `const result = inputCase.call(null, fn);`
    code = ` proxyFunction(...inputCase); `;
    //const code = `const result = Reflect.apply(fn, null, inputCase);`;

    // Create and run the script with a timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout: timeout }); // This enforces the timeout
    /*         if (victim.pollutedKey && action !== 'del')
                    return victim.pollutedKey; */
    // The result is handled within the sandbox context
  } catch (e) {
    // Handle timeout or any other error
    //console.log('error while running code in a vm context: ', e)
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-vmRun${process.pid}.log`, e.message, { encoding: "utf8" });
  }
}
/**
 * Function to run a provided function in a VM context with given inputs.
 * @param {Function} inputCase - Function that takes the tested function as argument and returns a result.
 * @param {Function} fn - The function to test.
 * @param {number} [timeout=1000] - Timeout value for script execution in milliseconds.
 * @returns {Object} - Returns an object containing `result` or `error` message.
 */
function vmRun2(inputCase, fn, timeout = 100) {
  // Create a sandboxed context with limited access to global objects
  let sandbox = {
    fn, // the function to test
    inputCase, // the input case to run against
    result: null, // Store the result of the test function
    error: null, // Store any error encountered during execution
  };
  let context, code, script;
  try {
    // Create a new context for isolated execution
    context = vm.createContext(sandbox);

    // Code to be run within the VM context
    code = `result = inputCase.call(null, fn);`;

    // Create and run the script with a specified timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout });
  } catch (err) {
    // Capture any runtime error or timeout exceptions
    sandbox.error = err.message;
  }

  // Return the sandbox result or error message
  return {
    result: sandbox.result,
    error: sandbox.error,
  };
}

/**
 * Searches for a property in the prototype chain of an object.
 * @param {Object} obj - The object to start searching from.
 * @param {string} property - The name of the property to search for.
 * @returns {boolean} - Returns true if the property is found, otherwise false.
 */
function pollutionFinder(obj, property, del = false) {
  // Base case: If the object is null, the property does not exist in the chain
  try {
    if (obj === null) return false;

    // Check if the property is directly on the current object
    if (obj.hasOwnProperty(property)) {
      if (del) Reflect.deleteProperty(obj, property);
      return true;
    }

    // Check if the property is nested within any of the object's own properties
    for (let key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === "object" && obj[key] !== null) {
        // Recursively search within nested objects
        if (pollutionFinder(obj[key], property, true)) {
          return true;
        }
      }
    }

    // If not found, recursively search the prototype chain
    return pollutionFinder(Object.getPrototypeOf(obj), property, true);
  } catch (error) {}
}

function pollutionFinder1(obj, property, depth = 5) {
  // Base case: If the object is null, the property does not exist in the chain
  try {
    if (obj === null && depth === 0) return;

    // Check if the property is nested within any of the object's own properties
    for (let key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === "object" && obj[key] !== null) {
          // Recursively search within nested objects
          pollutionFinder(obj[key], property, depth - 1);
        }
        // Check if the property is directly on the current object
        else if (Reflect.has(obj, property)) {
          return true;
        }
      }
    }

    // If not found, recursively search the prototype chain
    return pollutionFinder(Object.getPrototypeOf(obj), property);
  } catch (error) {}
}

/**
 * Function to dynamically load an NPM package and find the original file path for a target function.
 * @param {string} packageName - The name of the NPM package to search.
 * @param {Function} targetFunction - The target function whose file path we want to identify.
 * @returns {string|null} - The file path containing the original target function, or null if not found.
 */
function findFunctionPath(rootModule, targetFunction = rootModule) {
  try {
    // Import the package using its name
    //const rootModule = require(packageName);

    // Resolve the entry file path of the package (e.g., index.js)
    const rootModulePath = require.resolve(pkgName);

    // Traverse the module's exports hierarchy to find the target function's origin
    const filePath = traverseModule(rootModule, targetFunction, rootModulePath, new Set());

    return filePath.replace("/sandbox/df/", ""); // Return the file path if found
  } catch (error) {
    //console.error(`Error loading package ${pkgName}:`, error);
    return null;
  }
}

/**
 * Traverses a module and its nested exports to find the original file path for a given function.
 * @param {Object} moduleExports - The exports of the root module.
 * @param {Function} targetFunction - The function to search for.
 * @param {string} currentPath - The current module file path being traversed.
 * @param {Set} visited - A set to track visited exports and prevent cyclic references.
 * @returns {string|null} - The file path containing the original function, or null if not found.
 */
function traverseModule(moduleExports, targetFunction, currentPath, visited) {
  // If moduleExports itself is the target function, return the current path
  try {
    if (moduleExports === targetFunction) {
      return currentPath;
    }

    // Check if the moduleExports has been visited to prevent infinite loops
    if (visited.has(moduleExports)) {
      return null; // Avoid traversing the same export again
    }

    // Mark the current export as visited
    visited.add(moduleExports);

    // If moduleExports is an object, traverse through its properties

    if (typeof moduleExports === "object" && moduleExports !== null) {
      for (const key in moduleExports) {
        if (moduleExports.hasOwnProperty(key)) {
          const nextExport = moduleExports[key];

          // Check if the nested export is a function and matches the target
          if (nextExport === targetFunction) {
            // Check if the function is a re-export from another module
            const originalPath = traceFunctionOrigin(nextExport, currentPath);
            if (originalPath) {
              return originalPath; // Return the original path if found
            }
            return currentPath; // Return the current path if no deeper trace is needed
          }

          // If the nested export is another module or object, resolve its path and continue searching
          const nextPath = getModuleFilePath(nextExport, currentPath);

          // Recursively traverse the next module export to find the original target function
          const result = traverseModule(nextExport, targetFunction, nextPath, visited);
          if (result) return result; // Return the path if found
        }
      }
    }
  } catch (error) {}
}

/**
 * Helper function to trace the origin of a function if it is re-exported from another module.
 * @param {Function} targetFunction - The function to trace back.
 * @param {string} currentPath - The current file path of the module exporting the function.
 * @returns {string|null} - The file path of the original module defining the function, or null if not found.
 */
function traceFunctionOrigin(targetFunction, currentPath) {
  // Check if the function is in the require cache
  try {
    for (const moduleId in requireCache) {
      if (requireCache[moduleId].exports === targetFunction) {
        return requireCache[moduleId].filename; // Return the file path of the original module
      }
    }
  } catch (error) {}
}

/**
 * Helper function to get the file path of a nested module export.
 * @param {Object|Function} nestedExport - The nested export module or function.
 * @param {string} parentPath - The parent module's file path.
 * @returns {string} - The resolved file path of the nested module or the parent path.
 */
function getModuleFilePath(nestedExport, parentPath) {
  // Check if the nested export is in the require cache
  try {
    for (const moduleId in requireCache) {
      if (requireCache[moduleId].exports === nestedExport) {
        return requireCache[moduleId].filename; // Return the cached file path
      }
    }
    // If not found in cache, return the parent path as the fallback
    return parentPath;
  } catch (error) {}
}

async function importModule(moduleName) {
  try {
    return await import(moduleName);
  } catch (e) {
    if (!quiet) console.log("Trying files import..");
    try {
      // Get the path to the module's directory
      const modulePath = require.resolve(moduleName);
      const index = path.basename(modulePath);
      const moduleDir = path.dirname(modulePath);

      // Read the directory to get the list of method files
      const methodFiles = fs.readdirSync(moduleDir);

      // Import each method file individually
      let importedModule = {};
      for (const file of methodFiles) {
        if (file.endsWith(".js") && file !== index) {
          const methodName = path.basename(file, ".js");
          const methodFilePath = path.join(moduleDir, file);
          importedModule[methodName] = require(methodFilePath);
        }
      }
      if (Object.keys(importedModule).length == 0) {
        importedModule = await import(moduleName);
      }
      return importedModule;
    } catch (e) {
      if (!quiet) console.log("Error importing module: ", e.message);
      //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-${process.pid}.log`, e.message, { encoding: "utf8" });
    }
  }
}

function sinkLineFinder(funcName, funcCode, offset) {
  let funcPath,
    semgrepResult,
    jsonResult,
    usefulInfo = [{ vulnVar: null, line: null }];
  //var outputFile = `tempOutput-${process.pid}-${random}.json`;
  try {
    funcPath = path.join(__dirname, "tmp", `tempFunc-${process.pid}`);
    fs.mkdirSync(funcPath, { recursive: true });
    fs.writeFileSync(path.join(funcPath, `${funcName.replace("/", "-")}.js`), funcCode.toString());
    semgrepResult = exec.spawnSync(
      "semgrep",
      [`--config=${PROTORULES}`, funcPath, "--json", "-q", "--jobs=10", "--error"],
      { stdio: "pipe", encoding: "utf-8" }
    );

    jsonResult = semgrepResult.stdout != "" ? JSON.parse(semgrepResult.stdout) : null;
    //fs.rmSync(funcPath, { recursive: true, force: true }); // removes thr symlink from the filesystem unlinkSync(path)
    if (jsonResult !== null && jsonResult.results.length > 0) {
      usefulInfo = jsonResult.results.map((el) => {
        return {
          var: el.extra.metavars["$KEY"].abstract_content,
          line: el.extra.metavars["$KEY"].end.line + offset,
        };
      });
    }
    return usefulInfo;
  } catch (error) {
    if (!quiet) console.error("Error running Semgrep:", error.message);
  } finally {
    // Clean up the temporary rule file
    if (fs.existsSync(funcPath)) {
      fs.rmdirSync(funcPath, { recursive: true });
    }
  }
}

/**
 * Locates the offset of a given function in a JavaScript file using Semgrep.
 * @param {Function} funcCode - The function code to locate.
 * @param {string} filePath - The path to the JavaScript file to analyze.
 * @returns {object|null} - The offset location of the function in the file (start and end positions), or null if not found.
 */
function getFunctionOffset(funcCode, filePath) {
  let semgrepOutput, results, tempRuleFile;
  try {
    // Step 1: Extract the function header from the provided function code
    const functionHeader = funcCode.toString().match(/^(.*?)\s*[{]?\s*$/m)[1];
    if (!functionHeader) {
      //console.error("Failed to extract function header from the provided code.");
      return null;
    }

    // console.log(`Extracted function header: ${functionHeader}`);

    // Step 2: Generate a Semgrep rule for the extracted function header
    const semgrepRule = `
    rules:
        - id: "function-location"
          pattern: "${functionHeader}{...}"
          languages: [javascript]
          message: "Matched function header"
          severity: INFO
          metadata:
            category: "function-offset-locator"
        `;

    // Step 3: Run Semgrep on the specified JavaScript file
    // Write the Semgrep rule to a temporary YAML file
    tempRuleFile = path.join(__dirname, "temp-rule.yaml");
    fs.writeFileSync(tempRuleFile, semgrepRule, "utf8");
  } catch (error) {}
  // Run Semgrep with the generated rule on the target file
  try {
    semgrepOutput = exec.spawnSync(
      "semgrep",
      [`--config=${tempRuleFile}`, filePath, "--json", "-q", "--jobs=10", "--error"],
      { stdio: "pipe", encoding: "utf-8" }
    );
    results = semgrepOutput.stdout != "" ? JSON.parse(semgrepOutput.stdout) : null;
    // Extract the location information from the Semgrep output
    if (results && results.results && results.results.length > 0) {
      return results.results[0].start["line"] - 1;
    }
    // Step 4: Return the location of the matched function
    //return location.start['line'];
  } catch (error) {
    //console.error("Error running Semgrep:", error.message);
  } finally {
    // Clean up the temporary rule file
    if (fs.existsSync(tempRuleFile)) {
      fs.unlinkSync(tempRuleFile);
    }
  }
}

async function importModule2(moduleName) {
  try {
    return require(moduleName);
  } catch (e) {
    console.log("Trying dynamic import..");
    try {
      return await import(moduleName);
    } catch (e) {
      console.log("Trying files import..");
      try {
        // Get the path to the module's directory
        const modulePath = require.resolve(moduleName);
        const index = path.basename(modulePath);
        const moduleDir = path.dirname(modulePath);

        // Read the directory to get the list of method files
        const methodFiles = fs.readdirSync(moduleDir);

        // Import each method file individually
        let importedModule = {};
        for (const file of methodFiles) {
          if (file.endsWith(".js") && file !== index) {
            const methodName = path.basename(file, ".js");
            const methodFilePath = path.join(moduleDir, file);
            importedModule[methodName] = require(methodFilePath);
          }
        }
        if (Object.keys(importedModule).length == 0) {
          importedModule = await import(moduleName);
        }
        return importedModule;
      } catch (err) {
        console.log("Error importing module");
      }
    }
  }
}

/**
 * Main function to find test files in a package.
 * @param {string} packageName - The name of the npm package.
 * @param {string} repo - The URL of the GitHub repository.
 * @returns {string[]} - List of test file paths.
 */
function findTestFiles(packageName, metadataTestFiles) {
  let testFiles = [];
  let packageDir = path.resolve(`./node_modules/${packageName}`);
  try {
    // Check if test files in metadataTestFiles exists
    // (first one enough to confirm if any test included with the npm bundle)
    if (fs.existsSync(path.join(packageDir, metadataTestFiles[0]))) {
      metadataTestFiles.forEach((tf) => {
        testFiles.push(glob.sync(path.join(packageDir, tf), excludePath));
      });
      // Guess patterns if no specific matches found
      if (testFiles.length === 0)
        testFiles.push(
          glob.sync(
            [
              `node_modules/${packageName}/{test,__tests__,tests}/**/*{test,spec,index}*.js`,
              `node_modules/${packageName}/**/*{test,spec}.js`,
            ],
            {
              ignore: [`node_modules/${packageName}/**/node_modules/**`], // Ignores only sub-package node_modules
            }
          )
        );
    }
    if (testFiles.length > 0) return testFiles;
  } catch (e) {
    if (!sandbox && !quiet) console.error("Failed to clone repository or find test files.");
    return [];
  } finally {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
}
