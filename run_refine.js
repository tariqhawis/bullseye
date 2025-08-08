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
    default: "fuzzproto.beta.mjs",
    //default: "baselines/fuzzproto_fnEnum.mjs",
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
  .option("refineInput", {
    describe: "the input file to be refined, default is the temp file",
    type: "string",
    default: null,
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
console.info(`Run at ${new Date().toLocaleString()}, started with the following options:`);
console.info(`Tool ${argv.tool}`);
console.info(`Input: ${argv.input}`);
console.info(`Install: ${argv.install}`);
console.info(`VM: ${argv.vm}`);
console.info(`Sandbox: ${argv.sandbox}`);
console.info(`Output: ${argv.output}`);
console.info(`Parallel: ${argv.parallel}`);
console.info(`CVE Check: ${argv.cveCheck}`);
console.info(`Timeout: ${argv.timeout} ms`);

let allTimestamp = Date.now();

//const cache = fs.readFileSync('../npm_45k_loc.txt', { encoding: 'utf8' })
let i = 0;
const currentPath = process.cwd();
const projDir = "/home/tariq/bulleyes2";
let inputPath = null;

const benchPath = "/home/benchmark/npm5k";
inputPath = "/home/tariq/bulleyes2/dataset/npm6588.json";

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
      package_name: "fun-map",
      version: "3.3.1",
      pkgPath: "/data/benchmark/odgen19/fun_map-3.3.1",
      // package_name: "lodash@4.17.4",
      // version: "4.17.4",
      // pkgPath: "/home/tariq/benchmark/arteau-15/lodash-4.17.4",
    },
  ];
}
// name the file with the date of the run (eg. fuzzproto_2021-09-01_12-00-00.json)
const logText = new Date().toISOString().replace(/:/g, "-").replace(/T/g, "_").split(".")[0];
const suffix = `${input ? input.replace(/.*\/([^\/]+)$/, "$1") : "default"}.${logText}`;

const dirPath = "benchmark/bulleyes";
const outputFile = `${projDir}/${dirPath}/${argv.tool.replace(/.*\/([^\/]+)$/, "$1")}.${suffix}.json`;
const tempFile = `${projDir}/${dirPath}/${argv.tool.replace(/.*\/([^\/]+)$/, "$1")}.${suffix}.txt`;
const logFile = "/home/tariq/bulleyes2/logs/" + suffix + ".log";
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
  
  try {
    let refineInput = argv.refineInput ? argv.refineInput : tempFile;
    if (fs.existsSync(refineInput)) {
      const tempData = fs.readFileSync(refineInput, { encoding: "utf8" });
      const tempResults = JSON.parse(tempData.replace(/,\n$/, "]").replace(/^\{/, "[{\n")).filter(Boolean);
      const refinedRes = await refineReport(tempResults);
      fs.writeFileSync(`${refineInput}_refined.json`, JSON.stringify(refinedRes), "utf8");
    } //else fs.writeFileSync(outputFile, JSON.stringify(allResults), "utf8");
  } catch (error) {
    console.log(error);
  }

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
  let duration = 0;
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
    duration = calcTime(startTime, false);
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
  return { toolOutput, duration };
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
  
  return refinedRes;
}

async function githubRequest1(query, method = "GET", API = "token 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") {
  try {
    const { Octokit } = await import("octokit");
    //const octokit = new Octokit({});
    const octokit = new Octokit({
      auth: API,
    });
    switch (method) {
      case "GET":
        const nextPattern = /(?<=<)([\S]*)(?=>; rel="Next")/i;
        let pagesRemaining = true;
        let data = [];

        while (pagesRemaining) {
          const response = await octokit.request(`GET ${query}`, {
            per_page: 100,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
            },
          });

          const parsedData = parseData(response.data); // parseData need to be imported
          data = [...data, ...parsedData];

          const linkHeader = response.headers.link;

          pagesRemaining = linkHeader && linkHeader.includes(`rel=\"next\"`);

          if (pagesRemaining) {
            query = linkHeader.match(nextPattern)[0];
          }
        }
        return data;

      case "POST":
        //const [fileName, processedContent] = createAdvisory(query.content)
        const fileName = `Advisory_${query.pkg.replace("/", "-")}.md`;
        const desc = `Advisory for ${query.pkg}`;

        return await octokit.request("POST /gists", {
          description: desc,
          public: false,
          files: {
            [fileName]: {
              content: query.content,
            },
          },
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
    }
  } catch (error) {
    throw error;
  }
}
