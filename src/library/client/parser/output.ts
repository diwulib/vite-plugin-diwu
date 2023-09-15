import type {
  BaseType,
  Context,
  NodeParser,
  SubNodeParser,
} from 'ts-json-schema-generator';
import {NeverType} from 'ts-json-schema-generator';
import * as ts from 'typescript';

export class OutputParser implements SubNodeParser {
  constructor(protected childNodeParser: NodeParser) {}

  supportsNode(node: ts.Node): boolean {
    // MethodSignature .parameters
    return (
      (node.kind === ts.SyntaxKind.FunctionType ||
        node.kind === ts.SyntaxKind.TypeLiteral) &&
      node.parent.kind === ts.SyntaxKind.PropertySignature &&
      node.parent?.parent.kind === ts.SyntaxKind.InterfaceDeclaration &&
      (node.parent?.parent as ts.InterfaceDeclaration).name.escapedText
        .toString()
        .endsWith('Props') &&
      ((node.parent as ts.PropertySignature).name as ts.PrivateIdentifier)
        ?.escapedText === 'output'
    );
  }

  createType(
    node: ts.FunctionTypeNode | ts.TypeLiteralNode,
    context: Context,
  ): BaseType {
    const propsName = (
      node.parent?.parent as ts.InterfaceDeclaration
    ).name.escapedText.toString();

    let outputParameters: ts.NodeArray<ts.ParameterDeclaration> | undefined;

    // {
    //   output: (data: any) => void;
    // }
    if (node.kind === ts.SyntaxKind.FunctionType) {
      outputParameters = node.parameters;
    }

    // {
    //   output: {
    //     (data: any): void;
    //   };
    // };
    if (node.kind === ts.SyntaxKind.TypeLiteral) {
      const callSignatures = node.members.filter(
        item => item.kind === ts.SyntaxKind.CallSignature,
      );

      if (!callSignatures.length) {
        console.warn(`\`${propsName}\` output cannot be called`);
        return new NeverType();
      }

      if (callSignatures.length > 1) {
        console.warn(
          `\`${propsName}\` output call signature should be only one`,
        );
      }

      outputParameters = (callSignatures[0] as ts.CallSignatureDeclaration)
        .parameters;
    }

    if (!outputParameters || outputParameters.length === 0) {
      console.warn(`\`${propsName}\` output parameters cannot be empty`);
      return new NeverType();
    }

    if (outputParameters.length > 1) {
      console.warn(
        `\`${propsName}\` output parameters length should be only one`,
      );
    }

    const [outputParameter] = outputParameters;

    return this.childNodeParser.createType(outputParameter.type!, context);
  }
}
