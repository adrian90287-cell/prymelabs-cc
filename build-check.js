const { build } = require('vite')
build({ logLevel: 'info' }).then(() => {
  console.log('BUILD SUCCESS')
  process.exit(0)
}).catch(e => {
  console.error('BUILD FAILED:', e.message)
  if (e.frame) console.error(e.frame)
  if (e.loc) console.error('at', e.loc.file, e.loc.line, e.loc.column)
  process.exit(1)
})
