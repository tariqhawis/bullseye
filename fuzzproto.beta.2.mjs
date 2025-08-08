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

const projPath = "/home/tariq/bulleyes"; // host path
//const projPath = "/usr/src/app"; // docker path
const fixedCases = JSON.parse(fs.readFileSync(`${projPath}/fuzzPaterns.json`, "utf-8"));
let pkg = {};

//console.info('pkg: ' + process.argv[2]);
//exec.execSync('ls -la ', { stdio: 'inherit', encoding: 'utf-8' });
if (process.argv[2]) {
  pkg = JSON.parse(process.argv[2]);
} else {
  pkg = {
    package_name: "objtools",
    version: "3.0.0",
    pkgPath: "/home/tariq/benchmark/ss-100/objtools-3.0.0",
    options: {
      verbose: true,
      sandbox: false,
      vm: true,
      fixFuzz: true,
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
//const verbose = process.argv[4] == 'verbose' ? true : false;
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
  //const { fuzzGenerator } = require('./utils.js')
  //const { generateTestInputs } = require(`${projPath}/fuzzUtils/pairwise.js");
  //const { extractInputsFromTestSuites } = require(`${projPath}/fuzzUtils/AnalyzeTestSuites.js");
  const { importGlobalNameSpace, importModule, findTestFiles } = await import(`${projPath}/fuzzUtils/packageInit.js`);
  const { generateExploits } = await import(`${projPath}/fuzzUtils/exploitGenerator.js`);
  const { analyzeTestCase, findCallOfInterest } = await import(`${projPath}/fuzzUtils/testInputExtraction.js`);
  const { fnEnumerate, cleanUpProto, copyPrototypeChain, decodeStr, verify } = await import(
    `${projPath}/fuzzUtils/functionHandler.js`
  );
  //const ivm = vmExec ? await import("isolated-vm") : false;
  //const { importModule } = require("/home/tariq/bulleyes/fuzzUtils/packageInit.js");

  try {
    // const originalDir = process.cwd();
    // const originalNodePath = process.env.NODE_PATH || "";
    // process.chdir(pkg.pkgPath);
    // process.env.NODE_PATH = path.resolve(pkg.pkgPath, "node_modules") + path.delimiter + originalNodePath;
    // require("module").Module._initPaths(); // Reinitialize module paths
    /*         if (fs.existsSync('./cloc.txt'))
                    loc = JSON.parse(fs.readFileSync('./cloc.txt', { encoding: 'utf8' })).SUM['code']; */
    //    [importedPkg, importType] = await importModule2(pkgName);
    //importedPkg = await importModule(`${pkg.pkgPath}/node_modules/${pkg.package_name}`);
    importedPkg = await loadPackage2(`${pkgPath}/node_modules/${pkg.package_name}`);
    //importedPkg = await import(`${pkg.pkgPath}/node_modules/${pkg.package_name}/index.js`);
    // importedPkg2 = await importGlobalNameSpace(`${pkg.pkgPath}/node_modules/${pkg.package_name}`);
    //let path = importType === "require" ? pkgName : importType === "import" ? `${pkgName}.default` : null;
    //fnList = fnEnumSimple(importedPkg, path, depth); // generate fnList
    //fnList = fnEnumerate(importedPkg, path, depth); // generate fnList
    fnList = fnEnumerate2(importedPkg, "pkgMainFunc", 5);
    // if (importedPkg2 && Object.keys(importedPkg2).length !== 0)
    //   fnList = fnList.concat(fnEnumerate(importedPkg2, "mainEntry", 5));
    //repoDir = await fetchMetadata(pkg);
    //console.info(`Repo dir: ${repoDir}`);
    console.info(`Processing package: ${pkgName}`);
    console.info(`fnList: ${fnList.length}`);
    if (fnList.length > 0) {
      const fnMap = new Map();
      try {
        // **** 1st loop: Fuzzing test cases ****
        console.info(`1: Fuzzing test cases`);
        let enumCases, pkgImports, fnOfInterest;
        const testCasesMap = new Map();
        // run glob to see of any folder start with repo-, if not, provide the path with node_modules
        // const testLocation =
        //   glob.sync(`${pkg.pkgPath}/repo-*`).length > 0
        //     ? `${pkg.pkgPath}/repo-*`
        //     : `${pkg.pkgPath}/node_modules/${pkgName}`;
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
                //if (exeOutput?.polluted && fnMap.get(pkgName) !== fn) {
                if (exeOutput?.polluted /*&& exeOutput.sink === "null"*/) {
                  //if the fn is not exist in fnMap, then add it
                  //if (verbose) console.info("Detected: ", `${funcPath}(${exploitArgs.sig})`);
                  // if (!exeOutput.sink) {
                  //   modulePath = findFunctionPath(exeOutput.fnCode);
                  //   functionOffset = getFunctionOffset(exeOutput.fnCode, modulePath);
                  //   exeOutput.sink = sinkLineFinder(exeOutput.fnCode, functionOffset);
                  // }

                  // remove ${pkg.pkgPath} from the sink path in exeOutput.sink {setProp, setProto, readProp, readProto}
                  // const sink = new Map(
                  //   Array.from(exeOutput.sink).map(([key, value]) => {
                  //     return [key, value ? value.replace(`${pkg.pkgPath}/`, "").replace(`${funcPath}/`, "") : null];
                  //   })
                  // );
                  //const sink = Object.values(exeOutput.sink).join("") === "" ? "null" : exeOutput.sink;
                  //const sink =
                  //Object.values(exeOutput.sink).join("") === "" ? "null" : Object.values(exeOutput.sink).join(",");
                  const sink = exeOutput.sink;

                  const detection = {
                    entryPoint: funcPath,
                    inputCase: exeOutput.args,
                    sinkLocation: exeOutput.sink ?? null,
                    polluted: exeOutput?.polluted,
                    mode: "fixed",
                  };
                  const input = JSON.stringify(exeOutput.args);
                  const exploit = `${fn}#${input}`;
                  // add a map to store the detected sink locations, with the entry point as the key
                  //vectorMap.set(funcPath, exeOutput.sink);
                  if (pkg.options.multiVectors) {
                    vectorMap.set(fn, sink);
                    detectedSink.add(sink);
                    detectionArray.push(detection);
                    //} else if (!detectedSink.has(sink)) {
                    if (verbose) console.log(`${funcPath}(${input}) -> ${JSON.stringify(sink)}`);
                    if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                  } else if (vectorMap.get(fn) !== sink) {
                    vectorMap.set(fn, sink);
                    detectedSink.add(sink);
                    detectionArray.push(detection);
                    if (verbose) console.log(`${funcPath}(${exeOutput.hash}) -> ${JSON.stringify(sink)}`);
                    if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                  }
                  //if (exeOutput.sink && (exeOutput.sink.setProp || exeOutput.sink.setProto))
                  //  detectedSink.add(`${exeOutput.sink.setProto}-${exeOutput.sink.setProp}`);
                  //       vectorMap.set(exploit, exeOutput.sink || null);
                }
              });
            } catch (error) {
              console.info(error.message);
            }
          }

        // fnLoop: for (const fnObj of fnList) {
        //   //const fn = fnObj.replace(/\.cjs|\.esm/, "");
        //   //const fn = fnObj.replace(/\.\_m\_[^\_]+\_m\_/, "");
        //   const fn = fnObj.replace(/\.\_m\_[^\_]+\_m\_/, "").replace(".prototype.constructor", "");
        //   try {
        //     for (const [testFile, inputList] of testCasesMap) {
        //       const locatedFnOI = findCallOfInterest(inputList[2], inputList[1], pkgName, fn);
        //       if (locatedFnOI.size === 0) continue;
        //       //console.info(locatedFnOI)
        //       // check if the there is a test input for the function in the inputList map. The key is the function name (e.g., 'pkgMainFunc'). It may also be 'pkgMainFunc.fn1.fn2'
        //       if (locatedFnOI.has(fn)) {
        //         console.info(`Processing function: ${fn}`);
        //         const exploitCases = generateExploits(locatedFnOI.get(fn));
        //         const exploitInputs = Array.from(
        //           new Set(exploitCases.flatMap((inner) => inner.map(JSON.stringify)))
        //         ).map(JSON.parse);
        //         if (exploitCases.length > 0) {
        //           //for (let exploitInputs of exploitCases) {
        //           for (let exploitArgs of exploitInputs) {
        //             //console.info(exploitArgs);
        //             //console.info(`Executing function: ${fn} with inputs: ${exploitArgs}`);
        //             // check of exploitArgs is identically equal to: exploitArgs===['e30=', 'IntcIl9fcHJvdG9fX1wiOntcInBvbGx1dGVkS2V5XCI6XCJwb2xsdXRlZFZhbHVlXCJ9fSI=']
        //             // if (exploitArgs.length === 2 && exploitArgs[0] === 'e30=' && exploitArgs[1] === 'IntcIl9fcHJvdG9fX1wiOntcInBvbGx1dGVkS2V5XCI6XCJwb2xsdXRlZFZhbHVlXCJ9fSI=')
        //             cleanUpProto(newObjectProto);
        //             const exeOutput = fnExecute(
        //               fn,
        //               importedPkg,
        //               exploitArgs,
        //               { cleanUpProto, copyPrototypeChain, decodeStr, verify },
        //               vmExec
        //             );
        //             //exeOutput = await forkExe(packagePath, fn, exploitArgs);
        //             /*                                                     exeOutput = spawnSync('node',
        //                      ['../${projPath}/fuzzUtils/execFn.js', fn, packagePath, JSON.stringify(exploitArgs)],
        //                         { encoding: 'utf8', stdio: 'inherit' }); */
        //             if (nameSpaceObj && nameSpaceObj.length > 0)
        //               exeOutput = fnExecute(fn, nameSpaceObj, exploitArgs, globalObj, vmExec);
        //             // restore the original prototype chain
        //             cleanUpProto(newObjectProto);
        //             if (exeOutput?.polluted) {
        //               fnMap.set(pkgName, fn);
        //               // const sink = new Map(
        //               //   Array.from(exeOutput.sink).map(([key, value]) => {
        //               //     return [
        //               //       key,
        //               //       value ? value.replace(`${pkg.pkgPath}/`, "").replace(`${funcPath}/`, "") : null,
        //               //     ];
        //               //   })
        //               // );
        //               const sink = Object.values(exeOutput.sink).join("") === "" ? "null" : exeOutput.sink;
        //               const sink =
        //                 Object.values(exeOutput.sink).join("") === ""
        //                   ? "null"
        //                   : Object.values(exeOutput.sink).join(",");
        //               const detection = {
        //                 entryPoint: fnObj,
        //                 inputCase: exeOutput.args,
        //                 sinkLocation: sink ?? null,
        //                 polluted: exeOutput?.polluted,
        //                 mode: "pairwise",
        //                 testFile: testFile.replace(`${pkgPath}/node_modules/${pkg.package_name}`, ""),
        //               };
        //               const input = JSON.stringify(exeOutput.args);
        //               const exploit = `${fn}#${input}`;
        //               // add a map to store the detected sink locations, with the entry point as the key
        //               //vectorMap.set(funcPath, exeOutput.sink);
        //               if (pkg.options.multiVectors) {
        //                 vectorMap.set(fn, sink);
        //                 detectedSink.add(sink);
        //                 detectionArray.push(detection);
        //                 //} else if (!detectedSink.has(sink)) {
        //                 if (verbose) console.log(`${fn}(${input}) -> ${JSON.stringify(sink)}`);
        //                 if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
        //               } else if (vectorMap.get(fn) !== sink) {
        //                 vectorMap.set(fn, sink);
        //                 detectedSink.add(sink);
        //                 detectionArray.push(detection);
        //                 if (verbose) console.log(`${fn}(${input}) -> ${JSON.stringify(sink)}`);
        //                 if (sandbox) console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
        //               }
        //               //if (exeOutput.sink && (exeOutput.sink.setProp || exeOutput.sink.setProto))
        //               //  detectedSink.add(`${exeOutput.sink.setProto}-${exeOutput.sink.setProp}`);
        //               //       vectorMap.set(exploit, exeOutput.sink || null);
        //               // if (verbose) console.info(`${fn}(${input}) -> ${JSON.stringify(sink)}`);
        //               // if (sandbox) console.info(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);

        //               //continue fnLoop;
        //             }
        //           }
        //           //}
        //         }
        //       }
        //     }
        //   } catch (error) {
        //     console.error(error);
        //   }
        // }
      } catch (e) {
        console.error(e);
      }
      //remove duplicates
      // funcExploredNo =
      //   fnList.length > 0
      //     ? fnList.filter((obj, index, self) => index === self.findIndex((o) => o === obj)).length
      //     : 0;
      // resultsBuffer.unshift(funcExploredNo);
      // //resultsBuffer.unshift(fnList.join(','))
      // //resultsBuffer.unshift(testFiles.join(','))
      // resultsBuffer.unshift(loc);
    } // else console.info(`No functions to analyze`);
  } catch (error) {
    console.error(error);
  } finally {
    return detectionArray;
  }
  //return [require(pkgName), loc];
})()
  .then((results) => {
    //console.info(`lib: ${JSON.stringify(lib)}`)
    /*     importedPkg = args[0];
        importType = args[1];
        loc = args[2]; */
    //const testFiles = findTestFiles(pkgName, repo, argv[3])
    //if (verbose) console.info(JSON.stringify(results, null, 2));
    if (!sandbox) console.log(`<JSON-OUTPUT>${JSON.stringify(results)}</JSON-OUTPUT>`);
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
    //throw new Error(`Path segment "${segment}" does not exist.`, fnPath, context);
  }, context); // Split path by '.'

  // Ensure the resolved value is a function
  if (typeof fn !== "function") {
    //throw new Error(`Resolved path "${fnPath}" is not a function.`);
  }
  return fn;
}
function fnExecute(fnPath, context, args, aux, vmExec = false) {
  //let verbose = false;
  const { cleanUpProto, copyPrototypeChain, decodeStr, verify } = aux;
  const trackedProperty = "pollutedKey";
  let sinkLine;
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
    //someObj = proxingObj({})
    // Create a proxy to wrap the target function
    // const proxyFunction = new Proxy(fn, {
    //   apply: function (target, thisArg, argumentsList) {
    //     //console.info('Intercepted function call');
    //     // replace empty object in argumentsList with proxied object
    //     argumentsList = argumentsList.map((arg) => (arg === "{}" ? someObj : arg));
    //     return Reflect.apply(target, thisArg, argumentsList);
    //     //return target.call(undefined, ...argumentsList);
    //   },
    // });
    function withPropertyTrap(targetFunction) {
      return new Proxy(targetFunction, {
        apply(target, thisArg, argumentsList) {
          try {
            // Execute the target function with `emptyProxy` as the context
            const decodedArgs = decodeStr(argumentsList).map((arg) => (arg === "{}" ? someObj : arg));
            //argumentsList = argumentsList.map((arg) => (arg === "{}" ? someObj : arg));
            Reflect.apply(target, someObj, decodedArgs);
          } catch (error) {
            //console.error(error.message);
          }
        },
      });
    }
    const trappedFunction = withPropertyTrap(fn);
    const clonedChain = copyPrototypeChain(victim);
    try {
      //args = args.map(decodeStr);
      //console.info(JSON.stringify(args));
    } catch (error) {
      //console.error(error, args);
    }

    if (verbose && !vmExec) {
      //Reflect.apply(proxyFunction, someObj, args);
      try {
        trappedFunction(...args);
        //const decodedArgs = decodeStr(args).map((arg) => (arg === "{}" ? {} : arg));
        //fn(...decodedArgs);
      } catch (error) {
        //console.error(error);
      }
      //fn(...args);
      // reset the prototype chain and global object
      //const config = new context.constructor();
      //fn.prototype = null;
      //Reflect.apply(fn, null, args);
      // execute fn with args using new function
      //const result = new Function("fn", "args", "return fn(...args)")(fn, args);
      //const result = new Function("fn", "args", "return fn(args);")(fn, args);
    } else {
      //vmRun_old(trappedFunction, fn, args, someObj);
      sinkLine = vmRun(decodeStr, fn, args);
      //sinkLine = vmRun(decodeStr, fnPath, args, context);
      //isolateRun(trappedFunction, fn, args);
    }
    if (sinkLine)
      return {
        polluted: true,
        sink: sinkLine || "null",
        args: decodeStr(args).map((arg) => (arg === "{}" ? {} : arg)),
        hash: args.join(","),
        fnCode: fn,
      };

    /*         if (protoMonitor.sink2) {
                    return protoMonitor;
                } */
    // if monitorMap has a sink, return the sink
    // if (monitorMap.size > 0) {
    //   return {
    //     polluted: true,
    //     sink: monitorMap,
    //     args: args,
    //     fnCode: fn,
    //   };
    // }
    //
    const activeChain = Object.getPrototypeOf(victim);
    const propKey = verify(clonedChain, activeChain);
    // // check if our property added in a different format or structure (e.g., under an object)
    if (propKey && propKey.includes(trackedProperty)) {
      return {
        polluted: true,
        sink: protoMonitor,
        args: decodeStr(args).map((arg) => (arg === "{}" ? someObj : arg)),
        hash: args.join(","),
        fnCode: fn,
      };
    }
    // Check if the prototype chain has been modified "this needs manually validatation to the generated exploit"
    else if (unknownSideEffect && (propKey || pollutionFinder(victim, trackedProperty, true))) {
      //Reflect.deleteProperty(Object.prototype, trackedProperty)
      return {
        polluted: "unknown",
        sink: protoMonitor,
        args: decodeStr(args).map((arg) => (arg === "{}" ? someObj : arg)),
        hash: args.join(","),
        fnCode: fn,
      };
    }
    // check if setProp is modified. If neither of above are not triggered, this often means local change to the target (not prototype pollution)
    else if (protoMonitor.setProp && unknownSideEffect) {
      return {
        polluted: "local",
        sink: protoMonitor,
        args: decodeStr(args).map((arg) => (arg === "{}" ? someObj : arg)),
        hash: args.join(","),
        fnCode: fn,
      };
    }
    // Second round: check property Deletion
    // victim = {};
    // vmRun(trappedFunction, fn, args, "del");
    // //vmRun(inputCase, trappedFunction, "del");
    // if (protoMonitor.sink2) {
    //   return protoMonitor;
    // } else Reflect.deleteProperty(Object.prototype, "pollutedKey");
  } catch (e) {
    console.info(e, fn); // Handle any errors that occurred during execution, only turn on for debugging!
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-fixFuzzy-${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

function vmRun(decodeStr, fn, inputCase, importedPkg, action = "add", timeout = 100000) {
  const prop = "pollutedKey";
  // Create a sandbox context for executing the function
  const sandbox = {
    fn, // the function to test
    inputCase, // the input cases
    decodeStr,
    console,
    Error,
    //fnResolve,
    //importedPkg,
  };
  let context, code, script;
  try {
    // Create a new VM context
    context = vm.createContext(sandbox);
    if (action === "del") context.__proto__.pollutedKey = "PP";

    // Function to execute the test function in the sandbox
    //code = `const result = inputCase.call(null, proxyFunction);`;
    //code = ` proxyFunction(...inputCase); `
    vm.runInContext(
      `
        'use strict';
        Object.freeze(Object.prototype);
      `,
      context
    );
    const code = `
    'use strict';
    //const fn = fnResolve(fnPath, importedPkg);
    const decodedArgs = decodeStr(inputCase).map((arg) => (arg === "{}" ? {} : arg));
    Reflect.apply(${fn}, {}, decodedArgs);
    //fn(...inputCase); 
    `;

    // Create and run the script with a timeout
    try {
      vm.runInContext(code, context, { timeout: timeout, filename: "poc.js" }); // This enforces the timeout
    } catch (e) {
      const stackLines = e.stack.split("\n");
      const vmLine = stackLines[4].includes(`Cannot add property ${prop}, object is not extensible`);
      if (vmLine) {
        const sinkLine = stackLines[5].trim();
        if (sinkLine.search(/(\d+):(\d+)/)) {
          // const vulFn = sinkLine.match(/at\s([^\s]+)\s/)[1];
          // const [path, line, column] = sinkLine.match(/\(([^\)]+)\)/)[1].split(":");
          // console.log(`
          //   Entry.Fn: ${fn.name}, Vuln.Fn: ${vulFn}, inputs: (${inputCase.join(",")})
          //   at path: ${path}, line ${line}, column ${column}
          // `);
          return sinkLine;
        }
      }
    }
    /*         if (victim.pollutedKey && action !== 'del')
                    return victim.pollutedKey; */
    // The result is handled within the sandbox context
  } catch (e) {
    // Handle timeout or any other error
    //console.error("Error in VM execution:", e.message);
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-vmRun${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

function vmRun_old(proxyFunction, fn, inputCase, obj, action = "add", timeout = 100) {
  // Create a sandbox context for executing the function
  const sandbox = {
    fn, // the function to test
    inputCase, // the input cases
    proxyFunction,
    obj,
  };
  let context, code, script;
  try {
    // Create a new VM context
    context = vm.createContext(sandbox);
    if (action === "del") context.__proto__.pollutedKey = "PP";

    // Function to execute the test function in the sandbox
    //code = `const result = inputCase.call(null, proxyFunction);`;
    //code = ` proxyFunction(...inputCase); `
    const code = `const result = Reflect.apply(proxyFunction, obj, inputCase);`;

    // Create and run the script with a timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout: timeout }); // This enforces the timeout
    /*         if (victim.pollutedKey && action !== 'del')
                    return victim.pollutedKey; */
    // The result is handled within the sandbox context
  } catch (e) {
    // Handle timeout or any other error
    //console.info('error while running code in a vm context: ', e)
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-vmRun${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
}

// async function isolateRun(proxyFunction, fn, inputCase, action = "add", timeout = 100) {
//   // Create a new isolate with a memory limit of 128MB
//   const isolate = new ivm.Isolate({ memoryLimit: 128 });

//   // Create a new context within the isolate
//   const context = isolate.createContextSync();

//   // Define the global object template
//   const jail = context.global;
//   jail.setSync("global", jail.derefInto());

//   // Transfer the proxyFunction and fn into the isolate
//   jail.setSync("proxyFunction", new ivm.Reference(proxyFunction));
//   jail.setSync("fn", new ivm.Reference(fn));

//   // Prepare the code to execute within the isolate
//   const code = `
//     const result = Reflect.apply(global.proxyFunction, null, inputCase);
//   `;

//   // Compile the script
//   const script = isolate.compileScriptSync(code);

//   // Run the script within the context with a timeout
//   script.runSync(context, { timeout });
// }

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

function fnEnumSimple(lib, prefix, depth, globalNameObj = false) {
  const enumList = [];
  function recurse(lib, prefix, depth) {
    // if (!quiet && !sandbox) console.info(`[+] Component ${prefix}`);

    // If depth limit reached or object already explored, return
    if (depth == 0) return;
    /*         if (parsedObject.indexOf(lib) !== -1)
                  return; */

    // Mark the object as explored
    //parsedObject.push(lib);

    // Iterate over fNameerties of the object
    try {
      if (typeof lib === "function" && lib !== null) {
        let fnPath = lib.name !== "" && lib.name !== null && lib.name !== undefined ? `${prefix}.${lib.name}` : prefix;
        enumList.push(fnPath);
        if (Reflect.ownKeys(lib).length > 0 && lib.prototype !== undefined)
          recurse(lib.prototype, `${prefix}.prototype`, depth - 1);
      }
      // if globalNameObj is true, then the object is a global object, enumerate objectNameSpace's properties
      if (globalNameObj && Array.isArray(lib))
        for (const globalSObj of lib) {
          recurse(global[globalSObj], `${globalSObj}`, depth - 1);
        }
      // Enumerate imported namespace properties
      //for (const fName of Reflect.ownKeys(lib)) {
      else
        for (const fName in lib) {
          //for (let fName in lib) {
          if (fName == "abort" || fName == "__proto__" || +fName == fName || fName == "Skipped-Function") continue;
          const comp = lib[fName];
          // Handle the property as a function or object
          // Check if the property is an object to continue exploring
          if (typeof comp === "object" && comp !== null) {
            recurse(comp, `${prefix}.${fName}`, depth - 1);
          } else if (typeof comp === "function") {
            //Check if the function is a class, in this case, scan each method.
            if (isClass(comp)) {
              console.info(` [+] Class ${fName}`);
              const classMethods = comp.prototype;
              //console.info(` [-] Class ${prefix}.${fName}...`);
              try {
                for (const method of Reflect.ownKeys(classMethods)) {
                  if (typeof classMethods[method] === "function") {
                    const fnPath = `${prefix}.${fName}.${method}`;
                    console.info(`   [-] Method ${method}`);
                    enumList.push(fnPath);
                  }
                }
              } catch (error) {}
            } else {
              console.info(` [-] Function ${fName}`);
              const fnPath = `${prefix}.${fName}`;
              enumList.push(fnPath);
            }
          }
        }
    } catch (error) {}
  }
  recurse(lib, prefix, depth);
  return [...new Set(enumList)];
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

// supporting cjs,esm, and edge cases
async function loadPackage(pkgName, importModule, globalObj = false) {
  try {
    const path = await import("path");
    const { readFile } = await import("fs/promises");
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url); // Enable require in ESM
    const pkgPath = require.resolve(pkgName); // Resolve package main file
    // const pkgDir = path.dirname(pkgPath); // Get package directory
    const pkgDir = pkgPath.replace(new RegExp(`(${pkgName}).*`), "$1"); // Get package directory
    const pkgJsonPath = path.join(pkgDir, "package.json"); // Locate package.json

    // Read package.json
    const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));

    const results = {};

    // Track global variables **before** loading
    const globalBefore = new Set(Object.keys(global));

    // Helper function to execute module if it's a function
    const executeIfFunction = (mod) => (typeof mod === "function" ? mod() : mod);

    // Try ESM version (via "exports" or "module")
    if (pkgJson.exports?.import || pkgJson.module) {
      const esmPath = path.join(pkgDir, pkgJson.exports?.import || pkgJson.module);
      results.esm = await import(esmPath)
        .then(executeIfFunction)
        .catch(() => null);
    }

    // Try CJS version (via "exports" or "main")
    if (pkgJson.exports?.require || pkgJson.main) {
      const cjsPath = path.join(pkgDir, pkgJson.exports?.require || pkgJson.main);
      let mod = require(cjsPath);

      // Handle function-returning modules (e.g., `require('package')()`)
      if (typeof mod === "function") {
        mod = mod();
      }

      results.cjs = mod;
    }

    // Track global variables **after** loading
    const globalAfter = new Set(Object.keys(global));
    const newGlobals = [...globalAfter].filter((key) => !globalBefore.has(key));

    // Store any new global variables introduced by the package
    if (newGlobals.length && globalObj) {
      results.globalVars = newGlobals.reduce((acc, key) => {
        acc[key] = global[key]; // Store the global object reference
        return acc;
      }, {});
    }

    //    return results; // Return loaded modules + detected globals
    return await importModule(pkgName); // Return loaded modules
  } catch (err) {
    console.error(`Error loading ${pkgName}:`, err.message);
    return null;
  }
}

// Function to load all module versions (CJS & ESM), no require()() support
async function loadPackage1(pkgName) {
  //const { importGlobalNameSpace, importModule } = await import(`${projPath}/fuzzUtils/packageInit.js`);
  const path = await import("path");
  const { readFile } = await import("fs/promises");
  const { createRequire } = await import("module");
  let results = {};
  let require, pkgPath, pkgDir, pkgJsonPath, pkgJson;
  try {
    require = createRequire(import.meta.url); // Enable require in ESM
    pkgPath = require.resolve(pkgName); // Resolve package main file
    //const pkgDir = path.dirname(pkgPath); // Get package directory
    pkgDir = pkgPath.replace(new RegExp(`(${pkgName}).*`), "$1"); // Get package directory
    pkgJsonPath = path.join(pkgDir, "package.json"); // Locate package.json

    // Read package.json
    pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
    // Try ESM version (via "exports" or "module")
    if (pkgJson.exports?.import || pkgJson.module) {
      const esmPath = path.join(pkgDir, pkgJson.exports?.import || pkgJson.module);
      results.esm = await import(esmPath).catch(() => null);
    }

    // Try CJS version (via "exports" or "main")
    if (pkgJson.exports?.require || pkgJson.main) {
      const cjsPath = path.join(pkgDir, pkgJson.exports?.require || pkgJson.main);
      results.cjs = require(cjsPath);
    }
    if (Object.keys(results).length == 0) {
      results = await importModule3(pkgName); // Return loaded modules
      //console.log("results", results);
    }
  } catch (err) {
    // manually require the files
    let originalDir, originalNodePath;
    try {
      // Get the path to the module's directory
      originalDir = process.cwd();
      originalNodePath = process.env.NODE_PATH || "";
      process.chdir(pkg.pkgPath);
      process.env.NODE_PATH = path.resolve(pkg.pkgPath, "node_modules") + path.delimiter + originalNodePath;
      require("module").Module._initPaths();
      const index = path.basename(pkgPath);
      const moduleDir = path.dirname(pkgPath);

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
      throw new Error("Error importing module");
    } finally {
      process.chdir(originalDir);
      process.env.NODE_PATH = originalNodePath; // Restore original NODE_PATH
    }
    //console.error(`Error loading ${pkgName}:`, err.message);
  }
  return results;
}

async function loadPackage2(pkgDir) {
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
      if (fs.existsSync(fullPath) && !parsedModule.has(fullPath) && !excludeSet.has(fullPath.split(".").pop())) {
        results[`_m_${uniqueKey}_m_`] =
          //key === "cjs" || key === "js" ? require(fullPath) : await import(fullPath).catch(() => null);
          await importModule3(fullPath, require).catch(() => ({}));
        parsedModule.add(fullPath);
      }
    };

    // Check standard module fields
    // if pkgJson and any property with a key in importKeys
    if (Object.keys(pkgJson).some((key) => importKeys.has(key))) {
      for (const key of importKeys) {
        if (pkgJson[key] && typeof pkgJson[key] === "string") {
          await checkAndAdd(pkgJson[key]);
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
          await checkAndAdd(value);
        } else if (typeof value === "object") {
          if ("default" in value) {
            await checkAndAdd(value.default);
          }
          if ("import" in value) {
            if (typeof value.import === "string") {
              await checkAndAdd(value.import);
            } else if (typeof value.import === "object") {
              await checkAndAdd(value.import.default);
              //results[`${key}.import.types`] = value.import.types || null;
            }
          }
          if ("require" in value) {
            if (typeof value.require === "string") {
              //await checkAndAdd(`${key}.require`, value.require);
              await checkAndAdd(value.require);
            } else if (typeof value.require === "object") {
              //await checkAndAdd(`${key}.require.default`, value.require.default);
              await checkAndAdd(value.require.default);
              //results[`${key}.require.types`] = value.require.types || null;
            }
          }
        }
      }
    }

    // Handle edge cases: direct require calls
    if (Object.keys(results).length === 0 || Object.keys(results)[0] === undefined) {
      results = await importModule3(pkgMainPath, require).catch(() => ({}));
    }
  } catch (err) {
    console.error(`Error loading ${pkgName}:`, err.message);
  }

  return results;
}

// Function to load all module versions (CJS & ESM, ES2015), no require()() support
async function loadPackage3(pkgName) {
  //const { importGlobalNameSpace, importModule } = await import(`${projPath}/fuzzUtils/packageInit.js`);
  const path = await import("path");
  const { readFile } = await import("fs/promises");
  const { createRequire } = await import("module");
  let results = {};
  let require, pkgPath, pkgDir, pkgJsonPath, pkgJson;
  try {
    require = createRequire(import.meta.url); // Enable require in ESM
    pkgPath = require.resolve(pkgName); // Resolve package main file
    //const pkgDir = path.dirname(pkgPath); // Get package directory
    pkgDir = pkgPath.replace(new RegExp(`(${pkgName}).*`), "$1"); // Get package directory
    pkgJsonPath = path.join(pkgDir, "package.json"); // Locate package.json

    // Read package.json
    pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
    // Try ESM version (via "exports" or "module")
    if (pkgJson.exports?.import || pkgJson.module) {
      const esmPath = path.join(pkgDir, pkgJson.exports?.import || pkgJson.module || pkgJson["jsnext:main"]);
      results.esm = await import(esmPath).catch(() => null);
    }
    if (pkgJson["jsnext:main"]) {
      const es6Path = path.join(pkgDir, pkgJson["jsnext:main"]);
      results.es6 = await import(es6Path).catch(() => null);
    }
    // Try CJS version (via "exports" or "main")
    if (pkgJson.exports?.require || pkgJson.main) {
      const cjsPath = path.join(pkgDir, pkgJson.exports?.require || pkgJson.main);
      results.cjs = require(cjsPath);
    }
    if (Object.keys(results).length == 0) {
      results = await importModule3(pkgName); // Return loaded modules
      //console.log("results", results);
    }
  } catch (err) {
    // manually require the files
    let originalDir, originalNodePath;
    try {
      // Get the path to the module's directory
      originalDir = process.cwd();
      originalNodePath = process.env.NODE_PATH || "";
      process.chdir(pkg.pkgPath);
      process.env.NODE_PATH = path.resolve(pkg.pkgPath, "node_modules") + path.delimiter + originalNodePath;
      require("module").Module._initPaths();
      const index = path.basename(pkgPath);
      const moduleDir = path.dirname(pkgPath);

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
      throw new Error("Error importing module");
    } finally {
      process.chdir(originalDir);
      process.env.NODE_PATH = originalNodePath; // Restore original NODE_PATH
    }
    //console.error(`Error loading ${pkgName}:`, err.message);
  }
  return results;
}

// Function to load all module versions (CJS & ESM), no global object support
async function loadPackage4(pkgName, importModule) {
  const path = await import("path");
  const { readFile } = await import("fs/promises");
  const { createRequire } = await import("module");
  try {
    const require = createRequire(import.meta.url); // Enable require in ESM
    const pkgPath = require.resolve(pkgName); // Resolve package main file
    // const pkgDir = path.dirname(pkgPath); // Get package directory
    const pkgDir = pkgPath.replace(new RegExp(`(${pkgName}).*`), "$1"); // Get package directory
    const pkgJsonPath = path.join(pkgDir, "package.json"); // Locate package.json

    // Read package.json
    const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));

    const results = {};

    // Helper function to handle modules that return a function
    const executeIfFunction = (mod) => (typeof mod === "function" ? mod() : mod);

    // Try ESM version (via "exports" or "module")
    if (pkgJson.exports?.import || pkgJson.module) {
      const esmPath = path.join(pkgDir, pkgJson.exports?.import || pkgJson.module);
      results.esm = await import(esmPath)
        .then(executeIfFunction)
        .catch(() => null);
    }

    // Try CJS version (via "exports" or "main")
    if (pkgJson.exports?.require || pkgJson.main) {
      const cjsPath = path.join(pkgDir, pkgJson.exports?.require || pkgJson.main);
      results.cjs = executeIfFunction(require(cjsPath));
    }

    return await importModule(pkgName); // Return loaded modules
  } catch (err) {
    console.error(`Error loading ${pkgName}:`, err.message);
    return null;
  }
}

async function importModule3(moduleName, require) {
  // const { createRequire } = await import("module");
  // const originalDir = process.cwd();
  // const originalNodePath = process.env.NODE_PATH || "";
  // process.chdir(pkgPath);
  // const originalPath = originalNodePath ? path.delimiter + originalNodePath : "";
  // process.env.NODE_PATH = path.resolve(pkgPath, "node_modules") + originalPath;
  // //const require = createRequire(import.meta.url); // Enable require in ESM
  // //const require = createRequire(moduleName);
  // //pkgMainPath = require.resolve(moduleName); // Resolve package main file
  // require("module").Module._initPaths();
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
