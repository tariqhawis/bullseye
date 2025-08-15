import process from "process";
import vm from "vm";
import fs from "fs";
import path from "path";
import { glob } from "glob";
import { pathToFileURL } from "url";
import { createRequire } from "module";
var BAD_JSON = {};
var fnList = [];
var resultsBuffer = [];
var parsedObject = [];
var victim = {};
var someObj = {};

// const projPath = "/home/xxxx/bulldeye"; // for troubleshooting
const projPath = "/usr/src/app"; // docker path
const fixedCases = JSON.parse(fs.readFileSync(`${projPath}/fuzzPaterns.json`, "utf-8"));
let pkg = {};

if (process.argv[2]) {
  pkg = JSON.parse(process.argv[2]);
} else {
  pkg = {
    package_name: "assign-deep", // import issue
    version: "1.0.0",
    pkgPath: "/data/benchmark/ss-100/assign_deep-1.0.0",
    options: {
      verbose: true,
      sandbox: false,
      vm: true,
      fixFuzz: false,
      maxTestFiles: 1500,
      multiVectors: false, // More than one function might detect the same sink, so we may get redundant sink locations,
      unknownSideEffect: true, // If true, the detection will be limited to the local scope of the function
      // To avoid this behavior, set multiVectors to false
    },
  };
}

const pkgName = pkg.package_name;
const pkgDir =
  pkgName
    .replace(/^(\d)/, "a$1")
    .replace(/^@/, "")
    .replace(/[:\-\./]/g, "_") +
  "-" +
  pkg.version;
const depth = 5; // recursive exploration depth
const pkgPath = pkg.pkgPath ?? `/usr/src/dataset/${pkgDir}`;
const verbose = pkg.options.verbose;
const sandbox = pkg.options.sandbox;
const vmExec = pkg.options.vm;
const unknownSideEffect = pkg.options.unknownSideEffect ?? false;
const newObjectProto = Object.create(null);
Object.defineProperties(newObjectProto, Object.getOwnPropertyDescriptors(Object.prototype));

let pkgTimestamp = Date.now();
(async () => {
  let inputsList = [],
    importedPkg = {},
    importedPkg2 = {},
    nameSpaceObj = {},
    testFiles = [];
  let vectorMap = new Map();
  let detectionArray = [];
  let detectedSink = new Set();

  const { importGlobalNameSpace, importModule, findTestFiles } = await import(`${projPath}/fuzzUtils/packageInit.js`);
  const { generateExploits } = await import(`${projPath}/fuzzUtils/exploitGenerator.js`);
  const { analyzeTestCase, findCallOfInterest } = await import(`${projPath}/fuzzUtils/testInputExtraction.js`);
  const { cleanUpProto, copyPrototypeChain, decodeStr, verify } = await import(
    `${projPath}/fuzzUtils/functionHandler.js`
  );

  try {
    const results = await loadPackage(`${pkgPath}/node_modules/${pkg.package_name}`);
    importedPkg = results.importedPkg;
    detectionArray.modulePaths = results.modulePaths.length;

    fnList = fnEnumerate2(importedPkg, "pkgMainFunc", 5);
    detectionArray.fnCount = fnList.length;

    console.info(`Processing package: ${pkgName}`);
    console.info(`fnList: ${fnList.length}`);
    if (fnList.length > 0) {
      const fnMap = new Map();
      try {
        // **** 1st loop: Fuzzing test cases ****
        console.info(`1: Fuzzing test cases`);
        let enumCases, pkgImports, fnOfInterest;
        const testCasesMap = new Map();

        testFiles = findTestFiles(pkgPath, pkgName);
        //console.info(`Test files #: ${testFiles.join(", ")}`);
        if (testFiles.length <= pkg.options.maxTestFiles) {
          for (const tstFile of testFiles) {
            let code;
            //var tFile = tstFile.match(/([^\/]+)$/)[0]
            try {
              code = fs.readFileSync(tstFile, { encoding: "utf8" });
            } catch (error) {
              console.error(error);
            }
            [enumCases, pkgImports, fnOfInterest] = analyzeTestCase(code);
            testCasesMap.set(tstFile, [enumCases, pkgImports, fnOfInterest]);
          }
        }
        // **** 2nd loop with fixed cases ****
        console.info(`2: fixed cases`);
        if (pkg.options.fixFuzz)
          fnLoop: for (const funcPath of fnList) {
            //const fn = funcPath.replace(/\.cjs|\.esm/, "");
            const fn = funcPath.replace(/\.\_m\_[^\_]+\_m\_/, "").replace(".prototype.constructor", "");
            try {
              fixedCases.forEach((exploitArgs) => {
                cleanUpProto(newObjectProto);
                const exeOutput = fnExecute(
                  funcPath,
                  importedPkg,
                  exploitArgs.sig,
                  { cleanUpProto, copyPrototypeChain, decodeStr, verify },
                  vmExec
                ); // results resultsBuffer
                cleanUpProto(newObjectProto);
                if (exeOutput?.polluted) {
                  const sink = Object.values(exeOutput.sink).join("") === "" ? "null" : exeOutput.sink;
                  const sinkV =
                    Object.values(exeOutput.sink).join("") === "" ? "null" : Object.values(exeOutput.sink).join(",");
                  const detection = {
                    entryPoint: funcPath,
                    inputCase: exeOutput.args,
                    sinkLocation: sink,
                    polluted: exeOutput?.polluted,
                    mode: "fixed",
                  };
                  const input = JSON.stringify(exeOutput.args);
                  const exploit = `${fn}#${input}`;

                  if (pkg.options.multiVectors) {
                    vectorMap.set(fn, sinkV);
                    detectedSink.add(sinkV);
                    detectionArray.push(detection);
                    //} else if (!detectedSink.has(sink)) {
                    if (verbose) console.log(`${fn}(${input}) -> ${JSON.stringify(sinkV)}`);
                    if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                  } else if (vectorMap.get(fn) !== sinkV) {
                    vectorMap.set(fn, sinkV);
                    detectedSink.add(sinkV);
                    detectionArray.push(detection);
                    if (verbose) console.log(`${fn}(${input}) -> ${JSON.stringify(sinkV)}`);
                    if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                  }
                }
              });
            } catch (error) {
              console.info(error.message);
            }
          }

        fnLoop: for (const fnObj of fnList) {
          const fn = fnObj.replace(/\.\_m\_[^\_]+\_m\_/, "").replace(".prototype.constructor", "");
          try {
            for (const [testFile, inputList] of testCasesMap) {
              const locatedFnOI = findCallOfInterest(inputList[2], inputList[1], pkgName, fn);
              if (locatedFnOI.size === 0) continue;
              // check if the there is a test input for the function in the inputList map. The key is the function name (e.g., 'pkgMainFunc'). It may also be 'pkgMainFunc.fn1.fn2'
              if (locatedFnOI.has(fn)) {
                console.info(`Processing function: ${fn}`);
                const exploitCases = generateExploits(locatedFnOI.get(fn));
                const exploitInputs = Array.from(
                  new Set(exploitCases.flatMap((inner) => inner.map(JSON.stringify)))
                ).map(JSON.parse);
                if (exploitCases.length > 0) {
                  //for (let exploitInputs of exploitCases) {
                  for (let exploitArgs of exploitInputs) {
                    cleanUpProto(newObjectProto);
                    const exeOutput = fnExecute(
                      fnObj,
                      importedPkg,
                      exploitArgs,
                      { cleanUpProto, copyPrototypeChain, decodeStr, verify },
                      vmExec
                    );
                    if (nameSpaceObj && nameSpaceObj.length > 0)
                      exeOutput = fnExecute(fn, nameSpaceObj, exploitArgs, globalObj, vmExec);
                    // restore the original prototype chain
                    cleanUpProto(newObjectProto);
                    if (exeOutput?.polluted) {
                      fnMap.set(pkgName, fn);

                      const sink = Object.values(exeOutput.sink).join("") === "" ? "null" : exeOutput.sink;
                      const sinkV =
                        Object.values(exeOutput.sink).join("") === ""
                          ? "null"
                          : Object.values(exeOutput.sink).join(",");
                      const detection = {
                        entryPoint: fnObj,
                        inputCase: exeOutput.args,
                        sinkLocation: sink ?? null,
                        polluted: exeOutput?.polluted,
                        mode: "pairwise",
                        testFile: testFile.replace(`${pkgPath}/node_modules/${pkg.package_name}`, ""),
                      };
                      const input = JSON.stringify(exeOutput.args);
                      const exploit = `${fn}#${input}`;

                      if (pkg.options.multiVectors) {
                        vectorMap.set(fn, sinkV);
                        detectedSink.add(sinkV);
                        detectionArray.push(detection);
                        //} else if (!detectedSink.has(sink)) {
                        if (verbose) console.log(`${fn}(${input}) -> ${JSON.stringify(sinkV)}`);
                        if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                      } else if (vectorMap.get(fn) !== sinkV) {
                        vectorMap.set(fn, sinkV);
                        detectedSink.add(sinkV);
                        detectionArray.push(detection);
                        if (verbose) console.log(`${fn}(${input}) -> ${JSON.stringify(sinkV)}`);
                        if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                      }
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(error);
          }
        }
      } catch (e) {
        console.error(e);
      }
    } // else console.info(`No functions to analyze`);
  } catch (error) {
    console.error(error);
  } finally {
    return detectionArray;
  }
})()
  .then((results) => {
    if (!sandbox) console.log(`<JSON-OUTPUT>${JSON.stringify(results)}</JSON-OUTPUT>`);
    console.log(`<STATS>${JSON.stringify({ fnCount: results.fnCount, modulePaths: results.modulePaths })}</STATS>`);
  })
  .catch((e) => {
    console.error(e);
    if (results && results.length > 0) {
      //if (verbose) console.info(JSON.stringify(results, null, 2), e);
      if (!sandbox) console.log(`<JSON-OUTPUT>${JSON.stringify(results)}</JSON-OUTPUT>`);
    }
  })
  .finally(() => {
    // fs.rmSync(path.join(__dirname, "tmp", `tempFunc_${process.pid}`), { recursive: true, force: true });
    //process.exit(0);
  });

function mapToJson(map) {
  if (!(map instanceof Map)) return map; // Base case: return value if not a Map

  let obj = {};
  for (let [key, value] of map.entries()) {
    if (key === "results" && value instanceof Map) {
      obj[key] = [...value.entries()].map(([fnName, fnData]) => ({
        entrypoint: fnName,
        ...mapToJson(fnData),
      }));
    } else {
      obj[key] = mapToJson(value); // Recursively process nested Maps
    }
  }
  return obj;
}

function fnResolve(fnPath, context) {
  fnPath = fnPath.split(".");
  fnPath.shift();
  const fn = fnPath.reduce((obj, segment) => {
    if (obj && obj[segment] !== undefined) {
      return obj[segment];
    }
  }, context); // Split path by '.'

  // Ensure the resolved value is a function
  if (typeof fn !== "function") {
  }
  return fn;
}
function fnExecute(fnPath, context, args, aux, vmExec = false) {
  //let verbose = false;
  const { cleanUpProto, copyPrototypeChain, decodeStr, verify } = aux;
  const trackedProperty = "pollutedKey";
  var protoMonitor = { readProto: null, readProp: null, setProto: null, setProp: null };
  var monitorMap = new Map();
  let fn,
    someObj = {},
    victim = {};
  try {
    fn = fnResolve(fnPath, context);
    if (!fn) return;
    Object.setPrototypeOf(
      someObj,
      new Proxy(Object.prototype, {
        get(obj, prop, receiver) {
          if (prop === "__proto__") {
            const error = new Error();
            const stackLines = error.stack.split("\n");
            protoMonitor.readProto = stackLines[2].trim();
          } else if (prop === trackedProperty) {
            const error = new Error();
            const stackLines = error.stack.split("\n");
            protoMonitor.readProp = stackLines[2].trim();
          }
          return Reflect.get(obj, prop, receiver);
        },
        set(obj, prop, value, receiver) {
          if (prop === "__proto__") {
            const error = new Error();
            const stackLines = error.stack.split("\n");
            protoMonitor.setProto = stackLines[2].trim();
          } else if (prop === trackedProperty) {
            const error = new Error();
            const stackLines = error.stack.split("\n");
            protoMonitor.setProp = stackLines[2].trim();
          }
          return Reflect.set(obj, prop, value, receiver);
        },
      })
    );

    function withPropertyTrap(targetFunction) {
      return new Proxy(targetFunction, {
        apply(target, thisArg, argumentsList) {
          try {
            // Execute the target function with `emptyProxy` as the context
            const decodedArgs = decodeStr(argumentsList).map((arg) => (arg === "{}" ? someObj : arg));
            Reflect.apply(target, someObj, decodedArgs);
          } catch (error) {}
        },
      });
    }
    const trappedFunction = withPropertyTrap(fn);
    const clonedChain = copyPrototypeChain(victim);
    try {
    } catch (error) {
      //console.error(error, args);
    }

    if (verbose && !vmExec) {
      try {
        trappedFunction(...args);
      } catch (error) {
        //console.error(error);
      }
    } else {
      vmRun(trappedFunction, fn, args, someObj);
    }

    //
    const activeChain = Object.getPrototypeOf(victim);
    const propKey = verify(clonedChain, activeChain);
    // check if our property added in a different format or structure (e.g., under an object)
    if (propKey && propKey.includes(trackedProperty)) {
      return {
        polluted: true,
        sink: protoMonitor,
        args: decodeStr(args).map((arg) => (arg === "{}" ? {} : arg)),
        fnCode: fn,
      };
    }
    // Check if the prototype chain has been modified "this needs manually validatation to the generated exploit"
    else if (unknownSideEffect && (propKey || pollutionFinder(victim, trackedProperty, true))) {
      return {
        polluted: "unknown",
        sink: protoMonitor,
        args: decodeStr(args).map((arg) => (arg === "{}" ? someObj : arg)),
        fnCode: fn,
      };
    }
    // check if setProp is modified. If neither of above are not triggered, this often means local change to the target (not prototype pollution)
    else if (protoMonitor.setProp && unknownSideEffect) {
      return {
        polluted: "local",
        sink: protoMonitor,
        args: decodeStr(args).map((arg) => (arg === "{}" ? someObj : arg)),
        fnCode: fn,
      };
    }
  } catch (e) {
    //console.info(e, fn); // Handle any errors that occurred during execution, only turn on for debugging!
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-fixFuzzy-${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

function vmRun(proxyFunction, fn, inputCase, obj, action = "add", timeout = 100) {
  // Create a sandbox context for executing the function
  const sandbox = {
    fn, // the function to test
    inputCase, // the input cases
    proxyFunction,
    obj,
    result: {},
  };
  let context, code, script;
  try {
    // Create a new VM context
    context = vm.createContext(sandbox);
    if (action === "del") context.__proto__.pollutedKey = "PP";

    // Function to execute the test function in the sandbox
    // code = `result.output = proxyFunction.call(null, ...inputCase);`;
    // code = ` proxyFunction(...inputCase); `;
    const code = `result.output = Reflect.apply(proxyFunction, null, inputCase);`;

    // Create and run the script with a timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout }); // This enforces the timeout

    // The result is handled within the sandbox context
  } catch (e) {
    // Handle timeout or any other error
    //console.info("error while running code in a vm context: ", e);
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-vmRun${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

function isClass(classObj) {
  try {
    if (
      typeof classObj?.prototype["get"] === "function" ||
      typeof classObj?.prototype["set"] === "function" ||
      typeof classObj?.prototype["has"] === "function"
    )
      return true;
  } catch (e) {
    //console.error(e)
  }
}

function resolveFunction(fnPath, context) {
  // Check for function call '()' in the segment
  //const match = segment.match(/^(\w+)\(\)$/); // Match function calls like 'lib()'
  if (fnPath === "lib({}).set") {
    const obj = context(empty)["set"];
    if (typeof obj === "function") {
      return obj; // Invoke the function
    } else {
      throw new Error(`Path segment "${funcName}" is not a callable function.`);
    }
  }
  // Split path by '.'

  const fnSegments = fnPath.split(".");
  fnSegments.shift(); // Remove the leading segment if required (e.g., 'lib' part is assumed context)

  // Traverse the path
  const fn = fnSegments.reduce((obj, segment) => {
    if (!obj) {
      throw new Error(`Path segment "${segment}" cannot be resolved.`);
    }

    // Otherwise, resolve the property
    if (obj[segment] !== undefined) {
      return obj[segment];
    }

    throw new Error(`Path segment "${segment}" does not exist.`);
  }, context);

  // Ensure the resolved value is a function
  if (typeof fn !== "function") {
    throw new Error(`Resolved path "${fnPath}" is not a function.`);
  }

  return fn;
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

async function importModule2(moduleName, resolve = false) {
  let importType;
  let importedModule = {};
  try {
    if (resolve) return await resolveModules(moduleName);
    importedModule = require(moduleName);
    importType = "require";
  } catch (e) {
    console.info("Trying dynamic import..");
    try {
      importedModule = await import(moduleName);
      importType = "import";
    } catch (e) {
      console.info("Trying files import..");
      [importedModule, importType] = await resolveModules(moduleName);
    }
  }
  return [importedModule, importType];
}

async function resolveModules(moduleName) {
  let importType = "require";
  let importedModule = {};
  try {
    // Get the path to the module's directory
    const modulePath = require.resolve(moduleName);
    const index = path.basename(modulePath);
    const moduleDir = path.dirname(modulePath);

    // Read the directory to get the list of method files
    const methodFiles = fs.readdirSync(moduleDir);

    // Import each method file individually
    for (const file of methodFiles) {
      if (file.endsWith(".js") && file !== index) {
        const methodName = path.basename(file, ".js");
        const methodFilePath = path.join(moduleDir, file);
        importedModule[methodName] = require(methodFilePath);
      }
      // If the file is a directory, recursively import its contents
      else if (fs.statSync(path.join(moduleDir, file)).isDirectory()) {
        try {
          const subDir = path.join(moduleDir, file);
          const subFiles = fs.readdirSync(subDir);
          for (const subFile of subFiles) {
            if (subFile.endsWith(".js")) {
              const methodName = path.basename(subFile, ".js");
              const methodFilePath = path.join(subDir, subFile);
              importedModule[methodName] = require(methodFilePath);
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
    }
    if (Object.keys(importedModule).length == 0) {
      importedModule = await import(moduleName);
      importType = "import";
    }
  } catch (err) {
    console.info("Error importing module");
  }
  return [importedModule, importType];
}

function fnEnumerate2(lib, prefix, depth, globalNameObj = false) {
  if (depth <= 0 || !lib) return [];

  const enumSet = new Set();

  function processProperty(fName, obj, prefix, depth) {
    if (!fName || fName === "__proto__" || fName === "Skipped-Function" || +fName == fName) return;

    try {
      const prop = obj[fName];
      const propPath = `${prefix}.${fName}`;

      if (typeof prop === "function") {
        enumSet.add(propPath);

        if (isClass(prop)) {
          // Process class prototype methods
          for (const method of Reflect.ownKeys(prop.prototype)) {
            if (method !== "constructor" && typeof prop.prototype[method] === "function") {
              enumSet.add(`${propPath}.${method}`);
            }
          }
        }

        // Check for function properties (nested functions inside objects)
        for (const subProp of Reflect.ownKeys(prop)) {
          if (typeof prop[subProp] === "function") {
            enumSet.add(`${propPath}.${subProp}`);
          }
        }
      } else if (typeof prop === "object" && prop !== null) {
        recurse(prop, propPath, depth - 1);
      }
    } catch (error) {}
  }

  function recurse(obj, prefix, depth) {
    if (!obj || depth <= 0) return;

    try {
      const visited = new Set(); // Track visited properties

      // Enumerate own properties
      for (const fName of Reflect.ownKeys(obj)) {
        visited.add(fName);
        processProperty(fName, obj, prefix, depth);
      }

      // Enumerate inherited properties
      for (const fName in obj) {
        if (!visited.has(fName)) {
          processProperty(fName, obj, prefix, depth);
        }
      }

      // Handle function prototypes
      if (typeof obj === "function" && obj.prototype && Reflect.ownKeys(obj.prototype).length > 1) {
        recurse(obj.prototype, `${prefix}.prototype`, depth - 1);
      }

      // Handle global object cases
      if (globalNameObj && Array.isArray(obj)) {
        for (const globalSObj of obj) {
          if (global[globalSObj]) {
            recurse(global[globalSObj], globalSObj, depth - 1);
          }
        }
      }
    } catch (error) {}
  }

  recurse(lib, prefix, depth);
  return [...enumSet]; // Convert Set to array
}

async function loadPackage(pkgDir) {
  let globalPaths = new Set();
  const path = await import("path");
  const { readFile } = await import("fs/promises");
  //const { createRequire } = await import("module");
  const fs = await import("fs");

  let results = {};
  const parsedModule = new Set();
  const excludeSet = new Set(["json", "ts", "tsm", "jsx", "tsx", "jsx", "tsx"]);
  const importKeys = new Set(["browser", "jsnext", "main", "module", "import", "jsnext:main", "require", "default"]);
  let require, pkgMainPath, pkgJsonPath, pkgJson;
  try {
    require = createRequire(import.meta.url); // Enable require in ESM
    pkgMainPath = require.resolve(pkgDir); // Resolve package main file
    //pkgDir = pkgPath.replace(new RegExp(`(${pkgName}).*`), "$1"); // Get package directory
    pkgJsonPath = path.join(pkgDir, "package.json"); // Locate package.json

    // Read package.json
    pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
    // Function to check and add valid file paths
    const checkAndAdd = async (filePath) => {
      let fullPath;
      if (!filePath || typeof filePath !== "string") return;
      fullPath = !filePath.includes(".") ? pkgPath : path.join(pkgDir, filePath);
      // determine moduleType based on the file extension
      const key = path.extname(fullPath).slice(1);
      const uniqueKey = `${key}-${Math.random().toString(36).substring(7)}`;
      //const uniqueKey = `${key}_${Math.random().toString(36).substring(7)}`;
      if (fullPath.includes("esm")) console.warn(`ESM module detected at ${fullPath}`);
      if (fs.existsSync(fullPath) && !parsedModule.has(fullPath) && !excludeSet.has(fullPath.split(".").pop())) {
        results[`_m_${uniqueKey}_m_`] =
          //key === "cjs" || key === "js" ? require(fullPath) : await import(fullPath).catch(() => null);
          await importModule3(fullPath, require).catch(() => ({}));
        parsedModule.add(fullPath);
      }

      return fullPath;
    };

    // Check standard module fields
    // if pkgJson and any property with a key in importKeys
    if (Object.keys(pkgJson).some((key) => importKeys.has(key))) {
      for (const key of importKeys) {
        if (pkgJson[key] && typeof pkgJson[key] === "string") {
          globalPaths.add(await checkAndAdd(pkgJson[key]));
        }
      }
    }
    // if (pkgJson.module) {
    //   await checkAndAdd(pkgJson.module);
    // }
    // if (pkgJson["jsnext:main"]) {
    //   await checkAndAdd(pkgJson["jsnext:main"]);
    // }
    // if (pkgJson.exports?.import) {
    //   await checkAndAdd(pkgJson.exports?.import);
    // }
    // if (pkgJson.exports?.require || pkgJson.main) {
    //   await checkAndAdd(pkgJson.exports?.require || pkgJson.main);
    // }

    // Handle "exports" field
    if (pkgJson.exports && typeof pkgJson.exports === "object") {
      for (const [key, value] of Object.entries(pkgJson.exports)) {
        if (typeof value === "string") {
          globalPaths.add(await checkAndAdd(value));
        } else if (typeof value === "object") {
          if ("default" in value) {
            globalPaths.add(await checkAndAdd(value.default));
          }
          if ("import" in value) {
            if (typeof value.import === "string") {
              globalPaths.add(await checkAndAdd(value.import));
            } else if (typeof value.import === "object") {
              globalPaths.add(await checkAndAdd(value.import.default));
              //results[`${key}.import.types`] = value.import.types || null;
            }
          }
          if ("require" in value) {
            if (typeof value.require === "string") {
              //await checkAndAdd(`${key}.require`, value.require);
              globalPaths.add(await checkAndAdd(value.require));
            } else if (typeof value.require === "object") {
              //await checkAndAdd(`${key}.require.default`, value.require.default);
              globalPaths.add(await checkAndAdd(value.require.default));
              //results[`${key}.require.types`] = value.require.types || null;
            }
          }
        }
      }
    }

    // Handle edge cases: direct require calls
    if (
      Object.keys(results).length === 0 ||
      Object.keys(results)[0] === undefined ||
      (Object.keys(results).length > 1 && Object.keys(results)[1] === undefined) ||
      (typeof Object.values(results)[0] === "object" && Object.keys(Object.values(results)[0]).length === 0)
    ) {
      globalPaths.add(pkgMainPath);
      results = await importModule3(pkgMainPath, require).catch(() => ({}));
    }
  } catch (err) {
    console.warn(`Error loading ${pkgName}:`, err.message);
  }

  return { importedPkg: results, modulePaths: Array.from(globalPaths) };
}

async function importModule3(moduleName, require) {
  try {
    return require(moduleName);
  } catch (e) {
    console.log("Trying dynamic import..");
    try {
      // If require fails, attempt a dynamic import
      const modulePath = require.resolve(moduleName);
      const moduleUrl = pathToFileURL(modulePath).href;
      const importedModule = await import(moduleUrl);
      return importedModule.default || importedModule;
      //return await import(moduleName);
    } catch (e) {
      console.log("Trying files import..");
      try {
        if (e.message.search(/Did you mean to import/) !== -1) {
          const suggestedPath = e.message.match(/Did you mean to import "([^"]+)"\?/);
          const importedPkg = await import(path.resolve(pkgPath, "node_modules") + "/" + suggestedPath[1]);
          //if (typeof importedModule.default === "object")
          return importedPkg.default;
        } else {
          try {
            // Get the path to the module's directory
            const require = createRequire(import.meta.url);
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
          } catch (error) {
            throw new Error("Error importing module");
          }
        }
      } catch (e) {
        try {
          // Get the path to the module's directory
          const require = createRequire(import.meta.url);
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
        } catch (error) {
          throw new Error("Error importing module");
        }
      }
    }
  } finally {
    //process.chdir(originalDir);
    //process.env.NODE_PATH = originalNodePath; // Restore original NODE_PATH
  }
}
