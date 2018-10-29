import { ModuleEntry } from "./entries"
import fs from "fs"
import path from "path"
import { Project } from "ts-simple-ast"

export class Package {
  readonly root: string
  readonly project: Project

  constructor(root: string) {
    this.root = path.resolve(root)
    this.project = new Project({
      tsConfigFilePath: this.tsConfigFilePath
    })
  }

  get mainModuleEntry() {
    const { mainFilePath } = this
    return this.moduleEntries.find(moduleEntry => {
      return moduleEntry.outputFilePaths.includes(mainFilePath)
    })
  }

  get moduleEntries(): ModuleEntry[] {
    return this.sourceFiles.map(sourceFile => new ModuleEntry(this.root, sourceFile))
  }

  get sourceFiles() {
    return this.project.getSourceFiles()
  }

  get mainFilePath() {
    return path.join(this.root, this.package.main)
  }

  get package() {
    return JSON.parse(this.packageFileSource)
  }

  get packageFileSource() {
    return fs.readFileSync(this.packageFilePath, "UTF-8")
  }

  get packageFilePath() {
    return path.join(this.root, "package.json")
  }

  get tsConfigFilePath() {
    return path.join(this.root, "tsconfig.json")
  }
}
