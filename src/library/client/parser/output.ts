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
    return (
      node.kind === ts.SyntaxKind.MethodSignature ||
      (node.kind === ts.SyntaxKind.PropertySignature &&
        ((node as ts.PropertySignature).type?.kind ===
          ts.SyntaxKind.FunctionType ||
          (node as ts.PropertySignature).type?.kind ===
            ts.SyntaxKind.TypeLiteral))
    );
  }

  createType(
    node: ts.MethodSignature | ts.PropertySignature,
    context: Context,
  ): BaseType {
    const propsName = (
      node.parent as ts.InterfaceDeclaration
    )?.name.escapedText.toString();

    let outputParameters: ts.NodeArray<ts.ParameterDeclaration> | undefined;

    // {
    //   output(data: any): void;
    // }
    if (node.kind === ts.SyntaxKind.MethodSignature) {
      outputParameters = node.parameters;
    } else {
      // {
      //   output: (data: any) => void;
      // }
      if (node.type?.kind === ts.SyntaxKind.FunctionType) {
        outputParameters = (node.type as ts.FunctionTypeNode).parameters;
      }

      // {
      //   output: {
      //     (data: any): void;
      //   };
      // };
      if (node.type?.kind === ts.SyntaxKind.TypeLiteral) {
        const callSignatures = (node.type as ts.TypeLiteralNode).members.filter(
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
    }

    const [outputParameter] = outputParameters;

    return this.childNodeParser.createType(outputParameter.type!, context);
  }
}
