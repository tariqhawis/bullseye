const acorn = require("acorn");
const walk = require("acorn-walk");
const acornLoose = require("acorn-loose");
const escodegen = require("escodegen");
const fs = require("fs");
const { glob } = require("glob");
const { createHash } = require("crypto");
const hash = (str) => createHash("sha256").update(str).digest("hex");
//const { required } = require("yargs");
//const { extractInputsFromTestSuites } = require("../fuzzUtils/AnalyzeTestSuites");

// Helper function to append warning line in a text file. If the warning line is already recorded, it will not be added again.
function recordWarning(warning) {
  const warningFile = "ASTwarnings.txt";
  if (fs.existsSync(warningFile)) {
    //read the file, split the lines, and check if the warning is already in the file
    const lines = fs.readFileSync(warningFile, "utf8").split("\n");
    if (!lines.includes(warning)) fs.appendFileSync(warningFile, warning + "\n");
  } else fs.appendFileSync(warningFile, warning + "\n");
}

// this function enumerates function calls in the code and returns a map of resolved variables. The is for a single test suite case
function analyzeTestCase(code) {
  //console.log("Analyzing test case..." + code);
  // support ES6 syntax, ES modules, and CommonJS modules. TODO: Add support for TypeScript
  const ast = acornLoose.parse(code, { ecmaVersion: "latest", sourceType: "module" });

  const globalScope = new Map(); // Global scope
  const pkgImports = new Map(); // Required packages
  const fnOfInterest = new Map(); // Functions of interest
  const scopeStack = [globalScope]; // Stack to track scopes
  // List of packages that should be included in the global scope
  const testSuiteFunctions = ["describe", "it", "beforeEach", "afterEach", "before", "after"]; // Test suite-related functions
  const nativeFn = [
    "child_process.exec",
    "child_process.execFile",
    "child_process.fork",
    "child_process.spawn",
    "child_process.execSync",
    "child_process.execFileSync",
    "child_process.spawnSync",
  ];
  // exclude all native functions
  // Helper functions
  function currentScope() {
    return scopeStack[scopeStack.length - 1];
  }

  function addVariable(name, value) {
    currentScope().set(name, value);
  }

  function resolveVariable(name) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) {
        return scopeStack[i].get(name);
      }
    }
    return {}; // Variable not found
  }

  // Helper to parse complex nodes like objects, arrays, and function calls
  function parseNode(nodeBody, parseType = "value") {
    // parseType can be 'value', 'name', or 'eval'
    let calleeName, args;
    function resolvePath(nodeBody) {
      if (nodeBody.type === "MemberExpression") {
        return resolvePath(nodeBody.object) + "." + nodeBody.property.name;
      } else if (nodeBody.type === "Identifier") {
        if (parseType === "name") return nodeBody.name;
        return resolveVariable(nodeBody.name);
      }
      return "";
    }
    try {
      switch (nodeBody.type) {
        case "Literal":
          return nodeBody.value;
        case "Identifier":
          if (parseType === "name") return nodeBody.name;
          return resolveVariable(nodeBody.name);
        case "MemberExpression":
          const object = parseNode(nodeBody.object, "name");
          const property = parseNode(nodeBody.property, "name");
          /*                 if (typeof object === 'string')
                                        return object + '.' + property; */
          //return resolvePath(parseNode);
          //return resolveVariable(parseNode.name);

          return object + "." + property;
        case "ObjectPattern":
          return nodeBody.properties.map((prop) => parseNode(prop.value, "name"));
        case "CallExpression":
          // Handle function calls
          // if the callee is 'require', return the arguments
          calleeName = parseNode(nodeBody.callee, "name");
          args = nodeBody.arguments.map((arg) => parseNode(arg));
          if (calleeName === "require") return "#REQ#" + args;
          if (parseType === "eval") return eval(escodegen.generate(nodeBody));
          return { calleeName, args }; // Return the callee name and arguments
        /*             default:
                                console.warn(`Unrecognized parseNode type: ${parseNode.type}`);
                                return undefined; */
        case "ObjectExpression":
          // return the object as a map of key-value pairs
          return nodeBody.properties.reduce((acc, prop) => {
            acc[parseNode(prop.key, "name")] = parseNode(prop.value);
            return acc;
          }, {});
        case "ArrayExpression":
          return nodeBody.elements.map((element) => parseNode(element));

        // for arrow functions, we parse the internal nodes
        /*             case "ArrowFunctionExpression":
                                return parseNode(parseNode.body); */
        // for new expressions, we record the function name and arguments
        case "NewExpression":
          calleeName = nodeBody.callee.name;
          args = nodeBody.arguments.map((arg) => parseNode(arg));
          // eval the function call
          try {
            return eval(`${calleeName}(${args.join(", ")})`);
          } catch (error) {
            return { calleeName, args };
          }
        case "ArrowFunctionExpression":
          //evaluate the body of the arrow function after using escodegen to convert it to a string
          return eval(escodegen.generate(nodeBody));
        // for Function calls at the right side of the assignment, we need to evaluate the function call and return the value
        /*case "CallExpression":
                //return eval(`${callee}(${arguments.join(", ")})`);
                             case "FunctionExpression":
                                return eval(`(${parseNode.source()})`);
                            case "ArrowFunctionExpression":
                                return eval(`(${parseNode.source()})`); */

        // For Logical and Arithmetic expressions, evaluate the left and right sides
        case "LogicalExpression":
          switch (nodeBody.operator) {
            case "%":
              return left % right;
            case "==":
              return left == right;
            case "===":
              return left === right;
            case "!=":
              return left != right;
            case "!==":
              return left !== right;
            case "<":
              return left < right;
            case "<=":
              return left <= right;
            case ">":
              return left > right;
            case ">=":
              return left >= right;
            default:
            //console.warn(`Unsupported operator: ${nodeBody.operator}`);
          }
        case "BinaryExpression":
          const left = parseNode(nodeBody.left);
          const right = parseNode(nodeBody.right);
          switch (nodeBody.operator) {
            case "+":
              return left + right;
            case "-":
              return left - right;
            case "*":
              return left * right;
            case "/":
              return left / right;
            default:
            //console.warn(`Unsupported operator: ${nodeBody.operator}`);
          }
        /*             case "FunctionExpression":
                                return parseNode(parseNode.body);
                            case "BlockStatement":
                                return parseNode.body.map((stmt) => parseNode(stmt));
                            case "ExpressionStatement":
                                return parseNode(parseNode.expression); */
        //
        default:
          recordWarning(nodeBody.type);
          //console.warn(`Unrecognized parseNode type: ${nodeBody.type}`);
          return undefined;
      }
    } catch (error) {
      console.log(`Error parsing parseNode: ${nodeBody.type}` /* `${escodegen.generate(nodeBody)}`*/);
    }
  }

  // Parse the code and walk the AST
  walk.ancestor(ast, {
    ImportDeclaration(node) {
      // Handle ES Module `import` statements
      const moduleName = node.source.value;
      let id, value;
      node.specifiers.forEach((specifier) => {
        // if the dentifier has #REQ# in it, it is a require call, add #REQ# to the id's name
        if (specifier.local && specifier.local.name) {
          id = parseNode(specifier.local, "name");
          pkgImports.set("#REQ#" + id, moduleName);
          //const parsedSpec = parseNode(specifier);
          //varNames.push(specifier.local.name);
        }
      });

      /*       varNames.forEach((varName) => {
        currentScope().set(varName, moduleName);
      }); */
    },

    VariableDeclaration(node, ancestors) {
      const current = currentScope();
      node.declarations.forEach((declaration) => {
        const id = declaration.id;
        let value;
        // If there is an initialization value, parse it
        if (declaration.init !== null) {
          value = parseNode(declaration.init);
        }

        // Handle regular variable declaration
        if (id.type === "Identifier") {
          // if value start with #REQ#, it is a require call, add #REQ# to the id's name
          if (typeof value === "string" && value.startsWith("#REQ#")) {
            const reqId = parseNode(declaration.id, "name");
            id.name = typeof reqId === "string" ? "#REQ#" + reqId : "#REQ#" + reqId.join(",");
            pkgImports.set(id.name, value);
          } else current.set(id.name, value); // Add to current scope
        }
        // Handle object destructuring
        else if (id.type === "ObjectPattern") {
          id.properties.forEach((prop) => {
            let key = prop.key?.name;
            // if value start with #REQ#, it is a require call, add #REQ# to the id's name
            if (typeof value === "string" && value.startsWith("#REQ#")) {
              reqId = "#REQ#" + key;
              pkgImports.set(reqId, value);
            } else current.set(key, value);
          });
        }
        // Handle array destructuring
        else if (id.type === "ArrayPattern") {
          id.elements.forEach((element, index) => {
            if (element && element.name) {
              current.set(element.name, resolveVariable(value));
            }
          });
        }
        // Handle destructuring assignments
        // Special case: if the value is a function call, evaluate the call, then add it to the current scope
        if (value && typeof value === "object" && value.calleeName && current.has(value.calleeName)) {
          const fn = current.get(value.calleeName);
          if (typeof fn === "function") {
            let resolvedValue;
            try {
              resolvedValue = fn.apply(null, value.args);
            } catch (error) {}
            // get the id that has the function call and add the resolved value to the current scope
            const id = getByValue(current, value);
            //const resolvedValue = eval(`${fnName}(${args.join(", ")})`);
            current.set(id, resolvedValue);
          }
        }
      });
    },

    AssignmentExpression(node, ancestors) {
      // Handle assignments: `a = 5` or `obj.b = 6`
      const current = currentScope();
      const left = node.left;
      let varName;

      // If the left-hand side is an identifier, handle directly
      if (left.type === "Identifier") {
        varName = left.name;
        const value = parseNode(node.right);
        current.set(varName, value); // Update variable value
      }
      // If the left-hand side is an object or array pattern, handle destructuring
      else if (left.type === "ObjectPattern") {
        left.properties.forEach((prop) => {
          const value = parseNode(node.right);
          current.set(prop.key.name, resolveVariable(value));
        });
      } else if (left.type === "ArrayPattern") {
        left.elements.forEach((element, index) => {
          const value = parseNode(node.right);
          current.set(element.name, resolveVariable(value));
        });
      }
    },

    FunctionDeclaration(node) {
      const current = currentScope();
      if (node.id) {
        current.set(node.id.name, "FunctionDeclaration");
        const functionScope = new Map();
        node.params.forEach((param) => {
          functionScope.set(param.name, undefined);
        });
        scopeStack.push(functionScope); // Push function scope
      }
    },
    NewExpression(node) {
      const current = currentScope();
      const value = parseNode(node);
      current.set(node.callee.name, value);
    },

    ExpressionStatement(node) {
      // Handle expression statements
      const current = currentScope();
      const expression = node.expression;
      // Handle test suite function calls (describe, it, etc.)
      if (
        expression.type === "CallExpression" &&
        expression.callee.type === "Identifier" &&
        testSuiteFunctions.includes(expression.callee.name)
      ) {
        const calleeName = expression.callee.name;
        const args = expression.arguments.map((arg) => parseNode(arg));
        current.set(calleeName, args);
      }
    },
    ExpressionStatementExit() {
      scopeStack.pop(); // Exit block scope
    },

    "BlockStatement:exit"() {
      scopeStack.pop(); // Exit block scope
    },

    FunctionDeclarationExit() {
      scopeStack.pop();
    },

    CallExpression(node, ancestors) {
      // process CallExpression if the callee is not require
      let calleeName;
      try {
        //if (!ancestors.some((a) => a.type === 'VariableDeclarator' || 1)) {
        //if (node.callee.name === 'require') {
        const current = currentScope();
        // if the last ancestor is a VariableDeclarator, resolve the callee

        if (current.has(node.callee.name) && !testSuiteFunctions.includes(node.callee.name))
          calleeName = parseNode(node.callee);
        else if (!current.has(node.callee.name) && !testSuiteFunctions.includes(node.callee.name))
          calleeName = parseNode(node.callee, "name");

        // to handle object constructed from import variable,
        //reconstruct calleeName, replacing the first part with the resolved variable   (e.g., testObject.set => Confucious.set)
        calleeName =
          typeof calleeName === "string" && calleeName.includes(".") && current.has(calleeName.split(".")[0])
            ? current.get(calleeName.split(".")[0]).calleeName + calleeName.substring(calleeName.indexOf("."))
            : calleeName;
        //const args = node.arguments.map(arg => parseNode(arg));
        //const value = parseNode(node);
        // if test suite function called with our function as an argument (e.g., assert.deepEqual(assign(one, two),...), record our function and its arguments
        // if args is an object
        //if (!testSuiteFunctions.includes(calleeName)) {
        if (node.arguments[0]?.type === "CallExpression" && node.arguments[0]?.callee?.name !== "require") {
          const nestedCalleeName = parseNode(node.arguments[0].callee, "name");
          const nestedArgs = node.arguments[0].arguments.map((arg) => parseNode(arg));
          current.set("#Call#" + nestedCalleeName, nestedArgs);
        } else if (calleeName !== "require" && calleeName !== undefined) {
          current.set(
            "#Call#" + calleeName,
            node.arguments.map((arg) => parseNode(arg))
          );
          // if the function not one of the testSuiteFunctions while match a KEY in pkgImports, record the function and its arguments as fnOfInterest
          const frags =
            typeof calleeName === "string" && calleeName.includes(".") ? calleeName.split(".") : [calleeName];
          if (
            node.arguments.length > 0 &&
            !nativeFn.some((nf) => nf.includes(frags[frags.length - 1]))
            //&& (pkgImports.has("#REQ#" + frags[0]) || frags[0] === calleeName)
          ) {
            // add the function as key and its arguments as value to fnOfInterest
            // if the function already exists, add the arguments to the existing value
            const existingArgs = fnOfInterest.has("#Call#" + calleeName) ? fnOfInterest.get("#Call#" + calleeName) : [];
            const newArgs = node.arguments.map((arg) => parseNode(arg));
            // if the newArgs is identical to the existingArgs, do not add it
            if (
              !existingArgs.some((arg) => JSON.stringify(arg) === JSON.stringify(newArgs)) /* &&
              !newArgs.some((arg) => arg === undefined )*/
            ) {
              existingArgs.push(newArgs);
              // push the new arguments as an array to the existing arguments
              fnOfInterest.set("#Call#" + calleeName, existingArgs);
            }
          }
        }
        // if simply the function of intereset equal to the package name (wheter the first part of the whole name)

        // Only record calls for functions within test suite context
        // const callee = node.callee;
        // if (callee.type === "Identifier" && callee.name === 'it' || callee.name === 'describe') {
        //     const args = node.arguments.map((arg) => parseNode(arg, ancestors));
        //     console.log(`Test suite function called: ${callee.name}, Arguments:`, args);
        // }
      } catch (error) {
        // console.error(error.message, escodegen.generate(node));
      }
      // if the callee is a function call, record the function name and its arguments
      /*                     else if (typeof callee === 'object') {
                                    current.set(callee.calleeName, { calleeName: callee.calleeName, args: callee.args });
                                }
                                // if the callee is a variable, resolve the variable and record the value
                                else {
                                    current.set(callee, value);
                                } */
    },
    /*         ExpressionStatement(node, ancestors) {
                    const expression = node.expression;
        
                    // Handle test suite function calls (describe, it, etc.)
                    if (
                        expression.type === "CallExpression" &&
                        expression.callee.type === "Identifier" &&
                        testSuiteFunctions.includes(expression.callee.name)
                    ) {
                        const calleeName = expression.callee.name;
                        const args = expression.arguments.map(arg => parseNode(arg, ancestors));
                        console.log(`Resolved Test Suite Function: ${calleeName}, Arguments:`, args);
                    }
        
                    // Handle assertion library function calls
                    else if (
                        expression.type === "CallExpression" &&
                        (expression.callee.type === "Identifier" || expression.callee.type === "MemberExpression")
                    ) {
                        const calleeName =
                            expression.callee.type === "Identifier"
                                ? expression.callee.name
                                : `${parseNode(expression.callee.object, ancestors)}.${expression.callee.property.name}`;
                        const args = expression.arguments.map(arg => parseNode(arg, ancestors));
                        console.log(`Resolved Assertion: ${calleeName}, Arguments:`, args);
                    }
                }, */
  });
  return [globalScope, pkgImports, fnOfInterest];
}

// main: run analyzeTestCase for each test suite case. First separate the code into test suite cases, then run analyzeTestCase for each case
function main(code) {
  // walk through ast of the code and extract each test case. Merge the file's header to each test case
  const testCases = [];
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
  let startFirstTestSuite = 0;
  let start = 0;
  const suites = [];
  let headerEnd = 0;

  ast.body.forEach((node) => {
    if (node.type === "ExpressionStatement" && node.expression.callee && node.expression.callee.name === "describe") {
      suites.push({
        start: node.start,
        end: node.end,
      });

      if (headerEnd === 0) {
        headerEnd = node.start;
      }
    }
  });

  const header = code.substring(0, headerEnd);
  const suiteBlocks = suites.map((suite) => code.substring(suite.start, suite.end));

  //return { header, suites: suiteBlocks };

  /*    walk.ancestor(ast, {
           CallExpression(node) {
               // startFirstTestSuite is the start of the first test suite
               if (node.callee.name === 'describe' && startFirstTestSuite === 0) {
                   startFirstTestSuite = node.start;
               }
               else if (node.callee.name === 'describe') {
                   start = node.start;
               }
               else if (node.callee.name === 'it') {
                   const end = node.arguments[1].end;
                   testCases.push(code.substring(node.start, node.end));
                   // start = 0; // Reset start after each describe block
               }
           }
       }); */
  // analyze each test case
  // const resolvedMap = new Map();
  // const pkgImports = new Map();
  // First, analyze the code to extract global scope variables and required packages, excluding the test cases
  //const [globalScope, required] = analyzeTestCase(code.substring(0, startFirstTestSuite));
  // Merge the global scope variables
  // globalScope.forEach((value, key) => {
  //     resolvedMap.set(key, value);
  // });
  const requiredPkgs = analyzeTestCase(header);
  let allCases = [];
  suiteBlocks.forEach((testCase) => {
    const [globalScope, required] = analyzeTestCase(testCase);
    // Merge the global scope variables
    // globalScope.forEach((value, key) => {
    //     resolvedMap.set(key, value);
    // });
    // // Merge the required packages
    // required.forEach((value, key) => {
    //     pkgImports.set(key, value);
    // });
    allCases.push(globalScope);
  });
  return [allCases, requiredPkgs];
}

function getByValue(map, searchValue) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue) return key;
  }
}

function findCallOfInterest(enumCases, pkgImports, pkg, fn) {
  const callsOfInterest = new Map();
  const includePaths = [
    pkg,
    `./${pkg}`,
    `../${pkg}`,
    `../../${pkg}`,
    `../`,
    `./`,
    `..`,
    `../../`,
    `./index.js`,
    `../index.js`,
    `./src/**`,
    `../src/**`,
    `../../src/**`,
    `../src/index`,
    `../../src/index`,
    `./lib/**`,
    `../lib/**`,
    `../../lib/**`,
    `../lib/index`,
    `./src/${pkg}`,
    `../src/${pkg}`,
    `../../src/${pkg}`,
    `./lib/${pkg}`,
    `../lib/${pkg}`,
    `../../lib/${pkg}`,
  ];
  const pathMatching = (pkg) => {
    const includePaths = [
      pkg,
      "..",
      `./**`,
      `../**`,
      `./{,${pkg},src,lib}/**/{,${pkg}}`,
      `../{,${pkg},src,lib}/**/{,${pkg}}`,
      `./**/{,${pkg},src,lib,index}.{js,ts,cjs,mjs}`,
      `../**/{,${pkg},src,lib,index}.{js,ts,cjs,mjs}`,
    ];
    const path = glob.sync([...includePaths]);
    return path.length > 0;
  };

  // search for the function calls of interest in the resolvedMap, which are the calls that relates to the package we are interested in
  try {
    for (const [reqKey, reqVal] of pkgImports) {
      casesLoop: for (const [cKey, cVal] of enumCases) {
        // check if we have a function call and the calleeName is in the pkgImports
        if (cKey && cKey.startsWith("#Call#")) {
          // For calls other than require, take basename of the calleeName if it is a path, e.g., assign.deep
          // take basename of the calleeName if it is a path, e.g., assign.deep
          let firstPartKey = cKey.includes(".") ? cKey.substring(6).split(".")[0] : cKey.substring(6);
          pkgSearch = pkg.replace(/[^a-zA-Z]/g, "").toLowerCase();
          let reqKeySearch = reqKey
            .substring(5)
            .replace(/[^a-zA-Z]/g, "")
            .toLowerCase();
          let cKeySearch = cKey.substring(6);
          const lastPartKey = cKey.includes(".") ? cKey.substring(6).split(".").pop() : cKey.substring(6);
          const firstPartFn = fn.includes(".") ? fn.split(".")[0] : fn;
          const lastPartFn = fn.includes(".") ? fn.split(".").pop() : fn;
          // if the calleeName is in the pkgImports and the path is in the includePaths
          // if (
          //   firstPartKey === reqKey.substring(5) &&
          //   (includePaths.some((inc) => reqVal.substring(5).startsWith(inc) || reqVal === inc) ||
          //     reqKeySearch === pkgSearch ||
          //     cKey)
          //   //pathMatching(reqVal.substring(5) || reqVal)
          // ) {
          //   // replace the first part of the key with the package name
          //   const newKey = cKey.substring(6).replace(firstPartKey, "pkgMainFunc");
          //   if (newKey === fn || firstPartKey === fn.split(".").pop()) {
          //     callsOfInterest.set(fn, cVal);
          //     //break casesLoop;
          //   }
          // }
          //if (/*firstPartKey === reqKey.substring(5) &&*/ !callsOfInterest.has(fn))
          const searchByFn = enumCases.has(`#Call#${fn.replace("pkgMainFunc", firstPartKey)}`)?
            ? enumCases.get(`#Call#${fn.replace("pkgMainFunc", firstPartKey)}`)
            : undefined;
          if (searchByFn) {
            callsOfInterest.set(fn, searchByFn);
            break casesLoop;
          }
          if (
            //firstPartKey.toLowerCase() === pkgSearch ||
            lastPartKey === pkgSearch ||
            firstPartKey === firstPartFn ||
            lastPartKey === lastPartFn ||
            // if the imported package in test suite is in the includePaths, has no path like the fn, take it
            (!cKeySearch.includes(".") &&
              includePaths.some((inc) => reqVal.substring(5).startsWith(inc) && !fn.includes("."))) ||
            (cKeySearch.includes(".") &&
              includePaths.some((inc) => reqVal.substring(5).startsWith(inc) && fn.includes(".")) &&
              lastPartFn === lastPartKey)
          ) {
            // replace the first part of the key with the package name
            //const newKey = cKey.substring(6).replace(firstPartKey, "pkgMainFunc");
            //if (newKey === fn || firstPartKey === fn.split(".").pop()) {
            // if the function already exists, add the values to the existing value
            //if (callsOfInterest.has(fn)) callsOfInterest.set(fn, [...callsOfInterest.get(fn), cVal]);
            //else
            // if the callsOfInterest has the fn, and the values are less than 5, add the new value to the existing value
            //if (callsOfInterest.has(fn) && callsOfInterest.get(fn).length < 5) callsOfInterest.set(fn, cVal);
            callsOfInterest.set(fn, cVal);
            break casesLoop;
            // }
          }
        }
      }
    }
    // If not linked with req, match by the name
    // e.g the function's equal to the package name, or the last part of the function name is equal to the package name or its last part
    // casesLoop2: for (const [cKey, cVal] of enumCases) {
    //   // check if we have a function call and the calleeName is in the pkgImports
    //   if (cKey && cKey.startsWith("#Call#")) {
    //     // For calls other than require, take basename of the calleeName if it is a path, e.g., assign.deep
    //     // take basename of the calleeName if it is a path, e.g., assign.deep
    //     const firstPartKey = cKey.includes(".") ? cKey.substring(6).split(".")[0] : cKey.substring(6);
    //     const lastPartKey = cKey.includes(".") ? cKey.substring(6).split(".").pop() : cKey.substring(6);
    //     const firstPartFn = fn.includes(".") ? fn.split(".")[0] : fn;
    //     const lastPartFn = fn.includes(".") ? fn.split(".").pop() : fn;
    //     const pkgSearch = pkg.replace(/[^a-zA-Z]/g, "").toLowerCase();
    //     // if the calleeName is in the pkgImports and the path is in the includePaths
    //     if (
    //       firstPartKey.toLowerCase() === pkgSearch ||
    //       lastPartKey === pkgSearch ||
    //       firstPartKey === firstPartFn ||
    //       lastPartKey === lastPartFn
    //     ) {
    //       // replace the first part of the key with the package name
    //       //const newKey = cKey.substring(6).replace(firstPartKey, "pkgMainFunc");
    //       //if (newKey === fn || firstPartKey === fn.split(".").pop()) {
    //       callsOfInterest.set(fn, cVal);
    //       // if the function already exists, add the arguments to the existing value
    //       call
    //       //break casesLoop2;
    //       // }
    //     }
    //   }
    // }
  } catch (error) {
    //console.log(error);
  }
  // merge two maps
  return callsOfInterest;
}

const code = fs.readFileSync(
  //"/home/tariq/benchmark/benchmark-ss/controlled_merge_lib/node_modules/controlled-merge/test/tests.js",
  //"/home/tariq/benchmark/arteau-15/assign_deep-0.4.6/repo-assign_deep/test.js",
  "/data/benchmark/odgen19/magico-1.1.1/repo-magico/test/index.test.js",
  "utf8"
);
const [enumCases, pkgImports, fnOfInterest] = analyzeTestCase(code);
console.log("Global Scope Variables: ", enumCases);
console.log("Required Vars Variables: ", pkgImports);
// // functions Of Interest collects all the function calls that are related to the package that are imported at the beginning of the file
// // we then refine the list by the given function name to get the function calls of interest
console.log("Functions of Interest: ", fnOfInterest);
// // only fetch the matching function calls
const callsOfInterest = findCallOfInterest(fnOfInterest, pkgImports, "magico", "pkgMainFunc.set");
console.log("Calls of Interest: ", JSON.stringify(Array.from(callsOfInterest), null, 2));
// const pkgImports=new Map(JSON.parse('[["#REQ#instanceToInstance","../../src/index"],["#REQ#classToClassFromExist","../../src/index"],["#REQ#instanceToPlain","../../src/index"],["#REQ#classToPlainFromExist","../../src/index"],["#REQ#plainToInstance","../../src/index"],["#REQ#plainToClassFromExist","../../src/index"],["#REQ#defaultMetadataStorage","../../src/storage"],["#REQ#Exclude","../../src/decorators"],["#REQ#Expose","../../src/decorators"],["#REQ#Type","../../src/decorators"],["#REQ#Transform","../../src/decorators"]]'));
// const callsOfInterest = findCallOfInterest(fnOfInterest, pkgImports, "class-transformer", "pkgMainFunc.classToPlainFromExist");

module.exports = { analyzeTestCase, findCallOfInterest };
