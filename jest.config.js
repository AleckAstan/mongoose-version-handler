/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
  transformIgnorePatterns: [
    'node_modules/(?!just-diff-apply|just-diff)', // Allow specific modules to be transformed
  ],
};
