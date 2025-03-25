#!/usr/bin/env node
const fs = require("fs");
const { execSync, spawnSync, spawn, exec } = require("child_process");
const yargs = require("yargs");
const Docker = require("dockerode");
//const { npmInit } = require("../utils/dataUtils.js");
const path = require("path");
const glob = require("glob");
const process = require("process");
//const { fetchMetadata } = require("../fuzzUtils/packageInit.js");
const { githubRequest } = require("/home/tariq/fuzzproto/utils/dataUtils.js");
const lib = require("p-limit");
const { promisify } = require("util");
const appendFile = promisify(fs.appendFile);
const execPromise = promisify(exec);

const argv = yargs
  .option("input", {
    describe:
      "JSON file containing the list of packages (e.g., {package_name, version}) or a single package (e.g., package_name@version)",
    type: "string",
  })
  .option("tool", {
    describe: "the path to the tool to run, use related path from the prject directory, e.g., fuzzproto.mjs",
    type: "string",
    default: "fuzzproto.mjs",
  })
  .option("install", {
    describe: "install the package before run the tool",
    type: "boolean",
    default: false,
  })
  .option("vm", {
    describe: "run the tool in a docker container",
    type: "boolean",
    default: false,
  })
  .option("sandbox", {
    describe: "run the tool in a docker container",
    type: "boolean",
    default: true,
  })
  .option("output", {
    describe: "export to a file or stdout",
    type: "string",
    default: "stdout",
  })
  .option("parallel", {
    describe: "number of concurrent packages to process",
    type: "number",
    default: 1,
  })
  .option("timeout", {
    describe: "timeout for the tool",
    type: "number",
    default: 120000,
  }).argv;
let dataset = [];

//const dataset = fs.readFileSync('./cves_benchmark.txt', { encoding: 'utf8' }).split('\n')

const calcTime = (time, final) => {
  let intervalSec = Math.round((Date.now() - time) / 1000);
  let hours = Math.floor(intervalSec / 3600);
  let minutes = Math.floor((intervalSec % 3600) / 60);
  intervalSec %= 3600;
  const result = final
    ? `Total time: ${hours} hrs (${intervalSec} sec) at ${new Date().toLocaleString()}`
    : `${hours}:${minutes}:${intervalSec}`;
  return result;
};
console.info(`Run at ${new Date().toLocaleString()}`);
let allTimestamp = Date.now();

//const cache = fs.readFileSync('../npm_45k_loc.txt', { encoding: 'utf8' })
let i = 0;
const currentPath = process.cwd();
const projDir = "/home/tariq/bulleyes";
let inputPath = null;
const benchPath = "/home/tariq/benchmark/zd-155";
//const benchPath = "/home/tariq/benchmark/zd-470";
//inputPath = "/home/tariq/bulleyes/raw-data/totalzd/zd526.txt";
//inputPath = "/home/tariq/bulleyes/raw-data/cveWithScore.txt";
inputPath = "/home/tariq/bulleyes/raw-data/compare/zd123/pkgsWithSink.txt";
//const benchPath = "/data/benchmark/excelDS/";
//const inputPath = "/home/tariq/bulleyes/dataset/excelDataset.txt";
//const inputPath = "/home/tariq/bulleyes/raw-data/totalzd/zd526.txt";
// const benchPath = "/home/tariq/benchmark/odgen19";
// inputPath = "/home/tariq/bulleyes/dataset/odgen19-sinks.json";
//const benchPath = "/home/tariq/benchmark/zhou-65";
//  inputPath = "/home/tariq/bulleyes/dataset/zhoe-cve.json";
//inputPath = "/home/tariq/bulleyes/raw-data/zhou65/cvePkgs.txt";
//const benchPath = "/home/benchmark/npm47k/";
//const benchPath = "/data/benchmark/benchmark-zhou-291";
//const benchPath = "/home/tariq/benchmark/benchmark-fuzzproto";
//const benchPath = "/home/tariq/benchmark/ss-100";
//const inputPath = "/home/tariq/bulleyes/dataset/historic_zhou.txt.json";
//inputPath = "/home/tariq/bulleyes/dataset/ss-100_repo.json";
//const inputPath = "/home/tariq/bulleyes/dataset/totalZeroDay_nov5_18_zd95.json";
//const inputPath = "/home/tariq/bulleyes/dataset/cached47k_nov18.json";
//const inputPath = "/home/tariq/fuzzproto/dataset/results/realworld/report_45k_Nov05_proxy.json";
//const inputPath = "/home/tariq/bulleyes/raw-data/fuzzproto.cached47k_nov18.json.2025-02-28_20-41-09.tmp.json";
const input = argv.input ? argv.input : inputPath !== null ? inputPath : null;

if (input)
  if (input.includes(".json")) {
    dataset = JSON.parse(fs.readFileSync(input, { encoding: "utf8" }));
  } else if (input.includes(".txt")) {
    dataset = fs.readFileSync(input, { encoding: "utf8" }).split("\n");
  } else {
    dataset = [input];
  }
else {
  // console.log("Please provide an input file");
  // process.exit();
  dataset = [
    {
      // package_name: "js-data",
      // version: "3.0.11",
      // pkgPath: "/home/tariq/benchmark/zd-155/js_data-3.0.11",
      package_name: "fast-loops",
      version: "1.1.3",
      pkgPath: "/home/tariq/benchmark/zd-470/fast_loops-1.1.3",
    },
  ];
}
// name the file with the date of the run (eg. fuzzproto_2021-09-01_12-00-00.json)
const logText = new Date().toISOString().replace(/:/g, "-").replace(/T/g, "_").split(".")[0];
const suffix = `${input ? input.replace(/.*\/([^\/]+)$/, "$1") : "default"}.${logText}`;
const outputFile = `${projDir}/raw-data/${argv.tool.replace(/.*\/([^\/]+)$/, "$1")}.${suffix}.json`;
const tempFile = `/home/tariq/bulleyes/raw-data/fuzzproto.mjs.pkgsWithSink.txt.2025-03-25_19-30-03.tmp.txt`;
const logFile = "/home/tariq/bulleyes/logs/" + suffix + ".log";
const pLimit = lib.default;
const limit = pLimit(argv.parallel || 1); // Adjust concurrency level

const WRITE_QUEUE = [];
let writing = false;

async function safeWrite(data, file = false) {
  return new Promise((resolve) => {
    WRITE_QUEUE.push({ data, resolve });
    processQueue(file);
  });
}

async function processQueue(file) {
  if (writing || WRITE_QUEUE.length === 0) return;
  writing = true;

  const { data, resolve } = WRITE_QUEUE.shift();
  try {
    if (file) await appendFile(logFile, data + ",\n", "utf-8");
    else await appendFile(tempFile, data + ",\n", "utf-8");
  } catch (err) {
    console.error("Write error:", err);
  } finally {
    writing = false;
    resolve();
    processQueue(); // Process next item
  }
}

(async () => {
  let counter = 0;
  let pkgList = [];
  const tasks = dataset.map((pkg) =>
    limit(async () => {
      counter++;
      // Extract package name and version based on the structure of pkg
      let pkgName, version;
      if (typeof pkg === "object") {
        if (pkg.hasOwnProperty("libDir")) {
          [, pkgName, version] = pkg.libDir.match(/^(@?[^@]+)@?(.*)/);
        } else if (pkg.hasOwnProperty("package")) {
          [, pkgName, version] = pkg.package.match(/^(@?[^@]+)@?(.*)/);
        } else {
          pkgName = pkg.package_name;
          version = pkg.version;
        }
      } else if (typeof pkg === "string") {
        [, pkgName, version] = pkg.split(",")[0].match(/^(@?[^@]+)@?(.*)/);
      }

      const pkgLib =
        pkgName
          .replace(/^(\d)/, "a$1")
          .replace(/^@/, "")
          .replace(/[:\-\./]/g, "_") +
        "-" +
        version;
      const fullPath = `${benchPath}/${pkgLib}`;
      //const pkgPathPattern = `${benchPath}/${pkgLib}/${pkgLib}`; // odgen pattern
      const pkgFolder = glob.sync(fullPath);
      const repoFolderName = [
        pkgName
          .replace(/^(\d)/, "a$1")
          .replace(/^@/, "")
          .replace(/[:\-\./]/g, "_"),
        pkgName,
      ];
      const pkgPath = pkg.pkgPath ? pkg.pkgPath : fullPath;
      pkgObj = {
        package_name: pkgName,
        version: version,
        pkgPath: argv.sandbox ? pkgPath.replace(benchPath, "/usr/src/dataset") : pkgPath,
        options: {
          verbose: pkg?.options?.verbose ?? false,
          sandbox: pkg?.options?.sandbox ?? true,
          vm: pkg?.options?.vm ?? true,
          fixFuzz: pkg?.options?.fixFuzz ?? false,
          maxTestFiles: pkg?.options?.maxTestFiles ?? 1500,
          multiVectors: pkg?.options?.multiVectors ?? false,
        },
      };
      let repoDir =
        glob.sync(`${fullPath}/repo-${repoFolderName[0]}`).length > 0 ? `${fullPath}/repo-${repoFolderName[0]}` : null;
      if (argv.install) {
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
          console.info(`Created: ${fullPath}`);
        } else {
          if (!fs.existsSync(`${fullPath}/node_modules`) || fs.readdirSync(`${fullPath}/node_modules`).length === 0) {
            // console.warning("Folder not found, installing on the current folder..");
            //fs.appendFileSync(outputFile, pkg.package_name + logText + ",\n");
            process.chdir(fullPath);
            try {
              execSync(`npm init -y && npm install ${pkgName}@${version} --legacy-peer-deps`, {
                stdio: "pipe",
                encoding: "utf-8",
              });
            } catch (error) {}
            //process.chdir(currentPath);
            //pkgObj.pkgPath = path.resolve(`./`);
            // Fetch metadata
          }
          try {
            if (!repoDir || (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length === 0)) {
              repoDir = await fetchMetadata(pkgObj, fullPath); // pkg: { package_name, version, pkgLink, pkgPath }
              console.log(`Fetched metadata for ${pkgName}`);
            }
          } catch (error) {
            console.error(`Failed to fetch metadata for ${pkgName}: ${error.message}`);
            fs.appendFileSync(
              path.resolve(`${currentPath}/../logs/createBenchmarkDir.log`),
              pkgName + ": " + error.message + "\n"
            );
          }
        }
      }
      // start exploiting the packages
      try {
        // for the first object, write the opening bracket

        let results = [];
        //results = await exploitPkg(pkgObj);
        //results = await
        //await sandboxRun(pkgObj, pkgLib, argv.timeout);
        //pkgList.push({ package_name: pkgName, version: version });
        //if (results && results.length > 0) {
        // if (argv.output === "stdout") console.log(JSON.stringify({ package_name: pkgName, version: version, results }));
        // else {
        //   if (counter === 0) fs.writeFileSync(outputFile, "[", "utf-8");
        //   // Append the result to the JSON file after processing each package
        //   // fs.appendFileSync(
        //   //   outputFile,
        //   //   JSON.stringify({ package_name: pkgName, version: version, result }) + ",\n",
        //   //   "utf8"
        //   // );
        //   // avoid the last comma
        //   else if (counter === dataset.length - 1)
        //     fs.appendFileSync(
        //       outputFile,
        //       JSON.stringify({ package_name: pkgName, version: version, results: results }) + "]",
        //       "utf-8"
        //     );
        //   // append the results, one by one, to the file, separated by a newline and a comma, so that it can be read as an array of objects, until reaching the end of the loop "the last object should not have a comma"
        //   else
        //     fs.appendFileSync(
        //       outputFile,
        //       JSON.stringify({ package_name: pkgName, version: version, results: results }) + ",\n",
        //       "utf8"
        //     );
        // }
        //} // if results
      } catch (err) {
        console.error(`Error processing ${pkg}:`, err);
      }
    })
  );
  await Promise.all(tasks);
  //read tempFile, fix [] (add [ at the beginning of the file, and replace , with ] at the end), refine the results, and write to outputFile
  try {
    if (fs.existsSync(tempFile)) {
      const tempData = fs.readFileSync(tempFile, { encoding: "utf8" });
      const tempResults = JSON.parse(tempData.replace(/,\n$/, "]").replace(/^\{/, "[{\n"));
      const refinedRes = await refineReport(tempResults);
      fs.writeFileSync(outputFile, JSON.stringify(refinedRes), "utf8");
    }
  } catch (error) {
    console.log(error);
  }
  console.log("All packages processed!");
  //results=Object.values(pkgList.reduce((acc, obj) => {const key = `${obj.results.entryPoint}-${obj.results.sinkLocation?.setProp || "null"}`;  if (!acc[key]) acc[key] = obj; return acc;}, {}));

  // var lib = await import("/home/tariq/bulleyes/p-limit/index.js"); // Install via npm if needed
  // const pLimit = lib.default;
  // const limit = pLimit(5); // Adjust concurrency level
  process.chdir(currentPath);
  // for (let pkg of dataset) {
  //   //const promises = dataset.map((pkg) => {
  //   //});

  // }
})()
  .catch((e) => {
    console.error(e);
  })
  .finally(() => {
    const time = calcTime(allTimestamp, true);
    let intervalSec = Math.round((Date.now() - allTimestamp) / 1000);
    console.info(
      `Finish the analysis ${
        Math.round((intervalSec / 60 / 60) * 10) / 10
      } hrs (${intervalSec} sec) at ${new Date().toLocaleString()}`
    );
    process.exit(0);
  });

async function sandboxRun(pkg, pkgLib, timeout = 120000) {
  let toolOutput = [];
  const docker = new Docker();
  const CONTAINER_TIMEOUT = timeout;
  const CHECK_INTERVAL = 5000; // 5 seconds
  let container;
  try {
    container = await docker.createContainer({
      Image: "bulleyes:latest",
      //Cmd: [`ls`, `-la`, `/usr/src/app/`],
      Cmd: [
        "/bin/bash",
        "-c",
        `cd /usr/src/dataset/${pkgLib} && \
          node /usr/src/app/${argv.tool} '${JSON.stringify(pkg)}'`,
      ],
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      HostConfig: {
        //AutoRemove: true,
        Mounts: [
          {
            Type: "bind",
            Source: projDir,
            Target: "/usr/src/app",
            ReadOnly: true, // Specify read/write permissions
          },
          {
            Type: "bind",
            Source: benchPath,
            Target: "/usr/src/dataset",
            ReadOnly: false, // Specify read/write permissions
          },
        ],
        //CapDrop: ['ALL'], // Drop all Linux capabilities, in some systems, this option may break the tool
        //ReadonlyRootfs: true, // Mount the container's root filesystem as read-only
        //SecurityOpt: ['no-new-privileges'], // Prevent the container from gaining additional privileges
        //Privileged: false, // Run the container in unprivileged mode
      },
    });

    const startTime = Date.now();
    await container.start();

    // Monitor container runtime to enforce timeout, every CHECK_INTERVAL, check if timeout reached
    const interval = setInterval(async () => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > CONTAINER_TIMEOUT) {
        console.error(`Timeout reached. Stopping container: ${container.id}`);
        safeWrite(JSON.stringify(`{"package": ${pkg.package_name}@${pkg.version}}`), logFile);
        clearInterval(interval);
        try {
          await container.stop();
          await container.remove();
        } catch (cleanupError) {
          console.error(`Cleanup error for container ${container.id}:`, cleanupError);
        }
      }
    }, CHECK_INTERVAL);

    // Use Promise.race to handle timeouts
    // const timeoutPromise = new Promise((_, reject) => {
    //   setTimeout(() => reject("Timeout"), timeout);
    // });
    // const timeoutPromise = new Promise((resolve, reject) => {
    //   setTimeout(async () => {
    //     console.warn(`Timeout reached for ${pkgLib}`);
    //     if (container) await container.stop().catch(() => {});
    //     resolve("timeout");
    //   }, timeout);
    // });

    //const outputPromise = new Promise(async (resolve, reject) => {
    try {
      const stream = await container.attach({ stream: true, stdout: true, stderr: true });

      stream.setEncoding("utf8");

      let buffer = ""; // Temporary buffer for incomplete chunks

      stream.on("data", async (chunk) => {
        if (chunk.search(/<DETECTION>(.*)<\/DETECTION>/) > -1) {
          const parsed = JSON.parse(chunk.trim().match(/<DETECTION>(.*)<\/DETECTION>/)[1]);
          toolOutput.push(parsed);
          console.log("Detection Found");
          // fs.appendFileSync(
          //   tempFile,
          //   JSON.stringify({ package: `${pkg.package_name}@${pkg.version}`, results: parsed }) + ",\n",
          //   "utf8"
          // );
          safeWrite(JSON.stringify({ package: `${pkg.package_name}@${pkg.version}`, results: parsed }));
          //console.log(JSON.parse(chunk.match(/<DETECTION>(.*)<\/DETECTION>/)[1]));
        } else {
          buffer += chunk; // Append incoming data

          let match;
          while ((match = buffer.match(/<DETECTION>(.*?)<\/DETECTION>/s))) {
            try {
              const parsed = JSON.parse(match[1].trim());
              toolOutput.push(parsed);
              console.log("Detection Found");

              // Save result
              safeWrite(JSON.stringify({ package: `${pkg.package_name}@${pkg.version}`, results: parsed }));

              // Remove processed data from buffer
              buffer = buffer.replace(match[0], "");
            } catch (err) {
              console.error("Error parsing detection:", err.message);
              break; // Prevent infinite loops on malformed data
            }
          }
        }
      });

      stream.on("end", () =>
        //    resolve(toolOutput)
        console.log("End of stream")
      );

      stream.on("error", (err) =>
        //resolve(toolOutput)
        console.error(err.message)
      );
    } catch (err) {
      //reject(`Attach error: ${err.message}`);
    }
    //});

    // Wait for container completion
    await container.wait();
    clearInterval(interval);
    console.log(`Container ${container.id} completed successfully.`);

    //return await Promise.race([outputPromise, timeoutPromise]);
    //return await outputPromise;
    //return toolOutput;
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    if (container) {
      // Before stopping/removing, ensure container exists and is still running
      const containerStatus = await container.inspect();
      if (containerStatus.State.Running) {
        await container.stop();
      }
      await container.remove({ force: true });
    }
    // return toolOutput;
  }
  return toolOutput;
}

async function fetchMetadata(pkgData, pkgPath) {
  // pkgData: { package_name, version, repo, pkgPath }
  // fetchType: tarball, repo ; action: fetch, install
  const fs = require("fs").promises;
  let pkgMeta, pkgFetch, repoUrl;
  const pkgLib = pkgData.package_name
    .replace(/^(\d)/, "a$1")
    .replace(/^@/, "")
    .replace(/[:\-\./]/g, "_");
  const repoDir = `${pkgPath}/repo-${pkgLib}`;
  const version =
    pkgData.version && typeof pkgData.version === "string" && pkgData.version !== "" ? pkgData.version : false;
  const repo = pkgData.repo && typeof pkgData.repo === "string" && pkgData.repo !== "" ? pkgData.repo : false;

  try {
    const repoExists = await fs
      .access(repoDir)
      .then(() => true)
      .catch(() => false);
    if (repoExists && (await fs.readdir(repoDir)).length > 0) return repoDir; // if the repo is already cloned, return the path

    if (!repo) {
      // Fetch package metadata from npm registry
      pkgFetch = await fetch(`https://registry.npmjs.org/${pkgData.package_name}`).then((res) => res.json());
      if (pkgFetch.error || !pkgFetch.versions) return false;
      if (!version) pkgMeta = pkgFetch.versions[pkgFetch["dist-tags"].latest];
      else pkgMeta = pkgFetch.versions[version];
    }

    // If repository is included in the metadata, extract the repository URL
    if (pkgMeta.repository && Object.values(pkgMeta.repository).length > 0) {
      repoUrl = extractPkgRepo(pkgMeta.repository);
      if (repoUrl) {
        const repoExists = await fs
          .access(repoDir)
          .then(() => true)
          .catch(() => false);
        if (repoExists && (await fs.readdir(repoDir)).length === 0) await fs.rmdir(repoDir, { recursive: true });

        if (!repoExists && repoUrl) {
          await fs.mkdir(repoDir);
          repoUrl = repoUrl.replace(/^([^/]+\/\/)?(.*)/, "https://$2");
          execSync(`git clone --depth 1 ${repoUrl} ${repoDir}`, { stdio: "pipe", timeout: 120000 });
          return repoDir;
        }
      }
    } else {
      // If repo is not provided, fetch the tarball URL
      const tarballUrl = pkgMeta.dist.tarball;
      const untar = await unpackTarball(tarballUrl, pkgPath);
      const untarPath = path.dirname(untar);
      const untarDir = untar.replace(untarPath, `repo-${pkgLib}`);
      await fs.rename(untar, untarDir);
      return untarDir;
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example of an unpackTarball function (replace this with actual logic)
async function unpackTarball(tarballUrl, pkgPath) {
  // Example unpack tarball function
  // Simulate unpacking the tarball and returning the directory path
  return path.join(pkgPath, "unpacked");
}

// Example of extractPkgRepo function (replace this with actual logic)
function extractPkgRepo(repository) {
  return repository.url || repository.directory || "";
}

async function refineReport(pkgReports) {
  let refinedRes = Object.values(
    pkgReports.reduce((acc, obj) => {
      const pkg = obj.package;
      const key = `${obj.results.entryPoint}-${obj.results.sinkLocation?.setProp || "null"}`;

      if (!acc[pkg]) acc[pkg] = { package: pkg, results: [] };

      if (
        !acc[pkg].results.some(
          (r) =>
            r.entryPoint === obj.results.entryPoint && r.sinkLocation?.setProp === obj.results.sinkLocation?.setProp
        )
      ) {
        acc[pkg].results.push(obj.results);
      }

      return acc;
    }, {})
  );
  for (const pkg of refinedRes) {
    const [, pkgName, version] = pkg.package.match(/^(@?[^@]+)@?(.*)/);
    const cveMap = new Map(); // Map each package to its CVEs
    const ppMap = new Map();
    const advisories = await githubRequest(`/advisories?ecosystem=npm&affects=${pkgName}`);
    if (advisories.length > 0)
      if (pkg.results && pkg.results.length > 0) {
        for (const result of pkg.results) {
          // take the last part of the entry point
          const entryFn =
            result.entryPoint && result.entryPoint.includes(".")
              ? result.entryPoint.split(".").pop()
              : result.entryPoint;
          const sinks = Object.values(result.sinkLocation)
            .filter(Boolean)
            .map((s) => {
              console.log(s);
              const match = s.match(/(at\s+(\w+))?(?:.*\/)?([^\/:\)]+)/);
              if (match) {
                return {
                  functionName: match[2] || "N/A", // Default to "N/A" if function name is missing
                  fileName: match[3], // Extracted file name
                };
              } else {
                return {
                  functionName: "N/A", // Default to "N/A" if no match
                  fileName: "N/A", // Default to "N/A" if no match
                };
              }
            });
          if (entryFn) {
            if (advisories.length > 0) {
              for (const advisory of advisories) {
                const advDesc = advisory.description;
                const CVE = advisory.cve_id || advisory.ghsa_id;
                if (advisory.vulnerabilities[0].package.name === pkgName) {
                  // Check if the key (pkgName) exists in the Map
                  if (!cveMap.has(pkgName)) {
                    // If the key doesn't exist, initialize it with an empty array
                    cveMap.set(pkgName, []);
                  }
                  if (!cveMap.get(pkgName).includes(CVE)) cveMap.get(pkgName).push(CVE);
                  if (advDesc.includes(`${entryFn}()`)) {
                    if (!ppMap.has(pkgName))
                      // If the key doesn't exist, initialize it with an empty array
                      ppMap.set(pkgName, []);

                    if (!ppMap.get(pkgName).includes(CVE)) ppMap.get(pkgName).push(CVE);
                  }
                  if (
                    sinks.some((sink) => {
                      // Check if the searchString matches any key or value in the log object
                      return Object.entries(sink).some(([key, value]) => {
                        // Convert both key and value to strings and check for a match
                        return advDesc.includes(key) || advDesc.includes(String(value));
                      });
                    })
                  ) {
                    if (!ppMap.has(pkgName))
                      // If the key doesn't exist, initialize it with an empty array
                      ppMap.set(pkgName, []);

                    if (!ppMap.get(pkgName).includes(CVE)) ppMap.get(pkgName).push(CVE);
                  }
                }
                // add cveMap to the pkg object
                pkg.cveHistory = Array.from(cveMap.get(pkgName) || []);
                pkg.ppHistory = Array.from(ppMap.get(pkgName) || []);
              }
            }
          }
        }
      }
  }
  // let advisories;
  // try {
  //   console.log("Searching for relevant CVEs ...");
  //   advisories = await githubRequest(`/advisories?ecosystem=npm&affects=${pkgInfo.package_name}`);
  // } catch (e) {
  //   console.log("error fetching from github advisory database. ", e);
  // }
  // try {
  //   if (advisories.length > 0) {
  //     //versionReport.prevReports = advisories.map(a => a.cve_id);
  //     //let jbxReports = pkgInfo.reports && pkgInfo.reports.length > 0 ? pkgInfo.reports : null;
  //     if (pkgInfo.results.length > 0)
  //       for (const reportVer of pkgInfo.results) {
  //         const entryPoint = reportVer.entryPoint.match(/\.?([a-zA-Z-_0-9]*)$/)[1];
  //         for (const advisory of advisories) {
  //           // array of all texts surrounded by ``
  //           const advDesc = advisory.description.match(/`([^`]*)`/g)?.map((match) => match.slice(1, -1));
  //           const CVE = advisory.cve_id || advisory.ghsa_id;
  //           //if (advisory.length > 0) {
  //           //advisory.forEach(vuln => {
  //           // check if the function is mentioned in the advisory
  //           if (
  //             advisory.vulnerabilities[0].package.name === pkgInfo.package_name ||
  //             (advDesc && advDesc.some((extracted) => extracted.includes(entryPoint)))
  //           ) {
  //             //pkgInfo[verNo].reports[reportNo].duplicates.push(pkgInfo.cveId);
  //             if (!Reflect.has(reportVer, "matchedCVE")) reportVer.matchedCVE = [];
  //             reportVer.matchedCVE.push(CVE);
  //             //console.log(`${reportFunc.func_path} has a match in ${advisory.ghsa_id}`)
  //           }
  //           //});
  //         }
  //       }
  //   }
  // } catch (e) {
  //   console.log("error while processing advisories: ", e.message);
  // }
  return refinedRes;
}
