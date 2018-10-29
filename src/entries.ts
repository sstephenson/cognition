import * as ast from "ts-simple-ast"
const { TypeGuards } = ast

interface Entry {
  readonly name: string
  readonly title: string
  readonly referencedEntries: Entry[]
}

export class ModuleEntry implements Entry {
  readonly root: string
  readonly sourceFile: ast.SourceFile

  constructor(root: string, sourceFile: ast.SourceFile) {
    this.root = root
    this.sourceFile = sourceFile
  }

  get name() {
    return this.sourceFilePath.slice(this.root.length)
  }

  get title() {
    return `module ${this.name}`
  }

  get referencedEntries(): Entry[] {
    return this.exportedDeclarations.reduce((entries, declaration) => {
      return entries.concat(entriesForStandaloneDeclaration(declaration))
    }, [] as Entry[])
  }

  get exportedDeclarations() {
    return this.sourceFile.getExportedDeclarations()
  }

  get sourceFilePath() {
    return this.sourceFile.getFilePath()
  }

  get outputFilePaths() {
    return this.outputFiles.map(outputFile => outputFile.getFilePath())
  }

  get outputFiles() {
    return this.sourceFile.getEmitOutput().getOutputFiles()
  }
}

function entriesForStandaloneDeclaration(node: ast.Node) {
  if (TypeGuards.isClassDeclaration(node)) {
    return [new ClassEntry(node)]
  } else if (TypeGuards.isFunctionDeclaration(node)) {
    return [new FunctionEntry(node)]
  } else if (TypeGuards.isVariableDeclaration(node)) {
    return [new ConstantEntry(node)]
  } else if (TypeGuards.isInterfaceDeclaration(node)) {
    return [new InterfaceEntry(node)]
  } else if (TypeGuards.isTypeAliasDeclaration(node)) {
    return [new TypeEntry(node)]
  } else {
    return []
  }
}

type PossiblyNamedNode = ast.Node & { getName(): string | undefined }

class NodeEntry<T extends PossiblyNamedNode> implements Entry {
  readonly node: T

  constructor(node: T) {
    this.node = node
  }

  get name() {
    return this.node.getName() || "<anonymous>"
  }

  get title() {
    return this.name
  }

  get referencedEntries() {
    return this.ownedNodes.reduce((entries, node) => {
      return entries.concat(this.entriesForOwnedNode(node))
    }, [] as Entry[])
  }

  entriesForOwnedNode(node: ast.Node): Entry[] {
    if (TypeGuards.isMethodDeclaration(node) || TypeGuards.isMethodSignature(node)) {
      return [new MethodEntry(this, node)]
    } else if (TypeGuards.isGetAccessorDeclaration(node)) {
      return [new GetterEntry(this, node)]
    } else if (TypeGuards.isSetAccessorDeclaration(node)) {
      return [new SetterEntry(this, node)]
    } else if ((TypeGuards.isPropertyDeclaration(node) || TypeGuards.isPropertySignature(node)) && node.isReadonly()) {
      return [new GetterEntry(this, node)]
    } else if (TypeGuards.isPropertyDeclaration(node) || TypeGuards.isPropertySignature(node)) {
      return [new GetterEntry(this, node), new SetterEntry(this, node)]
    } else {
      return []
    }
  }

  get ownedNodes(): ast.Node[] {
    return []
  }

  get body() {
    return this.node.getChildSyntaxList() || this.node
  }
}

export class FunctionEntry extends NodeEntry<ast.FunctionDeclaration> {
  get title() {
    return `function ${this.name}(${this.parameters.join(", ")})`
  }

  get parameters() {
    return parameterListForNode(this.node)
  }
}

export class ConstantEntry extends NodeEntry<ast.VariableDeclaration> {
  get title() {
    return `const ${this.name}`
  }
}

export class ClassEntry extends NodeEntry<ast.ClassDeclaration> {
  get title() {
    return `class ${this.name}`
  }

  get ownedNodes() {
    return [
      ...this.body.getChildrenOfKind(ast.SyntaxKind.MethodDeclaration),
      ...this.body.getChildrenOfKind(ast.SyntaxKind.PropertyDeclaration),
      ...this.body.getChildrenOfKind(ast.SyntaxKind.GetAccessor),
      ...this.body.getChildrenOfKind(ast.SyntaxKind.SetAccessor)
    ]
  }
}

type NamedNode =  ast.Node & { getName(): string }

class NamedNodeEntry<T extends NamedNode> extends NodeEntry<T> {
  get name() {
    return this.node.getName()
  }
}

export class InterfaceEntry extends NamedNodeEntry<ast.InterfaceDeclaration> {
  get title() {
    return `interface ${this.name}`
  }

  get ownedNodes() {
    return [
      ...this.body.getChildrenOfKind(ast.SyntaxKind.MethodSignature),
      ...this.body.getChildrenOfKind(ast.SyntaxKind.PropertySignature)
    ]
  }
}

export class TypeEntry extends NamedNodeEntry<ast.TypeAliasDeclaration> {
  get title() {
    return `type ${this.name}`
  }
}

abstract class OwnedEntry<T extends NamedNode> extends NamedNodeEntry<T> {
  readonly owner: Entry

  constructor(owner: Entry, node: T) {
    super(node)
    this.owner = owner
  }

  get title() {
    return [this.owner.name, this.callSyntax].join(this.joiner)
  }

  abstract readonly callSyntax: string

  get joiner() {
    return this.isStatic ? "." : "#"
  }

  get isStatic() {
    const node = this.node as ast.Node & { isStatic?(): boolean }
    return typeof node.isStatic == "function" ? node.isStatic() : false
  }
}

type MethodNode = ast.MethodDeclaration | ast.MethodSignature

export class MethodEntry extends OwnedEntry<MethodNode> {
  get callSyntax() {
    return `${this.name}(${this.parameters.join(", ")})`
  }

  get parameters() {
    return parameterListForNode(this.node)
  }
}

type GetterNode = ast.PropertyDeclaration | ast.PropertySignature | ast.GetAccessorDeclaration

export class GetterEntry extends OwnedEntry<GetterNode> {
  get callSyntax() {
    return this.name
  }
}

type SetterNode = ast.PropertyDeclaration | ast.PropertySignature | ast.SetAccessorDeclaration

export class SetterEntry extends OwnedEntry<SetterNode> {
  get callSyntax() {
    return `${this.name}=`
  }
}

function parameterListForNode(node: ast.Node) {
  const list = parameterListNodeForNode(node)
  const parameterNodes = list.getChildrenOfKind(ast.SyntaxKind.Parameter)
  return parameterNodes.map(formatParameterDeclaration)
}

function parameterListNodeForNode(node: ast.Node) {
  return node.getChildrenOfKind(ast.SyntaxKind.SyntaxList).find(list => {
    return list.getChildrenOfKind(ast.SyntaxKind.Parameter).length > 0
  }) || node
}

function formatParameterDeclaration(node: ast.ParameterDeclaration) {
  const rest = node.isRestParameter() ? "..." : ""
  const name = `${rest}${node.getName()}`
  const optional = node.isOptional() && !rest
  return (node.hasInitializer() || optional) ? `${name}?` : name
}
