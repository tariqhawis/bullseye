const path = require("path");
const fs = require("fs");
const tar = require("tar");
const os = require("os");
const { Readable } = require("stream");
const { execSync } = require("child_process");
const { glob } = require("glob");

async function importModule(moduleName) {
  let importedModule = {},
    importedModule2 = {};
  try {
    // import a module by path
    importedModule = require(moduleName);
    importedModule2 = require(moduleName)(); // call the function if it's a function
    // merge importedModule and importedModule2
    importedModule =
      Object.keys(importedModule2).length > 0 ? { ...importedModule, ...importedModule2 } : importedModule;

    // if nothing returned, threw exception
    //if (Object.keys(importedModule2).length === 0) throw new Error("Trying dynamic import..");
  } catch (e) {
    //console.log("Trying dynamic import..");
    try {
      importedModule = await import(moduleName);
      //if (typeof importedModule.default === "object")
      importedModule = importedModule.default;

      /*             import(moduleName).then(module => {
                            importedModule = module.default;
                        }); */
    } catch (e) {
      try {
        if (e.message.search(/Did you mean to import/) !== -1) {
          const suggestedPath = e.message.match(/Did you mean to import "([^"]+)"\?/);
          importedModule = await import(suggestedPath[1]);
          //if (typeof importedModule.default === "object")
          importedModule = importedModule.default;
        }
      } catch (e) {
        console.log("Trying files import..");
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
            //importedModule[methodName] = require(methodFilePath);
            importedModule[methodName] = await import(methodFilePath);
            importedModule[methodName] = importedModule[methodName].default;
            /*                             if(typeof importedModule[methodName].default ==='object') 
                            importedModule[methodName] = importedModule[methodName].default; */
          }
        }
        if (Object.keys(importedModule).length == 0) {
          importedModule = await import(moduleName);
          importedModule = importedModule.default;
          /*                     import(moduleName).then(module => {
                                            importedModule = module.default;
                                        }); */
        }
      }
    }
  }
  //return { ...importedModule, ...importedModule2 };
  return importedModule;
}

function importModule1(moduleName) {
  return new Promise((resolve, reject) => {
    let importType;
    let importedModule = {};
    try {
      importedModule = require(moduleName);
      importType = "require";
      resolve({ importedModule, importType });
    } catch (e) {
      console.log("Trying dynamic import..");
      import(moduleName)
        .then((module) => {
          importedModule = module.default;
          importType = "import";
          resolve({ importedModule, importType });
        })
        .catch((e) => {
          console.log("Trying files import..");
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
            }
            if (Object.keys(importedModule).length == 0) {
              import(moduleName)
                .then((module) => {
                  importedModule = module.default;
                  importType = "import";
                  resolve({ importedModule, importType });
                })
                .catch((err) => {
                  console.log("Error importing module:", err);
                  reject(err);
                });
            } else {
              resolve({ importedModule, importType });
            }
          } catch (err) {
            console.log("Error importing module:", err);
            reject(err);
          }
        });
    }
  });
}

async function importGlobalNameSpace(packageName) {
  const globalObj = global;
  // Create a set to track newly added properties
  const addedKeys = new Set();
  let lib,
    detectedNamespaceKeys = [];
  // Wrap the global object with a proxy
  const globalProxy = new Proxy(globalObj, {
    set(target, prop, value) {
      if (!Reflect.has(target, prop)) {
        // Record newly added properties
        addedKeys.add(prop);
        console.log(`New global property detected: ${String(prop)}`);
      }
      // Assign the value to the global object
      return Reflect.set(target, prop, value);
    },
  });

  // Temporarily replace the global object with the proxy
  globalThis.global = globalProxy;
  // Dynamically import the package
  //lib = importModule(packageName);
  /*     importModule(packageName).then(({ importedModule, importType }) => {
            lib = importedModule;
        }).catch(err => {
            console.error('Failed to import module:', err);
        }); */
  //lib = await importModule(packageName);
  try {
    // import a module by path
    lib = require(packageName);
    importType = "require";
  } catch (e) {
    console.log("Trying dynamic import..");
    try {
      const importedLib = await import(packageName);
      lib = importedLib.default;
      /*             import(moduleName).then(module => {
                            importedModule = module.default;
                        }); */
    } catch (e) {
      console.log("Trying files import..");
    }
  }
  // Restore the original global object
  globalThis.global = globalObj;

  // Check for newly added namespace properties
  detectedNamespaceKeys = [...addedKeys].filter((key) => typeof globalObj[key] === "object" && globalObj[key] !== null);

  /*   let detectedNamespace = null;
        if (detectedNamespaceKeys.length > 0) {
           const key = detectedNamespaceKeys[0];
           detectedNamespace = globalObj[key];
           console.log(`Detected namespace: ${key}`);
       } else {
           console.log(`No new namespace detected for package "${packageName}".`);
       } */

  return [lib, detectedNamespaceKeys];
}

async function fetchMetadata(pkgData, pkgPath) {
  // pkgData: { package_name, version, repo, pkgPath }
  // fetchType: tarball, repo ; action: fetch, install
  let pkgMeta, pkgFetch, repoUrl;
  const pkgLib = pkgData.package_name
    .replace(/^(\d)/, "a$1")
    .replace(/^@/, "")
    .replace(/[:\-\./]/g, "_");
  const repoDir = `${pkgPath}/repo-${pkgLib}`;
  //const repoDir = `${pkgData.pkgPath}/package-repo`;
  const version =
    pkgData.version && typeof pkgData.version === "string" && pkgData.version !== "" ? pkgData.version : false;
  const repo = pkgData.repo && typeof pkgData.repo === "string" && pkgData.repo !== "" ? pkgData.repo : false;
  if (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length > 0) return repoDir; // if the repo is already cloned, return the path
  try {
    // if the link is not provided, get the link from npm registry, the type of the link (tarball or repo) determind by the fetchType
    if (!repo) {
      pkgFetch = await fetch(`https://registry.npmjs.org/${pkgData.package_name}`).then((res) => res.json());
      if (pkgFetch.error || !pkgFetch.versions) return false;
      if (!version) pkgMeta = pkgFetch.versions[pkgFetch["dist-tags"].latest];
      else pkgMeta = pkgFetch.versions[version];
    }
  } catch (error) {
    console.log(error);
  }
  // if the repository is included in the metadata, extract the repository URL
  if (pkgMeta.repository && Object.values(pkgMeta.repository).length > 0) {
    try {
      repoUrl = extractPkgRepo(pkgMeta.repository);
      // 2. clone the repository
      // if the folder is not exist or empty, clone the repo
      if (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length === 0) fs.rmdirSync(repoDir, { recursive: true });
      if (!fs.existsSync(repoDir) && repoUrl) {
        fs.mkdirSync(repoDir);
        // replace ALL protocol patterns in the repo url
        repoUrl = repoUrl.replace(/^([^/]+\/\/)?(.*)/, "https://$2");
        //repoUrl = repoUrl.search(/(.git)$/) === -1 ? `${repoUrl}.git` : repoUrl;
        execSync(`git clone --depth 1 ${repoUrl} ${repoDir}`, { stdio: "pipe", timeout: 120000 });
        return repoDir;
      }
    } catch (error) {
      console.log(error.message);
    }
  } else {
    // if repo is not provided, fetch the tarball URL
    try {
      // unpack the tarball and return the path to the unpacked package
      const tarballUrl = pkgMeta.dist.tarball;
      const untar = await unpackTarball(tarballUrl, pkgPath);
      // return the path without the last part
      const untarPath = path.dirname(untar);
      // rename the folder to include the package name
      const untarDir = untar.replace(untarPath, `repo-${pkgLib}`);
      fs.renameSync(untar, untarDir);
      return untarDir;
      // Extract package's test suite by cloning the repository
      //testFiles = extractPkgTestSuite(pkgMeta, repoUrl);
    } catch (error) {
      console.log(error.message);
    }
  }
}

function extractPkgRepo(repo) {
  try {
    //const repoProps = pkgMeta.repository;
    let repoUrl;
    const isRepo = (r) => {
      if (typeof r === "string" && r.search(/((git|ssh|http(s)?)(:(\/\/)?))?(git@)?github\.com(\/|:)?/) > -1)
        return true;
      return false;
    };
    //Object.prototype.hasOwnProperty.call(g, 'url')
    // Iterate over the properties of the repository object
    ///((git|ssh|http(s)?)(:(\/\/)?))?(git@)?github\.com(\/|:)?/
    ///((git|ssh|http(s)?)(:(\/\/)?))?(git@)?github\.com(\/|:)([^\/]+\/[^\/#.]+)#?(.git)?/
    if (isRepo(repo) || (Reflect.has(repo, "url") && isRepo(repo.url)))
      repoUrl = typeof repo === "string" ? repo : Reflect.has(repo, "url") ? repo.url : null;
    else {
      for (const prop in repo) {
        // Check if the property value matches a URL pattern
        repoUrl = isRepo(repo[prop]) ? repo[prop] : null;
        // Exit the loop if URL is found
      }
    }
    return repoUrl; // Return null if no URL is found
  } catch (error) {
    console.log(error.message);
  }
}

async function unpackTarball(tarballUrl, packageDir) {
  // Ensure the destination directory exists
  fs.mkdirSync(packageDir, { recursive: true });

  // Fetch the tarball
  const response = await fetch(tarballUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch '${tarballUrl}': ${response.statusText}`);
  }

  // Convert ReadableStream (from fetch) to a Node.js stream
  const nodeStream = Readable.from(response.body);

  // Prepare the path to the final unpacked folder (based on the tarball contents)
  let unpackedFolderPath = null;

  return new Promise((resolve, reject) => {
    nodeStream
      .pipe(
        tar.x({
          cwd: packageDir, // Unpack to the destination path
          onentry(entry) {
            if (!unpackedFolderPath) {
              // Extract the folder name from the tarball
              unpackedFolderPath = path.join(packageDir, entry.path.split("/")[0]);
            }
          },
        })
      )
      .on("finish", () => {
        if (unpackedFolderPath) {
          resolve(unpackedFolderPath); // Resolve with the unpacked folder path
        } else {
          reject("Unpacked folder not found");
        }
      })
      .on("error", (err) => {
        // Reject with error on failure
        console.error("Error extracting tarball:", err);
        reject(err);
      });
  });
}

// this version fetch from repo, then check if the test files exist in the package's json file.
function cloneRepo(pkg, repoUrl, packageDir) {
  let repoDir;
  packageDir = packageDir !== undefined ? path.resolve(packageDir) : path.resolve(`./node_modules/${pkg}`);
  try {
    // If no local tests, clone the repository
    const pkgLib = pkg
      .replace(/^(\d)/, "a$1")
      .replace(/^@/, "")
      .replace(/[:\-\./]/g, "_");
    repoDir = `${packageDir}/repo-${pkgLib}`;
    // if the folder is not exist or empty, clone the repo
    if (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length === 0) fs.rmdirSync(repoDir, { recursive: true });
    if (!fs.existsSync(repoDir) && repoUrl) {
      fs.mkdirSync(repoDir);
      // replace ALL protocol patterns in the repo url
      repoUrl = repoUrl.replace(/^(.*?)(github\.com.*)$/i, "https://$2");
      //repoUrl = repoUrl.search(/(.git)$/) === -1 ? `${repoUrl}.git` : repoUrl;
      execSync(`git clone --depth 1 ${repoUrl} ${repoDir}`, { stdio: "pipe", timeout: 10000 });
      return repoDir;
    }
  } catch (e) {
    console.error("extractPkgTestSuite - Failed to clone repository.", e);
  }
  return null;
}
// If function name provided, only fetch those that match the function name
function findTestFiles(pkgPath, pakgName = null, fn = null) {
  let testFiles = [],
    fnPath,
    fnDir,
    fnName,
    fn2 = pakgName,
    pkgDir = pakgName
      .replace(/^(\d)/, "a$1")
      .replace(/^@/, "")
      .replace(/[:\-\./]/g, "_"),
    testParentDir = `${pkgPath}/{node_modules/${pakgName},repo-${pkgDir},"package"}`;
  // if fn is defined, use the function path as test file path (e.g.,locutus.c.math.abs: locutus/c/math/abs.test.js)
  // pluse, consider having test word in any format in the test file name (e.g., abs.test.js, abs.spec.js, abs.index.js, test-abs.js)
  try {
    if (fn) {
      fnPath = fn.split(".");
      fn2 = fnPath.length > 1 ? fnPath[1] : fnPath[0]; // assign.object.merge() // merge.test.js // object.test.js //
      fnName = fnPath.pop();
      fnDir = fnPath.length > 1 ? fnPath.join("/") : null;
      ///test/EleventyExtensionMapTest.js
      // testFileArr has all possible test file names (e.g., abs.test.js, abs.spec.js, abs.index.js, test-abs.js)
      const testFileArr1 = ["{t,T}est", "{s,S}pec", "{i,I}ndex", "{c,C}offee"].map(
        (t) => `${testParentDir}/${fnDir || "**" || fnName}/${fnName || "*"}{,.,-}${t}.{js,coffee,ts,cjs,mjs}`
      );
      const testFileArr2 = ["{t,T}est", "{s,S}pec", "{i,I}ndex", "{c,C}offee"].map(
        (t) => `${testParentDir}/${fnDir || "**" || fnName}/${t}{,.,-}${fnName || "*"}.{js,coffee,ts,cjs,mjs}`
      );
      const testFileArr3 = ["{t,T}est", "{s,S}pec", "{i,I}ndex", "{c,C}offee"].map(
        (t) => `${testParentDir}/${fnDir || "**" || fnName}/${fn2 || "*"}{,.,-}${t}.{js,coffee,ts,cjs,mjs}`
      );
      const testFileArr4 = ["{t,T}est", "{s,S}pec", "{i,I}ndex", "{c,C}offee"].map(
        (t) => `${testParentDir}/${fnDir || "**" || fnName}/${t}{,.,-}${fn2 || "*"}.{js,coffee,ts,cjs,mjs}`
      );
      console.log(testFiles.length);
    } else {
      const tfArr1 = ["{t,T}est", "{s,S}pec", "{i,I}ndex", "{c,C}offee"].map(
        (t) => `${testParentDir}/**/${fn2 || "*"}{,.,-}${t}.{js,coffee,ts,cjs,mjs}`
      );
      const tfArr2 = ["{t,T}est", "{s,S}pec", "{i,I}ndex", "{c,C}offee"].map(
        (t) => `${testParentDir}/**/${t}{,.,-}${fn2 || "*"}.{js,coffee,ts,cjs,mjs}`
      );
      const pathPattern = [
        `${testParentDir}/{test,Test,__tests__,__Tests__,tests,Tests,spec,Spec,coffee,Coffee}/**/*.{js,coffee,ts,cjs,mjs}`,
        `${testParentDir}/**/*{Test,test,Spec,spec,coffee,Coffee}*.{js,coffee,ts,cjs,mjs}`,
        `${testParentDir}/**/{test,Test,__tests__,__Tests__,tests,Tests,spec,Spec,coffee,Coffee}/*.{js,coffee,ts,cjs,mjs}`,
        `${testParentDir}/*{Test,test,Spec,spec,coffee,Coffee}*.{js,coffee,ts,cjs,mjs}`,
        `${testParentDir}/**/*.coffee`,
        ...tfArr1,
        ...tfArr2,
      ];
      testFiles = glob.sync([...pathPattern], {
        ignore: [`${testParentDir}/**/node_modules/**`], // Ignores only sub-package node_modules
      });
    }
    if (testFiles.length > 0) {
      return testFiles;
    }
  } catch (e) {
    console.error("extractPkgTestSuite - Failed to find test files.", e);
  } finally {
    return testFiles.length > 0 ? testFiles : [];
    //[repoDir, testFiles.map(t => t.replace(`${repoDir}/`, ""))] : [];
  }
}

// If function name provided, only fetch those that match the function name
// this version does not support typescript or coffeescript files
function findTestFiles1(repoDir, pakgName = null, fn = null) {
  let testFiles = [],
    fnPath,
    fnDir,
    fnName,
    fn2 = pakgName;
  // if fn is defined, use the function path as test file path (e.g.,locutus.c.math.abs: locutus/c/math/abs.test.js)
  // pluse, consider having test word in any format in the test file name (e.g., abs.test.js, abs.spec.js, abs.index.js, test-abs.js)
  try {
    if (fn) {
      fnPath = fn.split(".");
      fn2 = fnPath.length > 1 ? fnPath[1] : fnPath[0]; // assign.object.merge() // merge.test.js // object.test.js //
      fnName = fnPath.pop();
      fnDir = fnPath.length > 1 ? fnPath.join("/") : null;
      ///test/EleventyExtensionMapTest.js
      // testFileArr has all possible test file names (e.g., abs.test.js, abs.spec.js, abs.index.js, test-abs.js)
      const testFileArr1 = ["{t,T}est", "{s,S}pec", "{i,I}ndex"].map(
        (t) => `${repoDir}/${fnDir || "**"}/${fnName || "*"}{,.,-}${t}.{js,cjs,mjs}`
      );
      const testFileArr2 = ["{t,T}est", "{s,S}pec", "{i,I}ndex"].map(
        (t) => `${repoDir}/${fnDir || "**"}/${t}{,.,-}${fnName || "*"}.{js,cjs,mjs}`
      );
      const testFileArr3 = ["{t,T}est", "{s,S}pec", "{i,I}ndex"].map(
        (t) => `${repoDir}/${fnDir || "**"}/${fn2 || "*"}{,.,-}${t}.{js,cjs,mjs}`
      );
      const testFileArr4 = ["{t,T}est", "{s,S}pec", "{i,I}ndex"].map(
        (t) => `${repoDir}/${fnDir || "**"}/${t}{,.,-}${fn2 || "*"}.{js,cjs,mjs}`
      );
      const allTestFiles = [...testFileArr1, ...testFileArr2, ...testFileArr3, ...testFileArr4]; // TODO: 1- add more patterns 2- the path can start with test/__tests__/tests
      testFiles = glob.sync([...allTestFiles], {
        ignore: [`${repoDir}/**/node_modules/**`], // Ignores only sub-package node_modules
      });
      console.log(testFiles.length);
    } else {
      const tfArr1 = ["{t,T}est", "{s,S}pec", "{i,I}ndex"].map(
        (t) => `${repoDir}/**/${fn2 || "*"}{,.,-}${t}.{js,cjs,mjs}`
      );
      const tfArr2 = ["{t,T}est", "{s,S}pec", "{i,I}ndex"].map(
        (t) => `${repoDir}/**/${t}{,.,-}${fn2 || "*"}.{js,cjs,mjs}`
      );
      const pathPattern = [
        `${repoDir}/{test,Test,__tests__,__Tests__,tests,Tests,spec,Spec,coffee,Coffee}/**/*.{js,cjs,mjs}`,
        `${repoDir}/**/*{Test,test,Spec,spec}*.{js,cjs,mjs}`,
        `${repoDir}/**/{test,Test,__tests__,__Tests__,tests,Tests,spec,Spec}/*.{js,cjs,mjs}`,
        `${repoDir}/*{Test,test,Spec,spec}*.{js,cjs,mjs}`,
        //`${repoDir}/**/*.coffee`,
        ...tfArr1,
        ...tfArr2,
      ];
      testFiles = glob.sync([...pathPattern], {
        ignore: [`${repoDir}/**/node_modules/**`], // Ignores only sub-package node_modules
      });
    }
    if (testFiles.length > 0) {
      return testFiles;
    }
  } catch (e) {
    console.error("extractPkgTestSuite - Failed to find test files.", e);
  } finally {
    return testFiles.length > 0 ? testFiles : [];
    //[repoDir, testFiles.map(t => t.replace(`${repoDir}/`, ""))] : [];
  }
}
module.exports = { importGlobalNameSpace, importModule, fetchMetadata, unpackTarball, cloneRepo, findTestFiles };
