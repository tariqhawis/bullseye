const vm = require("vm");
const process = require("process");
var victim = {};
var someObj = {};

function isClass(classObj) {
  try {
    if (
      typeof classObj?.prototype["get"] === "function" ||
      typeof classObj?.prototype["set"] === "function" ||
      typeof classObj?.prototype["has"] === "function"
    )
      return true;
  } catch (e) {
    //console.log(e)
  }
}

const isBase641 = (str) => {
  try {
    // Check if string can be encoded and decoded without errors
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
};

function isBase64(str) {
  // Standardize padding
  const standardizedStr = str.padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");

  try {
    // Decode and re-encode
    const decoded = Buffer.from(standardizedStr, "base64").toString("utf-8");
    const reEncoded = Buffer.from(decoded, "utf-8").toString("base64");

    // Standardize re-encoded string's padding
    const standardizedReEncoded = reEncoded.padEnd(reEncoded.length + ((4 - (reEncoded.length % 4)) % 4), "=");

    return standardizedReEncoded === standardizedStr;
  } catch (err) {
    return false;
  }
}

function decodeBase64Strings(array) {
  return array.map((str) => {
    if (isBase64(str)) {
      try {
        // Decode the Base64 string
        const decoded = atob(str);
        try {
          return JSON.parse(decoded); // Attempt to parse as JSON
        } catch {
          return decoded; // Return plain decoded string if not JSON
        }
      } catch (e) {
        // Handle decoding errors
        return str;
      }
    }
    return str;
  });
}

function decodeStr(args) {
  const base64Seeds = [
    "Int9Ll9fcHJvdG9fXyI=",
    "IntcIl9fcHJvdG9fX1wiOntcInBvbGx1dGVkS2V5XCI6XCIxMzJcIn19Ig==",
    "IntcIl9fcHJvdG9fX1wiOntcInBvbGx1dGVkS2V5XCI6XCJwb2xsdXRlZFZhbHVlXCJ9fSI=",
    "WyJfX3Byb3RvX18iLCJwb2xsdXRlZEtleSJd",
    "WyJfX3Byb3RvX18iLCJwb2xsdXRlZEtleSIsInBvbGx1dGVkVmFsdWUiXQ==",
    "W1siX19wcm90b19fIl0sInBvbGx1dGVkS2V5Il0=",
    "W1siX19wcm90b19fIl0sInBvbGx1dGVkS2V5IiwicG9sbHV0ZWRWYWx1ZSJd",
    "W1siX19wcm90b19fIiwicG9sbHV0ZWRLZXkiXSwicG9sbHV0ZWRWYWx1ZSJd",
    "W1siX19wcm90b19fIl0sWyJfX3Byb3RvX18iXSwicG9sbHV0ZWRWYWx1ZSJd",
  ];
  return args.map((arg) => {
    // if str is a seed, use function isBase641(), otherwise use isBase64();
    if (arg === "{}" || arg === "e30=" || arg === JSON.parse("{}")) return "{}";
    if (arg !== "" && typeof arg === "string") {
      const isB64 = base64Seeds.includes(arg) ? isBase641(arg) : isBase64(arg);
      if (isB64) {
        // Decode and parse JSON if the decoded value is valid JSON
        //const decoded = atob(arg);
        const decoded = JSON.parse(Buffer.from(arg, "base64").toString("utf-8"));
        try {
          return JSON.parse(decoded); // Attempt to parse as JSON
        } catch {
          return decoded; // Return plain decoded string if not JSON
        }
      } else if (arg.charAt(0) === "{") {
        try {
          return JSON.parse(arg); // Attempt to parse as JSON
        } catch {
          return arg; // Return plain decoded string if not JSON
        }
      } else if (arg === "false" || arg === "true") {
        // replace string boolean to boolean
        return arg === "true" ? true : false;
      }
    }
    return arg; // Return the original argument if not Base64
  });
}
function savePrototypeChain(obj) {
  const prototypeChain = [];
  let currentProto = Object.getPrototypeOf(obj);

  while (currentProto !== null) {
    prototypeChain.push(currentProto);
    currentProto = Object.getPrototypeOf(currentProto);
  }

  return prototypeChain;
}

function restorePrototypeChain(obj, prototypeChain) {
  let currentProto = prototypeChain[0];
  Object.setPrototypeOf(obj, currentProto);

  for (let i = 1; i < prototypeChain.length; i++) {
    const nextProto = prototypeChain[i];
    Object.setPrototypeOf(currentProto, nextProto);
    currentProto = nextProto;
  }

  Object.setPrototypeOf(currentProto, null);
}

function copyPrototypeChain(obj) {
  let currentProto = Object.getPrototypeOf(obj);
  let copiedChain = Object.create(currentProto);

  // Traverse the prototype chain and create copies of each prototype object
  while (currentProto !== null) {
    const nextProto = Object.getPrototypeOf(currentProto);
    const copiedProto = Object.create(nextProto);
    Object.getOwnPropertyNames(currentProto).forEach((prop) => {
      Object.defineProperty(copiedProto, prop, Object.getOwnPropertyDescriptor(currentProto, prop));
    });
    Object.setPrototypeOf(copiedChain, copiedProto);
    copiedChain = copiedProto;
    currentProto = nextProto;
  }

  return copiedChain;
}

//function findAddedorModifiedProperty(beforeChain, afterChain)
function findAddedorModifiedProperty(beforeChain, afterChain) {
  let currentProtoBefore = beforeChain;
  let currentProtoAfter = afterChain;
  let propStack = {};
  // Traverse the prototype chains
  while (currentProtoBefore !== null && currentProtoAfter !== null) {
    // Get the property names of the current prototype objects
    const propsBefore = Object.getOwnPropertyNames(currentProtoBefore);
    const propsAfter = Object.getOwnPropertyNames(currentProtoAfter);

    // Find the added or modified property in the current prototype object
    const addedOrModifiedProperty = propsAfter.find(
      (prop) => !propsBefore.includes(prop) || currentProtoBefore[prop] !== currentProtoAfter[prop]
    );

    // If an added or modified property is found, print it out
    if (addedOrModifiedProperty) {
      //console.log(`Added or modified property '${addedOrModifiedProperty}' with value '${currentProtoAfter[addedOrModifiedProperty]}'`);
      propStack = { [addedOrModifiedProperty]: currentProtoAfter[addedOrModifiedProperty] }; // Stop searching after finding the first added or modified property
      break;
    }

    // Move to the next prototype objects
    currentProtoBefore = Object.getPrototypeOf(currentProtoBefore);
    currentProtoAfter = Object.getPrototypeOf(currentProtoAfter);
  }

  return propStack;
}

function verify(clonedChain, activeChain) {
  //if ({}.test == 123 || {}.test == '123') {
  // Check if there is an added or modified property
  var prop = findAddedorModifiedProperty(clonedChain, activeChain);
  const key = Object.keys(prop)[0];
  if (prop.hasOwnProperty(key)) {
    //if ({}.test == true || {}.test == 'true' || {}.test == '../test') {
    //delete Object.prototype[key];
    //delete Object.prototype.polluted;
    // restore the original prototype chain
    Object.setPrototypeOf(victim, clonedChain);
    return key;
  }
  return false;
}

function fnResolve(fnPath, context) {
  fnPath = fnPath.split(".");
  fnPath.shift();
  const fn = fnPath.reduce((obj, segment) => {
    if (obj && obj[segment] !== undefined) {
      return obj[segment];
    }
    //throw new Error(`Path segment "${segment}" does not exist.`, fnPath, context);
  }, context); // Split path by '.'

  // Ensure the resolved value is a function
  if (typeof fn !== "function") {
    //throw new Error(`Resolved path "${fnPath}" is not a function.`);
  }
  return fn;
}

function vmRun(proxyFunction, fn, inputCase, action = "add", timeout = 500) {
  // Create a sandbox context for executing the function
  const sandbox = {
    fn, // the function to test
    inputCase, // the input cases
    proxyFunction,
    console,
  };
  let context, code, script;
  try {
    // Create a new VM context
    context = vm.createContext(sandbox);
    if (action === "del") context.__proto__.pollutedKey = "PP";

    // Function to execute the test function in the sandbox
    //code = `const result = inputCase.call(null, fn);`;
    //code = `const result = fn.call(null, inputCase[0]);`;
    //code = ` proxyFunction(...inputCase); `;
    const code = `const result = Reflect.apply(proxyFunction, null, inputCase);`;

    // Create and run the script with a timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout: timeout }); // This enforces the timeout
    /*         if (victim.pollutedKey && action !== 'del')
                    return victim.pollutedKey; */
    // The result is handled within the sandbox context
  } catch (e) {
    // Handle timeout or any other error
    //console.log('error while running code in a vm context: ', e)
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-vmRun${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

function fnExecute(fnPath, context, args, vmExec = false) {
  let quiet = false;
  const trackedProperty = "pollutedKey";
  var protoMonitor = { sink1: null, sink2: null };
  let fn;
  (someObj = {}), (victim = {});
  try {
    fn = fnResolve(fnPath, context);
    if (!fn) return;
    Object.setPrototypeOf(
      someObj,
      new Proxy(Object.prototype, {
        get(obj, prop, receiver) {
          if (prop === "__proto__") {
            //throw new Error(`Access to property ${trackedProperty} detected`);
            //throw new Error('accessed');
            const error1 = new Error();
            const stackLines1 = error1.stack.split("\n");
            //protoMonitor.protoType = true;
            protoMonitor.sink1 = stackLines1[2].trim();
          } else if (prop === trackedProperty) {
            //throw new Error(`Access to property ${trackedProperty} detected`);
            //throw new Error('accessed');
            const error2 = new Error();
            const stackLines2 = error2.stack.split("\n");
            //protoMonitor.protoType = true;
            protoMonitor.sink2 = stackLines2[2].trim();
          }
          return Reflect.get(obj, prop, receiver);
        },
        set(obj, prop, value, receiver) {
          if (prop === "__proto__") {
            //throw new Error(`Access to property ${trackedProperty} detected`);
            //throw new Error('accessed');
            const error1 = new Error();
            const stackLines1 = error1.stack.split("\n");
            //protoMonitor.protoType = true;
            protoMonitor.sink1 = stackLines1[2].trim();
          } else if (prop === trackedProperty) {
            //throw new Error(`Modification of property ${trackedProperty} detected`);
            //throw new Error('modify');
            //protoMonitor.pollutedProp = true;
            const error2 = new Error();
            const stackLines2 = error2.stack.split("\n");
            protoMonitor.sink2 = stackLines2[2].trim();
          }
          return Reflect.set(obj, prop, value, receiver);
        },
        has(obj, prop) {
          if (prop === trackedProperty) {
            //throw new Error(`Access to property ${trackedProperty} detected`);
            //throw new Error('accessed');
          }
          return Reflect.has(obj, prop);
        },
      })
    );

    //someObj = proxingObj({})
    // Create a proxy to wrap the target function
    const proxyFunction = new Proxy(fn, {
      apply: function (target, thisArg, argumentsList) {
        //console.log('Intercepted function call');
        return Reflect.apply(target, null, argumentsList);
        //return target.call(undefined, ...argumentsList);
      },
    });
    //const trappedFunction = withPropertyTrap(fn);
    try {
      //args = args.map(decodeStr);
      args = decodeStr(args);
      //console.log(JSON.stringify(args));
    } catch (error) {
      console.error(error, args);
    }
    const clonedChain = copyPrototypeChain(victim);

    if (!quiet && !vmExec) {
      //Reflect.apply(null, trappedFunction);
      proxyFunction(...args);
      //fn(...args);
      // reset the prototype chain and global object
      //const config = new context.constructor();
      //fn.prototype = null;
      //Reflect.apply(fn, null, args);
      // execute fn with args using new function
      //const result = new Function("fn", "args", "return fn(...args)")(fn, args);
      //const result = new Function("fn", "args", "return fn(args);")(fn, args);
    } else vmRun(proxyFunction, fn, args);
    /*         if (protoMonitor.sink2) {
                    return protoMonitor;
                } */
    if (pollutionFinder(victim, trackedProperty, true)) {
      //Reflect.deleteProperty(Object.prototype, trackedProperty)
      return { polluted: true, sink: protoMonitor, args: args, fnCode: fn };
    }
    const activeChain = Object.getPrototypeOf(victim);
    const propKey = verify(clonedChain, activeChain);
    if (propKey) return { polluted: propKey, sink: protoMonitor, args: args, fnCode: fn };

    // Second round: check property Deletion
    /*         victim = {}
                vmRun(inputCase, trappedFunction, 'del');
                if (protoMonitor.sink2) {
                    return protoMonitor;
                }
                else
                    Reflect.deleteProperty(Object.prototype, 'pollutedKey') */
  } catch (e) {
    console.log(e, fn); // Handle any errors that occurred during execution, only turn on for debugging!
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-fixFuzzy-${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
  return {};
}

// Function to execute a module's method in an isolated child process
function fnExe(fnpath, methodName, args) {
  return new Promise((resolve, reject) => {
    const child = fork(path.resolve(__dirname, "worker.js")); // Child process script

    // Send execution details to the child process
    child.send({ modulePath, methodName, args });

    // Handle result from the child process
    child.on("message", (message) => {
      console.log("Execution result:", message);
      resolve(message);
      child.kill(); // Terminate child process
    });

    // Handle errors
    child.on("error", (err) => {
      reject(err);
    });

    // Handle process exit
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Child process exited with code ${code}`));
      }
    });
  });
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

    // Check if the property is nested within any of the object's own fNameerties
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

function cleanUpProto(cleanedCopy) {
  const currentProto = Object.prototype;

  // Step 1: Remove properties added to Object.prototype
  Object.keys(currentProto).forEach((key) => {
    if (!(key in cleanedCopy)) {
      delete currentProto[key];
    }
  });

  // Step 2: Restore modified properties
  Object.getOwnPropertyNames(cleanedCopy).forEach((key) => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(cleanedCopy, key);
    const currentDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);

    // Check if the property exists in the current prototype
    if (currentDescriptor) {
      // Compare the descriptors
      const descriptorsEqual =
        originalDescriptor.value === currentDescriptor.value &&
        originalDescriptor.configurable === currentDescriptor.configurable &&
        originalDescriptor.enumerable === currentDescriptor.enumerable &&
        originalDescriptor.writable === currentDescriptor.writable;

      // If descriptors are not equal, restore the original descriptor
      if (!descriptorsEqual) {
        Object.defineProperty(Object.prototype, key, originalDescriptor);
      }
    }
  });

  // Step 3: Remove non-enumerable, non-symbol properties added directly
  Object.getOwnPropertyNames(currentProto).forEach((key) => {
    if (!(key in cleanedCopy)) {
      delete currentProto[key];
    }
  });

  // Step 4: Restore symbol properties if any
  const originalSymbols = Object.getOwnPropertySymbols(cleanedCopy);
  const currentSymbols = Object.getOwnPropertySymbols(currentProto);

  currentSymbols.forEach((symbol) => {
    if (!originalSymbols.includes(symbol)) {
      delete currentProto[symbol];
    }
  });

  originalSymbols.forEach((symbol) => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(cleanedCopy, symbol);
    const currentDescriptor = Object.getOwnPropertyDescriptor(currentProto, symbol);

    if (
      !currentDescriptor ||
      originalDescriptor.value !== currentDescriptor.value ||
      originalDescriptor.configurable !== currentDescriptor.configurable ||
      originalDescriptor.enumerable !== currentDescriptor.enumerable ||
      originalDescriptor.writable !== currentDescriptor.writable
    ) {
      Object.defineProperty(currentProto, symbol, originalDescriptor);
    }
  });
}

module.exports = {
  fnExecute,
  fnResolve,
  pollutionFinder,
  isClass,
  decodeStr,
  savePrototypeChain,
  restorePrototypeChain,
  copyPrototypeChain,
  findAddedorModifiedProperty,
  verify,
  vmRun,
  vm,
  cleanUpProto,
};
