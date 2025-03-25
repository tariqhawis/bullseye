//const esprima = require('esprima');
const { parse } = require("acorn");
const walk = require("acorn-walk");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { glob } = require("glob");
const os = require("os");
const { randomUUID } = require("crypto");
// Variable map to track variables and their resolved values
const variableMap = new Map();
//const argsMap = new Map();
var pkgVar;

function handleVariableDeclaration(node) {
  switch (node.kind) {
    case "var":
    case "let":
    case "const":
      node.declarations.forEach((declaration) => {
        if (declaration.id.type === "Identifier") {
          // Simple variable declaration
          console.log(`Variable declared: ${declaration.id.name}`);
        } else if (declaration.id.type === "ObjectPattern") {
          // Destructuring an object
          declaration.id.properties.forEach((prop) => {
            console.log(`Object property declared: ${prop.key.name}`);
          });
        } else if (declaration.id.type === "ArrayPattern") {
          // Destructuring an array
          declaration.id.elements.forEach((elem, index) => {
            if (elem && elem.type === "Identifier") {
              console.log(`Array element declared: ${elem.name} at index ${index}`);
            }
          });
        }
      });
      break;

    case "require":
      // Handle CommonJS require syntax
      if (node.callee.name === "require") {
        if (node.arguments.length === 1 && node.arguments[0].type === "Literal") {
          console.log(`Module required: ${node.arguments[0].value}`);
        }
      }
      break;

    case "import":
      // Handle ES module import statements
      if (node.specifiers) {
        node.specifiers.forEach((specifier) => {
          switch (specifier.type) {
            case "ImportDefaultSpecifier":
              console.log(`Default import: ${specifier.local.name}`);
              break;
            case "ImportSpecifier":
              console.log(`Named import: ${specifier.imported.name}`);
              break;
            case "ImportNamespaceSpecifier":
              console.log(`Namespace import: ${specifier.local.name}`);
              break;
          }
        });
      }
      console.log(`Module imported from: ${node.source.value}`);
      break;

    default:
      console.warn(`Unhandled declaration type: ${node.kind}`);
  }
}

function processNode(pkg, ast, fn) {
  let argsMap = {};
  const excludeFn = ["require", "describe", "it", "test", "beforeEach", "afterEach", "beforeAll", "afterAll", "expect"];
  const excludeTestPackages = [
    "mocha",
    "jest",
    "jasmine",
    "chai",
    "sinon",
    "ava",
    "tape",
    "qunit",
    "mocha",
    "jest",
    "jasmine",
    "chai",
    "sinon",
    "ava",
    "tape",
    "qunit",
  ];
  const fName = fn.includes(".") ? fn.split(".").pop() : fn;
  var modifiedFn = fn;
  var recorder = [];
  //var fName = fn;
  try {
    walk.ancestor(ast, {
      ImportDeclaration(node) {
        // Handle import declarations
        //if (node.source.value === pkg) {
        if (node?.specifiers.length > 0) {
          node.specifiers.forEach((specifier) => {
            if (specifier.type === "ImportDefaultSpecifier" || specifier.type === "ImportSpecifier") {
              if (pkg.includes(specifier.local.name)) pkgVar = specifier.local.name;
            }
          });
        }
      },
      VariableDeclaration(node) {
        // all possible require's argument values to require packages in test files (e.g., package name, relative path, etc.)
        const requireArgs = [pkg, `./${pkg}`, `../${pkg}`, `../`, `./`, `..`, `./index.js`, `../index.js`];
        // Handle variable declarations
        node.declarations.forEach((declaration) => {
          // store the variable is assigned to a require function and the argument is the package name or a relative path
          // 1. for require('packageName') type
          if (
            (declaration.init &&
              declaration.init?.callee?.name === "require" &&
              declaration.init?.arguments[0].type === "Literal" &&
              requireArgs.some((ra) => ra === declaration.init?.arguments[0].value)) ||
            (declaration.init?.callee?.object?.callee?.name === "require" &&
              declaration.init?.callee?.object?.arguments[0].type === "Literal" &&
              requireArgs.some((ra) => ra === declaration.init?.callee?.object?.arguments[0].value))
          ) {
            // store the variable name
            // 1. for identifier type
            if (declaration.id?.type === "Identifier") {
              pkgVar = declaration.id.name;
            }
            // 2. for object pattern type (e.g., const { var } = require('packageName'))
            else if (declaration.id.type === "ObjectPattern") {
              declaration.id.properties.forEach((prop) => {
                pkgVar = prop.value.name; // no need to store all args in test file
              });
            }
          } else if (declaration.init && declaration.init.type === "Identifier") {
            const name = declaration.id.name;
            const value = parseArgumentValue(declaration.init, variableMap);
            variableMap.set(name, value); // Add or update variable in the map
          }
          // replace the first string of the given function (e.g., assign-deap.set()) with the pkgVar value
          modifiedFn = fn.replace(fn.split(".")[0], pkgVar);
        });
      },
      AssignmentExpression(node) {
        // Handle assignments to variables
        if (node.left.type === "Identifier") {
          const name = node.left.name;
          const value = parseArgumentValue(node.right, variableMap);
          variableMap.set(name, value); // Update the variable in the map
        } else if (node.left.type === "MemberExpression") {
          // Handle assignments to object properties, e.g., obj.prop = value;
          const objectName = resolveMemberExpression(node.left, variableMap);
          const value = parseArgumentValue(node.right, variableMap);
          if (objectName && typeof objectName === "object") {
            objectName[node.left.property.name] = value;
          }
        }
      } /* ,
      // a member expression walk to find the object's identifier name of a callee, its literal arguments, and the property names
      MemberExpression(node, ancestors) {
        let objArg, varId;
        // check that the type is call expression (AAA().BBB)
        if (node.object && node.object.type === 'CallExpression' && node.object.callee.name === 'require') {
          if (node.property.type === 'Identifier') {
            node.object.arguments.forEach(arg => { //record all literal arguments
              if (arg.type === 'Literal')
                objArg = arg.value;
            });
            // record the variableDeclaration's id's name, the object's identifier name, the literal arguments, and the property names to be processed in variableDeclaration function
            ancestors.forEach(ancestor => {
              if (ancestor.type === 'VariableDeclaration') {
                varId = ancestor.declarations[0].id.name;
              }
            });
            recorder.push({ varId: varId, object: node.object.callee.name, arguments: objArg, property: node.property.name });
          }
        }
      } */,
      CallExpression(node, ancestors) {
        // Helper function to get the full function path
        function getFullFunctionPath(node) {
          if (node.type === "MemberExpression") {
            return getFullFunctionPath(node.object) + "." + node.property.name;
          } else if (node.type === "Identifier") {
            return node.name;
          }
          return "";
        }
        // handle function call under nested function call

        // Check if the function is a target function
        //if (node.callee.name !== undefined && !excludeFn.includes(node.callee.name))
        // if a function with the name 'unflatten' is called, print the name
        if (
          (node.callee.type === "Identifier" && (fName === node.callee.name || modifiedFn === node.callee.name)) ||
          (node.callee.type === "MemberExpression" && fName === node.callee.property.name)
        ) {
          //console.log(tstFile, ancestors)
          const fullPath = getFullFunctionPath(node.callee);
          let args;
          if (fullPath === fn || fullPath === fName || fullPath === modifiedFn) {
            // Resolve arguments for target function calls
            args = node.arguments.map((arg) => parseArgumentValue(arg, variableMap));
            //const functionName = node.callee.type === 'Identifier' ? node.callee.name : node.callee.property.name;
            // Append result in the required output format
            //argsMap.set(functionName, args);
            argsMap[fn] = argsMap[fn] || [];
            argsMap[fn].push(args);
          }
          // Break the traversal by throwing an exception
          //throw new Error('Target function found');
        }
      },
    });
    return argsMap;
  } catch (e) {
    /* if (e.message !== 'Target function found') {
      throw e; // Rethrow if it's not our break signal
    } */
    console.log(e.message);
  }
}

/**
 * Analyzes variable declarations and associates them with their modules.
 * @param {string} code - The JavaScript code to analyze.
 * @returns {Array<Object>} - Array of objects with variable and module associations.
 */
function processNode2(pkg, code) {
  const ast = parse(code, { sourceType: "module", ecmaVersion: 2020 });
  const includedPkg = [];
  const variableMap = new Map();
  let argsMap = {};
  const includeArgs = (arg) =>
    [pkg, `./${pkg}`, `../${pkg}`, `../`, `./`, `..`, `./index.js`, `../index.js`].some((ra) => ra === arg);
  // List of test suite functions
  const excludeFn = ["require", "describe", "it", "test", "beforeEach", "afterEach", "beforeAll", "afterAll", "expect"];

  const fnOfInterest = (fn, obj) => obj.some((o) => o.var === fn);
  const functionCalls = [];

  try {
    walk.simple(ast, {
      VariableDeclaration(node) {
        node.declarations.forEach((declaration) => {
          let moduleName,
            varName = [];
          if (
            declaration.init &&
            declaration.init.type === "CallExpression" &&
            declaration.init.callee.name === "require"
          ) {
            // CommonJS `require` statements
            moduleName = declaration.init.arguments[0]?.value;
            varName = declaration.id.name;
            if (declaration.id.type === "Identifier") {
              //includedPkg.push({ var: declaration.id.name, module: moduleName });
            } else if (declaration.id.type === "ObjectPattern") {
              declaration.id.properties.forEach((prop) => {
                //includedPkg.push({ var: prop.key.name, module: moduleName });
              });
            }
          } else if (
            declaration.init &&
            declaration.init.type === "MemberExpression" &&
            declaration.init.object.type === "CallExpression" &&
            declaration.init.object.callee.name === "require"
          ) {
            // Handle `require('module').function` cases
            moduleName = declaration.init.object.arguments[0]?.value;
            if (declaration.id.type === "Identifier") {
              varName = declaration.id.name;
              //includedPkg.push({ var: declaration.id.name, module: moduleName });
            } else if (declaration.id.type === "ObjectPattern") {
              declaration.id.properties.forEach((prop) => {
                varName.push(prop.key.name);
                //includedPkg.push({ var: prop.key.name, module: moduleName });
              });
            }
          } else if (
            declaration.init &&
            declaration.init.type === "CallExpression" &&
            declaration.init.callee.type === "MemberExpression" &&
            declaration.init.callee.object.type === "CallExpression" &&
            declaration.init.callee.object.callee.name === "require"
          ) {
            // Handle `require('module')()` cases
            moduleName = declaration.init.callee.object.arguments[0]?.value;
            if (declaration.id.type === "Identifier") {
              varName = declaration.id.name;
              //includedPkg.push({ var: declaration.id.name, module: moduleName });
            } else if (declaration.id.type === "ObjectPattern") {
              declaration.id.properties.forEach((prop) => {
                varName.push(prop.key.name);
                //includedPkg.push({ var: prop.key.name, module: moduleName });
              });
            }
          } else if (declaration.init) {
            const name = declaration.id.name;
            const value = parseArgumentValue(declaration.init, variableMap);
            variableMap.set(name, value); // Add or update variable in the map
          }

          if (includeArgs(moduleName)) includedPkg.push({ var: varName, module: moduleName });
        });
      },
      ImportDeclaration(node) {
        // ES Module `import` statements
        const moduleName = node.source.value;
        let varName = [];
        node.specifiers.forEach((specifier) => {
          varName.push(specifier.local.name);
          //includedPkg.push({ var: variableName, module: moduleName });
        });
        if (includeArgs(moduleName)) includedPkg.push({ var: varName, module: moduleName });
      },
      CallExpression(node, ancestors) {
        let args = [];
        // Helper function to get the full function path
        function getFullFunctionPath(node) {
          if (node.type === "MemberExpression") {
            return getFullFunctionPath(node.object) + "." + node.property.name;
          } else if (node.type === "Identifier") {
            return node.name;
          }
          return "";
        }
        // exclude require calls
        if (node.callee.name !== "require")
          if (node.callee.type === "Identifier") {
            // Direct function call
            const fnName = node.callee.name;
            if (!excludeFn.includes(fnName) && fnOfInterest(fnName, includedPkg)) {
              args = node.arguments.map((arg) => parseArgumentValue(arg, variableMap));
              argsMap[fnName] = argsMap[fnName] || [];
              argsMap[fnName].push(args);
            }
          } else if (node.callee.type === "MemberExpression") {
            // Method call
            const objectName = node.callee.object.name;
            const propertyName = node.callee.property.name;

            // Exclude test suite methods (e.g., `test.only`, `describe.skip`)
            if (
              !excludeFn.includes(objectName) &&
              !excludeFn.includes(propertyName) &&
              fnOfInterest(objectName, includedPkg)
            ) {
              const fnName = `${objectName}.${propertyName}`;
              args = node.arguments.map((arg) => parseArgumentValue(arg, variableMap));
              argsMap[fnName] = argsMap[fnName] || [];
              argsMap[fnName].push(args);
            }
          }
      },
      AssignmentExpression(node) {
        // Handle assignments to variables
        if (node.left.type === "Identifier") {
          const name = node.left.name;
          const value = parseArgumentValue(node.right, variableMap);
          variableMap.set(name, value); // Update the variable in the map
        } else if (node.left.type === "MemberExpression") {
          // Handle assignments to object properties, e.g., obj.prop = value;
          const objectName = resolveMemberExpression(node.left, variableMap);
          const value = parseArgumentValue(node.right, variableMap);
          if (objectName && typeof objectName === "object") {
            objectName[node.left.property.name] = value;
          }
        }
      },
    });
  } catch (error) {
    console.log(error);
  }

  return argsMap;
}

// processESNode function to process ES6 code

// Helper function to resolve member expressions
function resolveMemberExpression(expression, variableMap) {
  if (expression.type === "Identifier") {
    return variableMap.get(expression.name);
  } else if (expression.type === "MemberExpression") {
    const object = resolveMemberExpression(expression.object, variableMap);
    return object && typeof object === "object" ? object[expression.property.name] : undefined;
  }
  return undefined;
}

// Helper function to parse argument values
function parseArgumentValue(argument) {
  switch (argument?.type) {
    case "Literal":
      return argument.value;
    case "Identifier":
      return variableMap.has(argument.name)
        ? variableMap.get(argument.name)
        : `<Unresolved Identifier: ${argument.name}>`;
    case "ObjectExpression":
      return argument.properties.reduce((obj, prop) => {
        obj[prop.key.name || prop.key.value] = parseArgumentValue(prop.value, variableMap);
        return obj;
      }, {});
    case "ArrayExpression":
      return argument.elements.map((el) => parseArgumentValue(el, variableMap));
    case "ThisExpression":
      return variableMap.has("this") ? variableMap.get("this") : `<Unresolved ThisExpression>`;
    case "MemberExpression":
      return resolveMemberExpression(argument, variableMap);
    case "BinaryExpression":
    case "LogicalExpression":
      // Handle expressions but return as unresolved for now
      return `<Unresolved ${argument?.type}>`;
    default:
      return `<Unsupported ${argument?.type}>`;
  }
}

// Helper function to resolve nested function calls
function resolveFunctionCall(node, variables) {
  const functionName =
    node.callee.type === "Identifier"
      ? node.callee.name
      : node.callee.type === "MemberExpression"
      ? node.callee.property.name
      : "<AnonymousFunction>";
  const args = node.arguments.map((arg) => resolveArgument(arg, variables));
  return `<FunctionCall: ${functionName}(${args.join(", ")})>`;
}

// Walk the AST to build variable map and capture function calls
function main(testFiles) {
  //const testFiles = findTestFiles(pkg, repoUrl)
  let callsMap = [],
    testFile = {};
  try {
    for (const tstFile of testFiles) {
      testFile = tstFile;
      var tFile = tstFile.match(/([^\/]+)$/)[0];
      //console.log(`   [-]Parsing test file: ${tf.replace(/[^\/]+\/[^\/]+\//, '')}`)
      //const code = fs.readFileSync(`${testFiles[0]}/${tf}`, { encoding: 'utf8' })
      const code = fs.readFileSync(`${tstFile}`, { encoding: "utf8" });
      // Parse the code
      //const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
      // Process the AST (CommonJS)
      //argsMap = processNode(pkg, ast, fn, tFile)
      //argsMap = processNode2(pkg, code)
      // save call's map for each test file (['file.js': {fn1: [args1, args2], fn2: [args1, args2]}])
      //const analysisRes = enumerateFnCalls(code) || {};
      const [enumCases, pkgImports] = main(code5);
      const callsOfInterest = findCallOfInterest(enumCases, pkgImports, "bmoor", "pkgMainFunc");
      // if the Map is not empty, save it in the test file map
      if (analysisRes.length > 0) {
        // save the call's map for each test file. Encrypt the file path to avoid any special characters
        //callsMap.push({ [tFile]: analysisRes });
        callsMap.push(analysisRes);
        //console.log(argsMap)
        //if (argsMap[fn]) break;
      }
    }
    //return callsMap || [];
  } catch (error) {
    console.log(error.message);
  } finally {
    return callsMap.length > 0 ? callsMap : [];
  }
  //return results[0]; // This can be return to results to process more than one input
}

function findTestFiles1(pkg, repoUrl) {
  let testFiles = [],
    tempDir;
  let packageDir = path.resolve(`./node_modules/${pkg}`);
  const packageJson = JSON.parse(fs.readFileSync(`${packageDir}/package.json`, { encoding: "utf8" }));
  try {
    // Check if test files in metadataTestFiles exists
    // (first one enough to confirm if any test included with the npm bundle)
    // Guess patterns if no specific matches found
    const extracts = glob.sync(
      [
        `node_modules/${pkg}/{test,__tests__,tests}/**/*{test,spec,index}*.js`,
        `node_modules/${pkg}/**/*{test,spec}.js`,
      ],
      {
        ignore: [`node_modules/${pkg}/**/node_modules/**`], // Ignores only sub-package node_modules
      }
    );
    if (extracts.length > 0) testFiles.push(extracts);
    if (testFiles.length > 0) return testFiles;
    if (packageJson) {
      // Check for Jest testMatch
      if (packageJson.jest?.testMatch) {
        testFiles = packageJson.jest.testMatch.flatMap((pattern) => testFiles.push(pattern));
      }
      // Check for scripts.test match
      if (packageJson.scripts?.test) {
        const match = packageJson.scripts.test.match(/(test\/\S+|__tests__\/\S+|tests\/\S+)/);
        if (match) {
          testFiles.push(match[0]);
        }
      }
    }
    if (testFiles.length === 0 && repoUrl) {
      // If no local tests, clone the repository
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
      repoUrl = repoUrl.search(/(.git)$/) === -1 ? `${repoUrl}.git` : repoUrl;
      execSync(`git clone --depth 1 ${repoUrl} ${tempDir}`, { stdio: "ignore", timeout: 10000 });
      testFiles = glob.sync(
        [`${tempDir}/{test,__tests__,tests}/**/*{test,spec,index}*.js`, `${tempDir}/**/*{test,spec}.js`],
        {
          ignore: [`${tempDir}/**/node_modules/**`], // Ignores only sub-package node_modules
        }
      );
    }
  } catch (e) {
    console.error("extractPkgTestSuite - Failed to clone repository or find test files.", e);
  }
  return testFiles.length > 0 ? [tempDir, testFiles.map((t) => t.replace(`${tempDir}/`, ""))] : [];
}
// this version test all possible places for the test files (e.g., package's json file, repo, and the package itself)
function findTestFiles2(pkg, repoUrl, packageDir = "", fn = null) {
  let collectedTestFiles = [],
    tempDir;
  packageDir = packageDir !== "" ? packageDir : path.resolve(`./node_modules/${pkg}`);
  const packageJson = JSON.parse(fs.readFileSync(`${packageDir}/package.json`, { encoding: "utf8" }));
  try {
    // Check if test files in metadataTestFiles exists
    // (first one enough to confirm if any test included with the npm bundle)
    // Guess patterns if no specific matches found
    const extracts = glob.sync(
      [`${packageDir}/{test,__tests__,tests}/**/*{test,spec,index}*.js`, `${packageDir}/**/*{test,spec}.js`],
      {
        ignore: [`${packageDir}/**/node_modules/**`], // Ignores only sub-package node_modules
      }
    );
    if (extracts.length > 0) collectedTestFiles.push(...extracts);
    if (collectedTestFiles.length > 0) return collectedTestFiles;
    if (packageJson) {
      // Check for Jest testMatch
      if (packageJson.jest?.testMatch) {
        collectedTestFiles = packageJson.jest.testMatch.flatMap((pattern) => collectedTestFiles.push(pattern));
      }
      // Check for scripts.test match
      /*             if (packageJson.scripts?.test) {
                      const match = packageJson.scripts.test.match(/(test\/\S+|__tests__\/\S+|tests\/\S+)/);
                      if (match && ) {
                          collectedTestFiles.push(match[0]);
                      }
                  } */
    }
    if (collectedTestFiles.length === 0 && repoUrl) {
      // If no local tests, clone the repository
      const pkgLib = pkg
        .replace(/^(\d)/, "a$1")
        .replace(/^@/, "")
        .replace(/[:\-\./]/g, "_");
      const repoDir = `${packageDir}/repo-${pkgLib}`;
      if (!fs.existsSync(repoDir)) {
        repoDir = fs.mkdirSync(repoDir);
        //repoUrl = repoUrl.search(/(.git)$/) === -1 ? `${repoUrl}.git` : repoUrl;
        exec.execSync(`git clone --depth 1 ${repoUrl} ${repoDir}`, { stdio: "inherit", timeout: 10000 });
      }
      // if fn is defined, use the function path as test file path (e.g.,locutus.c.math.abs: locutus/c/math/abs.test.js)
      // pluse, consider having test word in any format in the test file name (e.g., abs.test.js, abs.spec.js, abs.index.js, test-abs.js)
      if (fn) {
        // testFileArr has all possible test file names (e.g., abs.test.js, abs.spec.js, abs.index.js, test-abs.js)
        const testFileArr1 = ["test", "spec", "index"].map((t) => `${fn}.${t}.js`);
        const testFileArr2 = ["test", "spec", "index"].map((t) => `${t}-${fn}.js`);
        const allTestFiles = [...testFileArr1, ...testFileArr2]; // TODO: 1- add more patterns 2- the path can start with test/__tests__/tests

        const fnPath = fn.split(".");
        const fnName = fnPath.pop();
        const fnDir = fnPath.join("/");
        const pathPattern = [
          `${repoDir}/{test,__tests__,tests}/${fnDir}/*{test,spec,index}*.js`,
          `${repoDir}/${fnDir}/*{test,spec,index}*.js`,
          `${repoDir}/**/*{test,spec,index}*${fnName}.js`,
          `${repoDir}/**/${fnName}*{test,spec,index}*.js`,
        ];
        collectedTestFiles = glob.sync(pathPattern, {
          ignore: [`${repoDir}/**/node_modules/**`], // Ignores only sub-package node_modules
        });
      } else
        collectedTestFiles = glob.sync(
          [`${repoDir}/{test,__tests__,tests}/**/*{test,spec,index}*.js`, `${repoDir}/**/*{test,spec}.js`],
          {
            ignore: [`${repoDir}/**/node_modules/**`], // Ignores only sub-package node_modules
          }
        );
    }
    //return collectedTestFiles.length > 0 ? collectedTestFiles : [];
    return collectedTestFiles;
  } catch (e) {
    console.error("extractPkgTestSuite - Failed to clone repository or find test files.", e);
  }
  //return collectedTestFiles.length > 0 ? [repoDir, collectedTestFiles.map(t => t.replace(`${repoDir}/`, ""))] : [];
}

module.exports = { extractInputsFromTestFiles: main };
//const testFiles = extractTestSuites('./node_modules/immer/package.json', 'https://github.com/immerjs/immer')
//const inputsList = extractInputs(testFiles)

// Output results
//console.log('Results:', results[0].functionName, results[0].arguments);
/*const code0 = `
  var a = 'Eugene';
  var b = 'Susan';
  var changes = diff(a, b);
  var b_ = diff.apply(changes, a);
`;

//const code = fs.readFileSync('node_modules/changeset/test/index.js', { encoding: 'utf8' });
//const code = fs.readFileSync('node_modules/merge/test/index.test.ts', { encoding: 'utf8' })

const code2 = `
  var a = 'Eugene';
  var b = 'Susan';
  var changes;
  describe('changeset', function () {
    it('should be able to diff two objects and return a changeset', function () {
      changes = diff(a, b);
      var b_ = diff.apply(changes, a);
    });

    test('applies changeset to a value', function () {
      var changes = diff(a, b);
      var result = diff.apply(changes, b);
    });
  });
`;

const code3 = `
  var a = 'Eugene';
  var b = 'Susan';
  var changes;
  changes = diff(a, b);
  var b_ = diff.apply(changes, { name: a, age: 30, nested: { b } });
  var result = diff(42, ['arrayValue', b], a + b);
`;*/
