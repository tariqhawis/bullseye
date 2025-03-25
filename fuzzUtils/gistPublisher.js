/* This utility file for handling the input or generated output */
const { join } = require("path");
const fs = require("fs");
const { VM } = require("vm2");
const os = require("os");
const { glob } = require("glob");
const datetime = function () {
  var date = new Date();
  return date.toISOString();
};

function createAdvisory1(vulnPkg) {
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
      var sLoc = vr.sinkLocation.replace(/\/sandbox\/df/, "");
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

function createAdvisory(vulnPkg) {
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
  var allGists = [];
  var sinkCache = new Set();
  //var payloads = vulnPkg.reports.map((r) => r.inputCasex.replace(/^[^\.]+/, 'lib'));
  //var components = comp_list.replaceAll(/(\[|\]|")/g, '');
  allGists = vulnPkg.reports
    .map((vr) => {
      //gistTemplate.replace('{EXE}',
      const func = vr.entryPoint.replace(/^[^\.]+/, "lib");
      const inputCase = Array.isArray(vr.inputCase) ? vr.inputCase.join(",") : vr.inputCase;
      const exploit = vr.exploit ? vr.exploit.replace(/^[^\.]+/, "lib") : `${func}(${inputCase})`;
      // if vr.sinkLocation is an array, then generate the gist
      if (!vr.sinkLocation || !vr.sinkLocation instanceof Array) return null;
      const sinkLocs = vr.sinkLocation
        .map((s) => {
          const vulnFunc = s.search(/at\s+(\S+)/) > -1 ? s.match(/at\s+(\S+)/)[1] : null;
          const file = s.split(":")[0].replace(/.*\/([^\/]+)$/, "$1");
          const sinkLine = s.split(":")[1];
          const sinkLoc = `${vulnFunc}:${file}:${sinkLine}`;
          // if the sinkCache has the sinkLocation, don't generate the gist
          if (!sinkCache.has(sinkLoc)) {
            // convert sinkLocs array to set and add it to sinkCache
            sinkCache.add(sinkLoc);
            return sinkLoc;
          }
          return null;
        })
        .filter((sinkLoc) => sinkLoc !== null);
      if (sinkLocs.length > 0) {
        const generatedGist = gistTemplate
          .replaceAll("{product}", vulnPkg.package_name)
          .replaceAll("{version}", vulnPkg.version)
          .replaceAll("{ENTRY}", func)
          .replaceAll(
            "{SINK}",
            Array.isArray(vr.sinkLocation) && vr.sinkLocation.length > 0
              ? `**Vulnerability Location(s):**\n\`\`\`js\n${vr.sinkLocation.join("\n")}\n\`\`\``
              : ""
          )
          .replaceAll("{EXE}", exploit);
        return generatedGist;
      }
      return null;
    })
    .filter((gist) => gist !== null);
  return allGists;
}

async function githubRequest1(query, method = "GET", API = "token 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") {
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
}

async function githubRequest(query, method = "GET", API) {
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

module.exports = { createAdvisory, githubRequest, frontendFilter };
