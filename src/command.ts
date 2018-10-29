import { Package } from "./package"

const root = process.argv[2] || "."
const pkg = new Package(root)
const mod = pkg.mainModuleEntry

if (mod) {
  const { sourceFilePath, referencedEntries } = mod
  console.log(`Main module: ${sourceFilePath}`)
  console.log(referencedEntries.map(entry => [entry.title, entry.referencedEntries.map(e => e.title)]))
} else {
  console.log("Main module not found")
}
