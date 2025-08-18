const process = require("process");
const path = require("path");
const fs = require("fs");
//const exec = require('child_process');
var BAD_JSON = {};
var someObj = {};
var parsedObject = [];
var protoList = [];
//var funcBuffer = [];
var protoMonitor = {};
//process.on("uncaughtException", function (err) {});
var pattern = [
  {
    fnct: function (totest) {
      totest(BAD_JSON);
    },
    sig: "function (BAD_JSON)",
  },
  {
    fnct: function (totest) {
      totest(BAD_JSON, someObj);
    },
    sig: "function (BAD_JSON, someObj)",
  },
  {
    fnct: function (totest) {
      totest(someObj, BAD_JSON);
    },
    sig: "function (someObj, BAD_JSON)",
  },
  {
    fnct: function (totest) {
      totest(BAD_JSON, BAD_JSON);
    },
    sig: "function (BAD_JSON, BAD_JSON)",
  },
  {
    fnct: function (totest) {
      totest(someObj, someObj, BAD_JSON);
    },
    sig: "function (someObj, someObj, BAD_JSON)",
  },
  {
    fnct: function (totest) {
      totest(someObj, someObj, someObj, BAD_JSON);
    },
    sig: "function (someObj, someObj, someObj, BAD_JSON)",
  },
  {
    fnct: function (totest) {
      totest(someObj, "__proto__.test", "123");
    },
    sig: "function (someObj, BAD_PATH, VALUE)",
  },
  {
    fnct: function (totest) {
      totest(someObj, "__proto__[test]", "123");
    },
    sig: "function (someObj, BAD_PATH, VALUE)",
  },
  {
    fnct: function (totest) {
      totest("__proto__.test", "123");
    },
    sig: "function (BAD_PATH, VALUE)",
  },
  {
    fnct: function (totest) {
      totest("__proto__[test]", "123");
    },
    sig: "function (BAD_PATH, VALUE)",
  },
  {
    fnct: function (totest) {
      totest(someObj, "__proto__", "test", "123");
    },
    sig: "function (someObj, BAD_STRING, BAD_STRING, VALUE)",
  },
  {
    fnct: function (totest) {
      totest("__proto__", "test", "123");
    },
    sig: "function (BAD_STRING, BAD_STRING, VALUE)",
  },
];

//console.log('pkg: ' + process.argv[2]);
//exec.execSync('ls -la ', { stdio: 'inherit', encoding: 'utf-8' });
// const argv = JSON.parse(process.argv[2]);
// const pkgName = argv[0].replace(/^\.\//, "");
// const pkgLogName = argv[0].replace(/^\.\/|\//, "-");
// const depth = 5; // recursive exploration depth
// const quiet = !argv[1] || argv[1].dryRun ? false : "quiet";
// const sandbox = !argv[1] ? false : argv[1].sandbox;
let pkg = {};
if (process.argv[2]) {
  pkg = JSON.parse(process.argv[2]);
} else {
  pkg = {
    // package_name: "lodash",
    // version: "4.17.4",
    // pkgPath: "/home/tariq/benchmark/arteau-15/lodash-4.17.4",
    package_name: "putil-merge",
    version: "3.0.0",
    pkgPath: "/data/benchmark/ss-100/putil_merge-3.0.0",
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

try {
  process.chdir(pkg.pkgPath);
  process.env.NODE_PATH = path.resolve(pkg.pkgPath, "node_modules") + path.delimiter + originalNodePath;
  require("module").Module._initPaths(); // Reinitialize module paths

  const lib = require(pkgName);
  exploreLib(lib, pkgName, depth);
} finally {
  process.chdir(originalDir);
  process.env.NODE_PATH = originalNodePath; // Restore original NODE_PATH
}

// (async () => {
//   //let loc = 0;
//   //if (fs.existsSync("./cloc.txt")) loc = JSON.parse(fs.readFileSync("./cloc.txt", { encoding: "utf8" })).SUM["code"];
//   //console.log(`pkgName: ${pkgName}`)
//   return require(pkgName);
//   //return await import(pkgName);
// })()
//   .then((lib) => {
//     //console.log(`lib: ${JSON.stringify(lib)}`)
//     exploreLib(lib, pkgName, 5);
//     // funcExploredNo =
//     //   funcBuffer.length > 0
//     //     ? funcBuffer.filter((obj, index, self) => index === self.findIndex((o) => o === obj)).length
//     //     : 0;
//     // protoList.unshift(funcExploredNo);
//     //protoList.unshift(funcBuffer.join(','))
//     //protoList.unshift(testFiles.join(','))
//     //protoList.unshift(lib);
//     if (protoList.length > 0) {
//       if (!quiet && !sandbox) console.log(JSON.stringify(protoList, null, 2));
//       else console.log(`<JSON-OUTPUT>${JSON.stringify(protoList)}</JSON-OUTPUT>`);
//     }
//   })
//   .catch((e) => {
//     if (protoList.length > 0) {
//       //var poc = generatePoc(protoList, pkgName)
//       var output = quiet ? protoList.join(",") : JSON.stringify(protoList, null, 2);
//       console.log(`${output}`);
//     }
//     if (!quiet) console.error(e);
//     //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-${process.pid}.log`, e, { encoding: 'utf8' })
//     //process.exit(1);
//   });

function verify() {
  var victim = {};
  if (victim.test == 123 || victim.test == "123") {
    //Reflect.deleteProperty(Object.prototype, "test");
    delete Object.prototype.test;
    return true;
  }
  return false;
}

function run(fnct, sig, name, totest) {
  // Reinitialize to avoid issue if the previous function changed attributes.
  BAD_JSON = JSON.parse('{"__proto__":{"test":"123"}}');
  //BAD_JSON = JSON.parse('{"__proto__":{}}');
  //run(pattern[p].fnct, pattern[p].sig, prefix + "." + k, lib[k]);
  try {
    //trackedFn = proxy(totest);
    // var protoMonitor = { setProto: null, setProp: null };
    // const trackedProperty = "test";
    // someObj = {};
    // Object.setPrototypeOf(
    //   someObj,
    //   new Proxy(Object.prototype, {
    //     // get(obj, prop, receiver) {
    //     //     if (prop === '__proto__') {
    //     //         //throw new Error(`Access to property ${trackedProperty} detected`);
    //     //         //throw new Error('accessed');
    //     //         const error1 = new Error();
    //     //         const stackLines1 = error1.stack.split("\n");
    //     //         //protoMonitor.protoType = true;
    //     //         protoMonitor.sink1 = stackLines1[2].trim();
    //     //     } /* else if (prop === trackedProperty) {
    //     //         //throw new Error(`Access to property ${trackedProperty} detected`);
    //     //         //throw new Error('accessed');
    //     //         const error2 = new Error();
    //     //         const stackLines2 = error2.stack.split("\n");
    //     //         //protoMonitor.protoType = true;
    //     //         protoMonitor.sink2 = stackLines2[2].trim();
    //     //     } */
    //     //     return Reflect.get(obj, prop, receiver);
    //     // },
    //     set(obj, prop, value, receiver) {
    //       if (prop === "__proto__") {
    //         //throw new Error(`Access to property ${trackedProperty} detected`);
    //         //throw new Error('accessed');
    //         const error = new Error();
    //         const stackLines = error.stack.split("\n");
    //         //protoMonitor.protoType = true;
    //         protoMonitor.setProto = stackLines[2].trim();
    //       } else if (prop === trackedProperty) {
    //         //throw new Error(`Modification of property ${trackedProperty} detected`);
    //         //throw new Error('modify');
    //         //protoMonitor.pollutedProp = true;
    //         const error = new Error();
    //         const stackLines = error.stack.split("\n");
    //         protoMonitor.setProp = stackLines[2].trim();
    //       }
    //       return Reflect.set(obj, prop, value, receiver);
    //     },
    //     // has(obj, prop) {
    //     //     if (prop === trackedProperty) {
    //     //         //throw new Error(`Access to property ${trackedProperty} detected`);
    //     //         //throw new Error('accessed');
    //     //     }
    //     //     return Reflect.has(obj, prop);
    //     // }
    //   })
    // );
    // function withPropertyTrap(targetFunction) {
    //   return new Proxy(targetFunction, {
    //     apply(target, thisArg, argumentsList) {
    //       try {
    //         // Execute the target function with `emptyProxy` as the context
    //         Reflect.apply(target, someObj, argumentsList);
    //       } catch (error) {}
    //     },
    //   });
    // }
    // const trackedFn = withPropertyTrap(totest);
    //fnct(trackedFn);
    fnct(totest);
  } catch (e) {
    //console.log(e);
  }

  if (verify()) {
    var poc_func = sig.replace("function", name);
    const results = { polluted: true, entryPoint: name, exploit: poc_func, sink: protoMonitor };
    console.log(`<DETECTION>${JSON.stringify(results)}</DETECTION>`);
  }
  return false;
}

function exploreLib(lib, prefix, depth) {
  if (depth == 0) return;
  if (parsedObject.indexOf(lib) !== -1) return;

  parsedObject.push(lib);

  for (var k in lib) {
    if (k == "abort") continue;
    if (k == "__proto__") continue;
    if (+k == k) continue;

    console.log(k);

    if (lib.hasOwnProperty(k)) {
      for (p in pattern) {
        if (pattern.hasOwnProperty(p)) {
          run(pattern[p].fnct, pattern[p].sig, prefix + "." + k, lib[k]);
        }
      }

      exploreLib(lib[k], prefix + "." + k, depth - 1);
    }
  }

  if (typeof lib == "function") {
    for (p in pattern) {
      if (pattern.hasOwnProperty(p)) {
        run(pattern[p].fnct, pattern[p].sig, pkgName, lib);
      }
    }
  }
}

/*function check() {
    if ({}.test == "123" || {}.test == 123) {
        delete Object.prototype.test;
        return true;
    }
    return false;
}

function run(fnct, sig, name, totest) {
    // Reinitialize to avoid issue if the previous function changed attributes.
    BAD_JSON = JSON.parse('{"__proto__":{"test":123}}');

    try {
        fnct(totest);
    } catch (e) { }

    if (check()) {
        return name + " (" + sig + ")";
    }
} */
