/* This utility file for handling the input or generated output */
const { join } = require("path");
const fs = require("fs");
const { VM } = require("vm2");
const os = require("os");
const { glob } = require("glob");
const mongoose = require("mongoose");
mongoose.pluralize(null);
const mongo = require("./mongoConnect.js");

const datetime = function () {
  var date = new Date();
  return date.toISOString();
};

async function dbUpdate(model, schema, fullReport) {
  var options = { upsert: true, new: true, useFindAndModify: false };
  let Model;
  let jbxReports = Array.isArray(fullReport) ? fullReport : [fullReport];
  try {
    await mongo.connect();
    for (const record of jbxReports) {
      let filter = record.hasOwnProperty("dataset")
        ? { dataset: "SOME VALUE" }
        : {
            package_name: record?.package_name,
            version: record?.version,
          };
      //if (model == 'Registry') filter = { dataset: record.dataset, tool: record.tool }
      //Model = mongoose.model(model0, schema);
      try {
        // Check if a record with matching name and version exists, if not, add a new record
        await mongoose.model(model, schema).findOneAndUpdate(filter, { $set: record }, options);
        console.log(`[-] New record added to ${model}`);
      } catch (e) {
        console.error(e);
      }
    }
  } catch (e) {
    console.log("unexpected error when invoke dbUpdate: ", e.message);
  } finally {
    await mongoose.connection.close();
  }
}

async function dataFetch(args) {
  const { CacheSchema, DatasetSchema } = require("./MongoModels.js");

  let cachedDocs;
  let datasetDocs;
  let field, value;
  try {
    // --dataset
    if (args.dataset) {
      // --filter
      if (args.filter) {
        [field, value] = args.filter.split("=");
      }
      if (args.dataset.search(/\.json/) != -1) {
        datasetDocs = fs.existsSync(args.dataset)
          ? JSON.parse(fs.readFileSync(args.dataset, { encoding: "utf8" }))
          : null;
        datasetDocs = datasetDocs.filter((item) => item[field] === value);
      } else if (args.dataset.search(/^\s*\[\s*{\s*".+":\s*".+"\s*}\s*]\s*$/) != -1) {
        datasetDocs = JSON.parse(args.dataset);
      } else {
        await mongo.connect();
        let schema = mongoose.model(args.dataset, DatasetSchema);
        datasetDocs = await schema
          .find({ [field]: value })
          .select("package_name version")
          .lean();
        await mongoose.connection.close();
      }
      //--format
      if (args.format == "package@version") {
        let converter = [];
        datasetDocs = datasetDocs.map((item) => `${item.package_name}@${item.version}`);
      }
    }
    // --input
    else if (args.input) {
      //datasetDocs = [{ package_name: args['input'].split('@')[0], version: args['input'].split('@')[1] }]
      datasetDocs =
        args.input.search(/^(.*?)@([^@\/]+)$/) > -1
          ? [
              {
                package_name: args.input.match(/^(.*?)@([^@\/]+)$/)[1],
                version: args.input.match(/^(.*?)@([^@\/]+)$/)[2],
              },
            ]
          : [args.input];
      //datasetDocs = args['input'].search(/^\s*\[\s*(".+",?)*\s*\]\s*$/) > 0 ?
      //g_dataset.name = args.input
    } else {
      throw new Error("Invalid schema name or not provided");
    }
    // --cache
    if (args.cache) {
      // the cache source of which the scanner will check with to prevent re-scannig package@version
      if (args.cache.search(/\.json/) != -1) {
        // cache as a json file
        cachedDocs = JSON.parse(fs.readFileSync(args.cache, { encoding: "utf8" }));
      } else {
        // cache as a schema
        await mongo.connect();
        let cacheM = mongoose.model(args.cache, CacheSchema);
        if (!datasetDocs[0].version) cachedDocs = await cacheM.find({}).select("package_name").lean();
        else cachedDocs = await cacheM.find({}).select("package_name version").lean();
        await mongoose.connection.close();
      }
    }
    // For faster lookup
    const registryMap = new Map();
    cachedDocs?.forEach((item) => {
      let key;
      if (!item.version) key = `${item.package_name}`;
      else key = `${item.package_name}-${item.version}`;
      registryMap.set(key, true);
    });
    // filter cached packages
    const unscanned = datasetDocs.filter((item) => {
      let key;
      if (!item.version) key = `${item.package_name}`;
      else key = `${item.package_name}-${item.version}`;
      return !registryMap.has(key);
    });
    return unscanned;
  } catch (err) {
    console.error("An error while fetching from the database ", err);
  }
  return datasetDocs;
}

async function npmInit(pkgName, verStat) {
  let pkgDetails, repoUrl, testFiles, downloadsJson;
  try {
    // 1. Fetch Package's Metadata
    pkgFetch = await fetch(`https://registry.npmjs.org/${pkgName}`).then((res) => res.json());
    if (pkgFetch.error || !pkgFetch.versions) return false;
    //let license = null;
    //license = pkgdetails.versions[pkgdetails['dist-tags'].latest].license ? pkgdetails.versions[pkgdetails['dist-tags'].latest].license :
    // pkgdetails.versions[pkgdetails['dist-tags'].latest].licenses['type'];
    pkgDetails = pkgFetch.versions[pkgFetch["dist-tags"].latest];
    downloadsJson = await fetch(`https://api.npmjs.org/downloads/point/last-week/${pkgName}`).then((res) => res.json());
    pkgDetails["last_week"] = downloadsJson.downloads;
    try {
      // 2. Extract package's repository, first, make sure the repository is included within the metadata
      if (pkgDetails.repository && Object.values(pkgDetails.repository).length > 0) {
        repoUrl = extractPkgRepo(pkgDetails.repository);
      }
      // 3. Extract package's test suite by cloning the repository
      testFiles = extractPkgTestSuite(pkgDetails, repoUrl);
    } catch (error) {
      console.log(error.message);
    }
    return {
      package_name: pkgName,
      version: verStat === true || verStat === "" ? pkgDetails.version : verStat,
      repository: repoUrl,
      maintainers: pkgDetails.maintainers,
      datetime: datetime(),
      testFiles: testFiles && testFiles.length > 0 ? testFiles : [],
      downloads: pkgDetails["last_week"],
      reports: [],
    };
  } catch (error) {
    console.log(error);
  }
}

function extractPkgRepo(pkgRepo) {
  try {
    return [pkgRepo].map((repo) => {
      //const repoProps = pkgDetails.repository;
      let repoUrl;
      const extractRepo = (r) => {
        if (
          typeof r === "string" &&
          r.search(/(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/) > -1
        )
          return r.match(/(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/)[2];
        return "";
      };
      //Object.prototype.hasOwnProperty.call(g, 'url')
      // Iterate over the properties of the repository object
      ///((git|ssh|http(s)?)(:(\/\/)?))?(git@)?github\.com(\/|:)?/
      ///((git|ssh|http(s)?)(:(\/\/)?))?(git@)?github\.com(\/|:)([^\/]+\/[^\/#.]+)#?(.git)?/
      if (extractRepo(repo) || (Reflect.has(repo, "url") && extractRepo(repo.url)))
        repoUrl =
          typeof repo === "string" ? extractRepo(repo) : Reflect.has(repo, "url") ? extractRepo(repo.url) : null;
      else {
        for (const prop in repo) {
          // Check if the property value matches a URL pattern
          repoUrl = extractRepo(repo[prop]) ?? null;
          // Exit the loop if URL is found
        }
      }
      return repoUrl; // Return null if no URL is found
    })[0];
  } catch (error) {
    console.log(error.message);
  }
}

function extractPkgTestSuite(packageJson, repoUrl) {
  let testFiles = [],
    tempDir;
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
    tempDir = fs.mkdtempSync(join(os.tmpdir(), "repo-"));
    try {
      repoUrl = repoUrl.search(/(.git)$/) === -1 ? `${repoUrl}.git` : repoUrl;
      execSync(`git clone --depth 1 ${repoUrl} ${tempDir}`, { stdio: "ignore", timeout: 10000 });
      testFiles = glob.sync(
        [`${tempDir}/{test,__tests__,tests}/**/*{test,spec,index}*.js`, `${tempDir}/**/*{test,spec}.js`],
        {
          ignore: [`${tempDir}/**/node_modules/**`], // Ignores only sub-package node_modules
        }
      );
    } catch (e) {
      //console.error('extractPkgTestSuite - Failed to clone repository or find test files.', e);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  return testFiles.length > 0 ? testFiles.map((t) => t.replace(`${tempDir}/`, "")) : [];
}

function createAdvisory(vulnPkg) {
  //pkg:
  /*[
    {
      package_name: "package_name",
      version: "version",
      type: "proto",
      count: #,
      results: [
        package_name.func (...)",
      ],
      time: {
        install_timer: ss,
        scan_timer: ss,
        total: ss,
      },
    },
  ]*/
  // Gist template
  const gistTemplate = `
**Vulnerability type:**
Prototype Pollution

**Affected Package:**
* Product: {product}
* Version: {version}

{SINK}

**Description:**

The latest version of \`{product} ({version})\`, (previous versions might also affected), is vulnerable to Prototype Pollution through the entry function(s) \`{ENTRY}\`. An attacker can supply a payload with Object.prototype setter to introduce or modify properties within the global prototype chain, causing denial of service (DoS) a the minimum consequence.

Moreover, the consequences of this vulnerability can escalate to other injection-based attacks, depending on how the library integrates within the application. For instance, if the polluted property propagates to sensitive Node.js APIs (e.g., exec, eval), it could enable an attacker to execute arbitrary commands within the application's context.


**PoC:**

\`\`\`bash
// install the package with the latest version
~$ npm install {product}@{version}
// run the script mentioned below 
~$ node poc.js
//The expected output (if the code still vulnerable) is below. 
// Note that the output may slightly differs from function to another.
Before Attack:  {}
After Attack:  {"pollutedKey":123}
\`\`\`

\`\`\`js
// poc.js
(async () => {
    const lib = await import('{product}');
    var someObj = {}
    console.log("Before Attack: ", JSON.stringify({}.__proto__));
    try {
        // for multiple functions, uncomment only one for each execution.
        {EXE}
    } catch (e) { }
    console.log("After Attack: ", JSON.stringify({}.__proto__));
    delete Object.prototype.pollutedKey;
})();
\`\`\`
  `;

  //var payloads = vulnPkg.reports.map((r) => r.inputCasex.replace(/^[^\.]+/, 'lib'));
  var allSinks = [],
    exploitLines = [],
    entrys = [];
  //var components = comp_list.replaceAll(/(\[|\]|")/g, '');
  vulnPkg.reports.forEach((vr) => {
    //gistTemplate.replace('{EXE}',
    var func = vr.entryPoint.replace(/^[^\.]+/, "lib");
    entrys.push(func);
    exploitLines.push(`Reflect.apply(${vr.entryPoint.replace(/^[^\.]+/, "lib")}, {}, ${vr.inputCase});`);
    if (vr.sinkLocation) {
      var sLoc =
        vr.sinkLocation.search(/at\s|\/sandbox\/df\/(.*)/) > -1
          ? vr.sinkLocation.match(/at\s|\/sandbox\/df\/(.*)/)[1]
          : vr.sinkLocation;
      allSinks.push(sLoc);
    }
  });
  return gistTemplate
    .replaceAll("{product}", vulnPkg.package_name)
    .replaceAll("{version}", vulnPkg.version)
    .replaceAll("{ENTRY}", entrys?.length > 0 ? entrys.join(",") : "")
    .replaceAll(
      "{SINK}",
      allSinks?.length > 0 ? `**Vulnerability Location(s):**\n\`\`\`js\n${allSinks.join("\n")}\n\`\`\`` : ""
    )
    .replaceAll("{EXE}", exploitLines?.length > 0 ? exploitLines.join("\n") : "");
}
async function githubRequest(query, method = "GET", API = "token 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") {
  try {
    const { Octokit } = await import("octokit");
    //const API = 'token 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' //kluban's
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

          const parsedData = parseData(response.data);
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

async function githubRequest1(query, method = "GET", API = "token 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") {
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
        const vm = new VM({
          timeout: 1000, // Timeout in milliseconds
          sandbox: {
            octokit,
            query,
            fetchPage: async function (query) {
              return await octokit.request(`GET ${query}`, {
                per_page: 100,
                headers: {
                  "X-GitHub-Api-Version": "2022-11-28",
                },
              });
            },
          },
        });
        const script = `
(async () => {
    const response = await fetchPage(query);
    return response;
})()`;
        try {
          const response = await vm.run(script);
          const parsedData = parseData(response.data);
          data = [...data, ...parsedData];

          const linkHeader = response.headers.link;

          pagesRemaining = linkHeader && linkHeader.includes(`rel=\"next\"`);

          if (pagesRemaining) {
            query = linkHeader.match(nextPattern)[0];
          }
        } catch (error) {
          console.error("Error in VM execution:", error.message);
          break;
        }
      }
      return data;

    case "POST":
      //const [fileName, processedContent] = createAdvisory(query.content)
      try {
        const fileName = `Advisory_${query.pkg.replace("/", "-")}.md`;
        const desc = `Advisory for ${query.pkg}`;

        const response = await octokit.request("POST /gists", {
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
        return response.data;
      } catch (error) {
        if (error.response && error.response.status === 403 && error.response.headers["retry-after"]) {
          const retryAfter = parseInt(error.response.headers["retry-after"], 10);
          console.warn(`Rate limit exceeded. Retrying after ${retryAfter} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          return safePostGist(query, desc, fileName);
        } else {
          console.error("Error creating gist:", error.message);
          throw error;
        }
      }
  }
}
function parseData(data) {
  // If the data is an array, return that
  if (Array.isArray(data)) {
    return data;
  }

  // Some endpoints respond with 204 No Content instead of empty array
  //   when there is no data. In that case, return an empty array.
  if (!data) {
    return [];
  }

  // Otherwise, the array of items that we want is in an object
  // Delete keys that don't include the array of items
  delete data.incomplete_results;
  delete data.repository_selection;
  delete data.total_count;
  // Pull out the array of items
  const namespaceKey = Object.keys(data)[0];
  data = data[namespaceKey];

  return data;
}

/* getAdvisory("/advisories?ecosystem=npm&affects=changeset").then(data => {
    //fs.writeFileSync('../cve_github_cwe400.json', JSON.stringify(data, { encoding: 'utf8' }));
    console.log(JSON.stringify(data));
}); */
// Frontend-specific libraries or keywords
function frontendFilter(packageJsonPath) {
  const frontendLibs = ["react", "vue", "angular", "webpack", "vite"];
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  const dependencies = Object.keys(packageJson.dependencies || {});
  const devDependencies = Object.keys(packageJson.devDependencies || {});
  const peerDependencies = Object.keys(packageJson.peerDependencies || {});
  const keywords = Object.keys(packageJson.keywords || {});
  const allDeps = [...dependencies, ...devDependencies, ...peerDependencies, ...keywords];
  // Check for Node.js core modules or backend libraries
  /*     const isBackend = dependencies.some(dep =>
            backendCoreModules.includes(dep) || backendLibs.includes(dep)
        ); */

  // Check for frontend libraries
  const hasFrontendLibs = allDeps.some((dep) => frontendLibs.filter((fl) => dep.includes(fl)));

  // Check the 'engines' field for Node.js specific environment
  //const specifiesNodeEngine = packageJson.engines && packageJson.engines.node;

  return !hasFrontendLibs;
}

module.exports = {
  dbUpdate,
  dataFetch,
  createAdvisory,
  githubRequest,
  frontendFilter,
  npmInit,
  extractPkgRepo,
  extractPkgTestSuite,
};
