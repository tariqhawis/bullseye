const vm = require("vm");
const process = require("process");
const exec = require("child_process");
const path = require("path");
const requireCache = require.cache;
const fs = require("fs");
//const { inferParams } = require("./infer.js");
//const { fuzzGenerator } = require("./utils.js");
PROTORULES = path.join(__dirname, "pPollution.yaml");
var BAD_JSON = {};
var funcBuffer = [];
var parsedObject = [];
var protoList = [];
var victim = {};
let rootModule;
const pattern2 = [
  { format: "1_object-2", input: 'JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  { format: "2_object-2_variable", input: 'JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), {}' },
  { format: "2_variable_object-2", input: '{}, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  {
    format: "2_object-2_object-2",
    input: 'JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')',
  },
  { format: "3_variable_variable_object-2", input: '{}, {}, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  {
    format: "4_variable_variable_variable_object-2",
    input: '{}, {}, {}, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')',
  },
  { format: "3_variable_string_string", input: '{}, "__proto__.pollutedKey", 123' },
  { format: "3_variable_string_string", input: '{}, "__proto__[pollutedKey]", 123' },
  { format: "2_string_string", input: '"__proto__.pollutedKey", 123' },
  { format: "2_string_string", input: '"__proto__[pollutedKey]", 123' },
  { format: "4_variable_string_string_string", input: '{}, "__proto__", "pollutedKey", 123' },
  { format: "3_string_string_string", input: '"__proto__", "pollutedKey", 123' },
  { format: "3_variable_object-2_variable", input: '{}, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), {}' },
  { format: "3_variable_object-2_boolean", input: '{}, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), true' },
  { format: "3_boolean_variable_object-2", input: 'true, {}, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  { format: "3_variable_boolean_object-2", input: '{}, true, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  {
    format: "3_boolean_variable_object-3",
    input: 'true, {}, { "constructor": { "prototype": { "pollutedKey": 123 } } }',
  },
  {
    format: "2_variable_object-3",
    input: '{}, JSON.parse(\'{ "constructor": { "prototype": { "pollutedKey": 123 } } }\')',
  },
  { format: "1_object-3", input: 'JSON.parse(\'{ "constructor": { "prototype": { "pollutedKey": 123 } } }\')' },
  { format: "1_string_string", input: '"[__proto__]\\npollutedKey=123"' },
  { format: "3_variable_string_string", input: '{}, "constructor.prototype.pollutedKey", "pollutedValue"' },
  { format: "3_string_variable_string", input: '"__proto__.pollutedKey", {}, "pollutedValue"' },
  { format: "3_string_variable_string", input: '"this.constructor.prototype.pollutedKey", {}, "pollutedValue"' },
  { format: "3_string_string_variable", input: '"__proto__.pollutedKey", "pollutedValue", {}' },
  { format: "3_variable_string_string", input: '{}, "/__proto__/pollutedKey", "pollutedValue"' },
  { format: "4_variable_string_string_boolean", input: '{}, "/__proto__/pollutedKey", "pollutedValue", true' },
  { format: "1_string_string", input: '"__proto__.pollutedKey=123"' },
  { format: "2_string_string", input: '"__proto__:pollutedKey", "pollutedValue"' },
  { format: "2_string_variable", input: '"__proto__[pollutedKey]=123", {}' },
  {
    format: "4_variable_string_string_string_variable",
    input: '{}, "constructor/prototype/pollutedKey", "pollutedValue", "/"',
  },
  { format: "4_string_object_variable_boolean", input: '"__proto__", { "pollutedKey": "pollutedValue" }, {}, true' },
  { format: "1_object-string_string", input: 'JSON.parse(\'{ "__proto__.pollutedKey": "pollutedValue" }\')' },
  {
    format: "1_object-string_string",
    input: 'JSON.parse(\'{ "constructor.prototype.pollutedKey": "pollutedValue" }\')',
  },
  { format: "3_variable_array-2_string", input: '{}, [["__proto__"], "pollutedKey"], "pollutedValue"' },
  { format: "3_array-2_string_variable", input: '[["__proto__"], "pollutedKey"], "pollutedValue", {}' },
  { format: "4_variable_array-2_string_boolean", input: '{}, [["__proto__"], "pollutedKey"], "pollutedValue", true' },
  { format: "3_variable_array-1_string", input: '{}, ["__proto__", "pollutedKey"], "pollutedValue"' },
  { format: "3_variable_array-1_string", input: '{}, ["constructor.prototype.pollutedKey"], "pollutedValue"' },
  { format: "2_array-1_array-1_string", input: '[["__proto__"], ["__proto__"], "pollutedKey"], "pollutedValue"' },
  { format: "2_string_string", input: '["-constructor.prototype.pollutedKey", "pollutedValue"]' },

  {
    format: "1_object-3",
    input: 'JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\')',
  },
  {
    format: "2_object-3_variable",
    input: 'JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'), {}',
  },
  {
    format: "2_variable_object-3",
    input: '{}, JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\')',
  },
  { format: "2_null_object-2", input: 'null, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  { format: "3_variable_number_object-2", input: '{}, 123, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')' },
  {
    format: "3_variable_undefined_object-2",
    input: '{}, undefined, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')',
  },
  { format: "4_array-2_boolean_string_variable", input: '[["__proto__"], "pollutedKey"], true, {}' },
  { format: "3_null_array-1_string", input: 'null, [["__proto__"], "pollutedKey"], "pollutedValue"' },
  { format: "4_null_array-2_string_boolean", input: 'null, [["__proto__"], "pollutedKey"], "pollutedValue", false' },
  {
    format: "5_variable_string_string_string_variable",
    input: '{}, "constructor", "prototype", "pollutedKey", "pollutedValue"',
  },
  { format: "4_boolean_string_string_variable", input: 'true, "__proto__.pollutedKey", "pollutedValue", {}' },
  {
    format: "3_string_object-2_number",
    input: '"__proto__[pollutedKey]", JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), 456',
  },
  {
    format: "3_string_object-3_string",
    input:
      '"constructor.prototype.pollutedKey", JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": "456"}}}}\'), "pollutedValue"',
  },
  {
    format: "3_variable_null_object-3",
    input: '{}, null, JSON.parse(\'{ "constructor": { "prototype": { "pollutedKey": 123 } } }\')',
  },
  {
    format: "4_null_boolean_object-2_number",
    input: 'null, true, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), 789',
  },
  {
    format: "4_object-3_string_array-1_boolean",
    input:
      'JSON.parse(\'{ "constructor": { "prototype": { "pollutedKey": 123 } } }\'), "constructor", ["__proto__"], true',
  },
  {
    format: "5_boolean_variable_string_object-2_boolean",
    input:
      'true, {}, "__proto__.pollutedKey", JSON.parse(\'{ "constructor": { "prototype": { "pollutedKey": 123 } } }\'), false',
  },
  {
    format: "3_number_array-2_object-2",
    input: 'pollutedValue, [["__proto__"], "pollutedKey"], JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\')',
  },
  { format: "2_object-1_string", input: '{}, "__proto__"' },
  {
    format: "3_object-2_null_string",
    input: 'JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), null, "pollutedKey"',
  },
  {
    format: "4_object-2_boolean_string_variable",
    input: 'JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), true, "__proto__.pollutedKey", {}',
  },

  { format: "4_variable_null_string_string", input: '{}, null, "__proto__", "pollutedKey"' },
  {
    format: "5_variable_boolean_string_string_object-2",
    input:
      '{}, true, "constructor.prototype.pollutedKey", "pollutedValue", JSON.parse(\'{"__proto__": {"pollutedKey": 456}}\')',
  },
  {
    format: "4_string_string_object-2_variable",
    input:
      '"constructor.prototype.pollutedKey", "pollutedValue", JSON.parse(\'{"__proto__": {"pollutedKey": 789}}\'), {}',
  },
  { format: "3_object-proto-variable", input: '{}.__proto__, "pollutedKey", "pollutedValue"' },
  {
    format: "3_object-proto-object",
    input: '{}.__proto__, "pollutedKey", JSON.parse(\'{"pollutedKey": "pollutedValue"}\')',
  },
  {
    format: "3_object-proto-nested-object",
    input: '{}.__proto__, "__proto__", JSON.parse(\'{"pollutedKey": "pollutedValue"}\')',
  },
  {
    format: "3_proto-inject-value",
    input: '{}.__proto__, "constructor", JSON.parse(\'{ "prototype": { "pollutedKey": "pollutedValue" } }\')',
  },
  { format: "3_object-proto-chain", input: '{}.__proto__.__proto__, "pollutedKey", "pollutedValue"' },
  {
    format: "3_object-proto-insert-array",
    input: '{}.__proto__, "pollutedKey", JSON.parse(\'["pollutedValue", "pollutedValu1"]\')',
  },
  { format: "3_object-proto-boolean", input: '{}.__proto__, "pollutedBoolean", true' },
  { format: "3_object-proto-null", input: '{}.__proto__, "pollutedKey", null' },
  { format: "3_object-proto-number", input: '{}.__proto__, "pollutedKey", 12345' },
  {
    format: "5_object-multiple-props",
    input: '{}.__proto__, "pollutedKey", "pollutedValue", "pollutedKey1", "pollutedValu1"',
  },
  { format: "3_empty-object-pollution", input: '{}.__proto__, "pollutedKey", "pollutedValue"' },
  { format: "3_function-prototype-pollution", input: 'function() {}.__proto__, "pollutedKey", "pollutedValue"' },
  { format: "3_empty-array-pollution", input: '[].__proto__, "pollutedKey", "pollutedValue"' },
  { format: "3_object-proto-set-getter", input: '{}.__proto__, "pollutedKey", { get() { return "pollutedValue"; } }' },
  {
    format: "3_object-proto-set-setter",
    input: '{}.__proto__, "pollutedKey", { set(value) { this.pollutedValue = value; } }',
  },
  {
    format: "3_object-replace-constructor",
    input: '{}.__proto__, "constructor", JSON.parse(\'{ "prototype": { "pollutedKey": "pollutedValue" } }\')',
  },
  {
    format: "3_object-replace-__proto__",
    input: '{}.__proto__, "__proto__", JSON.parse(\'{ "pollutedKey": "pollutedValue" }\')',
  },
  { format: "3_object-proto-nested", input: '{}.__proto__.__proto__, "PollutedKey", "PollutedValue"' },
  { format: "3_object-proto-inject-undefined", input: '{}.__proto__, "pollutedKey", undefined' },
];
// using victim
const pattern1 = [
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__":{"pollutedKey":123}}'), victim);
    },
    sig: '(JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'), victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(victim, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(BAD_JSON, JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(BAD_JSON, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, victim, JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(victim, victim, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, victim, victim, JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(victim, victim, victim, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "__proto__.pollutedKey", "pollutedValue");
    },
    sig: '(victim, "__proto__.pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "__proto__[pollutedKey]", "pollutedValue");
    },
    sig: '(victim, "__proto__[pollutedKey]", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey", "pollutedValue");
    },
    sig: '("__proto__.pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__[pollutedKey]", "pollutedValue");
    },
    sig: '("__proto__[pollutedKey]", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "__proto__", "pollutedKey", "pollutedValue");
    },
    sig: '(victim, "__proto__", "pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__", "pollutedKey", "pollutedValue");
    },
    sig: '("__proto__", "pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, JSON.parse('{"__proto__":{"pollutedKey":123}}'), victim);
    },
    sig: '(victim, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'), victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, JSON.parse('{"__proto__":{"pollutedKey":123}}'), true);
    },
    sig: '(victim, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'), true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(true, victim, JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(true, victim, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, true, JSON.parse('{"__proto__":{"pollutedKey":123}}'));
    },
    sig: '(victim, true, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(true, victim, JSON.parse('{"constructor":{"prototype":{"pollutedKey":123}}}'));
    },
    sig: '(true, victim, JSON.parse(\'{"constructor":{"prototype":{"pollutedKey":123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, JSON.parse('{"constructor":{"prototype":{"pollutedKey":123}}}'));
    },
    sig: '(victim, JSON.parse(\'{"constructor":{"prototype":{"pollutedKey":123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"constructor":{"prototype":{"pollutedKey":123}}}'));
    },
    sig: '(JSON.parse(\'{"constructor":{"prototype":{"pollutedKey":123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("[__proto__]\npollutedKey=123");
    },
    sig: '("[__proto__]\\npollutedKey=123")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "constructor.prototype.pollutedKey", "pollutedValue");
    },
    sig: '(victim, "constructor.prototype.pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey", victim, "pollutedValue");
    },
    sig: '("__proto__.pollutedKey", victim, "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("this.constructor.prototype.pollutedKey", victim, "pollutedValue");
    },
    sig: '("this.constructor.prototype.pollutedKey", victim, "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey", "pollutedValue", victim);
    },
    sig: '("__proto__.pollutedKey", "pollutedValue", victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "/__proto__/pollutedKey", "pollutedValue");
    },
    sig: '(victim, "/__proto__/pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "/__proto__/pollutedKey", "pollutedValue", true);
    },
    sig: '(victim, "/__proto__/pollutedKey", "pollutedValue", true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey=123");
    },
    sig: '("__proto__.pollutedKey=123")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__:pollutedKey", "pollutedValue");
    },
    sig: '("__proto__:pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__[pollutedKey]=123", victim);
    },
    sig: '("__proto__[pollutedKey]=123", victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "constructor/prototype/pollutedKey", "pollutedValue", "/");
    },
    sig: '(victim, "constructor/prototype/pollutedKey", "pollutedValue", "/")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__", { pollutedKey: "pollutedValue" }, victim, true);
    },
    sig: '("__proto__", { "pollutedKey": "pollutedValue" }, victim, true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({ "__proto__.pollutedKey": "pollutedValue" });
    },
    sig: '({ "__proto__.pollutedKey": "pollutedValue" })',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({ "constructor.prototype.pollutedKey": "pollutedValue" });
    },
    sig: '({ "constructor.prototype.pollutedKey": "pollutedValue" })',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, [["__proto__"], "pollutedKey"], "pollutedValue");
    },
    sig: '(victim, [["__proto__"], "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc([["__proto__"], "pollutedKey"], "pollutedValue", victim);
    },
    sig: '([["__proto__"], "pollutedKey"], "pollutedValue", victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, [["__proto__"], "pollutedKey"], "pollutedValue", true);
    },
    sig: '(victim, [["__proto__"], "pollutedKey"], "pollutedValue", true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, ["__proto__", "pollutedKey"], "pollutedValue");
    },
    sig: '(victim, ["__proto__", "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, ["constructor.prototype.pollutedKey"], "pollutedValue");
    },
    sig: '(victim, ["constructor.prototype.pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(["__proto__"], "pollutedKey", "pollutedValue");
    },
    sig: '(["__proto__"], "pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(["__proto__.pollutedKey"], ["pollutedValue"]);
    },
    sig: '(["__proto__.pollutedKey"], ["pollutedValue"])',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, [["__proto__"], ["__proto__"], "pollutedKey"], "pollutedValue");
    },
    sig: '(victim, [["__proto__"], ["__proto__"], "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(["-constructor.prototype.pollutedKey", "pollutedValue"]);
    },
    sig: '(["-constructor.prototype.pollutedKey", "pollutedValue"])',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("../proto_file");
    },
    sig: '("filename" ⇒ [__proto__]\npollutedKey="pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("../constructer_file");
    },
    sig: '("filename" ⇒ [constructor]\nprototype.pollutedKey="pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "__proto__.pollutedKey");
    },
    sig: '(victim,"__proto__.pollutedKey")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}'));
    },
    sig: '(JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}'), victim);
    },
    sig: '(JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'), victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}'));
    },
    sig: '(victim, JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, JSON.parse('{"__proto__": {"pollutedKey": 123}}'));
    },
    sig: '(null, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, 123, JSON.parse('{"__proto__": {"pollutedKey": 123}}'));
    },
    sig: '(victim, 123, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, undefined, JSON.parse('{"__proto__": {"pollutedKey": 123}}'));
    },
    sig: '(victim, undefined, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc([["__proto__"], "pollutedKey"], true, victim);
    },
    sig: '([[["__proto__"], "pollutedKey"]], true, victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, [["__proto__"], "pollutedKey"], "pollutedValue");
    },
    sig: '(null, [["__proto__"], "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, [["__proto__"], "pollutedKey"], "pollutedValue", false);
    },
    sig: '(null, [["__proto__"], "pollutedKey"], "pollutedValue", false)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "constructor", "prototype", "pollutedKey", "pollutedValue");
    },
    sig: '(victim, "constructor", "prototype", "pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(true, "__proto__.pollutedKey", "pollutedValue", victim);
    },
    sig: '(true, "__proto__.pollutedKey", "pollutedValue", victim)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__[pollutedKey]", JSON.parse('{"__proto__": {"pollutedKey": 123}}'), 456);
    },
    sig: '("__proto__[pollutedKey]", JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), 456)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        "constructor.prototype.pollutedKey",
        JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": "456"}}}}'),
        "pollutedValue"
      );
    },
    sig: '("constructor.prototype.pollutedKey", JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": "456"}}}}\'), "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, null, JSON.parse('{"constructor": {"prototype": {"pollutedKey": 123}}}'));
    },
    sig: '(victim, null, JSON.parse(\'{"constructor": {"prototype": {"pollutedKey": 123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, true, JSON.parse('{"__proto__": {"pollutedKey": 123}}'), 789);
    },
    sig: '(null, true, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), 789)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        JSON.parse('{"constructor": {"prototype": {"pollutedKey": 123}}}'),
        "constructor",
        ["__proto__"],
        true
      );
    },
    sig: '(JSON.parse(\'{"constructor": {"prototype": {"pollutedKey": 123}}}\'), "constructor", ["__proto__"], true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        true,
        victim,
        "__proto__.pollutedKey",
        JSON.parse('{"constructor": {"prototype": {"pollutedKey": 123}}}'),
        false
      );
    },
    sig: '(true, victim, "__proto__.pollutedKey", JSON.parse(\'{"constructor": {"prototype": {"pollutedKey": 123}}}\'), false)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("pollutedValue", [["__proto__"], "pollutedKey"], JSON.parse('{"__proto__": {"pollutedKey": 123}}'));
    },
    sig: '("pollutedValue", [["__proto__"], "pollutedKey"], JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(victim, "__proto__");
    },
    sig: '(victim, "__proto__")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"pollutedKey": 123}}'), null, "pollutedKey");
    },
    sig: '(JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), null, "pollutedKey")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"pollutedKey": 123}}'), true, "__proto__.pollutedKey", victim);
    },
    sig: '(JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), true, "__proto__.pollutedKey", victim)',
  },
];
// using {}
const pattern = [
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '(JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'), {});
    },
    sig: '(JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'), {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '({}, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(BAD_JSON, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '(BAD_JSON, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, {}, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '({}, {}, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, {}, {}, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '({}, {}, {}, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "__proto__.pollutedKey", "pollutedValue");
    },
    sig: '({}, "__proto__.pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "__proto__[pollutedKey]", "pollutedValue");
    },
    sig: '({}, "__proto__[pollutedKey]", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey", "pollutedValue");
    },
    sig: '("__proto__.pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__[pollutedKey]", "pollutedValue");
    },
    sig: '("__proto__[pollutedKey]", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "__proto__", "pollutedKey", "pollutedValue");
    },
    sig: '({}, "__proto__", "pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__", "pollutedKey", "pollutedValue");
    },
    sig: '("__proto__", "pollutedKey", 123)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'), {});
    },
    sig: '({}, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'), {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'), true);
    },
    sig: '({}, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'), true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(true, {}, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '(true, {}, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, true, JSON.parse('{"__proto__":{"pollutedKey":"pollutedValue"}}'));
    },
    sig: '({}, true, JSON.parse(\'{"__proto__":{"pollutedKey":123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(true, {}, JSON.parse('{"constructor":{"prototype":{"pollutedKey":"pollutedValue"}}}'));
    },
    sig: '(true, {}, JSON.parse(\'{"constructor":{"prototype":{"pollutedKey":123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, JSON.parse('{"constructor":{"prototype":{"pollutedKey":"pollutedValue"}}}'));
    },
    sig: '({}, JSON.parse(\'{"constructor":{"prototype":{"pollutedKey":123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"constructor":{"prototype":{"pollutedKey":"pollutedValue"}}}'));
    },
    sig: '(JSON.parse(\'{"constructor":{"prototype":{"pollutedKey":123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc('[__proto__]\npollutedKey="pollutedValue"');
    },
    sig: '("[__proto__]\\npollutedKey=123")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "constructor.prototype.pollutedKey", "pollutedValue");
    },
    sig: '({}, "constructor.prototype.pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey", {}, "pollutedValue");
    },
    sig: '("__proto__.pollutedKey", {}, "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("this.constructor.prototype.pollutedKey", {}, "pollutedValue");
    },
    sig: '("this.constructor.prototype.pollutedKey", {}, "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__.pollutedKey", "pollutedValue", {});
    },
    sig: '("__proto__.pollutedKey", "pollutedValue", {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "/__proto__/pollutedKey", "pollutedValue");
    },
    sig: '({}, "/__proto__/pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "/__proto__/pollutedKey", "pollutedValue", true);
    },
    sig: '({}, "/__proto__/pollutedKey", "pollutedValue", true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc('__proto__.pollutedKey="pollutedValue"');
    },
    sig: '("__proto__.pollutedKey=123")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__:pollutedKey", "pollutedValue");
    },
    sig: '("__proto__:pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc('__proto__[pollutedKey]="pollutedValue"', {});
    },
    sig: '("__proto__[pollutedKey]=123", {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "constructor/prototype/pollutedKey", "pollutedValue", "/");
    },
    sig: '({}, "constructor/prototype/pollutedKey", "pollutedValue", "/")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__", { pollutedKey: "pollutedValue" }, {}, true);
    },
    sig: '("__proto__", { "pollutedKey": "pollutedValue" }, {}, true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({ "__proto__.pollutedKey": "pollutedValue" });
    },
    sig: '({ "__proto__.pollutedKey": "pollutedValue" })',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({ "constructor.prototype.pollutedKey": "pollutedValue" });
    },
    sig: '({ "constructor.prototype.pollutedKey": "pollutedValue" })',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, [["__proto__"], "pollutedKey"], "pollutedValue");
    },
    sig: '({}, [["__proto__"], "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc([["__proto__"], "pollutedKey"], "pollutedValue", {});
    },
    sig: '([["__proto__"], "pollutedKey"], "pollutedValue", {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, [["__proto__"], "pollutedKey"], "pollutedValue", true);
    },
    sig: '({}, [["__proto__"], "pollutedKey"], "pollutedValue", true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, ["__proto__", "pollutedKey"], "pollutedValue");
    },
    sig: '({}, ["__proto__", "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, ["constructor.prototype.pollutedKey"], "pollutedValue");
    },
    sig: '({}, ["constructor.prototype.pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(["__proto__"], "pollutedKey", "pollutedValue");
    },
    sig: '(["__proto__"], "pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(["__proto__.pollutedKey"], ["pollutedValue"]);
    },
    sig: '(["__proto__.pollutedKey"], ["pollutedValue"])',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, [["__proto__"], ["__proto__"], "pollutedKey"], "pollutedValue");
    },
    sig: '({}, [["__proto__"], ["__proto__"], "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(["-constructor.prototype.pollutedKey", "pollutedValue"]);
    },
    sig: '(["-constructor.prototype.pollutedKey", "pollutedValue"])',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("../proto_file");
    },
    sig: '("filename" ⇒ [__proto__]\npollutedKey="pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("../constructer_file");
    },
    sig: '("filename" ⇒ [constructor]\nprototype.pollutedKey="pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "__proto__.pollutedKey");
    },
    sig: '({},"__proto__.pollutedKey")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}}'));
    },
    sig: '(JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}}'), {});
    },
    sig: '(JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'), {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}}'));
    },
    sig: '({}, JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": 123}}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'));
    },
    sig: '(null, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, 123, JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'));
    },
    sig: '({}, 123, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, undefined, JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'));
    },
    sig: '({}, undefined, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc([["__proto__"], "pollutedKey"], true, {});
    },
    sig: '([[["__proto__"], "pollutedKey"]], true, {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, [["__proto__"], "pollutedKey"], "pollutedValue");
    },
    sig: '(null, [["__proto__"], "pollutedKey"], "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, [["__proto__"], "pollutedKey"], "pollutedValue", false);
    },
    sig: '(null, [["__proto__"], "pollutedKey"], "pollutedValue", false)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "constructor", "prototype", "pollutedKey", "pollutedValue");
    },
    sig: '({}, "constructor", "prototype", "pollutedKey", "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(true, "__proto__.pollutedKey", "pollutedValue", {});
    },
    sig: '(true, "__proto__.pollutedKey", "pollutedValue", {})',
  },
  {
    fnct: function (targetFunc) {
      targetFunc("__proto__[pollutedKey]", JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'), 456);
    },
    sig: '("__proto__[pollutedKey]", JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), 456)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        "constructor.prototype.pollutedKey",
        JSON.parse('{"__proto__": {"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}}'),
        "pollutedValue"
      );
    },
    sig: '("constructor.prototype.pollutedKey", JSON.parse(\'{"__proto__": {"constructor": {"prototype": {"pollutedKey": "123"}}}}\'), "pollutedValue")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, null, JSON.parse('{"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}'));
    },
    sig: '({}, null, JSON.parse(\'{"constructor": {"prototype": {"pollutedKey": 123}}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(null, true, JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'), 789);
    },
    sig: '(null, true, JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), 789)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        JSON.parse('{"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}'),
        "constructor",
        ["__proto__"],
        true
      );
    },
    sig: '(JSON.parse(\'{"constructor": {"prototype": {"pollutedKey": 123}}}\'), "constructor", ["__proto__"], true)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        true,
        {},
        "__proto__.pollutedKey",
        JSON.parse('{"constructor": {"prototype": {"pollutedKey": "pollutedValue"}}}'),
        false
      );
    },
    sig: '(true, {}, "__proto__.pollutedKey", JSON.parse(\'{"constructor": {"prototype": {"pollutedKey": 123}}}\'), false)',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(
        "pollutedValue",
        [["__proto__"], "pollutedKey"],
        JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}')
      );
    },
    sig: '("pollutedValue", [["__proto__"], "pollutedKey"], JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'))',
  },
  {
    fnct: function (targetFunc) {
      targetFunc({}, "__proto__");
    },
    sig: '({}, "__proto__")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'), null, "pollutedKey");
    },
    sig: '(JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), null, "pollutedKey")',
  },
  {
    fnct: function (targetFunc) {
      targetFunc(JSON.parse('{"__proto__": {"pollutedKey": "pollutedValue"}}'), true, "__proto__.pollutedKey", {});
    },
    sig: '(JSON.parse(\'{"__proto__": {"pollutedKey": 123}}\'), true, "__proto__.pollutedKey", {})',
  },
];
//console.log('pkg: ' + process.argv[2]);
//exec.execSync('ls -la ', { stdio: 'inherit', encoding: 'utf-8' });
let pkg = {};
if (process.argv[2]) {
  pkg = JSON.parse(process.argv[2]);
} else {
  pkg = {
    package_name: "node-forge",
    version: "0.9.0",
    pkgPath: "/data/benchmark/ss-100/node_forge-0.9.0",
    options: {
      verbose: false,
      sandbox: false,
    },
  };
}
const pkgName = pkg.package_name;
const depth = 5; // recursive exploration depth
const quiet = !pkg.options.verbose;
const sandbox = pkg.options.sandbox;

const originalDir = process.cwd();
const originalNodePath = process.env.NODE_PATH || "";

//const verbose = process.argv[4] == 'verbose' ? true : false;
(async () => {
  let loc = 0;
  if (fs.existsSync("./cloc.txt")) loc = JSON.parse(fs.readFileSync("./cloc.txt", { encoding: "utf8" })).SUM["code"];
  process.chdir(pkg.pkgPath);
  process.env.NODE_PATH = path.resolve(pkg.pkgPath, "node_modules") + path.delimiter + originalNodePath;
  require("module").Module._initPaths(); // Reinitialize module paths
  //console.log(`pkgName: ${pkgName}`)
  //return loadWithFilePaths(pkgName);
  return await importModule2(pkgName);
  //return await import(pkgName);
})()
  .then((lib) => {
    //console.log(`lib: ${JSON.stringify(lib)}`)
    rootModule = lib;
    mainAnalysis(lib, pkgName, depth);
    funcExploredNo =
      funcBuffer.length > 0
        ? funcBuffer.filter((obj, index, self) => index === self.findIndex((o) => o === obj)).length
        : 0;
    protoList.unshift(funcExploredNo);
    //protoList.unshift(funcBuffer.join(','))
    //protoList.unshift(testFiles.join(','))
    protoList.unshift(lib);
    if (protoList.length > 0) {
      if (!quiet && !sandbox) console.log(JSON.stringify(protoList, null, 2));
      else console.log(`<JSON-OUTPUT>${JSON.stringify(protoList)}</JSON-OUTPUT>`);
    }
  })
  .catch((e) => {
    if (protoList.length > 0) {
      if (!quiet) console.log(JSON.stringify(protoList, null, 2));
      if (!sandbox) console.log(`<JSON-OUTPUT>${JSON.stringify(protoList)}</JSON-OUTPUT>`);
    }
  })
  .finally(() => {
    fs.rmSync(path.join(__dirname, "tmp", `tempFunc_${process.pid}`), { recursive: true, force: true });
    process.exit(0);
  });

function mainAnalysis(lib, prefix, depth) {
  if (!quiet) console.log(`[+] Explore ${prefix}...`);

  // If depth limit reached or object already explored, return
  if (depth == 0) return;
  if (parsedObject.indexOf(lib) !== -1) return;

  // Mark the object as explored
  parsedObject.push(lib);

  // Iterate over properties of the object
  try {
    for (const fnName of Object.keys(lib)) {
      //for (let fnName in lib) {
      if (
        fnName == "abort" ||
        fnName == "__proto__" ||
        +fnName == fnName ||
        fnName == "Skipped-Function" ||
        typeof lib[fnName] === "string" ||
        fnName.search(/^__.*__$/) > -1 ||
        fnName === fnName.toUpperCase()
      )
        continue;

      // Handle the property as a function or object
      if (Object.prototype.hasOwnProperty.call(lib, fnName)) {
        if (typeof lib[fnName] === "function") {
          funcBuffer.push(`${prefix}.${fnName}`);
          //console.log(fnName)
          // Check for prototype pollution in the function
          let fuzzResult = {},
            modulePath,
            functionOffset;
          for (const rule of pattern) {
            if (protoList.some((p) => p.entryPoint === `${prefix}.${fnName}`)) break; // Prevent duplicate findings
            //console.log(pattern.indexOf(rule));
            if (fixFuzzy(rule.fnct, lib[fnName])) {
              fuzzResult.input = `${prefix}.${fnName} ${rule.sig}`;
              fuzzResult.pId = pattern.indexOf(rule);
              //modulePath = findFunctionPath(rootModule, lib[fnName]);
              //functionOffset = getFunctionOffset(lib[fnName], modulePath);
              var result = fuzzResult.input;
              if (!quiet) console.log("Detected: ", result, "Payload Id: ", fuzzResult.pId);
              //var sinkInfo = sinkLineFinder(fnName, lib[fnName], functionOffset);
              const detection = {
                exploit: result,
                entryPoint: `${prefix}.${fnName}`,
                inputCase: fuzzResult.input ? pattern[fuzzResult.pId].input : inferResult,
                input_id: fuzzResult.pId,
                //tainted: sinkInfo[0]?.var,
                //sinkFile: modulePath || null,
                //sinkLine: sinkInfo[0]?.line,
              };
              protoList.push(detection);
              console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
              break;
            }
          }

          /*                     var inferResult = dynFuzzy(lib[fnName]);
                                        var tag = ((fuzzResult.input && inferResult) == null && (fuzzResult.input || inferResult) !== null) ?
                                            (fuzzResult.input || inferResult) !== null ? 'fix' || 'infer'
                                                : (fuzzResult.input && inferResult) !== null ? 'both'
                                                    : null : null;
                     */
        }
        // Attention, using else reduce recursive access to nested objects!
        //else if (typeof lib[fnName] === "object" && lib[fnName] !== null) {
        // Recursively explore nested objects
        //    exploreLib2(lib[key], prefix + "." + key, depth - 1);
        // Recursively analyze deeper properties, including arrays and nested objects
        mainAnalysis(lib[fnName], prefix + "." + fnName, depth - 1);
        //}
      }
    }
  } catch (error) {
    console.log(error);
  }
  // Handle the case when `lib` is a function
  try {
    if (typeof lib === "function" && lib.name !== "") {
      // Process classes
      if (isClass(lib)) {
        let fuzzResult = {},
          modulePath,
          functionOffset,
          detected = false;
        for (let method of Reflect.ownKeys(lib)) {
          if (typeof lib[method] === "function") {
            funcBuffer.push(`${prefix}.${lib.name}.${method}`);
            console.log(` [-] Scanning Class method ${method}`);
            // Check for prototype pollution in the function
            let fuzzResult = {},
              modulePath,
              functionOffset;
            for (const rule of pattern) {
              if (protoList.some((p) => p.entryPoint === `${prefix}.${lib.name}.${method}`)) break; // Prevent duplicate findings
              //console.log(pattern.indexOf(rule));
              if (fixFuzzy(rule.fnct, lib[method])) {
                detected = true;
                fuzzResult.input = `${prefix}.${lib.name}.${method} ${rule.sig}`;
                fuzzResult.pId = pattern.indexOf(rule);
                //modulePath = findFunctionPath(lib, lib);
                //functionOffset = getFunctionOffset(lib[method], modulePath);
                var result = fuzzResult.input;
                if (!quiet) console.log("Detected: ", result, "Payload Id: ", fuzzResult.pId);
                //var sinkInfo = sinkLineFinder(lib.name, lib, functionOffset);
                const detection = {
                  exploit: result,
                  entryPoint: `${prefix}.${lib.name}.${method}`,
                  inputCase: fuzzResult.input ? pattern[fuzzResult.pId].input : inferResult,
                  input_id: fuzzResult.pId,
                  //tainted: sinkInfo[0]?.var,
                  //sinkFile: modulePath || null,
                  //sinkLine: sinkInfo[0]?.line,
                };
                protoList.push(detection);
                console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
                break;
              }
            }
            /*                         var inferResult = dynFuzzy(lib[method]);
                                                var tag = ((fuzzResult.input && inferResult) == null && (fuzzResult.input || inferResult) !== null) ?
                                                    (fuzzResult.input || inferResult) !== null ? 'fix' || 'infer'
                                                        : (fuzzResult.input && inferResult) !== null ? 'both'
                                                            : null : null; */
          }
        }
      } else {
        let fuzzResult = {},
          modulePath,
          functionOffset;
        if (rootModule.name === lib.name && lib.default && typeof lib.default === "function")
          fuzzResult.func = `${pkgName}.default`;
        else fuzzResult.func = pkgName;
        funcBuffer.push(fuzzResult.func);
        for (const rule of pattern) {
          if (protoList.some((p) => p.entryPoint.includes(fuzzResult.func) || p.entryPoint === `${prefix}.${lib.name}`))
            break; // Prevent duplicate findings
          //if (lib.name[0] === lib.name[0].toUpperCase())
          //fuzzResult.input = classFuzzy(rule.fnct, pkgName, lib);
          //console.log(pattern.indexOf(rule));
          if (fixFuzzy(rule.fnct, lib)) {
            fuzzResult.pId = pattern.indexOf(rule);
            modulePath = findFunctionPath(lib, lib);
            functionOffset = getFunctionOffset(lib, modulePath);
            if (!quiet) console.log("Detected: ", fuzzResult.func, "Payload Id: ", fuzzResult.pId);
            var sinkInfo = sinkLineFinder(pkgName, lib, functionOffset);
            const detection = {
              exploit: `${fuzzResult.func} ${rule.sig}`,
              entryPoint: fuzzResult.func,
              inputCase: rule.sig,
              input_id: fuzzResult.pId,
              sinkFile: modulePath || null,
              tainted: sinkInfo[0]?.var,
              sinkLine: sinkInfo[0]?.line,
            };
            protoList.push(detection);
            console.log(`<DETECTION>${JSON.stringify(detection)}</DETECTION>`);
            break;
          }
        }
        /*                 var inferResult = dynFuzzy(lib);
                                var tag = ((fuzzResult.input && inferResult) == null && (fuzzResult.input || inferResult) !== null) ?
                                    (fuzzResult.input || inferResult) !== null ? 'fix' || 'infer'
                                        : (fuzzResult.input && inferResult) !== null ? 'both'
                                            : null : null; */
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function verify() {
  //if ({}.test == 123 || {}.test == '123') {
  //var prop = findAddedProperty(clonedChain, activeChain)
  const key = Object.keys(prop)[0];
  if (prop.hasOwnProperty(key)) {
    //if ({}.test == true || {}.test == 'true' || {}.test == '../test') {
    delete Object.prototype[key];
    //delete Object.prototype.polluted;
    return true;
  }
  return false;
}

function isClass(classObj) {
  try {
    if (
      Reflect.getOwnPropertyDescriptor(classObj, "get") &&
      Reflect.getOwnPropertyDescriptor(classObj, "set") &&
      Reflect.getOwnPropertyDescriptor(classObj, "has") &&
      typeof Reflect.getOwnPropertyDescriptor(classObj, "get").value === "function" &&
      typeof Reflect.getOwnPropertyDescriptor(classObj, "set").value === "function" &&
      typeof Reflect.getOwnPropertyDescriptor(classObj, "has").value === "function"
    )
      return true;
  } catch (e) {
    console.log(e);
  }
}
function parseSig(sig) {
  // Object to represent \"emptyObj\"
  const emptyObj = {};

  // Function to safely evaluate expressions like JSON.parse() or variable references
  function safeEval(input) {
    try {
      return eval(input); // Evaluate expressions if it\"s safe
    } catch (e) {
      return input; // Return as-is if evaluation fails
    }
  }
  function splitByTopLevelComma(sig) {
    let depth = 0;
    let result = [];
    let current = "";

    for (let i = 0; i < sig.length; i++) {
      const char = sig[i];

      // Track opening/closing parentheses
      if (char === "(") depth++;
      if (char === ")") depth--;

      // Split by commas only when depth is 0
      if (char === "," && depth === 0) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    // Add the last part
    if (current.trim() !== "") {
      result.push(current.trim());
    }

    return result;
  }

  // Split the input string by commas and trim the spaces
  //const parts = sig.split(",").map(part => part.trim());
  const parts = splitByTopLevelComma(sig);

  // Convert each part into its appropriate type or object
  return parts.map((part) => {
    // Handle special cases like emptyObj, undefined, null, etc.
    if (part === "emptyObj") return emptyObj; // Replace "emptyObj" with the actual object
    if (part === "emptyObj.__proto__") return emptyObj.__proto__; // Replace "emptyObj" with the actual object
    if (part === "emptyObj.__proto__.__proto__") return emptyObj.__proto__.__proto__; // Replace "emptyObj" with the actual object
    if (part === "undefined") return undefined;
    if (part === "null") return null;
    if (part === "true") return true;
    if (part === "false") return false;

    // Check if it"s a number (integer or float)
    if (!isNaN(part)) return Number(part);

    // Check if it"s a string (remove quotes)
    if (part.startsWith('"') && part.endsWith('"')) return part.slice(1, -1);

    // Check if it\"s an object or array in JSON format and try parsing it safely
    /*             if (part.startsWith(\"{\") || part.startsWith(\"[\")) {
                        try {
                            return JSON.parse(part);
                        } catch (e) {
                            // If JSON parsing fails, continue with safeEval
                        }
                    } */

    // Default: Try to safely evaluate the expression using eval
    return safeEval(part);
    //return part;
  });
}

/* function classFuzzy(inputCase, funcName, fn) {
    // Check if the function name starts with a capital letter to determine if it's a class

    let instance;
    let instancePrototype;
    let requiredKeys = {};  // Store required keys as we discover them

    // Use a Proxy to trap accesses to missing keys and detect required constructor arguments
    const proxyHandler = {
        get: function (target, prop, receiver) {
            // If accessing an undefined key, return a default value
            if (!(prop in target)) {
                requiredKeys[prop] = `default_${prop}`;
                return requiredKeys[prop];
            }
            return Reflect.get(...arguments);
        }
    };

    let success = false;
    let attempts = 0;
    const maxAttempts = 10; // Limit the number of retry attempts to avoid infinite loops

    while (!success && attempts < maxAttempts) {
        try {
            attempts++;
            // Attempt to construct the class using the Proxy
            rawInstance = Reflect.construct(fn, [new Proxy(requiredKeys, proxyHandler)]);
            instance = Object.getPrototypeOf(rawInstance);
            success = true; // If the class is constructed successfully, break the loop
        } catch (err) {
            // Parse the error to get missing key information
            const missingKey = extractMissingKey(err);
            if (missingKey) {
                requiredKeys[missingKey] = `default_${missingKey}`;
                //console.log(`Identified required key: ${missingKey}, retrying...`);
            } else {
                //console.error(`Error constructing ${funcName}:`, err);
                return null;
            }
        }
    }

    if (!success) {
        //console.error(`Failed to construct ${funcName} after ${maxAttempts} attempts.`);
        return null;
    }

    // Now that the class is successfully constructed, proceed with method analysis
    const methodNames = Object.getOwnPropertyNames(instance).filter(
        name => typeof instance[name] === 'function' && name !== 'constructor'
    );

    // Invoke each method with the input case
    //methodNames.forEach(methodName => {
    const args = parseSig(inputCase);
    for (method in instance) {
        if (typeof instance[method] === 'function' && method !== 'constructor') {
            try {
                let emptyObj = {};
                clonedChain = copyPrototypeChain(emptyObj);

                // Invoke the method with the provided input case
                const result = Reflect.apply(rawInstance[method], rawInstance, args);

                // Capture the active prototype chain after method invocation
                activeChain = Object.getPrototypeOf(emptyObj);

                // Check if prototype pollution or any issues are detected
                if (verify()) {
                    return `${funcName} (${inputCase})`;
                }
            } catch (e) {
                //console.error(`Error invoking method ${method} of ${funcName}:`, err);
                fs.appendFileSync(`logs/run_jbx_${pkgLogName}-classFuzzy-${process.pid}.log`, e.message, { encoding: 'utf8' })

            }
        }
    };

    return null;
} */

// Utility function to extract the missing key name from the error message
function extractMissingKey(error) {
  try {
    const missingKeyPattern = /missing required key: (\w+)/;
    const match = error.message.match(missingKeyPattern);
    return match ? match[1] : null;
  } catch (error) {}
}

function fixFuzzy(inputCase, fn) {
  // Attempt #1: Fixed Fuzzy - Arteau's work
  victim = {};
  try {
    // First round: check property addition
    if (!quiet) {
      inputCase.call(null, fn);
      //const trace = new Error();
      //console.log(trace.stack);
    } else vmRun(inputCase, fn);
    //const result = inputCase.call(null, fn);
    if (pollutionFinder(victim, "pollutedKey")) {
      Reflect.deleteProperty(Object.prototype, "pollutedKey");
      return true;
    }
    // Second round: check property Deletion
    victim = {};
    if (!quiet) {
      victim.__proto__.pollutedKey = "PP";
      inputCase.call(null, fn);
    } else vmRun(inputCase, fn, "del");
    if (!Reflect.has(victim, "pollutedKey")) return true;
    else Reflect.deleteProperty(Object.prototype, "pollutedKey");
    return false;
  } catch (e) {
    console.log(e);
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-fixFuzzy-${process.pid}.log`, e.message, { encoding: "utf8" });
  }
}

function vmRun(inputCase, fn, action = "add", timeout = 100) {
  // Create a sandbox context for executing the function
  const sandbox = {
    fn, // the function to test
    inputCase, // the input cases
    console: console, // to enable logging inside the sandbox
    result: {},
  };
  let context, code, script;
  try {
    // Create a new VM context
    context = vm.createContext(sandbox);
    if (action === "del") context.__proto__.pollutedKey = "PP";

    // Function to execute the test function in the sandbox
    code = `result.output = inputCase.call(null, fn);`;
    // const code = `const result = Reflect.apply(fn, null, inputCase);`;

    // Create and run the script with a timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout }); // This enforces the timeout
    /*         if (victim.pollutedKey && action !== 'del')
                    return victim.pollutedKey; */
    // The result is handled within the sandbox context
  } catch (e) {
    // Handle timeout or any other error
    //console.log("error while running code in a vm context: ", e);
    //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-vmRun${process.pid}.log`, e.message, { encoding: "utf8" });
  }
  return sandbox.result.output; // Return the result from the sandbox context
}
/**
 * Function to run a provided function in a VM context with given inputs.
 * @param {Function} inputCase - Function that takes the tested function as argument and returns a result.
 * @param {Function} fn - The function to test.
 * @param {number} [timeout=1000] - Timeout value for script execution in milliseconds.
 * @returns {Object} - Returns an object containing `result` or `error` message.
 */
function vmRun2(inputCase, fn, timeout = 100) {
  // Create a sandboxed context with limited access to global objects
  let sandbox = {
    fn, // the function to test
    inputCase, // the input case to run against
    result: null, // Store the result of the test function
    error: null, // Store any error encountered during execution
  };
  let context, code, script;
  try {
    // Create a new context for isolated execution
    context = vm.createContext(sandbox);

    // Code to be run within the VM context
    code = `result = inputCase.call(null, fn);`;

    // Create and run the script with a specified timeout
    script = new vm.Script(code);
    script.runInContext(context, { timeout });
  } catch (err) {
    // Capture any runtime error or timeout exceptions
    sandbox.error = err.message;
  }

  // Return the sandbox result or error message
  return {
    result: sandbox.result,
    error: sandbox.error,
  };
}

function dynFuzzy(fn) {
  // Attempt #2: Dynamic Fuzzy - our stat-of-the-art
  try {
    // Reinitialize to avoid issue if the previous function changed attributes.
    emptyObj = {};
    //clonedChain = copyPrototypeChain(emptyObj);
    const parameters = inferParams(fn.toString());
    //totest.apply(null, JSON.parse("[" + parameters + "]"));
    //callModule(fn, parameters);
    fn.apply(null, JSON.parse("[" + parameters + "]"));
    //activeChain = Object.getPrototypeOf(emptyObj);

    var victim = {};
    if (
      Reflect.has(victim, "pollutedKey") ||
      Reflect.has(victim, "pollutedKey1") ||
      Reflect.has(victim, "pollutedKey2")
    ) {
      Reflect.deleteProperty(Object.prototype, "pollutedKey");
      Reflect.deleteProperty(Object.prototype, "pollutedKey1");
      Reflect.deleteProperty(Object.prototype, "pollutedKey2");
      return parameters;
    }
  } catch (e) {
    // console.log(`logs/run_jbx_${pkgLogName}-${process.pid}.log: `, e.message)
    // fs.appendFileSync(`logs/run_jbx_${pkgLogName}-${process.pid}.log`, e.message, { encoding: 'utf8' })
  }
  return null;
}

/**
 * Searches for a property in the prototype chain of an object.
 * @param {Object} obj - The object to start searching from.
 * @param {string} property - The name of the property to search for.
 * @returns {boolean} - Returns true if the property is found, otherwise false.
 */
function pollutionFinder(obj, property) {
  // Base case: If the object is null, the property does not exist in the chain
  try {
    if (obj === null) return false;

    // Check if the property is directly on the current object
    if (obj.hasOwnProperty(property)) {
      return true;
    }

    // Check if the property is nested within any of the object's own properties
    for (let key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === "object" && obj[key] !== null) {
        // Recursively search within nested objects
        if (pollutionFinder(obj[key], property)) {
          return true;
        }
      }
    }

    // If not found, recursively search the prototype chain
    return pollutionFinder(Object.getPrototypeOf(obj), property);
  } catch (error) {}
  return null;
}

/**
 * Function to dynamically load an NPM package and find the original file path for a target function.
 * @param {string} packageName - The name of the NPM package to search.
 * @param {Function} targetFunction - The target function whose file path we want to identify.
 * @returns {string|null} - The file path containing the original target function, or null if not found.
 */
function findFunctionPath(rootModule, targetFunction) {
  try {
    // Import the package using its name
    //const rootModule = require(packageName);

    // Resolve the entry file path of the package (e.g., index.js)
    const rootModulePath = require.resolve(pkgName);

    // Traverse the module's exports hierarchy to find the target function's origin
    const filePath = traverseModule(rootModule, targetFunction, rootModulePath, new Set());

    return filePath.replace("/sandbox/df/", ""); // Return the file path if found
  } catch (error) {
    //console.error(`Error loading package ${pkgName}:`, error);
    return null;
  }
}

/**
 * Traverses a module and its nested exports to find the original file path for a given function.
 * @param {Object} moduleExports - The exports of the root module.
 * @param {Function} targetFunction - The function to search for.
 * @param {string} currentPath - The current module file path being traversed.
 * @param {Set} visited - A set to track visited exports and prevent cyclic references.
 * @returns {string|null} - The file path containing the original function, or null if not found.
 */
function traverseModule(moduleExports, targetFunction, currentPath, visited) {
  // If moduleExports itself is the target function, return the current path
  try {
    if (moduleExports === targetFunction) {
      return currentPath;
    }

    // Check if the moduleExports has been visited to prevent infinite loops
    if (visited.has(moduleExports)) {
      return null; // Avoid traversing the same export again
    }

    // Mark the current export as visited
    visited.add(moduleExports);

    // If moduleExports is an object, traverse through its properties

    if (typeof moduleExports === "object" && moduleExports !== null) {
      for (const key in moduleExports) {
        if (moduleExports.hasOwnProperty(key)) {
          const nextExport = moduleExports[key];

          // Check if the nested export is a function and matches the target
          if (nextExport === targetFunction) {
            // Check if the function is a re-export from another module
            const originalPath = traceFunctionOrigin(nextExport, currentPath);
            if (originalPath) {
              return originalPath; // Return the original path if found
            }
            return currentPath; // Return the current path if no deeper trace is needed
          }

          // If the nested export is another module or object, resolve its path and continue searching
          const nextPath = getModuleFilePath(nextExport, currentPath);

          // Recursively traverse the next module export to find the original target function
          const result = traverseModule(nextExport, targetFunction, nextPath, visited);
          if (result) return result; // Return the path if found
        }
      }
    }
  } catch (error) {}
  return null; // Return null if the function is not found in this module
}

/**
 * Helper function to trace the origin of a function if it is re-exported from another module.
 * @param {Function} targetFunction - The function to trace back.
 * @param {string} currentPath - The current file path of the module exporting the function.
 * @returns {string|null} - The file path of the original module defining the function, or null if not found.
 */
function traceFunctionOrigin(targetFunction, currentPath) {
  // Check if the function is in the require cache
  try {
    for (const moduleId in requireCache) {
      if (requireCache[moduleId].exports === targetFunction) {
        return requireCache[moduleId].filename; // Return the file path of the original module
      }
    }
  } catch (error) {}
  // If the function is not found in the cache, return the current path
  return null;
}

/**
 * Helper function to get the file path of a nested module export.
 * @param {Object|Function} nestedExport - The nested export module or function.
 * @param {string} parentPath - The parent module's file path.
 * @returns {string} - The resolved file path of the nested module or the parent path.
 */
function getModuleFilePath(nestedExport, parentPath) {
  // Check if the nested export is in the require cache
  try {
    for (const moduleId in requireCache) {
      if (requireCache[moduleId].exports === nestedExport) {
        return requireCache[moduleId].filename; // Return the cached file path
      }
    }
    // If not found in cache, return the parent path as the fallback
    return parentPath;
  } catch (error) {}
  return null;
}

async function importModule(moduleName) {
  try {
    return await import(moduleName);
  } catch (e) {
    if (!quiet) console.log("Trying files import..");
    try {
      // Get the path to the module's directory
      const modulePath = require.resolve(moduleName);
      const index = path.basename(modulePath);
      const moduleDir = path.dirname(modulePath);

      // Read the directory to get the list of method files
      const methodFiles = fs.readdirSync(moduleDir);

      // Import each method file individually
      let importedModule = {};
      for (const file of methodFiles) {
        if (file.endsWith(".js") && file !== index) {
          const methodName = path.basename(file, ".js");
          const methodFilePath = path.join(moduleDir, file);
          importedModule[methodName] = require(methodFilePath);
        }
      }
      if (Object.keys(importedModule).length == 0) {
        importedModule = await import(moduleName);
      }
      return importedModule;
    } catch (e) {
      if (!quiet) console.log("Error importing module: ", e.message);
      //fs.appendFileSync(`logs/run_jbx_${pkgLogName}-${process.pid}.log`, e.message, { encoding: "utf8" });
    }
  }
}

function sinkLineFinder(funcName, funcCode, offset) {
  let funcPath,
    semgrepResult,
    jsonResult,
    usefulInfo = [{ vulnVar: null, line: null }];
  //var outputFile = `tempOutput-${process.pid}-${random}.json`;
  try {
    funcPath = path.join(__dirname, "tmp", `tempFunc-${process.pid}`);
    fs.mkdirSync(funcPath, { recursive: true });
    fs.writeFileSync(path.join(funcPath, `${funcName.replace("/", "-")}.js`), funcCode.toString());
    semgrepResult = exec.spawnSync(
      "semgrep",
      [`--config=${PROTORULES}`, funcPath, "--json", "-q", "--jobs=10", "--error"],
      { stdio: "pipe", encoding: "utf-8" }
    );

    jsonResult = semgrepResult.stdout != "" ? JSON.parse(semgrepResult.stdout) : null;
    //fs.rmSync(funcPath, { recursive: true, force: true }); // removes thr symlink from the filesystem unlinkSync(path)
    if (jsonResult !== null && jsonResult.results.length > 0) {
      usefulInfo = jsonResult.results.map((el) => {
        return {
          var: el.extra.metavars["$KEY"].abstract_content,
          line: el.extra.metavars["$KEY"].end.line + offset,
        };
      });
    }
    return usefulInfo;
  } catch (error) {
    if (!quiet) console.error("Error running Semgrep:", error.message);
  } finally {
    // Clean up the temporary rule file
    if (fs.existsSync(funcPath)) {
      fs.rmdirSync(funcPath, { recursive: true });
    }
  }
}

/**
 * Locates the offset of a given function in a JavaScript file using Semgrep.
 * @param {Function} funcCode - The function code to locate.
 * @param {string} filePath - The path to the JavaScript file to analyze.
 * @returns {object|null} - The offset location of the function in the file (start and end positions), or null if not found.
 */
function getFunctionOffset(funcCode, filePath) {
  let semgrepOutput, results, tempRuleFile;
  try {
    // Step 1: Extract the function header from the provided function code
    const functionHeader = funcCode.toString().match(/^(.*?)\s*[{]?\s*$/m)[1];
    if (!functionHeader) {
      //console.error("Failed to extract function header from the provided code.");
      return null;
    }

    // console.log(`Extracted function header: ${functionHeader}`);

    // Step 2: Generate a Semgrep rule for the extracted function header
    const semgrepRule = `
    rules:
        - id: "function-location"
          pattern: "${functionHeader}{...}"
          languages: [javascript]
          message: "Matched function header"
          severity: INFO
          metadata:
            category: "function-offset-locator"
        `;

    // Step 3: Run Semgrep on the specified JavaScript file
    // Write the Semgrep rule to a temporary YAML file
    tempRuleFile = path.join(__dirname, "temp-rule.yaml");
    fs.writeFileSync(tempRuleFile, semgrepRule, "utf8");
  } catch (error) {}
  // Run Semgrep with the generated rule on the target file
  try {
    semgrepOutput = exec.spawnSync(
      "semgrep",
      [`--config=${tempRuleFile}`, filePath, "--json", "-q", "--jobs=10", "--error"],
      { stdio: "pipe", encoding: "utf-8" }
    );
    results = semgrepOutput.stdout != "" ? JSON.parse(semgrepOutput.stdout) : null;
    // Extract the location information from the Semgrep output
    if (results && results.results && results.results.length > 0) {
      return results.results[0].start["line"] - 1;
    }
    // Step 4: Return the location of the matched function
    //return location.start['line'];
  } catch (error) {
    //console.error("Error running Semgrep:", error.message);
  } finally {
    // Clean up the temporary rule file
    if (fs.existsSync(tempRuleFile)) {
      fs.unlinkSync(tempRuleFile);
    }
  }
}

async function importModule2(moduleName) {
  try {
    return require(moduleName);
  } catch (e) {
    console.log("Trying dynamic import..");
    try {
      return await import(moduleName);
    } catch (e) {
      console.log("Trying files import..");
      try {
        // Get the path to the module's directory
        const modulePath = require.resolve(moduleName);
        const index = path.basename(modulePath);
        const moduleDir = path.dirname(modulePath);

        // Read the directory to get the list of method files
        const methodFiles = fs.readdirSync(moduleDir);

        // Import each method file individually
        let importedModule = {};
        for (const file of methodFiles) {
          if (file.endsWith(".js") && file !== index) {
            const methodName = path.basename(file, ".js");
            const methodFilePath = path.join(moduleDir, file);
            importedModule[methodName] = require(methodFilePath);
          }
        }
        if (Object.keys(importedModule).length == 0) {
          importedModule = await import(moduleName);
        }
        return importedModule;
      } catch (err) {
        console.log("Error importing module");
      }
    }
  }
}
