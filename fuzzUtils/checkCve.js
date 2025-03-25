async function checkGHAdvisory(pkgInfo) {
  let advisories;
  try {
    console.log("Searching for relevant CVEs ...");
    advisories = await githubRequest(`/advisories?ecosystem=npm&affects=${pkgInfo.package_name}`);
  } catch (e) {
    console.log("error fetching from github advisory database. ", e);
  }
  try {
    if (advisories.length > 0) {
      //versionReport.prevReports = advisories.map(a => a.cve_id);
      //let jbxReports = pkgInfo.reports && pkgInfo.reports.length > 0 ? pkgInfo.reports : null;
      if (pkgInfo.reports.length > 0)
        for (const reportVer of pkgInfo.reports) {
          const entryPoint = reportVer.entryPoint.match(/\.?([a-zA-Z-_0-9]*)$/)[1];
          for (const advisory of advisories) {
            // array of all texts surrounded by ``
            const advDesc = advisory.description.match(/`([^`]*)`/g)?.map((match) => match.slice(1, -1));
            const CVE = advisory.cve_id || advisory.ghsa_id;
            //if (advisory.length > 0) {
            //advisory.forEach(vuln => {
            // check if the function is mentioned in the advisory
            if (
              advisory.vulnerabilities[0].package.name === pkgInfo.package_name ||
              (advDesc && advDesc.some((extracted) => extracted.includes(entryPoint)))
            ) {
              //pkgInfo[verNo].reports[reportNo].duplicates.push(pkgInfo.cveId);
              if (!Reflect.has(reportVer, "matchedCVE")) reportVer.matchedCVE = [];
              reportVer.matchedCVE.push(CVE);
              //console.log(`${reportFunc.func_path} has a match in ${advisory.ghsa_id}`)
            }
            //});
          }
        }
      if (!Reflect.has(pkgInfo, "PPHistory")) pkgInfo.PPHistory = [];
      advisories.forEach((adv) => pkgInfo.PPHistory.push(adv.cve_id || adv.ghsa_id));
    }
  } catch (e) {
    console.log("error while processing advisories: ", e.message);
  }
  return pkgInfo;
}

module.exports = checkGHAdvisory;
