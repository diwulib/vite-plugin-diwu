import type {
  Context,
  MutableParser,
  NodeParser,
  SubNodeParser,
} from 'ts-json-schema-generator';
import {
  AnnotatedNodeParser,
  CircularReferenceNodeParser,
  ExposeNodeParser,
  ExtendedAnnotationsReader,
  InterfaceAndClassNodeParser,
  NeverType,
  ObjectProperty,
  isNodeHidden,
  isPublic,
  isStatic,
} from 'ts-json-schema-generator';
import * as ts from 'typescript';

import {OutputParser} from './output';

export class PropsParse extends InterfaceAndClassNodeParser {
  outputParser: OutputParser;

  constructor(typeChecker: ts.TypeChecker, childNodeParser: NodeParser) {
    super(typeChecker, childNodeParser, false);
    this.outputParser = new OutputParser(childNodeParser);
  }

  // fork super.getProperties
  override getProperties(
    node: ts.InterfaceDeclaration | ts.ClassDeclaration,
    context: Context,
  ): ObjectProperty[] | undefined {
    let hasRequiredNever = false;

    const properties = (
      node.members as ts.NodeArray<ts.TypeElement | ts.ClassElement>
    )
      .reduce<
        (
          | ts.PropertyDeclaration
          | ts.PropertySignature
          | ts.ParameterPropertyDeclaration
        )[]
      >((members, member) => {
        if (ts.isConstructorDeclaration(member)) {
          const params = member.parameters.filter(param =>
            ts.isParameterPropertyDeclaration(param, param.parent),
          ) as ts.ParameterPropertyDeclaration[];
          members.push(...params);
        } else if (
          ts.isPropertySignature(member) ||
          ts.isPropertyDeclaration(member)
        ) {
          members.push(member);
        }

        return members;
      }, [])
      .filter(
        member =>
          isPublic(member) && !isStatic(member) && !isNodeHidden(member),
      )
      .reduce<
        {
          member:
            | ts.PropertyDeclaration
            | ts.PropertySignature
            | ts.ParameterPropertyDeclaration;
          memberType: ts.Node;
        }[]
      >((entries, member) => {
        let memberType: ts.Node | undefined = member.type;

        // Use the type checker if the member has no explicit type
        // Ignore members without an initializer. They have no useful type.
        if (
          memberType === undefined &&
          (member as ts.PropertyDeclaration)?.initializer !== undefined
        ) {
          const type = this.typeChecker.getTypeAtLocation(member);
          memberType = this.typeChecker.typeToTypeNode(
            type,
            node,
            ts.NodeBuilderFlags.NoTruncation,
          );
        }

        if (memberType !== undefined) {
          return [...entries, {member, memberType}];
        }

        return entries;
      }, [])
      .map(
        ({member, memberType}) =>
          new ObjectProperty(
            this.getPropertyName(member.name),
            this.childNodeParser.createType(memberType, context),
            !member.questionToken,
          ),
      )
      .filter(prop => {
        if (prop.isRequired() && prop.getType() instanceof NeverType) {
          hasRequiredNever = true;
        }

        return !(prop.getType() instanceof NeverType);
      });

    if (hasRequiredNever) {
      return undefined;
    }

    // diwu inject logic

    const output = (
      node.members as ts.NodeArray<ts.TypeElement | ts.ClassElement>
    ).find(node => (node.name as ts.Identifier)?.escapedText === 'output') as
      | ts.PropertySignature
      | ts.MethodSignature
      | undefined;

    if (output && this.outputParser.supportsNode(output)) {
      properties.push(
        new ObjectProperty(
          this.getPropertyName(output.name),
          this.outputParser.createType(output, context),
          !output.questionToken,
        ),
      );
    }

    return properties;
  }
}

export function createPropsParse(
  program: ts.Program,
  chainNodeParser: MutableParser,
): SubNodeParser {
  const typeChecker = program.getTypeChecker();

  function withJsDoc(nodeParser: SubNodeParser): SubNodeParser {
    return new AnnotatedNodeParser(
      nodeParser,
      new ExtendedAnnotationsReader(typeChecker, new Set()),
    );
  }

  return new CircularReferenceNodeParser(
    new ExposeNodeParser(
      typeChecker,
      withJsDoc(
        new PropsParse(
          typeChecker,
          withJsDoc(chainNodeParser as unknown as SubNodeParser),
        ),
      ),
      'export',
      'extended',
    ),
  );
}
