const os = require('os')
const path = require('path')

function expandTilde(str) {
  // https://github.com/nodejs/node/issues/684 is still unresolved so we perform
  // our own tilde expansion to get the full file path
  let pathParts = str.split(path.sep)
  if (pathParts[0] === '~') {
    pathParts[0] = os.homedir()
  }
  return path.join(...pathParts)
}

module.exports = expandTilde