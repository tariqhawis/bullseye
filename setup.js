#!/usr/bin/env node
const fs = require("fs");
const { execSync, spawnSync, spawn, exec } = require("child_process");
const yargs = require("yargs");
const Docker = require("dockerode");
const APIKEY = "token ghp_oDZnjOh1ww5Xrm4UKQBEAXXFs6feCe1h1SSS"; // Replace with your actual GitHub API token
const path = require("path");
const glob = require("glob");
const process = require("process");
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
  .option("npmPath", {
    describe: "NPM package installation path, e.g., /home/benchmark",
    type: "string",
  })
  .option("tool", {
    describe: "the path to the tool to run, use related path from the prject directory, e.g., scripts/fuzzproto.mjs",
    type: "string",
    default: "scripts/bullseye.mjs",
  })
  .option("install", {
    describe: "install the package before run the tool, if not already installed",
    type: "boolean",
    default: true,
  })
  .option("vm", {
    describe: "run the tool in a docker container",
    type: "boolean",
    default: false,
  })
  .option("latest", {
    describe: "rsetup the lastest version of the package from npm registry",
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
const projDir = "/home/tariq/bullseye";
let inputPath = null;

const benchPath = argv.npmPath; // "/home/benchmark/npm47k_Jul21";
//inputPath = "/home/tariq/bullseye/dataset/hd_pkgs.txt";

const input = argv.input ? argv.input : inputPath !== null ? inputPath : null;

if (input)
  if (input.includes(".json")) {
    dataset = JSON.parse(fs.readFileSync(input, { encoding: "utf8" }));
  } else if (input.includes(".txt")) {
    dataset = fs
      .readFileSync(input, { encoding: "utf8" })
      .split("\n")
      .map((line) => {
        return line.trim();
      });
  } else {
    dataset = [input];
  }
// name the file with the date of the run (eg. fuzzproto_2021-09-01_12-00-00.json)
const logText = new Date().toISOString().replace(/:/g, "-").replace(/T/g, "_").split(".")[0];
const suffix = `${input ? input.replace(/.*\/([^\/]+)$/, "$1") : "default"}.${logText}`;
const outputFile = `${projDir}/raw-data/${argv.tool.replace(/.*\/([^\/]+)$/, "$1")}.${suffix}.json`;
const tempFile = `${projDir}/raw-data/${argv.tool.replace(/.*\/([^\/]+)$/, "$1")}.${suffix}.tmp.txt`;
const pLimit = lib.default;
const limit = pLimit(argv.parallel || 1); // Adjust concurrency level

const WRITE_QUEUE = [];
let writing = false;

async function safeWrite(data) {
  return new Promise((resolve) => {
    WRITE_QUEUE.push({ data, resolve });
    processQueue();
  });
}

async function processQueue() {
  if (writing || WRITE_QUEUE.length === 0) return;
  writing = true;

  const { data, resolve } = WRITE_QUEUE.shift();
  try {
    await appendFile(tempFile, data + ",\n", "utf-8");
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
        [, pkgName, version] = pkg.match(/^(@?[^@]+)@?(.*)/);
      }
      if (argv.latest) {
        const response = await fetch(`https://registry.npmjs.org/${pkgName}`);
        pkgMeta = await response.json();
        version = pkgMeta.versions[pkgMeta["dist-tags"].latest].version;
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
          fixFuzz: pkg?.options?.fixFuzz ?? true,
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
              // 1- first, uncomment this branch to install the package with npm init
              execPromise(
                `npm init -y && npm install ${pkgName}@${version} --legacy-peer-deps && npm install ${pkgName}@${version}`,
                {
                  stdio: "pipe",
                  encoding: "utf-8",
                }
              );
            } catch (error) {}
            //process.chdir(currentPath);
            //pkgObj.pkgPath = path.resolve(`./`);
            // Fetch metadata
          }
          // 2- then, Comment the previous one, and uncomment this branch to fetch metadata if the folder is empty.
          // try {
          //   if (!repoDir || (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length === 0)) {
          //     repoDir = await fetchMetadata(pkgObj, fullPath); // pkg: { package_name, version, pkgLink, pkgPath }
          //     console.log(`Fetched metadata for ${pkgName}`);
          //   }
          // } catch (error) {
          //   console.error(`Failed to fetch metadata for ${pkgName}: ${error.message}`);
          //   fs.appendFileSync(
          //     path.resolve(`${currentPath}/../logs/createBenchmarkDir.log`),
          //     pkgName + ": " + error.message + "\n"
          //   );
          // }
        }
      }
    })
  );
  await Promise.all(tasks);

  console.log("All packages processed!");

  process.chdir(currentPath);
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

async function fetchMetadata(pkgData, pkgPath) {
  const fs = require("fs").promises; // Use fs.promises API
  const fetch = require("node-fetch");
  const { exec } = require("child_process");
  const path = require("path");
  const util = require("util");

  const execPromise = util.promisify(exec); // Promisify exec for async execution

  let pkgMeta, repoUrl;
  const pkgLib = pkgData.package_name
    .replace(/^(\d)/, "a$1")
    .replace(/^@/, "")
    .replace(/[:\-\./]/g, "_");
  const repoDir = path.join(pkgPath, `repo-${pkgLib}`);
  const version =
    pkgData.version && typeof pkgData.version === "string" && pkgData.version !== "" ? pkgData.version : false;

  // Check if a directory exists and is not empty
  async function existsAndNotEmpty(dir) {
    try {
      const files = await fs.readdir(dir);
      return files.length > 0;
    } catch {
      return false;
    }
  }

  // Clone a git repository
  async function cloneRepo(repoUrl, repoDir) {
    try {
      repoUrl = repoUrl.replace(/^([^/]+\/\/)?(.*)/, "https://$2"); // Normalize URL
      await fs.mkdir(repoDir, { recursive: true });
      await execPromise(`git clone --depth 1 ${repoUrl} ${repoDir}`);
      return repoDir;
    } catch (error) {
      console.error("Git Clone Error:", error.message);
      return false;
    }
  }

  // Unpack tarball and rename extracted directory
  async function unpackTarball(tarballUrl, pkgPath, newDirName) {
    const tar = require("tar");
    const downloadPath = path.join(pkgPath, "temp.tar.gz");
    const extractPath = path.join(pkgPath, "temp_extract");

    try {
      // Download the tarball
      const res = await fetch(tarballUrl);
      const fileStream = await fs.writeFile(downloadPath, Buffer.from(await res.arrayBuffer()));

      // Extract tarball
      await fs.mkdir(extractPath, { recursive: true });
      await tar.x({ file: downloadPath, cwd: extractPath });

      // Find the extracted directory
      const extractedDirs = await fs.readdir(extractPath);
      const extractedDir = extractedDirs.find((dir) => dir.startsWith(newDirName)) || extractedDirs[0];

      if (!extractedDir) throw new Error("No extracted folder found");

      const extractedPath = path.join(extractPath, extractedDir);
      const finalPath = path.join(pkgPath, newDirName);

      await fs.rename(extractedPath, finalPath);
      await fs.rm(downloadPath); // Cleanup

      return finalPath;
    } catch (error) {
      console.error("Tarball Extraction Error:", error.message);
      return false;
    }
  }

  // Extract repository URL from package metadata
  function extractPkgRepo(repository) {
    return repository.url || repository.directory || "";
  }

  try {
    if (await existsAndNotEmpty(repoDir)) return repoDir;

    // Fetch package metadata if repository URL is not provided
    if (!pkgData.repo) {
      const response = await fetch(`https://registry.npmjs.org/${pkgData.package_name}`);
      pkgMeta = await response.json();
      if (pkgMeta.error || !pkgMeta.versions) return false;
      pkgMeta = version ? pkgMeta.versions[version] : pkgMeta.versions[pkgMeta["dist-tags"].latest];
    }

    // If repository exists, clone it
    if (pkgMeta.repository && Object.values(pkgMeta.repository).length > 0) {
      repoUrl = extractPkgRepo(pkgMeta.repository);
      if (repoUrl) return await cloneRepo(repoUrl, repoDir);
    }

    // If no repository, fetch tarball
    if (pkgMeta.dist && pkgMeta.dist.tarball) {
      return await unpackTarball(pkgMeta.dist.tarball, pkgPath, `repo-${pkgLib}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
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
  refinedRes.map(async (pkg) => {
    const [, pkgName, version] = pkg.package.match(/^(@?[^@]+)@?(.*)/);
    const cveMap = new Map(); // Map each package to its CVEs
    const advisories = await githubRequest(`/advisories?ecosystem=npm&affects=${pkgName}`);
    if (pkg.results && pkg.results.length > 0) {
      for (const result of pkg.results) {
        // take the last part of the entry point
        const entryFn =
          result.entryPoint && result.entryPoint.includes(".") ? result.entryPoint.split(".").pop() : result.entryPoint;
        if (entryFn) {
          if (advisories.length > 0) {
            for (const advisory of advisories) {
              const advDesc = advisory.description;
              const CVE = advisory.cve_id || advisory.ghsa_id;
              if (advisory.vulnerabilities[0].package.name === pkgName) {
                cveMap.get(pkgName).push(CVE);
                if (advDesc.includes(`${entryFn}()`)) {
                  cveMap.get(pkgName).push(CVE);
                }
                if (advDesc.includes(`${sinkLocation.setProp}`) || advDesc.includes(`${sinkLocation.setProto}`)) {
                  cveMap.get(pkgName).push(CVE);
                }
              }
              // add cveMap to the pkg object
              pkg.cveHistory = Array.from(cveMap);
            }
          }
        }
      }
    }
  });

  return refinedRes;
}

async function githubRequest(query, method = "GET", API = APIKEY) {
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
