# Implementation of NDSS'26 accepted paper "Bullseye: Detecting Prototype Pollution in NPM Packages with Proof of Concept Exploits"

Bullseye is a fully-automated dynamic analysis tool, written in JavaScript, for detecting prototype pollution vulnerabilities in Node.js (NPM) packages. It is designed for large-scale analysis, capable of scanning over 50,000 packages in less than 8 hours. The tool leverages JavaScript reflection methods, the Node.js native virtual machine, and runtime observation oracles, in conjunction with a package’s own test suites and predefined payload seeds, to detect true positive vulnerabilities. Each confirmed finding is supported with a generated proof-of-concept exploit, ensuring accuracy and practical verification.

## Reference

This repository contains the implementation prototype of the approach described in our accepted paper at NDSS 2026. If you use this code, please cite our NDSS'26 paper.

## Directory Tree

```bash
.
├── benchmark  // The benchmark scripts and result artifacts
│   ├── bullseye.vs.ablation
│   ├── bullseye.vs.baselines
│   └── Dataset
├── bullseye.mjs // The actual analysis file run each time a package is invoked in the sandbox for the analysis
├── Dockerfile // use this file to build bullseye image
├── functionHandler.js   // utilities for handling functions enumeration
├── exploitGenerator.js  // generation the exploit candidates
├── testInputExtraction.js
├── fuzzPaterns.json  // exploit inputs patterns "the seed corpus"
├── gistPublisher.js // the github publisher file.
├── setup.js // setup the dataset benchmark folder
├── packageInit.js  // utility functions for handling package setup prior the analysis
├── run_refine.js  // refine the results prior publishing to github
└── run.js  // the orchestrator file
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- Docker (if using sandbox mode)
- npm dependencies installed (`npm install`)

## Usage

First, create the dataset file, containing the list of the packages in the format "package@version". We use npmPath to install the packages at a sepcific location.

```bash
node setup.js --input "npmDataset.txt" --npmPath "benchmark"
```

Second, build the bullseye image (which act as the sandbox for each package analysis)

```bash
docker build -t bullseye:latest .
```

Finally, run the analysis tool, passing the dataset file to the script.

```bash
node run.js --input "npmDataset.txt" [options]
```

## Parameters

| Parameter          | Description                                                                 | Default               | Example                                 |
| ------------------ | --------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| `--input <file>`   | Path to input file (JSON or TXT) with package list or single package string | `dataset/npm47k.json` | `--input data.json`                     |
| `--tool <file>`    | Path to the tool to run (relative to project root)                          | `bullseye.mjs`        | `--tool baselines/fuzzproto_fnEnum.mjs` |
| `--install`        | Install the package before running the tool                                 | `false`               | `--install`                             |
| `--vm`             | Run entry points within Node.js VM                                          | `true`                | `--vm=false`                            |
| `--sandbox`        | Run the tool in a Docker container                                          | `true`                | `--sandbox=false`                       |
| `--output <file>`  | Export results to a file or stdout                                          | `stdout`              | `--output file.json`                    |
| `--parallel <num>` | Number of concurrent packages to process                                    | `1`                   | `--parallel 8`                          |
| `--cveCheck`       | Enable CVE check                                                            | `false`               | `--cveCheck`                            |
| `--timeout <ms>`   | Timeout for each package (milliseconds)                                     | `120000`              | `--timeout 300000`                      |
| `-h`, `--help`     | Show help message                                                           |                       | `--help`                                |

## Input File Format

- **JSON**: Array of objects with at least `package_name` and `version` fields.
- **TXT**: One package per line, e.g., `lodash@4.17.21`.

## Example

```bash
node run.js --input dataset/npm6588.json --output file --parallel 32
```

## Output

- Results are printed to stdout or written to the specified output file.
- Logs are saved in the `logs/` directory.

## Notes

- For large datasets, increase `--parallel` for faster processing.
- user Dockerfile to build the images used for the isolated analysis (requires Docker).
- The script supports both ESM and CommonJS npm packages.

## License

This project is licensed under the GNU GPL License.  
See the [LICENSE](./LICENSE) file for details.
